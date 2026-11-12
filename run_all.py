#!/usr/bin/env python3
"""Start the whole GeoPark backend (coordinator + all lots from config/lots.json).

    python run_all.py              # keep existing lot databases
    python run_all.py --reset      # start from empty databases
    python run_all.py --no-sensors # disable the random sensor simulation (manual control only)
"""
import argparse
import signal
import sys
import time

from tools.stack import Stack, load_lots


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true", help="delete lot databases first")
    ap.add_argument("--no-sensors", action="store_true")
    ap.add_argument("--coord-port", type=int, default=8000)
    ap.add_argument("--heartbeat", type=float, default=2.0)
    ap.add_argument("--stale-after", type=float, default=6.0)
    args = ap.parse_args()

    stack = Stack(load_lots(), coord_port=args.coord_port, sensors=not args.no_sensors,
                  heartbeat=args.heartbeat, stale_after=args.stale_after, quiet=False)
    stack.start(reset=args.reset, wait=False)
    print("\nGeoPark backend starting...")
    print(f"  coordinator API : {stack.coord_url}/api/lots")
    for lot in stack.lots:
        print(f"  {lot['name']:<24}: http://127.0.0.1:{lot['port']}/status")
    print("  frontend        : cd frontend && npm install && npm run dev  ->  http://localhost:5173")
    print("Press Ctrl+C to stop everything.\n")

    def shutdown(*_):
        print("\nStopping...")
        stack.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)
    while True:
        time.sleep(1)
        for name, p in stack.procs.items():
            if p.poll() is not None:
                print(f"!! process '{name}' exited with code {p.returncode}")
                shutdown()


if __name__ == "__main__":
    main()
