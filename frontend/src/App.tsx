import { useEffect, useMemo, useRef, useState } from "react";
import { cancelReservation, fetchLog, fetchLots, fetchRecommendations, setPartition, setSimClock, setSpace } from "./api";
import { usePolling } from "./usePolling";
import { ORIGINS } from "./format";
import type { Lot, MyReservation, RecommendResponse } from "./types";
import LotCard from "./components/LotCard";
import BayMap from "./components/BayMap";
import ReserveForm from "./components/ReserveForm";
import SearchPanel, { type SearchState } from "./components/SearchPanel";
import MyReservations from "./components/MyReservations";
import DemoPanel from "./components/DemoPanel";
import ActivityLog from "./components/ActivityLog";

export default function App() {
  const { data: lotsData, failed, refresh: refreshLots } = usePolling(fetchLots, 2000);
  const { data: logData } = usePolling(fetchLog, 2000);
  const lots: Lot[] = lotsData ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const staleCount = lots.filter((l) => l.stale).length;
  const simTime = lots.find((l) => !l.stale)?.sim_time ?? lots[0]?.sim_time ?? "--:--";

  const pickLot = (id: string) => {
    setSelectedId(id);
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
      <header className="bg-asphalt text-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-sign font-display text-3xl font-bold ring-2 ring-white">P</span>
            <div>
              <h1 className="font-display text-3xl font-semibold leading-none">GeoPark</h1>
              <p className="text-xs text-white/60">Distributed smart parking</p>
            </div>
          </div>
          <div className="flex items-center gap-5 text-sm">
            <span>Simulated time <b className="font-display text-2xl">{simTime}</b></span>
            <span>
              <b>{lots.length - staleCount}</b> live
              {staleCount > 0 && <> / <b className="rounded bg-paint px-1.5 text-asphalt">{staleCount} stale</b></>}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] gap-5 p-4 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-5">
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

        <section className="space-y-5">
          {failed && (
            <div role="alert" className="rounded-md border-l-4 border-stop bg-stop/10 p-3 text-sm font-semibold">
              Cannot reach the coordination service. Is the backend running (python run_all.py)? Showing the last data received.
            </div>
          )}
          {lotsData === null && !failed && <p>Loading lots...</p>}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {lots.map((l) => (
              <LotCard key={l.id} lot={l} selected={l.id === selectedId} recommended={rec?.recommended === l.id} onSelect={() => pickLot(l.id)} />
            ))}
          </div>

          <div ref={detailRef} />
          {selected && (
            <section className="rounded-lg bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-3xl font-semibold">{selected.name}</h2>
                <p className="text-sm text-asphalt/70">
                  {selected.occupied} occupied, {selected.reserved} reserved, {selected.free} free
                </p>
              </div>
              {selected.stale && (
                <div className="mb-3 overflow-hidden rounded-md border border-asphalt/30">
                  <div className="hazard h-2" aria-hidden />
                  <p className="p-2 text-sm">
                    This lot has not reported for {Math.round(selected.age_seconds)}s. The bay map shows its last known state, and the lot may
                    still be accepting its own bookings. Reservations are confirmed by the lot itself, so a request will fail safely if it
                    cannot be reached.
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
              <div className="mt-4 border-t border-asphalt/15 pt-4">
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

          <ActivityLog entries={logData ?? []} />
        </section>
      </main>
    </div>
  );
}
