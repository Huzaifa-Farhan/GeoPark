import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import type { Lot } from "../types";
import { money } from "../format";

interface Props {
  lots: Lot[];
  selectedId: string | null;
  recommendedId: string | null;
  origin?: { lat: number; lng: number; name: string };
  onSelect: (id: string) => void;
}

/** Availability colour for a pin: green plenty, tangerine filling up, red full, grey stale. */
function pinColor(l: Lot) {
  if (l.stale) return "#7C8794";
  if (l.free <= 0) return "#C8372D";
  if (l.free / l.total < 0.25) return "#E75D2A";
  return "#178A55";
}

function pinIcon(l: Lot, selected: boolean, recommended: boolean) {
  const c = pinColor(l);
  const ring = selected ? "#003C71" : recommended ? "#0077CA" : "#fff";
  const size = selected ? 54 : 46;
  const html = `
    <div style="position:relative;width:${size}px;height:${size + 10}px;filter:drop-shadow(0 3px 4px rgba(0,27,51,.35))">
      <svg width="${size}" height="${size + 10}" viewBox="0 0 46 56">
        <path d="M23 2C11.4 2 3 10.6 3 21.6 3 36 23 54 23 54s20-18 20-32.4C43 10.6 34.6 2 23 2z" fill="${c}" stroke="${ring}" stroke-width="${selected || recommended ? 4 : 2.5}"/>
        <circle cx="23" cy="21" r="12.5" fill="#fff"/>
        <text x="23" y="26" text-anchor="middle" font-size="${l.free > 99 ? 10 : 13}" font-weight="800" font-family="Montserrat,sans-serif" fill="${c}">${l.free}</text>
      </svg>
      ${recommended ? `<span style="position:absolute;top:-8px;right:-14px;background:#E75D2A;color:#fff;font:700 9px Montserrat,sans-serif;padding:2px 5px;border-radius:6px;letter-spacing:.05em">BEST</span>` : ""}
    </div>`;
  return L.divIcon({ html, className: "lot-pin", iconSize: [size, size + 10], iconAnchor: [size / 2, size + 8], popupAnchor: [0, -size] });
}

function FitBounds({ lots }: { lots: Lot[] }) {
  const map = useMap();
  const key = lots.map((l) => l.id).sort().join(",");
  useEffect(() => {
    if (!lots.length) return;
    const b = L.latLngBounds(lots.map((l) => [l.lat, l.lng] as [number, number]));
    map.fitBounds(b.pad(0.25), { maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

export default function LotMap({ lots, selectedId, recommendedId, origin, onSelect }: Props) {
  const center = useMemo<[number, number]>(() => [43.915, -78.885], []);
  return (
    <div className="card isolate flex h-full flex-col p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <div>
          <p className="eyebrow">Live map</p>
          <h2 className="card-title">Parking near Ontario Tech</h2>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-asphalt/70">
          <Legend color="#178A55" label="Available" />
          <Legend color="#E75D2A" label="Filling up" />
          <Legend color="#C8372D" label="Full" />
          <Legend color="#7C8794" label="Stale" />
        </div>
      </div>
      <div className="m-3 min-h-[340px] flex-1 overflow-hidden rounded-lg">
        <MapContainer center={center} zoom={13} scrollWheelZoom={false} className="h-full min-h-[340px] w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          <FitBounds lots={lots} />
          {origin && (
            <CircleMarker center={[origin.lat, origin.lng]} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: "#003C71", fillOpacity: 1 }}>
              <Tooltip direction="top" offset={[0, -8]} permanent>
                You: {origin.name}
              </Tooltip>
            </CircleMarker>
          )}
          {lots.map((l) => (
            <Marker
              key={l.id}
              position={[l.lat, l.lng]}
              icon={pinIcon(l, l.id === selectedId, l.id === recommendedId)}
              eventHandlers={{ click: () => onSelect(l.id) }}
              zIndexOffset={l.id === selectedId ? 1000 : 0}
            >
              <Popup>
                <div className="min-w-[170px]">
                  <p className="font-display text-sm font-bold text-navy">{l.name}</p>
                  <p className="text-xs">
                    <b>{l.free}</b> of {l.total} free · <b>{money(l.price)}</b>/h
                  </p>
                  <p className="text-[11px] text-asphalt/60">{l.stale ? "Stale data" : "Live"}</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
