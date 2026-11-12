import { useEffect, useRef, useState, type FormEvent } from "react";
import { reserve } from "../api";
import { money, newId } from "../format";
import type { Lot, MyReservation, ReserveOutcome } from "../types";

interface Props {
  lot: Lot;
  selectedSpace: string | null;
  origin?: { lat: number; lng: number };
  onReserved: (r: MyReservation) => void;
  onSwitchLot: (lotId: string) => void;
}

const STARTS = [
  { label: "Now", min: 0 },
  { label: "In 15 min", min: 15 },
  { label: "In 30 min", min: 30 },
  { label: "In 1 hour", min: 60 },
  { label: "In 2 hours", min: 120 },
];
const DURATIONS = [
  { label: "30 minutes", min: 30 },
  { label: "1 hour", min: 60 },
  { label: "2 hours", min: 120 },
  { label: "3 hours", min: 180 },
  { label: "4 hours", min: 240 },
];

export default function ReserveForm({ lot, selectedSpace, origin, onReserved, onSwitchLot }: Props) {
  const [driver, setDriver] = useState("");
  const [startMin, setStartMin] = useState(0);
  const [durMin, setDurMin] = useState(60);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ReserveOutcome | null>(null);
  // One id per booking attempt: a retry after a network error re-sends the SAME id, so the lot can
  // recognise it and never creates a second booking.
  const requestId = useRef<string | null>(null);

  useEffect(() => {
    requestId.current = null;
  }, [lot.id, selectedSpace, startMin, durMin, driver]);

  useEffect(() => {
    setOutcome(null);
  }, [lot.id]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!driver.trim()) {
      setOutcome({ kind: "invalid", message: "Please enter a name for the reservation." });
      return;
    }
    setBusy(true);
    const start = Math.floor(Date.now() / 1000) + startMin * 60;
    if (!requestId.current) requestId.current = newId();
    const out = await reserve({
      lotId: lot.id,
      requestId: requestId.current,
      driver: driver.trim(),
      spaceId: selectedSpace ?? undefined,
      start,
      end: start + durMin * 60,
      lat: origin?.lat,
      lng: origin?.lng,
    });
    if (out.kind !== "network") requestId.current = null;
    setOutcome(out);
    setBusy(false);
    if (out.kind === "success" && out.reservation && !out.duplicate) {
      onReserved({ ...out.reservation, lot_id: lot.id, lot_name: lot.name });
    }
  };

  const estimate = lot.price * (durMin / 60);

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="driver">Name</label>
          <input id="driver" className="field" value={driver} onChange={(e) => setDriver(e.target.value)} placeholder="Driver name" />
        </div>
        <div>
          <label className="label" htmlFor="start">Arriving</label>
          <select id="start" className="field" value={startMin} onChange={(e) => setStartMin(Number(e.target.value))}>
            {STARTS.map((s) => <option key={s.min} value={s.min}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="dur">Stay</label>
          <select id="dur" className="field" value={durMin} onChange={(e) => setDurMin(Number(e.target.value))}>
            {DURATIONS.map((d) => <option key={d.min} value={d.min}>{d.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-asphalt/80">
          {selectedSpace ? <>Space <b>{selectedSpace}</b></> : "Any free space"} - about <b>{money(estimate)}</b> at the current rate.
          <span className="text-asphalt/50"> The lot confirms the final price.</span>
        </p>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Asking the lot..." : `Reserve at ${lot.name}`}</button>
      </div>

      {outcome && <OutcomeBanner outcome={outcome} onSwitchLot={onSwitchLot} />}
    </form>
  );
}

function OutcomeBanner({ outcome, onSwitchLot }: { outcome: ReserveOutcome; onSwitchLot: (id: string) => void }) {
  const ok = outcome.kind === "success";
  const r = outcome.reservation;
  return (
    <div role="status" className={`rounded-md border-l-4 p-3 text-sm ${ok ? "border-go bg-go/10" : "border-stop bg-stop/10"}`}>
      <p className="font-semibold">{outcome.message}</p>
      {ok && r && (
        <p className="mt-1">
          Space <b>{r.space_id}</b> - {money(r.price_per_hour)}/h, total <b>{money(r.total_price)}</b>. Reference <code>{r.id}</code>.
        </p>
      )}
      {outcome.alternatives && outcome.alternatives.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-asphalt/70">Try one of these instead:</p>
          <div className="flex flex-wrap gap-2">
            {outcome.alternatives.map((a) => (
              <button type="button" key={a.id} className="btn btn-ghost" onClick={() => onSwitchLot(a.id)}>
                {a.name} - {a.free} free, {money(a.price)}/h{a.eta_min != null ? `, ${a.eta_min} min` : ""}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
