import { clock } from "../format";
import type { LogEntry } from "../types";

const dot = { info: "bg-asphalt/40", success: "bg-go", warning: "bg-paint" } as const;

export default function ActivityLog({ entries }: { entries: LogEntry[] }) {
  const recent = [...entries].reverse().slice(0, 25);
  return (
    <section className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="font-display text-2xl font-semibold">System activity</h2>
      <p className="text-xs text-asphalt/60">What the coordinator has seen: registrations, stale lots, reconnections, bookings.</p>
      {recent.length === 0 ? (
        <p className="mt-2 text-sm text-asphalt/60">Nothing yet.</p>
      ) : (
        <ul className="mt-2 max-h-64 space-y-1 overflow-auto text-sm">
          {recent.map((e, i) => (
            <li key={`${e.t}-${i}`} className="flex gap-2">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[e.level]}`} />
              <span className="shrink-0 text-asphalt/50">{clock(e.t)}</span>
              <span>{e.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
