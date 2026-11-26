import { AlertCircle, Check, Minus, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../lib/api";
import type { ReserveOutcome } from "../lib/api";
import { hoursText, money, spacesText, windowText } from "../lib/format";
import { areaOf, sortedSpaces } from "../lib/lots";
import { href, loginHref } from "../lib/router";
import { useSession } from "../lib/session";
import type { Lot, Recommendation } from "../lib/types";

const ARRIVALS = [
  { min: 0, label: "Now" },
  { min: 15, label: "In 15 min" },
  { min: 30, label: "In 30 min" },
  { min: 60, label: "In 1 hour" },
];
const MAX_HOURS = 8;

interface Attempt {
  id: string;
  key: string;
  input: api.ReserveInput;
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function BookingDialog({
  lot, initialSpace = null, origin, simTime, onClose, onSwitchLot, onBooked,
}: {
  lot: Lot | null;
  initialSpace?: string | null;
  origin?: { lat: number; lng: number };
  simTime: string | null;
  onClose: () => void;
  onSwitchLot: (id: string) => void;
  onBooked: () => void;
}) {
  const { user, expired } = useSession();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [hours, setHours] = useState(1);
  const [arrive, setArrive] = useState(0);
  const [space, setSpace] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<ReserveOutcome | null>(null);
  const attempt = useRef<Attempt | null>(null);
  const lotId = lot?.id ?? null;

  // open / close the native dialog with the selected lot
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (lotId && !d.open) d.showModal();
    if (!lotId && d.open) d.close();
    document.body.style.overflow = lotId ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [lotId]);

  // a different lot (or bay picked on the map): start a fresh booking attempt but keep the driver's time choices
  useEffect(() => {
    setSpace(initialSpace);
    setOutcome(null);
    setPending(false);
    attempt.current = null;
  }, [lotId, initialSpace]);

  const freeBays = useMemo(() => (lot ? sortedSpaces(lot).filter(([, s]) => s === "free").map(([id]) => id) : []), [lot]);
  useEffect(() => {
    if (space && lot && lot.spaces[space] !== "free" && !pending && outcome?.kind !== "success") setSpace(null);
  }, [lot, space, pending, outcome]);

  if (!lot) return <dialog ref={dialogRef} className="booking-dialog" onCancel={onClose} />;

  const unavailable = lot.stale;
  const full = !lot.stale && lot.free <= 0;

  // The driver changed what they're asking for, so it's a new request: drop any earlier attempt and its message.
  const edit = (change: () => void) => {
    change();
    setOutcome(null);
    attempt.current = null;
  };

  const submit = async (retry = false) => {
    const key = JSON.stringify([lot.id, hours, arrive, space]);
    if (!retry || !attempt.current) {
      // reuse the id only when retrying the very same uncertain request
      if (!attempt.current || attempt.current.key !== key || outcome?.kind !== "network") {
        const start = Math.floor(Date.now() / 1000) + arrive * 60;
        attempt.current = {
          id: newId(), key,
          input: { lotId: lot.id, requestId: "", spaceId: space ?? undefined, start, end: start + hours * 3600, lat: origin?.lat, lng: origin?.lng },
        };
        attempt.current.input.requestId = attempt.current.id;
      }
    }
    setPending(true);
    setOutcome(null);
    const out = await api.reserve(attempt.current!.input);
    setPending(false);
    setOutcome(out);
    if (out.kind !== "network") attempt.current = null; // a definite answer: the next try is a new request
    if (out.kind === "success") onBooked();
    if (out.kind === "conflict" && space) setSpace(null);
  };

  const close = () => {
    dialogRef.current?.close();
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { if (e.target === dialogRef.current) close(); }}
      className="booking-dialog"
      aria-labelledby="booking-title"
    >
      <button className="dialog-close icon-button" onClick={close} aria-label="Close reservation"><X /></button>

      {!user ? (
        <div>
          <span className="eyebrow">RESERVE A SPACE</span>
          <h2 id="booking-title">{lot.name}</h2>
          <p>{areaOf(lot)} · {unavailable ? "Temporarily unavailable" : spacesText(lot.free)} · {money(lot.price)}/hr</p>
          {expired && <div className="notice warn" role="status"><AlertCircle size={18} /> Your session ended. Please log in again.</div>}
          <p className="dialog-copy">Log in so the lot can hold the space under your account. Only you can see or cancel your reservations.</p>
          <a className="button full" href={loginHref("/book")} onClick={close}>Log in to reserve</a>
          <p className="dialog-alt">New here? <a className="text-link" href={href("/register", { next: "/book" })} onClick={close}>Create an account</a></p>
        </div>
      ) : outcome?.kind === "success" ? (
        <div className="confirmation">
          <span className="confirmation-check"><Check size={32} /></span>
          <span className="eyebrow">SPACE RESERVED</span>
          <h2 id="booking-title">Your space is confirmed.</h2>
          <p><strong>{lot.name}</strong> · Bay {outcome.reservation.space_id}</p>
          <p>{windowText(outcome.reservation.start_ts, outcome.reservation.end_ts)}</p>
          <div className="booking-summary">
            <span>{money(outcome.reservation.price_per_hour)}/hr · confirmed by the lot</span>
            <strong>{money(outcome.reservation.total_price)} CAD</strong>
          </div>
          {outcome.duplicate && <p className="dialog-note">This request was already confirmed, so no second booking was made.</p>}
          <p className="dialog-note">No payment is collected. You can cancel from My reservations.</p>
          <div className="dialog-actions">
            <a className="button" href="#/reservations" onClick={close}>View my reservations</a>
            <button className="text-link" onClick={close}>Back to parking</button>
          </div>
        </div>
      ) : (
        <>
          <span className="eyebrow">RESERVE A SPACE</span>
          <h2 id="booking-title">{lot.name}</h2>
          <p>
            {areaOf(lot)} ·{" "}
            <span className={`availability ${unavailable || full ? "unavailable" : ""}`}>
              <span className="status-dot" />
              {unavailable ? "Temporarily unavailable" : full ? "Full right now" : spacesText(lot.free)}
            </span>
          </p>

          <div className="booking-field">
            <span id="arrive-label">Arriving</span>
            <div className="seg" role="radiogroup" aria-labelledby="arrive-label">
              {ARRIVALS.map((a) => (
                <button key={a.min} role="radio" aria-checked={arrive === a.min} className={arrive === a.min ? "on" : ""} onClick={() => edit(() => setArrive(a.min))} disabled={pending}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="duration-control">
            <span>Parking duration</span>
            <div>
              <button aria-label="Reduce duration" disabled={hours === 1 || pending} onClick={() => edit(() => setHours(hours - 1))}><Minus size={18} /></button>
              <strong aria-live="polite">{hoursText(hours)}</strong>
              <button aria-label="Increase duration" disabled={hours === MAX_HOURS || pending} onClick={() => edit(() => setHours(hours + 1))}><Plus size={18} /></button>
            </div>
          </div>

          <details className="bay-picker" open={Boolean(initialSpace)}>
            <summary>
              <span>Space</span>
              <strong>{space ? `Bay ${space}` : "Any available space"}</strong>
            </summary>
            <div className="bay-grid compact" role="radiogroup" aria-label="Choose a bay">
              <button role="radio" aria-checked={space === null} className={`bay any ${space === null ? "on" : ""}`} onClick={() => edit(() => setSpace(null))}>Any</button>
              {sortedSpaces(lot).map(([id, state]) => (
                <button
                  key={id}
                  role="radio"
                  aria-checked={space === id}
                  className={`bay ${state} ${space === id ? "on" : ""}`}
                  disabled={state !== "free" || pending}
                  onClick={() => edit(() => setSpace(id))}
                  aria-label={`Bay ${id}, ${state}`}
                >
                  {id.replace(/^S0?/, "")}
                </button>
              ))}
            </div>
            <p className="dialog-note">{freeBays.length ? "Grey bays are taken or held right now." : "No bay is free right now."}</p>
          </details>

          <div className="booking-summary">
            <span>{money(lot.price)}/hr × {hoursText(hours)}</span>
            <strong>≈ {money(lot.price * hours)} CAD</strong>
          </div>
          <p className="dialog-note">
            Rates follow GeoPark's simulated time of day{simTime ? ` (now ${simTime})` : ""} and how full the lot is. The lot
            confirms the final rate when it accepts your reservation. No payment is collected.
          </p>

          <OutcomeMessage outcome={outcome} onRetry={() => submit(true)} onSwitchLot={onSwitchLot} pending={pending} />

          {outcome?.kind !== "network" && (
            <button className="button full" disabled={pending || unavailable || full} aria-busy={pending} onClick={() => submit(false)}>
              {pending ? "Confirming your space…" : unavailable ? "Lot temporarily unavailable" : full ? "No space free right now" : "Reserve this space"}
            </button>
          )}
        </>
      )}
    </dialog>
  );
}

function OutcomeMessage({
  outcome, onRetry, onSwitchLot, pending,
}: { outcome: ReserveOutcome | null; onRetry: () => void; onSwitchLot: (id: string) => void; pending: boolean }) {
  if (!outcome || outcome.kind === "success") return null;
  if (outcome.kind === "network") {
    return (
      <div className="outcome error" role="alert">
        <p><AlertCircle size={18} /> We couldn't confirm the result. Retry this reservation.</p>
        <p className="dialog-note">Retrying is safe: it reuses the same request, so you can't end up with two bookings.</p>
        <button className="button full" onClick={onRetry} disabled={pending} aria-busy={pending}>
          <RotateCcw size={17} /> {pending ? "Confirming your space…" : "Retry reservation"}
        </button>
      </div>
    );
  }
  let message = outcome.message;
  let alternatives: Recommendation[] = [];
  if (outcome.kind === "conflict") {
    message = outcome.reason === "full"
      ? "This lot has no space for that time. Try a nearby lot."
      : outcome.reason === "occupied"
        ? "A car is in that bay right now. Choose another space."
        : "This space was just reserved. Choose another space.";
    alternatives = outcome.alternatives;
  } else if (outcome.kind === "unreachable") {
    message = "This lot is temporarily unavailable. Try a nearby lot.";
    alternatives = outcome.alternatives;
  } else if (outcome.kind === "unauthenticated") {
    message = "Your session ended. Please log in again.";
  } else if (outcome.kind === "invalid") {
    message = message ? message.charAt(0).toUpperCase() + message.slice(1) + "." : "The lot couldn't accept this reservation.";
  }
  return (
    <div className="outcome error" role="alert">
      <p><AlertCircle size={18} /> {message}</p>
      {alternatives.length > 0 && (
        <ul className="alt-list" aria-label="Nearby lots with space">
          {alternatives.map((a) => (
            <li key={a.id}>
              <div>
                <strong>{a.name}</strong>
                <span>{spacesText(a.free)} · {money(a.price)}/hr{a.eta_min != null ? ` · ${a.eta_min} min away` : ""}</span>
              </div>
              <button className="reserve-button" onClick={() => onSwitchLot(a.id)}>Reserve here</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
