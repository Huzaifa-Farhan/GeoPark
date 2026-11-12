"""Background thread that registers the lot with the coordinator and keeps it up to date.

* Sends a heartbeat/snapshot every `heartbeat_interval` seconds even if nothing changed, so the
  coordinator can tell "quiet" apart from "gone".
* Sends immediately when something changes (ctx.wake).
* Events are queued in the lot's own database until the coordinator acknowledges them, so a lot
  that was cut off simply sends everything it missed once the link is back.
* The first report doubles as registration (it includes the lot's metadata).
"""
import threading
import time

import requests

from . import db


class Reporter(threading.Thread):
    def __init__(self, ctx):
        super().__init__(daemon=True, name=f"reporter-{ctx.cfg.lot_id}")
        self.ctx = ctx

    def build_payload(self):
        ctx = self.ctx
        snap = ctx.snapshot()
        with db.connection(ctx.cfg.db_path) as conn:
            acked = db.get_acked_seq(conn)
            events = db.pending_events(conn, acked)
        return {"lot": ctx.meta(), "snapshot": snap, "events": events, "sent_at": time.time()}

    def send_once(self):
        ctx = self.ctx
        if ctx.partitioned:
            return False
        ctx.link["attempts"] += 1
        try:
            payload = self.build_payload()
            resp = requests.post(f"{ctx.cfg.coordinator_url}/internal/report", json=payload,
                                 timeout=ctx.cfg.report_timeout)
            resp.raise_for_status()
            acked = int(resp.json().get("acked_seq", 0))
            if payload["events"]:
                acked = min(acked, payload["events"][-1]["seq"])
                with db.connection(ctx.cfg.db_path) as conn:
                    db.set_acked_seq(conn, max(acked, db.get_acked_seq(conn)))
            ctx.link["last_ok"] = time.time()
            return True
        except Exception as exc:  # network down, coordinator down, bad response...
            ctx.link["failures"] += 1
            ctx.link["last_error"] = (time.time(), str(exc)[:200])
            return False

    def run(self):
        ctx = self.ctx
        while not ctx.stop.is_set():
            self.send_once()
            ctx.wake.wait(ctx.cfg.heartbeat_interval)
            ctx.wake.clear()
            time.sleep(0.05)  # coalesce bursts of changes
