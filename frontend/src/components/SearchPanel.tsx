import type { Lot, Priority, RecommendResponse } from "../types";
import { money, ORIGINS } from "../format";

export interface SearchState {
  originId: string; // "" = no location
  priority: Priority;
  preferred: string;
  hours: number;
}

interface Props {
  lots: Lot[];
  search: SearchState;
  onChange: (s: SearchState) => void;
  rec: RecommendResponse | null;
  onPick: (lotId: string) => void;
}

const PRIORITIES: { id: Priority; label: string }[] = [
  { id: "balanced", label: "Balanced" },
  { id: "cheapest", label: "Cheapest" },
  { id: "closest", label: "Closest" },
  { id: "availability", label: "Most space" },
];

export default function SearchPanel({ lots, search, onChange, rec, onPick }: Props) {
  const set = (patch: Partial<SearchState>) => onChange({ ...search, ...patch });

  return (
    <section className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="font-display text-2xl font-semibold">Find parking</h2>

      <div className="mt-3 space-y-3">
        <div>
          <label className="label" htmlFor="origin">I am near</label>
          <select id="origin" className="field" value={search.originId} onChange={(e) => set({ originId: e.target.value })}>
            <option value="">Not sharing location</option>
            {ORIGINS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pref">Preferred lot</label>
          <select id="pref" className="field" value={search.preferred} onChange={(e) => set({ preferred: e.target.value })}>
            <option value="">No preference</option>
            {lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <span className="label">What matters most</span>
          <div className="grid grid-cols-2 gap-1.5">
            {PRIORITIES.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={search.priority === p.id}
                onClick={() => set({ priority: p.id })}
                className={`btn ${search.priority === p.id ? "btn-primary" : "btn-ghost"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="hours">Planned stay</label>
          <select id="hours" className="field" value={search.hours} onChange={(e) => set({ hours: Number(e.target.value) })}>
            {[1, 2, 3, 4].map((h) => <option key={h} value={h}>{h} hour{h > 1 ? "s" : ""}</option>)}
          </select>
        </div>
      </div>

      {rec && (
        <div className="mt-4">
          <p className={`rounded-md border-l-4 p-2 text-sm font-semibold ${rec.preferred_full ? "border-stop bg-stop/10" : "border-sign bg-sign-light"}`}>
            {rec.message}
          </p>
          <ol className="mt-3 space-y-2">
            {rec.results.map((r, i) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onPick(r.id)}
                  className={`w-full rounded-md border p-2 text-left text-sm hover:bg-concrete ${r.full ? "border-asphalt/10 opacity-60" : "border-asphalt/25"}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-lg font-semibold">{i + 1}. {r.name}</span>
                    <span className={r.full ? "font-semibold text-stop" : "font-semibold text-go"}>{r.full ? "Full" : `${r.free} free`}</span>
                  </span>
                  <span className="block text-asphalt/70">
                    {money(r.price)}/h (about {money(r.estimated_total)})
                    {r.eta_min != null && <> - {r.distance_km} km, {r.eta_min} min</>}
                  </span>
                  {r.reasons.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {r.reasons.map((reason) => (
                        <span key={reason} className={`rounded px-1.5 py-0.5 text-xs ${reason.includes("out of date") ? "bg-paint/40 font-semibold" : "bg-concrete"}`}>
                          {reason}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
