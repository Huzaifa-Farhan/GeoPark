#!/usr/bin/env python3
"""Scalability demo: start an extra lot while the system is running.

The new lot registers itself with the coordinator and appears in the UI - no coordinator changes.
    python tools/add_lot.py                      # adds 'popup-lot' on port 8105
    python tools/add_lot.py --id garage-2 --port 8106 --name "Garage 2" --capacity 10
"""
import argparse
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ap = argparse.ArgumentParser()
ap.add_argument("--id", default="popup-lot")
ap.add_argument("--name", default="Pop-up Event Lot")
ap.add_argument("--port", type=int, default=8105)
ap.add_argument("--lat", type=float, default=43.9100)
ap.add_argument("--lng", type=float, default=-78.8700)
ap.add_argument("--capacity", type=int, default=14)
ap.add_argument("--coordinator", default="http://127.0.0.1:8000")
a = ap.parse_args()

env = {**os.environ, "PYTHONPATH": ROOT, "LOT_ID": a.id, "LOT_NAME": a.name, "LOT_PORT": str(a.port),
       "LOT_LAT": str(a.lat), "LOT_LNG": str(a.lng), "LOT_CAPACITY": str(a.capacity),
       "COORDINATOR_URL": a.coordinator, "LOT_DB": os.path.join(ROOT, "data", f"{a.id}.db")}
print(f"Starting '{a.name}' on port {a.port} ...  (Ctrl+C to stop)")
try:
    subprocess.run([sys.executable, "-m", "lot_service"], cwd=ROOT, env=env)
except KeyboardInterrupt:
    pass
