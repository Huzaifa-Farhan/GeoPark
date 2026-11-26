// Tiny hash router. Pages use "#/path" ("#/login?next=/book"); anything else ("#how-it-works", "#network")
// is a section of the landing page, exactly like the original design's links.
import { useEffect, useState } from "react";

export type Page = "home" | "login" | "register" | "book" | "reservations" | "admin";

export interface Route {
  page: Page;
  anchor: string | null; // landing-page section to scroll to
  next: string | null; // where to go after logging in
}

const PAGES: Record<string, Page> = {
  "/login": "login",
  "/register": "register",
  "/reservations": "reservations",
  "/admin": "admin",
  "/book": "book",
};

export function parse(hash: string): Route {
  const h = hash.replace(/^#/, "");
  if (h.startsWith("/")) {
    const [path, query = ""] = h.split("?");
    const next = new URLSearchParams(query).get("next");
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
    return { page: PAGES[path] ?? "home", anchor: null, next: safeNext };
  }
  return { page: "home", anchor: h || null, next: null };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const f = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return route;
}

/** Go to "/book", "/login?next=/admin", or a landing section such as "network" (no slash). */
export function navigate(to: string) {
  const target = to.startsWith("#") ? to : `#${to}`;
  if (window.location.hash === target) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else window.location.hash = target;
}

/** Link target for a page, e.g. href("/login", { next: "/admin" }). */
export function href(path: string, params?: Record<string, string>) {
  const q = params ? `?${new URLSearchParams(params).toString()}` : "";
  return `#${path}${q}`;
}

/** Login link that brings the user back to where they are now. */
export function loginHref(next?: string) {
  const here = next ?? currentPath();
  return href("/login", here && here !== "/login" && here !== "/register" ? { next: here } : undefined);
}

function currentPath() {
  const h = window.location.hash.replace(/^#/, "");
  if (h.startsWith("/")) return h.split("?")[0];
  return h ? `/${h}` : "/";
}

/** Turn a "next" value back into a hash target. After logging in, people land on the Book page by default. */
export function resolveNext(next: string | null): string {
  if (!next || next === "/") return "/book";
  const path = next.split("?")[0];
  return path in PAGES ? next : path.slice(1);
}
