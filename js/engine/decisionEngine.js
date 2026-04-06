/**
 * TWILIGHT v2 — Decision & Confidence Engine
 * ============================================================================
 * Integrates the score, golden window, and logistical constraints into a
 * final Go/No-Go recommendation with a confidence interval.
 *
 * The core insight: a great sunset forecast is useless if you can't get
 * there in time, or if the forecast data is unreliable.  This engine
 * computes:
 *   1. Confidence — how much should we trust the score?
 *   2. Utility — score × confidence − travel penalty
 *   3. Decision — YES / MAYBE / NO with a human-readable explanation
 */

import { computeScore, getContribution as getScoreContribution } from './scoreEngine.js';
import { predictGoldenWindow, getContribution as getWindowContribution } from './goldenWindow.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const clamp = (v, min = 0, max = 1) => Math.min(Math.max(v, min), max);

// ─── Confidence Calculation ─────────────────────────────────────────────────

/**
 * Calculate forecast confidence based on data quality and stability.
 *
 * Two dimensions:
 *   1. Data completeness — how many input fields are non-null?
 *      Missing data forces the physics/score layers to use fallbacks,
 *      which reduces prediction accuracy.
 *   2. Forecast stability — how much has the forecast changed between
 *      the last N updates?  High variance = low confidence.
 *
 * @param {Object} params
 * @param {Object} params.currentData    – Current weather data object
 * @param {Array}  [params.forecastHistory] – Array of past forecast snapshots
 *                                            (most recent first)
 * @param {number} [params.forecastAgeMinutes] – How old is the forecast data?
 *
 * @returns {{ confidence: number, completeness: number, stability: number,
 *             freshness: number, contributions: Object }}
 */
export function calculateConfidence({
  currentData = {},
  forecastHistory = [],
  forecastAgeMinutes = 0,
} = {}) {
  // ── Completeness (0-1) ────────────────────────────────────────────────
  // Each field contributes to our ability to make an accurate prediction.
  // We weight fields by their importance to the score calculation.
  const fields = {
    clouds:              { present: currentData.clouds != null,             weight: 0.20 },
    cloudHeightCategory: { present: currentData.cloudHeightCategory != null, weight: 0.10 },
    dust:                { present: currentData.dust != null,               weight: 0.15 },
    humidity:            { present: currentData.humidity != null,           weight: 0.10 },
    visibility:          { present: currentData.visibility != null,         weight: 0.15 },
    aqi:                 { present: currentData.aqi != null,               weight: 0.10 },
    solarElevation:      { present: currentData.solarElevation != null,    weight: 0.15 },
    sunsetTime:          { present: currentData.sunsetTime != null,        weight: 0.05 },
  };

  let completenessNum = 0;
  let completenessDen = 0;
  for (const f of Object.values(fields)) {
    if (f.present) completenessNum += f.weight;
    completenessDen += f.weight;
  }
  const completeness = completenessDen > 0 ? completenessNum / completenessDen : 0;

  // ── Stability (0-1) ──────────────────────────────────────────────────
  // Compare the current score prediction against recent history.
  // High variance in predictions = atmosphere is unstable or model is
  // oscillating = lower confidence.
  //
  // We measure variance in the score over the last few updates.
  // If no history, we assume moderate stability (0.7).
  let stability = 0.7; // default when no history

  if (forecastHistory.length >= 2) {
    const scores = forecastHistory
      .slice(0, 5)  // last 5 updates
      .map((h) => h.score ?? 50);

    if (currentData._lastScore != null) {
      scores.unshift(currentData._lastScore);
    }

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((a, s) => a + Math.pow(s - mean, 2), 0) / scores.length;

    // Normalize variance: stdev of 20 points (out of 100) → stability ≈ 0.
    // stdev of 0 → stability = 1.
    const stdev = Math.sqrt(variance);
    stability = clamp(1 - stdev / 20);
  }

  // ── Freshness (0-1) ──────────────────────────────────────────────────
  // Forecast data degrades with age.  Weather can change significantly
  // in 60+ minutes, especially cloud cover.
  //
  // Half-life model: freshness = 2^(−age / halfLife)
  // halfLife = 45 minutes — after 45 min, confidence from freshness drops 50%.
  const halfLife = 45;
  const freshness = Math.pow(2, -forecastAgeMinutes / halfLife);

  // ── Composite Confidence ──────────────────────────────────────────────
  // Multiplicative combination: each factor can independently tank confidence.
  // This is intentional — incomplete AND stale AND unstable data should
  // result in very low confidence, not just moderately low.
  const confidence = clamp(completeness * stability * freshness);

  return {
    confidence,
    completeness,
    stability,
    freshness,
    contributions: { fields, forecastAgeMinutes },
  };
}

// ─── Decision Logic ─────────────────────────────────────────────────────────

/**
 * The main decision function — integrates everything into a Go/No-Go.
 *
 * @param {Object} params
 * @param {Object} params.weatherData         – Raw weather inputs
 * @param {number} params.travelTimeMinutes   – Estimated travel time to spot
 * @param {number} [params.bufferMinutes=10]  – Safety buffer (setup time, parking)
 * @param {Array}  [params.forecastHistory]    – Past forecast snapshots
 * @param {number} [params.forecastAgeMinutes] – Age of current forecast
 * @param {number} [params.latitude=40]       – Observer latitude
 *
 * @returns {{
 *   decision: 'YES' | 'MAYBE' | 'NO',
 *   reason: string,
 *   visualIntensity: number,
 *   humanReadableInsight: string,
 *   utility: number,
 *   score: number,
 *   confidence: number,
 *   goldenWindow: Object,
 *   scoreBreakdown: Object,
 *   confidenceBreakdown: Object
 * }}
 */
export function decide({
  weatherData = {},
  travelTimeMinutes = 0,
  bufferMinutes = 10,
  forecastHistory = [],
  forecastAgeMinutes = 0,
  latitude = 40,
} = {}) {
  // ── Step 1: Compute score ─────────────────────────────────────────────
  const scoreResult = computeScore({
    clouds: weatherData.clouds,
    cloudHeightCategory: weatherData.cloudHeightCategory,
    horizonClearance: weatherData.horizonClearance,
    dust: weatherData.dust,
    humidity: weatherData.humidity,
    visibility: weatherData.visibility,
    aqi: weatherData.aqi,
    solarElevation: weatherData.solarElevation,
  });

  const score = scoreResult.score;

  // ── Step 2: Compute golden window ─────────────────────────────────────
  const goldenWindow = predictGoldenWindow({
    sunsetTime: weatherData.sunsetTime ?? new Date(),
    solarElevation: weatherData.solarElevation,
    cloudHeightCategory: weatherData.cloudHeightCategory,
    turbidity: scoreResult.physics.turbidity,
    latitude,
    clouds: weatherData.clouds,
  });

  // ── Step 3: Compute confidence ────────────────────────────────────────
  const confidenceResult = calculateConfidence({
    currentData: { ...weatherData, _lastScore: score },
    forecastHistory,
    forecastAgeMinutes,
  });

  const confidence = confidenceResult.confidence;

  // ── Step 4: Hard constraint — can we make it in time? ─────────────────
  //
  // We need to arrive at windowStart, not at peakTime, to catch the
  // full show.  The constraint is:
  //   now + travelTime + buffer ≤ windowStart
  const now = new Date();
  const arrivalTime = new Date(now.getTime() + (travelTimeMinutes + bufferMinutes) * 60000);
  const timeToPeak = (goldenWindow.peakTime - now) / 60000; // minutes
  const timeToWindowStart = (goldenWindow.windowStart - now) / 60000;
  const tooLate = arrivalTime > goldenWindow.peakTime;
  const willMissStart = arrivalTime > goldenWindow.windowStart;

  // ── Step 5: Calculate utility ─────────────────────────────────────────
  //
  // Utility = (Score × Confidence) − Travel_Time_Penalty
  //
  // Travel time penalty: each minute of travel reduces utility.
  // The penalty accelerates as travel time approaches the window —
  // a 30-min drive for a 40-min window is much worse than a 30-min drive
  // for a 90-min window.
  //
  // Penalty = travelTime × (travelTime / windowDuration) × 0.5
  // Capped at 30 to prevent extreme values from dominating.
  const windowDuration = Math.max(goldenWindow.duration, 1);
  const travelPenalty = Math.min(
    30,
    travelTimeMinutes * (travelTimeMinutes / windowDuration) * 0.5
  );

  const utility = (score * confidence) - travelPenalty;

  // ── Step 6: Decision thresholds ───────────────────────────────────────
  //
  // These thresholds are calibrated so that:
  //   - YES: high enough quality × confidence to justify going out
  //   - MAYBE: worth watching from wherever you are, or go if nearby
  //   - NO: not worth the effort
  //
  // The tooLate hard constraint overrides everything.

  let decision;
  let reason;

  if (tooLate) {
    decision = 'NO';
    reason = `Too late — you would arrive ${Math.round(arrivalTime - goldenWindow.peakTime) / 60000} min after peak.`;
  } else if (utility >= 55) {
    decision = 'YES';
    reason = willMissStart
      ? "Go now — you'll miss the opening but catch the peak."
      : 'Conditions look great. Go.';
  } else if (utility >= 30) {
    decision = 'MAYBE';
    reason = confidence < 0.5
      ? 'Forecast is uncertain — could be good, watch for updates.'
      : 'Decent conditions. Worth it if you are nearby.';
  } else {
    decision = 'NO';
    reason = score < 30
      ? 'Conditions are poor — overcast or heavily hazy.'
      : 'Not worth the travel for this forecast.';
  }

  // ── Step 7: Visual intensity (0-100) ──────────────────────────────────
  //
  // Visual intensity is the score WITHOUT confidence or logistics.
  // It answers: "If the forecast is right, how good would it look?"
  const visualIntensity = Math.round(score);

  // ── Step 8: Human-readable insight ────────────────────────────────────
  const insight = generateInsight(scoreResult, goldenWindow, confidence);

  return {
    decision,
    reason,
    visualIntensity,
    humanReadableInsight: insight,
    utility: Math.round(utility * 10) / 10,
    score: Math.round(score * 10) / 10,
    confidence: Math.round(confidence * 100) / 100,
    goldenWindow,
    scoreBreakdown: scoreResult,
    confidenceBreakdown: confidenceResult,
  };
}

// ─── Insight Generation ─────────────────────────────────────────────────────

/**
 * Translate the model outputs into a sentence a photographer would find
 * useful.  Avoids generic language — each model produces distinct insights.
 */
function generateInsight(scoreResult, goldenWindow, confidence) {
  const { model, physics } = scoreResult;
  const { turbidity, mieIntensity, rayleighSpread } = physics;
  const peakOffset = goldenWindow.peakOffsetMinutes;

  const parts = [];

  // Model-specific color prediction
  switch (model) {
    case 'CloudModel':
      if (scoreResult.features.cloudHeight?.value > 0.7) {
        parts.push('High clouds should light up with intense color.');
      } else if (scoreResult.features.horizonGap?.value > 0.5) {
        parts.push('Gaps near the horizon may let light flood beneath the cloud deck.');
      } else {
        parts.push('Heavy cloud cover with limited gaps — expect muted colors.');
      }
      break;

    case 'DustModel':
      if (mieIntensity > 0.5) {
        parts.push('Expect a vivid red/orange sun disk against a hazy sky.');
      } else {
        parts.push('Moderate aerosols may produce warm horizon tones.');
      }
      break;

    case 'ClearSkyModel':
      if (rayleighSpread > 0.7) {
        parts.push('Clean air — look for a wide gradient from gold to pink to purple.');
      } else {
        parts.push('Mostly clear with some atmospheric haze softening the gradient.');
      }
      break;
  }

  // Timing insight
  if (peakOffset > 10) {
    parts.push(`Peak color expected ~${Math.round(peakOffset)} min after sunset — stay patient.`);
  } else if (peakOffset > 0) {
    parts.push(`Best light ~${Math.round(peakOffset)} min after sunset.`);
  }

  // Confidence caveat
  if (confidence < 0.4) {
    parts.push('⚠ Forecast confidence is low — conditions may differ.');
  }

  return parts.join(' ');
}

// ─── Debug API ──────────────────────────────────────────────────────────────

/**
 * Full decomposition for the Debug Panel.
 */
export function getContribution(decisionResult) {
  const lines = [
    `═══ DECISION: ${decisionResult.decision} ═══`,
    `Reason: ${decisionResult.reason}`,
    ``,
    `Utility: ${decisionResult.utility}  (score=${decisionResult.score} × confidence=${decisionResult.confidence} − travel_penalty)`,
    `Visual Intensity: ${decisionResult.visualIntensity}/100`,
    ``,
    `── Score Breakdown ──`,
    getScoreContribution(decisionResult.scoreBreakdown),
    ``,
    `── Golden Window ──`,
    getWindowContribution(decisionResult.goldenWindow),
    ``,
    `── Confidence ──`,
    `  Completeness: ${(decisionResult.confidenceBreakdown.completeness * 100).toFixed(1)}%`,
    `  Stability:    ${(decisionResult.confidenceBreakdown.stability * 100).toFixed(1)}%`,
    `  Freshness:    ${(decisionResult.confidenceBreakdown.freshness * 100).toFixed(1)}%`,
    `  Composite:    ${(decisionResult.confidence * 100).toFixed(1)}%`,
    ``,
    `Insight: ${decisionResult.humanReadableInsight}`,
  ];

  return lines.join('\n');
}
