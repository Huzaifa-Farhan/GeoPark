"""HTTP API of one parking lot. The lot owns its data and has the final say on every reservation."""
import time
import uuid

from flask import Flask, jsonify, request

from shared import security

from . import db
from .config import LotConfig
from .context import LotContext
from .reporter import Reporter
from .sensors import SensorSimulator

# What a caller WITHOUT the service key (e.g. the on-site kiosk) may do at a lot.
PUBLIC_ROUTES = {("GET", "/health"), ("GET", "/status"), ("GET", "/spaces"), ("POST", "/reservations")}


def create_app(cfg: LotConfig, start_background: bool = False) -> Flask:
    app = Flask(f"lot-{cfg.lot_id}")
    ctx = LotContext(cfg)
    app.config["CTX"] = ctx

    def from_service():
        return security.key_matches(request.headers.get(security.HEADER), cfg.service_key)

    # ---- service authentication ------------------------------------------------------------
    # Only other GeoPark services (holding the shared key) may read reservations, cancel them or use
    # the admin controls. The on-site kiosk can still check availability and create a booking.
    @app.before_request
    def service_guard():
        if (request.method, request.path) not in PUBLIC_ROUTES and not from_service():
            return jsonify(error="this endpoint is for GeoPark services only (missing or wrong service key)",
                           reason="forbidden"), 403

    # ---- simulated network partition ------------------------------------------------------
    # While "partitioned", requests relayed by the coordinator fail as if the network were down, and the
    # reporter stays silent. Requests made directly at the lot (e.g. from an on-site kiosk) keep working,
    # and so do the sensors. Admin calls still get through so the demo can restore the link.
    @app.before_request
    def partition_guard():
        if ctx.partitioned and from_service() and not request.path.startswith("/admin"):
            return jsonify(error="lot unreachable (simulated network partition)"), 503

    # ---- read endpoints --------------------------------------------------------------------
    @app.get("/health")
    def health():
        return jsonify(ok=True, lot_id=cfg.lot_id)

    @app.get("/status")
    def status():
        snap = ctx.snapshot()
        snap.update({"lot": ctx.meta(), "link": ctx.link_state(), "partitioned": ctx.partitioned,
                     "sim_running": ctx.clock.running})
        return jsonify(snap)

    @app.get("/spaces")
    def spaces():
        with db.connection(cfg.db_path) as conn:
            return jsonify(spaces=db.space_states(conn, time.time()))

    @app.get("/reservations")
    def reservations():
        with db.connection(cfg.db_path) as conn:
            return jsonify(reservations=db.list_reservations(
                conn, request.args.get("space_id"), request.args.get("include_cancelled") == "1",
                owner=request.args.get("owner") or None))

    @app.get("/reservations/<rid>")
    def get_reservation(rid):
        with db.connection(cfg.db_path) as conn:
            res = db.get_reservation(conn, rid)
        if res is None:
            return jsonify(error="reservation not found"), 404
        return jsonify(reservation=res)

    # ---- reservations ----------------------------------------------------------------------
    @app.post("/reservations")
    def create_reservation():
        body = request.get_json(silent=True) or {}
        try:
            start, end = float(body["start"]), float(body["end"])
        except (KeyError, TypeError, ValueError):
            return jsonify(error="start and end (epoch seconds) are required"), 400
        trusted = from_service()
        request_id = str(body.get("request_id") or uuid.uuid4())
        if not trusted:
            # kiosk bookings get their own id space and no owner, so they can never collide with or
            # claim a booking made by a logged-in user through the coordinator
            request_id = f"kiosk:{request_id}"
        now = time.time()
        with db.connection(cfg.db_path) as conn:
            outcome, data = db.create_reservation(
                conn, request_id=request_id, space_id=body.get("space_id") or None,
                driver=(body.get("driver") or "").strip(), start=start, end=end, now=now,
                price_fn=lambda snap: ctx.price_for(snap, now), max_hours=cfg.max_reservation_hours,
                owner=(body.get("owner") or None) if trusted else None)
        if outcome in ("created", "duplicate"):
            ctx.wake.set()
            return jsonify(reservation=data, duplicate=(outcome == "duplicate"), lot_id=cfg.lot_id), (
                201 if outcome == "created" else 200)
        code = {"conflict": 409, "invalid": 400, "not_found": 404}[outcome]
        return jsonify(lot_id=cfg.lot_id, **data), code

    @app.delete("/reservations/<rid>")
    def cancel(rid):
        with db.connection(cfg.db_path) as conn:
            outcome, data = db.cancel_reservation(conn, rid, time.time())
        if outcome == "not_found":
            return jsonify(error="reservation not found"), 404
        ctx.wake.set()
        return jsonify(reservation=data, outcome=outcome)

    # ---- demo / admin controls (not used by drivers) ---------------------------------------
    @app.post("/admin/spaces/<space_id>")
    def admin_set_space(space_id):
        body = request.get_json(silent=True) or {}
        occupied = bool(body.get("occupied"))
        with db.connection(cfg.db_path) as conn:
            result = db.set_occupied(conn, space_id, occupied, time.time(), source="manual")
        if result is None:
            return jsonify(error="unknown space"), 404
        # A manual "occupied" holds the bay against the random sensors; a manual "free" releases it.
        if occupied:
            ctx.manual_hold.add(space_id)
        else:
            ctx.manual_hold.discard(space_id)
        ctx.wake.set()
        return jsonify(result)

    @app.post("/admin/partition")
    def admin_partition():
        body = request.get_json(silent=True) or {}
        ctx.partitioned = bool(body.get("on"))
        if not ctx.partitioned:
            ctx.wake.set()  # reconnect: flush everything we missed straight away
        return jsonify(partitioned=ctx.partitioned)

    @app.post("/admin/sim")
    def admin_sim():
        body = request.get_json(silent=True) or {}
        ctx.clock.set(float(body.get("hour", ctx.clock.hour())), bool(body.get("running", True)))
        ctx.wake.set()
        return jsonify(sim_time=ctx.clock.label(), running=ctx.clock.running)

    @app.post("/admin/sensors/step")
    def admin_sensor_step():
        change = SensorSimulator(ctx).step()
        return jsonify(changed=bool(change))

    if start_background:
        start_threads(app)
    return app


def start_threads(app: Flask):
    ctx: LotContext = app.config["CTX"]
    threads = [Reporter(ctx)]
    if ctx.cfg.sensors_enabled:
        threads.append(SensorSimulator(ctx))
    for t in threads:
        t.start()
    ctx.threads = threads
