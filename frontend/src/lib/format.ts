// Canadian English, CAD prices, plain language (brand guidelines, section 10).

export const money = (n: number) => `$${n.toFixed(2)}`;

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const spacesText = (n: number) => (n === 1 ? "1 space available" : `${n} spaces available`);

export const hoursText = (h: number) => plural(h, "hour");

const timeFmt = new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-CA", { weekday: "short", month: "short", day: "numeric" });

export const clock = (epochSec: number) => timeFmt.format(new Date(epochSec * 1000));

export function dayLabel(epochSec: number) {
  const d = new Date(epochSec * 1000);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return dayFmt.format(d);
}

/** "Today, 2:20 p.m. – 4:20 p.m." */
export const windowText = (start: number, end: number) => `${dayLabel(start)}, ${clock(start)} – ${clock(end)}`;

export function ago(seconds: number) {
  if (seconds < 1.5) return "just now";
  if (seconds < 60) return `${Math.round(seconds)} s ago`;
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** Simulated hour (e.g. 8.5) as "08:30". */
export function hourLabel(h: number) {
  const m = Math.round(((h % 24) + 24) % 24 * 60) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
