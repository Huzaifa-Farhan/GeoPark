// Presentation helpers for lots: friendly descriptions, map placement and simulated peak hours.
import type { Lot } from "./types";

/** Short neighbourhood descriptions for the lots in config/lots.json. Unknown lots fall back to "Oshawa". */
const AREAS: Record<string, { area: string; short: string }> = {
  "campus-north": { area: "Near the university district", short: "Campus North" },
  "oshawa-centre": { area: "Near the Oshawa Centre", short: "Oshawa Centre" },
  downtown: { area: "Near King and Simcoe", short: "Downtown" },
  "go-station": { area: "Near the GO station", short: "GO Station" },
};

export const areaOf = (lot: { id: string }) => AREAS[lot.id]?.area ?? "Oshawa";

export function shortName(lot: { id: string; name: string }) {
  return AREAS[lot.id]?.short ?? lot.name.replace(/\s+(lot|garage|parking)$/i, "");
}

/** Where downtown Oshawa is: the default starting point for distances. */
export const DOWNTOWN = { lat: 43.8971, lng: -78.8658 };

/**
 * Place lots on the illustrative map by their real coordinates. The map is schematic, so we only keep
 * relative positions (north stays up, east stays right) and fit them inside a safe frame.
 */
export function projectLots(lots: Pick<Lot, "id" | "lat" | "lng">[]) {
  const out: Record<string, { x: number; y: number }> = {};
  if (!lots.length) return out;
  const lats = lots.map((l) => l.lat);
  const lngs = lots.map((l) => l.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const span = (lo: number, hi: number) => (hi - lo < 1e-6 ? null : hi - lo);
  const latSpan = span(minLat, maxLat);
  const lngSpan = span(minLng, maxLng);
  for (const l of lots) {
    const x = lngSpan ? 20 + ((l.lng - minLng) / lngSpan) * 58 : 50;
    const y = latSpan ? 20 + ((maxLat - l.lat) / latSpan) * 58 : 50;
    out[l.id] = { x, y };
  }
  return out;
}

/** Same demand curve as lot_service/pricing.py: morning and evening rush around 08:30 and 17:30. */
export function demandLevel(hour: number) {
  const peak = (centre: number, width: number) => {
    let d = Math.abs(hour - centre);
    d = Math.min(d, 24 - d);
    return Math.exp(-(d * d) / (2 * width * width));
  };
  return Math.max(peak(8.5, 1.5), peak(17.5, 1.5));
}

export const isPeak = (hour: number | null | undefined) => hour != null && demandLevel(hour) >= 0.5;

export function simHourOf(lots: Lot[]): number | null {
  const live = lots.find((l) => !l.stale) ?? lots[0];
  if (!live) return null;
  if (live.sim_hour != null) return live.sim_hour;
  const [h, m] = (live.sim_time || "0:0").split(":").map(Number);
  return h + m / 60;
}

/** Bays in natural order (S01, S02 ... S10). */
export const sortedSpaces = (lot: Lot) =>
  Object.entries(lot.spaces).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
