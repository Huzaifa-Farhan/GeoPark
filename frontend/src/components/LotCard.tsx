import type { Lot } from "../types";
import { ago, lotColor, money, pct } from "../format";

interface Props {
  lot: Lot;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
}

const segColor = { free: "bg-go", occupied: "bg-asphalt/70", reserved: "bg-simcoe" } as const;

/** Ring gauge: share of the lot in use (occupied + reserved). */
function Gauge({ lot }: { lot: Lot }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const used = lot.total ? (lot.total - lot.free) / lot.total : 0;
  const full = lot.free <= 0;
  const color = lot.stale ? "#9AA4AF" : full ? "#C8372D" : used > 0.75 ? "#E75D2A" : "#178A55";
  return (
    <svg width="78" height="78" viewBox="0 0 78 78" aria-hidden className="shrink-0">
      <circle cx="39" cy="39" r={r} fill="none" stroke="#E7ECF1" strokeWidth="8" />
      <circle
        cx="39"
        cy="39"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${c * used} ${c}`}
        transform="rotate(-90 39 39)"
        style={{ transition: "stroke-dasharray .6s ease" }}
      />
      <text x="39" y="38" textAnchor="middle" fontSize="18" fontWeight="800" fontFamily="Montserrat, sans-serif" fill={color}>
        {lot.free}
      </text>
      <text x="39" y="52" textAnchor="middle" fontSize="9" fill="#5B6675" fontFamily="Public Sans, sans-serif">
        {full ? "FULL" : "free"}
      </text>
    </svg>
  );
}

export default function LotCard({ lot, selected, recommended, onSelect }: Props) {
  const spaces = Object.entries(lot.spaces).sort(([a], [b]) => a.localeCompare(b));
  const priceShare = lot.max_price > lot.min_price ? (lot.price - lot.min_price) / (lot.max_price - lot.min_price) : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect())}
      className={`relative overflow-hidden rounded-xl bg-white shadow-card ring-2 transition hover:-translate-y-0.5 hover:shadow-lg ${
        selected ? "ring-navy" : "ring-transparent"
      }`}
    >
      {lot.stale ? <div className="hazard h-2" aria-hidden /> : <div className="h-1.5" style={{ background: lotColor(lot.id) }} aria-hidden />}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base font-bold leading-tight text-navy">{lot.name}</h3>
          {recommended && <span className="shrink-0 rounded-md bg-tangerine px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Best</span>}
        </div>

        <div className="mt-3 flex items-center gap-4">
          <Gauge lot={lot} />
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-asphalt/55">Rate now</p>
              <p className="font-display text-2xl font-extrabold leading-none text-navy">
                {money(lot.price)}
                <span className="text-sm font-semibold text-asphalt/50">/h</span>
              </p>
            </div>
            <div title={`Price range ${money(lot.min_price)} to ${money(lot.max_price)}`}>
              <div className="relative h-1.5 rounded-full bg-gradient-to-r from-simcoe/30 via-simcoe/50 to-tangerine/70">
                <span
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-navy shadow"
                  style={{ left: `${Math.min(100, Math.max(0, priceShare * 100))}%`, transition: "left .6s ease" }}
                />
              </div>
              <p className="mt-1 flex justify-between text-[10px] text-asphalt/50">
                <span>{money(lot.min_price)}</span>
                <span>{money(lot.max_price)}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-[3px]" aria-label="Space occupancy">
          {spaces.map(([id, state]) => (
            <span key={id} title={`${id}: ${state}`} className={`h-2.5 w-2.5 rounded-sm transition-colors ${segColor[state]} ${lot.stale ? "opacity-40" : ""}`} />
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between text-xs">
          <span className={lot.stale ? "font-semibold text-tangerine-dark" : "text-asphalt/60"}>
            {lot.stale ? `Stale: no update for ${ago(lot.age_seconds)}` : `Live, updated ${ago(lot.age_seconds)}`}
          </span>
          <span className="text-asphalt/50">{pct(lot.occupancy)} used</span>
        </div>
      </div>
    </div>
  );
}
