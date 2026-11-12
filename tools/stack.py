"""Start/stop a whole GeoPark stack (coordinator + lots) as separate OS processes.

Used by run_all.py, the integration tests and the evaluation script.
"""
import json
import os
import shutil
import subprocess
import sys
import time

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_lots(path=None):
    with open(path or os.path.join(ROOT, "config", "lots.json")) as f:
        return json.load(f)


class Stack:
    def __init__(self, lots=None, coord_port=8000, data_dir=None, sensors=True, heartbeat=2.0,
                 stale_after=6.0, sim_rate=4.0, quiet=True, seed=None):
        self.lots = lots if lots is not None else load_lots()
        self.coord_port = coord_port
        self.data_dir = data_dir or os.path.join(ROOT, "data")
        self.sensors = sensors
        self.heartbeat = heartbeat
        self.stale_after = stale_after
        self.sim_rate = sim_rate
        self.quiet = quiet
        self.seed = seed
        self.procs = {}

    @property
    def coord_url(self):
        return f"http://127.0.0.1:{self.coord_port}"

    def _spawn(self, name, module, env_extra):
        env = {**os.environ, "PYTHONPATH": ROOT, "PYTHONUNBUFFERED": "1", **{k: str(v) for k, v in env_extra.items()}}
        out = subprocess.DEVNULL if self.quiet else None
        self.procs[name] = subprocess.Popen([sys.executable, "-m", module], cwd=ROOT, env=env, stdout=out, stderr=out)

    def start_coordinator(self):
        self._spawn("coordinator", "coordinator", {"COORD_PORT": self.coord_port, "STALE_AFTER": self.stale_after})

    def start_lot(self, lot):
        env = {
            "LOT_ID": lot["id"], "LOT_NAME": lot["name"], "LOT_PORT": lot["port"], "LOT_LAT": lot["lat"],
            "LOT_LNG": lot["lng"], "LOT_CAPACITY": lot.get("capacity", 16),
            "LOT_BASE_PRICE": lot.get("base_price", 3.0), "LOT_MIN_PRICE": lot.get("min_price", 2.0),
            "LOT_MAX_PRICE": lot.get("max_price", 8.0),
            "LOT_DB": os.path.join(self.data_dir, f"{lot['id']}.db"),
            "COORDINATOR_URL": self.coord_url, "HEARTBEAT_INTERVAL": self.heartbeat,
            "SENSORS": "1" if self.sensors else "0", "SIM_RATE": self.sim_rate,
        }
        if self.seed is not None:
            env["LOT_SEED"] = self.seed + hash(lot["id"]) % 1000
        self._spawn(lot["id"], "lot_service", env)

    def start(self, reset=True, wait=True, timeout=20):
        if reset and os.path.isdir(self.data_dir):
            shutil.rmtree(self.data_dir, ignore_errors=True)
        os.makedirs(self.data_dir, exist_ok=True)
        self.start_coordinator()
        for lot in self.lots:
            self.start_lot(lot)
        if wait:
            self.wait_ready(len(self.lots), timeout)
        return self

    def wait_ready(self, n_lots, timeout=20):
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                r = requests.get(f"{self.coord_url}/api/lots", timeout=1)
                if len([l for l in r.json()["lots"] if not l["stale"]]) >= n_lots:
                    return
            except requests.RequestException:
                pass
            time.sleep(0.2)
        raise TimeoutError("stack did not become ready")

    def kill(self, name):
        p = self.procs.get(name)
        if p and p.poll() is None:
            p.terminate()
            try:
                p.wait(5)
            except subprocess.TimeoutExpired:
                p.kill()

    def stop(self):
        for name in list(self.procs):
            self.kill(name)

    def __enter__(self):
        return self.start()

    def __exit__(self, *exc):
        self.stop()
