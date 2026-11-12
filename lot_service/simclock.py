"""Simulated time of day, used for demand-based pricing and the sensor simulation.

The clock is derived from wall-clock time, so every lot that uses the same rate agrees on the
simulated hour without needing to coordinate. The coordinator's demo controls can pin or move it.
"""
import time


class SimClock:
    def __init__(self, minutes_per_second: float = 4.0):
        self.rate = minutes_per_second
        self.running = True
        self._base_minutes = 0.0
        self._base_time = 0.0  # epoch; with base 0 all lots agree

    def minutes(self, now=None) -> float:
        now = time.time() if now is None else now
        if not self.running:
            return self._base_minutes % 1440
        return (self._base_minutes + (now - self._base_time) * self.rate) % 1440

    def hour(self, now=None) -> float:
        return self.minutes(now) / 60.0

    def label(self, now=None) -> str:
        m = int(self.minutes(now))
        return f"{m // 60:02d}:{m % 60:02d}"

    def set(self, hour: float, running: bool = True, now=None):
        now = time.time() if now is None else now
        self._base_minutes = (hour % 24) * 60.0
        self._base_time = now
        self.running = running
