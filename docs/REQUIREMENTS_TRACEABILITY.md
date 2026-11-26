# Project requirements -> evidence

| Requirement | Evidence in code | Evidence in UI | Test |
|---|---|---|---|
| Simulate IoT sensors to monitor space availability in real time | `lot_service/sensors.py`, events outbox in `db.py`, `GET /api/feed` | Live sensor feed, live map, lot gauges, bay map, *Occupancy by lot* chart | `test_integration.py::test_09` |
| Interface for drivers to find and reserve spaces | `coordinator/ranking.py`, `POST /api/reservations` | Find parking, recommendations, map pins, Reserve a bay, Your reservations | `test_ranking.py`, `test_reservations.py`, `test_integration.py` |
| Dynamic pricing on demand and peak hours | `lot_service/pricing.py`, `GET /api/pricing` | Pricing engine breakdown, 24 h forecast, *Hourly rate by lot*, Peak badge | `test_pricing.py`, `test_integration.py::test_09` |

# Course concepts -> where they show up in GeoPark

| Distributed-systems concept (project info sheet) | How GeoPark demonstrates it | Evidence |
|---|---|---|
| Functional separation | Lot services vs. coordinator vs. UI, each with one job | architecture, `coordinator/`, `lot_service/` |
| Inherent distribution / data ownership | Each lot has its own DB and is the sole authority for its spaces | `data/*.db`, `db.py` |
| Message passing | REST/JSON; heartbeats, event batches, relayed reservations | `reporter.py`, `/internal/report` |
| Concurrency | Simultaneous bookings of one space; serialised by SQLite write lock + trigger | `tests/test_reservations.py`, evaluation section 2 |
| Fault tolerance / failure management | Stale detection, local operation while cut off, 503 + alternatives, catch-up | `tests/test_integration.py::test_07`, evaluation section 4 |
| Reliability / idempotency | `request_id`, outbox with acknowledgements | `test_retry_with_same_request_id_is_idempotent` |
| Transparency | The UI hides all lot boundaries; one combined list and one reserve button | frontend |
| Scalability / openness / extensibility | New lot self-registers; read latency vs. lots measured | `tools/add_lot.py`, evaluation section 5 |
| Load balancing | Recommendations steer drivers from full lots to under-used ones; dynamic pricing shifts demand | `ranking.py`, `pricing.py` |
| Heterogeneity | Services communicate only via a documented HTTP/JSON interface | README API section |
| Security | Driver/admin accounts with hashed passwords and signed expiring tokens (itsdangerous); owner-only cancel; admin-only demo controls; shared service key between lots and coordinator; login lockout | `coordinator/auth.py`, `shared/security.py`, `tests/test_auth.py`, README *Security* |

Report checklist (from the info sheet): abstract, introduction, related work (e.g. ParkWhiz, SpotHero,
municipal smart-parking systems - needs real citations), design diagrams, implementation, results
(`results/evaluation.md`), screenshots of the UI, contribution matrix with percentages, future work,
references. Demo: 10-minute slides + live demo, each member presents.
