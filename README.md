# GeoPark - Distributed Smart Parking System

SOFE4790U Distributed Systems, Group 5 (Huzaifa Farhan, Anas Jamil, Bilal Brohi, Essa Sadat).

GeoPark is a smart parking system built as a distributed system. Each parking lot runs as its own
service with its own SQLite database, simulated IoT sensors, dynamic pricing and reservations. A
coordinator collects what the lots report, ranks them for drivers and relays bookings to the lot that
owns the space. Drivers use a React web app to find and reserve parking; operators use the Control
room to monitor the lots and run the demo controls.

## Requirements

- Python 3.10+
- Node.js 18+

On Windows, use `py` instead of `python` if `python` is not found.

## Running the project

**1. Backend** (coordinator on port 8000 and four lots on ports 8101-8104):

```bash
pip install -r requirements.txt
python run_all.py --reset
```

**2. Frontend** (in a second terminal):

```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173.

## Logging in

- **Drivers:** create an account from *Log in -> Create an account*.
- **Operators:** log in as `admin` with password `geopark-admin` to open the Control room.

## Tests and evaluation

```bash
python -m unittest discover -s tests -t . -v
python tools/evaluate.py
```

The evaluation writes its results to `results/evaluation.md`.
