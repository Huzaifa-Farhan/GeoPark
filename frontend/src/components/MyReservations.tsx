import { clock, money } from "../format";
import type { MyReservation } from "../types";

interface Props {
  items: MyReservation[];
  onCancel: (r: MyReservation) => void;
}

export default function MyReservations({ items, onCancel }: Props) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="font-display text-2xl font-semibold">Your reservations</h2>
      <ul className="mt-2 space-y-2">
        {items.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 rounded-md bg-concrete p-2 text-sm">
            <span>
              <b>{r.lot_name}</b>, space {r.space_id}
              <br />
              {clock(r.start_ts)} to {clock(r.end_ts)} - {money(r.total_price)}
            </span>
            <button className="btn btn-ghost" onClick={() => onCancel(r)}>Cancel</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
