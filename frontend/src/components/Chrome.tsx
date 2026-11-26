import { LogOut, Menu, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { href, loginHref, navigate, type Route } from "../lib/router";
import { useSession } from "../lib/session";
import { Logo } from "./Brand";

export function Header({ route }: { route: Route }) {
  const { user, signOut } = useSession();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [route]);
  const close = () => setMenu(false);
  const isActive = (page: Route["page"]) => (route.page === page ? "active" : "");

  return (
    <header className={`header ${user ? "signed-in" : ""}`}>
      <div className="header-inner">
        <Logo />
        <nav className={menu ? "nav open" : "nav"} aria-label="Main navigation">
          {user ? (
            <>
              <a href="#/book" className={isActive("book")} onClick={close}>Book parking</a>
              <a href="#/reservations" className={isActive("reservations")} onClick={close}>My reservations</a>
              {user.role === "admin" && (
                <a href="#/admin" className={isActive("admin")} onClick={close}>Control room</a>
              )}
            </>
          ) : (
            <>
              <a href="#how-it-works" onClick={close}>How it works</a>
              <a href="#lots" onClick={close}>The lots</a>
              <a href="#network" onClick={close}>The network</a>
            </>
          )}
          {/* account actions repeated inside the mobile menu */}
          <span className="nav-account">
            {user ? (
              <button className="text-link" onClick={() => { signOut(); navigate("/"); }}>Sign out ({user.username})</button>
            ) : (
              <a href={loginHref()} className={isActive("login")}>Log in</a>
            )}
          </span>
        </nav>
        <div className="header-actions">
          {user ? (
            <div className="account">
              <span className="account-chip" title={user.role === "admin" ? "Operator account" : "Driver account"}>
                <UserRound size={17} aria-hidden="true" />
                <span>{user.username}</span>
                {user.role === "admin" && <span className="role-tag">OPERATOR</span>}
              </span>
              <button className="icon-button" onClick={() => { signOut(); navigate("/"); }} aria-label="Sign out" title="Sign out">
                <LogOut size={19} />
              </button>
            </div>
          ) : (
            <>
              <a href={loginHref()} className="text-link header-login">Log in</a>
              <a href={href("/register", { next: "/book" })} className="button small header-cta">Get started</a>
            </>
          )}
        </div>
        <button className="mobile-menu icon-button" onClick={() => setMenu(!menu)} aria-label="Toggle navigation" aria-expanded={menu}>
          {menu ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  );
}

export function Footer() {
  const { user } = useSession();
  return (
    <footer className="footer shell">
      <div>
        <Logo />
        <p>A little less circling.</p>
      </div>
      <div className="footer-links">
        {user ? (
          <>
            <a href="#/book">Book parking</a>
            <a href="#/reservations">My reservations</a>
          </>
        ) : (
          <>
            <a href="#how-it-works">How it works</a>
            <a href={href("/register", { next: "/book" })}>Create an account</a>
            <a href={loginHref("/book")}>Log in</a>
          </>
        )}
        <a href="#technical-notes">About the project</a>
      </div>
      <div className="footer-bottom">
        <span>GeoPark · Distributed smart parking</span>
        <span>Oshawa, ON · SOFE4790U student project · Simulated sensors, no payments</span>
      </div>
    </footer>
  );
}
