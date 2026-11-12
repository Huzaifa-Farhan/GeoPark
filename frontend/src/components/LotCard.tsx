import type { Lot } from "../types";
import { ago, money } from "../format";

interface Props {
  lot: Lot;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
}

const segColor = { free: "bg-go", occupied: "bg-asphalt", reserved: "bg-sign" } as const;

export default function LotCard({ lot, selected, recommended, onSelect }: Props) {
  const full = lot.free <= 0;
  const spaces = Object.entries(lot.spaces).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect())}
      className={`overflow-hidden rounded-lg bg-white shadow-sm ring-2 transition-shadow hover:shadow-md ${
        selected ? "ring-sign" : "ring-transparent"
      }`}
    >
      {lot.stale && <div className="hazard h-2" aria-hidden />}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-semibold leading-tight">{lot.name}</h3>
            <p className="mt-0.5 text-sm text-asphalt/70">
              {money(lot.price)}/h <span className="text-asphalt/50">(range {money(lot.min_price)}-{money(lot.max_price)})</span>
            </p>
          </div>
          {recommended && <span className="rounded bg-sign px-2 py-1 text-xs font-semibold text-white">Best option</span>}
        </div>

        <div className="mt-3 flex items-end gap-3">
          <span
            className={`font-display text-6xl font-bold leading-none ${
              lot.stale ? "text-asphalt/40" : full ? "text-stop" : "text-go"
            }`}
          >
            {lot.free}
          </span>
          <span className="pb-1 text-sm leading-tight text-asphalt/70">
            {full ? "full" : "free"} of {lot.total}
            <br />
            {lot.stale && <span className="font-semibold text-asphalt">last known</span>}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-[3px]" aria-label="Space occupancy">
          {spaces.map(([id, state]) => (
            <span key={id} title={`${id}: ${state}`} className={`h-3 w-3 rounded-sm ${segColor[state]} ${lot.stale ? "opacity-40" : ""}`} />
          ))}
        </div>

        <p className={`mt-3 text-xs ${lot.stale ? "font-semibold text-asphalt" : "text-asphalt/60"}`}>
          {lot.stale
            ? `Stale - no update for ${ago(lot.age_seconds)}. Figures may be out of date.`
            : `Live - updated ${ago(lot.age_seconds)}`}
        </p>
      </div>
    </div>
  );
}
