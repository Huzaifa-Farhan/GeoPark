"""Coordination service: the only thing drivers talk to.

It keeps a (possibly lagging) copy of every lot's availability, ranks lots for a search and relays
reservation requests. It never decides whether a space is available - the owning lot does.
"""
import os
import threading
import time
import uuid

import requests
from flask import Flask, g, jsonify, request

from lot_service.pricing import compute_price, demand_level, occupancy_factor, time_factor
from shared import security

from .auth import (DEFAULT_TOKEN_TTL, DEV_ADMIN_PASSWORD, DEV_ADMIN_USER, Auth, UserStore, owner_tag,
                   public_user, validate_credentials)
from .ranking import PRIORITIES, rank_lots
from .state import Registry

FORWARD_TIMEOUT = float(os.environ.get("FORWARD_TIMEOUT", 3.0))
FORWARD_RETRIES = int(os.environ.get("FORWARD_RETRIES", 3))


def call_lot(url, method, path, payload=None, timeout=FORWARD_TIMEOUT, retries=1, service_key=None):
    """Call a lot. Retries only on network errors (the lot de-duplicates by request_id).

    Returns (status_code, json_body, error_string_or_None).
    """
    last_err = None
    for _ in range(max(1, retries)):
        try:
            r = requests.request(method, f"{url}{path}", json=payload, timeout=timeout,
                                 headers={security.HEADER: service_key or security.service_key()})
            try:
                body = r.json()
            except ValueError:
                body = {}
            return r.status_code, body, None
        except requests.RequestException as exc:
            last_err = f"{type(exc).__name__}"
    return None, None, last_err


def create_app(stale_after: float = None, db_path: str = None, service_key: str = None,
               admin_password: str = None, token_ttl: float = None) -> Flask:
    app = Flask("geopark-coordinator")
    reg = Registry(stale_after if stale_after is not None else float(os.environ.get("STALE_AFTER", 6.0)))
    app.config["REGISTRY"] = reg

    # ---- security setup ---------------------------------------------------------------------------
    service_key = service_key or security.service_key()
    store = UserStore(db_path or os.environ.get("COORD_DB") or os.path.join("data", "coordinator.db"))
    admin_user = os.environ.get("GEOPARK_ADMIN_USER") or DEV_ADMIN_USER
    admin_password = admin_password or os.environ.get("GEOPARK_ADMIN_PASSWORD") or DEV_ADMIN_PASSWORD
    store.ensure_admin(admin_user, admin_password)
    auth = Auth(store, token_ttl or float(os.environ.get("TOKEN_TTL", DEFAULT_TOKEN_TTL)))
    app.config["AUTH"] = auth
    if security.using_dev_key(service_key):
        reg.log("Using the development service key - set GEOPARK_SERVICE_KEY outside of demos", "warning")
    if admin_password == DEV_ADMIN_PASSWORD:
        reg.log("Using the default admin password - set GEOPARK_ADMIN_PASSWORD outside of demos", "warning")

    def lot_call(url, method, path, payload=None, **kw):
        return call_lot(url, method, path, payload, service_key=service_key, **kw)

    # ---- CORS so the React dev server can call us ---------------------------------------------
    @app.after_request
    def cors(resp):
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
        return resp

    @app.route("/api/<path:_p>", methods=["OPTIONS"])
    def preflight(_p):
        return ("", 204)

    # ---- accounts -------------------------------------------------------------------------------
    @app.post("/api/auth/register")
    def register():
        body = request.get_json(silent=True) or {}
        username, password = body.get("username"), body.get("password")
        problem = validate_credentials(username, password)
        if problem:
            return jsonify(error=problem, reason="invalid"), 400
        user = store.create(username, password, role="driver")  # self-registration never grants admin
        if user is None:
            return jsonify(error="that username is already taken", reason="taken"), 409
        reg.log(f"New driver account registered: {user['username']}", "info")
        return jsonify(token=auth.issue_token(user), user=public_user(user), expires_in=auth.token_ttl), 201

    @app.post("/api/auth/login")
    def login():
        body = request.get_json(silent=True) or {}
        username, password = str(body.get("username") or ""), str(body.get("password") or "")
        wait = auth.throttle.retry_after(username)
        if wait > 0:
            return jsonify(error=f"too many failed attempts - try again in {wait:.0f}s",
                           reason="locked", retry_after=round(wait)), 429
        user = store.verify(username, password)
        if user is None:
            auth.throttle.failed(username)
            return jsonify(error="invalid username or password", reason="unauthenticated"), 401
        auth.throttle.succeeded(username)
        return jsonify(token=auth.issue_token(user), user=public_user(user), expires_in=auth.token_ttl)

    @app.get("/api/auth/me")
    @auth.required()
    def me():
        return jsonify(user=public_user(g.user))

    # ---- called by lots -----------------------------------------------------------------------
    @app.post("/internal/report")
    def report():
        if not security.key_matches(request.headers.get(security.HEADER), service_key):
            return jsonify(error="unknown service - missing or wrong service key"), 401
        body = request.get_json(silent=True)
        if not body or "lot" not in body or "snapshot" not in body:
            return jsonify(error="invalid report"), 400
        acked = reg.apply_report(body)
        return jsonify(ok=True, acked_seq=acked)

    # ---- driver-facing reads --------------------------------------------------------------------
    @app.get("/api/health")
    def health():
        return jsonify(ok=True, lots=len(reg.lots()), stale_after=reg.stale_after)

    @app.get("/api/lots")
    def lots():
        data = sorted(reg.lots(), key=lambda l: l["name"])
        return jsonify(lots=data, stale_after=reg.stale_after, server_time=time.time())

    @app.get("/api/lots/<lot_id>")
    def lot(lot_id):
        data = reg.get(lot_id)
        if data is None:
            return jsonify(error="unknown lot"), 404
        return jsonify(data)

    @app.get("/api/log")
    def log():
        return jsonify(log=reg.get_log(float(request.args.get("since", 0))))

    @app.get("/api/feed")
    def feed():
        """Recent sensor readings and reservation events, as received from the lots' outboxes."""
        try:
            limit = max(1, min(200, int(request.args.get("limit", 60))))
        except ValueError:
            limit = 60
        return jsonify(feed=reg.get_feed(limit))

    @app.get("/api/history")
    def history():
        """Occupancy / price samples per lot (about the last 6 minutes) for the trend charts."""
        return jsonify(history=reg.get_history())

    @app.get("/api/pricing")
    def pricing():
        """Explain each lot's current price and forecast it over the simulated day.

        Uses the same pure pricing functions as the lots, so the explanation matches what the lot
        will actually charge (the lot still confirms the final price on booking).
        """
        out = []
        for l in sorted(reg.lots(), key=lambda x: x["name"]):
            hour = l.get("sim_hour")
            if hour is None:
                h, m = (l.get("sim_time") or "0:0").split(":")
                hour = int(h) + int(m) / 60
            base, lo, hi = l["base_price"], l["min_price"], l["max_price"]
            forecast = [{"hour": h / 2, "demand": round(demand_level(h / 2), 3),
                         "price_now_occupancy": compute_price(base, l["occupancy"], h / 2, lo, hi),
                         "price_empty": compute_price(base, 0.0, h / 2, lo, hi),
                         "price_full": compute_price(base, 1.0, h / 2, lo, hi)} for h in range(48)]
            out.append({
                "id": l["id"], "name": l["name"], "price": l["price"], "base_price": base,
                "min_price": lo, "max_price": hi, "occupancy": l["occupancy"], "sim_hour": round(hour, 2),
                "demand": round(demand_level(hour), 3),
                "time_factor": round(time_factor(hour), 3),
                "occupancy_factor": round(occupancy_factor(l["occupancy"]), 3),
                "peak": demand_level(hour) >= 0.5,
                "clamped": ("max" if l["price"] >= hi else "min" if l["price"] <= lo else None),
                "forecast": forecast,
            })
        return jsonify(lots=out, peaks=[8.5, 17.5])

    def _origin_from(args):
        try:
            return float(args["lat"]), float(args["lng"])
        except (KeyError, TypeError, ValueError):
            return None

    @app.get("/api/recommend")
    def recommend():
        args = request.args
        priority = args.get("priority", "balanced")
        if priority not in PRIORITIES:
            return jsonify(error=f"priority must be one of {sorted(PRIORITIES)}"), 400
        try:
            hours = float(args.get("hours", 1))
        except ValueError:
            hours = 1.0
        preferred = args.get("preferred") or None
        results = rank_lots(reg.lots(), origin=_origin_from(args), priority=priority,
                            preferred=preferred, hours=hours)
        by_id = {r["id"]: r for r in results}
        pref = by_id.get(preferred) if preferred else None
        best = next((r for r in results if not r["full"]), None)
        preferred_full = bool(pref and pref["full"])
        if preferred_full and best:
            msg = (f"{pref['name']} is full. Best alternative: {best['name']}"
                   + (f" ({best['eta_min']:g} min away, " if best["eta_min"] is not None else " (")
                   + f"${best['price']:.2f}/h, {best['free']} free).")
        elif best:
            msg = f"Best option right now: {best['name']} (${best['price']:.2f}/h, {best['free']} free)."
        else:
            msg = "All known lots are full right now."
        return jsonify(results=results, preferred=preferred, preferred_full=preferred_full,
                       recommended=best["id"] if best else None, message=msg, priority=priority)

    def alternatives(exclude_lot, body, limit=3):
        origin = None
        try:
            origin = float(body["lat"]), float(body["lng"])
        except (KeyError, TypeError, ValueError):
            pass
        ranked = rank_lots(reg.lots(), origin=origin, priority=body.get("priority", "balanced"),
                           exclude=(exclude_lot,))
        return [r for r in ranked if not r["full"]][:limit]

    # ---- reservations (relayed to the owning lot) -------------------------------------------------
    @app.post("/api/reservations")
    @auth.required()
    def reserve():
        body = request.get_json(silent=True) or {}
        lot_id = body.get("lot_id")
        url = reg.url_of(lot_id) if lot_id else None
        if not url:
            return jsonify(error="unknown or missing lot_id"), 404
        user = g.user
        request_id = str(body.get("request_id") or uuid.uuid4())
        # The booking is always made as the logged-in user (any "driver" in the body is ignored), and the
        # request id is scoped to the user so nobody can replay another user's id to read their booking.
        payload = {"request_id": f"{owner_tag(user)}:{request_id}", "space_id": body.get("space_id"),
                   "driver": user["username"], "owner": owner_tag(user),
                   "start": body.get("start"), "end": body.get("end")}
        status, data, err = lot_call(url, "POST", "/reservations", payload, retries=FORWARD_RETRIES)
        name = reg.name_of(lot_id)

        if err is not None or status == 503:
            reg.log(f"Reservation for '{name}' failed - lot unreachable; suggesting alternatives", "warning")
            return jsonify(error=f"{name} is unreachable right now, so the reservation could not be confirmed.",
                           reason="lot_unreachable", request_id=request_id,
                           alternatives=alternatives(lot_id, body)), 503
        if status == 409:
            reg.log(f"Reservation conflict at '{name}': {data.get('error', '')}", "warning")
            data["alternatives"] = alternatives(lot_id, body)
        elif status == 201:
            res = data["reservation"]
            # the public activity log names the space, not the driver (privacy)
            reg.log(f"Reservation {res['id']} confirmed at '{name}' (space {res['space_id']})", "success")
        if isinstance(data.get("reservation"), dict):
            data["reservation"].pop("request_id", None)
        data["request_id"] = request_id
        return jsonify(data), status

    @app.delete("/api/lots/<lot_id>/reservations/<rid>")
    @auth.required()
    def cancel(lot_id, rid):
        url = reg.url_of(lot_id)
        if not url:
            return jsonify(error="unknown lot"), 404
        # Check ownership at the lot (the source of truth) before cancelling. Admins may cancel anything.
        status, data, err = lot_call(url, "GET", f"/reservations/{rid}")
        if err is not None or status == 503:
            return jsonify(error="lot unreachable", reason="lot_unreachable"), 503
        if status == 404:
            return jsonify(error="reservation not found"), 404
        if g.user["role"] != "admin" and data.get("reservation", {}).get("owner") != owner_tag(g.user):
            return jsonify(error="you can only cancel your own reservations", reason="forbidden"), 403
        status, data, err = lot_call(url, "DELETE", f"/reservations/{rid}")
        if err is not None or status == 503:
            return jsonify(error="lot unreachable", reason="lot_unreachable"), 503
        return jsonify(data), status

    @app.get("/api/me/reservations")
    @auth.required()
    def my_reservations():
        """The logged-in user's active reservations, gathered from every lot that owns one."""
        out, unreachable = [], []
        for l in sorted(reg.lots(), key=lambda x: x["name"]):
            status, data, err = lot_call(l["url"], "GET", f"/reservations?owner={owner_tag(g.user)}", timeout=1.5)
            if err is not None or status != 200:
                unreachable.append(l["id"])
                continue
            for r in data.get("reservations", []):
                r.pop("request_id", None)
                out.append({**r, "lot_id": l["id"], "lot_name": l["name"]})
        out.sort(key=lambda r: r["start_ts"])
        return jsonify(reservations=out, unreachable_lots=unreachable)

    @app.get("/api/lots/<lot_id>/reservations")
    @auth.required("admin")
    def lot_reservations(lot_id):
        url = reg.url_of(lot_id)
        if not url:
            return jsonify(error="unknown lot"), 404
        status, data, err = lot_call(url, "GET", "/reservations")
        if err is not None or status == 503:
            return jsonify(error="lot unreachable", reason="lot_unreachable"), 503
        return jsonify(data), status

    # ---- demo controls (relayed to lots; admin accounts only) ------------------------------------
    @app.post("/api/admin/lots/<lot_id>/partition")
    @auth.required("admin")
    def admin_partition(lot_id):
        url = reg.url_of(lot_id)
        if not url:
            return jsonify(error="unknown lot"), 404
        on = bool((request.get_json(silent=True) or {}).get("on"))
        status, data, err = lot_call(url, "POST", "/admin/partition", {"on": on})
        if err:
            return jsonify(error="lot process not reachable"), 503
        reg.log(f"[demo] {'Cut' if on else 'Restored'} the link between '{reg.name_of(lot_id)}' and the coordinator",
                "warning" if on else "info")
        return jsonify(data), status

    @app.post("/api/admin/lots/<lot_id>/spaces/<space_id>")
    @auth.required("admin")
    def admin_space(lot_id, space_id):
        url = reg.url_of(lot_id)
        if not url:
            return jsonify(error="unknown lot"), 404
        status, data, err = lot_call(url, "POST", f"/admin/spaces/{space_id}", request.get_json(silent=True) or {})
        if err:
            return jsonify(error="lot process not reachable"), 503
        return jsonify(data), status

    @app.post("/api/admin/sim")
    @auth.required("admin")
    def admin_sim():
        body = request.get_json(silent=True) or {}
        results = {}
        for l in reg.lots():
            status, data, err = lot_call(l["url"], "POST", "/admin/sim", body, timeout=1.5)
            results[l["id"]] = "ok" if err is None and status == 200 else "failed"
        reg.log(f"[demo] Simulated clock set to {body.get('hour')}h ({'running' if body.get('running', True) else 'paused'})")
        return jsonify(results=results)

    # ---- stale-data monitor ----------------------------------------------------------------------
    def monitor():
        while True:
            time.sleep(0.5)
            reg.check_transitions()

    threading.Thread(target=monitor, daemon=True, name="stale-monitor").start()
    return app
