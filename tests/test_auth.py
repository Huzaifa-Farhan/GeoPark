"""Security tests for the coordinator: accounts, login tokens, roles and the service key."""
import os
import shutil
import sqlite3
import tempfile
import time
import unittest

from coordinator.app import create_app

ADMIN_PW = "test-admin-pass"
SERVICE_KEY = "test-service-key"


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.db = os.path.join(self.dir, "coord.db")
        self.app = create_app(stale_after=60, db_path=self.db, service_key=SERVICE_KEY, admin_password=ADMIN_PW)
        self.c = self.app.test_client()

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def register(self, username="alice", password="password123"):
        return self.c.post("/api/auth/register", json={"username": username, "password": password})

    def login(self, username, password):
        return self.c.post("/api/auth/login", json={"username": username, "password": password})

    @staticmethod
    def bearer(token):
        return {"Authorization": f"Bearer {token}"}

    # ---- accounts --------------------------------------------------------------------------
    def test_register_login_and_me(self):
        r = self.register()
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json["user"]["role"], "driver")
        token = self.login("alice", "password123").json["token"]
        me = self.c.get("/api/auth/me", headers=self.bearer(token))
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json["user"]["username"], "alice")

    def test_registration_validation_and_duplicates(self):
        self.assertEqual(self.register("ab").status_code, 400)                 # too short
        self.assertEqual(self.register("bad name!").status_code, 400)          # bad characters
        self.assertEqual(self.register(password="short").status_code, 400)    # weak password
        self.assertEqual(self.register().status_code, 201)
        self.assertEqual(self.register("ALICE").status_code, 409)              # case-insensitive
        # self-registration can never create an admin
        r = self.c.post("/api/auth/register", json={"username": "mallory", "password": "password123", "role": "admin"})
        self.assertEqual(r.json["user"]["role"], "driver")

    def test_passwords_are_stored_hashed(self):
        self.register(password="password123")
        conn = sqlite3.connect(self.db)
        try:
            stored = conn.execute("SELECT password_hash FROM users WHERE username = 'alice'").fetchone()[0]
        finally:
            conn.close()
        self.assertNotIn("password123", stored)
        self.assertTrue(stored.startswith(("scrypt:", "pbkdf2:")))

    def test_wrong_password_and_unknown_user_look_the_same(self):
        self.register()
        a = self.login("alice", "wrong-password")
        b = self.login("nobody", "wrong-password")
        self.assertEqual((a.status_code, a.json["error"]), (b.status_code, b.json["error"]))
        self.assertEqual(a.status_code, 401)

    def test_repeated_failures_lock_the_account_briefly(self):
        self.register()
        for _ in range(5):
            self.assertEqual(self.login("alice", "wrong-password").status_code, 401)
        locked = self.login("alice", "password123")  # even the right password is refused while locked
        self.assertEqual(locked.status_code, 429)
        self.assertGreater(locked.json["retry_after"], 0)

    # ---- tokens ----------------------------------------------------------------------------
    def test_missing_tampered_and_expired_tokens_are_rejected(self):
        self.assertEqual(self.c.get("/api/auth/me").status_code, 401)
        token = self.register().json["token"]
        self.assertEqual(self.c.get("/api/auth/me", headers=self.bearer(token + "x")).status_code, 401)
        self.assertEqual(self.c.get("/api/auth/me", headers=self.bearer("not.a.token")).status_code, 401)
        short = create_app(stale_after=60, db_path=self.db, service_key=SERVICE_KEY, admin_password=ADMIN_PW,
                           token_ttl=1).test_client()
        token = short.post("/api/auth/login", json={"username": "alice", "password": "password123"}).json["token"]
        self.assertEqual(short.get("/api/auth/me", headers=self.bearer(token)).status_code, 200)
        time.sleep(2.2)
        r = short.get("/api/auth/me", headers=self.bearer(token))
        self.assertEqual(r.status_code, 401)
        self.assertIn("expired", r.json["error"])

    def test_tokens_survive_a_coordinator_restart(self):
        token = self.register().json["token"]
        restarted = create_app(stale_after=60, db_path=self.db, service_key=SERVICE_KEY,
                               admin_password=ADMIN_PW).test_client()
        self.assertEqual(restarted.get("/api/auth/me", headers=self.bearer(token)).status_code, 200)

    # ---- roles -----------------------------------------------------------------------------
    def test_admin_endpoints_need_an_admin(self):
        driver = self.bearer(self.register().json["token"])
        admin = self.bearer(self.login("admin", ADMIN_PW).json["token"])
        for path in ["/api/admin/sim", "/api/admin/lots/x/partition", "/api/admin/lots/x/spaces/S01"]:
            self.assertEqual(self.c.post(path, json={}).status_code, 401, path)
            self.assertEqual(self.c.post(path, json={}, headers=driver).status_code, 403, path)
        self.assertEqual(self.c.get("/api/lots/x/reservations", headers=driver).status_code, 403)
        self.assertEqual(self.c.post("/api/admin/sim", json={"hour": 8}, headers=admin).status_code, 200)
        self.assertEqual(self.c.get("/api/lots/x/reservations", headers=admin).status_code, 404)  # allowed; lot unknown

    def test_reserving_and_cancelling_need_a_login(self):
        self.assertEqual(self.c.post("/api/reservations", json={"lot_id": "x"}).status_code, 401)
        self.assertEqual(self.c.delete("/api/lots/x/reservations/abc").status_code, 401)
        self.assertEqual(self.c.get("/api/me/reservations").status_code, 401)

    def test_public_reads_stay_open(self):
        for path in ["/api/health", "/api/lots", "/api/recommend", "/api/log", "/api/pricing"]:
            self.assertEqual(self.c.get(path).status_code, 200, path)

    # ---- service key -----------------------------------------------------------------------
    def test_lot_reports_need_the_service_key(self):
        report = {"lot": {"id": "fake", "name": "Fake", "url": "http://x", "lat": 0, "lng": 0, "capacity": 1},
                  "snapshot": {}, "events": []}
        self.assertEqual(self.c.post("/internal/report", json=report).status_code, 401)
        self.assertEqual(self.c.post("/internal/report", json=report,
                                     headers={"X-Service-Key": "wrong"}).status_code, 401)
        self.assertEqual(self.c.get("/api/lots").json["lots"], [])  # the fake lot was never registered


if __name__ == "__main__":
    unittest.main()
