import { Lock } from "lucide-react";
import { href, loginHref } from "../lib/router";

/** Shown in place of a page that needs an account. */
export function LoginRequired({ title, next }: { title: string; next: string }) {
  return (
    <main id="main" className="page shell">
      <div className="empty-state boxed gate">
        <Lock size={28} />
        <h1>{title}</h1>
        <p>Log in to see this page. Your reservations are tied to your account.</p>
        <div className="gate-actions">
          <a className="button" href={loginHref(next)}>Log in</a>
          <a className="text-link" href={href("/register", { next })}>Create an account</a>
        </div>
      </div>
    </main>
  );
}

/** Shown to a signed-in driver who opens an operator-only page. */
export function OperatorsOnly() {
  return (
    <main id="main" className="page shell">
      <div className="empty-state boxed gate">
        <Lock size={28} />
        <h1>For operators only</h1>
        <p>The control room changes how the whole network behaves, so only operator accounts can open it.</p>
        <div className="gate-actions">
          <a className="button" href="#/book">Book parking</a>
          <a className="text-link" href="#/reservations">My reservations</a>
        </div>
      </div>
    </main>
  );
}
