// ═══════════════════════════════════════════
//  TWILIGHT — app.js
//  Entry point: boot sequence, navigation wiring
// ═══════════════════════════════════════════

import { initNav, showScreen, onScreenChange } from './nav.js';
import { getGPS, saveLocation, loadLocation }  from './location.js';
import { fetchWeek, fetchCityName, fetchAirQuality, fetchWesternHorizon } from './api.js';
import { calcWeekData }                        from './score.js';
import { initMainScreen, showMainSkeleton }    from './main-screen.js';
import { initSpotsScreen }                     from './spots-screen.js';
import { initSettingsScreen }                  from './settings-screen.js';
import { showToast, showLoading }              from './ui.js';
import { registerSW }                          from './sw-register.js';
import { clearExpired, getCacheAge }           from './cache.js';
import { recordPrediction, fetchActualForDate, getUnfilledDates } from './calibration.js';
import { initInstallPrompt }                   from './install-prompt.js';

// ─────────────────────────────────────────
//  State
// ─────────────────────────────────────────
let _weekData            = null;
let _loc                 = null;
let _city                = '';
let _airQuality          = null;
let _spotsInitialized    = false;
let _isRefreshing        = false;

// ─────────────────────────────────────────
//  Boot
// ─────────────────────────────────────────
async function boot() {
  registerSW();
  clearExpired();
  initNav();
  initInstallPrompt();

  showMainSkeleton();
  showLoading(true);

  try {
    const saved = loadLocation();
    if (saved) {
      _loc  = saved;
      _city = saved.city || 'מיקומך';
    } else {
      _loc = await getGPS();
      if (_loc.isFallback) {
        showToast('לא ניתן לאתר מיקום — מציג תחזית לתל אביב', 'info');
      }
      _city = await fetchCityName(_loc.lat, _loc.lon);
      saveLocation(_loc.lat, _loc.lon, _city);
    }

    const [weather, airQ, westData] = await Promise.all([
      fetchWeek(_loc.lat, _loc.lon),
      fetchAirQuality(_loc.lat, _loc.lon).catch(() => null),
      fetchWesternHorizon(_loc.lat, _loc.lon).catch(() => null)
    ]);
    _airQuality = airQ;
    _weekData   = calcWeekData(weather, _airQuality, _loc.lat, _loc.lon, westData);

    await initMainScreen(_loc, _city, _weekData);

    // ─── Stale data warning ───
    const wCacheKey = `weather_${_loc.lat.toFixed(3)}_${_loc.lon.toFixed(3)}`;
    const ageMin    = getCacheAge(wCacheKey);
    if (ageMin !== null && ageMin > 360) {
      const ageH = Math.round(ageMin / 60);
      showToast(`הנתונים עדכניים מלפני ${ageH} שעות — משתמש במטמון`, 'info');
    }

    // ─── Dynamic theme-color ───
    updateThemeColor(_weekData);

    // ─── Calibration: record today's prediction ───
    if (_weekData[0]) {
      recordPrediction(
        _weekData[0].date,
        _weekData[0].score,
        _weekData[0],
        _loc.lat,
        _loc.lon
      );
    }

    // ─── Calibration: backfill actual data ───
    const unfilled = getUnfilledDates();
    if (unfilled.length > 0 && _loc) {
      const ssHour = parseInt(_weekData[0]?.sunset?.split(':')[0] || '18', 10);
      Promise.allSettled(
        unfilled.slice(0, 3).map(dt =>
          fetchActualForDate(dt, _loc.lat, _loc.lon, ssHour)
        )
      ).then(results => {
        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed > 0) console.warn(`[calibration] ${failed} backfill(s) failed`);
      });
    }

    if (saved && !saved.city) {
      fetchCityName(_loc.lat, _loc.lon)
        .then(city => {
          _city = city;
          saveLocation(_loc.lat, _loc.lon, city);
        })
        .catch(() => {});
    }

  } catch (err) {
    console.error('[boot] Failed:', err);
    showToast('שגיאה בטעינת נתונים. בדוק חיבור לאינטרנט.', 'error');
    await initMainScreen({ lat: 32.08, lon: 34.78 }, 'ישראל', []);
  } finally {
    showLoading(false);
  }

  // ─── Screen change handler ───
  onScreenChange(async (id) => {
    // FIX #13/#14: guard — do not switch to spots if data not ready or already initialised
    if (id === 'spots' && !_weekData) {
      showToast('תחזית עדיין נטענת, המתן רגע...', 'info');
      return;
    }

    if (id === 'spots') {
      // FIX #14: only re-init spots when not already initialised
      if (!_spotsInitialized) {
        _spotsInitialized = true;
        await initSpotsScreen(_weekData);
      }
    }

    if (id === 'settings') {
      initSettingsScreen();
    }
  });

  // ─── Global event listeners ───
  window.addEventListener('twilight:refresh',     handleRefresh);
  window.addEventListener('twilight:setLocation', handleSetLocation);
  window.addEventListener('twilight:toast', e => {
    showToast(e.detail?.msg || '', e.detail?.type || 'info');
  });

  // FIX #12/#13: single visibility listener with null guard
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // FIX #12: clear theme interval on page unload
  window.addEventListener('pagehide', () => {
    if (_themeInterval) {
      clearInterval(_themeInterval);
      _themeInterval = null;
    }
  });
}

// ─────────────────────────────────────────
//  Refresh handler
// ─────────────────────────────────────────
async function handleRefresh() {
  if (_isRefreshing) return;
  _isRefreshing = true;
  showLoading(true);

  try {
    const freshLoc = await getGPS();
    _loc  = freshLoc;
    _city = await fetchCityName(freshLoc.lat, freshLoc.lon);
    saveLocation(freshLoc.lat, freshLoc.lon, _city);

    const [weather, airQ, westData] = await Promise.all([
      fetchWeek(freshLoc.lat, freshLoc.lon),
      fetchAirQuality(freshLoc.lat, freshLoc.lon).catch(() => null),
      fetchWesternHorizon(freshLoc.lat, freshLoc.lon).catch(() => null)
    ]);
    _airQuality = airQ;
    _weekData   = calcWeekData(weather, _airQuality, freshLoc.lat, freshLoc.lon, westData);

    await initMainScreen(_loc, _city, _weekData);
    updateThemeColor(_weekData);
    showToast('נתונים עודכנו', 'success');

    // Reset spots so it re-initialises with fresh data on next visit
    _spotsInitialized = false;

  } catch (err) {
    console.error('[refresh]', err);
    showToast('עדכון נכשל', 'error');
  } finally {
    showLoading(false);
    _isRefreshing = false;
  }
}

// ─────────────────────────────────────────
//  Manual location handler
// ─────────────────────────────────────────
async function handleSetLocation(e) {
  const { lat, lon, city } = e.detail || {};
  if (!lat || !lon) return;
  if (_isRefreshing) return;

  _isRefreshing = true;
  showLoading(true);

  try {
    _loc  = { lat, lon };
    _city = city || 'מיקום מותאם';
    saveLocation(lat, lon, _city);

    const [weather, airQ, westData] = await Promise.all([
      fetchWeek(lat, lon),
      fetchAirQuality(lat, lon).catch(() => null),
      fetchWesternHorizon(lat, lon).catch(() => null)
    ]);
    _airQuality = airQ;
    _weekData   = calcWeekData(weather, _airQuality, lat, lon, westData);

    await initMainScreen(_loc, _city, _weekData);
    updateThemeColor(_weekData);
    showToast(`מיקום עודכן: ${_city}`, 'success');

    _spotsInitialized = false;

  } catch (err) {
    console.error('[setLocation]', err);
    showToast('עדכון מיקום נכשל', 'error');
  } finally {
    showLoading(false);
    _isRefreshing = false;
  }
}

// ─────────────────────────────────────────
//  Visibility change — auto-refresh if tab
//  was hidden for >30 min
// ─────────────────────────────────────────
let _lastVisible = Date.now();

function handleVisibilityChange() {
  if (document.hidden) {
    _lastVisible = Date.now();
  } else {
    const elapsed = Date.now() - _lastVisible;
    // FIX #13: guard — don't trigger refresh if already refreshing or data not yet loaded
    if (elapsed > 30 * 60 * 1000 && !_isRefreshing && _weekData) {
      handleRefresh();
    }
  }
}

// ─────────────────────────────────────────
//  Boot
// ─────────────────────────────────────────
boot();

// ─────────────────────────────────────────
//  Dynamic theme-color
// ─────────────────────────────────────────
// FIX #12: exported so pagehide can clear interval; _themeInterval declared at module scope
export let _themeInterval = null;

export function updateThemeColor(weekData) {
  if (_themeInterval) {
    clearInterval(_themeInterval);
    _themeInterval = null;
  }

  const apply = () => {
    const today = weekData?.[0];
    if (!today) return;

    const score = today.score || 5;
    const now   = new Date();
    const [ssH, ssM] = (today.sunset || '19:00').split(':').map(Number);
    const sunset  = new Date();
    sunset.setHours(ssH, ssM, 0, 0);
    const diffMin = (sunset - now) / 60000;

    let color;
    if (diffMin > 0 && diffMin <= 60) {
      if      (score >= 8) color = '#B84A00';
      else if (score >= 6) color = '#8B3A0E';
      else                 color = '#4A2208';
    } else if (diffMin < 0 && diffMin >= -40) {
      color = score >= 7 ? '#2A1060' : '#1A0840';
    } else if (now.getHours() >= 22 || now.getHours() < 5) {
      color = '#0D0608';
    } else {
      if      (score >= 8) color = '#5A2A0C';
      else if (score >= 6) color = '#4A2008';
      else                 color = '#3B1F08';
    }

    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', color);
  };

  apply();
  _themeInterval = setInterval(apply, 60000);
}

// ✎ fixed #12: pagehide clears _themeInterval — no leak
// ✎ fixed #13: handleVisibilityChange guards _isRefreshing + _weekData null
// ✎ fixed #14: _spotsInitialized flag now correctly gates initSpotsScreen
// ✓ app.js — complete