import type { FeedEvent } from "../types";
import { clock, lotColor } from "../format";

/** Live stream of the simulated IoT sensor readings and booking events the coordinator received. */
export default function SensorFeed({ feed }: { feed: FeedEvent[] }) {
  const items = [...feed].reverse().slice(0, 40);
  const now = Date.now() / 1000;
  const perMin = feed.filter((e) => e.type === "sensor" && now - e.received_at < 60).length;

  return (
    <section className="card flex h-full max-h-[460px] flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="eyebrow">Simulated IoT</p>
          <h2 className="card-title">Live sensor feed</h2>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-go/10 px-2.5 py-1 text-xs font-semibold text-go">
          <span className="h-2 w-2 animate-pulseDot rounded-full bg-go" /> {perMin}/min
        </span>
      </div>
      <p className="mt-1 text-xs text-asphalt/60">Each bay has a simulated occupancy sensor. Readings are stored in the lot's own database and streamed to the coordinator.</p>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-asphalt/60">Waiting for sensor readings...</p>
      ) : (
        <ul className="mt-3 flex-1 space-y-1.5 overflow-auto pr-1 text-sm">
          {items.map((e) => (
            <li key={`${e.lot_id}-${e.seq}`} className="flex animate-slideIn items-center gap-2 rounded-lg bg-concrete/70 px-2 py-1.5">
              <EventIcon e={e} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: lotColor(e.lot_id) }} />
                  {e.lot_name}
                </span>
                <span className="block truncate text-xs text-asphalt/70">{describe(e)}</span>
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-asphalt/50">{clock(e.t)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function describe(e: FeedEvent): string {
  const p = e.payload ?? {};
  if (e.type === "sensor") return `Bay ${p.space_id} ${p.occupied ? "occupied" : "vacated"}${p.source === "manual" ? " (manual)" : ""}`;
  if (e.type === "reservation_created") return `Bay ${p.space_id ?? "?"} reserved`;
  if (e.type === "reservation_cancelled") return `Reservation on bay ${p.space_id ?? "?"} cancelled`;
  return e.type;
}

function EventIcon({ e }: { e: FeedEvent }) {
  const p = e.payload ?? {};
  const base = "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white";
  if (e.type === "sensor")
    return p.occupied ? (
      <span className={`${base} bg-asphalt`} title="Car arrived">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11a2 2 0 0 1 2 2v4h-2v2h-2v-2H7v2H5v-2H3v-4a2 2 0 0 1 2-2zm2.2 0h9.6l-1-3H8.2l-1 3zM6.5 15a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>
      </span>
    ) : (
      <span className={`${base} bg-go`} title="Bay freed">P</span>
    );
  if (e.type === "reservation_created") return <span className={`${base} bg-simcoe`} title="Reserved">R</span>;
  return <span className={`${base} bg-tangerine`} title="Cancelled">×</span>;
}
