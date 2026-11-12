"""Shared runtime state for one lot service."""
import threading
import time

from . import db
from .config import LotConfig
from .pricing import compute_price
from .simclock import SimClock


class LotContext:
    def __init__(self, cfg: LotConfig):
        self.cfg = cfg
        self.clock = SimClock(cfg.sim_rate)
        self.partitioned = False          # simulated lost connection to the coordinator
        self.wake = threading.Event()     # set to ask the reporter to send an update now
        self.stop = threading.Event()
        self.link = {"last_ok": None, "last_error": None, "attempts": 0, "failures": 0}
        self.threads = []
        db.init_db(cfg.db_path, cfg.capacity)

    # -- pricing -----------------------------------------------------------
    def price_for(self, snap, now=None):
        return compute_price(self.cfg.base_price, snap["occupancy"], self.clock.hour(now),
                             self.cfg.min_price, self.cfg.max_price)

    # -- snapshot sent to the coordinator and returned by GET /status -------
    def snapshot(self, now=None):
        now = time.time() if now is None else now
        with db.connection(self.cfg.db_path) as conn:
            snap = db.snapshot(conn, now)
            spaces = db.space_states(conn, now)
            latest = db.latest_seq(conn)
            acked = db.get_acked_seq(conn)
        snap.update({
            "price": self.price_for(snap, now),
            "base_price": self.cfg.base_price,
            "min_price": self.cfg.min_price,
            "max_price": self.cfg.max_price,
            "sim_time": self.clock.label(now),
            "sim_hour": round(self.clock.hour(now), 3),
            "spaces": {s["id"]: s["state"] for s in spaces},
            "seq": latest,
            "backlog": max(0, latest - acked),
            "measured_at": now,
        })
        return snap

    def meta(self):
        c = self.cfg
        return {"id": c.lot_id, "name": c.name, "url": c.public_url, "lat": c.lat, "lng": c.lng,
                "capacity": c.capacity}

    def link_state(self):
        if self.partitioned:
            return "partitioned"
        if self.link["last_error"] and (self.link["last_ok"] is None or self.link["last_error"][0] > self.link["last_ok"]):
            return "coordinator_unreachable"
        return "connected" if self.link["last_ok"] else "starting"
