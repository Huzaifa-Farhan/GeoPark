import type { Lot, LogEntry, MyReservation, Priority, RecommendResponse, ReserveOutcome } from "./types";

const BASE: string = import.meta.env.VITE_API_URL ?? "";

interface Result<T> {
  ok: boolean;
  status: number;
  data: T;
}

async function request<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  let data: unknown = {};
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  return { ok: res.ok, status: res.status, data: data as T };
}

export async function fetchLots(): Promise<Lot[]> {
  const r = await request<{ lots: Lot[] }>("/api/lots");
  if (!r.ok) throw new Error("coordinator unreachable");
  return r.data.lots;
}

export async function fetchLog(): Promise<LogEntry[]> {
  const r = await request<{ log: LogEntry[] }>("/api/log");
  if (!r.ok) throw new Error("coordinator unreachable");
  return r.data.log;
}

export interface SearchParams {
  lat?: number;
  lng?: number;
  priority: Priority;
  preferred?: string;
  hours: number;
}

export async function fetchRecommendations(p: SearchParams): Promise<RecommendResponse> {
  const q = new URLSearchParams({ priority: p.priority, hours: String(p.hours) });
  if (p.lat !== undefined && p.lng !== undefined) {
    q.set("lat", String(p.lat));
    q.set("lng", String(p.lng));
  }
  if (p.preferred) q.set("preferred", p.preferred);
  const r = await request<RecommendResponse>(`/api/recommend?${q.toString()}`);
  if (!r.ok) throw new Error("recommend failed");
  return r.data;
}

export interface ReserveInput {
  lotId: string;
  requestId: string;
  driver: string;
  spaceId?: string;
  start: number; // epoch seconds
  end: number;
  lat?: number;
  lng?: number;
}

export async function reserve(input: ReserveInput): Promise<ReserveOutcome> {
  try {
    const r = await request<any>("/api/reservations", {
      method: "POST",
      body: JSON.stringify({
        lot_id: input.lotId,
        request_id: input.requestId,
        driver: input.driver,
        space_id: input.spaceId || null,
        start: input.start,
        end: input.end,
        lat: input.lat,
        lng: input.lng,
      }),
    });
    if (r.status === 201 || r.status === 200) {
      return {
        kind: "success",
        message: r.data.duplicate ? "This request was already confirmed - no second booking was made." : "Reservation confirmed.",
        reservation: r.data.reservation,
        duplicate: r.data.duplicate,
      };
    }
    if (r.status === 409) return { kind: "conflict", message: r.data.error ?? "That space is not available.", alternatives: r.data.alternatives ?? [] };
    if (r.status === 503) return { kind: "unreachable", message: r.data.error ?? "The lot is unreachable.", alternatives: r.data.alternatives ?? [] };
    return { kind: "invalid", message: r.data.error ?? "The request was rejected." };
  } catch {
    return { kind: "network", message: "Could not reach the coordinator. You can retry safely - the request id prevents double booking." };
  }
}

export async function cancelReservation(lotId: string, reservationId: string): Promise<boolean> {
  try {
    const r = await request<unknown>(`/api/lots/${lotId}/reservations/${reservationId}`, { method: "DELETE" });
    return r.ok;
  } catch {
    return false;
  }
}

// ---- demo controls ------------------------------------------------------------------------
export async function setPartition(lotId: string, on: boolean): Promise<boolean> {
  const r = await request<unknown>(`/api/admin/lots/${lotId}/partition`, { method: "POST", body: JSON.stringify({ on }) });
  return r.ok;
}

export async function setSpace(lotId: string, spaceId: string, occupied: boolean): Promise<boolean> {
  const r = await request<unknown>(`/api/admin/lots/${lotId}/spaces/${spaceId}`, { method: "POST", body: JSON.stringify({ occupied }) });
  return r.ok;
}

export async function setSimClock(hour: number, running: boolean): Promise<boolean> {
  const r = await request<unknown>("/api/admin/sim", { method: "POST", body: JSON.stringify({ hour, running }) });
  return r.ok;
}

export type { MyReservation };
