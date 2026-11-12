# GeoPark evaluation results

Measured on one machine, all services as separate local processes.

## 1. API response time (ms)

| Endpoint | n | p50 | p95 | max |
|---|---|---|---|---|
| GET /api/lots | 300 | 1.42 | 1.58 | 1.78 |
| GET /api/recommend | 300 | 1.54 | 1.78 | 5.85 |

## 2. Reservation conflict prevention

All threads release simultaneously and request the same space and time window.

| Threads | Trials | Outcomes per trial (status: count) | Exactly one winner every trial |
|---|---|---|---|
| 20 | 5 | {409: 19, 201: 1} ... | yes |
| 50 | 5 | {409: 49, 201: 1} ... | yes |

## 3. Availability update latency

Time from a sensor change at a lot until the coordinator shows it (15 samples): p50 67.5 ms, p95 70.3 ms, max 70.3 ms.

## 4. Failure handling

- **heartbeat interval s**: 0.5
- **stale after s**: 2.0
- **time to mark stale ms**: 2013
- **other lots unaffected**: True
- **coordinator reservation while cut off status**: 503
- **alternatives offered**: 3
- **local reservations accepted while cut off**: 5/5
- **events queued at lot**: 10
- **time to live after reconnect ms**: 23
- **time to backlog cleared ms**: 2
- **missed events applied by coordinator**: 10

## 5. Scalability (read latency vs. number of lots, ms)

| Lots | /api/lots p50 | /api/lots p95 | /api/recommend p50 | /api/recommend p95 |
|---|---|---|---|---|
| 2 | 1.44 | 1.59 | 1.53 | 1.82 |
| 4 | 1.49 | 1.85 | 1.56 | 2.06 |
| 8 | 1.64 | 1.94 | 1.7 | 3.82 |
| 16 | 1.64 | 2.6 | 1.81 | 4.43 |
