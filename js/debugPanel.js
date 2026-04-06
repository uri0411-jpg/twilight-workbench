// ═══════════════════════════════════════════
//  TWILIGHT — debugPanel.js
//  Hidden developer panel: physics + score breakdown.
//  Activation: long-press (600 ms) on the ".home-title" element.
// ═══════════════════════════════════════════

import { getContribution as getPhysicsContribution } from './engine/physicsLayer.js';
import { getContribution as getWindowContribution   } from './engine/goldenWindow.js';

// ─── Panel singleton ──────────────────────

let _panelEl = null;
let _longPressTimer = null;

// ─── Public API ───────────────────────────

/**
 * Attach the long-press listener that opens the debug panel.
 *
 * @param {string}  titleSelector  CSS selector for the trigger element.
 * @param {Object}  dayData        Today's dayData from calcDayData.
 * @param {Object}  [loc]          { lat, lon } for context.
 */
export function initDebugPanel(titleSelector, dayData, loc = {}) {
  const trigger = document.querySelector(titleSelector);
  if (!trigger) return;

  // Remove any previous listener clones
  const clone = trigger.cloneNode(true);
  trigger.replaceWith(clone);

  const start = () => {
    _longPressTimer = setTimeout(() => {
      openPanel(dayData, loc);
      if (navigator.vibrate) navigator.vibrate([8, 40, 8]);
    }, 600);
  };
  const cancel = () => clearTimeout(_longPressTimer);

  clone.addEventListener('pointerdown',  start);
  clone.addEventListener('pointerup',    cancel);
  clone.addEventListener('pointerleave', cancel);
  clone.addEventListener('contextmenu',  e => { e.preventDefault(); cancel(); });
}

// ─── Panel construction ───────────────────

function openPanel(dayData, loc) {
  if (_panelEl) closePanel();

  const content = buildContent(dayData, loc);

  _panelEl = document.createElement('div');
  _panelEl.className = 'debug-panel';
  _panelEl.innerHTML = `
    <div class="debug-panel-inner">
      <div class="debug-panel-header">
        <span class="debug-panel-title">🔬 Debug — Physics Breakdown</span>
        <button class="debug-panel-close" id="debug-close">✕</button>
      </div>
      <pre class="debug-panel-body">${escHtml(content)}</pre>
    </div>`;

  document.body.appendChild(_panelEl);

  _panelEl.querySelector('#debug-close').addEventListener('click', closePanel);
  _panelEl.addEventListener('click', e => { if (e.target === _panelEl) closePanel(); });

  requestAnimationFrame(() => _panelEl.classList.add('open'));
}

function closePanel() {
  if (!_panelEl) return;
  _panelEl.classList.remove('open');
  _panelEl.addEventListener('transitionend', () => { _panelEl?.remove(); _panelEl = null; }, { once: true });
}

// ─── Content builder ─────────────────────

function buildContent(dayData, loc) {
  const lines = [];

  lines.push(`══ TWILIGHT Debug Panel ══`);
  lines.push(`Date:     ${dayData.date}`);
  lines.push(`Location: ${(loc.lat ?? '?').toFixed?.(4) ?? '?'}, ${(loc.lon ?? '?').toFixed?.(4) ?? '?'}`);
  lines.push(``);

  // Score summary
  lines.push(`── Score Summary ──`);
  lines.push(`Composite:  ${dayData.score}  (1-10)`);
  lines.push(`Sunset:     ${dayData.ssScore}   Twilight: ${dayData.twScore}   Sunrise: ${dayData.srScore}`);
  lines.push(`Certainty:  ${dayData.certainty ?? '?'}%   Drama: ${dayData.dramaLevel ?? '?'}%`);
  lines.push(``);

  // Physics layer
  if (dayData.turbidity != null) {
    const physicsResult = {
      turbidity:          dayData.turbidity,
      mieIntensity:       dayData.mieIntensity,
      rayleighSpread:     dayData.rayleighSpread,
      atmosphericClarity: 1 - dayData.turbidity * 0.8, // approx
      contributions:      dayData.physicsContributions ?? {},
    };
    lines.push(`── Physics Layer ──`);
    lines.push(getPhysicsContribution(physicsResult));
    lines.push(``);
  }

  // Golden window
  if (dayData.goldenWindow) {
    lines.push(`── Golden Window ──`);
    lines.push(getWindowContribution(dayData.goldenWindow));
    lines.push(``);
  }

  // Palette
  if (dayData.palette) {
    lines.push(`── Palette ──`);
    lines.push(`Style:  ${dayData.palette.style} (${dayData.palette.styleHe})`);
    lines.push(`Colors: ${dayData.palette.primary} / ${dayData.palette.secondary}`);
    lines.push(`Desc:   ${dayData.palette.description}`);
    lines.push(``);
  }

  // Afterglow
  if (dayData.afterglow) {
    const ag = dayData.afterglow;
    lines.push(`── Afterglow Model ──`);
    lines.push(`Quality:   ${ag.quality}/10   Style: ${ag.style} (${ag.styleHe})`);
    lines.push(`Peak:      +${ag.peakMinutes} min after sunset`);
    lines.push(`Duration:  ${ag.durationMinutes} min`);
    lines.push(``);
  }

  // Raw weather
  lines.push(`── Raw Parameters ──`);
  lines.push(`Clouds:     ${dayData._cloudRaw}%  (Low ${dayData._cloudLowRaw}%  Mid ${dayData._cloudMidRaw}%  High ${dayData._cloudHighRaw}%)`);
  lines.push(`Cloud Δ3h:  ${dayData._cloudDelta > 0 ? '+' : ''}${dayData._cloudDelta}%`);
  lines.push(`Humidity:   ${dayData._humidityRaw}%`);
  lines.push(`Visibility: ${dayData._visibilityRaw} km`);
  lines.push(`Wind:       ${dayData._windRaw} km/h`);
  lines.push(`Dust:       ${dayData._dustRaw} µg/m³   PM10: ${dayData._pm10Raw} µg/m³`);

  return lines.join('\n');
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
