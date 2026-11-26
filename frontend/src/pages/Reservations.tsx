import { AlertCircle, CalendarClock, Check, QrCode, RotateCcw } from "lucide-react";
import { useState } from "react";
import { EntryPass } from "../components/EntryPass";
import { LoginRequired } from "../components/Gate";
import * as api from "../lib/api";
import { money, windowText } from "../lib/format";
import { areaOf } from "../lib/lots";
import { useSession } from "../lib/session";
import { usePolling } from "../lib/usePolling";
import type { MyReservation } from "../lib/types";

type Phase = "active" | "upcoming" | "past";

const phaseOf = (r: MyReservation, now: number): Phase => (r.end_ts <= now ? "past" : r.start_ts <= now ? "active" : "upcoming");

export function Reservations({ lotNames, refreshLots }: { lotNames: Record<string, string>; refreshLots: () => void }) {
  const { user } = useSession();
  const mine = usePolling(api.fetchMyReservations, 8000, user?.username ?? "", Boolean(user));
  const [confirming, setConfirming] = useState<string | null>(null);
  const [showPass, setShowPass] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  if (!user) return <LoginRequired title="Your reservations" next="/reservations" />;

  const now = Date.now() / 1000;
  const list = mine.data?.reservations ?? [];
  const groups: Record<Phase, MyReservation[]> = { active: [], upcoming: [], past: [] };
  for (const r of list) groups[phaseOf(r, now)].push(r);
  groups.past.reverse();
  const unreachable = (mine.data?.unreachable_lots ?? []).map((id) => lotNames[id] ?? id);

  const cancel = async (r: MyReservation) => {
    setBusy(r.id);
    setMessage(null);
    const out = await api.cancelReservation(r.lot_id, r.id);
    setBusy(null);
    setConfirming(null);
    const texts: Record<api.CancelOutcome, { tone: "ok" | "error"; text: string }> = {
      cancelled: { tone: "ok", text: `Your reservation at ${r.lot_name} is cancelled. Bay ${r.space_id} is free again.` },
      already_cancelled: { tone: "ok", text: "That reservation was already cancelled." },
      forbidden: { tone: "error", text: "Only the driver who made a reservation can cancel it." },
      not_found: { tone: "error", text: "We couldn't find that reservation. It may have been removed." },
      unreachable: { tone: "error", text: `${r.lot_name} is temporarily unavailable, so the reservation is still in place. Try again shortly.` },
      failed: { tone: "error", text: "We couldn't cancel that reservation. Please try again." },
    };
    setMessage(texts[out]);
    mine.refresh();
    refreshLots();
  };

  const section = (phase: Phase, title: string) =>
    groups[phase].length > 0 && (
      <div className="res-group" key={phase}>
        <h2 className="res-group-title">{title} <span>{groups[phase].length}</span></h2>
        <ul className="res-list">
          {groups[phase].map((r) => (
            <li key={`${r.lot_id}-${r.id}`} className={`res-row ${phase}`}>
              <span className="lot-number">P<span>{r.space_id.replace(/^S/, "")}</span></span>
              <div className="res-main">
                <h3>{r.lot_name}</h3>
                <p>{areaOf({ id: r.lot_id })} · Bay {r.space_id}</p>
                <p className="res-when"><CalendarClock size={16} /> {windowText(r.start_ts, r.end_ts)}</p>
              </div>
              <div className="res-side">
                <span className={`status-chip ${phase}`}>
                  {phase === "active" ? "Active now" : phase === "upcoming" ? "Confirmed" : "Ended"}
                </span>
                <strong>{money(r.total_price)}<span> CAD</span></strong>
                <small>{money(r.price_per_hour)}/hr</small>
                {phase !== "past" &&
                  (confirming === r.id ? (
                    <span className="confirm-cancel" role="group" aria-label="Confirm cancellation">
                      <button className="reserve-button danger" onClick={() => cancel(r)} disabled={busy === r.id} aria-busy={busy === r.id}>
                        {busy === r.id ? "Cancelling…" : "Yes, cancel"}
                      </button>
                      <button className="text-link" onClick={() => setConfirming(null)} disabled={busy === r.id}>Keep it</button>
                    </span>
                  ) : (
                    <button className="reserve-button" onClick={() => setConfirming(r.id)}>Cancel reservation</button>
                  ))}
                {phase !== "past" && r.pass && (
                  <button className="text-link pass-toggle" aria-expanded={showPass === r.id} onClick={() => setShowPass(showPass === r.id ? null : r.id)}>
                    <QrCode size={15} /> {showPass === r.id ? "Hide entry pass" : "Show entry pass"}
                  </button>
                )}
              </div>
              {phase !== "past" && r.pass && showPass === r.id && (
                <EntryPass pass={r.pass} lotName={r.lot_name} spaceId={r.space_id} start={r.start_ts} end={r.end_ts} />
              )}
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <main id="main" className="page shell">
      <header className="page-head">
        <div>
          <span className="eyebrow"><span className="mini-line" /> YOUR PARKING</span>
          <h1>Your reservations.</h1>
          <p>Every space you've reserved, across all GeoPark lots. Signed in as <strong>{user.username}</strong>.</p>
        </div>
        <a className="button" href="#/book">Reserve another space</a>
      </header>

      {message && (
        <div className={`notice ${message.tone === "ok" ? "ok" : "error"}`} role="status">
          {message.tone === "ok" ? <Check size={18} /> : <AlertCircle size={18} />} {message.text}
        </div>
      )}
      {unreachable.length > 0 && (
        <div className="notice warn" role="status">
          <AlertCircle size={18} /> We couldn't reach {unreachable.join(", ")} just now, so reservations there may be missing. They're still safe at the lot.
        </div>
      )}
      {mine.failed && (
        <div className="notice warn" role="status">
          <AlertCircle size={18} /> We can't reach GeoPark right now. <button className="text-link" onClick={mine.refresh}><RotateCcw size={14} /> Try again</button>
        </div>
      )}

      {mine.data === null && !mine.failed ? (
        <p className="loading">Loading your reservations…</p>
      ) : list.length === 0 && !mine.failed ? (
        <div className="empty-state boxed">
          <CalendarClock size={28} />
          <h3>No reservations yet</h3>
          <p>Find a lot, choose how long you'll stay, and the lot will hold a space for you.</p>
          <a className="button" href="#/book">Find a parking space</a>
        </div>
      ) : (
        <>
          {section("active", "Active now")}
          {section("upcoming", "Upcoming")}
          {section("past", "Past")}
        </>
      )}
      <p className="page-foot">Times are shown in your local time. No payment is collected for GeoPark reservations.</p>
    </main>
  );
}
