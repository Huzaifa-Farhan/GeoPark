export const money = (n: number) => `$${n.toFixed(2)}`;

export function ago(seconds: number): string {
  if (seconds < 2) return "just now";
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s ago`;
}

export function clock(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const ORIGINS = [
  { id: "campus", name: "Ontario Tech campus", lat: 43.9453, lng: -78.8964 },
  { id: "downtown", name: "Downtown Oshawa", lat: 43.8975, lng: -78.8658 },
  { id: "centre", name: "Oshawa Centre", lat: 43.9206, lng: -78.879 },
  { id: "whitby", name: "Whitby (Brock St)", lat: 43.8761, lng: -78.94 },
] as const;

/** Series colours for lots (validated for colour-vision deficiency, Ontario Tech blue + tangerine first).
 *  A lot keeps its colour for the whole session: colour follows the entity, never its rank. */
export const LOT_COLORS = ["#0077CA", "#E75D2A", "#8E5BB5", "#2E8B57", "#B08A2E"] as const;
const assigned = new Map<string, string>();
/** Register lots in a stable order (by id) so colours don't depend on which event arrives first. */
export function registerLots(ids: string[]) {
  for (const id of [...ids].sort()) lotColor(id);
}
export function lotColor(lotId: string): string {
  let c = assigned.get(lotId);
  if (!c) {
    c = LOT_COLORS[assigned.size % LOT_COLORS.length];
    assigned.set(lotId, c);
  }
  return c;
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;

export function hourLabel(h: number): string {
  const hh = Math.floor(h) % 24;
  return `${String(hh).padStart(2, "0")}:${h % 1 ? "30" : "00"}`;
}

/** Parse "HH:MM" into fractional hours. */
export function simHour(label: string | undefined): number | null {
  if (!label || !label.includes(":")) return null;
  const [h, m] = label.split(":").map(Number);
  return h + m / 60;
}
