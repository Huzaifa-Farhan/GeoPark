"""Concurrency and correctness tests for the lot's reservation logic (database layer + HTTP layer)."""
import os
import shutil
import tempfile
import threading
import time
import unittest
from collections import Counter

from lot_service import db
from lot_service.app import create_app
from lot_service.config import LotConfig


class ReservationTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.cfg = LotConfig(lot_id="t", db_path=os.path.join(self.dir, "t.db"), capacity=6)
        self.app = create_app(self.cfg)
        self.client = self.app.test_client()
        self.now = time.time()

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def post(self, **kw):
        body = {"driver": "Test", "start": self.now + 60, "end": self.now + 3600}
        body.update(kw)
        return self.client.post("/reservations", json=body)

    def hammer(self, n, make_body):
        codes, lock = [], threading.Lock()

        def worker(i):
            r = self.client.post("/reservations", json=make_body(i))
            with lock:
                codes.append(r.status_code)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        return Counter(codes)

    def test_same_space_same_window_only_one_wins(self):
        c = self.hammer(60, lambda i: {"request_id": f"r{i}", "space_id": "S01", "driver": f"d{i}",
                                       "start": self.now + 60, "end": self.now + 3600})
        self.assertEqual(c[201], 1)
        self.assertEqual(c[409], 59)

    def test_overlapping_windows_never_both_confirmed(self):
        # many different, mutually overlapping windows on the same space
        c = self.hammer(40, lambda i: {"request_id": f"o{i}", "space_id": "S02", "driver": f"d{i}",
                                       "start": self.now + 60 + i * 30, "end": self.now + 3600 + i * 30})
        self.assertEqual(c[201], 1)
        with db.connection(self.cfg.db_path) as conn:
            res = db.list_reservations(conn, "S02")
        self.assertEqual(len(res), 1)

    def test_auto_assign_never_double_books(self):
        # 6 spaces, 30 simultaneous "any space" requests -> exactly 6 succeed, all on different spaces
        c = self.hammer(30, lambda i: {"request_id": f"a{i}", "driver": f"d{i}",
                                       "start": self.now + 60, "end": self.now + 3600})
        self.assertEqual(c[201], 6)
        with db.connection(self.cfg.db_path) as conn:
            spaces = [r["space_id"] for r in db.list_reservations(conn)]
        self.assertEqual(len(spaces), len(set(spaces)))

    def test_back_to_back_windows_are_allowed(self):
        self.assertEqual(self.post(space_id="S03", start=self.now + 60, end=self.now + 1000).status_code, 201)
        self.assertEqual(self.post(space_id="S03", start=self.now + 1000, end=self.now + 2000).status_code, 201)
        self.assertEqual(self.post(space_id="S03", start=self.now + 999, end=self.now + 1500).status_code, 409)

    def test_retry_with_same_request_id_is_idempotent(self):
        r1 = self.post(request_id="same", space_id="S04")
        r2 = self.post(request_id="same", space_id="S04")
        self.assertEqual(r1.status_code, 201)
        self.assertEqual(r2.status_code, 200)
        self.assertTrue(r2.json["duplicate"])
        self.assertEqual(r1.json["reservation"]["id"], r2.json["reservation"]["id"])
        with db.connection(self.cfg.db_path) as conn:
            self.assertEqual(len(db.list_reservations(conn, "S04")), 1)

    def test_validation(self):
        self.assertEqual(self.post(start=self.now + 100, end=self.now + 50).status_code, 400)
        self.assertEqual(self.post(start=self.now - 7200, end=self.now - 3600).status_code, 400)
        self.assertEqual(self.post(end=self.now + 60 + 13 * 3600).status_code, 400)
        self.assertEqual(self.post(driver="").status_code, 400)
        self.assertEqual(self.post(space_id="NOPE").status_code, 404)

    def test_cannot_reserve_space_occupied_right_now(self):
        self.client.post("/admin/spaces/S05", json={"occupied": True})
        self.assertEqual(self.post(space_id="S05", start=self.now, end=self.now + 3600).status_code, 409)
        # a future window on the same space is fine
        self.assertEqual(self.post(space_id="S05", start=self.now + 7200, end=self.now + 9000).status_code, 201)

    def test_cancel_frees_the_slot(self):
        rid = self.post(space_id="S06").json["reservation"]["id"]
        self.assertEqual(self.post(space_id="S06").status_code, 409)
        self.assertEqual(self.client.delete(f"/reservations/{rid}").status_code, 200)
        self.assertEqual(self.post(space_id="S06").status_code, 201)

    def test_database_trigger_blocks_overlap_even_if_app_check_is_bypassed(self):
        import sqlite3
        with db.connection(self.cfg.db_path) as conn:
            ins = ("INSERT INTO reservations(id, request_id, space_id, driver, start_ts, end_ts, status, "
                   "price_per_hour, total_price, created_at) VALUES (?,?,?,?,?,?, 'active', 3, 3, 0)")
            conn.execute(ins, ("a", "ra", "S01", "x", 100, 200))
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute(ins, ("b", "rb", "S01", "y", 150, 250))

    def test_free_count_reflects_sensors_and_reservations(self):
        self.assertEqual(self.client.get("/status").json["free"], 6)
        self.client.post("/admin/spaces/S01", json={"occupied": True})
        self.assertEqual(self.client.get("/status").json["free"], 5)
        self.post(space_id="S02", start=self.now, end=self.now + 3600)   # active now
        self.post(space_id="S03", start=self.now + 7200, end=self.now + 9000)  # future: not counted
        st = self.client.get("/status").json
        self.assertEqual((st["occupied"], st["reserved"], st["free"]), (1, 1, 4))

    def test_events_are_queued_for_the_coordinator(self):
        self.client.post("/admin/spaces/S01", json={"occupied": True})
        self.post(space_id="S02")
        st = self.client.get("/status").json
        self.assertEqual(st["seq"], 2)
        self.assertEqual(st["backlog"], 2)

    def test_partition_blocks_coordinator_but_not_local_use(self):
        self.client.post("/admin/partition", json={"on": True})
        body = {"driver": "x", "start": self.now + 60, "end": self.now + 600, "space_id": "S01"}
        via_coordinator = self.client.post("/reservations", json=body, headers={"X-Origin": "coordinator"})
        local = self.client.post("/reservations", json=body)
        self.assertEqual(via_coordinator.status_code, 503)
        self.assertEqual(local.status_code, 201)


if __name__ == "__main__":
    unittest.main()
