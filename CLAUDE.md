# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TWILIGHT (דמדומים)** is a Hebrew-language PWA for predicting sunset quality in Israel. It uses atmospheric physics models (Rayleigh/Mie scattering) to score sunsets 1–10 based on live weather and air quality data.

## Development

**No build system.** This is a static vanilla JS PWA — no npm, no bundler, no transpilation. Files are served directly as-is.

To develop locally, serve the `twilight-pwa/` directory over HTTP (not `file://`, because service workers require HTTP):

```bash
# Any static server works, e.g.:
npx serve twilight-pwa
# or
python -m http.server 8080 --directory twilight-pwa
```

**To deploy:** bump `CACHE_NAME` in `sw.js` (currently `twl-v6`) and update the static asset list there.

## Architecture

### Module Map

| File | Role |
|------|------|
| `js/app.js` | Boot, global state (`_weekData`, `_loc`, `_city`, `_airQuality`), screen wiring, auto-refresh |
| `js/score.js` | **Core scoring algorithm** — sunset score 1–10 (805 lines) |
| `js/engine/` | Atmospheric physics sub-models (4 modules) |
| `js/api.js` | All external HTTP calls: Open-Meteo, Nominatim, Overpass |
| `js/config.js` | API URLs, cache TTLs, weather codes |
| `js/main-screen.js` | Main forecast UI, 7-day cards, compass, golden-hour countdown |
| `js/spots-screen.js` | Leaflet map (lazy-loaded), Overpass POI queries |
| `js/settings-screen.js` | Location picker, user preferences |
| `js/calibration.js` | Collects user ratings, applies bias correction to scores |
| `js/cache.js` | `localStorage` wrapper with TTL |
| `js/ui.js` | Toast, loading overlay, dynamic gradients |
| `sw.js` | Service worker — cache-first for statics, network-first for APIs |

### Scoring Pipeline

```
Weather API + Air Quality API
        ↓
  api.js (ensemble: best_match + ECMWF + GFS averaged)
        ↓
  score.js → engine/scoreEngine.js
    certainty = f(visibility, clouds, rain, fog)   [0–1]
    drama     = f(cloud structure, AOD, golden hour) [0–1]
    score     = (certainty × drama)^1.5             [1–10]
        ↓
  calibration.js (user rating bias correction)
        ↓
  main-screen.js (display)
```

### Engine Modules (`js/engine/`)

- **`physicsLayer.js`** — Rayleigh & Mie scattering, air-mass (Beer-Lambert law)
- **`scoreEngine.js`** — Piecewise models: `CloudModel`, `DustModel`, `ClearSkyModel`
- **`goldenWindow.js`** — Predicts exact peak sunset time (5–25 min after astronomical sunset)
- **`decisionEngine.js`** — High-level recommendations and warnings

### Three-Screen SPA

Screens are plain `<div id="screen-*">` elements toggled via `nav.js`. No router library. Navigation state is reflected in the URL via `?screen=spots`.

### External APIs

- **Open-Meteo** — weather forecast + air quality (AOD, PM2.5, dust)
- **Nominatim** — reverse geocoding (city names)
- **Overpass** (primary: overpass-api.de, fallback: kumi.systems) — viewpoints, peaks, cliffs, beaches

### Caching

- Cache TTLs defined in `config.js`: weather 30 min, air quality 60 min, geocoding 6 hr
- Service worker version string in `sw.js` must be bumped on each deploy to invalidate stale assets
- Leaflet map tiles capped at 250 cached tiles

## Key Conventions

- **RTL/Hebrew throughout** — all UI text is Hebrew; `dir="rtl"` on `<html>`; CSS uses `inline-start`/`inline-end` where possible
- **No framework** — vanilla ES6 modules (`type="module"`), no build step means no tree-shaking; keep imports clean
- **Lazy loading** — Leaflet CSS/JS is injected dynamically by `spots-screen.js` on first map open; do not add it to `index.html`
- **Debug panel** — long-press the app title to open; toggled via `debugPanel.js`
- **Score color palette** — 10-point metallic gradient defined in `css/app.css` CSS variables (`--score-1` … `--score-10`); use these variables, do not hardcode hex colors for scores
