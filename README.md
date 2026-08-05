# oriz-envpact-dashboard-app

[![Live](https://img.shields.io/badge/live-envpact--dashboard--app.oriz.in-4fa294)](https://envpact-dashboard-app.oriz.in)
[![Stars](https://img.shields.io/github/stars/chirag127/oriz-envpact-dashboard-app?style=social)](https://github.com/chirag127/oriz-envpact-dashboard-app/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Environmental-impact **field station** — one instrument for carbon
intensity, air quality, and sequestered load across a sensor network.

> Live at **[envpact-dashboard-app.oriz.in](https://envpact-dashboard-app.oriz.in)**. Part of [oriz.in](https://oriz.in).

## What it is

A data-instrument dashboard, not a marketing page. The hero is a live
**isopleth contour reading** across the station grid; below it, limestone
KPI faces with sparklines, a 24-hour strip-chart recorder, and a station
log flagging exceedances.

- **Public reads are open to everyone** — no sign-in for any station data.
- **Sign in only to keep a personal baseline** — pin the metrics you
  steward; the baseline follows your [oriz.in](https://oriz.in) account
  across subdomains (Clerk SSO).

## Design

Field-station instrument identity, deliberately not eco-green:

- **Palette** — basalt ground, warm limestone data tiles, mineral accents
  where each hue carries a reading: ochre = carbon/warming, verdigris =
  captured/offset (patina), clay = exceedance/alert.
- **Type** — Big Shoulders Display (signage), Hanken Grotesk (body),
  IBM Plex Mono (telemetry).
- **Signature** — a drawn isopleth contour band, the station's most
  characteristic artifact.

## Stack

- **Astro** static site + **React** islands.
- **Clerk** (`@clerk/clerk-react`) — auth for the personal baseline only.
- **Firebase Firestore** — small user data, keyed by Clerk user id.
- Config from `import.meta.env.PUBLIC_*` (see `.env.example`). No secrets
  in source; publishable keys only.

## Develop

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # → dist/
```

## License

MIT © Chirag Singhal — see [LICENSE](./LICENSE).
