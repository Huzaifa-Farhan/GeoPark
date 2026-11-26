// Every request goes to the coordinator. The browser never talks to a lot service directly.
import type {
  FeedEvent, HistorySample, LogEntry, LotPricing, LotsResponse, MyReservation, Priority, Recommendation,
  RecommendResponse, Reservation, User,
} from "./types";

const BASE: string = import.meta.env.VITE_API_URL ?? "";

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

/** Called by the session store whenever the user logs in or out. */
export function setAuthToken(t: string | null) {
  token = t;
}

/** Called when the coordinator rejects our token (expired or revoked), so the UI can sign out. */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export interface Result<T> {
  ok: boolean;
  status: number;
  data: T;
}

export class NetworkError extends Error {}

async function request<T>(path: string, init: RequestInit = {}): Promise<Result<T>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const sentToken = token;
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers as object) } });
  } catch {
    throw new NetworkError("coordinator unreachable");
  }
  let data: unknown = {};
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  // A token we sent was refused: the session is over. (A 401 from the login form itself is just a wrong password.)
  if (res.status === 401 && sentToken && sentToken === token) onUnauthorized?.();
  return { ok: res.ok, status: res.status, data: data as T };
}

async function getOrThrow<T>(path: string): Promise<T> {
  const r = await request<T>(path);
  if (!r.ok) throw new Error(`GET ${path} failed (${r.status})`);
  return r.data;
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

// ---- accounts ------------------------------------------------------------------------------------
export interface AuthOk {
  token: string;
  user: User;
  expires_in: number;
}
export type AuthResult = { ok: true; session: AuthOk } | { ok: false; status: number; message: string };

async function authCall(path: string, username: string, password: string): Promise<AuthResult> {
  try {
    const r = await request<AuthOk & { error?: string }>(path, post({ username, password }));
    if (r.ok) return { ok: true, session: r.data };
    return { ok: false, status: r.status, message: r.data.error ?? "Something went wrong. Please try again." };
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach GeoPark. Check that the backend is running and try again." };
  }
}

export const login = (u: string, p: string) => authCall("/api/auth/login", u, p);
export const register = (u: string, p: string) => authCall("/api/auth/register", u, p);

export async function fetchMe(): Promise<User | null> {
  const r = await request<{ user: User }>("/api/auth/me");
  return r.ok ? r.data.user : null;
}

// ---- public reads --------------------------------------------------------------------------------
export const fetchLots = () => getOrThrow<LotsResponse>("/api/lots");
export const fetchLog = () => getOrThrow<{ log: LogEntry[] }>("/api/log").then((d) => d.log);
export const fetchFeed = (limit = 60) => getOrThrow<{ feed: FeedEvent[] }>(`/api/feed?limit=${limit}`).then((d) => d.feed);
export const fetchHistory = () =>
  getOrThrow<{ history: Record<string, HistorySample[]> }>("/api/history").then((d) => d.history);
export const fetchPricing = () => getOrThrow<{ lots: LotPricing[]; peaks: number[] }>("/api/pricing");

export interface SearchParams {
  priority: Priority;
  hours: number;
  lat?: number;
  lng?: number;
  preferred?: string;
}

export function fetchRecommendations(p: SearchParams): Promise<RecommendResponse> {
  const q = new URLSearchParams({ priority: p.priority, hours: String(p.hours) });
  if (p.lat !== undefined && p.lng !== undefined) {
    q.set("lat", String(p.lat));
    q.set("lng", String(p.lng));
  }
  if (p.preferred) q.set("preferred", p.preferred);
  return getOrThrow<RecommendResponse>(`/api/recommend?${q.toString()}`);
}

// ---- reservations (logged-in users) --------------------------------------------------------------
export interface ReserveInput {
  lotId: string;
  requestId: string; // one id per booking attempt; reused when retrying after a network failure
  spaceId?: string;
  start: number; // epoch seconds
  end: number;
  lat?: number;
  lng?: number;
}

export type ReserveOutcome =
  | { kind: "success"; reservation: Reservation; duplicate: boolean }
  | { kind: "conflict"; reason: string; message: string; alternatives: Recommendation[] }
  | { kind: "unreachable"; message: string; alternatives: Recommendation[] }
  | { kind: "invalid"; message: string }
  | { kind: "unauthenticated"; message: string }
  | { kind: "network"; message: string };

export async function reserve(input: ReserveInput): Promise<ReserveOutcome> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await request<any>("/api/reservations", post({
      lot_id: input.lotId, request_id: input.requestId, space_id: input.spaceId || null,
      start: input.start, end: input.end, lat: input.lat, lng: input.lng,
    }));
    if (r.status === 201 || r.status === 200) {
      return { kind: "success", reservation: r.data.reservation, duplicate: Boolean(r.data.duplicate) };
    }
    if (r.status === 409) {
      return { kind: "conflict", reason: r.data.reason ?? "overlap", message: r.data.error ?? "", alternatives: r.data.alternatives ?? [] };
    }
    if (r.status === 503) return { kind: "unreachable", message: r.data.error ?? "", alternatives: r.data.alternatives ?? [] };
    if (r.status === 401) return { kind: "unauthenticated", message: r.data.error ?? "Please log in to reserve." };
    return { kind: "invalid", message: r.data.error ?? "The lot could not accept this reservation." };
  } catch {
    return { kind: "network", message: "We couldn't confirm the result." };
  }
}

export async function fetchMyReservations(): Promise<{ reservations: MyReservation[]; unreachable_lots: string[] }> {
  const r = await request<{ reservations: MyReservation[]; unreachable_lots: string[] }>("/api/me/reservations");
  if (!r.ok) throw new Error(`reservations failed (${r.status})`);
  return r.data;
}

export type CancelOutcome = "cancelled" | "already_cancelled" | "forbidden" | "not_found" | "unreachable" | "failed";

export async function cancelReservation(lotId: string, reservationId: string): Promise<CancelOutcome> {
  try {
    const r = await request<{ outcome?: string }>(`/api/lots/${encodeURIComponent(lotId)}/reservations/${encodeURIComponent(reservationId)}`, { method: "DELETE" });
    if (r.ok) return r.data.outcome === "already_cancelled" ? "already_cancelled" : "cancelled";
    if (r.status === 403) return "forbidden";
    if (r.status === 404) return "not_found";
    if (r.status === 503) return "unreachable";
    return "failed";
  } catch {
    return "unreachable";
  }
}

// ---- operator controls (admin accounts) ----------------------------------------------------------
export async function fetchLotReservations(lotId: string): Promise<Reservation[] | null> {
  try {
    const r = await request<{ reservations: Reservation[] }>(`/api/lots/${encodeURIComponent(lotId)}/reservations`);
    return r.ok ? r.data.reservations : null;
  } catch {
    return null;
  }
}

async function adminPost(path: string, body: unknown): Promise<boolean> {
  try {
    return (await request<unknown>(path, post(body))).ok;
  } catch {
    return false;
  }
}

export const setPartition = (lotId: string, on: boolean) =>
  adminPost(`/api/admin/lots/${encodeURIComponent(lotId)}/partition`, { on });
export const setSpace = (lotId: string, spaceId: string, occupied: boolean) =>
  adminPost(`/api/admin/lots/${encodeURIComponent(lotId)}/spaces/${encodeURIComponent(spaceId)}`, { occupied });
export const setSimClock = (hour: number, running: boolean) => adminPost("/api/admin/sim", { hour, running });
