import unittest

from coordinator.ranking import haversine_km, rank_lots
from coordinator.state import Registry


def lot(i, free, price, lat, lng, cap=20, stale=False):
    return {"id": i, "name": i.title(), "lat": lat, "lng": lng, "capacity": cap, "free": free,
            "price": price, "stale": stale}


class RankingTests(unittest.TestCase):
    def setUp(self):
        self.origin = (43.945, -78.896)
        self.lots = [lot("near", 0, 3.0, 43.946, -78.897),         # full
                     lot("mid", 8, 4.0, 43.920, -78.879),
                     lot("far", 15, 2.0, 43.880, -78.885)]

    def test_full_lots_sort_last_and_are_flagged(self):
        res = rank_lots(self.lots, origin=self.origin)
        self.assertEqual(res[-1]["id"], "near")
        self.assertTrue(res[-1]["full"])
        self.assertIn("full", res[-1]["reasons"])

    def test_preferred_full_gives_alternative(self):
        res = rank_lots(self.lots, origin=self.origin, preferred="near")
        self.assertFalse(res[0]["full"])

    def test_priority_changes_order(self):
        cheapest = rank_lots(self.lots, origin=self.origin, priority="cheapest")[0]["id"]
        closest = rank_lots(self.lots, origin=self.origin, priority="closest")[0]["id"]
        self.assertEqual(cheapest, "far")
        self.assertEqual(closest, "mid")

    def test_stale_lot_is_penalised_and_flagged(self):
        lots = [lot("a", 10, 3.0, 43.94, -78.89), lot("b", 10, 3.0, 43.94, -78.89, stale=True)]
        res = rank_lots(lots, origin=self.origin)
        self.assertEqual(res[0]["id"], "a")
        self.assertIn("data may be out of date", res[1]["reasons"])

    def test_works_without_origin(self):
        res = rank_lots(self.lots)
        self.assertIsNone(res[0]["distance_km"])

    def test_haversine_zero_and_positive(self):
        self.assertAlmostEqual(haversine_km(43.9, -78.8, 43.9, -78.8), 0.0)
        self.assertGreater(haversine_km(43.9, -78.8, 43.8, -78.8), 10)


class RegistryTests(unittest.TestCase):
    def report(self, seq_events, free=5):
        return {"lot": {"id": "x", "name": "X", "url": "http://x", "lat": 0, "lng": 0, "capacity": 10},
                "snapshot": {"free": free, "occupied": 10 - free, "reserved": 0, "total": 10, "occupancy": 0.5,
                             "price": 3.0, "min_price": 2, "max_price": 8, "sim_time": "08:00", "spaces": {},
                             "measured_at": 0},
                "events": [{"seq": s, "type": "sensor", "payload": {}, "created_at": 0} for s in seq_events]}

    def test_events_counted_once_and_acked(self):
        reg = Registry(stale_after=100)
        self.assertEqual(reg.apply_report(self.report([1, 2, 3])), 3)
        self.assertEqual(reg.apply_report(self.report([1, 2, 3, 4])), 4)
        self.assertEqual(reg.lots()[0]["events_applied"], 4)

    def test_goes_stale_and_recovers(self):
        reg = Registry(stale_after=0.2)
        reg.apply_report(self.report([]))
        self.assertEqual(reg.lots()[0]["status"], "live")
        import time
        time.sleep(0.35)
        self.assertEqual(reg.lots()[0]["status"], "stale")
        reg.apply_report(self.report([1]))
        self.assertEqual(reg.lots()[0]["status"], "live")


if __name__ == "__main__":
    unittest.main()
