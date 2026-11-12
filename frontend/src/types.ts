export type SpaceState = "free" | "occupied" | "reserved";

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
  sim_time: string;
  spaces: Record<string, SpaceState>;
  status: "live" | "stale";
  stale: boolean;
  age_seconds: number;
  last_update: number;
  measured_at: number;
  events_applied: number;
}

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
  priority: string;
}

export interface Reservation {
  id: string;
  request_id: string;
  space_id: string;
  driver: string;
  start_ts: number;
  end_ts: number;
  status: string;
  price_per_hour: number;
  total_price: number;
  created_at: number;
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

export type Priority = "balanced" | "cheapest" | "closest" | "availability";

export interface ReserveOutcome {
  kind: "success" | "conflict" | "unreachable" | "invalid" | "network";
  message: string;
  reservation?: Reservation;
  duplicate?: boolean;
  alternatives?: Recommendation[];
}
