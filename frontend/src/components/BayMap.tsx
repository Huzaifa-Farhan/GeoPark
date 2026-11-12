import type { Lot, SpaceState } from "../types";

interface Props {
  lot: Lot;
  selectedSpace: string | null;
  demoMode: boolean;
  onPick: (spaceId: string | null) => void;
  onToggleSensor: (spaceId: string, occupied: boolean) => void;
}

function Bay({ id, state, selected, stale, onClick, title }: { id: string; state: SpaceState; selected: boolean; stale: boolean; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={`Space ${id}, ${state}`}
      className={`bay ${selected ? "outline outline-4 -outline-offset-4 outline-paint" : ""} ${stale ? "opacity-60" : ""}`}
    >
      {state === "free" && <span className="font-display text-lg font-semibold text-white/50">{id.replace("S", "")}</span>}
      {state === "occupied" && (
        <span className="relative block h-[60px] w-[34px] rounded-lg bg-slate-400">
          <span className="absolute inset-x-1 top-2 h-3 rounded-sm bg-asphalt-dark/70" />
          <span className="absolute inset-x-1 bottom-2 h-2 rounded-sm bg-asphalt-dark/40" />
        </span>
      )}
      {state === "reserved" && (
        <span className="flex h-9 w-9 items-center justify-center rounded bg-sign font-display text-xl font-bold text-white ring-2 ring-white">R</span>
      )}
    </button>
  );
}

export default function BayMap({ lot, selectedSpace, demoMode, onPick, onToggleSensor }: Props) {
  const spaces = Object.entries(lot.spaces).sort(([a], [b]) => a.localeCompare(b));

  const click = (id: string, state: SpaceState) => {
    if (demoMode) {
      onToggleSensor(id, state === "occupied");
      return;
    }
    if (state === "free") onPick(selectedSpace === id ? null : id);
  };

  return (
    <div>
      <div className="grid grid-cols-4 gap-x-1 gap-y-2 rounded-lg bg-asphalt-dark p-3 sm:grid-cols-6 md:grid-cols-8">
        {spaces.map(([id, state]) => (
          <Bay
            key={id}
            id={id}
            state={state}
            selected={selectedSpace === id}
            stale={lot.stale}
            onClick={() => click(id, state)}
            title={demoMode ? `Demo: toggle sensor for ${id}` : state === "free" ? `Pick space ${id}` : `${id} is ${state}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-asphalt/70">
        <span>White number: free</span>
        <span>Grey car: occupied</span>
        <span>Blue R: reserved right now</span>
        {demoMode ? (
          <span className="font-semibold text-stop">Demo mode: clicking a bay flips its sensor</span>
        ) : (
          <span>Click a free bay to reserve that exact space</span>
        )}
      </div>
    </div>
  );
}
