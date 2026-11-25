import { useMemo, type ReactNode } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HistorySample, Lot } from "../types";
import { clock, lotColor, money } from "../format";

interface Props {
  lots: Lot[];
  history: Record<string, HistorySample[]>;
}

type Row = { t: number; [lotId: string]: number };

/** Merge per-lot samples into rows bucketed to 4 s so a shared crosshair tooltip works. */
function merge(history: Record<string, HistorySample[]>, field: "occupancy" | "price"): Row[] {
  const rows = new Map<number, Row>();
  for (const [id, samples] of Object.entries(history)) {
    for (const s of samples) {
      const t = Math.round(s.t / 4) * 4;
      const row = rows.get(t) ?? { t };
      row[id] = field === "occupancy" ? Math.round(s.occupancy * 1000) / 10 : s.price;
      rows.set(t, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.t - b.t);
}

export default function TrendCharts({ lots, history }: Props) {
  const occ = useMemo(() => merge(history, "occupancy"), [history]);
  const price = useMemo(() => merge(history, "price"), [history]);
  const names = Object.fromEntries(lots.map((l) => [l.id, l.name]));
  const ids = lots.map((l) => l.id);

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <ChartCard eyebrow="Real-time utilization" title="Occupancy by lot" note="Share of bays occupied or reserved, from each lot's heartbeat (last ~6 min).">
        <Chart rows={occ} ids={ids} names={names} domain={[0, 100]} fmt={(v) => `${v.toFixed(0)}%`} />
      </ChartCard>
      <ChartCard eyebrow="Dynamic pricing" title="Hourly rate by lot" note="Rates move with the simulated time of day and with each lot's occupancy.">
        <Chart rows={price} ids={ids} names={names} domain={["auto", "auto"]} fmt={money} />
      </ChartCard>
    </section>
  );
}

function ChartCard({ eyebrow, title, note, children }: { eyebrow: string; title: string; note: string; children: ReactNode }) {
  return (
    <div className="card">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="card-title">{title}</h2>
      <p className="text-xs text-asphalt/60">{note}</p>
      <div className="mt-3 h-[260px]">{children}</div>
    </div>
  );
}

interface ChartProps {
  rows: Row[];
  ids: string[];
  names: Record<string, string>;
  domain: [number | string, number | string];
  fmt: (v: number) => string;
}

function Chart({ rows, ids, names, domain, fmt }: ChartProps) {
  if (rows.length < 2) return <p className="pt-10 text-center text-sm text-asphalt/50">Collecting data...</p>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 6, right: 12, bottom: 0, left: -6 }}>
        <CartesianGrid stroke="#E3E8EE" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(t) => clock(t)}
          tick={{ fontSize: 11, fill: "#5B6675" }}
          tickLine={false}
          axisLine={{ stroke: "#CBD3DC" }}
          minTickGap={40}
        />
        <YAxis domain={domain as any} tickFormatter={fmt} tick={{ fontSize: 11, fill: "#5B6675" }} tickLine={false} axisLine={false} width={52} />
        <Tooltip
          labelFormatter={(t) => clock(Number(t))}
          formatter={(v, k) => [fmt(Number(v)), names[String(k)] ?? String(k)]}
          contentStyle={{ borderRadius: 10, border: "1px solid #D9E0E8", fontSize: 12 }}
        />
        <Legend formatter={(k) => <span className="text-xs text-asphalt">{names[String(k)] ?? String(k)}</span>} iconType="plainline" />
        {ids.map((id) => (
          <Line
            key={id}
            type="monotone"
            dataKey={id}
            stroke={lotColor(id)}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
