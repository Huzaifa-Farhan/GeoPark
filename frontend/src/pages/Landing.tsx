// The public landing page: what GeoPark is and how the network is doing right now. Nothing here changes
// anything - booking lives on the Book page (after logging in) and operator tools in the Control room.
import { CarFront, Check, Clock3, Layers, Minus, Plus, Radio, Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Mark, Reveal } from "../components/Brand";
import { MapArt } from "../components/MapArt";
import { ago, money, spacesText } from "../lib/format";
import { areaOf, isPeak, shortName, simHourOf } from "../lib/lots";
import { href } from "../lib/router";
import { useSession } from "../lib/session";
import type { Lot, LotsResponse } from "../lib/types";

export function Landing({ lotsData, lotsFailed }: { lotsData: LotsResponse | null; lotsFailed: boolean }) {
  const { user } = useSession();
  const lots = useMemo(() => [...(lotsData?.lots ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [lotsData]);
  const staleAfter = lotsData?.stale_after ?? 6;
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Where to send someone who wants to park: straight to booking, or log in / sign up first.
  const bookHref = user ? "#/book" : href("/register", { next: "/book" });
  const live = lots.filter((l) => !l.stale);
  const featured = [...live].sort((a, b) => b.free - a.free)[0] ?? lots[0];
  const freeTotal = live.reduce((s, l) => s + l.free, 0);
  const prices = live.map((l) => l.price);
  const simTime = live[0]?.sim_time ?? null;
  const peak = isPeak(simHourOf(lots));

  const faq: [string, string][] = [
    ["Is this live parking availability?", "Yes, within the project. Every bay has a simulated IoT sensor, and each lot reports to the GeoPark coordinator every two seconds. The lots, reservations and prices are real services running in the project; the cars and sensors are simulated."],
    ["How are prices calculated?", "Each lot sets its own hourly rate from its base price, how busy the simulated time of day is (rush hours peak around 8:30 and 17:30) and how full the lot is, kept between that lot's minimum and maximum. You see the rate before you reserve, and the lot confirms it when it accepts your booking."],
    ["What if a parking lot loses its connection?", `The coordinator marks a lot stale after ${staleAfter} seconds without a heartbeat and stops taking bookings for it, suggesting nearby alternatives instead. The other lots stay available. The disconnected lot keeps working on its own and catches up on everything it missed when it reconnects.`],
    ["Can two drivers book the same space?", "No. The lot that owns the space makes the final decision. A database transaction, an overlap check and a database trigger prevent double-booking. In the project's tests, exactly one of 50 simultaneous requests for the same space succeeds."],
    ["Do I need an account to park?", "You can look around without one. To reserve a space you create a free account, so the lot can hold the space under your name and only you can cancel it. Passwords are stored only as secure hashes, and logins expire after eight hours."],
  ];

  return (
    <main id="main">
      {/* ---- hero ---------------------------------------------------------------------------------- */}
      <section className="hero shell">
        <div className="hero-copy">
          <div className="eyebrow"><span className="mini-line" /> A SMARTER STOP IN OSHAWA</div>
          <h1>A little less<br />circling.<br /><span>A lot more<br />living.</span></h1>
          <p>Find your space. Know the price.<br />Get on with the good part of your day.</p>
          <div className="hero-actions">
            <a className="button" href={bookHref}>Find a parking space</a>
            <a className="text-link" href="#how-it-works">Meet GeoPark</a>
          </div>
          <div className="hero-note">
            <span className={`status-dot ${lots.length && live.length < lots.length ? "warn" : ""}`} />
            {lots.length === 0
              ? lotsFailed ? "Connecting to the GeoPark network…" : "Checking the lots…"
              : live.length < lots.length
                ? `${live.length} of ${lots.length} lots connected right now.`
                : `${lots.length === 4 ? "Four" : lots.length} lots. One connected neighbourhood.`}
          </div>
        </div>
        <div className="hero-visual">
          <MapArt lots={lots} selected={featured?.id ?? null} />
          <div className="hero-map-card">
            <div className="lot-icon"><CarFront size={23} /></div>
            <div>
              <span className="meta">MOST SPACE RIGHT NOW</span>
              <strong>{featured?.name ?? "Loading lots…"}</strong>
              <span className="hero-card-description">
                {featured
                  ? `${featured.stale ? "Availability unavailable" : featured.free <= 0 ? "Full right now" : spacesText(featured.free)} · ${money(featured.price)}/hr`
                  : "Live availability from every lot"}
              </span>
            </div>
            <a className="map-card-button" href={bookHref}>{user ? "Book" : "Get started"}</a>
          </div>
          <div className="map-edge-label">LESS SEARCHING. MORE ARRIVING.</div>
        </div>
      </section>

      <div className="trust-strip">
        <div className="shell strip-inner">
          <span><Radio size={19} /> Sensor-led availability</span>
          <span><ShieldCheck size={19} /> One space. One reservation.</span>
          <span><Clock3 size={19} /> Clear prices before you park</span>
        </div>
      </div>

      {/* ---- how it works ------------------------------------------------------------------------- */}
      <section className="section shell" id="how-it-works">
        <Reveal>
          <div className="section-heading">
            <div>
              <span className="eyebrow">PARKING, WITH A PLAN</span>
              <h2>Your day has better<br />things in store.</h2>
            </div>
            <p>From the morning commute to a quick stop downtown. A little certainty goes a long way.</p>
          </div>
        </Reveal>
        <div className="steps">
          <Reveal className="step">
            <div className="step-art search-art">
              <div className="mini-search"><Search size={20} /><span>Somewhere near here.</span></div>
              <div className="mini-result">
                <span className="parking-square">P</span>
                <div><strong>Just around the corner</strong><span>3 min drive · 12 spaces</span></div>
                <span className="small-check"><Check size={16} /></span>
              </div>
            </div>
            <h3>Find your kind of close.</h3>
            <p>Compare nearby lots by distance, hourly price and available spaces.</p>
          </Reveal>
          <Reveal className="step">
            <div className="step-art price-art">
              <span className="meta">YOUR PARKING, UP FRONT</span>
              <div><strong>{featured ? money(featured.price) : "$2.50"}</strong><span>/ hour</span></div>
              <span className="price-foot">{featured ? `${shortName(featured)} right now. ` : ""}Know the rate before you reserve.</span>
            </div>
            <h3>A price you can plan around.</h3>
            <p>See the current rate before you choose. Pricing adapts to demand and time of day.</p>
          </Reveal>
          <Reveal className="step">
            <div className="step-art reservation-art">
              <div className="reservation-stub">
                <div><span className="meta">SPACE RESERVED</span><Check size={18} /></div>
                <strong>You're expected.</strong>
                <span>Downtown lot · Bay S12</span>
                <div className="stub-bars" />
              </div>
            </div>
            <h3>Make room for your day.</h3>
            <p>Reserve a space before you arrive. The owning lot confirms every booking.</p>
          </Reveal>
        </div>
      </section>

      {/* ---- the lots, right now (read only) ------------------------------------------------------- */}
      <section className="finder-section" id="lots">
        <div className="shell">
          <Reveal>
            <div className="section-heading">
              <div>
                <span className="eyebrow">ACROSS OSHAWA, RIGHT NOW</span>
                <h2>Every lot. One clear view.</h2>
              </div>
              <span className={`demo-badge ${peak ? "peak" : ""}`}>
                {simTime ? `SIMULATED TIME ${simTime}${peak ? " · PEAK PRICING" : ""}` : "LIVE AVAILABILITY"}
              </span>
            </div>
          </Reveal>
          <p className="finder-intro">
            {live.length
              ? `${spacesText(freeTotal).replace(" available", "")} free across ${live.length} connected ${live.length === 1 ? "lot" : "lots"}${prices.length ? `, from ${money(Math.min(...prices))} to ${money(Math.max(...prices))} an hour` : ""}.`
              : "Live availability appears as soon as the lots report in."}
          </p>
          <div className="overview">
            <ul className="overview-list" aria-live="polite">
              {lots.map((l) => <OverviewRow key={l.id} lot={l} />)}
              {lots.length === 0 && (
                <li className="overview-empty">{lotsFailed ? "We can't reach GeoPark right now." : "Looking for lots…"}</li>
              )}
            </ul>
            <div className="overview-cta">
              <Mark className="overview-mark" />
              <h3>{user ? "Ready when you are." : "Reserve before you arrive."}</h3>
              <p>
                {user
                  ? "Pick a lot, see every bay, and the lot will hold your space."
                  : "Create a free account to see every bay inside each lot and reserve a space under your name."}
              </p>
              <a className="button" href={bookHref}>{user ? "Book parking" : "Create your free account"}</a>
              {!user && <a className="text-link" href={href("/login", { next: "/book" })}>I already have an account</a>}
            </div>
          </div>
        </div>
      </section>

      <NetworkSection lots={lots} staleAfter={staleAfter} />

      {/* ---- technical notes ---------------------------------------------------------------------- */}
      <section className="section shell details-section" id="technical-notes">
        <Reveal>
          <div className="section-heading">
            <div>
              <span className="eyebrow">A LITTLE MORE UNDER THE HOOD</span>
              <h2>Simple on the surface.<br />Considered underneath.</h2>
            </div>
            <p>A distributed-systems project built around a very everyday problem.</p>
          </div>
        </Reveal>
        <div className="details-grid">
          <div className="project-note">
            <Layers size={32} />
            <h3>Independent lots.<br />One clear experience.</h3>
            <p>Each lot owns its data and makes the final reservation decision. The coordinator brings availability together for drivers.</p>
            <div className="project-tags"><span>Fault tolerance</span><span>Concurrency</span><span>Scalability</span><span>Security</span></div>
          </div>
          <div className="faq">
            {faq.map(([question, answer], i) => (
              <div key={question} className="faq-item">
                <h3>
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i} aria-controls={`faq-${i}`}>
                    {question}
                    {openFaq === i ? <Minus size={19} /> : <Plus size={19} />}
                  </button>
                </h3>
                <div id={`faq-${i}`} hidden={openFaq !== i}><p>{answer}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="closing shell">
        <Reveal>
          <div className="closing-inner">
            <div>
              <span className="eyebrow">YOUR NEXT STOP STARTS HERE</span>
              <h2>Arrive with a little<br />less on your mind.</h2>
            </div>
            <a className="button" href={bookHref}>{user ? "Book parking" : "Create your free account"}</a>
            <Mark className="closing-mark" />
          </div>
        </Reveal>
      </section>
    </main>
  );
}

function OverviewRow({ lot }: { lot: Lot }) {
  const unavailable = lot.stale;
  const full = !lot.stale && lot.free <= 0;
  return (
    <li className="overview-row">
      <span className="lot-number">P<span>{shortName(lot).slice(0, 2).toUpperCase()}</span></span>
      <div className="overview-main">
        <h3>{lot.name}</h3>
        <p>{areaOf(lot)}</p>
      </div>
      <span className={`availability ${unavailable || full ? "unavailable" : ""}`}>
        <span className="status-dot" />
        {unavailable ? "Temporarily unavailable" : full ? "Full right now" : spacesText(lot.free)}
      </span>
      <strong className="overview-price">{money(lot.price)}<span>/hr</span></strong>
    </li>
  );
}

/** The design's network illustration, driven by the coordinator's real heartbeat status. Read only. */
function NetworkSection({ lots, staleAfter }: { lots: Lot[]; staleAfter: number }) {
  const [restored, setRestored] = useState<string | null>(null);
  const prevStale = useRef<Record<string, boolean>>({});

  // notice lots coming back so we can say so
  useEffect(() => {
    for (const l of lots) {
      if (prevStale.current[l.id] && !l.stale) setRestored(shortName(l));
      prevStale.current[l.id] = l.stale;
    }
  }, [lots]);

  const stale = lots.filter((l) => l.stale);
  const live = lots.length - stale.length;
  let feedback: string;
  if (!lots.length) feedback = "Waiting for the lots to report in.";
  else if (stale.length === 1) feedback = `${shortName(stale[0])} is unavailable. ${live === 1 ? "One other lot is" : `${live} other lots are`} ready.`;
  else if (stale.length > 1) feedback = `${stale.length} lots are unavailable. ${live} ${live === 1 ? "lot is" : "lots are"} ready.`;
  else if (restored) feedback = `${restored} reconnected and caught up. All ${lots.length} lots are available.`;
  else feedback = `All ${lots.length === 4 ? "four" : lots.length} lots are connected and ready.`;

  return (
    <section className="network-section" id="network">
      <div className="shell network-grid">
        <Reveal className="network-copy">
          <span className="eyebrow">LOCAL STRENGTH. CONNECTED THINKING.</span>
          <h2>One lot goes quiet.<br /><span>The city keeps moving.</span></h2>
          <p>Each GeoPark lot runs independently. When one loses its connection, the others stay available—so you can find another place to park.</p>
          <div className="network-facts">
            <div><strong>2 sec</strong><span>between heartbeats</span></div>
            <div><strong>{staleAfter} sec</strong><span>until a lot is marked stale</span></div>
          </div>
          <a className="network-link" href="#technical-notes">A closer look at the system</a>
        </Reveal>
        <Reveal className="network-demo">
          <div className="network-demo-top"><span>THE OSHAWA NETWORK</span><span className="network-demo-tag">LIVE</span></div>
          <div className="network-node">
            <Mark />
            <div><strong>GeoPark coordinator</strong><span>One connected view</span></div>
            <span className="status-dot" />
          </div>
          <div className="network-connectors"><i /><i /><i /><i /></div>
          <div className="network-lots" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(lots.length, 1), 5)}, 1fr)` }}>
            {lots.map((l) => (
              <div key={l.id} className={`network-lot ${l.stale ? "disconnected" : ""}`}>
                <span className="network-lot-icon">P</span>
                <strong>{shortName(l)}</strong>
                <span>{l.stale ? `Stale · ${ago(l.age_seconds)}` : "Connected"}</span>
              </div>
            ))}
          </div>
          <div className="network-feedback" role="status">
            <span className={`status-dot ${stale.length ? "amber" : ""}`} />
            {feedback}
          </div>
          <span className="simulation-note">Live status from the coordinator's heartbeat monitor.</span>
        </Reveal>
      </div>
    </section>
  );
}
