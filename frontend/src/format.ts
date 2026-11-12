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
