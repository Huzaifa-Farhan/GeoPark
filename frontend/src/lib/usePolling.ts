import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Calls `fn` now and then every `intervalMs` while `enabled`. Keeps the last good data when a call fails
 * (`failed` turns true), so a brief coordinator hiccup does not blank the screen. Re-runs immediately
 * whenever `key` changes (e.g. new search parameters).
 */
export function usePolling<T>(fn: () => Promise<T>, intervalMs: number, key = "", enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const tickRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let running = false;
    const tick = async () => {
      if (running) return; // never stack requests behind a slow coordinator
      running = true;
      try {
        const d = await fnRef.current();
        if (alive) {
          setData(d);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      } finally {
        running = false;
      }
    };
    tickRef.current = tick;
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [intervalMs, key, enabled]);

  const refresh = useCallback(() => tickRef.current(), []);
  return { data, failed, refresh };
}
