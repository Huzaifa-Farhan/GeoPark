import { AlertCircle, ChevronDown, LocateFixed, Radio, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookingDialog } from "../components/BookingDialog";
import { LoginRequired } from "../components/Gate";
import { BayMap, DayChart } from "../components/LotPanels";
import { MapArt } from "../components/MapArt";
import * as api from "../lib/api";
import { ago, money, spacesText } from "../lib/format";
import { areaOf, DOWNTOWN, isPeak, shortName, simHourOf } from "../lib/lots";
import { useSession } from "../lib/session";
import { usePolling } from "../lib/usePolling";
import type { LotsResponse, Priority, Recommendation } from "../lib/types";

const SORTS: { value: Priority; label: string }[] = [
  { value: "balanced", label: "Best overall" },
  { value: "closest", label: "Closest" },
  { value: "cheapest", label: "Lowest price" },
  { value: "availability", label: "Most spaces" },
];

const smooth = (): ScrollBehavior => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth");

export function Book({ lotsData, lotsFailed, refreshLots }: { lotsData: LotsResponse | null; lotsFailed: boolean; refreshLots: () => void }) {
  const { user } = useSession();
  const lots = useMemo(() => lotsData?.lots ?? [], [lotsData]);
  const byId = useMemo(() => Object.fromEntries(lots.map((l) => [l.id, l])), [lots]);
  const number = useMemo(() => {
    const ids = [...lots].sort((a, b) => a.name.localeCompare(b.name)).map((l) => l.id);
    return (id: string) => String(ids.indexOf(id) + 1).padStart(2, "0");
  }, [lots]);

  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<Priority>("balanced");
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState<{ lat: number; lng: number; label: string }>({ ...DOWNTOWN, label: "downtown Oshawa" });
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [booking, setBooking] = useState<{ lot: string; bay: string | null } | null>(null);
  const detailRef = useRef<HTMLElement>(null);

  const enabled = Boolean(user);
  // The selected lot is deliberately NOT sent as "preferred": the coordinator gives a preferred lot a ranking
  // bonus, which made rows jump around whenever a driver clicked one. The order depends only on the sort.
  const rec = usePolling(
    () => api.fetchRecommendations({ priority: sort, hours: 1, lat: origin.lat, lng: origin.lng }),
    2500,
    JSON.stringify([sort, origin.lat, origin.lng]),
    enabled,
  );

  // start on the coordinator's best pick
  useEffect(() => {
    if (!selected && rec.data?.recommended) setSelected(rec.data.recommended);
    else if (!selected && lots.length) setSelected([...lots].sort((a, b) => a.name.localeCompare(b.name))[0].id);
  }, [rec.data, lots, selected]);

  if (!user) return <LoginRequired title="Book parking" next="/book" />;

  const recs: Recommendation[] = rec.data?.results ?? [];
  const recById = Object.fromEntries(recs.map((r) => [r.id, r]));
  const q = query.trim().toLowerCase();
  const ordered = recs.length ? recs.map((r) => byId[r.id]).filter(Boolean) : lots;
  const rows = ordered.filter((l) => `${l.name} ${areaOf(l)} ${shortName(l)}`.toLowerCase().includes(q));
  const lot = selected ? byId[selected] : undefined;
  const simTime = lots.find((l) => !l.stale)?.sim_time ?? null;
  const peak = isPeak(simHourOf(lots));
  const best = rec.data?.recommended ? byId[rec.data.recommended] : undefined;
  // "This lot is full, try X" - decided from the selected lot's own live numbers
  const selectedFull = Boolean(lot && !lot.stale && lot.free <= 0 && best && best.id !== lot.id);

  const select = (id: string, scroll = false) => {
    setSelected(id);
    if (scroll) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: smooth(), block: "start" }));
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setLocError("Your browser can't share a location. Distances are from downtown Oshawa.");
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setOrigin({ lat: p.coords.latitude, lng: p.coords.longitude, label: "your location" });
        setLocating(false);
      },
      () => {
        setLocError("We couldn't get your location. Distances are from downtown Oshawa.");
        setLocating(false);
      },
      { timeout: 8000, maximumAge: 60000 },
    );
  };

  return (
    <main id="main" className="book-page">
      <section className="finder-section">
        <div className="shell">
          <div className="section-heading">
            <div>
              <span className="eyebrow"><span className="mini-line" /> BOOK PARKING</span>
              <h1 className="book-title">Where are you headed?</h1>
            </div>
            <span className={`demo-badge ${peak ? "peak" : ""}`} title="GeoPark runs on a simulated clock so rush hours can be demonstrated">
              {simTime ? `SIMULATED TIME ${simTime}${peak ? " · PEAK PRICING" : ""}` : "LIVE AVAILABILITY"}
            </span>
          </div>
          <p className="finder-intro">
            {lots.length ? `${lots.length} lots across Oshawa, ranked from ${origin.label}. ` : ""}
            Pick a lot to see every bay, then reserve a space.
          </p>
          <div className="finder-toolbar">
            <label className="search-field">
              <Search size={19} />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a lot or neighbourhood" aria-label="Search parking lots" />
            </label>
            <div className="toolbar-right">
              {origin.label === "downtown Oshawa" ? (
                <button className="text-link with-icon" onClick={useMyLocation} disabled={locating}>
                  <LocateFixed size={16} /> {locating ? "Finding you…" : "Use my location"}
                </button>
              ) : (
                <button className="text-link with-icon" onClick={() => setOrigin({ ...DOWNTOWN, label: "downtown Oshawa" })}>
                  <RotateCcw size={16} /> Measure from downtown
                </button>
              )}
              <label className="sort-field">
                <SlidersHorizontal size={17} />
                <span className="sr-only">Sort parking lots</span>
                <select aria-label="Sort parking lots" value={sort} onChange={(e) => setSort(e.target.value as Priority)}>
                  {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <ChevronDown size={15} />
              </label>
            </div>
          </div>
          {locError && <p className="toolbar-note" role="status">{locError}</p>}
          {selectedFull && best && (
            <div className="banner" role="status">
              <AlertCircle size={20} />
              <p>
                <strong>{lot?.name} is full.</strong> Try {best.name}
                {recById[best.id]?.eta_min != null ? `, ${recById[best.id].eta_min} min away` : ""} · {spacesText(best.free)} · {money(best.price)}/hr.
              </p>
              <button className="button small" onClick={() => select(best.id, true)}>View {shortName(best)}</button>
            </div>
          )}
          {lotsFailed && lots.length > 0 && (
            <div className="banner warn" role="status">
              <AlertCircle size={20} />
              <p>We can't reach GeoPark right now. Showing the last known availability; reservations may not go through.</p>
            </div>
          )}
          <div className="finder-grid">
            <div className="lots-list" aria-live="polite">
              {lots.length === 0 ? (
                <div className="empty-state">
                  <Radio size={26} />
                  <h3>{lotsFailed ? "We can't reach GeoPark" : "Looking for lots…"}</h3>
                  <p>{lotsFailed ? "The coordinator isn't answering. Check that the backend is running." : "Availability appears as soon as the lots report in."}</p>
                  {lotsFailed && <button className="text-link" onClick={refreshLots}>Try again</button>}
                </div>
              ) : rows.length ? (
                rows.map((l) => {
                  const r = recById[l.id];
                  const unavailable = l.stale;
                  const full = !l.stale && l.free <= 0;
                  return (
                    <article key={l.id} className={`lot-row ${selected === l.id ? "chosen" : ""}`}>
                      <button className="lot-select" onClick={() => select(l.id, true)} aria-pressed={selected === l.id}>
                        <span className="lot-number">P<span>{number(l.id)}</span></span>
                        <div>
                          <h3>
                            {l.name}
                            {rec.data?.recommended === l.id && <span className="pick-tag">Best match</span>}
                          </h3>
                          <p>
                            {areaOf(l)}
                            {r?.distance_km != null ? ` · ${r.distance_km} km` : ""}
                            {r?.eta_min != null ? ` · ${r.eta_min} min drive` : ""}
                          </p>
                          <span className={`availability ${unavailable || full ? "unavailable" : ""}`}>
                            <span className="status-dot" />
                            {unavailable ? "Temporarily unavailable" : full ? "Full right now" : spacesText(l.free)}
                          </span>
                        </div>
                      </button>
                      <div className="lot-price">
                        <strong>{money(l.price)}<span>/hr</span></strong>
                        <button className="reserve-button" disabled={unavailable || full} onClick={() => { setSelected(l.id); setBooking({ lot: l.id, bay: null }); }}>
                          {unavailable ? "Unavailable" : full ? "Full" : "Reserve"}
                        </button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="empty-state">
                  <Search size={26} />
                  <h3>No lots found</h3>
                  <p>Try “downtown”, “station” or “campus”.</p>
                  <button className="text-link" onClick={() => setQuery("")}>Clear search</button>
                </div>
              )}
              <div className="finder-disclaimer">Live availability from simulated sensors, updated every few seconds. CAD prices. No payment is collected.</div>
            </div>
            <div className="finder-map">
              <MapArt lots={lots} selected={selected} onSelect={(id) => select(id)} />
            </div>
          </div>
        </div>
      </section>

      {lot && (
        <section className="shell book-detail" ref={detailRef} aria-labelledby="lot-title">
          <div className="panel detail">
            <header className="panel-head">
              <div>
                <span className="eyebrow">INSIDE THE LOT</span>
                <h2 id="lot-title">{lot.name}</h2>
                <p className="lot-sub">
                  {areaOf(lot)} ·{" "}
                  <span className={`availability ${lot.stale || lot.free <= 0 ? "unavailable" : ""}`}>
                    <span className="status-dot" />
                    {lot.stale ? "Temporarily unavailable" : lot.free <= 0 ? "Full right now" : spacesText(lot.free)}
                  </span>
                </p>
              </div>
              <div className="lot-cta">
                <strong>{money(lot.price)}<span>/hr</span></strong>
                <button className="button" disabled={lot.stale || lot.free <= 0} onClick={() => setBooking({ lot: lot.id, bay: null })}>
                  {lot.stale ? "Temporarily unavailable" : lot.free <= 0 ? "No space free right now" : "Reserve any space"}
                </button>
              </div>
            </header>
            {lot.stale && (
              <div className="notice warn" role="status">
                <AlertCircle size={18} /> This lot is temporarily unavailable. The bays below are its last report from {ago(lot.age_seconds)}. Try a nearby lot.
              </div>
            )}
            <div className="detail-grid">
              <div>
                <h3 className="sub">Bays <span className="muted">· choose a free bay to reserve it</span></h3>
                <BayMap lot={lot} mode="driver" onBay={(id) => setBooking({ lot: lot.id, bay: id })} />
                <p className="muted small bay-note">Each bay has its own sensor. A car icon means the bay is occupied right now; blue bays are held for a reservation.</p>
              </div>
              <div>
                <h3 className="sub">How busy it gets</h3>
                <p className="muted small chart-intro">Busiest around the morning and evening rush. Plan around the peaks for an easier space.</p>
                <DayChart lot={lot} modes={["capacity"]} />
              </div>
            </div>
          </div>
        </section>
      )}

      <BookingDialog
        lot={booking ? byId[booking.lot] ?? null : null}
        initialSpace={booking?.bay ?? null}
        origin={origin}
        simTime={simTime}
        onClose={() => setBooking(null)}
        onSwitchLot={(id) => { setSelected(id); setBooking({ lot: id, bay: null }); }}
        onBooked={refreshLots}
      />
    </main>
  );
}
