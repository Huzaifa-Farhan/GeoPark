import unittest

from lot_service.pricing import compute_price, demand_level, occupancy_factor, time_factor
from lot_service.simclock import SimClock


class PricingTests(unittest.TestCase):
    def test_peak_costs_more_than_offpeak(self):
        self.assertGreater(time_factor(8.5), time_factor(3.0))
        self.assertGreater(time_factor(17.5), time_factor(13.0))

    def test_fuller_lot_costs_more(self):
        low = compute_price(3.0, 0.1, 12, 0.0, 100)
        high = compute_price(3.0, 0.95, 12, 0.0, 100)
        self.assertGreater(high, low)

    def test_price_is_clamped(self):
        self.assertEqual(compute_price(3.0, 0.0, 3, 2.5, 8.0), 3.0)
        self.assertEqual(compute_price(1.0, 0.0, 3, 2.0, 8.0), 2.0)      # floor
        self.assertEqual(compute_price(10.0, 1.0, 8.5, 2.0, 8.0), 8.0)   # ceiling

    def test_occupancy_factor_bounds(self):
        self.assertEqual(occupancy_factor(-1), 1.0)
        self.assertAlmostEqual(occupancy_factor(2), 1.8)

    def test_demand_wraps_midnight(self):
        self.assertAlmostEqual(demand_level(0.0), demand_level(24.0))

    def test_sim_clock_pin_and_label(self):
        c = SimClock(4.0)
        c.set(8.5, running=False)
        self.assertEqual(c.label(), "08:30")
        self.assertAlmostEqual(c.hour(), 8.5)


if __name__ == "__main__":
    unittest.main()
