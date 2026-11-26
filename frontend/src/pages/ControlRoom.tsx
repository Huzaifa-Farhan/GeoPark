import { Activity, AlertCircle, CheckCircle2, Clock3, Info, Radio, RotateCcw, Unplug, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { OperatorsOnly, LoginRequired } from "../components/Gate";
import { LineChart, SERIES_COLOURS, type Series } from "../components/LineChart";
import { BayMap, DayChart, PriceBreakdown } from "../components/LotPanels";
import * as api from "../lib/api";
import { useCutLots } from "../lib/cut";
import { ago, clock, hourLabel, money, pct, windowText } from "../lib/format";
import { demandLevel, isPeak, shortName, simHourOf, sortedSpaces } from "../lib/lots";
import { useSession } from "../lib/session";
import { usePolling } from "../lib/usePolling";
import type { FeedEvent, Lot, LotsResponse } from "../lib/types";

const PRESETS = [
  { hour: 3, label: "03:00", note: "Quiet night" },
  { hour: 8.5, label: "08:30", note: "Morning rush" },
  { hour: 12, label: "12:00", note: "Midday" },
  { hour: 17.5, label: "17:30", note: "Evening rush" },
];

const secClock = (t: number) =>
  new Date(t * 1000).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", second: "2-digit" });

export function ControlRoom({ lotsData, refreshLots }: { lotsData: LotsResponse | null; refreshLots: () => void }) {
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const lots = useMemo(() => [...(lotsData?.lots ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [lotsData]);
  const colour = (id: string) => SERIES_COLOURS[Math.max(0, lots.findIndex((l) => l.id === id)) % SERIES_COLOURS.length];

  const pricing = usePolling(api.fetchPricing, 3000, "", isAdmin);
  const history = usePolling(api.fetchHistory, 3000, "", isAdmin);
  const feed = usePolling(() => api.fetchFeed(40), 2000, "", isAdmin);
  const log = usePolling(api.fetchLog, 2500, "", isAdmin);

  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if ((!selected || !lots.some((l) => l.id === selected)) && lots.length) setSelected(lots[0].id);
  }, [lots, selected]);
  const lot = lots.find((l) => l.id === selected) ?? null;

  if (!user) return <LoginRequired title="Control room" next="/admin" />;
  if (!isAdmin) return <OperatorsOnly />;

  const simHour = simHourOf(lots);
  const live = lots.filter((l) => !l.stale);
  const free = lots.reduce((s, l) => s + (l.stale ? 0 : l.free), 0);
  const capacity = lots.reduce((s, l) => s + l.capacity, 0);
  const occ = live.length ? live.reduce((s, l) => s + l.occupancy, 0) / live.length : 0;

  return (
    <main id="main" className="control">
      <section className="cr-hero">
        <div className="shell">
          <span className="eyebrow">CONTROL ROOM · OPERATOR VIEW</span>
          <h1>The whole network,<br /><span>at a glance.</span></h1>
          <p>Live readings from every lot, the controls used in the demo, and the numbers behind each price.</p>
          <dl className="kpis">
            <div><dt>Lots connected</dt><dd>{live.length}<span> / {lots.length}</span></dd></div>
            <div><dt>Free spaces</dt><dd>{free}<span> / {capacity}</span></dd></div>
            <div><dt>Average occupancy</dt><dd>{pct(occ)}</dd></div>
            <div>
              <dt>Simulated time</dt>
              <dd>{simHour != null ? hourLabel(simHour) : "--:--"}{isPeak(simHour) && <span className="peak-tag">PEAK</span>}</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="shell cr-body">
        <div className="cr-two">
          <ClockPanel simHour={simHour} lotsCount={lots.length} onChanged={refreshLots} />
          <LogPanel entries={log.data ?? []} failed={log.failed} />
        </div>

        <LotsPanel lots={lots} selected={selected} onSelect={setSelected} refreshLots={refreshLots} colour={colour} staleAfter={lotsData?.stale_after ?? 6} />

        {lot && <LotDetail lot={lot} pricing={pricing.data?.lots.find((p) => p.id === lot.id) ?? null} refreshLots={refreshLots} />}

        <section className="panel">
          <header className="panel-head">
            <div>
              <span className="eyebrow">TRENDS · LAST FEW MINUTES</span>
              <h2>How the lots are filling.</h2>
            </div>
            <p>Sampled from each lot's reports every two seconds. Hover a chart to read exact values.</p>
          </header>
          <TrendCharts lots={lots} history={history.data ?? {}} colour={colour} />
        </section>

        <FeedPanel events={feed.data ?? []} failed={feed.failed} />
      </div>
    </main>
  );
}

// ---- simulated clock ---------------------------------------------------------------------------------
function ClockPanel({ simHour, lotsCount, onChanged }: { simHour: number | null; lotsCount: number; onChanged: () => void }) {
  const [hour, setHour] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const shown = hour ?? (simHour != null ? Math.round(simHour * 2) / 2 : 8);

  const apply = async (h: number, running: boolean) => {
    setBusy(true);
    const ok = await api.setSimClock(h, running);
    setBusy(false);
    setHour(null);
    setStatus(ok
      ? { ok: true, text: `All ${lotsCount} lots now read ${hourLabel(h)}${running ? " and the clock is running" : ", paused"}.` }
      : { ok: false, text: "The clock change didn't go through. Try again." });
    onChanged();
  };

  return (
    <section className="panel">
      <header className="panel-head compact">
        <div>
          <span className="eyebrow">SIMULATED CLOCK</span>
          <h2>Move the time of day.</h2>
        </div>
      </header>
      <p className="panel-copy">Prices and sensor activity follow a simulated clock (1 real second = 4 minutes), so rush hours can be shown in a few seconds.</p>
      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.hour} className="preset" onClick={() => apply(p.hour, false)} disabled={busy}>
            <strong>{p.label}</strong>
            <span>{p.note}</span>
          </button>
        ))}
      </div>
      <label className="range-field">
        <span>Set a time: <strong>{hourLabel(shown)}</strong> {demandLevel(shown) >= 0.5 && <span className="peak-tag light">PEAK</span>}</span>
        <input type="range" min={0} max={23.5} step={0.5} value={shown} onChange={(e) => setHour(Number(e.target.value))} aria-label="Simulated hour" />
      </label>
      <div className="row-actions">
        <button className="button small" onClick={() => apply(shown, false)} disabled={busy}>Pin {hourLabel(shown)}</button>
        <button className="secondary-button" onClick={() => apply(shown, true)} disabled={busy}><Clock3 size={16} /> Run from {hourLabel(shown)}</button>
      </div>
      {status && <p className={`inline-status ${status.ok ? "ok" : "error"}`} role="status">{status.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {status.text}</p>}
    </section>
  );
}

// ---- lots table --------------------------------------------------------------------------------------
function LotsPanel({
  lots, selected, onSelect, refreshLots, colour, staleAfter,
}: { lots: Lot[]; selected: string | null; onSelect: (id: string) => void; refreshLots: () => void; colour: (id: string) => string; staleAfter: number }) {
  const { cut, mark } = useCutLots();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (l: Lot, what: string, fn: () => Promise<boolean>) => {
    setBusy(`${l.id}:${what}`);
    setError(null);
    const ok = await fn();
    setBusy(null);
    if (!ok) setError(`${l.name}: that didn't go through. Is the lot running?`);
    refreshLots();
    return ok;
  };

  // Fill marks every bay that isn't reserved as occupied by the operator - including bays a simulated
  // sensor already filled - so the lot is held full instead of emptying as those cars "leave".
  const setAll = (l: Lot, from: "free" | "occupied", occupied: boolean) => async () => {
    const bays = sortedSpaces(l)
      .filter(([, s]) => (occupied ? s !== "reserved" : s === from))
      .map(([id]) => id);
    const results = await Promise.all(bays.map((id) => api.setSpace(l.id, id, occupied)));
    return results.every(Boolean);
  };

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <span className="eyebrow">LOTS</span>
          <h2>Every lot, live.</h2>
        </div>
        <p>A lot is marked stale after {staleAfter} seconds without a heartbeat. Cutting a link stops its reports without stopping the lot.</p>
      </header>
      {error && <p className="inline-status error" role="alert"><AlertCircle size={16} /> {error}</p>}
      <div className="table-scroll">
        <table className="lots-table">
          <thead>
            <tr>
              <th scope="col">Lot</th>
              <th scope="col">Link</th>
              <th scope="col">Free</th>
              <th scope="col">Occupancy</th>
              <th scope="col">Rate</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => {
              const isCut = cut.includes(l.id);
              const b = (w: string) => busy === `${l.id}:${w}`;
              return (
                <tr key={l.id} className={selected === l.id ? "chosen" : ""}>
                  <th scope="row">
                    <button className="lot-link" onClick={() => onSelect(l.id)} aria-pressed={selected === l.id}>
                      <span className="key" style={{ background: colour(l.id) }} aria-hidden="true" />
                      {l.name}
                    </button>
                  </th>
                  <td>
                    <span className={`status-chip ${l.stale ? "stale" : "live"}`}>
                      {l.stale ? <Unplug size={14} /> : <Radio size={14} />}
                      {l.stale ? `Stale · ${ago(l.age_seconds)}` : `Live · ${ago(l.age_seconds)}`}
                    </span>
                    {isCut && !l.stale && <small className="cell-note">Link cut · going stale…</small>}
                  </td>
                  <td className="num">{l.free}<span className="muted"> / {l.capacity}</span></td>
                  <td>
                    <span className="occ">
                      <span className="occ-bar"><span style={{ width: pct(l.occupancy) }} /></span>
                      <span className="num">{pct(l.occupancy)}</span>
                    </span>
                  </td>
                  <td className="num">{money(l.price)}<span className="muted">/hr</span></td>
                  <td>
                    <div className="row-actions tight">
                      <button
                        className={`secondary-button ${isCut ? "" : "warn"}`}
                        disabled={busy !== null}
                        onClick={() => run(l, "link", async () => {
                          const ok = await api.setPartition(l.id, !isCut);
                          if (ok) mark(l.id, !isCut);
                          return ok;
                        })}
                      >
                        {isCut ? <RotateCcw size={15} /> : <Unplug size={15} />} {b("link") ? "…" : isCut ? "Reconnect" : "Cut link"}
                      </button>
                      <button className="secondary-button" disabled={busy !== null || l.stale} onClick={() => run(l, "fill", setAll(l, "free", true))}>
                        {b("fill") ? "Filling…" : "Fill lot"}
                      </button>
                      <button className="secondary-button" disabled={busy !== null || l.stale} onClick={() => run(l, "empty", setAll(l, "occupied", false))}>
                        {b("empty") ? "Emptying…" : "Empty lot"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="panel-foot"><Info size={15} /> Bays set to occupied by an operator stay occupied until an operator frees them; the simulated sensors leave them alone.</p>
    </section>
  );
}

// ---- one lot: bays, reservations, price ------------------------------------------------------------
function LotDetail({ lot, pricing, refreshLots }: { lot: Lot; pricing: import("../lib/types").LotPricing | null; refreshLots: () => void }) {
  const res = usePolling(() => api.fetchLotReservations(lot.id), 4000, lot.id);
  const [busyBay, setBusyBay] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const now = Date.now() / 1000;

  const flip = async (id: string, state: string) => {
    setBusyBay(id);
    const ok = await api.setSpace(lot.id, id, state !== "occupied");
    setBusyBay(null);
    setNote(ok ? null : `Bay ${id} couldn't be changed. Is the lot running?`);
    refreshLots();
  };

  const cancel = async (rid: string) => {
    setCancelling(rid);
    const out = await api.cancelReservation(lot.id, rid);
    setCancelling(null);
    setNote(out === "cancelled" || out === "already_cancelled" ? null : "That reservation couldn't be cancelled right now.");
    res.refresh();
    refreshLots();
  };

  const upcoming = (res.data ?? []).filter((r) => r.end_ts > now);

  return (
    <section className="panel detail">
      <header className="panel-head">
        <div>
          <span className="eyebrow">SELECTED LOT</span>
          <h2>{lot.name}</h2>
        </div>
        <p>
          {lot.stale ? "No recent report: the figures below are the last ones received." : `Updated ${ago(lot.age_seconds)} · ${lot.events_applied} updates applied`}
        </p>
      </header>
      {note && <p className="inline-status error" role="alert"><AlertCircle size={16} /> {note}</p>}
      <div className="detail-grid">
        <div>
          <h3 className="sub">Bays <span className="muted">· select one to flip its sensor</span></h3>
          <BayMap lot={lot} mode="operator" busy={busyBay !== null} onBay={flip} />

          <h3 className="sub">Reservations <span className="muted">· {upcoming.length} current or upcoming</span></h3>
          {res.data === null ? (
            <p className="muted small">{res.failed ? "This lot isn't answering right now." : "Loading…"}</p>
          ) : upcoming.length === 0 ? (
            <p className="muted small">No current or upcoming reservations.</p>
          ) : (
            <ul className="admin-res">
              {upcoming.map((r) => (
                <li key={r.id}>
                  <div>
                    <strong>Bay {r.space_id} · {r.driver}</strong>
                    <span>{windowText(r.start_ts, r.end_ts)} · {money(r.total_price)}{r.owner ? "" : " · kiosk"}</span>
                  </div>
                  <button className="text-link" onClick={() => cancel(r.id)} disabled={cancelling !== null}>
                    {cancelling === r.id ? "Cancelling…" : "Cancel"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="sub">Why it costs {money(lot.price)}/hr</h3>
          {pricing ? (
            <>
              <PriceBreakdown pricing={pricing} />
              <DayChart lot={lot} pricing={pricing} modes={["capacity", "price"]} />
            </>
          ) : (
            <p className="muted small">Loading the price breakdown…</p>
          )}
        </div>
      </div>
    </section>
  );
}

// ---- trends ------------------------------------------------------------------------------------------
function TrendCharts({ lots, history, colour }: { lots: Lot[]; history: Record<string, import("../lib/types").HistorySample[]>; colour: (id: string) => string }) {
  const bucket = (t: number) => Math.round(t / 2) * 2; // lots sample on their own beat; align to 2 s for the table
  const series = (key: "occupancy" | "price"): Series[] =>
    lots.map((l) => ({
      id: l.id,
      name: shortName(l),
      color: colour(l.id),
      points: (history[l.id] ?? []).map((s) => ({ x: bucket(s.t), y: key === "occupancy" ? s.occupancy * 100 : s.price })),
    }));
  const all = Object.values(history).flat();
  if (!all.length) return <p className="chart-empty">Collecting data… the charts fill in as the lots report.</p>;
  const t0 = Math.min(...all.map((s) => s.t));
  const t1 = Math.max(...all.map((s) => s.t));
  const ticks = [0, 1, 2, 3].map((i) => t0 + ((t1 - t0) * i) / 3);
  const maxPrice = Math.max(...lots.map((l) => l.max_price), 1);
  const top = Math.ceil(maxPrice);
  return (
    <div className="trend-stack">
      <LineChart
        title="Occupancy (%)"
        series={series("occupancy")}
        xDomain={[t0, t1]} xTicks={ticks} xFormat={secClock}
        yDomain={[0, 100]} yTicks={[0, 25, 50, 75, 100]} yFormat={(v) => `${Math.round(v)}%`}
        tableRows={30}
      />
      <LineChart
        title="Hourly rate (CAD)"
        series={series("price")}
        xDomain={[t0, t1]} xTicks={ticks} xFormat={secClock}
        yDomain={[0, top]} yTicks={[0, Math.round(top / 2), top]} yFormat={(v) => money(v)}
        tableRows={30}
      />
    </div>
  );
}

// ---- feed and log --------------------------------------------------------------------------------------
function describe(e: FeedEvent) {
  const p = e.payload as Record<string, string | boolean | undefined>;
  if (e.type === "sensor") {
    return `Bay ${p.space_id} ${p.occupied ? "occupied" : "now free"}${p.source === "manual" ? " (set by operator)" : ""}`;
  }
  if (e.type === "reservation_created") return `Bay ${p.space_id} reserved`;
  if (e.type === "reservation_cancelled") return `Reservation cancelled · bay ${p.space_id}`;
  return e.type.replace(/_/g, " ");
}

function FeedPanel({ events, failed }: { events: FeedEvent[]; failed: boolean }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <span className="eyebrow">LIVE SENSOR FEED</span>
          <h2>What the lots are reporting.</h2>
        </div>
        <p>Sensor readings and booking events from each lot's outbox, in the order the coordinator received them.</p>
      </header>
      {failed && <p className="inline-status error"><AlertCircle size={16} /> Can't reach the coordinator. Showing the last events received.</p>}
      {events.length === 0 ? (
        <p className="muted small">No events yet. Sensor changes appear here within a couple of seconds.</p>
      ) : (
        <ol className="feed" aria-live="off">
          {[...events].reverse().map((e) => (
            <li key={`${e.lot_id}-${e.seq}`} className={e.type}>
              <span className="feed-icon" aria-hidden="true">{e.type === "sensor" ? <Activity size={15} /> : <CheckCircle2 size={15} />}</span>
              <span className="feed-lot">{shortName({ id: e.lot_id, name: e.lot_name })}</span>
              <span className="feed-text">{describe(e)}</span>
              <time className="feed-time">{clock(e.received_at)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function LogPanel({ entries, failed }: { entries: import("../lib/types").LogEntry[]; failed: boolean }) {
  const icon = { success: <CheckCircle2 size={15} />, warning: <AlertCircle size={15} />, info: <Info size={15} /> };
  const label = { success: "OK", warning: "Attention", info: "Info" };
  return (
    <section className="panel">
      <header className="panel-head compact">
        <div>
          <span className="eyebrow">ACTIVITY LOG</span>
          <h2>What the coordinator noticed.</h2>
        </div>
      </header>
      {failed && <p className="inline-status error"><X size={16} /> Can't reach the coordinator.</p>}
      <ol className="log">
        {[...entries].reverse().slice(0, 40).map((e, i) => (
          <li key={`${e.t}-${i}`} className={e.level}>
            <span className="log-level">{icon[e.level]}<span className="sr-only">{label[e.level]}</span></span>
            <span>{e.message}</span>
            <time>{secClock(e.t)}</time>
          </li>
        ))}
        {entries.length === 0 && <li className="muted small">Nothing yet.</li>}
      </ol>
    </section>
  );
}
