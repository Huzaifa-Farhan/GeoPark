import type { Lot } from "../types";

interface Props {
  lots: Lot[];
  simTime: string;
  peak: boolean;
  connected: boolean;
}

export default function Header({ lots, simTime, peak, connected }: Props) {
  const stale = lots.filter((l) => l.stale).length;
  return (
    <header className="relative z-30 bg-navy lg:sticky lg:top-0 text-white shadow-lg">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="text-2xl font-extrabold leading-none tracking-tight">
              Geo<span className="text-tangerine">Park</span>
            </h1>
            <p className="mt-0.5 hidden text-[11px] uppercase sm:block tracking-[0.14em] text-white/60">Distributed smart parking · Ontario Tech · SOFE4790U</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5">
            <ClockIcon />
            <span className="text-white/70">Sim time</span>
            <b className="font-display text-xl tabular-nums">{simTime}</b>
          </span>
          <span
            className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${
              peak ? "bg-tangerine text-white" : "bg-white/10 text-white/80"
            }`}
            title="Prices rise around the simulated 08:30 and 17:30 rush hours"
          >
            {peak ? "▲ Peak pricing" : "Off-peak"}
          </span>
          <span className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${connected ? "animate-pulseDot bg-[#4ADE80]" : "bg-stop"}`} />
            <b>{lots.length - stale}</b> live
            {stale > 0 && <b className="rounded bg-tangerine px-1.5 text-white">{stale} stale</b>}
          </span>
        </div>
      </div>
      <div className="h-1 bg-gradient-to-r from-tangerine via-tangerine to-simcoe" />
    </header>
  );
}

function Logo() {
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" aria-hidden>
      <rect width="42" height="42" rx="10" fill="#fff" />
      <path d="M21 7c-6 0-10.5 4.5-10.5 10.3C10.5 25 21 35 21 35s10.5-10 10.5-17.7C31.5 11.5 27 7 21 7z" fill="#003C71" />
      <text x="21" y="23.5" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff" fontFamily="Montserrat, sans-serif">P</text>
      <circle cx="31" cy="10" r="4" fill="#E75D2A" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
