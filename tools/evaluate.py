#!/usr/bin/env python3
"""Evaluation for the final report. Starts its own stack on spare ports and measures:

  1. API response times (p50/p95) for lots / recommend,
  2. reservation conflict prevention under concurrent load,
  3. availability update latency (sensor change -> visible at the coordinator),
  4. failure handling: time to mark stale, local operation while cut off, time to catch up,
  5. scalability: read latency as the number of lots grows.

    python tools/evaluate.py            # writes results/evaluation.json and results/evaluation.md
"""
import json
import os
import statistics
import sys
import threading
import time
from collections import Counter

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from tools.stack import ROOT, Stack  # noqa: E402

PORT = 8950
HEARTBEAT, STALE_AFTER = 0.5, 2.0


def mk_lots(n, base_port=8951):
    return [{"id": f"lot{i}", "name": f"Lot {i}", "lat": 43.88 + 0.004 * i, "lng": -78.89 + 0.002 * i,
             "capacity": 20, "port": base_port + i} for i in range(n)]


def pct(values, p):
    values = sorted(values)
    return values[min(len(values) - 1, int(len(values) * p))]


def timed_get(url, n, params=None):
    times = []
    for _ in range(n):
        t = time.perf_counter()
        requests.get(url, params=params, timeout=5)
        times.append((time.perf_counter() - t) * 1000)
    return {"n": n, "p50_ms": round(statistics.median(times), 2), "p95_ms": round(pct(times, 0.95), 2),
            "max_ms": round(max(times), 2)}


def wait_for(fn, timeout=15, step=0.02):
    t0 = time.perf_counter()
    while time.perf_counter() - t0 < timeout:
        if fn():
            return (time.perf_counter() - t0) * 1000
        time.sleep(step)
    return None


def concurrency(api, lot_id, n_threads, trials=5):
    outcomes = []
    for trial in range(trials):
        codes, lock = [], threading.Lock()
        now = time.time()
        space = f"S{trial + 1:02d}"
        gate = threading.Barrier(n_threads)

        def go(i):
            gate.wait()
            r = requests.post(f"{api}/api/reservations", json={
                "lot_id": lot_id, "space_id": space, "driver": f"d{i}", "start": now + 60, "end": now + 3600},
                timeout=30)
            with lock:
                codes.append(r.status_code)

        ts = [threading.Thread(target=go, args=(i,)) for i in range(n_threads)]
        [t.start() for t in ts]
        [t.join() for t in ts]
        outcomes.append(dict(Counter(codes)))
    ok = all(o.get(201, 0) == 1 and o.get(409, 0) == n_threads - 1 for o in outcomes)
    return {"threads": n_threads, "trials": trials, "outcomes": outcomes, "exactly_one_winner_every_trial": ok}


def main():
    results = {}
    lots = mk_lots(4)
    with Stack(lots, coord_port=PORT, data_dir=os.path.join(ROOT, "data_eval"), sensors=False,
               heartbeat=HEARTBEAT, stale_after=STALE_AFTER) as stack:
        api = stack.coord_url
        print("1. response times ...")
        results["response_times"] = {
            "GET /api/lots": timed_get(f"{api}/api/lots", 300),
            "GET /api/recommend": timed_get(f"{api}/api/recommend", 300,
                                            {"lat": 43.9, "lng": -78.88, "priority": "balanced"}),
        }

        print("2. concurrency ...")
        results["concurrency"] = [concurrency(api, "lot0", 20), concurrency(api, "lot1", 50)]

        print("3. availability update latency ...")
        lat = []
        for i in range(15):
            sid = f"S{i + 1:02d}"
            before = requests.get(f"{api}/api/lots/lot2").json()["free"]
            requests.post(f"http://127.0.0.1:{lots[2]['port']}/admin/spaces/{sid}", json={"occupied": True})
            t = time.perf_counter()
            ms = wait_for(lambda: requests.get(f"{api}/api/lots/lot2").json()["free"] == before - 1, 5)
            if ms is not None:
                lat.append(ms)
        results["update_latency_ms"] = {"samples": len(lat), "p50": round(statistics.median(lat), 1),
                                        "p95": round(pct(lat, 0.95), 1), "max": round(max(lat), 1)}

        print("4. failure handling ...")
        port3 = lots[3]["port"]
        requests.post(f"{api}/api/admin/lots/lot3/partition", json={"on": True})
        t_cut = time.perf_counter()
        t_stale = wait_for(lambda: requests.get(f"{api}/api/lots/lot3").json()["status"] == "stale", 15)
        others_live = all(l["status"] == "live" for l in requests.get(f"{api}/api/lots").json()["lots"] if l["id"] != "lot3")
        r = requests.post(f"{api}/api/reservations", json={"lot_id": "lot3", "driver": "x", "start": time.time() + 30,
                                                          "end": time.time() + 900})
        local_ok = 0
        for i in range(5):
            now = time.time()
            k = requests.post(f"http://127.0.0.1:{port3}/reservations",
                              json={"driver": "kiosk", "space_id": f"S{i + 1:02d}", "start": now + 30, "end": now + 900})
            local_ok += k.status_code == 201
        for i in range(5):
            requests.post(f"http://127.0.0.1:{port3}/admin/spaces/S{i + 10:02d}", json={"occupied": True})
        backlog = requests.get(f"http://127.0.0.1:{port3}/status").json()["backlog"]
        applied0 = requests.get(f"{api}/api/lots/lot3").json()["events_applied"]
        requests.post(f"{api}/api/admin/lots/lot3/partition", json={"on": False})
        t_live = wait_for(lambda: requests.get(f"{api}/api/lots/lot3").json()["status"] == "live", 15)
        t_synced = wait_for(lambda: requests.get(f"http://127.0.0.1:{port3}/status").json()["backlog"] == 0, 15)
        applied1 = requests.get(f"{api}/api/lots/lot3").json()["events_applied"]
        results["failure_handling"] = {
            "heartbeat_interval_s": HEARTBEAT, "stale_after_s": STALE_AFTER,
            "time_to_mark_stale_ms": round(t_stale) if t_stale else None,
            "other_lots_unaffected": others_live,
            "coordinator_reservation_while_cut_off_status": r.status_code,
            "alternatives_offered": len(r.json().get("alternatives", [])),
            "local_reservations_accepted_while_cut_off": f"{local_ok}/5",
            "events_queued_at_lot": backlog,
            "time_to_live_after_reconnect_ms": round(t_live) if t_live else None,
            "time_to_backlog_cleared_ms": round(t_synced) if t_synced else None,
            "missed_events_applied_by_coordinator": applied1 - applied0,
        }

    print("5. scalability ...")
    scal = []
    for n in (2, 4, 8, 16):
        with Stack(mk_lots(n), coord_port=PORT, data_dir=os.path.join(ROOT, "data_eval"), sensors=True,
                   heartbeat=HEARTBEAT, stale_after=STALE_AFTER) as stack:
            api = stack.coord_url
            scal.append({"lots": n,
                         "GET /api/lots": timed_get(f"{api}/api/lots", 150),
                         "GET /api/recommend": timed_get(f"{api}/api/recommend", 150, {"lat": 43.9, "lng": -78.88})})
    results["scalability"] = scal

    os.makedirs(os.path.join(ROOT, "results"), exist_ok=True)
    with open(os.path.join(ROOT, "results", "evaluation.json"), "w") as f:
        json.dump(results, f, indent=2)
    with open(os.path.join(ROOT, "results", "evaluation.md"), "w") as f:
        f.write(render_md(results))
    print(render_md(results))
    import shutil
    shutil.rmtree(os.path.join(ROOT, "data_eval"), ignore_errors=True)


def render_md(r):
    out = ["# GeoPark evaluation results", "", "Measured on one machine, all services as separate local processes.", "",
           "## 1. API response time (ms)", "", "| Endpoint | n | p50 | p95 | max |", "|---|---|---|---|---|"]
    for k, v in r["response_times"].items():
        out.append(f"| {k} | {v['n']} | {v['p50_ms']} | {v['p95_ms']} | {v['max_ms']} |")
    out += ["", "## 2. Reservation conflict prevention", "",
            "All threads release simultaneously and request the same space and time window.", "",
            "| Threads | Trials | Outcomes per trial (status: count) | Exactly one winner every trial |", "|---|---|---|---|"]
    for c in r["concurrency"]:
        out.append(f"| {c['threads']} | {c['trials']} | {c['outcomes'][0]} ... | {'yes' if c['exactly_one_winner_every_trial'] else 'NO'} |")
    u = r["update_latency_ms"]
    out += ["", "## 3. Availability update latency", "",
            f"Time from a sensor change at a lot until the coordinator shows it ({u['samples']} samples): "
            f"p50 {u['p50']} ms, p95 {u['p95']} ms, max {u['max']} ms.", "", "## 4. Failure handling", ""]
    for k, v in r["failure_handling"].items():
        out.append(f"- **{k.replace('_', ' ')}**: {v}")
    out += ["", "## 5. Scalability (read latency vs. number of lots, ms)", "",
            "| Lots | /api/lots p50 | /api/lots p95 | /api/recommend p50 | /api/recommend p95 |", "|---|---|---|---|---|"]
    for s in r["scalability"]:
        a, b = s["GET /api/lots"], s["GET /api/recommend"]
        out.append(f"| {s['lots']} | {a['p50_ms']} | {a['p95_ms']} | {b['p50_ms']} | {b['p95_ms']} |")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    main()
