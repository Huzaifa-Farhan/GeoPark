"""Coordination service: the only thing drivers talk to.

It keeps a (possibly lagging) copy of every lot's availability, ranks lots for a search and relays
reservation requests. It never decides whether a space is available - the owning lot does.
"""
import os
import threading
import time
import uuid

import requests
from flask import Flask, jsonify, request

from .ranking import PRIORITIES, rank_lots
from .state import Registry

FORWARD_TIMEOUT = float(os.environ.get("FORWARD_TIMEOUT", 3.0))
FORWARD_RETRIES = int(os.environ.get("FORWARD_RETRIES", 3))


def call_lot(url, method, path, payload=None, timeout=FORWARD_TIMEOUT, retries=1):
    """Call a lot. Retries only on network errors (the lot de-duplicates by request_id).

    Returns (status_code, json_body, error_string_or_None).
    """
    last_err = None
    for _ in range(max(1, retries)):
        try:
            r = requests.request(method, f"{url}{path}", json=payload, timeout=timeout,
                                 headers={"X-Origin": "coordinator"})
            try:
                body = r.json()
            except ValueError:
                body = {}
            return r.status_code, body, None
        except requests.RequestException as exc:
            last_err = f"{type(exc).__name__}"
    return None, None, last_err


def create_app(stale_after: float = None) -> Flask:
    app = Flask("geopark-coordinator")
    reg = Registry(stale_after if stale_after is not None else float(os.environ.get("STALE_AFTER", 6.0)))
    app.config["REGISTRY"] = reg

    # ---- CORS so the React dev server can call us ---------------------------------------------
    @app.after_request
    def cors(resp):
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
        return resp

    @app.route("/api/<path:_p>", methods=["OPTIONS"])
    def preflight(_p):
        return ("", 204)

    # ---- called by lots -----------------------------------------------------------------------
    @app.post("/internal/report")
    def report():
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
    def reserve():
        body = request.get_json(silent=True) or {}
        lot_id = body.get("lot_id")
        url = reg.url_of(lot_id) if lot_id else None
        if not url:
            return jsonify(error="unknown or missing lot_id"), 404
        request_id = str(body.get("request_id") or uuid.uuid4())
        payload = {"request_id": request_id, "space_id": body.get("space_id"), "driver": body.get("driver"),
                   "start": body.get("start"), "end": body.get("end")}
        status, data, err = call_lot(url, "POST", "/reservations", payload, retries=FORWARD_RETRIES)
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
            reg.log(f"Reservation {res['id']} confirmed at '{name}' (space {res['space_id']}) for {res['driver']}",
                    "success")
        data["request_id"] = request_id
        return jsonify(data), status

    @app.delete("/api/lots/<lot_id>/reservations/<rid>")
    def cancel(lot_id, rid):
        url = reg.url_of(lot_id)
        if not url:
            return jsonify(error="unknown lot"), 404
        status, data, err = call_lot(url, "DELETE", f"/reservations/{rid}")
        if err is not None or status == 503:
            return jsonify(error="lot unreachable", reason="lot_unreachable"), 503
        return jsonify(data), status

    @app.get("/api/lots/<lot_id>/reservations")
    def lot_reservations(lot_id):
        url = reg.url_of(lot_id)
        if not url:
            return jsonify(error="unknown lot"), 404
        status, data, err = call_lot(url, "GET", "/reservations")
        if err is not None or status == 503:
            return jsonify(error="lot unreachable", reason="lot_unreachable"), 503
        return jsonify(data), status

    # ---- demo controls (relayed to lots) ----------------------------------------------------------
    @app.post("/api/admin/lots/<lot_id>/partition")
    def admin_partition(lot_id):
        url = reg.url_of(lot_id)
        if not url:
            return jsonify(error="unknown lot"), 404
        on = bool((request.get_json(silent=True) or {}).get("on"))
        status, data, err = call_lot(url, "POST", "/admin/partition", {"on": on})
        if err:
            return jsonify(error="lot process not reachable"), 503
        reg.log(f"[demo] {'Cut' if on else 'Restored'} the link between '{reg.name_of(lot_id)}' and the coordinator",
                "warning" if on else "info")
        return jsonify(data), status

    @app.post("/api/admin/lots/<lot_id>/spaces/<space_id>")
    def admin_space(lot_id, space_id):
        url = reg.url_of(lot_id)
        if not url:
            return jsonify(error="unknown lot"), 404
        status, data, err = call_lot(url, "POST", f"/admin/spaces/{space_id}", request.get_json(silent=True) or {})
        if err:
            return jsonify(error="lot process not reachable"), 503
        return jsonify(data), status

    @app.post("/api/admin/sim")
    def admin_sim():
        body = request.get_json(silent=True) or {}
        results = {}
        for l in reg.lots():
            status, data, err = call_lot(l["url"], "POST", "/admin/sim", body, timeout=1.5)
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
