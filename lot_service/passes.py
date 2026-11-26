"""Entry passes: the QR code a driver shows at the lot gate.

A pass is the reservation's lot, id and bay, signed by the lot (itsdangerous, keyed with the service key
and the lot id). The lot that issued it can check it at the gate with nothing but its own database, so
check-in keeps working even while the lot is cut off from the coordinator.
"""
from itsdangerous import BadSignature, Signer

PREFIX = "GP1"
EARLY_ENTRY = 15 * 60  # a driver may enter up to 15 minutes before the booking starts


def _signer(cfg):
    return Signer(cfg.service_key, salt=f"geopark-pass:{cfg.lot_id}")


def make_pass(cfg, res):
    payload = "|".join([PREFIX, cfg.lot_id, res["id"], res["space_id"]])
    return _signer(cfg).sign(payload).decode()


def with_pass(cfg, res):
    if res and res.get("status") == "active":
        return {**res, "pass": make_pass(cfg, res)}
    return res


def read_pass(cfg, token):
    """Return (reservation_id, space_id) for a genuine pass issued by this lot, else None."""
    try:
        payload = _signer(cfg).unsign(str(token or "").strip()).decode()
    except BadSignature:
        return None
    parts = payload.split("|")
    if len(parts) != 4 or parts[0] != PREFIX or parts[1] != cfg.lot_id:
        return None
    return parts[2], parts[3]


def check(cfg, res, now):
    """Decide whether the pass's reservation may enter now: (ok, reason)."""
    if res is None:
        return False, "not_found"
    if res["status"] != "active":
        return False, "cancelled"
    if now < res["start_ts"] - EARLY_ENTRY:
        return False, "too_early"
    if now > res["end_ts"]:
        return False, "expired"
    return True, "ok"
