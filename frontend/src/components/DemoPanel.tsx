import { useState } from "react";
import type { Lot } from "../types";

interface Props {
  lots: Lot[];
  cut: Set<string>;
  demoMode: boolean;
  onDemoMode: (on: boolean) => void;
  onTogglePartition: (lot: Lot) => void;
  onFill: (lot: Lot) => void;
  onClock: (hour: number, running: boolean) => void;
}

export default function DemoPanel({ lots, cut, demoMode, onDemoMode, onTogglePartition, onFill, onClock }: Props) {
  const [hour, setHour] = useState(8);
  const label = `${String(Math.floor(hour)).padStart(2, "0")}:${hour % 1 ? "30" : "00"}`;

  return (
    <details className="rounded-lg bg-asphalt p-4 text-white shadow-sm">
      <summary className="cursor-pointer font-display text-2xl font-semibold">Demo controls</summary>
      <div className="mt-3 space-y-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={demoMode} onChange={(e) => onDemoMode(e.target.checked)} />
          Click bays to flip their sensors
        </label>

        <div>
          <p className="mb-1 font-semibold">Simulated time of day: {label}</p>
          <input type="range" min={0} max={23.5} step={0.5} value={hour} onChange={(e) => setHour(Number(e.target.value))} className="w-full" aria-label="Simulated hour" />
          <div className="mt-1 flex gap-2">
            <button className="btn btn-ghost !py-1" onClick={() => onClock(hour, false)}>Pin this time</button>
            <button className="btn btn-ghost !py-1" onClick={() => onClock(hour, true)}>Let it run</button>
          </div>
          <p className="mt-1 text-xs text-white/60">Prices rise at the simulated 08:30 and 17:30 peaks and when a lot fills up.</p>
        </div>

        <div>
          <p className="mb-1 font-semibold">Per lot</p>
          <ul className="space-y-2">
            {lots.map((l) => (
              <li key={l.id} className="rounded-md bg-asphalt-light p-2">
                <p className="mb-1 font-semibold">{l.name}</p>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-ghost !py-1" onClick={() => onTogglePartition(l)}>
                    {cut.has(l.id) ? "Restore link" : "Cut link to coordinator"}
                  </button>
                  <button className="btn btn-ghost !py-1" onClick={() => onFill(l)}>Fill lot</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
