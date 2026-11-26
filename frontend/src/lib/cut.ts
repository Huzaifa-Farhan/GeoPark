// Which lots an operator has cut off in this browser tab (demo only). The coordinator doesn't report
// partitions - from its side a cut lot simply goes quiet - so we remember what we asked for.
import { useCallback, useEffect, useState } from "react";

const KEY = "geopark.cut";
const EVT = "geopark-cut-change";

function read(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function useCutLots() {
  const [cut, setCut] = useState<string[]>(read);
  useEffect(() => {
    const f = () => setCut(read());
    window.addEventListener(EVT, f);
    return () => window.removeEventListener(EVT, f);
  }, []);
  const mark = useCallback((id: string, on: boolean) => {
    const next = on ? [...new Set([...read(), id])] : read().filter((x) => x !== id);
    sessionStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVT));
  }, []);
  return { cut, mark };
}
