"""SQLite data layer for ONE parking lot. This database is the single source of truth for the lot.

Reservation safety has three layers:
  1. every reservation runs inside BEGIN IMMEDIATE, so writers are serialised by SQLite's write lock;
  2. the overlap check happens inside that same transaction;
  3. a BEFORE INSERT trigger rejects any overlapping active reservation, as a database-level safety net.
Each reservation request carries a unique request_id (UNIQUE column), which makes retries idempotent.
"""
import json
import sqlite3
import time
import uuid
from contextlib import contextmanager

SCHEMA = """
CREATE TABLE IF NOT EXISTS spaces (
    id          TEXT PRIMARY KEY,
    occupied    INTEGER NOT NULL DEFAULT 0,
    updated_at  REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS reservations (
    id             TEXT PRIMARY KEY,
    request_id     TEXT NOT NULL UNIQUE,
    space_id       TEXT NOT NULL REFERENCES spaces(id),
    driver         TEXT NOT NULL,
    start_ts       REAL NOT NULL,
    end_ts         REAL NOT NULL,
    status         TEXT NOT NULL DEFAULT 'active',
    price_per_hour REAL NOT NULL,
    total_price    REAL NOT NULL,
    created_at     REAL NOT NULL,
    CHECK (end_ts > start_ts)
);
CREATE INDEX IF NOT EXISTS idx_res_space ON reservations(space_id, status, start_ts, end_ts);
CREATE TABLE IF NOT EXISTS events (
    seq         INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,
    payload     TEXT NOT NULL,
    created_at  REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS reservations_no_overlap
BEFORE INSERT ON reservations
WHEN NEW.status = 'active'
BEGIN
    SELECT RAISE(ABORT, 'overlapping reservation')
    WHERE EXISTS (
        SELECT 1 FROM reservations r
        WHERE r.space_id = NEW.space_id AND r.status = 'active'
          AND NEW.start_ts < r.end_ts AND NEW.end_ts > r.start_ts
    );
END;
"""


@contextmanager
def connection(path):
    conn = sqlite3.connect(path, timeout=30, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
    finally:
        conn.close()


def init_db(path, capacity):
    import os
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with connection(path) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        have = conn.execute("SELECT COUNT(*) FROM spaces").fetchone()[0]
        for n in range(have + 1, capacity + 1):
            conn.execute("INSERT INTO spaces(id, occupied, updated_at) VALUES (?, 0, ?)", (f"S{n:02d}", time.time()))


def log_event(conn, etype, payload, now):
    conn.execute("INSERT INTO events(type, payload, created_at) VALUES (?, ?, ?)", (etype, json.dumps(payload), now))


# ---------------------------------------------------------------- reads
_RESERVED_NOW = (
    "EXISTS (SELECT 1 FROM reservations r WHERE r.space_id = s.id AND r.status = 'active' "
    "AND r.start_ts <= :now AND r.end_ts > :now)"
)


def snapshot(conn, now):
    total = conn.execute("SELECT COUNT(*) FROM spaces").fetchone()[0]
    row = conn.execute(
        f"""SELECT
              SUM(CASE WHEN s.occupied = 1 THEN 1 ELSE 0 END) AS occupied,
              SUM(CASE WHEN s.occupied = 0 AND {_RESERVED_NOW} THEN 1 ELSE 0 END) AS reserved
            FROM spaces s""",
        {"now": now},
    ).fetchone()
    occupied = row["occupied"] or 0
    reserved = row["reserved"] or 0
    free = total - occupied - reserved
    return {
        "total": total,
        "occupied": occupied,
        "reserved": reserved,
        "free": free,
        "occupancy": round((total - free) / total, 4) if total else 0.0,
    }


def space_states(conn, now):
    rows = conn.execute(
        f"""SELECT s.id, s.occupied, s.updated_at, {_RESERVED_NOW} AS reserved_now,
                   (SELECT MIN(r.start_ts) FROM reservations r
                     WHERE r.space_id = s.id AND r.status = 'active' AND r.start_ts > :now) AS next_start
            FROM spaces s ORDER BY s.id""",
        {"now": now},
    ).fetchall()
    out = []
    for r in rows:
        state = "occupied" if r["occupied"] else ("reserved" if r["reserved_now"] else "free")
        out.append({"id": r["id"], "state": state, "occupied": bool(r["occupied"]),
                    "next_reservation_start": r["next_start"], "updated_at": r["updated_at"]})
    return out


def row_to_reservation(row):
    return {k: row[k] for k in row.keys()}


def list_reservations(conn, space_id=None, include_cancelled=False):
    q = "SELECT * FROM reservations WHERE 1=1"
    args = []
    if space_id:
        q += " AND space_id = ?"
        args.append(space_id)
    if not include_cancelled:
        q += " AND status = 'active'"
    q += " ORDER BY start_ts"
    return [row_to_reservation(r) for r in conn.execute(q, args).fetchall()]


def get_reservation(conn, rid):
    r = conn.execute("SELECT * FROM reservations WHERE id = ?", (rid,)).fetchone()
    return row_to_reservation(r) if r else None


# ---------------------------------------------------------------- writes
def set_occupied(conn, space_id, occupied, now, source="sensor"):
    """Apply a sensor reading. Returns None if the space is unknown, else {'changed': bool}."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        row = conn.execute("SELECT occupied FROM spaces WHERE id = ?", (space_id,)).fetchone()
        if row is None:
            conn.execute("ROLLBACK")
            return None
        changed = bool(row["occupied"]) != bool(occupied)
        if changed:
            conn.execute("UPDATE spaces SET occupied = ?, updated_at = ? WHERE id = ?",
                         (1 if occupied else 0, now, space_id))
            log_event(conn, "sensor", {"space_id": space_id, "occupied": bool(occupied), "source": source}, now)
        conn.execute("COMMIT")
        return {"changed": changed}
    except Exception:
        conn.execute("ROLLBACK")
        raise


def create_reservation(conn, *, request_id, space_id, driver, start, end, now, price_fn, max_hours=12.0):
    """Create a reservation atomically.

    Returns (outcome, data) where outcome is one of:
      'created', 'duplicate' (same request_id seen before), 'conflict', 'invalid', 'not_found'.
    """
    conn.execute("BEGIN IMMEDIATE")
    try:
        existing = conn.execute("SELECT * FROM reservations WHERE request_id = ?", (request_id,)).fetchone()
        if existing is not None:
            conn.execute("ROLLBACK")
            return "duplicate", row_to_reservation(existing)

        if not driver or not isinstance(driver, str):
            conn.execute("ROLLBACK")
            return "invalid", {"error": "driver name is required"}
        if end <= start:
            conn.execute("ROLLBACK")
            return "invalid", {"error": "end must be after start"}
        if (end - start) > max_hours * 3600:
            conn.execute("ROLLBACK")
            return "invalid", {"error": f"reservations are limited to {max_hours:g} hours"}
        if end <= now:
            conn.execute("ROLLBACK")
            return "invalid", {"error": "reservation window is in the past"}
        if start < now - 60:
            conn.execute("ROLLBACK")
            return "invalid", {"error": "start time is in the past"}

        includes_now = start <= now < end
        if space_id:
            sp = conn.execute("SELECT id, occupied FROM spaces WHERE id = ?", (space_id,)).fetchone()
            if sp is None:
                conn.execute("ROLLBACK")
                return "not_found", {"error": f"unknown space {space_id}"}
            if includes_now and sp["occupied"]:
                conn.execute("ROLLBACK")
                return "conflict", {"error": f"space {space_id} is currently occupied", "reason": "occupied"}
            clash = conn.execute(
                "SELECT 1 FROM reservations WHERE space_id = ? AND status = 'active' "
                "AND ? < end_ts AND ? > start_ts LIMIT 1", (space_id, start, end)).fetchone()
            if clash:
                conn.execute("ROLLBACK")
                return "conflict", {"error": f"space {space_id} is already reserved for that time", "reason": "overlap"}
            chosen = space_id
        else:
            row = conn.execute(
                """SELECT s.id FROM spaces s
                   WHERE NOT EXISTS (SELECT 1 FROM reservations r WHERE r.space_id = s.id
                                     AND r.status = 'active' AND ? < r.end_ts AND ? > r.start_ts)
                     AND (? = 0 OR s.occupied = 0)
                   ORDER BY s.id LIMIT 1""", (start, end, 1 if includes_now else 0)).fetchone()
            if row is None:
                conn.execute("ROLLBACK")
                return "conflict", {"error": "no space is free for that time window", "reason": "full"}
            chosen = row["id"]

        snap = snapshot(conn, now)
        pph = price_fn(snap)
        total = round(pph * (end - start) / 3600.0, 2)
        rid = uuid.uuid4().hex[:12]
        conn.execute(
            "INSERT INTO reservations(id, request_id, space_id, driver, start_ts, end_ts, status, "
            "price_per_hour, total_price, created_at) VALUES (?,?,?,?,?,?, 'active', ?,?,?)",
            (rid, request_id, chosen, driver, start, end, pph, total, now))
        log_event(conn, "reservation_created",
                  {"reservation_id": rid, "space_id": chosen, "start": start, "end": end}, now)
        created = row_to_reservation(conn.execute("SELECT * FROM reservations WHERE id = ?", (rid,)).fetchone())
        conn.execute("COMMIT")
        return "created", created
    except sqlite3.IntegrityError:
        # The trigger (or UNIQUE request_id) fired: someone else won the race.
        conn.execute("ROLLBACK")
        existing = conn.execute("SELECT * FROM reservations WHERE request_id = ?", (request_id,)).fetchone()
        if existing is not None:
            return "duplicate", row_to_reservation(existing)
        return "conflict", {"error": "space was reserved by another request", "reason": "overlap"}
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except sqlite3.Error:
            pass
        raise


def cancel_reservation(conn, rid, now):
    conn.execute("BEGIN IMMEDIATE")
    try:
        row = conn.execute("SELECT * FROM reservations WHERE id = ?", (rid,)).fetchone()
        if row is None:
            conn.execute("ROLLBACK")
            return "not_found", None
        if row["status"] != "active":
            conn.execute("ROLLBACK")
            return "already_cancelled", row_to_reservation(row)
        conn.execute("UPDATE reservations SET status = 'cancelled' WHERE id = ?", (rid,))
        log_event(conn, "reservation_cancelled", {"reservation_id": rid, "space_id": row["space_id"]}, now)
        conn.execute("COMMIT")
        return "cancelled", row_to_reservation(conn.execute("SELECT * FROM reservations WHERE id = ?", (rid,)).fetchone())
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except sqlite3.Error:
            pass
        raise


# ---------------------------------------------------------------- outbox (events not yet acknowledged by the coordinator)
def pending_events(conn, after_seq, limit=500):
    rows = conn.execute("SELECT seq, type, payload, created_at FROM events WHERE seq > ? ORDER BY seq LIMIT ?",
                        (after_seq, limit)).fetchall()
    return [{"seq": r["seq"], "type": r["type"], "payload": json.loads(r["payload"]), "created_at": r["created_at"]}
            for r in rows]


def latest_seq(conn):
    return conn.execute("SELECT COALESCE(MAX(seq), 0) FROM events").fetchone()[0]


def get_acked_seq(conn):
    row = conn.execute("SELECT value FROM meta WHERE key = 'acked_seq'").fetchone()
    return int(row["value"]) if row else 0


def set_acked_seq(conn, seq):
    conn.execute("INSERT INTO meta(key, value) VALUES ('acked_seq', ?) "
                 "ON CONFLICT(key) DO UPDATE SET value = excluded.value", (str(int(seq)),))
