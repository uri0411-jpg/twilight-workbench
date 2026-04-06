// ═══════════════════════════════════════════
//  TWILIGHT — ui.js
//  Shared UI helpers: toast, loading overlay
// ═══════════════════════════════════════════

// ─────────────────────────────────────────
//  Loading overlay
//  FIX: was toggling display:none directly while CSS had display:none
//       on base rule AND on .hidden — removing .hidden had no effect.
//       Solution: base rule is display:flex, .hidden = display:none.
// ─────────────────────────────────────────
let _loadingDepth = 0; // FIX: reference-count for nested showLoading calls

/**
 * Show or hide the full-screen loading overlay.
 * Reference-counted so nested async calls don't hide prematurely.
 *
 * @param {boolean} visible
 */
export function showLoading(visible) {
  const el = document.getElementById('loading');
  if (!el) return;

  if (visible) {
    _loadingDepth++;
    el.classList.remove('hidden');
  } else {
    _loadingDepth = Math.max(0, _loadingDepth - 1);
    if (_loadingDepth === 0) {
      el.classList.add('hidden');
    }
  }
}

/**
 * Force-hide the loading overlay regardless of ref-count.
 * Use in catch/finally blocks when you need a hard reset.
 */
export function forceHideLoading() {
  _loadingDepth = 0;
  const el = document.getElementById('loading');
  if (el) el.classList.add('hidden');
}

// ─────────────────────────────────────────
//  Toast notification
//  FIX: queue-based — multiple toasts don't overlap;
//       uses opacity transitions instead of display:none
//       so CSS animations fire correctly.
// ─────────────────────────────────────────

/** @type {Array<{msg: string, type: string}>} */
const _toastQueue  = [];
let   _toastActive = false;
let   _toastTimer  = null;

/**
 * Show a toast notification.
 * Queued — safe to call multiple times in rapid succession.
 *
 * @param {string} msg   - Message text
 * @param {'info'|'success'|'error'} [type='info'] - Visual variant
 * @param {number} [duration=3000] - Visible duration in ms
 */
export function showToast(msg, type = 'info', duration = 3000) {
  if (!msg) return;
  _toastQueue.push({ msg, type, duration });
  _drainToastQueue();
}

function _drainToastQueue() {
  if (_toastActive || _toastQueue.length === 0) return;
  _toastActive = true;

  const { msg, type, duration } = _toastQueue.shift();
  const el = document.getElementById('toast');
  if (!el) { _toastActive = false; return; }

  // Reset state
  clearTimeout(_toastTimer);
  el.classList.remove(
    'toast-visible', 'toast-hiding',
    'toast-success', 'toast-error', 'toast-info'
  );

  // Apply content and type class
  el.textContent = msg;
  el.classList.add(`toast-${type}`);

  // Force reflow so transition fires from opacity:0
  void el.offsetWidth;

  // Show
  el.classList.add('toast-visible');

  // Schedule hide
  _toastTimer = setTimeout(() => {
    _hideToast(el, () => {
      _toastActive = false;
      // Process next queued toast after a short gap
      setTimeout(_drainToastQueue, 80);
    });
  }, duration);
}

function _hideToast(el, onComplete) {
  el.classList.remove('toast-visible');
  el.classList.add('toast-hiding');

  // Wait for CSS transition to finish (300ms matches app.css transition)
  const TRANSITION_MS = 320;
  setTimeout(() => {
    el.classList.remove('toast-hiding', 'toast-success', 'toast-error', 'toast-info');
    el.textContent = '';
    if (onComplete) onComplete();
  }, TRANSITION_MS);
}

// ─────────────────────────────────────────
//  Score → colour helpers
// ─────────────────────────────────────────

/**
 * Returns a CSS background colour string for a 1–10 score.
 * @param {number} score
 * @returns {string}
 */
export function scoreToColor(score) {
  if (score >= 9) return 'linear-gradient(135deg, #D4820A, #F0B84A)';
  if (score >= 7) return 'linear-gradient(135deg, #B86A0A, #D4820A)';
  if (score >= 5) return 'linear-gradient(135deg, #8B5E1A, #B87830)';
  if (score >= 3) return 'linear-gradient(135deg, #5A4020, #7A5830)';
  return 'linear-gradient(135deg, #3A3050, #5A4870)';
}

/**
 * Returns a flat hex colour for a score (used where gradients aren't supported).
 * @param {number} score
 * @returns {string}
 */
export function scoreToFlat(score) {
  if (score >= 9) return '#F0B84A';
  if (score >= 7) return '#D4820A';
  if (score >= 5) return '#B87830';
  if (score >= 3) return '#7A5830';
  return '#5A4870';
}

/**
 * Returns a score tier label used for CSS data attributes.
 * @param {number} score
 * @returns {'high'|'mid'|'low'}
 */
export function scoreToTier(score) {
  if (score >= 7) return 'high';
  if (score >= 4) return 'mid';
  return 'low';
}

/**
 * Returns a Hebrew label for a score band.
 * @param {number} score
 * @returns {string}
 */
export function scoreToLabel(score) {
  if (score >= 9) return 'מושלם';
  if (score >= 7) return 'מצוין';
  if (score >= 5) return 'טוב';
  if (score >= 3) return 'בינוני';
  return 'חלש';
}

// ─────────────────────────────────────────
//  Gauge SVG generator
// ─────────────────────────────────────────

/**
 * Builds an SVG arc gauge for a 1–10 score.
 * @param {number} score   - 1 to 10
 * @param {number} [size=100] - Outer diameter in px
 * @returns {string} SVG markup string
 */
export function buildGaugeSVG(score, size = 100) {
  const cx      = size / 2;
  const cy      = size / 2;
  const r       = size * 0.38;
  const stroke  = size * 0.075;
  const gap     = 40; // degrees clipped at bottom

  // Arc from (gap/2) to (360 - gap/2) degrees
  const startDeg = 90 + gap / 2;
  const endDeg   = 90 - gap / 2 + 360;
  const arcSpan  = 360 - gap;

  const pct      = Math.max(0, Math.min(10, score)) / 10;
  const fillSpan = arcSpan * pct;

  function polarToXY(deg, radius) {
    const rad = (deg - 90) * (Math.PI / 180);
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad)
    };
  }

  function arcPath(startD, spanD, radius) {
    if (spanD <= 0) return '';
    const clamped  = Math.min(spanD, 359.99);
    const start    = polarToXY(startD, radius);
    const end      = polarToXY(startD + clamped, radius);
    const largeArc = clamped > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  }

  const trackPath = arcPath(startDeg, arcSpan, r);
  const fillPath  = arcPath(startDeg, fillSpan, r);
  const fillColor = scoreToFlat(score);

  // Score text
  const fontSize  = size * 0.28;
  const subSize   = size * 0.10;

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <!-- Track -->
      <path
        d="${trackPath}"
        fill="none"
        stroke="rgba(245,220,180,0.10)"
        stroke-width="${stroke}"
        stroke-linecap="round"
      />
      <!-- Fill -->
      ${fillPath ? `
      <path
        d="${fillPath}"
        fill="none"
        stroke="${fillColor}"
        stroke-width="${stroke}"
        stroke-linecap="round"
        opacity="0.95"
      />` : ''}
      <!-- Score number -->
      <text
        x="${cx}" y="${cy + fontSize * 0.35}"
        text-anchor="middle"
        font-family="'Secular One', sans-serif"
        font-size="${fontSize}"
        font-weight="900"
        fill="${fillColor}"
      >${score}</text>
      <!-- /10 label -->
      <text
        x="${cx}" y="${cy + fontSize * 0.35 + subSize * 1.3}"
        text-anchor="middle"
        font-family="'Rubik', sans-serif"
        font-size="${subSize}"
        font-weight="400"
        fill="rgba(245,230,200,0.45)"
      >/10</text>
    </svg>
  `.trim();
}

// ─────────────────────────────────────────
//  Format helpers
// ─────────────────────────────────────────

/**
 * Format a Date to HH:MM (24h, Hebrew timezone-safe).
 * @param {Date} date
 * @returns {string}
 */
export function formatTime(date) {
  return date.toLocaleTimeString('he-IL', {
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

/**
 * Format a date string (YYYY-MM-DD) to Hebrew short weekday + date.
 * @param {string} dateStr  - e.g. '2025-06-15'
 * @param {boolean} [short=true]
 * @returns {string}
 */
export function formatHebrewDate(dateStr, short = true) {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('he-IL', {
    weekday: short ? 'short' : 'long',
    day:     'numeric',
    month:   short ? 'numeric' : 'long'
  });
}

/**
 * Format wind direction degrees to Hebrew cardinal.
 * @param {number} deg
 * @returns {string}
 */
export function windDirToHebrew(deg) {
  const dirs = ['צ', 'צ-מ', 'מ', 'ד-מ', 'ד', 'ד-מ', 'מ', 'צ-מ'];
  // 8-point compass
  const compass = ['צפון','צפון-מזרח','מזרח','דרום-מזרח','דרום','דרום-מערב','מערב','צפון-מערב'];
  const idx = Math.round(deg / 45) % 8;
  return compass[idx] ?? 'צפון';
}

/**
 * Clamp a value between min and max.
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ─────────────────────────────────────────
//  logoImg — inline image tag for sun icons
// ─────────────────────────────────────────

const _LOGO_SRCS = {
  sunrise:  'images/sunrise.png',
  sunset:   'images/sunset.png',
  twilight: 'images/twilight.png'
};

/**
 * Returns an <img> HTML string for the given icon type.
 * @param {'sunrise'|'sunset'|'twilight'} type
 * @param {number} [size=20]
 * @returns {string}
 */
export function logoImg(type, size = 20) {
  const src = _LOGO_SRCS[type] || _LOGO_SRCS.twilight;
  return `<img src="${src}" width="${size}" height="${size}" alt="" style="vertical-align:middle;object-fit:contain;flex-shrink:0">`;
}

// ─────────────────────────────────────────
//  updateDynamicGradient
//  Tints the .overlay element to match score + palette style
// ─────────────────────────────────────────

/**
 * Updates the page overlay tint to reflect today's forecast mood.
 * @param {number} score        - 1–10 sunset score
 * @param {number} turbidity    - 0–1 atmospheric haziness
 * @param {string} paletteStyle - e.g. 'Desert Fire', 'Grey Veil', 'Sea Blush', …
 */
export function updateDynamicGradient(score, turbidity = 0.3, paletteStyle = '') {
  const overlay = document.querySelector('.overlay');
  if (!overlay) return;

  const t = Math.max(0, Math.min(1, turbidity));
  const s = Math.max(1, Math.min(10, score));

  // Base opacity scales with turbidity (hazier = denser overlay)
  const baseOpacity = 0.18 + t * 0.18;
  const botOpacity  = 0.55 + t * 0.15;

  let topColor, midColor;

  if (paletteStyle.includes('Grey') || s <= 3) {
    // Low-score / grey: cool blue-grey tint
    topColor = `rgba(15,12,22,${baseOpacity})`;
    midColor = `rgba(12,10,18,${baseOpacity * 0.5})`;
  } else if (paletteStyle.includes('Desert') || paletteStyle.includes('Fire')) {
    // Desert Fire: warm amber-red
    topColor = `rgba(40,10,0,${baseOpacity})`;
    midColor = `rgba(28,8,0,${baseOpacity * 0.4})`;
  } else if (paletteStyle.includes('Sea') || paletteStyle.includes('Coast')) {
    // Coastal/sea: cool lilac
    topColor = `rgba(10,8,30,${baseOpacity})`;
    midColor = `rgba(8,6,22,${baseOpacity * 0.4})`;
  } else if (s >= 7) {
    // High score: warm sunset haze
    topColor = `rgba(30,8,0,${baseOpacity})`;
    midColor = `rgba(20,6,0,${baseOpacity * 0.4})`;
  } else {
    // Mid score: neutral brown
    topColor = `rgba(20,8,0,${baseOpacity})`;
    midColor = `rgba(16,6,0,${baseOpacity * 0.4})`;
  }

  overlay.style.background = `linear-gradient(
    180deg,
    ${topColor} 0%,
    ${midColor} 35%,
    ${midColor} 60%,
    rgba(10,4,0,${botOpacity}) 100%
  )`;
}

// ─────────────────────────────────────────
//  esc — HTML escape for untrusted strings
// ─────────────────────────────────────────

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ✎ fixed: showLoading — reference-counted, works with display:flex/.hidden pattern
// ✎ fixed: showToast — queue-based, opacity transitions, no display:none flicker
// ✎ added: forceHideLoading — hard reset for error recovery
// ✎ added: buildGaugeSVG — SVG arc gauge extracted from main-screen.js
// ✎ added: formatTime, formatHebrewDate, windDirToHebrew, clamp helpers
// ✎ added: logoImg, updateDynamicGradient, esc — were imported but missing
// ✓ ui.js — complete