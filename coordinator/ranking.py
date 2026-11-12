"""Cooperative recommendation: rank lots using free capacity, simulated travel cost, price and preferences.

Pure functions (no Flask, no network) so they can be unit tested.
"""
import math

# weights: (availability, price, distance)
PRIORITIES = {
    "balanced": (0.35, 0.35, 0.30),
    "cheapest": (0.20, 0.60, 0.20),
    "closest": (0.20, 0.20, 0.60),
    "availability": (0.60, 0.20, 0.20),
}
STALE_PENALTY = 0.75
PREFERRED_BONUS = 0.10
SIM_SPEED_KMH = 25.0  # simulated average urban driving speed


def haversine_km(lat1, lng1, lat2, lng2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def eta_minutes(distance_km):
    """Simulated travel cost: distance at a constant urban speed, plus a minute to find the entrance."""
    return round(distance_km / SIM_SPEED_KMH * 60 + 1, 1)


def _norm_low_is_good(value, lo, hi):
    return 1.0 if hi - lo < 1e-9 else 1.0 - (value - lo) / (hi - lo)


def rank_lots(lots, origin=None, priority="balanced", preferred=None, hours=1.0, exclude=()):
    """lots: list of dicts with id, name, lat, lng, capacity, free, price, stale (bool).

    Returns a list of result dicts, best first. Full lots are kept (so the driver can see them)
    but always sort after lots that have space.
    """
    weights = PRIORITIES.get(priority, PRIORITIES["balanced"])
    w_avail, w_price, w_dist = weights
    if origin is None:
        w_avail, w_price, w_dist = w_avail + w_dist / 2, w_price + w_dist / 2, 0.0

    rows = []
    for lot in lots:
        if lot["id"] in exclude:
            continue
        dist = haversine_km(origin[0], origin[1], lot["lat"], lot["lng"]) if origin else None
        rows.append({"lot": lot, "dist": dist})

    open_rows = [r for r in rows if r["lot"]["free"] > 0]
    prices = [r["lot"]["price"] for r in open_rows] or [0]
    dists = [r["dist"] for r in open_rows if r["dist"] is not None] or [0]
    p_lo, p_hi, d_lo, d_hi = min(prices), max(prices), min(dists), max(dists)

    results = []
    for r in rows:
        lot, dist = r["lot"], r["dist"]
        full = lot["free"] <= 0
        reasons = []
        if full:
            score = 0.0
        else:
            avail = lot["free"] / lot["capacity"] if lot["capacity"] else 0.0
            score = w_avail * min(1.0, avail * 2)  # half-empty already scores max
            score += w_price * _norm_low_is_good(lot["price"], p_lo, p_hi)
            if dist is not None:
                score += w_dist * _norm_low_is_good(dist, d_lo, d_hi)
            if lot.get("stale"):
                score *= STALE_PENALTY
            if preferred and lot["id"] == preferred:
                score += PREFERRED_BONUS
                reasons.append("your preferred lot")
        if lot.get("stale"):
            reasons.append("data may be out of date")
        results.append({
            "id": lot["id"], "name": lot["name"], "score": round(score, 4), "full": full,
            "stale": bool(lot.get("stale")), "free": lot["free"], "capacity": lot["capacity"],
            "price": lot["price"], "estimated_total": round(lot["price"] * hours, 2),
            "distance_km": round(dist, 2) if dist is not None else None,
            "eta_min": eta_minutes(dist) if dist is not None else None,
            "reasons": reasons,
        })

    results.sort(key=lambda x: (x["full"], -x["score"], x["name"]))

    # explain the ranking
    open_results = [x for x in results if not x["full"]]
    if open_results:
        cheapest = min(open_results, key=lambda x: x["price"])
        most_space = max(open_results, key=lambda x: x["free"])
        cheapest["reasons"].append("lowest price")
        if most_space is not cheapest or len(open_results) == 1:
            most_space["reasons"].append("most free spaces")
        with_dist = [x for x in open_results if x["distance_km"] is not None]
        if with_dist:
            min(with_dist, key=lambda x: x["distance_km"])["reasons"].append("closest")
    for x in results:
        if x["full"]:
            x["reasons"].insert(0, "full")
    return results
