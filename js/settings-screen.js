// ═══════════════════════════════════════════
//  TWILIGHT — settings-screen.js
//  Notification wizard + toggles
// ═══════════════════════════════════════════

import { showToast } from './ui.js';
import { clearAll } from './cache.js';
import { clearLocation } from './location.js';
import { clearCalibration, getCalibrationStats } from './calibration.js';

const SETTINGS_KEY = 'twl_settings';

let _settings   = loadSettings();
let _wizardStep = 1;

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : defaultSettings();
  } catch { return defaultSettings(); }
}

function defaultSettings() {
  return {
    event:        'both',
    minScore:     6,
    activeDays:   [0,1,2,3,4,5,6],
    autoLocation: true,
    offlineMode:  false
  };
}

function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

// ─────────────────────────────────────────
//  Main entry
// ─────────────────────────────────────────
export function initSettingsScreen() {
  _settings   = loadSettings();
  _wizardStep = 1;
  const container = document.getElementById('screen-settings');
  if (!container) return;
  container.innerHTML = buildSettingsHTML();
  attachSettingsEvents();
}

// ─────────────────────────────────────────
//  Calibration stats section
// ─────────────────────────────────────────
function buildCalibrationSection() {
  const stats = getCalibrationStats();

  if (stats.sampleSize === 0) {
    return `
    <div class="settings-section">
      <div class="settings-section-label">כיול חיזוי</div>
      <div class="glass" style="padding:16px;text-align:center;font-size:12px;color:var(--cream-faint);line-height:1.8">
        אין עדיין נתוני כיול.<br>
        הנתונים יצטברו אוטומטית לאחר מספר ימים.
      </div>
    </div>`;
  }

  const biasSign  = stats.bias > 0 ? '+' : '';
  const biasColor = Math.abs(stats.bias) < 0.5 ? 'var(--cream-faint)' : stats.bias > 0 ? '#ffaaaa' : '#aaffcc';
  const trendIcon = stats.trend === 'improving' ? '↗' : stats.trend === 'worsening' ? '↘' : '→';
  const trendColor = stats.trend === 'improving' ? '#aaffcc' : stats.trend === 'worsening' ? '#ffaaaa' : 'var(--cream-faint)';

  // Mini bar chart — last 10 entries, each as a row
  const chartRows = stats.entries.slice(-10).map(e => {
    const pct  = Math.round((e.predicted / 10) * 100);
    const uPct = e.actual != null ? Math.round((e.actual / 10) * 100) : null;
    const dateShort = e.date ? e.date.slice(5) : ''; // MM-DD
    return `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:11px">
        <div style="width:36px;color:var(--cream-faint);text-align:end;flex-shrink:0">${dateShort}</div>
        <div style="flex:1;position:relative;height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden">
          <div style="position:absolute;right:0;top:0;height:100%;width:${pct}%;background:var(--gold);opacity:0.7;border-radius:4px"></div>
          ${uPct != null ? `<div style="position:absolute;right:0;top:0;height:100%;width:${uPct}%;background:#7eefb2;opacity:0.55;border-radius:4px"></div>` : ''}
        </div>
        <div style="width:20px;color:var(--gold);text-align:start;flex-shrink:0">${e.predicted.toFixed(1)}</div>
      </div>`;
  }).join('');

  return `
  <div class="settings-section">
    <div class="settings-section-label">כיול חיזוי</div>
    <div class="glass" style="padding:16px">

      <!-- Summary row -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <div style="font-size:12px;color:var(--cream-faint);line-height:1.8">
          <div>דגימות: <span style="color:var(--cream)">${stats.sampleSize}</span></div>
          ${stats.userSamples > 0 ? `<div>דירוגי משתמש: <span style="color:var(--cream)">${stats.userSamples}</span></div>` : ''}
        </div>
        <div style="text-align:center">
          <div style="font-size:22px;font-weight:900;color:${biasColor}">${biasSign}${stats.bias}</div>
          <div style="font-size:10px;color:var(--cream-faint)">הטיה</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:22px;font-weight:900;color:var(--gold)">${stats.confidence}%</div>
          <div style="font-size:10px;color:var(--cream-faint)">ביטחון</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:22px;font-weight:900;color:${trendColor}">${trendIcon}</div>
          <div style="font-size:10px;color:var(--cream-faint)">מגמה</div>
        </div>
      </div>

      <!-- Legend -->
      ${stats.entries.some(e => e.actual != null) ? `
      <div style="display:flex;gap:14px;font-size:10px;color:var(--cream-faint);margin-bottom:10px">
        <span><span style="display:inline-block;width:10px;height:6px;background:var(--gold);opacity:0.7;border-radius:2px;vertical-align:middle;margin-left:3px"></span>חיזוי</span>
        <span><span style="display:inline-block;width:10px;height:6px;background:#7eefb2;opacity:0.55;border-radius:2px;vertical-align:middle;margin-left:3px"></span>דירוג</span>
      </div>` : ''}

      <!-- Chart -->
      <div>${chartRows}</div>

    </div>
  </div>`;
}

// ─────────────────────────────────────────
//  Build HTML
//  FIX: step 4 shows denied-state message when Notification.permission === 'denied'
//  FIX: aria-label on min-score-slider
// ─────────────────────────────────────────
function buildSettingsHTML() {
  const days     = ['א','ב','ג','ד','ה','ו','ש'];
  const dayNames = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

  // FIX: detect denied permission state for step 4
  const notifDenied = ('Notification' in window) && Notification.permission === 'denied';

  return `
  <div class="settings-content">
    <div class="settings-title">הגדרות</div>

    <!-- ═══ NOTIFICATION WIZARD ═══ -->
    <div class="glass wizard-wrap">
      <div class="wizard-title">התראות חכמות</div>

      <div class="wizard-dots" style="margin-bottom:14px">
        ${[1,2,3,4].map(n => `
          <div class="wizard-dot${_wizardStep >= n ? ' active' : ''}" id="wdot-${n}"></div>
        `).join('')}
      </div>

      <!-- Step 1 -->
      <div class="wizard-step-panel" id="wstep-1" style="${_wizardStep===1?'':'display:none'}">
        <div style="font-size:13px;color:var(--cream-faint);margin-bottom:10px">שלב 1 — על מה להתריע?</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${[
            { val: 'sunrise', label: 'זריחה' },
            { val: 'sunset',  label: 'שקיעה' },
            { val: 'both',    label: 'שניהם' }
          ].map(opt => `
            <button class="cat-btn wizard-event-btn${_settings.event===opt.val?' active':''}" data-val="${opt.val}">
              ${opt.label}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Step 2 -->
      <div class="wizard-step-panel" id="wstep-2" style="${_wizardStep===2?'':'display:none'}">
        <div style="font-size:13px;color:var(--cream-faint);margin-bottom:10px">שלב 2 — ציון מינימלי</div>
        <div style="display:flex;align-items:center;gap:12px">
          <input id="min-score-slider" type="range" min="1" max="10" step="1"
                 value="${_settings.minScore}"
                 class="range-slider" style="flex:1"
                 aria-label="ציון מינימלי להתראה" />
          <div id="min-score-val" style="font-size:22px;font-weight:900;color:var(--gold);min-width:24px">${_settings.minScore}</div>
        </div>
      </div>

      <!-- Step 3 -->
      <div class="wizard-step-panel" id="wstep-3" style="${_wizardStep===3?'':'display:none'}">
        <div style="font-size:13px;color:var(--cream-faint);margin-bottom:10px">שלב 3 — ימים פעילים</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${days.map((d, i) => `
            <button class="day-circle-btn${_settings.activeDays.includes(i)?' active':''}" data-day="${i}" title="${dayNames[i]}">
              ${d}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Step 4 — FIX: separate UI for denied permission state -->
      <div class="wizard-step-panel" id="wstep-4" style="${_wizardStep===4?'':'display:none'}">
        <div style="font-size:13px;color:var(--cream-faint);margin-bottom:14px">שלב 4 — אישור</div>
        <div style="font-size:12px;color:var(--cream-faint);line-height:1.7;margin-bottom:14px">
          <div>אירוע: <span style="color:var(--cream)">${_settings.event === 'both' ? 'זריחה ושקיעה' : _settings.event === 'sunrise' ? 'זריחה' : 'שקיעה'}</span></div>
          <div>ציון מינימלי: <span style="color:var(--gold)">${_settings.minScore}</span></div>
          <div>ימים: <span style="color:var(--cream)">${_settings.activeDays.length} ימים</span></div>
        </div>

        ${notifDenied
          ? `<div style="font-size:12px;color:#ffaaaa;line-height:1.7;padding:12px;background:rgba(200,60,60,0.12);border:1px solid rgba(200,60,60,0.25);border-radius:12px">
               ההרשאה להתראות נדחתה.<br>
               כדי להפעיל: פתח הגדרות דפדפן ← הגדרות אתר ← התראות ← הרשה.
             </div>`
          : `<button class="btn-pill" id="save-notif-btn" style="font-size:13px;padding:12px">
               <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
               שמור והפעל התראות
             </button>`
        }
      </div>

      <!-- Wizard navigation -->
      <div style="display:flex;justify-content:space-between;margin-top:14px">
        <button class="cat-btn" id="wizard-back" style="${_wizardStep===1?'opacity:0.3;pointer-events:none':''}">הקודם</button>
        <button class="cat-btn" id="wizard-next" style="${_wizardStep===4?'display:none':''}">הבא</button>
      </div>
    </div>

    <!-- ═══ TOGGLES ═══ -->
    <div class="settings-section">
      <div class="settings-section-label">כללי</div>
      <div class="glass">
        <div class="settings-row">
          <div class="settings-row-label">
            <svg width="18" height="18" fill="none" stroke="var(--cream-faint)" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>
            מיקום אוטומטי
          </div>
          <div class="toggle ${_settings.autoLocation ? 'on' : 'off'}" id="toggle-location" data-key="autoLocation">
            <div class="toggle-knob"></div>
          </div>
        </div>
        <div class="settings-row" style="border-top:1px solid rgba(245,220,180,0.1)">
          <div class="settings-row-label">
            <svg width="18" height="18" fill="none" stroke="var(--cream-faint)" stroke-width="2" viewBox="0 0 24 24"><path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"/><path d="M8 2v16"/><path d="M16 6v16"/></svg>
            מצב לא מקוון
          </div>
          <div class="toggle ${_settings.offlineMode ? 'on' : 'off'}" id="toggle-offline" data-key="offlineMode">
            <div class="toggle-knob"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ CACHE CLEAR ═══ -->
    <div class="settings-section">
      <div class="settings-section-label">מתקדם</div>
      <div class="glass">
        <div class="settings-row" id="clear-cache-btn" style="cursor:pointer">
          <div class="settings-row-label">
            <svg width="18" height="18" fill="none" stroke="var(--cream-faint)" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            נקה מטמון
          </div>
          <svg width="14" height="14" fill="none" stroke="var(--cream-faint)" stroke-width="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        </div>
        <div class="settings-row" id="reset-location-btn" style="cursor:pointer;border-top:1px solid rgba(245,220,180,0.1)">
          <div class="settings-row-label">
            <svg width="18" height="18" fill="none" stroke="var(--cream-faint)" stroke-width="2" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.02"/></svg>
            אפס מיקום
          </div>
          <svg width="14" height="14" fill="none" stroke="var(--cream-faint)" stroke-width="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        </div>
        <div class="settings-row" id="clear-calibration-btn" style="cursor:pointer;border-top:1px solid rgba(245,220,180,0.1)">
          <div class="settings-row-label">
            <svg width="18" height="18" fill="none" stroke="var(--cream-faint)" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            מחק נתוני כיול
          </div>
          <svg width="14" height="14" fill="none" stroke="var(--cream-faint)" stroke-width="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        </div>
      </div>
    </div>

    <!-- ═══ CALIBRATION STATS ═══ -->
    ${buildCalibrationSection()}

    <div style="text-align:center;padding:8px 0;font-size:11px;color:var(--cream-faint)">
      TWILIGHT v1.0 · דמדומים
    </div>
  </div>
  `;
}

// ─────────────────────────────────────────
//  Events
// ─────────────────────────────────────────
function attachSettingsEvents() {
  document.getElementById('wizard-next')?.addEventListener('click', () => {
    if (_wizardStep < 4) { _wizardStep++; updateWizardStep(); }
  });
  document.getElementById('wizard-back')?.addEventListener('click', () => {
    if (_wizardStep > 1) { _wizardStep--; updateWizardStep(); }
  });

  document.querySelectorAll('.wizard-event-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.wizard-event-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _settings.event = btn.dataset.val;
    });
  });

  document.getElementById('min-score-slider')?.addEventListener('input', (e) => {
    _settings.minScore = Number(e.target.value);
    const lbl = document.getElementById('min-score-val');
    if (lbl) lbl.textContent = _settings.minScore;
  });

  document.querySelectorAll('.day-circle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const day = Number(btn.dataset.day);
      const idx = _settings.activeDays.indexOf(day);
      if (idx >= 0) { _settings.activeDays.splice(idx, 1); btn.classList.remove('active'); }
      else           { _settings.activeDays.push(day);      btn.classList.add('active');    }
    });
  });

  document.getElementById('save-notif-btn')?.addEventListener('click', async () => {
    saveSettings(_settings);
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        showToast('ההתראה נשמרה', 'success');
      } else if (perm === 'denied') {
        showToast('יש לאפשר התראות בהגדרות הדפדפן', 'error');
        // Rebuild step 4 to show denied-state message
        updateWizardStep();
      } else {
        showToast('ההגדרות נשמרו', 'success');
      }
    } else {
      showToast('ההגדרות נשמרו', 'success');
    }
  });

  document.querySelectorAll('.toggle[data-key]').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const key = toggle.dataset.key;
      _settings[key] = !_settings[key];
      toggle.classList.toggle('on',  _settings[key]);
      toggle.classList.toggle('off', !_settings[key]);
      saveSettings(_settings);
    });
  });

  document.getElementById('clear-cache-btn')?.addEventListener('click', () => {
    clearAll();
    showToast('המטמון נוקה', 'success');
  });

  document.getElementById('reset-location-btn')?.addEventListener('click', () => {
    clearLocation();
    showToast('המיקום אופס', 'info');
  });

  document.getElementById('clear-calibration-btn')?.addEventListener('click', () => {
    clearCalibration();
    showToast('נתוני הכיול נמחקו', 'info');
  });
}

function updateWizardStep() {
  for (let i = 1; i <= 4; i++) {
    const panel = document.getElementById(`wstep-${i}`);
    if (panel) panel.style.display = i === _wizardStep ? '' : 'none';
    const dot = document.getElementById(`wdot-${i}`);
    if (dot) dot.classList.toggle('active', _wizardStep >= i);
  }

  const backBtn = document.getElementById('wizard-back');
  const nextBtn = document.getElementById('wizard-next');
  if (backBtn) { backBtn.style.opacity = _wizardStep === 1 ? '0.3' : ''; backBtn.style.pointerEvents = _wizardStep === 1 ? 'none' : ''; }
  if (nextBtn) nextBtn.style.display = _wizardStep === 4 ? 'none' : '';

  if (_wizardStep === 4) {
    const panel = document.getElementById('wstep-4');
    if (panel) {
      const eventLabel = _settings.event === 'both' ? 'זריחה ושקיעה' : _settings.event === 'sunrise' ? 'זריחה' : 'שקיעה';
      const lines = panel.querySelectorAll('span');
      if (lines[0]) lines[0].textContent = eventLabel;
      if (lines[1]) lines[1].textContent = String(_settings.minScore);
      if (lines[2]) lines[2].textContent = `${_settings.activeDays.length} ימים`;
    }
  }
}

// ✎ fixed: step 4 — shows denied-state explanation when Notification.permission === 'denied'
// ✎ fixed: save-notif-btn handler — rebuilds step 4 after denial
// ✎ fixed: min-score-slider — aria-label added
// ✓ settings-screen.js — complete
