"""Driver / admin authentication for the coordinator.

* Accounts live in the coordinator's own SQLite database. Passwords are stored only as salted
  hashes (werkzeug.security, scrypt/pbkdf2), never in plain text.
* Logging in returns a signed, time-limited token (itsdangerous.URLSafeTimedSerializer). The token
  carries the user id and is verified on every request with the server's secret, so it cannot be
  forged or altered; the user's current role is re-read from the database each time.
* Repeated wrong passwords lock the username for a short time (basic brute-force protection).
"""
import os
import re
import secrets
import sqlite3
import threading
import time
from contextlib import contextmanager
from functools import wraps

from flask import g, jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

ROLES = ("driver", "admin")
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
MIN_PASSWORD_LEN = 8
MAX_PASSWORD_LEN = 128
DEFAULT_TOKEN_TTL = 8 * 3600          # seconds a login stays valid
MAX_FAILED_LOGINS = 5
LOCKOUT_SECONDS = 30
# Development fallback for the seeded admin account. Set GEOPARK_ADMIN_PASSWORD in any real deployment.
DEV_ADMIN_USER = "admin"
DEV_ADMIN_PASSWORD = "geopark-admin"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('driver', 'admin')),
    created_at    REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


class AuthError(Exception):
    pass


def public_user(user):
    return {"id": user["id"], "username": user["username"], "role": user["role"]}


def owner_tag(user):
    """The unforgeable owner id stored on a lot's reservation (display names are not unique enough)."""
    return f"user:{user['id']}"


def validate_credentials(username, password):
    """Returns an error message, or None if the username/password are acceptable for registration."""
    if not isinstance(username, str) or not USERNAME_RE.match(username):
        return "username must be 3-32 characters: letters, digits, '.', '_' or '-'"
    if not isinstance(password, str) or not (MIN_PASSWORD_LEN <= len(password) <= MAX_PASSWORD_LEN):
        return f"password must be {MIN_PASSWORD_LEN}-{MAX_PASSWORD_LEN} characters"
    return None


class UserStore:
    def __init__(self, path):
        self.path = path
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with self._conn() as conn:
            conn.executescript(SCHEMA)
        # A hash to check against when the username does not exist, so a login for an unknown
        # user takes as long as one for a real user (no username probing by timing).
        self._dummy_hash = generate_password_hash(secrets.token_hex(16))

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.path, timeout=30)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def signing_secret(self):
        """Random secret generated once and kept in the database, so logins survive a restart."""
        env = os.environ.get("GEOPARK_SECRET")
        if env:
            return env
        with self._conn() as conn:
            conn.execute("INSERT OR IGNORE INTO meta(key, value) VALUES ('signing_secret', ?)",
                         (secrets.token_hex(32),))
            return conn.execute("SELECT value FROM meta WHERE key = 'signing_secret'").fetchone()["value"]

    def create(self, username, password, role="driver"):
        """Returns the new user, or None if the username is taken."""
        if role not in ROLES:
            raise ValueError(f"unknown role {role}")
        try:
            with self._conn() as conn:
                cur = conn.execute(
                    "INSERT INTO users(username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
                    (username, generate_password_hash(password), role, time.time()))
                return self.get(cur.lastrowid, conn)
        except sqlite3.IntegrityError:
            return None

    def get(self, uid, conn=None):
        if conn is None:
            with self._conn() as c:
                return self.get(uid, c)
        row = conn.execute("SELECT id, username, role, password_hash FROM users WHERE id = ?", (uid,)).fetchone()
        return dict(row) if row else None

    def verify(self, username, password):
        """Returns the user if the password is right, else None."""
        with self._conn() as conn:
            row = conn.execute("SELECT id, username, role, password_hash FROM users WHERE username = ?",
                               (username or "",)).fetchone()
        if row is None:
            check_password_hash(self._dummy_hash, password or "")
            return None
        return dict(row) if check_password_hash(row["password_hash"], password or "") else None

    def ensure_admin(self, username, password):
        with self._conn() as conn:
            exists = conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
        if not exists:
            self.create(username, password, role="admin")


class LoginThrottle:
    """Locks a username for LOCKOUT_SECONDS after MAX_FAILED_LOGINS wrong passwords in a row."""

    def __init__(self, max_failures=MAX_FAILED_LOGINS, lockout=LOCKOUT_SECONDS):
        self.max_failures, self.lockout = max_failures, lockout
        self._state = {}
        self._lock = threading.Lock()

    def retry_after(self, username):
        with self._lock:
            _, until = self._state.get(username.lower(), (0, 0.0))
        return max(0.0, until - time.time())

    def failed(self, username):
        with self._lock:
            fails, _ = self._state.get(username.lower(), (0, 0.0))
            fails += 1
            until = time.time() + self.lockout if fails >= self.max_failures else 0.0
            self._state[username.lower()] = (0 if until else fails, until)

    def succeeded(self, username):
        with self._lock:
            self._state.pop(username.lower(), None)


class Auth:
    def __init__(self, store: UserStore, token_ttl: float = DEFAULT_TOKEN_TTL):
        self.store = store
        self.token_ttl = token_ttl
        self.throttle = LoginThrottle()
        self._signer = URLSafeTimedSerializer(store.signing_secret(), salt="geopark-auth-v1")

    def issue_token(self, user):
        return self._signer.dumps({"uid": user["id"]})

    def user_from_token(self, token):
        try:
            claims = self._signer.loads(token, max_age=self.token_ttl)
        except SignatureExpired:
            raise AuthError("your session has expired - please log in again")
        except BadSignature:
            raise AuthError("invalid login token")
        user = self.store.get(claims.get("uid"))
        if user is None:
            raise AuthError("account no longer exists")
        return user

    def required(self, *roles):
        """Decorator: the request must carry a valid 'Authorization: Bearer <token>' (and one of `roles`)."""
        def deco(fn):
            @wraps(fn)
            def wrapper(*args, **kwargs):
                header = request.headers.get("Authorization", "")
                if not header.startswith("Bearer ") or not header[7:].strip():
                    return jsonify(error="please log in first", reason="unauthenticated"), 401
                try:
                    user = self.user_from_token(header[7:].strip())
                except AuthError as exc:
                    return jsonify(error=str(exc), reason="unauthenticated"), 401
                if roles and user["role"] not in roles:
                    return jsonify(error="you do not have permission to do that", reason="forbidden"), 403
                g.user = user
                return fn(*args, **kwargs)
            return wrapper
        return deco
