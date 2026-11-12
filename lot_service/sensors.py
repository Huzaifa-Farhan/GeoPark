"""Simulated IoT occupancy sensors.

Every tick one bay changes state. Whether it is more likely to fill or empty depends on how
busy the simulated time of day is, so lots fill up around the simulated rush hours.
"""
import random
import threading
import time

from . import db
from .pricing import demand_level


class SensorSimulator(threading.Thread):
    def __init__(self, ctx):
        super().__init__(daemon=True, name=f"sensors-{ctx.cfg.lot_id}")
        self.ctx = ctx
        self.rng = random.Random(ctx.cfg.seed)

    def step(self):
        """Flip one space according to demand. Returns the (space_id, occupied) change or None."""
        ctx = self.ctx
        now = time.time()
        with db.connection(ctx.cfg.db_path) as conn:
            states = db.space_states(conn, now)
            if not states:
                return None
            occupied = [s for s in states if s["state"] == "occupied"]
            free = [s for s in states if s["state"] == "free"]
            occ = len(occupied) / len(states)
            target = 0.15 + 0.75 * demand_level(ctx.clock.hour(now))
            p_occupy = min(0.9, max(0.1, 0.5 + (target - occ) * 1.6))
            if (self.rng.random() < p_occupy and free) or not occupied:
                if not free:
                    return None
                pick, new_state = self.rng.choice(free), True
            else:
                pick, new_state = self.rng.choice(occupied), False
            result = db.set_occupied(conn, pick["id"], new_state, now, source="sensor")
        if result and result["changed"]:
            ctx.wake.set()
            return pick["id"], new_state
        return None

    def run(self):
        ctx = self.ctx
        while not ctx.stop.wait(ctx.cfg.sensor_interval * self.rng.uniform(0.5, 1.5)):
            try:
                self.step()
            except Exception:
                pass  # a failed sensor read must never kill the lot
