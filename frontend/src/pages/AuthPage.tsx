import { AlertCircle, Check, Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Mark } from "../components/Brand";
import { href, navigate, resolveNext } from "../lib/router";
import { useSession } from "../lib/session";

const USERNAME_RE = /^[A-Za-z0-9_.-]{3,32}$/;

export function AuthPage({ mode, next }: { mode: "login" | "register"; next: string | null }) {
  const { user, signIn, signUp, expired } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const isLogin = mode === "login";

  useEffect(() => {
    setError(null);
    setTouched(false);
    setPassword("");
    setConfirm("");
    firstField.current?.focus();
  }, [mode]);

  // Already signed in (or just signed in): carry on to where the user was heading.
  useEffect(() => {
    if (user) navigate(resolveNext(next));
  }, [user, next]);

  const problems = isLogin
    ? []
    : [
        !USERNAME_RE.test(username) && "Username: 3–32 letters, numbers, dots, dashes or underscores.",
        password.length < 8 && "Password: at least 8 characters.",
        confirm !== password && "The two passwords don't match.",
      ].filter(Boolean) as string[];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    if (problems.length) {
      setError(problems[0]);
      return;
    }
    setBusy(true);
    setError(null);
    const r = await (isLogin ? signIn : signUp)(username.trim(), password);
    setBusy(false);
    if (!r.ok) {
      if (r.status === 409) setError("That username is taken. Try another one, or log in instead.");
      else if (r.status === 401) setError("That username and password don't match. Try again.");
      else setError(r.message.charAt(0).toUpperCase() + r.message.slice(1));
      setPassword("");
      setConfirm("");
    }
  };

  const otherHref = href(isLogin ? "/register" : "/login", next ? { next } : undefined);

  return (
    <main id="main" className="auth-page">
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <span className="eyebrow"><span className="mini-line" /> {isLogin ? "WELCOME BACK" : "JOIN GEOPARK"}</span>
          <h1>{isLogin ? "Log in to park." : "Create your account."}</h1>
          <p className="auth-lede">
            {isLogin
              ? "Your reservations are held under your account, so only you can change or cancel them."
              : "One account for every GeoPark lot. Reserve a space before you arrive and see all your bookings in one place."}
          </p>
          {expired && isLogin && (
            <div className="notice warn" role="status"><AlertCircle size={18} /> Your session ended. Please log in again.</div>
          )}
          <form onSubmit={submit} className="auth-form" noValidate>
            <label className="field">
              <span>Username</span>
              <input
                ref={firstField}
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                aria-invalid={touched && !isLogin && !USERNAME_RE.test(username)}
                spellCheck={false}
                autoCapitalize="none"
                required
              />
              {!isLogin && <small>3–32 characters: letters, numbers, “.”, “-” or “_”.</small>}
            </label>
            <label className="field">
              <span>Password</span>
              <span className="password-wrap">
                <input
                  type={show ? "text" : "password"}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={touched && !isLogin && password.length < 8}
                  required
                />
                <button type="button" className="icon-button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
              {!isLogin && <small>At least 8 characters.</small>}
            </label>
            {!isLogin && (
              <label className="field">
                <span>Confirm password</span>
                <input
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={touched && confirm !== password}
                  required
                />
              </label>
            )}
            {error && (
              <p className="form-error" role="alert"><AlertCircle size={17} /> {error}</p>
            )}
            <button className="button full" disabled={busy} aria-busy={busy}>
              {busy ? (isLogin ? "Logging in…" : "Creating your account…") : isLogin ? "Log in" : "Create account"}
            </button>
          </form>
          <p className="auth-switch">
            {isLogin ? "New to GeoPark?" : "Already have an account?"}{" "}
            <a className="text-link" href={otherHref}>{isLogin ? "Create an account" : "Log in"}</a>
          </p>
        </div>
      </section>
      <aside className="auth-aside" aria-hidden="true">
        <Mark className="auth-mark" />
        <span className="eyebrow">A LITTLE LESS CIRCLING.</span>
        <h2>Find your space.<br /><span>Know the price.</span><br />Get on with your day.</h2>
        <ul>
          <li><Check size={18} /> The owning lot confirms every booking.</li>
          <li><Check size={18} /> One space, one reservation. No double-booking.</li>
          <li><Check size={18} /> Passwords are stored only as secure hashes.</li>
        </ul>
      </aside>
    </main>
  );
}
