// ═══════════════════════════════════════════
//  TWILIGHT — calibration.js
//  Self-calibrating scoring: auto ground-truth + user ratings
//  Stores daily {predicted, actual, userRating} in localStorage
//  After 14+ entries, computes bias correction
// ═══════════════════════════════════════════

import { CALIBRATION_KEY, CALIBRATION_MIN_DAYS, OPEN_METEO_HIST_URL, SEASONAL_BASELINE } from './config.js';

const MAX_ENTRIES = 90; // keep last 90 days

// ─── Location bucket ───────────────────────
function getLocBucket(lat, lon) {
  if (!lat || !lon) return 'central';
  if (lon < 34.6) return 'coast';
  if (lon > 35.2) return 'east';
  if (lat > 33.0) return 'north';
  return 'central';
}

// ─── Bias cache (60 s TTL) ─────────────────
let _biasCache = null;
let _biasCacheKey = '';
let _biasCacheTime = 0;

// ─────────────────────────────────────────
//  Load / save calibration data
// ─────────────────────────────────────────
function loadCalibration() {
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveCalibration(entries) {
  try {
    // Keep only last MAX_ENTRIES
    const trimmed = entries.slice(-MAX_ENTRIES);
    localStorage.setItem(CALIBRATION_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('[calibration] save failed:', e);
  }
}

// ─────────────────────────────────────────
//  Record today's predicted score
//  Called at sunset time (or after boot if sunset passed)
// ─────────────────────────────────────────
export function recordPrediction(date, predictedScore, params, lat, lon) {
  const entries = loadCalibration();
  // Don't duplicate same date
  if (entries.find(e => e.date === date)) return;
  entries.push({
    date,
    predicted: predictedScore,
    locBucket: getLocBucket(lat, lon),
    params: {
      clouds: params._cloudRaw,
      humidity: params._humidityRaw,
      visibility: params._visibilityRaw,
      wind: params._windRaw,
    },
    actual: null,      // filled later by fetchActual
    userRating: null,  // filled by user
    ts: Date.now()
  });
  _biasCache = null; // invalidate cache
  saveCalibration(entries);
}

// ─────────────────────────────────────────
//  Record user rating (1-10)
// ─────────────────────────────────────────
export function recordUserRating(date, rating) {
  const entries = loadCalibration();
  const entry = entries.find(e => e.date === date);
  if (entry) {
    entry.userRating = Math.max(1, Math.min(10, Math.round(rating)));
    saveCalibration(entries);
    return true;
  }
  return false;
}

// ─────────────────────────────────────────
//  Fetch actual conditions from Open-Meteo Historical
//  Called ~1 hour after sunset for yesterday's entry
//  Gets actual cloud cover + visibility at sunset hour
// ─────────────────────────────────────────
export async function fetchActualForDate(date, lat, lon, sunsetHour) {
  const entries = loadCalibration();
  const entry = entries.find(e => e.date === date);
  if (!entry || entry.actual !== null) return; // already filled or not found

  try {
    const params = new URLSearchParams({
      latitude: lat, longitude: lon,
      start_date: date, end_date: date,
      timezone: 'Asia/Jerusalem',
      hourly: 'cloudcover,visibility,relativehumidity_2m,precipitation'
    });

    const res = await fetch(`${OPEN_METEO_HIST_URL}?${params}`);
    if (!res.ok) return;
    const data = await res.json();

    // Find the sunset hour index
    const h = data.hourly;
    if (!h?.time) return;
    const targetHour = String(sunsetHour).padStart(2, '0');
    const idx = h.time.findIndex(t => t.includes(`T${targetHour}:`));
    if (idx < 0) return;

    entry.actual = {
      clouds:     h.cloudcover?.[idx] ?? null,
      visibility: h.visibility?.[idx] ? h.visibility[idx] / 1000 : null,
      humidity:   h.relativehumidity_2m?.[idx] ?? null,
      rain:       h.precipitation?.[idx] ?? 0,
    };
    saveCalibration(entries);
    console.log(`[calibration] Actual data recorded for ${date}`);
  } catch (e) {
    console.warn('[calibration] fetchActual failed:', e.message);
  }
}

// ─────────────────────────────────────────
//  Calculate bias correction
//  Returns a number to subtract from raw score
//  Positive bias = scores are too high → subtract
//  Negative bias = scores are too low → add
// ─────────────────────────────────────────
export function getBiasCorrection(lat, lon) {
  const bucket = getLocBucket(lat, lon);
  const cacheKey = bucket;
  const now = Date.now();
  if (_biasCache && cacheKey === _biasCacheKey && (now - _biasCacheTime) < 60000) {
    return _biasCache;
  }

  const allEntries = loadCalibration();
  // Prefer same-bucket entries; fall back to all if not enough
  let entries = allEntries.filter(e => e.locBucket === bucket);
  if (entries.length < CALIBRATION_MIN_DAYS) entries = allEntries;

  // Need minimum entries with actual data
  const withActual = entries.filter(e => e.actual !== null);
  if (withActual.length < CALIBRATION_MIN_DAYS) {
    return { bias: 0, confidence: 0, sampleSize: withActual.length };
  }

  // Compare predicted cloud cover vs actual cloud cover
  // If predicted was consistently lower → we over-scored (positive bias)
  let cloudBiasSum = 0;
  let visBiasSum = 0;
  let count = 0;

  for (const e of withActual) {
    if (e.actual.clouds != null && e.params?.clouds != null) {
      // More clouds than predicted = we were too optimistic
      cloudBiasSum += (e.actual.clouds - e.params.clouds);
      count++;
    }
    if (e.actual.visibility != null && e.params?.visibility != null) {
      // Less visibility than predicted = we were too optimistic
      visBiasSum += (e.params.visibility - e.actual.visibility);
    }
  }

  if (count === 0) return { bias: 0, confidence: 0, sampleSize: 0 };

  const avgCloudBias = cloudBiasSum / count; // positive = actual cloudier
  const avgVisBias   = visBiasSum / count;   // positive = actual less visible

  // Convert to score bias: +10% actual clouds ≈ -0.5 score points
  const scoreBias = (avgCloudBias / 20) + (avgVisBias / 15);

  // Also factor in user ratings if available
  const withRating = entries.filter(e => e.userRating != null);
  let userBias = 0;
  if (withRating.length >= 5) {
    const avgPredicted = withRating.reduce((s, e) => s + e.predicted, 0) / withRating.length;
    const avgRated     = withRating.reduce((s, e) => s + e.userRating, 0) / withRating.length;
    userBias = avgPredicted - avgRated; // positive = over-scoring
  }

  // Blend: 70% auto, 30% user (if available)
  const finalBias = withRating.length >= 5
    ? scoreBias * 0.7 + userBias * 0.3
    : scoreBias;

  // Clamp to reasonable range
  const clampedBias = Math.max(-2, Math.min(3, finalBias));

  const confidence = Math.min(1, withActual.length / 30); // 0–1

  const result = {
    bias: Math.round(clampedBias * 10) / 10,
    confidence,
    sampleSize: withActual.length,
    userSamples: withRating.length
  };
  _biasCache = result;
  _biasCacheKey = cacheKey;
  _biasCacheTime = now;
  return result;
}

// ─────────────────────────────────────────
//  Dynamic seasonal baseline from calibration history
//  Returns adjusted baseline for the month if 7+ actual entries exist,
//  otherwise returns null (caller falls back to static config)
// ─────────────────────────────────────────
export function getDynamicSeasonalBaseline(month) {
  try {
    const entries = loadCalibration();
    const monthEntries = entries.filter(e => {
      if (!e.actual || !e.date) return false;
      const m = new Date(e.date + 'T12:00:00').getMonth() + 1;
      return Math.abs(m - month) <= 1; // include adjacent months
    });
    if (monthEntries.length < 7) return null;

    const avgClouds = monthEntries.reduce((s, e) => s + (e.actual.clouds ?? 50), 0) / monthEntries.length;
    const avgVis    = monthEntries.reduce((s, e) => s + (e.actual.visibility ?? 10), 0) / monthEntries.length;
    const avgHum    = monthEntries.reduce((s, e) => s + (e.actual.humidity ?? 50), 0) / monthEntries.length;

    const staticBase = SEASONAL_BASELINE[month] || SEASONAL_BASELINE[6];
    // Blend 60% dynamic, 40% static so outlier months don't dominate
    return {
      clouds:     Math.round(avgClouds * 0.6 + staticBase.clouds * 0.4),
      visibility: Math.round((avgVis  * 0.6 + staticBase.visibility * 0.4) * 10) / 10,
      humidity:   Math.round(avgHum   * 0.6 + staticBase.humidity * 0.4),
      wind:       staticBase.wind,
      dust:       staticBase.dust,
    };
  } catch { return null; }
}

// ─────────────────────────────────────────
//  Calibration stats for settings display
//  Returns {entries, bias, confidence, trend}
// ─────────────────────────────────────────
export function getCalibrationStats() {
  const entries = loadCalibration();
  const paired  = entries.filter(e => e.actual !== null && e.predicted != null).slice(-20);
  // L5 FIX: getBiasCorrection needs lat/lon; load last known location from localStorage
  let _statLat, _statLon;
  try {
    const saved = JSON.parse(localStorage.getItem('twl_location') || '{}');
    _statLat = saved.lat; _statLon = saved.lon;
  } catch { /* ignore */ }
  const { bias, confidence, sampleSize, userSamples } = getBiasCorrection(_statLat, _statLon);

  // B2 FIX: Trend — compare predicted score vs ground truth (user rating or cloud-derived estimate)
  // Previous code always subtracted predicted from itself → always 0
  const recent = paired.slice(-7);
  const older  = paired.slice(-14, -7);
  let trend = 'neutral';
  const truthScore = (e) => {
    // User rating is best ground truth; fall back to cloud-cover-derived estimate
    if (e.actual != null) return e.actual; // userRating already stored as 'actual' in paired
    return null;
  };
  if (recent.length >= 3 && older.length >= 3) {
    const avgErr = (arr) => {
      const valid = arr.filter(e => truthScore(e) != null);
      if (!valid.length) return 0;
      return valid.reduce((s, e) => s + Math.abs(e.predicted - truthScore(e)), 0) / valid.length;
    };
    const recentErr = avgErr(recent);
    const olderErr  = avgErr(older);
    if (recentErr < olderErr - 0.3)  trend = 'improving';
    else if (recentErr > olderErr + 0.3) trend = 'worsening';
  }

  return {
    entries: paired.map(e => ({
      date:       e.date,
      predicted:  e.predicted,
      actual:     e.userRating ?? null,
      hasActual:  e.actual !== null,
    })),
    bias,
    confidence: Math.round(confidence * 100),
    sampleSize,
    userSamples,
    trend,
  };
}

// ─────────────────────────────────────────
//  Check if yesterday needs actual data fetched
// ─────────────────────────────────────────
export function getUnfilledDates() {
  const entries = loadCalibration();
  return entries
    .filter(e => e.actual === null)
    .filter(e => {
      // Only try dates that are at least 2 hours old
      const age = Date.now() - e.ts;
      return age > 2 * 60 * 60 * 1000;
    })
    .map(e => e.date);
}

// ─────────────────────────────────────────
//  Clear all calibration data
// ─────────────────────────────────────────
export function clearCalibration() {
  try {
    localStorage.removeItem(CALIBRATION_KEY);
    _biasCache = null; // invalidate cache
  } catch (e) {
    console.warn('[calibration] clearCalibration failed:', e);
  }
}

// ─────────────────────────────────────────
//  Crowdsourced cLow penalty adjustment
//  Analyses entries where cLow was high (>50%) vs user ratings.
//  If users consistently rated such days higher than predicted,
//  we return a multiplier < 1 to soften the cloud-low penalty.
//  Returns a multiplier in range [0.60, 1.40].
// ─────────────────────────────────────────
export function getCloudPenaltyAdjustment(lat, lon) {
  try {
    const allEntries = loadCalibration();
    const bucket = lat && lon ? (Math.abs(lon - 34.8) < 0.5 ? 'coast' : 'inland') : 'all';

    // Find entries with high cLow AND user rating available
    const relevant = allEntries.filter(e =>
      e.params?.clouds > 40       // cloudy day
      && e.userRating != null     // user rated it
      && e.predicted != null
    );
    if (relevant.length < 5) return 1.0; // not enough data

    // Compare predicted vs user rating on cloudy days
    const avgPred   = relevant.reduce((s, e) => s + e.predicted, 0) / relevant.length;
    const avgRated  = relevant.reduce((s, e) => s + e.userRating, 0) / relevant.length;
    const cloudBias = avgPred - avgRated; // positive = over-penalising clouds

    // Convert score bias to a multiplier on the cLo penalty:
    // Over-predicted by 1 point → reduce penalty by ~10% (mult 0.90)
    // Under-predicted by 1 point → increase penalty by ~10% (mult 1.10)
    const mult = 1.0 - cloudBias * 0.10;
    return Math.max(0.60, Math.min(1.40, Math.round(mult * 100) / 100));
  } catch { return 1.0; }
}

// ─────────────────────────────────────────
//  Has user already rated today?
// ─────────────────────────────────────────
export function hasRatedToday(date) {
  const entries = loadCalibration();
  const entry = entries.find(e => e.date === date);
  return entry?.userRating != null;
}

// ✓ calibration.js — complete
