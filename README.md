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

Requirements: Python 3.10+, Node 18+.

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
python -m unittest discover -s tests -t . -v     # 34 tests: unit, concurrency, end-to-end
python tools/evaluate.py                          # writes results/evaluation.md + .json for the report
```

Ports: coordinator 8000, lots 8101-8104 (see `config/lots.json`), UI 5173.

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

## REST API

Coordinator (what the UI uses):

| Method & path | Purpose |
|---|---|
| `GET /api/lots` | all lots with free count, price, per-space state, `status` live/stale, `age_seconds` |
| `GET /api/recommend?lat&lng&priority&preferred&hours` | ranked lots; `priority` = balanced, cheapest, closest, availability |
| `POST /api/reservations` | `{lot_id, driver, start, end, space_id?, request_id?}` (epoch seconds) -> 201 / 200 duplicate / 409 conflict / 503 lot unreachable |
| `DELETE /api/lots/<id>/reservations/<rid>` | cancel |
| `GET /api/log` | activity log (registrations, stale, reconnects, bookings) |
| `POST /api/admin/lots/<id>/partition` `{on}` | demo: cut/restore lot's link |
| `POST /api/admin/lots/<id>/spaces/<space>` `{occupied}` | demo: set a sensor |
| `POST /api/admin/sim` `{hour, running}` | demo: set simulated clock |
| `POST /internal/report` | lots -> coordinator heartbeat (not for drivers) |

Each lot also serves `/status`, `/spaces`, `/reservations`, `/health` directly (see `lot_service/app.py`).

## Demo script (about 8 minutes)

1. **Live data.** Start everything; show four lots filling/emptying; point at "Live - updated 1s ago".
2. **Recommendation.** Preferred lot = Campus North, priority "Closest". In Demo controls press
   *Fill lot* on Campus North -> banner says it is full and suggests the next best lot.
3. **Pricing.** Demo controls: pin time to 08:30 (peak) vs 03:00; show price changes; fill a lot and watch
   the price climb, capped at its max.
4. **Conflict prevention.** In a terminal: run the concurrency demo below; show exactly one 201.
5. **Failure.** Cut the link for one lot: after ~6 s its card gets the hazard stripe + "Stale", the others
   stay live, a booking attempt there returns the unreachable message with alternatives. While cut, book
   at the lot directly (command below) and flip a sensor. Restore the link: the activity log shows
   "caught up on N missed update(s)".
6. **Scalability.** `python tools/add_lot.py` - a fifth lot appears with no coordinator change.
7. **Results.** Show `results/evaluation.md`.

Concurrency demo (50 simultaneous requests for one space):

```bash
python - <<'PY'
import requests, threading, time
from collections import Counter
now, codes = time.time(), []
def go(i):
    r = requests.post("http://127.0.0.1:8000/api/reservations", json={"lot_id": "downtown", "space_id": "S01",
        "driver": f"driver{i}", "start": now + 60, "end": now + 3600}); codes.append(r.status_code)
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
coordinator/   app.py (API + relay) ranking.py (scoring) state.py (lot registry, staleness)
lot_service/   app.py (API) db.py (SQLite + reservation logic) pricing.py sensors.py reporter.py simclock.py
frontend/      React + TypeScript + Tailwind (Vite)
tests/         unit, concurrency and end-to-end tests
tools/         stack.py (process launcher) evaluate.py add_lot.py
config/lots.json   the predefined lots
results/       evaluation output
```

## Configuration

Lots are configured with environment variables (`LOT_ID`, `LOT_NAME`, `LOT_PORT`, `LOT_CAPACITY`,
`LOT_BASE_PRICE`, `LOT_MIN_PRICE`, `LOT_MAX_PRICE`, `COORDINATOR_URL`, `HEARTBEAT_INTERVAL`, `SENSORS`,
`SIM_RATE`, ...; see `lot_service/config.py`). Coordinator: `COORD_PORT`, `STALE_AFTER`,
`FORWARD_TIMEOUT`, `FORWARD_RETRIES`. Frontend: `VITE_API_URL` if the coordinator is not on localhost:8000.

## Known limitations (be upfront about these in the report)

* Prototype scope, as proposed: simulated sensors, no real payments, no authentication/authorization.
  The `/admin` endpoints are unauthenticated demo controls. Mention as future work (security was one of
  the course's concerns).
* The coordinator is a single instance with in-memory state (it rebuilds itself from lot heartbeats after a
  restart, but is a single point of failure for *new* searches). Future work: replicate it.
* Flask's built-in threaded server is used; fine for the demo, use a production WSGI server otherwise.
* Reservations are relayed via the coordinator; a lot that is cut off cannot be booked through it (by
  design - it fails safely with alternatives).
