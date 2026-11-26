import { Check, MapPin, Navigation } from "lucide-react";
import { useMemo } from "react";
import { money } from "../lib/format";
import { projectLots } from "../lib/lots";
import type { Lot } from "../lib/types";

/** The design's schematic Oshawa map, with one live pin per lot placed from its real coordinates. */
/** With no `onSelect` the pins are display-only (the public landing page). */
export function MapArt({ lots, selected, onSelect }: { lots: Lot[]; selected: string | null; onSelect?: (id: string) => void }) {
  const pos = useMemo(() => projectLots(lots), [lots]);
  return (
    <div className="map-art" aria-label="Illustrative Oshawa parking map">
      <svg viewBox="0 0 700 700" className="map-svg" aria-hidden="true">
        <defs>
          <pattern id="blocks" width="155" height="122" patternUnits="userSpaceOnUse" patternTransform="rotate(-17 350 350)">
            <rect x="9" y="9" width="137" height="104" rx="6" fill="#E1E5DD" />
            <rect x="19" y="19" width="50" height="38" rx="2" fill="#D3D9CE" />
            <rect x="78" y="20" width="55" height="82" rx="2" fill="#D6DCD2" />
            <rect x="19" y="66" width="50" height="36" rx="2" fill="#D9DED5" />
          </pattern>
        </defs>
        <rect width="700" height="700" fill="#F4F6EF" />
        <rect width="700" height="700" fill="url(#blocks)" />
        <path d="M430-20C500 150 285 180 332 330S548 500 460 740" fill="none" stroke="#C3D6CC" strokeWidth="63" />
        <path d="M430-20C500 150 285 180 332 330S548 500 460 740" fill="none" stroke="#D7E3DC" strokeWidth="23" />
        <path d="M-30 430L730 198M140-40L377 740M-30 625L735 393" stroke="#F9FAF7" strokeWidth="23" />
        <path d="M-30 430L730 198M140-40L377 740M-30 625L735 393" stroke="#DFE4D9" strokeWidth="1" />
        <path d="M-30 429L730 197" stroke="#C5CBBE" strokeWidth="1.5" strokeDasharray="7 10" />
        <g fontFamily="DM Sans, sans-serif" fontSize="12" letterSpacing="2" fill="#737F72">
          <text x="350" y="133" transform="rotate(-17 350 133)">NORTH OSHAWA</text>
          <text x="382" y="465" transform="rotate(-17 382 465)">DOWNTOWN</text>
          <text x="74" y="570" transform="rotate(-17 74 570)">STATION DISTRICT</text>
          <text x="442" y="256" transform="rotate(-17 442 256)" fontSize="10">SIMCOE ST</text>
          <text x="64" y="405" transform="rotate(-17 64 405)" fontSize="10">KING ST W</text>
        </g>
      </svg>
      <div className="map-location">
        <MapPin size={15} />
        <span>Oshawa, Ontario</span>
        <span className="map-location-tag">LIVE</span>
      </div>
      {lots.map((l) => {
        const p = pos[l.id];
        if (!p) return null;
        const isSel = selected === l.id;
        const label = l.stale ? "Offline" : l.free <= 0 ? "Full" : money(l.price);
        const state = l.stale ? "temporarily unavailable" : l.free <= 0 ? "full" : `${l.free} spaces, ${money(l.price)} per hour`;
        const cls = `map-pin ${isSel ? "selected" : ""} ${l.stale ? "offline" : l.free <= 0 ? "full" : ""}`;
        const style = { left: `${p.x}%`, top: `${p.y}%` };
        if (!onSelect) {
          return (
            <div key={l.id} className={`${cls} static`} style={style} role="img" aria-label={`${l.name}: ${state}`}>
              <span>P</span>
              {label}
            </div>
          );
        }
        return (
          <button
            key={l.id}
            aria-label={`Select ${l.name}: ${state}`}
            aria-pressed={isSel}
            onClick={() => onSelect(l.id)}
            className={cls}
            style={style}
          >
            <span>P</span>
            {label}
            {isSel && (
              <span className="pin-check">
                <Check size={12} />
              </span>
            )}
          </button>
        );
      })}
      <div className="map-compass">
        <Navigation size={18} />
        <span>N</span>
      </div>
      <span className="map-caption">Illustrative map · not for navigation</span>
    </div>
  );
}
