# GeoPark — Brand identity system
Version 1.0 · November 2026

## 1. Brand foundation

**Name:** GeoPark. Use this spelling in prose. The designed wordmark uses lowercase `geopark.`; the full stop is a visual signature, not part of the product name in sentences.

**Category:** Distributed smart parking. A student project that simulates sensor-led availability, demand-based prices and reservations across independent parking lots in Oshawa, Ontario.

**Purpose:** Give drivers a clearer next step: where to park, what it costs, and whether their space is confirmed.

**Positioning:** For drivers who want a predictable arrival, GeoPark brings nearby parking choices into one understandable view. Each lot operates independently; the coordinator connects those choices for the driver.

**Brand promise:** Less uncertainty between where you are and where you need to be.

**Primary line:** A little less circling.

**Supporting campaign line:** A little less circling. A lot more living.

**Product descriptor:** Find your space. Know the price. Get on with your day.

**Personality:** Useful, composed, human. Practical like good signage. Friendly without being cute. Calm without feeling passive. Specific without overwhelming the driver with implementation detail.

**Audience:** Drivers making short city trips, commuters, visitors and students. A secondary audience is the course evaluator viewing distributed-system behaviour. Put driver tasks first; make project detail available in a separate section or admin view.

## 2. Creative direction: urban wayfinding

The identity takes its cues from street signage, parking-bay geometry, city maps and restrained civic typography. It uses strong contrast, a clear reading order and generous but purposeful space. A blue action should be easy to find. A status should be easy to understand. A price should be easy to compare.

Use the geometric P, the lowercase wordmark, consistent spacing and the blue/ink/lime combination as recurring recognisable elements. Do not rely on generic gradients, abstract blobs, decorative dashboards or repeated card grids to establish the brand.

## 3. Logo system

The symbol is an open geometric P. Its outer structure suggests the boundary of a parking bay; the inset horizontal line suggests the parked vehicle. It is intentionally simple enough for a map marker or app icon.

### Assets

- `geopark-wordmark-ink.svg`: primary horizontal logo for light surfaces; blue full stop.
- `geopark-wordmark-white.svg`: reverse logo for dark surfaces; lime full stop.
- `geopark-wordmark-blue.svg`: monochrome blue logo.
- `geopark-wordmark-black.svg`: monochrome black logo for one-colour output.
- `geopark-symbol-ink.svg`, `-white.svg`, `-blue.svg`, `-black.svg`: standalone symbols.
- `geopark-app-icon.svg`: white symbol on a blue rounded square; also suited to a favicon.

All wordmark lettering is outlined. No font needs to be installed to render these SVGs.

### Placement and sizing

Use the full wordmark in navigation and the footer. Use the symbol alone for favicons, map-related controls, app tiles and small branded spaces. Keep a minimum clear space equal to one main symbol stroke on every side. At the symbol's 40-unit design size, that is 6 units. Minimum standalone symbol size: 24 px. Minimum wordmark width: 120 px. Use the full app-icon asset for 16–32 px favicon contexts and verify legibility at final size.

Do not stretch, rotate, outline the lettering, apply gradients or shadows, place it over noisy imagery, change individual letter spacing, or rebuild the wordmark with a different font. The tilted app-icon treatment on the brand presentation is a showcase composition; everyday navigation and product logos remain upright.

## 4. Colour system

| Name | HEX | Role |
|---|---|---|
| Wayfinding blue | #174BE8 | Primary actions, active selections, links, key brand accents |
| City ink | #172D28 | Main text, logo, dark feature sections |
| Chalk | #F5F6F2 | Default page background |
| Park lime | #DFEFB7 | Supporting emphasis, confirmation surfaces, dark-theme accent |
| Street grey | #D9DFD6 | Borders and map texture |
| White | #FFFFFF | Raised light surfaces, text on blue |
| Muted text | #59665E | Secondary text on light backgrounds |
| Available | #24724B | Availability and success text on light backgrounds |
| Attention | #8A5400 | Unavailable or stale status on light backgrounds |
| Error | #A53636 | Failed or conflicting reservation text |

As a composition guide, use approximately 65–75% light neutral, 15–25% ink or other neutral, and the remaining area for blue/lime accents. This is an editorial starting point, not a charting rule. Avoid filling every surface with a brand colour.

### Contrast-checked pairs

| Foreground / background | Calculated contrast |
|---|---:|
| City ink / Chalk | 13.41:1 |
| Muted text / Chalk | 5.55:1 |
| White / Wayfinding blue | 6.55:1 |
| Available / White | 5.86:1 |
| Attention / Chalk | 5.78:1 |
| Error / Chalk | 6.08:1 |
| Dark muted #B7C5BA / City ink | 8.12:1 |

These checks cover the named pairs, not an accessibility certification of every possible combination. Verify focus, disabled and hover treatments in context. Lime is a supporting surface, not readable small text on white.

### Dark surfaces

Use City ink as background, #203830 as surface, #2C4336 as raised surface, Chalk as text, #B7C5BA as secondary text, #617565 as borders, and lime as action fill with ink text. Dark-theme warning: #F4CE90; error: #FFA6A6. The provided dark tokens support future screens; the landing page deliberately mixes a light main canvas with a dark network section rather than offering a global theme switch.

## 5. Typography

**Family:** DM Sans. **Fallback:** Arial, sans-serif. Use the supplied self-hosted TTF files for 400, 500, 600 and 700. The SIL Open Font License and copyright notice are included with the font files. Use `font-display: swap`.

| Role | Desktop | Mobile | Weight | Line height |
|---|---:|---:|---:|---:|
| Display | 88–96 px | 64–86 px, fluid | 500 | 0.98–1.02 |
| Section title | 48–54 px | 34–40 px | 500 | 1.08–1.12 |
| Subheading | 22–27 px | 22–27 px | 500 | 1.25 |
| Body | 16–18 px | 16–17 px | 400 | 1.6–1.7 |
| Control / label | 14–16 px | 14–16 px | 500 | 1.4 |
| Supporting metadata | 12–13 px | 12–13 px | 400–500 | 1.5 |

Use tracking around -0.045em to -0.055em for large display type; keep body tracking normal. Uppercase eyebrows may use 0.1em to 0.14em tracking. Tiny labels inside decorative illustrations are not the specification for real product controls. Use 14 px or larger for task-critical production statuses, rates, dates and reservation controls.

Use tabular numerals for aligned prices and capacity totals. Avoid excessive bold. A hierarchy should remain clear from scale, placement and spacing.

## 6. Layout and shape

- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 96 px.
- Maximum inner content width: 1280 px; outer shell may reach 1408 px including desktop gutters.
- Gutters: 64 px desktop, 36 px tablet, 24 px mobile.
- Main sections: roughly 90–104 px vertical padding desktop; 64 px mobile.
- Breakpoints: 600, 850, 1100 px; adapt based on content, not device names.
- Controls: 8 px radius. Panels: 12 px. Map surfaces: 16 px.
- Borders: 1 px. Shadows: limited to objects that float above a surface, such as map labels and dialogs.
- Buttons: target 48–52 px height; compact controls should retain a comfortable touch target.

Use rows and fine separators for parking choices. Use cards when content represents a distinct object or state. Avoid making every sentence a card.

## 7. Iconography and imagery

Use Lucide outline icons consistently. Default icon size 20–24 px, stroke 1.5–2 px. Do not mix filled and outline icon libraries without a functional reason. A parking P is a wayfinding symbol, not a decorative icon on every paragraph.

The primary imagery is a schematic city map: pale block shapes, quiet street lines, green park/creek texture and blue selected markers. Map labels must be secondary to parking availability and prices. The prototype map is explicitly illustrative and unsuitable for navigation; use actual coordinates and a licensed map source for production.

If photography is later introduced, use grounded urban scenes: street corners, parking entrances, local destinations and people arriving. Avoid fake aerial maps, glossy sci-fi sensor imagery and stock handshakes. Keep a consistent natural colour grade.

The social cover is supplied as an outlined 1200 × 630 SVG. Use it for project decks or convert to PNG for social platforms.

## 8. Components and states

**Primary button:** blue fill, white label, 8 px radius, 48–52 px minimum height. Hover: darker blue #103CBE. Focus: 3 px blue ring with separation from the element. Disabled: visibly muted and truly disabled in the DOM.

**Secondary action:** ink text, thin border or text underline. Avoid arrow icons attached to every action.

**Lot row:** name, vicinity/distance, explicit availability, hourly rate and Reserve action. Selection should be visible through a blue rule or border plus pressed/selected semantics.

**Map marker:** P symbol plus price. Selected marker uses blue fill and white text. Stale markers show explicit “Offline” or “Unavailable” text.

**Reservation dialog:** lot name, duration, rate, total and final confirmation. Show a confirmed state only after the owning lot accepts. In this dummy prototype, clearly label every reservation as a demo.

**Empty search:** explain what happened and provide a clear reset action.

**Network state:** connected, stale, reconnecting, recovered. Colour always has a companion label. Avoid claiming that a heartbeat means reservation success.

**Errors:** keep user choices when possible. Explain the next step rather than printing implementation details.

Suggested production messages:

- Available: “12 spaces available.”
- Pending: “Confirming your space…”
- Conflict: “This space was just reserved. Choose another space.”
- Stale lot: “This lot is temporarily unavailable. Try a nearby lot.”
- Unknown outcome: “We couldn't confirm the result. Retry this reservation.” Reuse the original request ID when retrying.
- Success: “Your space is confirmed.”
- Recovered lot: “Availability is back. You can reserve again.”

## 9. Motion

Reveal sections once as they enter the viewport: 20 px vertical movement, opacity 0 to 1, 650 ms duration, `cubic-bezier(0.2,0.7,0.2,1)`. Optional related-item stagger: 80 ms, capped around 160 ms total. Keep hover transitions at 160 ms.

Do not hijack scrolling, introduce mandatory timed reading, autoplay decorative videos, or make pricing animate through invented numbers. Interactive controls should respond immediately. Respect `prefers-reduced-motion: reduce`: remove reveal transforms, animated transitions and smooth scrolling; content stays visible. Preserve keyboard focus and do not use motion as the only status signal.

## 10. Voice and writing

Use Canadian English, CAD prices and plain language. Say “neighbourhood”, “centre”, and “colour”. Prefer sentences a driver can read quickly. Use human words in the driver interface, while preserving technical accuracy in course/project material.

| Prefer | Avoid |
|---|---|
| Find a parking space | Unlock a revolutionary mobility experience |
| $2.50/hr · $5.00 total | Dynamic pricing optimisations applied |
| Your space is confirmed. | Your request was processed successfully. |
| This lot is temporarily unavailable. | Heartbeat threshold exceeded: HTTP 503 |
| Try a nearby lot. | Please contact your system administrator. |

Never imply guaranteed availability before the lot confirms. Do not claim real-world deployment, customers, usage statistics, payments, carbon savings, municipal partnerships or location accuracy that the project has not established.

## 11. Frontend integration notes

The supplied prototype uses React, TypeScript, Vite and Tailwind's Vite integration, with purpose-built CSS for the identity. It uses local in-memory state; refreshing resets demo reservations and connectivity. The sample names, prices, distances and availability are illustrative, not read from `config/lots.json`.

For integration with the existing project:

1. Replace the `lots` fixtures with the coordinator's real `/api/*` contract and the actual lot configuration. Do not assume the sample labels are canonical IDs.
2. Keep every driver request directed to the coordinator. Never call lot ports directly from this frontend.
3. Create one request ID for a booking attempt; reuse it for network retries. Do not generate a fresh ID for the same uncertain attempt.
4. Show a pending state until the lot's confirmed response arrives. Handle conflict, stale/503, validation failure and unknown transport outcome separately.
5. Treat displayed availability as a coordinator snapshot, not a booking guarantee. The owning lot is the authority.
6. In a production/admin view, show last-reported timestamps and distinguish stale information from zero free spaces.
7. Wire disconnection, sensor changes and clock controls only to documented `/api/admin/*` routes. Put privileged controls in a separate authenticated admin interface if the project later adds authentication.
8. Keep recovery messaging faithful to event-log replay. Do not claim the coordinator itself is replicated or fault tolerant; this architecture currently describes one coordinator.
9. Use the real ranking output for recommendations. The prototype defaults to sample distance from downtown, not the user's location and not the backend weighted ranking.
10. Do not use the schematic map for navigation; replace it with an accurately georeferenced map before real deployment.

The dummy network control changes immediately to demonstrate the state. The actual coordinator uses a 6-second heartbeat timeout. The prototype does not reproduce SQLite concurrency, server-side idempotency, sensor updates, event replay, demand pricing or the simulated clock. Those behaviours belong to the tested backend.

## 12. Asset manifest

- This written guideline.
- Four outlined SVG wordmarks and four symbol variants.
- App/fav icon SVG.
- 1200 × 630 social cover SVG.
- `geopark-tokens.json`: colour, typography, spacing, layout and motion decisions.
- `geopark-theme.css`: semantic light/dark CSS variables.
- Font files and `OFL-DM-Sans.txt`.
- `README.md`: quick usage instructions.

The website's Brand studio is the visual companion to this document. The source package includes the complete frontend, setup commands and integration notes.
