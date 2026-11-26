import hmac
import os

HEADER = "X-Service-Key"
# Development fallback so `run_all.py` works out of the box. Set GEOPARK_SERVICE_KEY in any real deployment.
DEV_SERVICE_KEY = "geopark-dev-service-key-change-me"


def service_key() -> str:
    return os.environ.get("GEOPARK_SERVICE_KEY") or DEV_SERVICE_KEY


def using_dev_key(key: str = None) -> bool:
    return (key or service_key()) == DEV_SERVICE_KEY


def key_matches(presented, expected: str) -> bool:
    """Constant-time comparison, so response timing does not reveal how much of the key was right."""
    if not presented or not expected:
        return False
    return hmac.compare_digest(str(presented).encode(), expected.encode())
