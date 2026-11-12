"""The coordinator's in-memory copy of each lot's availability.

This copy can lag behind the lots (they own the real data), which is why every lot view carries
the age of its last report and a stale flag. Nothing here is a source of truth for reservations.
"""
import threading
import time
from collections import deque


class Registry:
    def __init__(self, stale_after: float = 6.0):
        self.stale_after = stale_after
        self._lots = {}
        self._lock = threading.RLock()
        self._log = deque(maxlen=300)

    # ---- log shown in the demo UI ----------------------------------------------------
    def log(self, message, level="info"):
        with self._lock:
            self._log.append({"t": time.time(), "level": level, "message": message})

    def get_log(self, since=0.0):
        with self._lock:
            return [e for e in self._log if e["t"] > since]

    # ---- reports from lots --------------------------------------------------------------
    def apply_report(self, report):
        """Apply a heartbeat. Returns the highest event seq acknowledged."""
        lot = report["lot"]
        snap = report["snapshot"]
        events = report.get("events", [])
        now = time.time()
        with self._lock:
            rec = self._lots.get(lot["id"])
            is_new = rec is None
            was_stale = (not is_new) and self._is_stale(rec, now)
            if is_new:
                rec = {"events_applied": 0, "last_event_seq": 0}
                self._lots[lot["id"]] = rec
                self.log(f"Lot '{lot['name']}' registered ({lot['capacity']} spaces)", "success")
            rec.update(meta={k: lot[k] for k in ("id", "name", "url", "lat", "lng", "capacity")})
            rec["snapshot"] = snap
            rec["received_at"] = now
            if events and events[-1]["seq"] < rec["last_event_seq"]:
                rec["last_event_seq"] = 0  # lot database was reset
            fresh = [e for e in events if e["seq"] > rec["last_event_seq"]]
            if fresh:
                rec["last_event_seq"] = fresh[-1]["seq"]
                rec["events_applied"] += len(fresh)
            if was_stale:
                if fresh:
                    self.log(f"'{lot['name']}' reconnected - caught up on {len(fresh)} missed update(s)", "success")
                else:
                    self.log(f"'{lot['name']}' reconnected", "success")
            rec["was_stale"] = False
            return events[-1]["seq"] if events else rec["last_event_seq"]

    # ---- reads ---------------------------------------------------------------------------
    def _is_stale(self, rec, now):
        return (now - rec["received_at"]) > self.stale_after

    def lot_view(self, rec, now=None):
        now = time.time() if now is None else now
        snap = rec["snapshot"]
        meta = rec["meta"]
        age = now - rec["received_at"]
        return {
            **meta,
            "free": snap["free"], "occupied": snap["occupied"], "reserved": snap["reserved"],
            "total": snap["total"], "occupancy": snap["occupancy"], "price": snap["price"],
            "min_price": snap["min_price"], "max_price": snap["max_price"],
            "sim_time": snap["sim_time"], "spaces": snap["spaces"],
            "status": "stale" if age > self.stale_after else "live",
            "stale": age > self.stale_after,
            "age_seconds": round(age, 1),
            "last_update": rec["received_at"],
            "measured_at": snap["measured_at"],
            "events_applied": rec["events_applied"],
        }

    def lots(self):
        now = time.time()
        with self._lock:
            return [self.lot_view(r, now) for r in self._lots.values()]

    def get(self, lot_id):
        with self._lock:
            rec = self._lots.get(lot_id)
            return self.lot_view(rec) if rec else None

    def url_of(self, lot_id):
        with self._lock:
            rec = self._lots.get(lot_id)
            return rec["meta"]["url"] if rec else None

    def name_of(self, lot_id):
        with self._lock:
            rec = self._lots.get(lot_id)
            return rec["meta"]["name"] if rec else lot_id

    # ---- stale/recovered transitions for the log (called by the monitor thread) ----------
    def check_transitions(self):
        now = time.time()
        with self._lock:
            for rec in self._lots.values():
                stale = self._is_stale(rec, now)
                if stale and not rec.get("was_stale"):
                    rec["was_stale"] = True
                    self.log(f"No updates from '{rec['meta']['name']}' for over {self.stale_after:g}s - "
                             f"marking its data as stale", "warning")
