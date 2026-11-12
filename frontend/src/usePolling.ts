import { useEffect, useRef, useState } from "react";

/** Calls `fn` immediately and then every `intervalMs`. `failed` is true while the last call threw. */
export function usePolling<T>(fn: () => Promise<T>, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const aliveRef = useRef(true);
  const tickRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    aliveRef.current = true;
    const tick = async () => {
      try {
        const d = await fnRef.current();
        if (aliveRef.current) {
          setData(d);
          setFailed(false);
        }
      } catch {
        if (aliveRef.current) setFailed(true);
      }
    };
    tickRef.current = tick;
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      aliveRef.current = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  /** Fetch again right now (e.g. after the user changed something). */
  const refresh = () => tickRef.current();

  return { data, failed, refresh };
}
