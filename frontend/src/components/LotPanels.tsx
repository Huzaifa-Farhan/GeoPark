// Panels shared by the driver's Book page and the operator's Control room.
import { Car } from "lucide-react";
import { useState } from "react";
import { hourLabel, money, pct } from "../lib/format";
import { demandLevel, sortedSpaces } from "../lib/lots";
import type { Lot, LotPricing, SpaceState } from "../lib/types";
import { LineChart, SERIES_COLOURS } from "./LineChart";

/**
 * Every bay in a lot. Drivers can pick a free bay ("driver"); operators can flip any sensor ("operator").
 */
export function BayMap({
  lot, mode, onBay, busy = false, selected = null,
}: {
  lot: Lot;
  mode: "driver" | "operator";
  onBay: (id: string, state: SpaceState) => void;
  busy?: boolean;
  selected?: string | null;
}) {
  const label = (id: string, state: SpaceState) =>
    mode === "operator"
      ? `Bay ${id}: ${state}. Set ${state === "occupied" ? "free" : "occupied"}.`
      : state === "free" ? `Bay ${id}: free. Reserve this bay.` : `Bay ${id}: ${state === "occupied" ? "a car is parked here" : "reserved"}.`;
  return (
    <>
      <div className="bay-grid" role="group" aria-label={`Bays at ${lot.name}`}>
        {sortedSpaces(lot).map(([id, state]) => (
          <button
            key={id}
            className={`bay ${state} ${selected === id ? "on" : ""}`}
            onClick={() => onBay(id, state)}
            disabled={busy || lot.stale || (mode === "driver" && state !== "free")}
            aria-label={label(id, state)}
            title={`Bay ${id} · ${state === "occupied" ? "occupied" : state}`}
          >
            {state === "occupied" && <Car size={16} aria-hidden="true" />}
            <span>{id}</span>
          </button>
        ))}
      </div>
      <ul className="bay-legend">
        <li><span className="bay-key free" /> Free {lot.free}</li>
        <li><span className="bay-key occupied" /> Car parked {lot.occupied}</li>
        <li><span className="bay-key reserved" /> Reserved now {lot.reserved}</li>
      </ul>
    </>
  );
}

/** Operator view only: base rate × time of day × occupancy = hourly rate. */
export function PriceBreakdown({ pricing }: { pricing: LotPricing }) {
  return (
    <>
      <div className="price-math" aria-label="Price calculation">
        <div><span>Base rate</span><strong>{money(pricing.base_price)}</strong></div>
        <i>×</i>
        <div className={pricing.peak ? "hot" : ""}><span>Time of day ({hourLabel(pricing.sim_hour)})</span><strong>{pricing.time_factor.toFixed(2)}</strong></div>
        <i>×</i>
        <div><span>How full ({pct(pricing.occupancy)})</span><strong>{pricing.occupancy_factor.toFixed(2)}</strong></div>
        <i>=</i>
        <div className="result"><span>Hourly rate</span><strong>{money(pricing.price)}</strong></div>
      </div>
      <p className="muted small">
        Kept between {money(pricing.min_price)} and {money(pricing.max_price)}.
        {pricing.clamped === "max" ? " Held at the maximum right now." : pricing.clamped === "min" ? " Held at the minimum right now." : ""}
      </p>
    </>
  );
}

const RUSH = [{ from: 6.75, to: 10.25 }, { from: 15.75, to: 19.25 }];
const HOURS = Array.from({ length: 48 }, (_, i) => i / 2);

function lotHour(lot: Lot) {
  if (lot.sim_hour != null) return lot.sim_hour;
  const [h, m] = (lot.sim_time || "0:0").split(":").map(Number);
  return h + m / 60;
}

/**
 * The lot through the day. "capacity": how many of its spaces are typically in use at each hour (the same
 * rush-hour demand curve the simulated sensors follow). "price": the hourly rate. Drivers only get capacity;
 * operators can switch between the two.
 */
export function DayChart({ lot, pricing = null, modes }: { lot: Lot; pricing?: LotPricing | null; modes: ("capacity" | "price")[] }) {
  const [mode, setMode] = useState(modes[0]);
  const showing = mode === "price" && !pricing ? "capacity" : mode;
  const now = lotHour(lot);
  const inUse = lot.capacity - lot.free;
  const common = {
    shade: RUSH,
    shadeLabel: "Rush hours",
    xDomain: [0, 23.5] as [number, number],
    xTicks: [0, 6, 12, 18, 23.5],
    xFormat: (h: number) => hourLabel(h),
  };

  return (
    <div className="day-chart">
      {modes.length > 1 && (
        <div className="seg chart-toggle" role="radiogroup" aria-label="Chart shows">
          <button role="radio" aria-checked={showing === "capacity"} className={showing === "capacity" ? "on" : ""} onClick={() => setMode("capacity")}>
            Capacity
          </button>
          <button role="radio" aria-checked={showing === "price"} className={showing === "price" ? "on" : ""} onClick={() => setMode("price")} disabled={!pricing}>
            Price
          </button>
        </div>
      )}
      {showing === "capacity" ? (
        <LineChart
          {...common}
          title={`Spaces in use through the day (of ${lot.capacity})`}
          series={[{
            id: "typical",
            name: "Typically in use",
            color: SERIES_COLOURS[0],
            points: HOURS.map((h) => ({ x: h, y: Math.round((0.15 + 0.75 * demandLevel(h)) * lot.capacity * 10) / 10 })),
          }]}
          marker={{ x: now, label: `Now ${hourLabel(now)} · ${inUse} in use` }}
          yDomain={[0, lot.capacity]}
          yTicks={[0, Math.round(lot.capacity / 2), lot.capacity]}
          yFormat={(v) => `${Math.round(v)}`}
        />
      ) : (
        pricing && (
          <LineChart
            {...common}
            title="Hourly rate through the day"
            band={{ name: "Empty to full", lo: pricing.forecast.map((f) => ({ x: f.hour, y: f.price_empty })), hi: pricing.forecast.map((f) => ({ x: f.hour, y: f.price_full })) }}
            series={[{ id: "now", name: `At ${pct(pricing.occupancy)} full`, color: SERIES_COLOURS[0], points: pricing.forecast.map((f) => ({ x: f.hour, y: f.price_now_occupancy })) }]}
            marker={{ x: pricing.sim_hour, label: `Now ${hourLabel(pricing.sim_hour)}` }}
            yDomain={[0, Math.ceil(pricing.max_price + 0.5)]}
            yTicks={[0, Math.ceil(pricing.max_price / 2), Math.ceil(pricing.max_price + 0.5)]}
            yFormat={(v) => money(v)}
          />
        )
      )}
    </div>
  );
}
