import type { ReactNode } from "react";
import type { FeedEvent, Lot } from "../types";
import { money, pct } from "../format";

interface Props {
  lots: Lot[];
  feed: FeedEvent[];
}

export default function KpiStrip({ lots, feed }: Props) {
  const live = lots.filter((l) => !l.stale);
  const total = lots.reduce((a, l) => a + l.total, 0);
  const free = lots.reduce((a, l) => a + l.free, 0);
  const reserved = lots.reduce((a, l) => a + l.reserved, 0);
  const util = total ? 1 - free / total : 0;
  const avgPrice = live.length ? live.reduce((a, l) => a + l.price, 0) / live.length : 0;
  const cheapest = live.length ? live.reduce((a, l) => (l.price < a.price ? l : a)) : null;
  const now = Date.now() / 1000;
  const perMin = feed.filter((e) => e.type === "sensor" && now - e.received_at < 60).length;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Tile label="Free spaces" value={String(free)} sub={`of ${total} across ${lots.length} lots`} accent="text-go" />
      <Tile label="Utilization" value={pct(util)} sub={`${reserved} reserved right now`}>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-concrete">
          <div className="h-full rounded-full bg-simcoe transition-all duration-700" style={{ width: pct(util) }} />
        </div>
      </Tile>
      <Tile label="Average price" value={`${money(avgPrice)}/h`} sub={cheapest ? `Cheapest: ${cheapest.name.replace(/ (Lot|Garage)$/, "")}` : "-"} />
      <Tile label="Lots online" value={`${live.length}/${lots.length}`} sub={live.length === lots.length ? "All reporting" : "Some data is stale"} accent={live.length === lots.length ? "" : "text-tangerine"} />
      <Tile label="Sensor readings" value={String(perMin)} sub="in the last minute (simulated IoT)" className="col-span-2 md:col-span-1" />
    </div>
  );
}

function Tile({ label, value, sub, accent = "", children, className = "" }: { label: string; value: string; sub: string; accent?: string; children?: ReactNode; className?: string }) {
  return (
    <div className={`card relative overflow-hidden ${className}`}>
      <span className="absolute inset-y-0 left-0 w-1 bg-navy" aria-hidden />
      <p className="eyebrow">{label}</p>
      <p className={`mt-1 font-display text-3xl font-extrabold tabular-nums text-navy ${accent}`}>{value}</p>
      <p className="text-xs text-asphalt/60">{sub}</p>
      {children}
    </div>
  );
}
