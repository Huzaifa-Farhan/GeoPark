# GeoPark - Distributed Smart Parking System

SOFE4790U Distributed Systems, Group 5 (Huzaifa Farhan, Anas Jamil, Bilal Brohi, Essa Sadat).

Each parking lot is its own service that owns its inventory, simulated sensors and reservations. A
coordination service collects what the lots report, ranks them for drivers and relays reservation
requests - but **never decides whether a space is available; the owning lot does**. A React
interface talks only to the coordinator.

```
 React UI  --->  Coordinator (Flask, :8000)  --->  Lot services (Flask + SQLite, :8101..)
 (drivers)       lot copy, ranking, relay          own data, sensors, pricing, reservations
                       ^                                     |
                       +------- heartbeat + events ----------+
```

## Quick start

Requirements: Python 3.10+, Node 18+. On Windows, if `python` is not found use `py` instead
(e.g. `py run_all.py --reset`).

```bash
# 1. backend (coordinator + 4 lots, each its own process)
pip install -r requirements.txt
python run_all.py --reset

# 2. frontend (second terminal)
cd frontend
npm install
npm run dev          # open http://localhost:5173
```

Run the tests and evaluation (no frontend needed):

```bash
python -m unittest discover -s tests -t . -v     # 52 tests: unit, security, concurrency, end-to-end
python tools/evaluate.py                          # writes results/evaluation.md + .json for the report
```

Ports: coordinator 8000, lots 8101-8104 (see `config/lots.json`), UI 5173.

Accounts: drivers register themselves (`POST /api/auth/register`). The demo controls need the admin
account: user `admin`, password `geopark-admin` unless `GEOPARK_ADMIN_PASSWORD` is set. Change the
defaults (see *Security*) for anything beyond a local demo.

The frontend follows the GeoPark brand kit (`frontend/public/brand/GeoPark-Brand-Guidelines.md`). Pages: the
public landing page (`/`, information and live status only), *Log in* / *Create an account* (`#/login`,
`#/register`), *Book parking* (`#/book`: finder, every bay in each lot, price breakdown, reserve), *My
reservations* (`#/reservations`) and the operator *Control room* (`#/admin`, admin accounts only - every
demo/admin control lives here). The screenshots in `docs/screenshots/` show the previous UI.

## Course requirements -> where they are met

| Requirement (Smart Parking System) | How GeoPark meets it | Where to look |
|---|---|---|
| **Simulate IoT sensors to monitor parking space availability in real time** | Every bay of every lot has a simulated occupancy sensor (`SensorSimulator`), busier around the simulated rush hours. Each reading is written to the lot's own SQLite DB and streamed to the coordinator within ~2 s. Drivers see live availability on the map and in the finder; operators see a **bay map**, a **live sensor feed** and occupancy **trend charts** in the Control room. | `lot_service/sensors.py`, `GET /api/feed`, `GET /api/history`; UI: live pins on the landing map; *Book parking* -> bay map with parked cars; *Control room* -> *Live sensor feed*, *Trends* |
| **Interface for drivers to find and reserve parking spaces** | Search by name or neighbourhood, distance from downtown or your location, sort by best overall / closest / cheapest / most spaces (the coordinator's ranking), a banner with the best alternative when the selected lot is full, map pins, optional bay choice, arrival time and stay length, cancel. Reserving needs an account. | `coordinator/ranking.py`, `POST /api/reservations`; UI: *Book parking* finder and bay map, reservation dialog, *My reservations* |
| **Dynamic pricing based on demand and peak hours** | `price = base x peak-hour factor x occupancy factor`, clamped to the lot's min/max. Peaks at simulated 08:30 and 17:30. Drivers see the rate before reserving and the lot confirms the final rate; the Book page shows the simulated time, a *Peak pricing* badge and each lot's price breakdown. The Control room also explains each price factor by factor, forecasts it over 24 h (rush hours shaded) and charts each lot's live rate. | `lot_service/pricing.py`, `GET /api/pricing`; UI: *Book parking* -> *Why it costs ...*; *Control room* -> *Trends* |

UI identity: GeoPark brand kit - wayfinding blue `#174BE8`, city ink `#172D28`, chalk `#F5F6F2`, park lime
`#DFEFB7`, DM Sans. Status colours (available / attention / error) always come with a text label.

## What is implemented (maps to the approved proposal)

| Proposal feature | Where |
|---|---|
| Independent lot services, each with its own SQLite DB | `lot_service/`, `data/<lot>.db` |
| Simulated IoT sensors | `lot_service/sensors.py` (busier at simulated rush hours) |
| Live availability with last-update time | lot -> `/internal/report` -> coordinator; UI shows age + Live/Stale |
| Cooperative recommendations (capacity, simulated travel cost, price, preferences) | `coordinator/ranking.py`, `GET /api/recommend` |
| Alternative suggested when preferred lot is full | `preferred_full` + banner; also attached to conflict/unreachable replies |
| Demand-aware pricing, clamped min/max, simulated time of day | `lot_service/pricing.py`, `simclock.py` |
| Reservation conflict prevention | `lot_service/db.py`: `BEGIN IMMEDIATE` + overlap check + DB trigger |
| Safe retries (unique request id) | `request_id UNIQUE`; duplicate returns the original booking |
| Lost connection: lot keeps working, data shown as stale, catch-up on return | `ctx.partitioned`, outbox of events, `Registry` stale detection |
| Adding lots (scalability) | `python tools/add_lot.py` - new lot self-registers |
| Authentication and authorization (drivers, admin, services) | `coordinator/auth.py`, `shared/security.py` - see *Security* |
| REST + JSON, Python/Flask, React + TS + Tailwind, SQLite | whole repo |

## Key design decisions (useful for the report and Q&A)

* **One owner per piece of data.** The lot DB is authoritative; the coordinator's copy may lag, so
  every figure carries a timestamp.
* **Reservation safety in three layers.** (1) `BEGIN IMMEDIATE` serialises writers, (2) the overlap
  check runs inside that transaction, (3) a `BEFORE INSERT` trigger rejects overlaps even if the
  application check were bypassed (tested directly).
* **Idempotency.** Every booking carries a `request_id`; a retry after a timeout returns the original
  reservation instead of creating another. The coordinator retries only on network errors.
* **Heartbeats, not silence.** Lots report every 2 s even when nothing changed. No report for 6 s
  (`STALE_AFTER`) -> the lot is flagged stale, not hidden.
* **Outbox / catch-up.** State changes are written to an `events` table in the lot DB in the same
  transaction as the change. The coordinator acknowledges the highest sequence number it applied;
  unacknowledged events are re-sent, so a lot that was cut off (or a coordinator that restarted)
  converges without losing updates. Reports also include the full snapshot, so the coordinator state is
  always self-healing.
* **Graceful degradation.** A dead/cut-off lot affects only itself. Other lots stay live; a failed
  reservation returns HTTP 503 with ranked alternatives; the cut-off lot still accepts bookings made
  directly at it (simulating an on-site kiosk) and keeps its sensors running.
* **Time.** Pricing uses a simulated clock (default 1 real second = 4 simulated minutes) derived from
  wall-clock time, so lots agree without coordinating. The demo panel can pin or move it.

## Security

Two layers, using only libraries that ship with Flask (Werkzeug, itsdangerous):

* **Users (drivers and admins).** Accounts live in the coordinator's own SQLite DB (`data/coordinator.db`).
  Passwords are stored only as salted hashes (`werkzeug.security`). Logging in returns a signed, expiring
  token (`itsdangerous.URLSafeTimedSerializer`, 8 h by default) that the client sends as
  `Authorization: Bearer <token>`. The token cannot be forged or edited without the server's secret, and the
  user's role is re-read from the DB on every request. Five wrong passwords in a row lock the username for
  30 s; wrong password and unknown user give the same answer (no username probing).
* **Authorization rules.** Browsing lots, recommendations and pricing is public. Reserving, cancelling and
  `GET /api/me/reservations` need a login. A booking is always made as the logged-in user (the request body
  cannot name another driver), each reservation stores an unforgeable owner (`user:<id>`), and only its owner
  or an admin can cancel it. Retry ids are scoped per user, so one user cannot replay another's id. Demo
  controls (`/api/admin/*`) and listing a lot's reservations are admin-only. Self-registration always creates
  a driver.
* **Services (lots <-> coordinator).** All components share a secret (`GEOPARK_SERVICE_KEY`) sent as
  `X-Service-Key` and compared in constant time. Without it nobody can push a fake lot report to
  `/internal/report`, read or cancel reservations at a lot, or use a lot's `/admin/*` endpoints. The on-site
  kiosk path stays open on purpose: anyone at the lot can check availability and make a booking (with no
  owner, so it cannot be tied to a user account).

| Setting | Default (demo only) |
|---|---|
| `GEOPARK_SERVICE_KEY` | `geopark-dev-service-key-change-me` |
| `GEOPARK_ADMIN_USER` / `GEOPARK_ADMIN_PASSWORD` | `admin` / `geopark-admin` (created on first start) |
| `GEOPARK_SECRET` | random, generated once and kept in `data/coordinator.db` (logins survive restarts) |
| `TOKEN_TTL` | `28800` seconds |

While a default is in use the coordinator writes a warning to the activity log.

## REST API

Coordinator (what the UI uses). Auth column: - public, **user** any logged-in account, **admin** admin
account, **service** `X-Service-Key`.

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/auth/register` | - | `{username, password}` -> 201 `{token, user}` / 400 invalid / 409 taken |
| `POST /api/auth/login` | - | `{username, password}` -> 200 `{token, user}` / 401 / 429 locked |
| `GET /api/auth/me` | user | the logged-in account |
| `GET /api/lots` | - | all lots with free count, price, per-space state, `status` live/stale, `age_seconds` |
| `GET /api/recommend?lat&lng&priority&preferred&hours` | - | ranked lots; `priority` = balanced, cheapest, closest, availability |
| `POST /api/reservations` | user | `{lot_id, start, end, space_id?, request_id?}` (epoch seconds) -> 201 / 200 duplicate / 409 conflict / 503 lot unreachable |
| `GET /api/me/reservations` | user | your active reservations across all lots (`unreachable_lots` lists lots that did not answer) |
| `DELETE /api/lots/<id>/reservations/<rid>` | user | cancel (owner or admin only, else 403) |
| `GET /api/lots/<id>/reservations` | admin | every reservation at a lot |
| `GET /api/log` | - | activity log (registrations, stale, reconnects, bookings) |
| `GET /api/feed?limit` | - | live IoT feed: recent sensor readings and booking events received from the lots' outboxes |
| `GET /api/history` | - | per-lot occupancy / price samples (about the last 6 min) for the trend charts |
| `GET /api/pricing` | - | per-lot price breakdown (base, peak-hour factor, occupancy factor, clamp) + 24 h forecast |
| `POST /api/admin/lots/<id>/partition` `{on}` | admin | demo: cut/restore lot's link |
| `POST /api/admin/lots/<id>/spaces/<space>` `{occupied}` | admin | demo: set a sensor (a bay set occupied stays occupied until set free) |
| `POST /api/admin/sim` `{hour, running}` | admin | demo: set simulated clock |
| `POST /internal/report` | service | lots -> coordinator heartbeat (not for drivers) |

Each lot also serves `/health`, `/status`, `/spaces` and `POST /reservations` to anyone (the on-site kiosk), and
`GET /reservations`, `GET/DELETE /reservations/<rid>` and `/admin/*` to services only (see `lot_service/app.py`).

## Demo script (about 8 minutes)

0. **Accounts.** Create a driver account from *Log in -> Create an account*; reserve a space and show it in
   *My reservations*. Log in as `admin` in a second browser (or after signing out) for the *Control room*.
1. **Live data.** Start everything; show the landing page map pins updating, the bays on the Book page, and in the Control room the
   live sensor feed and "Live · just now" link status.
2. **Recommendation.** On *Book parking* select Campus North, sort "Closest". In the Control room press *Fill lot*
   on Campus North -> on the Book page a banner says it is full and suggests the next best lot.
3. **Pricing.** Control room clock: pin 08:30 (peak) vs 03:00; the Book page badge shows "Peak pricing" and the
   price breakdown's time-of-day factor turns amber. Fill a lot and watch the occupancy factor and price
   climb, capped at its max (the panel says "Held at the maximum").
4. **Conflict prevention.** In a terminal: run the concurrency demo below; show exactly one 201.
5. **Failure.** In the Control room cut a lot's link: after ~6 s the landing page network diagram and the
   Book page show it as "Stale" / "Temporarily unavailable", the others stay live, a booking attempt there returns the unreachable message with alternatives. While cut, book
   at the lot directly (command below) and flip a sensor. Restore the link: the activity log shows
   "caught up on N missed update(s)".
6. **Scalability.** `python tools/add_lot.py` - a fifth lot appears with no coordinator change.
7. **Results.** Show `results/evaluation.md`.

Concurrency demo (50 simultaneous requests for one space):

```bash
python - <<'PY'
import requests, threading, time
from collections import Counter
api = "http://127.0.0.1:8000"
requests.post(f"{api}/api/auth/register", json={"username": "demo-driver", "password": "password123"})
token = requests.post(f"{api}/api/auth/login", json={"username": "demo-driver", "password": "password123"}).json()["token"]
auth = {"Authorization": f"Bearer {token}"}
now, codes = time.time(), []
def go(i):
    r = requests.post(f"{api}/api/reservations", headers=auth, json={"lot_id": "downtown", "space_id": "S01",
        "start": now + 60, "end": now + 3600}); codes.append(r.status_code)
ts = [threading.Thread(target=go, args=(i,)) for i in range(50)]
[t.start() for t in ts]; [t.join() for t in ts]
print(Counter(codes))      # expect {201: 1, 409: 49}
PY
```

Direct booking at a cut-off lot (simulated on-site kiosk, no coordinator involved):

```bash
python - <<'PY'
import requests, time
n = time.time()
print(requests.post("http://127.0.0.1:8103/reservations",
      json={"driver": "kiosk", "start": n + 30, "end": n + 900}).json())
PY
```

## Project layout

```
coordinator/   app.py (API + relay) auth.py (accounts, tokens) ranking.py (scoring) state.py (lot registry, staleness)
shared/        security.py (service key shared by all components)
lot_service/   app.py (API) db.py (SQLite + reservation logic) pricing.py sensors.py reporter.py simclock.py
frontend/      React 19 + TypeScript + Tailwind 4 (Vite 6), Lucide icons, SVG charts; logos and fonts in public/
tests/         unit, concurrency and end-to-end tests
tools/         stack.py (process launcher) evaluate.py add_lot.py
config/lots.json   the predefined lots
results/       evaluation output
```

## Configuration

Lots are configured with environment variables (`LOT_ID`, `LOT_NAME`, `LOT_PORT`, `LOT_CAPACITY`,
`LOT_BASE_PRICE`, `LOT_MIN_PRICE`, `LOT_MAX_PRICE`, `COORDINATOR_URL`, `HEARTBEAT_INTERVAL`, `SENSORS`,
`SIM_RATE`, ...; see `lot_service/config.py`). Coordinator: `COORD_PORT`, `STALE_AFTER`,
`FORWARD_TIMEOUT`, `FORWARD_RETRIES`. Frontend: `VITE_API_URL` if the coordinator is not on localhost:8000. The map is an illustrative schematic (pins placed from each lot's real coordinates), so the UI needs no internet access.

## Known limitations (be upfront about these in the report)

* Prototype scope, as proposed: simulated sensors, no real payments.
* Security is basic (see *Security*): traffic is plain HTTP, so tokens and the service key could be read on
  the network - a deployment would put everything behind HTTPS/TLS (or mutual TLS between services). The
  service key is one shared secret for all components; per-lot keys or certificates would limit the damage
  if one lot were compromised. Tokens cannot be revoked before they expire (no logout list). The kiosk
  booking path at each lot is open by design.
* The coordinator is a single instance with in-memory state (it rebuilds itself from lot heartbeats after a
  restart, but is a single point of failure for *new* searches). Future work: replicate it.
* Flask's built-in threaded server is used; fine for the demo, use a production WSGI server otherwise.
* Reservations are relayed via the coordinator; a lot that is cut off cannot be booked through it (by
  design - it fails safely with alternatives).
