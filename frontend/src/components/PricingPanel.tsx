import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Lot, LotPricing } from "../types";
import { hourLabel, money, pct } from "../format";

interface Props {
  pricing: LotPricing[];
  lots: Lot[];
  lotId: string | null;
  onLot: (id: string) => void;
}

/** Explains the demand-based price: base x time-of-day factor x occupancy factor, clamped to [min, max]. */
export default function PricingPanel({ pricing, lots, lotId, onLot }: Props) {
  const p = pricing.find((x) => x.id === lotId) ?? pricing[0];
  if (!p) return null;
  const rows = p.forecast.map((f) => ({ ...f, band: [f.price_empty, f.price_full] as [number, number] }));
  const raw = p.base_price * p.time_factor * p.occupancy_factor;
  const nowHour = Math.round(p.sim_hour * 2) / 2;
  const yMin = Math.floor(p.min_price) - 1;
  const yMax = Math.ceil(p.max_price);

  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Dynamic pricing engine</p>
          <h2 className="card-title">How {p.name} is priced right now</h2>
          <p className="text-xs text-asphalt/60">
            Price = base rate &times; peak-hour factor &times; demand (occupancy) factor, kept within the lot's min/max. The lot computes it itself.
          </p>
        </div>
        <select className="field !w-auto" value={p.id} onChange={(e) => onLot(e.target.value)} aria-label="Lot to explain">
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex flex-wrap items-stretch gap-2 text-center">
        <Factor label="Base rate" value={money(p.base_price)} sub="per hour" />
        <Op>&times;</Op>
        <Factor label="Peak-hour factor" value={`x${p.time_factor.toFixed(2)}`} sub={p.peak ? `rush hour (${hourLabel(nowHour)})` : `off-peak (${hourLabel(nowHour)})`} hot={p.peak} />
        <Op>&times;</Op>
        <Factor label="Demand factor" value={`x${p.occupancy_factor.toFixed(2)}`} sub={`${pct(p.occupancy)} full`} hot={p.occupancy > 0.7} />
        <Op>=</Op>
        <div className="flex min-w-[130px] flex-1 flex-col justify-center rounded-lg bg-navy px-3 py-2 text-white">
          <p className="text-[11px] uppercase tracking-wider text-white/70">Current price</p>
          <p className="font-display text-3xl font-extrabold">{money(p.price)}</p>
          <p className="text-[11px] text-white/70">
            {p.clamped ? `held at ${p.clamped} (formula gives ${money(raw)})` : `range ${money(p.min_price)} to ${money(p.max_price)}`}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-sm font-semibold text-navy">24-hour price forecast</p>
        <p className="text-xs text-asphalt/60">
          Line: price at the current occupancy. Blue band: from an empty lot to a full lot. Orange strips: rush-hour peaks. Dashed line: simulated now.
        </p>
        <div className="mt-2 h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -6 }}>
              <CartesianGrid stroke="#E3E8EE" vertical={false} />
              <XAxis
                dataKey="hour"
                type="number"
                domain={[0, 23.5]}
                ticks={[0, 3, 6, 9, 12, 15, 18, 21]}
                tickFormatter={hourLabel}
                tick={{ fontSize: 11, fill: "#5B6675" }}
                tickLine={false}
                axisLine={{ stroke: "#CBD3DC" }}
              />
              <YAxis
                domain={[yMin, yMax]}
                tickFormatter={(v) => `$${v}`}
                tick={{ fontSize: 11, fill: "#5B6675" }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                labelFormatter={(h) => `Simulated ${hourLabel(Number(h))}`}
                formatter={(v, k) =>
                  k === "band"
                    ? [`${money((v as number[])[0])} to ${money((v as number[])[1])}`, "Empty to full"]
                    : [money(Number(v)), "At current occupancy"]
                }
                contentStyle={{ borderRadius: 10, border: "1px solid #D9E0E8", fontSize: 12 }}
              />
              <Area dataKey="band" stroke="none" fill="#0077CA" fillOpacity={0.14} isAnimationActive={false} />
              <Line dataKey="price_now_occupancy" stroke="#003C71" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
              {[7, 16].map((x1) => (
                <ReferenceArea
                  key={x1}
                  x1={x1}
                  x2={x1 + 3}
                  y1={yMin}
                  y2={yMin + (yMax - yMin) * 0.05}
                  fill="#E75D2A"
                  fillOpacity={0.85}
                  stroke="none"
                  label={{ value: "rush hour", position: "insideBottom", fill: "#fff", fontSize: 10, fontWeight: 700, offset: 1 }}
                />
              ))}
              <ReferenceLine
                x={nowHour}
                stroke="#E75D2A"
                strokeDasharray="4 3"
                strokeWidth={2}
                label={{ value: "now", position: "insideTopRight", fill: "#C4471A", fontSize: 11, fontWeight: 700 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

function Factor({ label, value, sub, hot }: { label: string; value: string; sub: string; hot?: boolean }) {
  return (
    <div className={`flex min-w-[110px] flex-1 flex-col justify-center rounded-lg border px-3 py-2 ${hot ? "border-tangerine/50 bg-tangerine-light" : "border-navy/15 bg-navy-light/60"}`}>
      <p className="text-[11px] uppercase tracking-wider text-asphalt/60">{label}</p>
      <p className={`font-display text-2xl font-extrabold ${hot ? "text-tangerine-dark" : "text-navy"}`}>{value}</p>
      <p className="text-[11px] text-asphalt/60">{sub}</p>
    </div>
  );
}

function Op({ children }: { children: string }) {
  return <span className="flex items-center font-display text-2xl font-bold text-asphalt/40">{children}</span>;
}
