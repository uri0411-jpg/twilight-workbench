// ═══════════════════════════════════════════
//  TWILIGHT — spots-screen.js v5
//  Cinematic: warm map filter, haptic
// ═══════════════════════════════════════════

import { fetchSpots, fetchCityName } from './api.js';
import { loadLocation, getGPS, saveLocation } from './location.js';
import { scoreToColor, scoreToColorContinuous, scoreToMetal, scoreToLabel, distKm, addMinutes, calcSolarAzimuth, destPoint } from './utils.js';
import { showToast, showLoading, logoImg, esc } from './ui.js';
import { haptic } from './nav.js';
import { decide } from './engine/decisionEngine.js';

let _spots        = [];
let _sortMode     = 'smart';
let _filterType   = 'all';
let _radiusKm     = 25;
let _map          = null;
let _markers      = [];
let _sunsetLines  = [];
let _markerSpotMap = {};
let _popupHandlerRegistered = false;
let _loc          = null;
let _weekData     = null;
let _favorites    = loadFavorites();
let _visited      = loadVisited();
let _leafletReady = false;
let _visibleCount = 15;

// ─────────────────────────────────────────
//  Lazy-load Leaflet CSS + JS on demand (5)
// ─────────────────────────────────────────
function loadLeaflet() {
  if (_leafletReady || typeof L !== 'undefined') { _leafletReady = true; return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    // CSS first
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);

    // JS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    script.crossOrigin = 'anonymous';
    script.onload  = () => { _leafletReady = true; resolve(); };
    script.onerror = () => reject(new Error('Leaflet load failed'));
    document.head.appendChild(script);
  });
}

// ─── Favorites ───────────────────────────
const FAV_KEY = 'twl_fav_spots';
function loadFavorites() { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch { return []; } }
function saveFavorites() { try { localStorage.setItem(FAV_KEY, JSON.stringify(_favorites)); } catch {} }
function isFavorite(name, lat, lon) { return _favorites.some(f => f.name === name && Math.abs(f.lat - lat) < 0.001); }
function toggleFavorite(name, lat, lon) {
  const idx = _favorites.findIndex(f => f.name === name && Math.abs(f.lat - lat) < 0.001);
  if (idx >= 0) _favorites.splice(idx, 1); else _favorites.push({ name, lat, lon });
  saveFavorites();
}

// ─── Visited ────────────────────────────
const VIS_KEY = 'twl_visited_spots';
function loadVisited() { try { return JSON.parse(localStorage.getItem(VIS_KEY)) || []; } catch { return []; } }
function saveVisited() { try { localStorage.setItem(VIS_KEY, JSON.stringify(_visited)); } catch {} }
function isVisited(name, lat, lon) { return _visited.some(v => v.name === name && Math.abs(v.lat - lat) < 0.001); }
function toggleVisited(name, lat, lon) {
  const idx = _visited.findIndex(v => v.name === name && Math.abs(v.lat - lat) < 0.001);
  if (idx >= 0) _visited.splice(idx, 1);
  else _visited.push({ name, lat, lon, date: new Date().toISOString().slice(0, 10) });
  saveVisited();
}

// ─── Type icons ──────────────────────────
const TYPE_ICONS = {
  'פסגה': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 21l4-11 4 11"/><path d="M2 21h20"/><path d="M12 6l2 4"/></svg>`,
  'נקודת תצפית': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="3"/><path d="M5 21l3-12h8l3 12"/></svg>`,
  'מצוק': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 21V8l5-5 4 7 5-3 4 4v10H3z"/></svg>`,
  'חוף': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 20c2-1 4-1 6 0s4 1 6 0 4-1 6 0"/><path d="M2 17c2-1 4-1 6 0s4 1 6 0 4-1 6 0"/><circle cx="16" cy="6" r="3"/></svg>`,
};
function getTypeIcon(type) { return TYPE_ICONS[type] || TYPE_ICONS['נקודת תצפית']; }

// ─── Compass arrow ───────────────────────
function compassArrow(bearing) {
  return `<svg class="spot-compass" width="20" height="20" viewBox="0 0 24 24" style="transform:rotate(${bearing}deg)">
    <path d="M12 2l3 8h-6l3-8z" fill="var(--gold-light)" opacity="0.9"/>
    <path d="M12 22l-3-8h6l-3 8z" fill="var(--cream-faint)" opacity="0.4"/>
    <circle cx="12" cy="12" r="2" fill="none" stroke="var(--cream-faint)" stroke-width="1"/>
  </svg>`;
}

// ─── Bearing / azimuth ───────────────────
function calcBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const la1 = lat1 * Math.PI / 180, la2 = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}
function isWestFacing(b) { return b >= 210 && b <= 330; }
function isEastFacing(b) { return b >= 30 && b <= 150; }

function getSunsetAzimuth() {
  // Use accurate solar azimuth at today's sunset if weekData is available
  const today = _weekData?.[0];
  if (today?.sunset && _loc?.lat) {
    const [h, m] = today.sunset.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return calcSolarAzimuth(_loc.lat, _loc.lon, d);
  }
  // Fallback: seasonal approximation
  const month = new Date().getMonth() + 1;
  if (month >= 5 && month <= 8) return 295;
  if (month >= 11 || month <= 2) return 245;
  return 270;
}
function getNextEvent() {
  const today = _weekData?.[0];
  if (!today?.sunrise || !today?.sunset) return { type: 'sunset', azimuth: getSunsetAzimuth() };
  const now = new Date();
  const [srH, srM] = today.sunrise.split(':').map(Number);
  const [ssH, ssM] = today.sunset.split(':').map(Number);
  const sunriseTime = new Date(); sunriseTime.setHours(srH, srM, 0, 0);
  const sunsetTime  = new Date(); sunsetTime.setHours(ssH, ssM, 0, 0);
  const ssAz = getSunsetAzimuth();
  const srAz = (ssAz + 180) % 360;
  if (now < sunriseTime) return { type: 'sunrise', azimuth: srAz };
  if (now < sunsetTime)  return { type: 'sunset',  azimuth: ssAz };
  return { type: 'sunrise', azimuth: srAz }; // after sunset → next is sunrise
}

function azimuthBonus(bearing, idealAz) {
  const diff = Math.abs(bearing - idealAz);
  const norm = diff > 180 ? 360 - diff : diff;
  if (norm <= 30) return 0.15;
  if (norm <= 60) return 0.07;
  return 0;
}

// ─── Helpers ─────────────────────────────
function estimateDriveMin(dist) {
  if (dist <= 3)  return Math.round(dist * 3);
  if (dist <= 15) return Math.round(dist * 2.2);
  return Math.round(dist * 1.5);
}
function calcDepartureTime(driveMin, eventTime, eventType) {
  if (!eventTime || eventTime === '--:--') return null;
  const buffer = eventType === 'sunrise' ? 15 : 30;
  return addMinutes(eventTime, -(driveMin + buffer));
}
function isWesternCoastBeach(spot) { return spot.type === 'חוף' && spot.lon < 34.75; }
function spotKey(name, lat) { return name + '|' + Math.round(lat * 1000); }

function bearingToHeb(b) {
  if (b >= 337 || b < 23)  return 'צפון';
  if (b < 68)  return 'צפון-מזרח';
  if (b < 113) return 'מזרח';
  if (b < 158) return 'דרום-מזרח';
  if (b < 203) return 'דרום';
  if (b < 248) return 'דרום-מערב';
  if (b < 293) return 'מערב';
  return 'צפון-מערב';
}

// ─── Format decimal score ────────────────
function fmtScore(v) { return v.toFixed(1); }

// ─── Spot Potential (1-5 stars) ──────────
// Based on location traits + next event direction
function calcSpotPotential(spot, bearing) {
  let p = 2.0; // baseline
  const elev = spot.elevation || 0;
  // Elevation
  if (elev > 600) p += 1.2;
  else if (elev > 300) p += 0.8;
  else if (elev > 150) p += 0.4;
  // Azimuth for next event
  const idealAz = getNextEvent().azimuth;
  const diff = Math.abs(bearing - idealAz);
  const norm = diff > 180 ? 360 - diff : diff;
  if (norm <= 25) p += 1.0;
  else if (norm <= 50) p += 0.5;
  // Type
  if (isWesternCoastBeach(spot)) p += 0.6;
  else if (spot.type === 'חוף') p += 0.2;
  if (spot.type === 'נקודת תצפית') p += 0.4;
  if (spot.type === 'מצוק') p += 0.3;

  return Math.max(1, Math.min(5, Math.round(p * 2) / 2)); // round to 0.5
}

// ─── Stars HTML ──────────────────────────
function starsHTML(potential) {
  const full = Math.floor(potential);
  const half = (potential % 1) >= 0.5;
  let html = '';
  for (let i = 0; i < full; i++) html += '★';
  if (half) html += '½';
  return `<span class="spot-potential-stars">${html}</span>`;
}

// ═════════════════════════════════════════
//  SCORING — decimal, float throughout
// ═════════════════════════════════════════
function calcSpotScores(spot, weekData, userLat, userLon) {
  const bearing = calcBearing(userLat, userLon, spot.lat, spot.lon);
  spot._bearing = bearing;
  spot._potential = calcSpotPotential(spot, bearing);

  const nextEvt = getNextEvent();
  const ssIdeal = getSunsetAzimuth();
  const srIdeal = (ssIdeal + 180) % 360;

  const days = (weekData || []).slice(0, 5).map((day, dayIdx) => {
    if (!day) return { ss: 5.0, sr: 5.0, tw: 5.0, combined: 5.0 };

    const clouds     = day._cloudRaw ?? 50;
    const cloudsLow  = day._cloudLowRaw ?? clouds;
    const humidity   = day._humidityRaw ?? 50;
    const vis        = day._visibilityRaw ?? 10;
    const wind       = day._windRaw ?? 10;
    const rain       = day._rainMmRaw ?? 0;
    const dust       = day._dustRaw ?? 0;
    const delta      = day._cloudDelta ?? 0;
    const elev       = spot.elevation || 0;

    // A. Elevation × clouds
    let elevCloud = 0;
    if (elev > 600 && cloudsLow > 40) elevCloud = 0.12;
    else if (elev > 300 && cloudsLow > 50) elevCloud = 0.06;
    const elevHaze = Math.min(0.08, elev / 10000);

    // B. Azimuth
    const ssAz = azimuthBonus(bearing, ssIdeal);
    const srAz = azimuthBonus(bearing, srIdeal);

    // C. Type
    let typeB = 0;
    if (isWesternCoastBeach(spot)) typeB = 0.08;
    else if (spot.type === 'חוף') typeB = 0.02;
    if (spot.type === 'נקודת תצפית') typeB += 0.05;
    if (spot.type === 'מצוק') typeB += 0.03;

    // D. Wind
    let windC = 0;
    if (wind > 20) { windC = -0.03; if (elev > 400) windC = -0.05; if (spot.type === 'חוף') windC = -0.01; }
    else if (wind < 10) windC = 0.02;

    // E. Dust
    let dustE = 0;
    if (dust > 80) { dustE = -0.06; if (elev > 500) dustE = -0.03; }
    else if (dust > 40) dustE = -0.02;
    else if (dust > 15 && vis > 10) { dustE = 0.04; if (isWesternCoastBeach(spot)) dustE = 0.06; }

    // F. Rain clearing
    let rainE = 0;
    if (rain > 2) rainE = -0.08;
    else if (delta < -20 && rain < 0.5) { rainE = 0.06; if (elev > 300) rainE = 0.08; }

    // G. Confidence decay
    const conf = 1 - (dayIdx * 0.08);

    // Build raw 0–1
    const baseSS = (day.ssScore - 1) / 9;
    const baseSR = (day.srScore - 1) / 9;
    const baseTW = (day.twScore - 1) / 9;

    let rawSS = baseSS + ssAz + elevCloud + elevHaze + typeB + windC + dustE + rainE;
    let rawSR = baseSR + srAz + elevCloud + elevHaze + typeB + windC + dustE + rainE;
    let rawTW = baseTW + (ssAz + srAz) * 0.3 + elevCloud * 0.5 + typeB * 0.5;

    rawSS = rawSS * conf + 0.5 * (1 - conf);
    rawSR = rawSR * conf + 0.5 * (1 - conf);
    rawTW = rawTW * conf + 0.5 * (1 - conf);

    // Scale to 1–10, keep decimal
    const ss = Math.max(1, Math.min(10, rawSS * 9 + 1));
    const sr = Math.max(1, Math.min(10, rawSR * 9 + 1));
    const tw = Math.max(1, Math.min(10, rawTW * 9 + 1));
    // Round to 1 decimal
    const ssR = Math.round(ss * 10) / 10;
    const srR = Math.round(sr * 10) / 10;
    const twR = Math.round(tw * 10) / 10;
    const useSunrise = dayIdx === 0 && nextEvt.type === 'sunrise';
    const combined = useSunrise
      ? Math.round((srR * 0.6 + ssR * 0.2 + twR * 0.2) * 10) / 10
      : Math.round((ssR * 0.6 + srR * 0.2 + twR * 0.2) * 10) / 10;

    return { ss: ssR, sr: srR, tw: twR, combined };
  });

  return days.length ? days : [{ ss: 5.0, sr: 5.0, tw: 5.0, combined: 5.0 }];
}

// ─── Best day label ──────────────────────
function bestDayLabel(allScores) {
  if (!allScores || allScores.length < 2) return null;
  const dayNames = ['היום','מחר'];
  const days = ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'];
  let bestIdx = 0, bestVal = allScores[0].combined;
  for (let i = 1; i < allScores.length; i++) {
    if (allScores[i].combined > bestVal) { bestVal = allScores[i].combined; bestIdx = i; }
  }
  if (bestIdx === 0) return null; // today is already best — no need for badge
  let label;
  if (bestIdx < 2) label = dayNames[bestIdx];
  else {
    const d = _weekData?.[bestIdx]?.date;
    label = d ? 'יום ' + days[new Date(d + 'T12:00:00').getDay()] : '';
  }
  return { label, score: bestVal };
}

// ─── Per-spot decision badge (Pulse 3→Spot Finder) ──
// Bridges legacy dayData → decisionEngine format, adds travel time per spot.
function buildSpotDecision(spot, today) {
  if (!today) return '';
  const driveMin = spot._driveMin || 0;
  const sc = spot._allScores?.[0]?.combined ?? today.score;

  // Build weatherData in engine format
  const weatherData = {
    clouds:              (today._cloudRaw ?? 50) / 100,
    cloudHeightCategory: today._cloudHighRaw > 40 ? 'high' : today._cloudLowRaw > 40 ? 'low' : 'mid',
    horizonClearance:    Math.max(0, (100 - (today._cloudLowRaw ?? 50)) / 100),
    dust:                today._dustRaw ?? 0,
    humidity:            today._humidityRaw ?? 50,
    visibility:          today._visibilityRaw ?? 10,
    aqi:                 null,
    solarElevation:      3,
    sunsetTime:          today.sunset ? (() => {
      const [h, m] = today.sunset.split(':').map(Number);
      const d = new Date(today.date + 'T12:00:00');
      d.setHours(h, m, 0, 0);
      return d;
    })() : new Date(),
  };

  let result;
  try {
    result = decide({
      weatherData,
      travelTimeMinutes: driveMin,
      bufferMinutes: 10,
      latitude: _loc?.lat ?? 32,
    });
  } catch {
    return '';
  }

  const d = result.decision; // 'YES' | 'MAYBE' | 'NO'
  const tier = d === 'YES' ? 'go' : d === 'MAYBE' ? 'maybe' : 'no';

  let text;
  if (d === 'YES') {
    text = 'שווה לנסוע';
  } else if (d === 'MAYBE') {
    text = driveMin > 20 ? 'רק אם קרוב' : 'אפשרי';
  } else {
    text = driveMin > 0 ? 'לא שווה' : 'שקיעה חלשה';
  }

  return `<span class="spot-badge spot-decision-${tier}">${text}</span>`;
}

// ═════════════════════════════════════════
//  INIT
// ═════════════════════════════════════════
export async function initSpotsScreen(weekData) {
  if (weekData) _weekData = weekData;
  _loc = loadLocation();
  _favorites = loadFavorites();
  _visited = loadVisited();
  _visibleCount = 15;
  const container = document.getElementById('screen-spots');
  if (!container) return;
  if (_map) { _map.remove(); _map = null; _markers = []; }
  container.innerHTML = buildSpotsShell();
  attachSpotsEvents();
  initLeafletMap();
  if (!_loc) { showToast('לא נמצא מיקום — לחץ GPS', 'error'); return; }
  await loadSpots();
}

// ═════════════════════════════════════════
//  SHELL HTML — no radius slider
// ═════════════════════════════════════════
function buildSpotsShell() {
  return `
  <div class="spot-content">
    <div class="spot-title-row">
      <div class="spot-main-title">Spot Finder</div>
      <div class="spot-main-sub">נקודות תצפית לדמדומים · ${_radiusKm} ק"מ סביבך</div>
    </div>

    <!-- Search bar — 2 rows -->
    <div class="glass spot-search-wrap">
      <div class="spot-search-row1">
        <div class="search-input-wrap" style="flex:1">
          <svg width="14" height="14" fill="none" stroke="var(--cream-faint)" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input id="spots-search-input" class="search-input" type="text" placeholder="${_loc?.city || 'עיר, אזור או סוג (חוף, פסגה...)'}" dir="rtl" />
        </div>
      </div>
      <div class="spot-search-row2">
        <button class="search-filter-btn" id="search-btn" style="flex:1">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          חפש מיקום
        </button>
        <button class="search-filter-btn" id="gps-btn" style="flex:1">
          <svg width="14" height="14" fill="var(--gold-light)" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>
          מיקום נוכחי
        </button>
      </div>
      <div id="recent-searches" class="spot-recent-row" style="display:none"></div>
    </div>

    <!-- Radius pills -->
    <div class="spot-sort-row">
      <span style="font-size:11px;color:var(--cream-faint);margin-left:6px">טווח:</span>
      ${[10, 25].map(r => `
        <button class="sort-pill radius-pill${_radiusKm === r ? ' active' : ''}" data-radius="${r}">${r} ק"מ</button>
      `).join('')}
    </div>

    <!-- Type filter pills -->
    <div class="spot-filter-row">
      ${[
        { val: 'all',             label: 'הכל' },
        { val: 'favorites',      label: '★ מועדפים' },
        { val: 'visited',        label: '✓ ביקרתי' },
        { val: 'פסגה',            label: 'פסגות' },
        { val: 'נקודת תצפית',     label: 'תצפית' },
        { val: 'חוף',             label: 'חופים' },
        { val: 'מצוק',            label: 'מצוקים' },
      ].map(f => `
        <button class="spot-filter-pill${_filterType === f.val ? ' active' : ''}" data-filter="${f.val}">
          ${f.val !== 'all' && f.val !== 'favorites' && f.val !== 'visited' ? `<span class="spot-filter-icon">${TYPE_ICONS[f.val]}</span>` : ''}${f.label}
        </button>
      `).join('')}
    </div>

    <!-- Map -->
    <div class="glass spot-map-wrap" id="spot-map-wrap">
      <div id="spots-map" style="height:280px;width:100%;border-radius:18px"></div>
      <button class="spot-map-expand-btn" id="map-expand-btn" title="הגדל מפה">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
      </button>
    </div>

    <!-- Sort pills -->
    <div class="spot-sort-row">
      <button class="sort-pill ${_sortMode==='smart'?'active':''}" id="sort-smart">
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        מומלץ
      </button>
      <button class="sort-pill ${_sortMode==='score'?'active':''}" id="sort-score">
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        ציון
      </button>
      <button class="sort-pill ${_sortMode==='dist'?'active':''}" id="sort-dist">
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>
        קרוב
      </button>
    </div>

    <!-- Best spot hero -->
    <div id="best-spot-hero"></div>

    <!-- Spots count -->
    <div id="spots-count" class="spots-count-label"></div>

    <!-- Spots list -->
    <div id="spots-list">
      <div style="text-align:center;padding:24px;color:var(--cream-faint)">טוען נקודות...</div>
    </div>
  </div>
  `;
}

// ═════════════════════════════════════════
//  MAP
// ═════════════════════════════════════════
async function initLeafletMap() {
  try {
    await loadLeaflet();
  } catch (e) {
    console.warn('[map] Leaflet load failed, retrying in 2s:', e.message);
    setTimeout(initLeafletMap, 2000);
    return;
  }
  const el = document.getElementById('spots-map');
  if (!el) return;
  const lat = _loc?.lat || 32.0853, lon = _loc?.lon || 34.7818;
  _map = L.map('spots-map', { zoomControl: false }).setView([lat, lon], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OSM',
    maxZoom: 19
  }).addTo(_map);
  const userIcon = L.divIcon({
    html: '<div style="width:14px;height:14px;background:#F0B84A;border:2px solid #fff;border-radius:50%;box-shadow:0 0 10px rgba(240,184,74,0.9);animation:pulse 1.5s ease-in-out infinite"></div>',
    iconSize: [14, 14], iconAnchor: [7, 7], className: ''
  });
  L.marker([lat, lon], { icon: userIcon }).addTo(_map).bindPopup('המיקום שלך');
  drawEventArc();
}

function drawEventArc() {
  if (!_map || !_loc) return;
  _sunsetLines.forEach(l => l.remove());
  _sunsetLines = [];
  const nextEvt = getNextEvent();
  const az = nextEvt.azimuth;
  const color = nextEvt.type === 'sunset' ? '#F0B84A' : '#E87830';
  const dist = 30;
  const main = destPoint(_loc.lat, _loc.lon, az, dist);
  const left = destPoint(_loc.lat, _loc.lon, az - 30, dist);
  const right = destPoint(_loc.lat, _loc.lon, az + 30, dist);
  const origin = [_loc.lat, _loc.lon];
  _sunsetLines.push(
    L.polyline([origin, [main.lat, main.lon]], { color, weight: 2, dashArray: '8,6', opacity: 0.7 }).addTo(_map),
    L.polyline([origin, [left.lat, left.lon]], { color, weight: 1.2, dashArray: '4,8', opacity: 0.25 }).addTo(_map),
    L.polyline([origin, [right.lat, right.lon]], { color, weight: 1.2, dashArray: '4,8', opacity: 0.25 }).addTo(_map)
  );
}

function updateMapMarkers(spots) {
  if (!_map) return;
  _markers.forEach(m => m.remove());
  _markers = [];
  _markerSpotMap = {};
  const nextEvt = getNextEvent();
  spots.slice(0, 30).forEach((s, idx) => {
    if (!s.lat || !s.lon) return;
    const sc = s._allScores?.[0]?.combined || 5;
    const eventScore = nextEvt.type === 'sunrise'
      ? (s._allScores?.[0]?.sr || 5)
      : (s._allScores?.[0]?.ss || 5);
    const color = scoreToColorContinuous(sc);
    const isFav = isFavorite(s.name, s.lat, s.lon);
    const isVis = isVisited(s.name, s.lat, s.lon);
    const size = isFav ? 18 : 14;
    const border = isVis ? '2px solid rgba(125,212,168,0.8)' : '2px solid rgba(255,255,255,0.6)';
    const num = idx + 1;
    const spotIcon = L.divIcon({
      html: `<div class="spot-marker-num" style="width:${size}px;height:${size}px;background:${color};border:${border};border-radius:50%;box-shadow:0 0 8px ${color}88;display:flex;align-items:center;justify-content:center;font-size:${isFav ? 9 : 8}px;font-weight:800;color:#fff;font-family:Rubik,sans-serif;line-height:1">${num}</div>`,
      iconSize: [size, size], iconAnchor: [size/2, size/2], className: ''
    });
    const eventLabel = nextEvt.type === 'sunrise' ? 'זריחה' : 'שקיעה';
    const popupContent = `<div dir="rtl" style="font-family:Rubik,sans-serif;font-size:13px"><b>${esc(s.name)}</b><br>${esc(s.type)} · ${fmtScore(sc)} · ${s.dist} ק"מ<br><span style="color:${scoreToColorContinuous(eventScore)}">${eventLabel}: ${fmtScore(eventScore)}</span><br><a href="#" class="spot-popup-link" data-spot-idx="${idx}" style="color:#F0B84A;font-size:11px;text-decoration:underline">הצג פרטים ↓</a></div>`;
    const m = L.marker([s.lat, s.lon], { icon: spotIcon })
      .addTo(_map)
      .bindPopup(popupContent);
    m._spotIdx = idx;
    _markers.push(m);
    _markerSpotMap[spotKey(s.name, s.lat)] = idx;
  });

  // Register popup click handler once
  if (!_popupHandlerRegistered) {
    _popupHandlerRegistered = true;
    _map.on('popupopen', (e) => {
      const link = e.popup.getElement()?.querySelector('.spot-popup-link');
      if (link) {
        link.addEventListener('click', (ev) => {
          ev.preventDefault();
          scrollToSpotCard(parseInt(link.dataset.spotIdx));
        });
      }
    });
  }
}

// ─── Map ↔ List sync ────────────────────
function scrollToSpotCard(idx) {
  // If card not yet rendered (lazy load), expand visible count
  if (idx >= _visibleCount) {
    _visibleCount = idx + 5;
    renderSpotsList();
  }
  requestAnimationFrame(() => {
    const el = document.getElementById(`spot-expand-${idx}`);
    const card = el?.closest('.spot-card');
    if (!card) return;
    if (el && !el.classList.contains('open')) window.toggleSpot(idx);
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('spot-card-highlight');
    setTimeout(() => card.classList.remove('spot-card-highlight'), 2500);
  });
}

// ═════════════════════════════════════════
//  LOAD
// ═════════════════════════════════════════
async function loadSpots() {
  if (!_loc) {
    const el = document.getElementById('spots-list');
    if (el) el.innerHTML = buildEmptyState('לא נמצא מיקום', 'לחץ "מיקום נוכחי" לאיתור');
    return;
  }

  // Clear stale results immediately
  const heroEl = document.getElementById('best-spot-hero');
  if (heroEl) heroEl.innerHTML = '';
  const listEl = document.getElementById('spots-list');
  if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--cream-faint)">טוען נקודות...</div>';
  const countEl = document.getElementById('spots-count');
  if (countEl) countEl.textContent = '';

  try {
    _spots = await fetchSpots(_loc.lat, _loc.lon, _radiusKm);
    _spots.forEach(s => {
      s._allScores = calcSpotScores(s, _weekData, _loc.lat, _loc.lon);
      s._driveMin = estimateDriveMin(s.dist);
      // Topology warning: inland + low/unknown elevation = potential western horizon obstruction
      const inland = s.lon > 34.92;
      const lowElev = s.elevation !== null && s.elevation < 60;
      const unknownElev = s.elevation === null && s.lon > 35.0;
      if (inland && s.type !== 'חוף' && (lowElev || unknownElev)) {
        s._horizonWarning = lowElev
          ? 'גובה נמוך — בדוק ראות מערבית'
          : 'גובה לא ידוע — בדוק ראות מערבית';
      }
    });
    renderBestSpotHero();
    renderSpotsList();
    updateMapMarkers(getFilteredSpots());
    drawEventArc();
    checkGeofenceAlert(_spots, _weekData?.[0]?.score ?? 0);
  } catch (e) {
    console.error('[spots] loadSpots failed:', e);
    _spots = [];
    if (heroEl) heroEl.innerHTML = '';
    const el = document.getElementById('spots-list');
    if (el) el.innerHTML = buildEmptyState('שגיאה בטעינת נקודות', 'בדוק חיבור ונסה שוב');
  }
}

// ═════════════════════════════════════════
//  FILTER + SORT
// ═════════════════════════════════════════
function getFilteredSpots() {
  let filtered = [..._spots];
  if (_filterType === 'favorites') {
    filtered = filtered.filter(s => isFavorite(s.name, s.lat, s.lon));
  } else if (_filterType === 'visited') {
    filtered = filtered.filter(s => isVisited(s.name, s.lat, s.lon));
  } else if (_filterType !== 'all') {
    filtered = filtered.filter(s => s.type === _filterType);
  }

  if (_sortMode === 'smart') {
    // Blended: score 50%, potential 15%, event-facing 15%, distance 20%
    const eventAz = getNextEvent().azimuth;
    filtered.sort((a, b) => {
      const aScore = a._allScores?.[0]?.combined || 0;
      const bScore = b._allScores?.[0]?.combined || 0;
      const aPot = (a._potential || 2) * 2;
      const bPot = (b._potential || 2) * 2;
      const aDiff = Math.abs(a._bearing - eventAz); const aNorm = aDiff > 180 ? 360 - aDiff : aDiff;
      const bDiff = Math.abs(b._bearing - eventAz); const bNorm = bDiff > 180 ? 360 - bDiff : bDiff;
      const aAz = aNorm <= 30 ? 10 : aNorm <= 60 ? 5 : 0;
      const bAz = bNorm <= 30 ? 10 : bNorm <= 60 ? 5 : 0;
      const aVal = aScore * 0.50 + aPot * 0.15 + aAz * 0.15 - (a.dist / 50) * 2;
      const bVal = bScore * 0.50 + bPot * 0.15 + bAz * 0.15 - (b.dist / 50) * 2;
      return bVal - aVal;
    });
  } else if (_sortMode === 'score') {
    filtered.sort((a, b) => (b._allScores?.[0]?.combined || 0) - (a._allScores?.[0]?.combined || 0));
  } else {
    filtered.sort((a, b) => a.dist - b.dist);
  }

  // Favorites float to top
  filtered.sort((a, b) => {
    const af = isFavorite(a.name, a.lat, a.lon) ? 0 : 1;
    const bf = isFavorite(b.name, b.lat, b.lon) ? 0 : 1;
    return af - bf;
  });

  return filtered;
}

// ═════════════════════════════════════════
//  HERO
// ═════════════════════════════════════════
function renderBestSpotHero() {
  const heroEl = document.getElementById('best-spot-hero');
  if (!heroEl || !_spots.length) { if (heroEl) heroEl.innerHTML = ''; return; }
  const best = [..._spots].sort((a, b) => (b._allScores?.[0]?.combined || 0) - (a._allScores?.[0]?.combined || 0))[0];
  if (!best) return;
  const sc = best._allScores?.[0] || { combined: 5.0 };
  if (sc.combined < 5) { heroEl.innerHTML = ''; return; }
  const color = scoreToColorContinuous(sc.combined);
  const metal = scoreToMetal(sc.combined);
  const today = _weekData?.[0];
  const nextEvt = getNextEvent();
  const heroEventTime = today ? (nextEvt.type === 'sunrise' ? today.sunrise : today.sunset) : null;
  const departure = heroEventTime ? calcDepartureTime(best._driveMin, heroEventTime, nextEvt.type) : null;
  const heroTitle = nextEvt.type === 'sunrise' ? 'הספוט הכי טוב לזריחה' : 'הספוט הכי טוב לשקיעה';

  heroEl.innerHTML = `
  <div class="glass-strong spot-hero" style="--spot-color:${color}">
    <div class="spot-hero-strip" style="background:${metal.gradient}"></div>
    <div class="spot-hero-inner">
      <div class="spot-hero-top">
        <div style="font-size:10px;color:var(--gold);font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px">${heroTitle}</div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="score-badge" style="background:${metal.gradient};border:1px solid ${color}55;color:${metal.text};position:relative;overflow:hidden;width:48px;height:48px;font-size:16px">
            <div style="position:absolute;inset:0;background:radial-gradient(ellipse 80% 100% at 50% 0%,rgba(255,255,255,0.25) 0%,rgba(255,255,255,0) 100%)"></div>
            <span style="position:relative;z-index:1">${fmtScore(sc.combined)}</span>
          </div>
          <div>
            <div style="font-size:16px;font-weight:800;color:var(--cream);line-height:1.2">${esc(best.name)}</div>
            <div style="font-size:11px;color:var(--cream-faint)">${esc(best.type)} · ${best.dist} ק"מ · ${starsHTML(best._potential)}</div>
          </div>
        </div>
      </div>
      <div class="spot-hero-bottom">
        ${departure ? `<div class="spot-hero-depart">
          <svg width="14" height="14" fill="none" stroke="var(--gold-light)" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>צא עד <b>${departure}</b> ל${nextEvt.type === 'sunrise' ? 'זריחה' : 'שעת הזהב'}</span>
        </div>` : ''}
        <a href="https://www.waze.com/ul?ll=${best.lat},${best.lon}&navigate=yes&zoom=17"
           target="_blank" rel="noopener" class="spot-hero-nav-btn">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
          נווט עכשיו
        </a>
      </div>
    </div>
  </div>`;
}

// ═════════════════════════════════════════
//  EMPTY STATE
// ═════════════════════════════════════════
function buildEmptyState(title, sub) {
  return `
  <div class="spot-empty-state">
    <div class="spot-empty-icon">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--cream-faint)" stroke-width="1.5" stroke-linecap="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
      </svg>
    </div>
    <div class="spot-empty-title">${title}</div>
    <div class="spot-empty-sub">${sub}</div>
  </div>`;
}

// ═════════════════════════════════════════
//  5-DAY STRIP
// ═════════════════════════════════════════
function renderMiniWeekStrip(allScores) {
  if (!allScores || allScores.length < 2) return '';
  const dayLabels = ['היום','מחר'];
  const days = ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'];
  return `
  <div class="spot-week-strip">
    <div class="spot-conditions-label">תחזית 5 ימים</div>
    <div class="spot-week-bar-row">
      ${allScores.slice(0, 5).map((sc, i) => {
        const color = scoreToColorContinuous(sc.combined);
        const metal = scoreToMetal(sc.combined);
        let label = i < 2 ? dayLabels[i] : '';
        if (i >= 2) { const d = _weekData?.[i]?.date; if (d) label = days[new Date(d + 'T12:00:00').getDay()]; }
        return `
        <div class="spot-week-bar-item">
          <div class="spot-week-bar-track">
            <div class="spot-week-bar-fill" style="height:${sc.combined * 10}%;background:${metal.gradient}">
              <span style="color:${metal.text}">${fmtScore(sc.combined)}</span>
            </div>
          </div>
          <div class="spot-week-bar-label">${label}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// ═════════════════════════════════════════
//  GEOFENCING ALERT (3b)
//  Push notification when near a high-quality spot on a good day
// ═════════════════════════════════════════
function checkGeofenceAlert(spots, todayScore) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (todayScore < 6.5) return; // only alert on genuinely good days

  const GEOFENCE_KM = 30;
  const MIN_SPOT_SCORE = 6.8;

  // Find closest high-scoring spot within range
  const candidate = spots
    .filter(s => s.dist <= GEOFENCE_KM && (s._allScores?.[0]?.combined || 0) >= MIN_SPOT_SCORE)
    .sort((a, b) => (b._allScores?.[0]?.combined || 0) - (a._allScores?.[0]?.combined || 0))[0];

  if (!candidate) return;

  // Alert at most once per calendar day
  const alertKey = 'twl_geo_' + new Date().toDateString();
  try { if (localStorage.getItem(alertKey)) return; } catch {}

  const spotScore  = (candidate._allScores?.[0]?.combined || 0).toFixed(1);
  const distLabel  = candidate.dist < 1 ? 'פחות מ-1 ק"מ' : `${candidate.dist} ק"מ`;

  const nextEvt = getNextEvent();
  const eventLabel = nextEvt.type === 'sunrise' ? 'זריחה מעולה מחר בבוקר 🌅' : 'שקיעה מעולה היום 🌅';

  navigator.serviceWorker.ready.then(reg => {
    reg.showNotification(`TWILIGHT · ${eventLabel}`, {
      body:    `${candidate.name} — ציון ${spotScore}/10 · ${distLabel} ממך`,
      icon:    './images/sunset.png',
      badge:   './images/icon-192.png',
      dir:     'rtl',
      lang:    'he',
      tag:     'geofence-alert',      // replaces previous if still visible
      renotify: false,
      data:    { url: './?screen=spots' }
    });
    try { localStorage.setItem(alertKey, '1'); } catch {}
  }).catch(() => {});
}

// ═════════════════════════════════════════
//  RENDER LIST
// ═════════════════════════════════════════
function renderSpotsList() {
  const listEl = document.getElementById('spots-list');
  if (!listEl) return;
  const sorted = getFilteredSpots();
  const countEl = document.getElementById('spots-count');

  if (!sorted.length) {
    if (countEl) countEl.textContent = '';
    listEl.innerHTML = buildEmptyState(
      _filterType === 'favorites' ? 'אין מועדפים עדיין' :
      _filterType === 'visited' ? 'עוד לא ביקרת בנקודות' :
      `לא נמצאו נקודות ב-${_radiusKm} ק"מ`,
      _filterType === 'favorites' ? 'לחץ ★ בכרטיס ספוט' :
      _filterType === 'visited' ? 'לחץ ✓ אחרי ביקור בספוט' :
      _filterType !== 'all' ? 'נסה סינון אחר או חפש מיקום' : 'נסה לחפש מיקום אחר'
    );
    return;
  }

  if (countEl) countEl.textContent = `${sorted.length} נקודות נמצאו`;
  const today = _weekData?.[0];
  const nextEvt = getNextEvent();
  const eventTime = today ? (nextEvt.type === 'sunrise' ? today.sunrise : today.sunset) : null;

  const visible = sorted.slice(0, _visibleCount);
  const remaining = sorted.length - visible.length;

  listEl.innerHTML = visible.map((s, i) => {
    const scores = s._allScores || [{ ss: 5.0, sr: 5.0, tw: 5.0, combined: 5.0 }];
    const sc = scores[0];
    const color = scoreToColorContinuous(sc.combined);
    const metal = scoreToMetal(sc.combined);
    const bearing = s._bearing || 0;
    const dirLabel = bearingToHeb(bearing);
    const driveMin = s._driveMin || 0;
    const fav = isFavorite(s.name, s.lat, s.lon);
    const vis = isVisited(s.name, s.lat, s.lon);
    const departure = eventTime ? calcDepartureTime(driveMin, eventTime, nextEvt.type) : null;
    const best = bestDayLabel(scores);

    const westOK = isWestFacing(bearing), eastOK = isEastFacing(bearing);
    let badge = '';
    if (westOK && eastOK) {
      badge = `<span class="spot-badge spot-badge-both">שקיעה + זריחה</span>`;
    } else if (westOK && nextEvt.type === 'sunset') {
      badge = `<span class="spot-badge spot-badge-sunset spot-badge-now">${logoImg('sunset', 12)} מומלץ עכשיו</span>`;
    } else if (eastOK && nextEvt.type === 'sunrise') {
      badge = `<span class="spot-badge spot-badge-sunrise spot-badge-now">${logoImg('sunrise', 12)} מומלץ עכשיו</span>`;
    } else if (westOK) {
      badge = `<span class="spot-badge spot-badge-sunset">${logoImg('sunset', 12)} מומלץ לשקיעה</span>`;
    } else if (eastOK) {
      badge = `<span class="spot-badge spot-badge-sunrise">${logoImg('sunrise', 12)} מומלץ לזריחה</span>`;
    }
    const horizonBadge = s._horizonWarning
      ? `<span class="spot-badge spot-badge-warn" title="${esc(s._horizonWarning)}">⚠ ${esc(s._horizonWarning)}</span>`
      : '';

    return `
    <div class="glass spot-card spot-card-anim" style="--spot-color:${color};--anim-delay:${i * 60}ms">
      <div class="spot-color-strip" style="background:${metal.gradient}"></div>
      <div class="spot-card-inner">
        <div class="spot-header" onclick="toggleSpot(${i})">
          <div class="spot-header-right">
            <div class="score-badge" style="background:${metal.gradient};border:1px solid ${color}55;color:${metal.text};position:relative;overflow:hidden">
              <div style="position:absolute;inset:0;background:radial-gradient(ellipse 80% 100% at 50% 0%,rgba(255,255,255,0.25) 0%,rgba(255,255,255,0) 100%)"></div>
              <span style="position:relative;z-index:1;font-size:14px">${fmtScore(sc.combined)}</span>
            </div>
            <div class="spot-header-info">
              <div class="spot-name">
                <span class="spot-type-icon" style="color:${color}">${getTypeIcon(s.type)}</span>
                ${esc(s.name)}
              </div>
              <div class="spot-meta">
                ${s.type} · ${starsHTML(s._potential)} · ${dirLabel} ${compassArrow(bearing)}
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                ${buildSpotDecision(s, today)}
                ${badge}
                ${horizonBadge}
                ${vis ? '<span class="spot-badge spot-badge-visited">✓ ביקרתי</span>' : ''}
                ${best ? `<span class="spot-badge spot-badge-bestday">הכי טוב ${best.label} (${fmtScore(best.score)})</span>` : ''}
              </div>
            </div>
          </div>
          <div class="spot-header-left">
            <button class="spot-fav-btn ${fav ? 'active' : ''}" onclick="event.stopPropagation();window._toggleFav(${i})" title="${fav ? 'הסר ממועדפים' : 'הוסף למועדפים'}">
              ${fav ? '★' : '☆'}
            </button>
            <div class="spot-dist-col">
              <span class="spot-dist-val">${s.dist}</span>
              <span class="spot-dist-unit">ק"מ</span>
            </div>
            <div class="spot-drive-time">~${driveMin} דק׳</div>
            <div class="spot-chevron" id="spot-chevron-${i}">
              <svg width="14" height="14" fill="none" stroke="var(--cream-faint)" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
        </div>

        <div class="daily-expand" id="spot-expand-${i}">
          <div class="spot-expand-inner">
            <div class="spot-scores-row">
              <div class="spot-score-cell">
                ${logoImg('sunrise', 18)}
                <div class="spot-score-num" style="color:${scoreToColorContinuous(sc.sr)}">${fmtScore(sc.sr)}<span>/10</span></div>
                <div class="spot-score-lbl">זריחה</div>
              </div>
              <div class="spot-score-cell spot-score-cell-main">
                ${logoImg('sunset', 18)}
                <div class="spot-score-num" style="color:${scoreToColorContinuous(sc.ss)}">${fmtScore(sc.ss)}<span>/10</span></div>
                <div class="spot-score-lbl">שקיעה</div>
              </div>
              <div class="spot-score-cell">
                ${logoImg('twilight', 18)}
                <div class="spot-score-num" style="color:${scoreToColorContinuous(sc.tw)}">${fmtScore(sc.tw)}<span>/10</span></div>
                <div class="spot-score-lbl">דמדומים</div>
              </div>
            </div>

            <div class="fx-grid spot-info-grid">
              <div class="fx-cell"><div class="fx-cell-lbl">פוטנציאל</div><div class="fx-cell-val">${starsHTML(s._potential)}</div><div class="fx-cell-sub">קבוע</div></div>
              <div class="fx-cell"><div class="fx-cell-lbl">כיוון</div><div class="fx-cell-val">${dirLabel}</div><div class="fx-cell-sub">${Math.round(bearing)}°</div></div>
              <div class="fx-cell"><div class="fx-cell-lbl">גובה</div><div class="fx-cell-val">${s.elevation || '—'}</div><div class="fx-cell-sub">${s.elevation ? 'מטר' : ''}</div></div>
            </div>

            ${s._horizonWarning ? `
            <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(255,160,30,0.08);border:1px solid rgba(255,160,30,0.25);border-radius:10px;margin-bottom:8px;font-size:11px;color:#E8A040;direction:rtl">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              ${esc(s._horizonWarning)} — יש לאמת ראות מערבית בשטח לפני נסיעה
            </div>` : ''}

            ${departure ? `
            <div class="spot-depart-row">
              <svg width="14" height="14" fill="none" stroke="var(--gold-light)" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>צא עד <b style="color:var(--gold-light)">${departure}</b> כדי להגיע ל${nextEvt.type === 'sunrise' ? 'זריחה' : 'שעת הזהב'}</span>
            </div>` : ''}

            ${today ? `
            <div class="spot-conditions-label">תנאים היום</div>
            <div class="fx-grid spot-info-grid">
              <div class="fx-cell"><div class="fx-cell-lbl">עננות</div><div class="fx-cell-val">${today.cloud}</div></div>
              <div class="fx-cell"><div class="fx-cell-lbl">נראות</div><div class="fx-cell-val">${today.visibility}</div><div class="fx-cell-sub">ק"מ</div></div>
              <div class="fx-cell"><div class="fx-cell-lbl">רוח</div><div class="fx-cell-val">${today.wind}</div><div class="fx-cell-sub">${today.windDir}</div></div>
            </div>
            ` : ''}

            ${renderMiniWeekStrip(scores)}

            <div class="spot-nav-row">
              <a href="https://www.waze.com/ul?ll=${s.lat},${s.lon}&navigate=yes&zoom=17" target="_blank" rel="noopener" class="spot-nav-btn">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                Waze
              </a>
              <a href="https://maps.google.com/?q=${s.lat},${s.lon}" target="_blank" rel="noopener" class="spot-nav-btn">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="10" r="3"/><path d="M12 2C7.6 2 4 5.6 4 10c0 5.3 7 12 8 12s8-6.7 8-12c0-4.4-3.6-8-8-8z"/></svg>
                מפות
              </a>
              <button class="spot-nav-btn" onclick="event.stopPropagation();window._shareSpot(${i})">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                שתף
              </button>
              <a href="https://www.google.com/search?q=${encodeURIComponent(s.name + ' שקיעה')}&tbm=isch" target="_blank" rel="noopener" class="spot-nav-btn">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                תמונות
              </a>
              <button class="spot-nav-btn ${vis ? 'spot-visited-active' : ''}" onclick="event.stopPropagation();window._toggleVisited(${i})">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                ${vis ? 'ביקרתי ✓' : 'ביקרתי?'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    `;
  }).join('');

  if (remaining > 0) {
    listEl.innerHTML += `
      <button class="search-filter-btn spot-load-more" id="spots-load-more" style="width:100%;margin-top:8px">
        הצג עוד ${remaining} נקודות
      </button>`;
    document.getElementById('spots-load-more')?.addEventListener('click', () => {
      haptic('light');
      _visibleCount += 15;
      renderSpotsList();
    });
  }
}

// ═════════════════════════════════════════
//  SEARCH
// ═════════════════════════════════════════
const TYPE_KEYWORDS = {
  'חוף':'חוף','חופים':'חוף','beach':'חוף',
  'פסגה':'פסגה','פסגות':'פסגה','הר':'פסגה','הרים':'פסגה','peak':'פסגה',
  'תצפית':'נקודת תצפית','מצפה':'נקודת תצפית','viewpoint':'נקודת תצפית',
  'מצוק':'מצוק','מצוקים':'מצוק','cliff':'מצוק',
};
function extractTypeFromQuery(q) {
  const lower = q.trim().toLowerCase();
  for (const [kw, type] of Object.entries(TYPE_KEYWORDS)) {
    if (lower.includes(kw)) return { type, cleaned: lower.replace(kw, '').trim() };
  }
  return { type: null, cleaned: q.trim() };
}

// ─── Recent searches ─────────────────────
const RECENT_KEY = 'twl_recent_searches';
function loadRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } }
function saveRecent(q) {
  let arr = loadRecent().filter(r => r !== q);
  arr.unshift(q);
  if (arr.length > 5) arr = arr.slice(0, 5);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(arr)); } catch {}
}
function renderRecentSearches() {
  const el = document.getElementById('recent-searches');
  if (!el) return;
  const arr = loadRecent();
  if (!arr.length) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = arr.map(q => `<button class="spot-recent-chip">${esc(q)}</button>`).join('');
  el.querySelectorAll('.spot-recent-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById('spots-search-input');
      if (input) input.value = btn.textContent;
      doSearch();
    });
  });
}

async function doSearch() {
  const input = document.getElementById('spots-search-input');
  const q = input?.value.trim();
  if (!q) return;
  const { type: detectedType, cleaned } = extractTypeFromQuery(q);

  if (detectedType && !cleaned) {
    _filterType = detectedType;
    document.querySelectorAll('.spot-filter-pill').forEach(b => b.classList.toggle('active', b.dataset.filter === detectedType));
    if (_spots.length) { renderSpotsList(); updateMapMarkers(getFilteredSpots()); showToast(`מסנן: ${detectedType}`, 'info'); return; }
    if (_loc) { showToast(`מחפש ${detectedType}...`, 'info'); await loadSpots(); return; }
  }

  const locationQuery = cleaned || q;
  showToast('מחפש מיקום...', 'info');
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let res;
    try {
      res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationQuery)}&format=json&limit=1&countrycodes=il&accept-language=he`, {
        headers: { 'User-Agent': 'TWILIGHT-PWA/1.0' },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
    const data = await res.json();
    if (data[0]) {
      const lat = parseFloat(data[0].lat), lon = parseFloat(data[0].lon);
      const name = data[0].display_name?.split(',')[0] || locationQuery;
      _loc = { lat, lon, city: name };
      if (detectedType) {
        _filterType = detectedType;
        document.querySelectorAll('.spot-filter-pill').forEach(b => b.classList.toggle('active', b.dataset.filter === detectedType));
      }
      if (_map) {
        _map.setView([lat, lon], 11);
        L.marker([lat, lon], { icon: L.divIcon({ html: '<div style="width:14px;height:14px;background:#F0B84A;border:2px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(240,184,74,0.8)"></div>', iconSize: [14,14], iconAnchor: [7,7], className: '' }) }).addTo(_map).bindPopup(esc(name));
      }
      saveRecent(q);
      showToast(`מחפש ב: ${name}`, 'info');
      await loadSpots();
      renderRecentSearches();
    } else { showToast('לא נמצא מיקום', 'error'); }
  } catch { showToast('שגיאה בחיפוש', 'error'); }
}

// ═════════════════════════════════════════
//  EVENTS
// ═════════════════════════════════════════
function attachSpotsEvents() {
  document.getElementById('gps-btn')?.addEventListener('click', async () => {
    haptic('medium');
    showToast('מאתר מיקום...', 'info');
    try {
      const pos = await getGPS(); _loc = pos;
      const city = await fetchCityName(pos.lat, pos.lon);
      saveLocation(pos.lat, pos.lon, city);
      showToast(`מיקום עודכן: ${city}`, 'success');
      if (_map) _map.setView([pos.lat, pos.lon], 11);
      await loadSpots();
    } catch { showToast('לא ניתן לאתר מיקום', 'error'); }
  });

  document.getElementById('search-btn')?.addEventListener('click', doSearch);
  document.getElementById('spots-search-input')?.addEventListener('keydown', async (e) => { if (e.key === 'Enter') await doSearch(); });
  document.getElementById('spots-search-input')?.addEventListener('focus', renderRecentSearches);
  renderRecentSearches();

  document.getElementById('map-expand-btn')?.addEventListener('click', () => {
    haptic('light');
    const wrap = document.getElementById('spot-map-wrap');
    const btn = document.getElementById('map-expand-btn');
    if (!wrap) return;
    const expanding = !wrap.classList.contains('map-fullscreen');
    wrap.classList.toggle('map-fullscreen');
    if (btn) btn.innerHTML = expanding
      ? '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'
      : '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
    setTimeout(() => { if (_map) _map.invalidateSize(); }, 320);
  });

  document.getElementById('sort-smart')?.addEventListener('click', () => { haptic('light'); setSortMode('smart'); });
  document.getElementById('sort-score')?.addEventListener('click', () => { haptic('light'); setSortMode('score'); });
  document.getElementById('sort-dist')?.addEventListener('click', () => { haptic('light'); setSortMode('dist'); });

  document.querySelectorAll('.radius-pill').forEach(btn => {
    btn.addEventListener('click', async () => {
      haptic('light');
      const r = parseInt(btn.dataset.radius);
      if (r === _radiusKm) return;
      _radiusKm = r;
      document.querySelectorAll('.radius-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const sub = document.querySelector('.spot-main-sub');
      if (sub) sub.textContent = `נקודות תצפית לדמדומים · ${_radiusKm} ק"מ סביבך`;
      await loadSpots();
    });
  });

  document.querySelectorAll('.spot-filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      haptic('light');
      _filterType = btn.dataset.filter;
      _visibleCount = 15;
      document.querySelectorAll('.spot-filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderSpotsList();
      updateMapMarkers(getFilteredSpots());
    });
  });

  // Drawer overlay close — removed
}

function setSortMode(mode) {
  _sortMode = mode;
  _visibleCount = 15;
  document.querySelectorAll('.sort-pill:not(.radius-pill)').forEach(b => b.classList.remove('active'));
  document.getElementById(`sort-${mode}`)?.classList.add('active');
  renderSpotsList();
}

// ═════════════════════════════════════════
//  GLOBALS
// ═════════════════════════════════════════
window.toggleSpot = function(i) {
  const el = document.getElementById(`spot-expand-${i}`);
  const ch = document.getElementById(`spot-chevron-${i}`);
  if (!el) return;
  const isOpen = el.classList.toggle('open');
  if (ch) ch.style.transform = isOpen ? 'rotate(180deg)' : '';
  // Pan map to marker when opening
  if (isOpen && _map && i < _markers.length) {
    const m = _markers[i];
    _map.panTo(m.getLatLng(), { animate: true, duration: 0.5 });
    m.openPopup();
    const markerEl = m.getElement();
    if (markerEl) {
      markerEl.classList.add('spot-marker-pulse');
      setTimeout(() => markerEl.classList.remove('spot-marker-pulse'), 800);
    }
  }
};
window._toggleFav = function(i) {
  const sorted = getFilteredSpots();
  const s = sorted[i];
  if (!s) return;
  toggleFavorite(s.name, s.lat, s.lon);
  renderSpotsList();
  updateMapMarkers(getFilteredSpots());
};
window._toggleVisited = function(i) {
  const sorted = getFilteredSpots();
  const s = sorted[i];
  if (!s) return;
  toggleVisited(s.name, s.lat, s.lon);
  haptic('light');
  renderSpotsList();
  updateMapMarkers(getFilteredSpots());
};
window._shareSpot = function(i) {
  const sorted = getFilteredSpots();
  const s = sorted[i];
  if (!s || !navigator.share) return;
  const sc = s._allScores?.[0]?.combined ?? 5;
  navigator.share({
    title: s.name,
    text: `${s.name}: ${fmtScore(sc)}/10`,
    url: `https://maps.google.com/?q=${s.lat},${s.lon}`
  }).catch(() => {});
};

// ✓ spots-screen.js v5 — complete
