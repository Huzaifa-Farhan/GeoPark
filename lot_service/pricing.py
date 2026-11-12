"""Demand-aware pricing. Pure functions so they are easy to unit test.

price = base * time_factor(sim hour) * occupancy_factor(occupancy), clamped to [min, max].
Prices come from simulated demand only - there are no real payments.
"""
import math


def _peak(hour: float, centre: float, width: float) -> float:
    d = abs(hour - centre)
    d = min(d, 24 - d)  # wrap around midnight
    return math.exp(-(d * d) / (2 * width * width))


def demand_level(hour: float) -> float:
    """0..1 measure of how busy the simulated time of day is (morning + evening rush)."""
    return max(_peak(hour, 8.5, 1.5), _peak(hour, 17.5, 1.5))


def time_factor(hour: float) -> float:
    """1.0 off-peak, up to ~1.4 at the simulated morning/evening peaks."""
    return 1.0 + 0.4 * demand_level(hour)


def occupancy_factor(occupancy: float) -> float:
    """1.0 for an empty lot, 1.8 for a completely full one (quadratic so it bites near capacity)."""
    occupancy = min(max(occupancy, 0.0), 1.0)
    return 1.0 + 0.8 * occupancy * occupancy


def compute_price(base: float, occupancy: float, hour: float, min_price: float, max_price: float) -> float:
    raw = base * time_factor(hour) * occupancy_factor(occupancy)
    return round(min(max(raw, min_price), max_price), 2)
