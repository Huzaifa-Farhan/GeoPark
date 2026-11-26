// Small SVG line chart in the GeoPark style: 2 px lines, hairline grid, legend, hover crosshair + tooltip,
// and a table view so no value is carried by colour alone.
import { useId, useMemo, useRef, useState, type PointerEvent } from "react";

export interface Point {
  x: number;
  y: number;
}
export interface Series {
  id: string;
  name: string;
  color: string;
  points: Point[];
}

/** Categorical slots, fixed order (validated: brand blue + reference palette). Colour follows the entity. */
export const SERIES_COLOURS = ["#174be8", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];

interface Props {
  title: string;
  series: Series[];
  band?: { name: string; lo: Point[]; hi: Point[] };
  shade?: { from: number; to: number }[];
  shadeLabel?: string;
  marker?: { x: number; label: string };
  xDomain: [number, number];
  xTicks: number[];
  xFormat: (x: number) => string;
  yDomain: [number, number];
  yTicks: number[];
  yFormat: (y: number) => string;
  tableRows?: number; // show only the most recent N rows in the table view
}

const W = 640;
const H = 240;
const M = { top: 12, right: 16, bottom: 28, left: 52 };

export function LineChart(p: Props) {
  const uid = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [x0, x1] = p.xDomain;
  const [y0, y1] = p.yDomain;
  const sx = (x: number) => M.left + ((x - x0) / (x1 - x0 || 1)) * (W - M.left - M.right);
  const sy = (y: number) => M.top + (1 - (y - y0) / (y1 - y0 || 1)) * (H - M.top - M.bottom);
  const path = (pts: Point[]) => pts.map((pt, i) => `${i ? "L" : "M"}${sx(pt.x).toFixed(1)},${sy(pt.y).toFixed(1)}`).join("");

  // all x positions we can snap the crosshair to
  const xs = useMemo(() => {
    const set = new Set<number>();
    p.series.forEach((s) => s.points.forEach((pt) => set.add(pt.x)));
    p.band?.lo.forEach((pt) => set.add(pt.x));
    return [...set].sort((a, b) => a - b);
  }, [p.series, p.band]);

  const nearest = (pts: Point[], x: number) => {
    let best: Point | null = null;
    for (const pt of pts) if (!best || Math.abs(pt.x - x) < Math.abs(best.x - x)) best = pt;
    return best && Math.abs(best.x - x) <= (x1 - x0) / 40 ? best : null;
  };

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const dataX = x0 + ((vx - M.left) / (W - M.left - M.right)) * (x1 - x0);
    if (!xs.length) return;
    let best = xs[0];
    for (const x of xs) if (Math.abs(x - dataX) < Math.abs(best - dataX)) best = x;
    setHover(best);
  };

  const hasData = p.series.some((s) => s.points.length > 1) || (p.band && p.band.lo.length > 1);
  const legend = [...(p.band ? [{ id: "band", name: p.band.name, color: "band" }] : []), ...p.series];
  const tableXs = p.tableRows ? xs.slice(-p.tableRows) : xs;

  return (
    <figure className="chart" ref={wrap}>
      <figcaption className="chart-head">
        <strong>{p.title}</strong>
        <ul className="chart-legend">
          {legend.map((s) => (
            <li key={s.id}>
              <span className={`key ${s.color === "band" ? "band" : ""}`} style={s.color === "band" ? undefined : { background: s.color }} />
              {s.name}
            </li>
          ))}
          {p.shade && p.shadeLabel && (
            <li><span className="key shade" />{p.shadeLabel}</li>
          )}
        </ul>
      </figcaption>
      <div className="chart-plot">
        {!hasData ? (
          <p className="chart-empty">Collecting data… the chart fills in as the lots report.</p>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-labelledby={`${uid}-t`}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            <title id={`${uid}-t`}>{p.title}</title>
            {p.shade?.map((s, i) => (
              <rect key={i} x={sx(s.from)} y={M.top} width={Math.max(0, sx(s.to) - sx(s.from))} height={H - M.top - M.bottom} className="chart-shade" />
            ))}
            {p.yTicks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={W - M.right} y1={sy(t)} y2={sy(t)} className="chart-grid" />
                <text x={M.left - 8} y={sy(t)} dy="0.32em" textAnchor="end" className="chart-axis">{p.yFormat(t)}</text>
              </g>
            ))}
            {p.xTicks.map((t, i) => (
              <text key={t} x={sx(t)} y={H - 8} textAnchor={i === 0 ? "start" : i === p.xTicks.length - 1 ? "end" : "middle"} className="chart-axis">
                {p.xFormat(t)}
              </text>
            ))}
            {p.band && p.band.lo.length > 1 && (
              <path
                d={`${path(p.band.hi)}L${[...p.band.lo].reverse().map((pt) => `${sx(pt.x).toFixed(1)},${sy(pt.y).toFixed(1)}`).join("L")}Z`}
                className="chart-band"
              />
            )}
            {p.series.map((s) => (
              <path key={s.id} d={path(s.points)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {p.marker && (
              <g>
                <line x1={sx(p.marker.x)} x2={sx(p.marker.x)} y1={M.top} y2={H - M.bottom} className="chart-marker" />
                <text x={sx(p.marker.x) + 6} y={M.top + 10} className="chart-axis strong">{p.marker.label}</text>
              </g>
            )}
            {hover != null && (
              <g>
                <line x1={sx(hover)} x2={sx(hover)} y1={M.top} y2={H - M.bottom} className="chart-crosshair" />
                {p.series.map((s) => {
                  const pt = nearest(s.points, hover);
                  return pt ? <circle key={s.id} cx={sx(pt.x)} cy={sy(pt.y)} r={4.5} fill={s.color} stroke="#fff" strokeWidth={2} /> : null;
                })}
              </g>
            )}
          </svg>
        )}
        {hover != null && hasData && (
          <div className="chart-tip" style={{ left: `${(sx(hover) / W) * 100}%` }} role="status">
            <strong>{p.xFormat(hover)}</strong>
            {p.band && (() => {
              const lo = nearest(p.band.lo, hover);
              const hi = nearest(p.band.hi, hover);
              return lo && hi ? <span><i className="key band" />{p.band.name}: {p.yFormat(lo.y)}–{p.yFormat(hi.y)}</span> : null;
            })()}
            {p.series.map((s) => {
              const pt = nearest(s.points, hover);
              return pt ? <span key={s.id}><i className="key" style={{ background: s.color }} />{s.name}: {p.yFormat(pt.y)}</span> : null;
            })}
          </div>
        )}
      </div>
      <details className="chart-table">
        <summary>Show as a table</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Time</th>
                {p.band && <th scope="col">{p.band.name}</th>}
                {p.series.map((s) => <th key={s.id} scope="col">{s.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...tableXs].reverse().map((x) => (
                <tr key={x}>
                  <th scope="row">{p.xFormat(x)}</th>
                  {p.band && (
                    <td>{(() => {
                      const lo = p.band!.lo.find((pt) => pt.x === x);
                      const hi = p.band!.hi.find((pt) => pt.x === x);
                      return lo && hi ? `${p.yFormat(lo.y)}–${p.yFormat(hi.y)}` : "–";
                    })()}</td>
                  )}
                  {p.series.map((s) => {
                    const pt = s.points.find((q) => q.x === x);
                    return <td key={s.id}>{pt ? p.yFormat(pt.y) : "–"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
