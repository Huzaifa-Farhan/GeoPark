"""Configuration for one parking-lot service instance (read from environment variables)."""
import os
from dataclasses import dataclass
from typing import Optional


def _env(name, default, cast=str):
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return cast(value)


def _bool(value):
    return str(value).strip().lower() in ("1", "true", "yes", "on")


@dataclass
class LotConfig:
    lot_id: str = "lot-1"
    name: str = "Lot 1"
    host: str = "127.0.0.1"
    port: int = 8101
    public_url: str = ""
    lat: float = 43.9450
    lng: float = -78.8970
    capacity: int = 16
    db_path: str = "data/lot-1.db"
    coordinator_url: str = "http://127.0.0.1:8000"
    base_price: float = 3.00      # $/hour at zero occupancy, off-peak
    min_price: float = 2.00
    max_price: float = 8.00
    heartbeat_interval: float = 2.0   # seconds between reports to the coordinator
    report_timeout: float = 2.0
    sensors_enabled: bool = True
    sensor_interval: float = 2.0
    sim_rate: float = 4.0         # simulated minutes per real second
    seed: Optional[int] = None
    max_reservation_hours: float = 12.0

    def __post_init__(self):
        if not self.public_url:
            self.public_url = f"http://{self.host}:{self.port}"

    @classmethod
    def from_env(cls):
        seed = os.environ.get("LOT_SEED")
        return cls(
            lot_id=_env("LOT_ID", "lot-1"),
            name=_env("LOT_NAME", "Lot 1"),
            host=_env("LOT_HOST", "127.0.0.1"),
            port=_env("LOT_PORT", 8101, int),
            public_url=_env("LOT_PUBLIC_URL", ""),
            lat=_env("LOT_LAT", 43.9450, float),
            lng=_env("LOT_LNG", -78.8970, float),
            capacity=_env("LOT_CAPACITY", 16, int),
            db_path=_env("LOT_DB", f"data/{_env('LOT_ID', 'lot-1')}.db"),
            coordinator_url=_env("COORDINATOR_URL", "http://127.0.0.1:8000"),
            base_price=_env("LOT_BASE_PRICE", 3.0, float),
            min_price=_env("LOT_MIN_PRICE", 2.0, float),
            max_price=_env("LOT_MAX_PRICE", 8.0, float),
            heartbeat_interval=_env("HEARTBEAT_INTERVAL", 2.0, float),
            report_timeout=_env("REPORT_TIMEOUT", 2.0, float),
            sensors_enabled=_env("SENSORS", True, _bool),
            sensor_interval=_env("SENSOR_INTERVAL", 2.0, float),
            sim_rate=_env("SIM_RATE", 4.0, float),
            seed=int(seed) if seed else None,
            max_reservation_hours=_env("MAX_RESERVATION_HOURS", 12.0, float),
        )
