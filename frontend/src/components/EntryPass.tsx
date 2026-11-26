import QRCode from "qrcode";
import { useMemo } from "react";
import { windowText } from "../lib/format";

/** The QR code a driver scans at the lot gate. The lot signed it, so only the lot can check it. */
export function PassQR({ value, size = 184, label }: { value: string; size?: number; label: string }) {
  const path = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
    let d = "";
    for (let y = 0; y < modules.size; y++)
      for (let x = 0; x < modules.size; x++) if (modules.get(x, y)) d += `M${x + 4} ${y + 4}h1v1h-1z`;
    return { d, n: modules.size + 8 };
  }, [value]);
  return (
    <svg className="pass-qr" width={size} height={size} viewBox={`0 0 ${path.n} ${path.n}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={path.n} height={path.n} fill="#fff" />
      <path d={path.d} fill="#172d28" />
    </svg>
  );
}

export function EntryPass({
  pass, lotName, spaceId, start, end,
}: { pass: string; lotName: string; spaceId: string; start: number; end: number }) {
  return (
    <div className="entry-pass">
      <PassQR value={pass} label={`Entry pass QR code for bay ${spaceId} at ${lotName}`} />
      <div className="entry-pass-text">
        <span className="eyebrow">ENTRY PASS</span>
        <strong>{lotName} · Bay {spaceId}</strong>
        <span>{windowText(start, end)}</span>
        <small>Scan at the lot gate. Entry opens 15 minutes before your time. The pass stops working if you cancel.</small>
      </div>
    </div>
  );
}
