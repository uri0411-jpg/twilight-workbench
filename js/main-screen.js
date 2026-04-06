// ═══════════════════════════════════════════
//  TWILIGHT — main-screen.js v2
//  Cinematic: dynamic glow, progress bars, haptic
// ═══════════════════════════════════════════

import { scoreToColor, scoreToColorContinuous, scoreToMetal, scoreToLabel, shortDate, buildGaugeArc, goldenHourRange, getSmartRecommendation, trendArrow, addMinutes } from './utils.js';
import { logoImg, updateDynamicGradient } from './ui.js';
import { recordUserRating, hasRatedToday } from './calibration.js';
import { haptic } from './nav.js';
import { initDebugPanel } from './debugPanel.js';
import { watchSunsetBearing } from './location.js';

let _weekData = [];
let _city = '';
let _loc   = null;
let _stopCompass = null; // cleanup for DeviceOrientation listener
let _countdownInterval = null;
let _compareIdx = -1; // index of first day selected for comparison

/**
 * Initialize and render the main screen
 */
export async function initMainScreen(loc, city, weekData) {
  _weekData = weekData;
  _city     = city;
  _loc      = loc;

  // Clear any previous countdown and compass
  if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }
  if (_stopCompass)       { _stopCompass(); _stopCompass = null; }

  const container = document.getElementById('screen-main');
  if (!container) return;

  container.innerHTML = buildMainHTML(loc, city, weekData);
  attachMainEvents();
  startCountdown(weekData[0]);

  const today = weekData[0];
  if (today) {
    // Pulse 3: dynamic background gradient
    updateDynamicGradient(today.score, today.turbidity ?? 0.3, today.palette?.style ?? '');

    // Pulse 1: debug panel — long-press on title to reveal
    initDebugPanel('.home-title', today, loc);

    // Pulse 4: azimuth compass — request permission (iOS 13+) then start
    if (today._solarAzimuth != null && window.DeviceOrientationEvent) {
      const ssAz = today._solarAzimuth;
      const startCompass = () => {
        const wrap = document.getElementById('compass-wrap');
        if (wrap) wrap.style.display = 'flex';
        _stopCompass = watchSunsetBearing(ssAz, ({ delta }) => {
          const arrow = document.getElementById('compass-arrow');
          if (arrow) arrow.style.transform = `rotate(${delta.toFixed(0)}deg)`;
        });
      };
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS 13+ requires explicit user gesture — wire to compass-wrap tap
        const wrap = document.getElementById('compass-wrap');
        if (wrap) {
          wrap.style.display = 'flex';
          wrap.style.opacity = '0.45';
          wrap.title = 'הקש לאפשר גישה למצפן';
          wrap.addEventListener('click', () => {
            DeviceOrientationEvent.requestPermission().then(state => {
              if (state === 'granted') { wrap.style.opacity = ''; startCompass(); }
            }).catch(() => {});
          }, { once: true });
        }
      } else {
        startCompass();
      }
    }
  }
}

/**
 * Refresh main screen with new data
 */
export function refreshMain(weekData) {
  _weekData = weekData;
  const el = document.getElementById('week-bars');
  if (el) el.innerHTML = renderWeekBars(weekData);
  const scrollEl = document.getElementById('daily-scroll');
  if (scrollEl) scrollEl.innerHTML = renderDailyCards(weekData);
}

// ─────────────────────────────────────────
//  Countdown timer to next event
// ─────────────────────────────────────────
function startCountdown(today) {
  if (!today) return;
  const el = document.getElementById('countdown-timer');
  if (!el) return;

  function update() {
    const now = new Date();
    const todayDate = today.date; // 'YYYY-MM-DD'

    // Parse sunrise and sunset times
    const [srH, srM] = today.sunrise.split(':').map(Number);
    const [ssH, ssM] = today.sunset.split(':').map(Number);

    const sunriseTime = new Date(todayDate + 'T12:00:00');
    sunriseTime.setHours(srH, srM, 0, 0);
    const sunsetTime = new Date(todayDate + 'T12:00:00');
    sunsetTime.setHours(ssH, ssM, 0, 0);

    let target, label, icon;

    if (now < sunriseTime) {
      target = sunriseTime; label = 'זריחה בעוד'; icon = 'sunrise';
    } else if (now < sunsetTime) {
      target = sunsetTime; label = 'שקיעה בעוד'; icon = 'sunset';
    } else {
      // After sunset — show rating widget if not yet rated
      const todayDate = today.date;
      const alreadyRated = hasRatedToday(todayDate);

      if (alreadyRated) {
        el.innerHTML = `
          <div class="countdown-done">
            <div class="logo-circle-sm">${logoImg('twilight', 16)}</div>
            <span>תודה על הדירוג! נתראה מחר</span>
          </div>`;
      } else {
        el.innerHTML = `
          <div class="countdown-done" style="flex-direction:column;gap:8px">
            <div style="display:flex;align-items:center;gap:8px">
              <div class="logo-circle-sm">${logoImg('twilight', 16)}</div>
              <span>איך הייתה השקיעה?</span>
            </div>
            <div class="rating-stars" id="rating-stars">
              ${[1,2,3,4,5].map(n => `
                <button class="rating-star" data-rating="${n * 2}" title="${n * 2}/10">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </button>
              `).join('')}
            </div>
          </div>`;

        // Attach rating handlers directly (innerHTML is synchronous)
        document.querySelectorAll('#rating-stars .rating-star').forEach(btn => {
          btn.addEventListener('click', () => {
            const r = Number(btn.dataset.rating);
            recordUserRating(todayDate, r);
            el.innerHTML = `
              <div class="countdown-done">
                <div class="logo-circle-sm">${logoImg('twilight', 16)}</div>
                <span>דירגת ${r}/10 — תודה!</span>
              </div>`;
          });
        });
      }
      return;
    }

    const diff = target - now;
    const hours = Math.floor(diff / 3600000);
    const mins  = Math.floor((diff % 3600000) / 60000);
    const secs  = Math.floor((diff % 60000) / 1000);

    el.innerHTML = `
      <div class="countdown-row">
        <div class="logo-circle-sm">${logoImg(icon, 16)}</div>
        <span class="countdown-label">${label}</span>
        <span class="countdown-digits">${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}</span>
      </div>`;
  }

  update();
  _countdownInterval = setInterval(update, 1000);
}

// ─────────────────────────────────────────
//  Cloud coverage mini-chart (hourly gradient)
// ─────────────────────────────────────────
function renderCloudChart(hourlyFull) {
  if (!hourlyFull || !hourlyFull.length) return '';

  const segments = hourlyFull.map(h => {
    // 0% clouds → warm blue, 100% → dark grey
    const c = h.cloud;
    const r = Math.round(70 + c * 0.8);
    const g = Math.round(140 + c * -0.4);
    const b = Math.round(210 + c * -1.2);
    return `rgb(${Math.max(60,r)},${Math.max(60,g)},${Math.max(60,b)})`;
  });

  const gradientStops = segments.map((col, i) => {
    const pct = (i / (segments.length - 1)) * 100;
    return `${col} ${pct.toFixed(1)}%`;
  }).join(', ');

  // Find sunrise/sunset positions
  const srIdx = hourlyFull.findIndex(h => h.isSunrise);
  const ssIdx = hourlyFull.findIndex(h => h.isSunset);
  const total = hourlyFull.length;

  const markers = [];
  if (srIdx >= 0) markers.push({ pos: (srIdx / (total - 1)) * 100, label: '🌅', type: 'sr' });
  if (ssIdx >= 0) markers.push({ pos: (ssIdx / (total - 1)) * 100, label: '🌇', type: 'ss' });

  return `
    <div class="cloud-chart-wrap">
      <div class="cloud-chart-label">עננות לאורך היום</div>
      <div class="cloud-chart-bar-wrap">
        <div class="cloud-chart-bar" style="background:linear-gradient(to left, ${gradientStops})">
          ${markers.map(m => `
            <div class="cloud-chart-marker" style="right:${m.pos}%">
              <span>${m.label}</span>
            </div>
          `).join('')}
        </div>
        <div class="cloud-chart-labels">
          <span>${hourlyFull[0].t}</span>
          <span>${hourlyFull[hourlyFull.length - 1].t}</span>
        </div>
      </div>
    </div>`;
}

// ─────────────────────────────────────────
//  Parameter progress bar builder
//  value: current value, max: scale max
//  optLo/optHi: optimal range boundaries
// ─────────────────────────────────────────
function buildParamBar(label, value, max, optLo, optHi) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const inOptimal = value >= optLo && value <= optHi;
  const isBad = label === 'רוח' ? value > 30 : label === 'עננות' ? value > 75 : label === 'אבק' ? value > 60 : false;
  const cls = inOptimal ? 'optimal' : isBad ? 'poor' : 'neutral';
  const optLeftPct = (optLo / max) * 100;
  const optWidthPct = ((optHi - optLo) / max) * 100;

  return `
    <div class="param-bar-item">
      <div class="param-bar-label">${label}</div>
      <div class="param-bar-track">
        <div class="optimal-zone" style="right:${100 - optLeftPct - optWidthPct}%;width:${optWidthPct}%"></div>
        <div class="param-bar-fill ${cls}" style="width:${pct}%"></div>
      </div>
      <div class="param-bar-value">${Math.round(value)}</div>
    </div>`;
}

// ─────────────────────────────────────────
//  Decision banner helper (Pulse 3)
//  Uses already-computed score + goldenWindow — no re-scoring.
// ─────────────────────────────────────────
function buildDecision(today) {
  const score = today.score;
  const gw    = today.goldenWindow;
  const fmtPeak = gw?.peakTime
    ? new Date(gw.peakTime).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    : null;

  let tier, text, sub;

  if (score >= 8.0) {
    tier = 'go';
    text = 'צא עכשיו';
    sub  = fmtPeak ? `שיא ב-${fmtPeak} — אל תפספס` : 'תנאים מצוינים לשקיעה';
  } else if (score >= 6.5) {
    tier = 'go';
    text = 'שווה לצאת';
    sub  = fmtPeak ? `שיא +${Math.round(gw.peakOffsetMinutes)} דק׳ אחרי השקיעה` : 'תנאים טובים';
  } else if (score >= 5.0) {
    tier = 'maybe';
    text = 'רק אם אתה קרוב';
    sub  = 'תנאים סבירים, לא שווה נסיעה ארוכה';
  } else if (score >= 3.5) {
    tier = 'maybe';
    text = 'עדיף להישאר';
    sub  = 'שקיעה חלשה — לא שווה לצאת';
  } else {
    tier = 'no';
    text = 'שקיעה מכוסה';
    sub  = 'עננות כבדה או אובך — לא יהיה מה לראות';
  }

  return `
    <div class="decision-banner decision-${tier}">
      <div class="decision-score-bubble">${score.toFixed(1)}</div>
      <div class="decision-text">
        <span class="decision-main">${text}</span>
        <span class="decision-sub">${sub}</span>
      </div>
    </div>`;
}

// ─────────────────────────────────────────
//  Golden Window peak badge (Pulse 3)
// ─────────────────────────────────────────
function buildGoldenWindowBadge(today) {
  const gw = today.goldenWindow;
  if (!gw || !gw.peakTime) return '';

  const fmt = (d) => new Date(d).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const peak     = fmt(gw.peakTime);
  const winStart = fmt(gw.windowStart);
  const winEnd   = fmt(gw.windowEnd);
  const dur      = Math.round(gw.duration);

  return `
    <div class="golden-window-badge" title="חלון שיא: ${winStart}–${winEnd}">
      <span class="gw-icon">★</span>
      <div class="gw-info">
        <span class="gw-peak">${peak}</span>
        <span class="gw-label">שיא הצבע · ${dur} דק׳</span>
      </div>
    </div>`;
}

// ─────────────────────────────────────────
//  Palette strip — shows predicted sky type
// ─────────────────────────────────────────
function buildPaletteStrip(today) {
  const p = today?.palette;
  if (!p) return '';

  return `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 16px 2px;margin-bottom:-4px">
      <span style="
        display:inline-flex;align-items:center;gap:6px;
        background:linear-gradient(90deg,${p.primary}22,${p.secondary}11);
        border:1px solid ${p.primary}55;
        border-radius:20px;padding:4px 10px;
        font-size:11px;font-weight:600;color:${p.primary};
        font-family:'Rubik',sans-serif;
      ">
        <span style="width:8px;height:8px;border-radius:50%;background:linear-gradient(135deg,${p.primary},${p.secondary});flex-shrink:0"></span>
        ${p.styleHe}
      </span>
      <span style="font-size:10px;color:rgba(245,220,180,0.45);font-family:'Rubik',sans-serif;line-height:1.3">${p.description}</span>
    </div>`;
}

// ─────────────────────────────────────────
//  Build full HTML
// ─────────────────────────────────────────
function buildMainHTML(loc, city, weekData) {
  const today = weekData[0];
  if (!today) return '<div class="home-content"><p style="color:var(--cream)">שגיאה בטעינת נתונים</p></div>';

  const tomorrow = weekData[1] || null;
  const trend = trendArrow(today.score, tomorrow?.score);
  const recommendation = getSmartRecommendation(today);
  const goldenHour = goldenHourRange(today.sunset);

  return `
  <div class="home-content">

    <!-- Top bar -->
    <div class="home-topbar">
      <div class="home-topbar-left">
        <div class="icon-btn" id="refresh-btn" title="רענן">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="color:var(--cream-faint)">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </div>
      </div>
      <div id="city-display" style="display:flex;align-items:center;gap:6px;cursor:pointer" title="לחץ לשינוי מיקום">
        <svg width="12" height="12" fill="var(--gold)" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
        <span style="font-size:13px;color:var(--cream-faint);font-weight:600">${city}</span>
        <svg width="10" height="10" fill="none" stroke="var(--cream-faint)" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </div>
    </div>

    <!-- Location search bar (hidden by default, animated via .open class) -->
    <div id="location-search-bar" class="location-search-bar">
      <div class="loc-search-row1">
        <div class="search-input-wrap" style="flex:1">
          <svg width="14" height="14" fill="none" stroke="var(--cream-faint)" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input id="location-search-input" class="search-input" type="text" placeholder="הקלד שם עיר..." dir="rtl" autocomplete="off" />
        </div>
        <button class="search-filter-btn" id="location-search-close" title="סגור">✕</button>
      </div>
      <div class="loc-search-row2">
        <button class="search-filter-btn loc-search-btn-wide" id="location-search-go">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          חפש מיקום
        </button>
        <button class="search-filter-btn loc-search-btn-wide" id="location-search-gps" title="מיקום GPS">
          <svg width="14" height="14" fill="var(--gold-light)" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>
          מיקום נוכחי
        </button>
      </div>
    </div>

    <!-- Title -->
    <div class="home-title-block">
      <div class="home-title">TWILIGHT</div>
      <div class="home-subtitle">תחזית איכות דמדומים</div>
    </div>

    <!-- ═══ PALETTE STRIP (Pulse 3 — informational, decision moved to Spot Finder) ═══ -->
    ${buildPaletteStrip(today)}

    <!-- ═══ TODAY SCORE CARD ═══ -->
    <div class="glass-strong score-card">
      <div class="score-top">
        <!-- Gauge arc (replaces plain number) -->
        <div class="score-gauge-wrap" data-score-tier="${today.score >= 7 ? 'high' : today.score >= 4 ? 'mid' : 'low'}">
          ${buildGaugeArc(today.score, today.scoreColor, 130)}
          <div class="score-desc">${today.scoreLabel}</div>
          <!-- Trend arrow -->
          ${trend.arrow ? `
          <div class="trend-badge" style="${trend.css}">
            <span class="trend-arrow">${trend.arrow}</span>
            <span class="trend-label">${trend.label}</span>
          </div>` : ''}
        </div>

        <!-- Times column with rounded logos -->
        <div class="score-times">
          <div class="time-row">
            <div class="logo-circle">${logoImg('sunrise', 28)}</div>
            <div class="time-info">
              <div class="time-val">${today.sunrise}</div>
              <div class="time-lbl">זריחה</div>
            </div>
          </div>
          <div class="time-row">
            <div class="logo-circle">${logoImg('sunset', 28)}</div>
            <div class="time-info">
              <div class="time-val">${today.sunset}</div>
              <div class="time-lbl">שקיעה</div>
            </div>
          </div>
          <div class="time-row">
            <div class="logo-circle">${logoImg('twilight', 28)}</div>
            <div class="time-info">
              <div class="time-val" style="font-size:13px">${today.twilight}</div>
              <div class="time-lbl">חלון דמדומים</div>
              ${today.purpleLightTime ? `<div style="font-size:10px;color:#A866E8;font-weight:600;margin-top:2px">★ אור סגול ~${today.purpleLightTime}</div>` : ''}
            </div>
          </div>
          <!-- Golden Window peak badge (Pulse 3) -->
          ${buildGoldenWindowBadge(today)}
          <div class="time-row">
            <div class="logo-circle golden-hour-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.8">
                <circle cx="12" cy="12" r="4"/>
                <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="var(--gold-light)" stroke-width="1.5"/>
              </svg>
            </div>
            <div class="time-info">
              <div class="time-val" style="font-size:12px;color:var(--gold-light)">${goldenHour}</div>
              <div class="time-lbl">שעת זהב
                ${today.goldenHourMin >= 32
                  ? `<span style="margin-right:4px;font-size:9px;color:var(--gold);background:rgba(240,184,74,0.15);border:1px solid rgba(240,184,74,0.3);border-radius:6px;padding:1px 5px">⏱ ארוכה (${today.goldenHourMin} דק׳)</span>`
                  : `<span style="margin-right:4px;font-size:9px;color:var(--cream-faint)">${today.goldenHourMin} דק׳</span>`}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Countdown timer -->
      <div id="countdown-timer" class="countdown-wrap"></div>

      <!-- Compass arrow (Pulse 4) — shown only when DeviceOrientation is available -->
      <div id="compass-wrap" class="compass-wrap" style="display:none">
        <div id="compass-arrow" class="compass-arrow" title="כיוון השקיעה">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L6 20l6-4 6 4L12 2z" fill="var(--gold)" opacity="0.9"/>
          </svg>
        </div>
        <span class="compass-label">כיוון השקיעה</span>
      </div>

      <!-- Smart recommendation -->
      <div class="recommendation-row">
        <span>${recommendation}</span>
      </div>

      <!-- Bottom stats row with progress fills -->
      <div class="score-stats-row">
        <div class="stat-pill" style="--fill-pct:${today._cloudRaw}%" ${today._cloudRaw >= 20 && today._cloudRaw <= 40 ? 'data-optimal="true"' : today._cloudRaw > 70 ? 'data-bad="true"' : ''}>
          <svg width="13" height="13" fill="none" stroke="var(--cream-faint)" stroke-width="2" viewBox="0 0 24 24"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/></svg>
          <span>${today.cloud}</span>
          <span class="stat-lbl">עננות</span>
        </div>
        <div class="stat-pill" style="--fill-pct:${today._humidityRaw}%" ${today._humidityRaw >= 40 && today._humidityRaw <= 60 ? 'data-optimal="true"' : today._humidityRaw > 80 ? 'data-bad="true"' : ''}>
          <svg width="13" height="13" fill="none" stroke="var(--cream-faint)" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 1 7 7c0 4-7 13-7 13S5 13 5 9a7 7 0 0 1 7-7z"/></svg>
          <span>${today.humidity}</span>
          <span class="stat-lbl">לחות</span>
        </div>
        <div class="stat-pill" style="--fill-pct:${Math.min(100, today._windRaw * 2.5)}%" ${today._windRaw < 10 ? 'data-optimal="true"' : today._windRaw > 30 ? 'data-bad="true"' : ''}>
          <svg width="13" height="13" fill="none" stroke="var(--cream-faint)" stroke-width="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          <span>${today.wind}</span>
          <span class="stat-lbl">רוח</span>
        </div>
        <div class="stat-pill" style="--fill-pct:${Math.min(100, (today._visibilityRaw / 30) * 100)}%" ${today._visibilityRaw >= 20 ? 'data-optimal="true"' : today._visibilityRaw < 5 ? 'data-bad="true"' : ''}>
          <svg width="13" height="13" fill="none" stroke="var(--cream-faint)" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="12" x2="16" y2="14"/></svg>
          <span>${today.visibility} ק״מ</span>
          <span class="stat-lbl">נראות</span>
        </div>
      </div>
    </div>

    <!-- 7-day bar chart -->
    <div class="glass" style="padding:16px 14px 12px">
      <div style="font-size:11px;font-weight:700;color:var(--gold);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px">7 ימים קרובים</div>
      <div id="week-bars" class="week-bars-wrap">
        ${renderWeekBars(weekData)}
      </div>
    </div>

    <!-- Daily accordion cards -->
    <div id="daily-scroll">
      ${renderDailyCards(weekData)}
    </div>

  </div>
  `;
}

// ─────────────────────────────────────────
//  Week bar chart
// ─────────────────────────────────────────
function renderWeekBars(weekData) {
  const dayLetters = ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'];
  return weekData.map((d, i) => {
    let label;
    if (i === 0) label = 'היום';
    else if (i === 1) label = 'מחר';
    else {
      const dt = new Date(d.date + 'T12:00:00');
      label = dayLetters[dt.getDay()];
    }
    const metal = scoreToMetal(d.score);
    return `
    <div class="week-bar-item" onclick="toggleDaily(${i})">
      <div class="week-bar-track">
        <div class="week-bar-fill" style="height:${d.score * 10}%;background:${metal.gradient};box-shadow:0 0 8px ${metal.glow}55;position:relative;overflow:hidden;animation:barGrow 0.5s cubic-bezier(0.34,1.56,0.64,1) both;animation-delay:${i * 55}ms">
          <div style="position:absolute;inset:0;${metal.radial ? 'background:' + metal.radial : ''}"></div>
          <div style="position:absolute;top:0;left:0;width:20%;height:100%;background:linear-gradient(90deg,rgba(0,0,0,0.22) 0%,rgba(0,0,0,0) 100%)"></div>
          <div style="position:absolute;top:0;right:0;width:20%;height:100%;background:linear-gradient(270deg,rgba(0,0,0,0.22) 0%,rgba(0,0,0,0) 100%)"></div>
          <div style="position:absolute;top:0;left:10%;right:10%;height:45%;background:radial-gradient(ellipse 80% 100% at 50% 0%,rgba(255,255,255,0.30) 0%,rgba(255,255,255,0) 100%)"></div>
          <span class="week-bar-score" style="position:relative;z-index:1;color:${metal.text}">${d.score.toFixed(1)}</span>
        </div>
      </div>
      <div class="week-bar-day">${label}</div>
      <div class="week-bar-date">${d.shortDate}</div>
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────
//  Hourly forecast strip (full day)
// ─────────────────────────────────────────
function renderHourlyStrip(hourlyFull) {
  if (!hourlyFull || !hourlyFull.length) return '';

  const items = hourlyFull.map(h => {
    const cloudOpacity = Math.max(0.25, h.cloud / 100);
    const rainColor = h.rain >= 60 ? '#7EB8E8' : h.rain >= 30 ? '#A8C8D8' : 'var(--cream-faint)';
    let itemClass = 'hourly-item';
    if (h.isSunset)   itemClass += ' hourly-item--sunset';
    else if (h.isSunrise)  itemClass += ' hourly-item--sunrise';
    else if (h.isTwilight) itemClass += ' hourly-item--twilight';

    const eventDot = h.isSunset   ? `<div class="hourly-dot hourly-dot--sunset"></div>`
                   : h.isSunrise  ? `<div class="hourly-dot hourly-dot--sunrise"></div>`
                   : h.isTwilight ? `<div class="hourly-dot hourly-dot--twilight"></div>`
                   :                `<div class="hourly-dot"></div>`;

    const rainClass = h.rain >= 60 ? 'hourly-rain hourly-rain--heavy'
                    : h.rain >= 30 ? 'hourly-rain hourly-rain--medium'
                    :                'hourly-rain';

    return `
      <div class="${itemClass}">
        ${eventDot}
        <div class="hourly-time">${h.t}</div>
        <div class="hourly-temp">${h.temp}°</div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cream)" stroke-width="1.5" opacity="${cloudOpacity}">
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/>
        </svg>
        <div class="${rainClass}">${h.rain}%</div>
        <div class="hourly-wind">${h.wind}</div>
        ${h.score != null
          ? `<div class="hourly-score" style="color:${scoreToColorContinuous(h.score)}">${h.score.toFixed(1)}</div>`
          : '<div class="hourly-score-spacer"></div>'
        }
      </div>`;
  }).join('');

  return `
    <div style="padding:0 16px 14px">
      <div style="font-size:10px;color:var(--gold);font-weight:700;letter-spacing:1px;margin-bottom:8px">תחזית שעתית</div>
      <div style="display:flex;gap:5px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch">
        ${items}
      </div>
    </div>`;
}

// ─────────────────────────────────────────
//  Daily accordion cards
// ─────────────────────────────────────────
function renderDailyCards(weekData) {
  return weekData.map((d, i) => `
    <div class="glass daily-card" style="margin-bottom:8px">

      <!-- HEADER -->
      <div class="daily-header" onclick="toggleDaily(${i})" style="cursor:pointer;padding:14px 16px">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="score-badge" style="background:${scoreToMetal(d.score).gradient};border:1px solid ${d.scoreColor}55;color:${scoreToMetal(d.score).text};position:relative;overflow:hidden" ${d.score >= 7 ? 'data-shimmer' : ''}><div style="position:absolute;inset:0;background:radial-gradient(ellipse 80% 100% at 50% 0%,rgba(255,255,255,0.25) 0%,rgba(255,255,255,0) 100%)"></div><span style="position:relative;z-index:1;font-size:13px">${d.score.toFixed(1)}</span></div>
          <div>
            <div style="font-weight:700;font-size:15px;color:var(--cream)">${d.day} · ${d.shortDate}</div>
            <div style="font-size:11px;color:var(--cream-faint)">${d.cond}</div>
            <div style="display:flex;align-items:center;gap:4px;margin-top:3px">
              <div class="logo-circle-sm">${logoImg('twilight', 12)}</div>
              <span style="font-size:10px;color:var(--gold-light);font-weight:600">${d.twilight}</span>
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <button class="icon-btn compare-btn" id="compare-btn-${i}" onclick="event.stopPropagation();window._compareDay(${i})"
                  title="השווה יום זה" style="padding:4px;opacity:0.55">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="18"/><rect x="14" y="3" width="7" height="18"/></svg>
          </button>
          ${typeof navigator !== 'undefined' && navigator.share ? `
          <button class="icon-btn" onclick="event.stopPropagation();window._shareDay(${i})"
                  title="שתף" style="padding:4px;opacity:0.55">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          </button>` : ''}
          <div class="chevron-icon" id="chevron-${i}" style="padding-right:2px">
            <svg width="14" height="14" fill="none" stroke="var(--cream-faint)" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </div>
      </div>

      <!-- EXPANDED CONTENT -->
      <div class="daily-expand" id="daily-expand-${i}">

        <!-- ① SCORES -->
        <div class="event-score-row">
          <div class="event-score-panel event-score-panel--sunrise">
            <div class="logo-circle">${logoImg('sunrise', 20)}</div>
            <div class="event-score-num" style="color:${scoreToColorContinuous(d.srScore)}">${d.srScore.toFixed(1)}<span class="event-score-denom">/10</span></div>
            <div class="event-score-lbl">זריחה</div>
            <div class="event-score-time">${d.sunrise}</div>
          </div>
          <div class="event-score-panel event-score-panel--sunset">
            <div class="logo-circle">${logoImg('sunset', 20)}</div>
            <div class="event-score-num" style="color:${scoreToColorContinuous(d.ssScore)}">${d.ssScore.toFixed(1)}<span class="event-score-denom">/10</span></div>
            <div class="event-score-lbl">שקיעה</div>
            <div class="event-score-time">${d.sunset}</div>
          </div>
          <div class="event-score-panel event-score-panel--twilight">
            <div class="logo-circle">${logoImg('twilight', 20)}</div>
            <div class="event-score-num" style="color:${scoreToColorContinuous(d.twScore)}">${d.twScore.toFixed(1)}<span class="event-score-denom">/10</span></div>
            <div class="event-score-lbl">דמדומים</div>
            <div class="event-score-time event-score-time--gold">${d.twilight}</div>
            ${d.purpleLightTime ? `<div class="event-score-purple">★ אור סגול ~${d.purpleLightTime}</div>` : ''}
          </div>
        </div>

        <!-- ② HOURLY FORECAST -->
        ${renderHourlyStrip(d.hourlyFull)}

        <!-- ③ Temp + condition -->
        <div class="daily-temp-row">
          <div>
            <span class="daily-temp-max">${d.temp}</span>
            <span class="daily-temp-min"> / ${d.tempMin}</span>
          </div>
          <div class="daily-cond">
            <div class="daily-cond-text">${d.cond}</div>
            <div class="daily-feels">תחושה ${d.feelsLike}</div>
          </div>
        </div>

        <!-- ④ Parameter progress bars -->
        <div class="param-bar-row">
          ${buildParamBar('עננות', d._cloudRaw, 100, 20, 40)}
          ${buildParamBar('לחות', d._humidityRaw, 100, 40, 60)}
          ${buildParamBar('נראות', d._visibilityRaw, 30, 15, 30)}
          ${buildParamBar('רוח', d._windRaw, 50, 0, 12)}
          ${d._dustRaw > 0 ? buildParamBar('אבק', d._dustRaw, 100, 10, 30) : ''}
        </div>

        <!-- ⑤ Stats grid -->
        <div class="fx-grid">
          ${[
            { lbl: 'רוח',        val: d.wind,                        sub: d.windDir   },
            { lbl: 'לחות',       val: d.humidity,                    sub: 'יחסית'     },
            { lbl: 'נראות',      val: d.visibility,                  sub: 'ק"מ'       },
            { lbl: 'עננות',      val: d.cloud,                       sub: 'כיסוי'     },
            { lbl: 'לחץ',        val: d.pressure.replace(' mb',''),   sub: 'mb'        },
            { lbl: 'שאבות',      val: d.windGusts,                   sub: 'מקס'       },
            { lbl: 'נקודת-טל',   val: d.dewPoint,                    sub: '°'         },
            { lbl: 'גשם',        val: d.rainProb,                    sub: d.rainMm    },
            { lbl: 'UV',          val: d.uvIndex,                     sub: 'מדד'       },
          ].map(c => `
            <div class="fx-cell">
              <div class="fx-cell-lbl">${c.lbl}</div>
              <div class="fx-cell-val">${c.val}</div>
              <div class="fx-cell-sub">${c.sub}</div>
            </div>
          `).join('')}
        </div>

        <!-- ⑥ Tags -->
        <div class="quality-tags">
          ${d.tags.map(t => {
            const isGood = t.includes('מעולה')||t.includes('מומלץ')||t.includes('טוב')||t.includes('נקי')||t.includes('מצוין')||t.includes('נוח')||t.includes('יבש')||t.includes('אופטימלי')||t.includes('צבעים')||t.includes('פריצת אור')||t.includes('אידאלית');
            const isBad  = t.includes('נמוכה')||t.includes('גבוהה')||t.includes('כבד')||t.includes('חזקה')||t.includes('חסימה')||t.includes('גשם')||t.includes('התעננות');
            const cls = isGood ? 'qtag-good' : isBad ? 'qtag-bad' : 'qtag-warn';
            return `<span class="qtag ${cls}">${t}</span>`;
          }).join('')}
        </div>

      </div>
    </div>
  `).join('');
}

// ─────────────────────────────────────────
//  Event handlers
// ─────────────────────────────────────────
function attachMainEvents() {
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      haptic('medium');
      window.dispatchEvent(new CustomEvent('twilight:refresh'));
    });
  }

  // ─── Location search toggle ───
  const cityDisplay = document.getElementById('city-display');
  const searchBar   = document.getElementById('location-search-bar');
  const searchInput = document.getElementById('location-search-input');
  const searchGo    = document.getElementById('location-search-go');
  const searchGps   = document.getElementById('location-search-gps');
  const searchClose = document.getElementById('location-search-close');

  if (cityDisplay && searchBar) {
    cityDisplay.addEventListener('click', () => {
      searchBar.classList.add('open');
      cityDisplay.style.visibility = 'hidden';
      searchInput?.focus();
    });
  }

  if (searchClose) {
    searchClose.addEventListener('click', () => {
      searchBar.classList.remove('open');
      cityDisplay.style.visibility = '';
    });
  }

  // Search by city name
  async function doLocationSearch() {
    const q = searchInput?.value.trim();
    if (!q) return;
    searchInput.disabled = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=il&accept-language=he`,
        { headers: { 'User-Agent': 'TWILIGHT-PWA/1.0' }, signal: ctrl.signal }
      );
      clearTimeout(timer);
      const data = await res.json();
      if (data[0]) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        const name = data[0].display_name?.split(',')[0] || q;
        // Dispatch custom event with new location — app.js handles the rest
        window.dispatchEvent(new CustomEvent('twilight:setLocation', {
          detail: { lat, lon, city: name }
        }));
      } else {
        window.dispatchEvent(new CustomEvent('twilight:toast', { detail: { msg: 'מיקום לא נמצא', type: 'error' } }));
      }
    } catch {
      window.dispatchEvent(new CustomEvent('twilight:toast', { detail: { msg: 'שגיאה בחיפוש', type: 'error' } }));
    } finally {
      searchInput.disabled = false;
    }
  }

  searchGo?.addEventListener('click', doLocationSearch);
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLocationSearch();
  });

  // GPS button — same as refresh but re-detect location
  searchGps?.addEventListener('click', () => {
    searchBar.classList.remove('open');
    cityDisplay.style.visibility = '';
    window.dispatchEvent(new CustomEvent('twilight:refresh'));
  });
}

// ─────────────────────────────────────────
//  Accordion toggle
// ─────────────────────────────────────────
window.toggleDaily = function(i) {
  const el = document.getElementById(`daily-expand-${i}`);
  const ch = document.getElementById(`chevron-${i}`);
  if (!el) return;

  const isOpen = el.classList.contains('open');

  if (isOpen) {
    el.style.maxHeight = el.scrollHeight + 'px';
    el.classList.remove('open');
    requestAnimationFrame(() => { el.style.maxHeight = '0'; });
    if (ch) ch.style.transform = '';
  } else {
    el.classList.add('open');
    el.style.maxHeight = el.scrollHeight + 'px';
    const onEnd = () => {
      el.style.maxHeight = 'none';
      el.removeEventListener('transitionend', onEnd);
    };
    el.addEventListener('transitionend', onEnd);
    if (ch) ch.style.transform = 'rotate(180deg)';
  }
};

// ─────────────────────────────────────────
//  Share a daily forecast (#17)
// ─────────────────────────────────────────
window._shareDay = function(i) {
  const d = _weekData[i];
  if (!d) return;
  const text = `${d.day} ${d.shortDate}: ${d.score}/10 — ${d.scoreLabel}\n` +
               `שקיעה: ${d.sunset}  |  ${d.cond}  |  עננות: ${d.cloud}`;
  if (navigator.share) {
    navigator.share({ title: 'TWILIGHT · תחזית שקיעה', text, url: window.location.href }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      window.dispatchEvent(new CustomEvent('twilight:toast', { detail: { msg: 'הועתק ללוח', type: 'success' } }));
    }).catch(() => {});
  }
};

// ─────────────────────────────────────────
//  Day comparison (#18)
//  First click → highlight; second click → open overlay
// ─────────────────────────────────────────
window._compareDay = function(i) {
  if (_compareIdx === -1) {
    // First selection
    _compareIdx = i;
    document.querySelectorAll('.compare-btn').forEach((b, idx) => {
      b.style.opacity = idx === i ? '1' : '0.3';
      b.style.color = idx === i ? 'var(--gold)' : '';
    });
    haptic('light');
  } else if (_compareIdx === i) {
    // Deselect
    _compareIdx = -1;
    document.querySelectorAll('.compare-btn').forEach(b => { b.style.opacity = '0.55'; b.style.color = ''; });
  } else {
    // Second selection — open overlay
    _showCompareOverlay(_compareIdx, i);
    _compareIdx = -1;
    document.querySelectorAll('.compare-btn').forEach(b => { b.style.opacity = '0.55'; b.style.color = ''; });
  }
};

function _showCompareOverlay(iA, iB) {
  const a = _weekData[iA], b = _weekData[iB];
  if (!a || !b) return;

  const col = (d) => `
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:800;color:var(--cream);margin-bottom:8px">${d.day} ${d.shortDate}</div>
      <div style="font-size:28px;font-weight:900;color:${d.scoreColor};font-family:var(--font-title);line-height:1;margin-bottom:4px">${d.score.toFixed(1)}<span style="font-size:12px;color:var(--cream-faint)">/10</span></div>
      <div style="font-size:10px;color:var(--cream-faint);margin-bottom:10px">${d.scoreLabel}</div>
      ${[
        ['שקיעה', d.ssScore.toFixed(1), d.sunset],
        ['זריחה', d.srScore.toFixed(1), d.sunrise],
        ['עננות', d.cloud, ''],
        ['לחות',  d.humidity, ''],
        ['נראות', `${d.visibility} ק"מ`, ''],
        ['רוח',   d.wind, d.windDir],
      ].map(([lbl, val, sub]) => `
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(245,220,180,0.07);font-size:11px">
          <span style="color:var(--cream-faint)">${lbl}</span>
          <span style="color:var(--cream);font-weight:700">${val} <span style="color:var(--cream-faint);font-weight:400">${sub}</span></span>
        </div>`).join('')}
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
        ${(d.tags || []).slice(0, 4).map(t => `<span style="font-size:9px;padding:2px 6px;background:rgba(245,220,180,0.08);border-radius:6px;color:var(--cream-faint)">${t}</span>`).join('')}
      </div>
    </div>`;

  const overlay = document.createElement('div');
  overlay.id = 'compare-overlay';
  overlay.className = 'overlay-sheet';
  overlay.innerHTML = `
    <div style="width:100%;background:linear-gradient(180deg,#2a1505 0%,#1a0d03 100%);border-radius:24px 24px 0 0;padding:20px 16px 32px;max-height:85vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:12px;font-weight:700;color:var(--gold);letter-spacing:1px">השוואת ימים</div>
        <button id="compare-close" style="background:rgba(245,220,180,0.1);border:none;border-radius:50%;width:28px;height:28px;color:var(--cream);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>
      </div>
      <div style="display:flex;gap:12px;align-items:flex-start">
        ${col(a)}
        <div style="width:1px;background:rgba(245,220,180,0.12);align-self:stretch"></div>
        ${col(b)}
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.id === 'compare-close') overlay.remove();
  });
  haptic('medium');
}

// ─────────────────────────────────────────
//  Skeleton loading state
// ─────────────────────────────────────────
export function showMainSkeleton() {
  const container = document.getElementById('screen-main');
  if (!container) return;
  const bars = Array.from({ length: 7 }, (_, i) =>
    `<div class="skeleton-line" style="flex:1;height:${30 + Math.random() * 45}%;border-radius:6px 6px 0 0;animation-delay:${i * 60}ms"></div>`
  ).join('');
  container.innerHTML = `
  <div class="home-content" style="padding:52px 16px 110px;display:flex;flex-direction:column;gap:14px">

    <!-- top bar skeleton -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <div class="skeleton-line" style="width:120px;height:14px"></div>
      <div class="skeleton-line" style="width:80px;height:14px"></div>
    </div>

    <!-- score card skeleton -->
    <div class="skeleton-card" style="padding:20px 16px">
      <div style="display:flex;gap:16px;align-items:center">
        <div class="skeleton-line" style="width:80px;height:80px;border-radius:50%"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:10px">
          <div class="skeleton-line" style="height:18px;width:60%"></div>
          <div class="skeleton-line" style="height:13px;width:80%"></div>
          <div class="skeleton-line" style="height:13px;width:45%"></div>
        </div>
      </div>
    </div>

    <!-- week bars skeleton -->
    <div class="skeleton-card" style="padding:16px 14px 12px">
      <div class="skeleton-line" style="height:11px;width:90px;margin-bottom:14px"></div>
      <div class="skeleton-bar-row">${bars}</div>
    </div>

    <!-- daily cards skeleton -->
    ${Array.from({ length: 3 }, (_, i) => `
    <div class="skeleton-card" style="padding:14px 16px;animation-delay:${i * 80}ms">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="skeleton-line" style="width:38px;height:38px;border-radius:10px;flex-shrink:0"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px">
          <div class="skeleton-line" style="height:14px;width:55%"></div>
          <div class="skeleton-line" style="height:11px;width:75%"></div>
        </div>
      </div>
    </div>`).join('')}
  </div>`;
}

// ✓ main-screen.js — complete
