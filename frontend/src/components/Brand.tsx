import { useEffect, useRef, type ReactNode } from "react";

export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="34" height="34" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M6 34V6H23C30 6 34 10.5 34 17S30 28 23 28H17V34" stroke="currentColor" strokeWidth="6" />
      <path d="M17 17H24" stroke="currentColor" strokeWidth="5" />
    </svg>
  );
}

export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <a href="#/" className={`logo ${inverse ? "inverse" : ""}`} aria-label="GeoPark home">
      <img src={`/brand/geopark-wordmark-${inverse ? "white" : "ink"}.svg`} alt="GeoPark" width="155" height="44" />
    </a>
  );
}

/** Reveal a block once as it scrolls into view (650 ms, 20 px rise; disabled for reduced motion in CSS). */
export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add("visible");
          observer.disconnect();
        }
      },
      { threshold: 0.08 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  );
}

export function StatusDot({ tone = "ok" }: { tone?: "ok" | "warn" | "error" | "lime" }) {
  return <span className={`status-dot ${tone === "ok" ? "" : tone}`} aria-hidden="true" />;
}
