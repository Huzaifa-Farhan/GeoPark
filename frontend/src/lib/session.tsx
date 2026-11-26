// Who is logged in. The token lives in localStorage so a refresh keeps you signed in; the coordinator
// still checks it (signature, expiry, current role) on every protected request.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as api from "./api";
import type { User } from "./types";

const KEY = "geopark.session";

interface Stored {
  token: string;
  user: User;
}

interface SessionValue {
  user: User | null;
  ready: boolean; // false until a stored session has been checked with the coordinator
  expired: boolean; // true right after the coordinator refused our token
  signIn: (username: string, password: string) => Promise<api.AuthResult>;
  signUp: (username: string, password: string) => Promise<api.AuthResult>;
  signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

function load(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Stored | null>(() => {
    const s = load();
    api.setAuthToken(s?.token ?? null);
    return s;
  });
  const [ready, setReady] = useState(stored === null);
  const [expired, setExpired] = useState(false);

  const save = useCallback((s: Stored | null) => {
    api.setAuthToken(s?.token ?? null);
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
    setStored(s);
  }, []);

  // The coordinator refused our token (expired, or the account is gone): forget it.
  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      save(null);
      setExpired(true);
    });
    return () => api.setUnauthorizedHandler(null);
  }, [save]);

  // Re-check a remembered session once on load (also picks up a changed role).
  useEffect(() => {
    if (!stored || ready) return;
    let alive = true;
    api.fetchMe()
      .then((user) => {
        if (!alive) return;
        if (user) save({ token: stored.token, user });
        setReady(true);
      })
      .catch(() => alive && setReady(true)); // coordinator down: keep the session, retry later
    return () => {
      alive = false;
    };
  }, [stored, ready, save]);

  const handle = useCallback(
    async (fn: typeof api.login, username: string, password: string) => {
      const r = await fn(username, password);
      if (r.ok) {
        save({ token: r.session.token, user: r.session.user });
        setExpired(false);
        setReady(true);
      }
      return r;
    },
    [save],
  );

  const value = useMemo<SessionValue>(
    () => ({
      user: stored?.user ?? null,
      ready,
      expired,
      signIn: (u, p) => handle(api.login, u, p),
      signUp: (u, p) => handle(api.register, u, p),
      signOut: () => {
        save(null);
        setExpired(false);
      },
    }),
    [stored, ready, expired, handle, save],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession must be used inside <SessionProvider>");
  return v;
}
