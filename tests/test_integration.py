import threading
import time
import unittest
from collections import Counter

import requests

from tools.stack import Stack

LOTS = [
    {"id": "a", "name": "Lot A", "lat": 43.945, "lng": -78.896, "capacity": 8, "port": 8931},
    {"id": "b", "name": "Lot B", "lat": 43.920, "lng": -78.879, "capacity": 8, "port": 8932},
]
PORT = 8930


def wait_for(fn, timeout=10, step=0.1):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v:
            return v
        time.sleep(step)
    return None


class IntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.stack = Stack(LOTS, coord_port=PORT, data_dir="/tmp/geopark_it", sensors=False,
                          heartbeat=0.4, stale_after=1.5).start()
        cls.api = cls.stack.coord_url
        cls.admin = cls.stack.login()
        cls.alice = cls.stack.driver("alice")
        cls.svc = cls.stack.service_headers()

    @classmethod
    def tearDownClass(cls):
        cls.stack.stop()

    def lot(self, lot_id):
        return requests.get(f"{self.api}/api/lots/{lot_id}", timeout=3).json()

    def reserve(self, lot_id, headers=None, **kw):
        now = time.time()
        body = {"lot_id": lot_id, "start": now + 30, "end": now + 3600}
        body.update(kw)
        return requests.post(f"{self.api}/api/reservations", json=body, timeout=10,
                             headers=self.alice if headers is None else headers)

    # --- order matters: tests are numbered so partition tests run last --------------------------
    def test_01_lots_register_and_report(self):
        lots = requests.get(f"{self.api}/api/lots").json()["lots"]
        self.assertEqual({l["id"] for l in lots}, {"a", "b"})
        self.assertTrue(all(l["status"] == "live" for l in lots))

    def test_02_sensor_change_reaches_coordinator(self):
        before = self.lot("a")["free"]
        requests.post(f"{self.api}/api/admin/lots/a/spaces/S01", json={"occupied": True}, headers=self.admin)
        self.assertTrue(wait_for(lambda: self.lot("a")["free"] == before - 1, 5))
        requests.post(f"{self.api}/api/admin/lots/a/spaces/S01", json={"occupied": False}, headers=self.admin)
        self.assertTrue(wait_for(lambda: self.lot("a")["free"] == before, 5))

    def test_03_reservation_via_coordinator_and_free_count(self):
        before = self.lot("b")["free"]
        now = time.time()
        r = self.reserve("b", start=now, end=now + 1800)
        self.assertEqual(r.status_code, 201)
        self.assertTrue(wait_for(lambda: self.lot("b")["free"] == before - 1, 5))

    def test_04_concurrent_requests_through_coordinator(self):
        codes, lock = [], threading.Lock()

        def go(i):
            r = self.reserve("a", space_id="S05")
            with lock:
                codes.append(r.status_code)

        ts = [threading.Thread(target=go, args=(i,)) for i in range(30)]
        [t.start() for t in ts]
        [t.join() for t in ts]
        c = Counter(codes)
        self.assertEqual(c[201], 1, c)
        self.assertEqual(c[409], 29, c)

    def test_05_conflict_response_includes_alternatives(self):
        self.reserve("a", space_id="S06")
        r = self.reserve("a", space_id="S06")
        self.assertEqual(r.status_code, 409)
        self.assertTrue(any(a["id"] == "b" for a in r.json()["alternatives"]))

    def test_06_full_lot_recommends_alternative(self):
        for i in range(1, 9):
            requests.post(f"{self.api}/api/admin/lots/a/spaces/S{i:02d}", json={"occupied": True}, headers=self.admin)
        self.assertTrue(wait_for(lambda: self.lot("a")["free"] == 0, 5))
        rec = requests.get(f"{self.api}/api/recommend", params={"preferred": "a", "lat": 43.945, "lng": -78.896}).json()
        self.assertTrue(rec["preferred_full"])
        self.assertEqual(rec["recommended"], "b")
        for i in range(1, 9):
            requests.post(f"{self.api}/api/admin/lots/a/spaces/S{i:02d}", json={"occupied": False}, headers=self.admin)

    def test_07_partition_stale_local_operation_and_recovery(self):
        requests.post(f"{self.api}/api/admin/lots/b/partition", json={"on": True}, headers=self.admin)
        # coordinator marks lot B stale but keeps listing it
        self.assertTrue(wait_for(lambda: self.lot("b")["status"] == "stale", 8))
        self.assertEqual(len(requests.get(f"{self.api}/api/lots").json()["lots"]), 2)
        self.assertEqual(self.lot("a")["status"], "live")  # other lot unaffected
        # reservation through the coordinator fails gracefully with alternatives
        r = self.reserve("b")
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.json()["reason"], "lot_unreachable")
        self.assertTrue(any(a["id"] == "a" for a in r.json()["alternatives"]))
        # the lot keeps managing itself: a local (kiosk) booking and sensor change still work
        now = time.time()
        k = requests.post("http://127.0.0.1:8932/reservations",
                          json={"driver": "kiosk", "start": now + 30, "end": now + 900, "space_id": "S08"})
        self.assertEqual(k.status_code, 201)
        requests.post("http://127.0.0.1:8932/admin/spaces/S07", json={"occupied": True}, headers=self.svc)
        applied_before = self.lot("b")["events_applied"]
        stale_free = self.lot("b")["free"]
        # reconnect: coordinator catches up on what it missed
        requests.post(f"{self.api}/api/admin/lots/b/partition", json={"on": False}, headers=self.admin)
        self.assertTrue(wait_for(lambda: self.lot("b")["status"] == "live", 8))
        self.assertGreaterEqual(self.lot("b")["events_applied"] - applied_before, 2)
        self.assertTrue(wait_for(lambda: self.lot("b")["free"] <= stale_free - 1, 5))
        self.assertEqual(wait_for(lambda: requests.get(f"http://127.0.0.1:8932/status").json()["backlog"] == 0, 5), True)

    def test_08_killed_lot_goes_stale_and_new_lot_can_join(self):
        self.stack.kill("b")
        self.assertTrue(wait_for(lambda: self.lot("b")["status"] == "stale", 8))
        self.assertEqual(self.reserve("b").status_code, 503)
        # scalability: a brand-new lot registers itself without any coordinator change
        self.stack.start_lot({"id": "c", "name": "Lot C", "lat": 43.9, "lng": -78.87, "capacity": 6, "port": 8933})
        self.assertTrue(wait_for(lambda: any(l["id"] == "c" and l["status"] == "live"
                                             for l in requests.get(f"{self.api}/api/lots").json()["lots"]), 10))

    def test_09_sensor_feed_history_and_pricing_endpoints(self):
        requests.post(f"{self.api}/api/admin/lots/a/spaces/S03", json={"occupied": True}, headers=self.admin)
        feed = wait_for(lambda: [e for e in requests.get(f"{self.api}/api/feed").json()["feed"]
                                 if e["type"] == "sensor" and e["lot_id"] == "a"
                                 and e["payload"]["space_id"] == "S03"], 5)
        self.assertTrue(feed)
        hist = requests.get(f"{self.api}/api/history").json()["history"]
        self.assertIn("a", hist)
        self.assertTrue(all({"t", "occupancy", "price", "free"} <= set(s) for s in hist["a"]))
        pricing = {p["id"]: p for p in requests.get(f"{self.api}/api/pricing").json()["lots"]}
        pa = pricing["a"]
        self.assertEqual(len(pa["forecast"]), 48)
        for f in pa["forecast"]:
            self.assertTrue(pa["min_price"] <= f["price_empty"] <= f["price_full"] <= pa["max_price"])
        # the explained price matches the lot's own price (within rounding / clamp)
        expected = min(max(pa["base_price"] * pa["time_factor"] * pa["occupancy_factor"], pa["min_price"]),
                       pa["max_price"])
        self.assertAlmostEqual(expected, pa["price"], delta=0.05)

    def test_10_reservations_belong_to_their_owner(self):
        bob = self.stack.driver("bob")
        # the booking is made as the logged-in user; a "driver" in the body is ignored
        r = self.reserve("a", driver="somebody-else", request_id="shared-id")
        self.assertEqual(r.status_code, 201, r.json())
        res = r.json()["reservation"]
        self.assertEqual(res["driver"], "alice")
        self.assertNotIn("request_id", res)
        # bob reusing alice's request id gets his own booking, not a copy of hers
        rb = self.reserve("a", headers=bob, request_id="shared-id")
        self.assertEqual(rb.status_code, 201)
        self.assertNotEqual(rb.json()["reservation"]["id"], res["id"])
        # each user sees only their own reservations
        mine = requests.get(f"{self.api}/api/me/reservations", headers=self.alice).json()["reservations"]
        theirs = requests.get(f"{self.api}/api/me/reservations", headers=bob).json()["reservations"]
        self.assertIn(res["id"], [x["id"] for x in mine])
        self.assertNotIn(res["id"], [x["id"] for x in theirs])
        self.assertTrue(all(x["lot_id"] for x in mine))
        # bob cannot cancel alice's booking, alice can
        url = f"{self.api}/api/lots/a/reservations/{res['id']}"
        self.assertEqual(requests.delete(url, headers=bob).status_code, 403)
        self.assertEqual(requests.delete(url).status_code, 401)
        ok = requests.delete(url, headers=self.alice)
        self.assertEqual((ok.status_code, ok.json()["outcome"]), (200, "cancelled"))
        # an admin can cancel anyone's booking
        adm = requests.delete(f"{self.api}/api/lots/a/reservations/{rb.json()['reservation']['id']}", headers=self.admin)
        self.assertEqual(adm.json()["outcome"], "cancelled")

    def test_11_lot_internal_endpoints_reject_outsiders(self):
        lot_a = "http://127.0.0.1:8931"
        self.assertEqual(requests.get(f"{lot_a}/reservations").status_code, 403)
        self.assertEqual(requests.post(f"{lot_a}/admin/partition", json={"on": True}).status_code, 403)
        self.assertEqual(requests.get(f"{lot_a}/status").json()["partitioned"], False)
        self.assertEqual(self.lot("a")["status"], "live")


if __name__ == "__main__":
    unittest.main()
