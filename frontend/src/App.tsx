import { useEffect, useMemo } from "react";
import { Footer, Header } from "./components/Chrome";
import * as api from "./lib/api";
import { useRoute } from "./lib/router";
import { SessionProvider } from "./lib/session";
import { usePolling } from "./lib/usePolling";
import { AuthPage } from "./pages/AuthPage";
import { Book } from "./pages/Book";
import { ControlRoom } from "./pages/ControlRoom";
import { Landing } from "./pages/Landing";
import { Reservations } from "./pages/Reservations";

const TITLES: Record<string, string> = {
  home: "GeoPark — A little less circling.",
  login: "Log in · GeoPark",
  register: "Create an account · GeoPark",
  reservations: "Your reservations · GeoPark",
  admin: "Control room · GeoPark",
  book: "Book parking · GeoPark",
};

function Shell() {
  const route = useRoute();
  // Lot availability is public and shared by every page; one poll keeps them all in step.
  const lots = usePolling(api.fetchLots, 2000);
  const lotNames = useMemo(() => Object.fromEntries((lots.data?.lots ?? []).map((l) => [l.id, l.name])), [lots.data]);

  useEffect(() => {
    document.title = TITLES[route.page] ?? TITLES.home;
  }, [route.page]);

  // Landing-page anchors scroll to their section; other pages start at the top.
  useEffect(() => {
    if (route.page === "home" && route.anchor) {
      const id = route.anchor;
      let tries = 0;
      const go = () => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "instant" as ScrollBehavior });
        else if (tries++ < 10) requestAnimationFrame(go);
      };
      requestAnimationFrame(go);
    } else {
      window.scrollTo(0, 0);
    }
  }, [route]);

  let page;
  switch (route.page) {
    case "login":
    case "register":
      page = <AuthPage mode={route.page} next={route.next} />;
      break;
    case "reservations":
      page = <Reservations lotNames={lotNames} refreshLots={lots.refresh} />;
      break;
    case "admin":
      page = <ControlRoom lotsData={lots.data} refreshLots={lots.refresh} />;
      break;
    case "book":
      page = <Book lotsData={lots.data} lotsFailed={lots.failed} refreshLots={lots.refresh} />;
      break;
    default:
      page = <Landing lotsData={lots.data} lotsFailed={lots.failed} />;
  }

  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => {
          e.preventDefault();
          const main = document.getElementById("main");
          main?.setAttribute("tabindex", "-1");
          main?.focus();
        }}>Skip to content</a>
      <Header route={route} />
      {page}
      {route.page !== "login" && route.page !== "register" && <Footer />}
    </>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}
