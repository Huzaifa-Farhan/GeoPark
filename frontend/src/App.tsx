import { useEffect, useMemo, useRef, useState } from "react";
import {
  cancelReservation,
  fetchFeed,
  fetchHistory,
  fetchLog,
  fetchLots,
  fetchPricing,
  fetchRecommendations,
  setPartition,
  setSimClock,
  setSpace,
} from "./api";
import { usePolling } from "./usePolling";
import { ORIGINS, registerLots } from "./format";
import type { Lot, MyReservation, RecommendResponse } from "./types";
import Header from "./components/Header";
import KpiStrip from "./components/KpiStrip";
import LotMap from "./components/LotMap";
import SensorFeed from "./components/SensorFeed";
import LotCard from "./components/LotCard";
import BayMap from "./components/BayMap";
import ReserveForm from "./components/ReserveForm";
import SearchPanel, { type SearchState } from "./components/SearchPanel";
import MyReservations from "./components/MyReservations";
import DemoPanel from "./components/DemoPanel";
import ActivityLog from "./components/ActivityLog";
import TrendCharts from "./components/TrendCharts";
import PricingPanel from "./components/PricingPanel";

export default function App() {
  const { data: lotsData, failed, refresh: refreshLots } = usePolling(fetchLots, 2000);
  const { data: logData } = usePolling(fetchLog, 2000);
  const { data: feedData } = usePolling(fetchFeed, 1500);
  const { data: historyData } = usePolling(fetchHistory, 4000);
  const { data: pricingData } = usePolling(fetchPricing, 2000);
  const lots: Lot[] = lotsData ?? [];
  registerLots(lots.map((l) => l.id));

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pricingLot, setPricingLot] = useState<string | null>(null);
  const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchState>({ originId: "campus", priority: "balanced", preferred: "", hours: 1 });
  const [rec, setRec] = useState<RecommendResponse | null>(null);
  const [mine, setMine] = useState<MyReservation[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [cut, setCut] = useState<Set<string>>(new Set());
  const detailRef = useRef<HTMLDivElement>(null);

  const origin = ORIGINS.find((o) => o.id === search.originId);

  // Re-run the search whenever the inputs change and every 2 s so the ranking tracks live data.
  useEffect(() => {
    let alive = true;
    const run = () =>
      fetchRecommendations({
        lat: origin?.lat,
        lng: origin?.lng,
        priority: search.priority,
        preferred: search.preferred || undefined,
        hours: search.hours,
      })
        .then((r) => alive && setRec(r))
        .catch(() => undefined);
    run();
    const id = setInterval(run, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [origin?.lat, origin?.lng, search.priority, search.preferred, search.hours]);

  const selected = useMemo(() => lots.find((l) => l.id === selectedId) ?? null, [lots, selectedId]);
  const simTime = lots.find((l) => !l.stale)?.sim_time ?? lots[0]?.sim_time ?? "--:--";
  const peak = (pricingData ?? []).some((p) => p.peak);

  const pickLot = (id: string) => {
    setSelectedId(id);
    setPricingLot(id);
    setSelectedSpace(null);
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const cancel = async (r: MyReservation) => {
    if (await cancelReservation(r.lot_id, r.id)) setMine((m) => m.filter((x) => x.id !== r.id));
    refreshLots();
  };

  const togglePartition = async (lot: Lot) => {
    const on = !cut.has(lot.id);
    if (await setPartition(lot.id, on)) {
      setCut((c) => {
        const n = new Set(c);
        on ? n.add(lot.id) : n.delete(lot.id);
        return n;
      });
    }
  };

  const fill = async (lot: Lot) => {
    const free = Object.entries(lot.spaces).filter(([, s]) => s === "free").map(([id]) => id);
    await Promise.all(free.map((id) => setSpace(lot.id, id, true)));
    refreshLots();
  };

  return (
    <div className="min-h-screen">
      <Header lots={lots} simTime={simTime} peak={peak} connected={!failed && lotsData !== null} />

      {/* hero band */}
      <div className="bg-gradient-to-br from-navy via-navy-dark to-navy-deep pb-16 text-white">
        <div className="mx-auto max-w-[1440px] px-4 pt-6">
          <p className="eyebrow !text-tangerine">Smart parking for Durham Region</p>
          <h2 className="mt-1 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            Find, reserve and pay a fair price for parking, in real time.
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-white/70">
            Every lot is an independent service with its own simulated IoT sensors, database and demand-based pricing. A coordinator combines their live
            reports so you see one view of the city.
          </p>
        </div>
      </div>

      <div className="mx-auto -mt-12 max-w-[1440px] px-4">
        <KpiStrip lots={lots} feed={feedData ?? []} />
      </div>

      <main className="mx-auto grid max-w-[1440px] gap-5 p-4 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-5 lg:sticky lg:top-[84px] lg:max-h-[calc(100vh-96px)] lg:self-start lg:overflow-auto lg:pb-2">
          <SearchPanel lots={lots} search={search} onChange={setSearch} rec={rec} onPick={pickLot} />
          <MyReservations items={mine} onCancel={cancel} />
          <DemoPanel
            lots={lots}
            cut={cut}
            demoMode={demoMode}
            onDemoMode={setDemoMode}
            onTogglePartition={togglePartition}
            onFill={fill}
            onClock={(h, running) => setSimClock(h, running)}
          />
        </aside>

        <section className="min-w-0 space-y-5">
          {failed && (
            <div role="alert" className="rounded-lg border-l-4 border-stop bg-stop/10 p-3 text-sm font-semibold">
              Cannot reach the coordination service. Is the backend running (python run_all.py)? Showing the last data received.
            </div>
          )}
          {lotsData === null && !failed && <p>Loading lots...</p>}

          <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
            <LotMap lots={lots} selectedId={selectedId} recommendedId={rec?.recommended ?? null} origin={origin} onSelect={pickLot} />
            <SensorFeed feed={lots.length ? feedData ?? [] : []} />
          </div>

          <div>
            <div className="mb-2 flex items-end justify-between">
              <div>
                <p className="eyebrow">Real-time availability</p>
                <h2 className="card-title">Parking lots</h2>
              </div>
              <p className="text-xs text-asphalt/60">Click a lot to see its bays and reserve</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              {lots.map((l) => (
                <LotCard key={l.id} lot={l} selected={l.id === selectedId} recommended={rec?.recommended === l.id} onSelect={() => pickLot(l.id)} />
              ))}
            </div>
          </div>

          <div ref={detailRef} className="scroll-mt-24" />
          {selected && (
            <section className="card animate-slideIn">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="eyebrow">Reserve a bay</p>
                  <h2 className="font-display text-2xl font-extrabold text-navy">{selected.name}</h2>
                </div>
                <div className="flex gap-2 text-xs font-semibold">
                  <span className="rounded-md bg-go/10 px-2 py-1 text-go">{selected.free} free</span>
                  <span className="rounded-md bg-asphalt/10 px-2 py-1">{selected.occupied} occupied</span>
                  <span className="rounded-md bg-simcoe/10 px-2 py-1 text-simcoe-dark">{selected.reserved} reserved</span>
                </div>
              </div>
              {selected.stale && (
                <div className="mb-3 overflow-hidden rounded-lg border border-asphalt/20">
                  <div className="hazard h-2" aria-hidden />
                  <p className="p-2 text-sm">
                    This lot has not reported for {Math.round(selected.age_seconds)}s. The bay map shows its last known state, and the lot may still be
                    accepting its own bookings. Reservations are confirmed by the lot itself, so a request will fail safely if it cannot be reached.
                  </p>
                </div>
              )}
              <BayMap
                lot={selected}
                selectedSpace={selectedSpace}
                demoMode={demoMode}
                onPick={setSelectedSpace}
                onToggleSensor={(id, occupied) => setSpace(selected.id, id, !occupied).then(refreshLots)}
              />
              <div className="mt-4 border-t border-navy/10 pt-4">
                <ReserveForm
                  lot={selected}
                  selectedSpace={selectedSpace}
                  origin={origin}
                  onReserved={(r) => {
                    setMine((m) => [r, ...m]);
                    setSelectedSpace(null);
                    refreshLots();
                  }}
                  onSwitchLot={pickLot}
                />
              </div>
            </section>
          )}

          <PricingPanel pricing={pricingData ?? []} lots={lots} lotId={pricingLot ?? rec?.recommended ?? null} onLot={setPricingLot} />

          <TrendCharts lots={lots} history={historyData ?? {}} />

          <ActivityLog entries={logData ?? []} />
        </section>
      </main>

      <footer className="mt-6 bg-navy-deep py-5 text-center text-xs text-white/60">
        GeoPark, SOFE4790U Distributed Systems, Group 5, Ontario Tech University. Simulated sensors and prices; no real payments.
      </footer>
    </div>
  );
}
