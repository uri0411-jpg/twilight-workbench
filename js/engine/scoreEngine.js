/**
 * TWILIGHT v2 — Piecewise Score Engine
 * ============================================================================
 * Selects one of three atmospheric models based on the dominant condition,
 * then computes a 0-100 "Sunset Quality" score via normalized features,
 * interaction terms, and a sigmoid activation.
 *
 * Model selection rationale:
 *   - CloudModel (clouds > 75%): heavy cloud cover is the dominant factor;
 *     the score hinges on whether clouds will "burn" (illuminate) or block.
 *   - DustModel (turbidity > 0.6): aerosol-dominated sky — vivid sun disk
 *     but compressed gradient.  Score rewards moderate dust, penalizes heavy.
 *   - ClearSkyModel (default): clean-air Rayleigh gradient — score rewards
 *     low turbidity, low humidity, and moderate solar elevation.
 */

import { computeScattering } from './physicsLayer.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const clamp = (v, min = 0, max = 1) => Math.min(Math.max(v, min), max);

/**
 * Standard logistic sigmoid: σ(x) = 1 / (1 + e^(−x)).
 * Maps any real-valued weighted sum → (0, 1).
 * We then scale to 0-100 for the final score.
 */
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/**
 * "Sweet-spot" curve — peaks at `center` and falls off symmetrically.
 * Modeled as a Gaussian bump: exp(−((x - center) / width)²).
 *
 * Used to reward intermediate cloud coverage (~35%) or moderate turbidity
 * where sunset aesthetics are empirically best.
 */
const sweetSpot = (x, center, width) =>
  Math.exp(-Math.pow((x - center) / width, 2));

// ─── Cloud Model ────────────────────────────────────────────────────────────

/**
 * When clouds dominate (> 75% coverage), the question is:
 *   "Will the clouds light up, or just block the sun?"
 *
 * Key factors:
 *   1. Cloud height — HIGH clouds (cirrus, altocumulus) catch light long
 *      after sunset because they're 6-12 km up; LOW clouds (stratus) block
 *      light and go grey quickly.
 *   2. Cloud gaps — even 75%+ coverage can produce spectacular sunsets if
 *      there are gaps near the horizon letting light through underneath.
 *   3. Cloud texture / variation — uniform overcast = dull; broken layers
 *      with varying thickness = dramatic light/shadow.
 *
 * Weights (heuristic, derived from photographer consensus & scattering theory):
 *   - cloudHeight:   +3.0  (high clouds are the #1 predictor of "burn")
 *   - horizonGap:    +2.5  (light must reach clouds from below)
 *   - coverage sweet: +1.5  (75-85% is better than 100% — some sky shows)
 *   - clarity:       +1.0  (cleaner air below clouds = more vivid light)
 *   - bias:          -3.0  (heavy clouds default to poor without redeeming factors)
 */
function cloudModel({ clouds, cloudHeightCategory, horizonClearance, physics }) {
  // Cloud height encoded: high=1.0, mid=0.5, low=0.15
  const heightMap = { high: 1.0, mid: 0.5, low: 0.15 };
  const heightScore = heightMap[cloudHeightCategory] ?? 0.5;

  // Horizon clearance: fraction of horizon (0-15° elevation) that is clear.
  // Even a thin gap lets golden light flood underneath the cloud deck.
  const gapScore = clamp(horizonClearance ?? 0.3);

  // Coverage sweet-spot: 75-85% is optimal for heavy-cloud sunsets.
  // At 100% with no gaps, there's nothing to see.
  const coverageSweet = sweetSpot(clouds, 0.80, 0.15);

  const features = {
    cloudHeight:    { value: heightScore,               weight: 3.0  },
    horizonGap:     { value: gapScore,                  weight: 2.5  },
    coverageSweet:  { value: coverageSweet,             weight: 1.5  },
    clarity:        { value: physics.atmosphericClarity, weight: 1.0  },
  };

  const bias = -3.0;
  let rawSum = bias;
  for (const f of Object.values(features)) {
    f.contribution = f.value * f.weight;
    rawSum += f.contribution;
  }

  const score = sigmoid(rawSum) * 100;
  return { score, model: 'CloudModel', features, rawSum };
}

// ─── Dust Model ─────────────────────────────────────────────────────────────

/**
 * When aerosols dominate (turbidity > 0.6), the sunset becomes about the
 * sun disk itself — a vivid red/orange orb — rather than the sky gradient.
 *
 * Moderate dust (turbidity 0.4–0.7) produces the most photogenic results:
 *   - Enough scattering to deepen the red/orange coloring
 *   - Not so much that the sun is obscured or the sky is uniformly grey
 *
 * Extreme dust (turbidity > 0.85) is penalized because:
 *   - The sun disk dims to a dull red blob
 *   - No sky gradient at all — just murky haze
 *   - Often associated with health-hazard conditions
 *
 * Weights:
 *   - mieIntensity sweet: +2.5  (moderate Mie = vivid disk)
 *   - rayleighSpread:     +1.5  (any remaining gradient is a bonus)
 *   - humidity penalty:   -1.0  (humid haze kills contrast)
 *   - dustHumidity interaction: -1.5 (the worst combo for aesthetics)
 *   - bias: -1.5
 */
function dustModel({ turbidity, humidity, physics }) {
  const humNorm = clamp((humidity ?? 50) / 100);

  // Mie sweet-spot: peaks around mieIntensity=0.55 — enough color,
  // not enough to obscure.
  const mieSweetSpot = sweetSpot(physics.mieIntensity, 0.55, 0.25);

  const features = {
    mieSweet:       { value: mieSweetSpot,               weight: 2.5  },
    rayleighSpread: { value: physics.rayleighSpread,      weight: 1.5  },
    humidityPenalty:{ value: humNorm,                     weight: -1.0 },
    dustHumInteract:{ value: physics.contributions.dustHumidityInteraction ?? 0, weight: -1.5 },
  };

  const bias = -1.5;
  let rawSum = bias;
  for (const f of Object.values(features)) {
    f.contribution = f.value * f.weight;
    rawSum += f.contribution;
  }

  const score = sigmoid(rawSum) * 100;
  return { score, model: 'DustModel', features, rawSum };
}

// ─── Clear Sky Model ────────────────────────────────────────────────────────

/**
 * Clean air, few clouds — the classic Rayleigh sunset.
 *
 * Beauty comes from the broad gradient: warm horizon → pink → purple → blue
 * overhead.  This requires:
 *   - Very clean air (high Rayleigh spread)
 *   - Low to moderate clouds that add texture without blocking
 *   - Solar elevation in the "golden" zone (0-10°)
 *
 * The optimal clear-sky sunset has turbidity < 0.25 and thin cirrus wisps
 * (5-20% coverage) that catch color without occluding.
 *
 * Weights:
 *   - rayleighSpread:   +3.5  (this IS the show in clear-sky mode)
 *   - clarity:          +2.0  (Beer-Lambert transmittance)
 *   - cloudAccent:      +1.5  (a few clouds add drama)
 *   - solarElevSweet:   +1.0  (peak color at 2-5° above horizon)
 *   - bias: -2.5
 */
function clearSkyModel({ clouds, solarElevation, physics }) {
  // A small amount of cloud (10-25%) adds visual interest to an otherwise
  // plain gradient.  This is the photographer's "scattered cirrus" bonus.
  const cloudAccent = sweetSpot(clouds, 0.18, 0.15);

  // Solar elevation sweet-spot: 2-5° above horizon produces the deepest
  // Rayleigh colors.  Below 0° the direct light is gone (post-sunset glow
  // is handled by goldenWindow).  Above 10° colors are too weak.
  const elevSweet = sweetSpot(solarElevation, 3, 5);

  const features = {
    rayleighSpread: { value: physics.rayleighSpread,      weight: 3.5  },
    clarity:        { value: physics.atmosphericClarity,   weight: 2.0  },
    cloudAccent:    { value: cloudAccent,                  weight: 1.5  },
    solarElevSweet: { value: elevSweet,                    weight: 1.0  },
  };

  const bias = -2.5;
  let rawSum = bias;
  for (const f of Object.values(features)) {
    f.contribution = f.value * f.weight;
    rawSum += f.contribution;
  }

  const score = sigmoid(rawSum) * 100;
  return { score, model: 'ClearSkyModel', features, rawSum };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Compute the sunset quality score.
 *
 * @param {Object} params
 * @param {number} params.clouds              – Cloud coverage fraction, 0-1
 * @param {string} params.cloudHeightCategory – 'high' | 'mid' | 'low'
 * @param {number} params.horizonClearance    – Fraction of horizon that is clear, 0-1
 * @param {number} params.dust                – Dust concentration (µg/m³)
 * @param {number} params.humidity            – Relative humidity (%)
 * @param {number} params.visibility          – Visibility (km)
 * @param {number} params.aqi                 – Air Quality Index
 * @param {number} params.solarElevation      – Solar elevation (degrees)
 *
 * @returns {{
 *   score: number,           // 0-100 sunset quality
 *   model: string,           // which model was selected
 *   features: Object,        // per-feature breakdown
 *   rawSum: number,          // pre-sigmoid weighted sum
 *   physics: Object          // full physics layer output
 * }}
 */
export function computeScore({
  clouds = 0.3,
  cloudHeightCategory = 'mid',
  horizonClearance = 0.5,
  dust = null,
  humidity = null,
  visibility = null,
  aqi = null,
  solarElevation = 5,
} = {}) {
  // Step 1: Run the physics layer
  const physics = computeScattering({ dust, humidity, visibility, aqi, solarElevation });

  // Step 2: Select model based on dominant condition
  //
  // Priority order matters: clouds trump dust because even in dusty conditions,
  // heavy cloud cover is the primary determinant.  Dust only matters when
  // you can actually see the sky.
  let result;

  if (clouds > 0.75) {
    result = cloudModel({ clouds, cloudHeightCategory, horizonClearance, physics });
  } else if (physics.turbidity > 0.6) {
    result = dustModel({ turbidity: physics.turbidity, humidity, physics });
  } else {
    result = clearSkyModel({ clouds, solarElevation, physics });
  }

  result.physics = physics;
  return result;
}

/**
 * Debug helper — returns a structured contribution breakdown for the
 * Debug Panel.  Each entry shows the feature name, its normalized value,
 * weight, and absolute contribution to the pre-sigmoid sum.
 */
export function getContribution(scoreResult) {
  const lines = [
    `Model: ${scoreResult.model}`,
    `Raw sum (pre-sigmoid): ${scoreResult.rawSum.toFixed(4)}`,
    `Final score: ${scoreResult.score.toFixed(1)} / 100`,
    ``,
    `Feature contributions:`,
  ];

  for (const [name, f] of Object.entries(scoreResult.features)) {
    const pct = ((Math.abs(f.contribution) / Math.max(Math.abs(scoreResult.rawSum), 0.001)) * 100).toFixed(1);
    lines.push(
      `  ${name.padEnd(20)} value=${f.value.toFixed(3)}  ` +
      `weight=${f.weight >= 0 ? '+' : ''}${f.weight.toFixed(1)}  ` +
      `contrib=${f.contribution >= 0 ? '+' : ''}${f.contribution.toFixed(4)}  (${pct}%)`
    );
  }

  return lines.join('\n');
}
