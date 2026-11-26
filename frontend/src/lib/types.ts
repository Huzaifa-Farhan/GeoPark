// Shapes returned by the coordinator's /api/* endpoints.

export type SpaceState = "free" | "occupied" | "reserved";
export type Role = "driver" | "admin";

export interface User {
  id: number;
  username: string;
  role: Role;
}

export interface Lot {
  id: string;
  name: string;
  url: string;
  lat: number;
  lng: number;
  capacity: number;
  free: number;
  occupied: number;
  reserved: number;
  total: number;
  occupancy: number;
  price: number;
  min_price: number;
  max_price: number;
  base_price: number;
  sim_hour: number | null;
  sim_time: string;
  spaces: Record<string, SpaceState>;
  status: "live" | "stale";
  stale: boolean;
  age_seconds: number;
  last_update: number;
  measured_at: number;
  events_applied: number;
}

export interface LotsResponse {
  lots: Lot[];
  stale_after: number;
  server_time: number;
}

export type Priority = "balanced" | "cheapest" | "closest" | "availability";

export interface Recommendation {
  id: string;
  name: string;
  score: number;
  full: boolean;
  stale: boolean;
  free: number;
  capacity: number;
  price: number;
  estimated_total: number;
  distance_km: number | null;
  eta_min: number | null;
  reasons: string[];
}

export interface RecommendResponse {
  results: Recommendation[];
  preferred: string | null;
  preferred_full: boolean;
  recommended: string | null;
  message: string;
  priority: Priority;
}

export interface Reservation {
  id: string;
  space_id: string;
  driver: string;
  start_ts: number;
  end_ts: number;
  status: string;
  price_per_hour: number;
  total_price: number;
  created_at: number;
  owner?: string | null;
  /** signed entry pass for the lot gate (QR code); only on active reservations */
  pass?: string;
}

export interface MyReservation extends Reservation {
  lot_id: string;
  lot_name: string;
}

export interface LogEntry {
  t: number;
  level: "info" | "success" | "warning";
  message: string;
}

export interface FeedEvent {
  lot_id: string;
  lot_name: string;
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  t: number;
  received_at: number;
}

export interface HistorySample {
  t: number;
  sim_time: string;
  occupancy: number;
  free: number;
  price: number;
}

export interface ForecastPoint {
  hour: number;
  demand: number;
  price_now_occupancy: number;
  price_empty: number;
  price_full: number;
}

export interface LotPricing {
  id: string;
  name: string;
  price: number;
  base_price: number;
  min_price: number;
  max_price: number;
  occupancy: number;
  sim_hour: number;
  demand: number;
  time_factor: number;
  occupancy_factor: number;
  peak: boolean;
  clamped: "max" | "min" | null;
  forecast: ForecastPoint[];
}
