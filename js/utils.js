// ═══════════════════════════════════════════
//  TWILIGHT — utils.js
//  Helper: colors, labels, time, distance
// ═══════════════════════════════════════════

import { WIND_DIRS } from './config.js';

/**
 * Metallic sunset color system
 * scoreToColor(s) — returns hex string (backward compatible)
 * scoreToMetal(s) — returns full object { hex, gradient, text, glow, radial, edgeDark }
 */
const SCORE_METALS = {
  1:  { hex:'#2C3258', glow:'#384068', text:'#B0B8D0',
        gradient:'linear-gradient(180deg,#3E4870 0%,#2C3258 25%,#202848 50%,#283050 75%,#384068 100%)',
        radial:'radial-gradient(ellipse 60% 80% at 50% 40%,rgba(70,80,120,0.40) 0%,rgba(0,0,0,0) 100%)' },
  2:  { hex:'#402878', glow:'#503890', text:'#D0C0E8',
        gradient:'linear-gradient(180deg,#584098 0%,#402878 25%,#301868 50%,#382070 75%,#503890 100%)',
        radial:'radial-gradient(ellipse 60% 80% at 50% 40%,rgba(100,70,160,0.40) 0%,rgba(0,0,0,0) 100%)' },
  3:  { hex:'#682090', glow:'#7830A8', text:'#E8D0F8',
        gradient:'linear-gradient(180deg,#8038B0 0%,#682090 25%,#581880 50%,#602088 75%,#7830A8 100%)',
        radial:'radial-gradient(ellipse 55% 75% at 50% 38%,rgba(140,80,190,0.42) 0%,rgba(0,0,0,0) 100%)' },
  4:  { hex:'#A01848', glow:'#B02860', text:'#F8D0E0',
        gradient:'linear-gradient(180deg,#B82868 0%,#A01848 25%,#881038 50%,#981840 75%,#B02860 100%)',
        radial:'radial-gradient(ellipse 55% 75% at 50% 38%,rgba(180,60,110,0.38) 0%,rgba(0,0,0,0) 100%)' },
  5:  { hex:'#D01020', glow:'#D82030', text:'#FFD8D8',
        gradient:'linear-gradient(180deg,#E02838 0%,#D01020 25%,#B80818 50%,#C81020 75%,#D82030 100%)',
        radial:'radial-gradient(ellipse 55% 75% at 50% 38%,rgba(220,60,70,0.40) 0%,rgba(0,0,0,0) 100%)' },
  6:  { hex:'#F52800', glow:'#F04010', text:'#FFE8E0',
        gradient:'linear-gradient(180deg,#F84018 0%,#F52800 25%,#D82000 50%,#E83008 75%,#F04010 100%)',
        radial:'radial-gradient(ellipse 55% 75% at 50% 38%,rgba(248,80,40,0.40) 0%,rgba(0,0,0,0) 100%)' },
  7:  { hex:'#FF5000', glow:'#FF6010', text:'#180800',
        gradient:'linear-gradient(180deg,#FF6818 0%,#FF5000 25%,#E04000 50%,#F04808 75%,#FF6010 100%)',
        radial:'radial-gradient(ellipse 55% 75% at 50% 38%,rgba(255,120,50,0.42) 0%,rgba(0,0,0,0) 100%)' },
  8:  { hex:'#FF8200', glow:'#FF8818', text:'#180800',
        gradient:'linear-gradient(180deg,#FF9020 0%,#FF8200 25%,#E07000 50%,#F07808 75%,#FF8818 100%)',
        radial:'radial-gradient(ellipse 55% 75% at 50% 38%,rgba(255,150,60,0.44) 0%,rgba(0,0,0,0) 100%)' },
  9:  { hex:'#FFC000', glow:'#FFB820', text:'#180800',
        gradient:'linear-gradient(180deg,#FFB828 0%,#FFC000 25%,#E0A800 50%,#F0B008 75%,#FFB820 100%)',
        radial:'radial-gradient(ellipse 55% 75% at 50% 38%,rgba(255,200,60,0.48) 0%,rgba(0,0,0,0) 100%)' },
  10: { hex:'#FFEE50', glow:'#FFE848', text:'#2A1800',
        gradient:'linear-gradient(180deg,#FFE050 0%,#FFEE50 25%,#E8D020 50%,#F0D830 75%,#FFE848 100%)',
        radial:'radial-gradient(ellipse 55% 75% at 50% 38%,rgba(255,240,100,0.55) 0%,rgba(0,0,0,0) 100%)' },
};

export function scoreToColor(s, _drama) {
  const n = Math.min(10, Math.max(1, Math.round(Number(s)) || 1));
  return SCORE_METALS[n].hex;
}

export function scoreToMetal(s) {
  const n = Math.min(10, Math.max(1, Math.round(Number(s)) || 1));
  return SCORE_METALS[n];
}

/**
 * Lerp between two hex colors
 */
function lerpColor(c1, c2, t) {
  const r1 = parseInt(c1.slice(1,3),16), g1 = parseInt(c1.slice(3,5),16), b1 = parseInt(c1.slice(5,7),16);
  const r2 = parseInt(c2.slice(1,3),16), g2 = parseInt(c2.slice(3,5),16), b2 = parseInt(c2.slice(5,7),16);
  const r = Math.round(r1+(r2-r1)*t), g = Math.round(g1+(g2-g1)*t), b = Math.round(b1+(b2-b1)*t);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

/**
 * Continuous color from decimal score 1.0–10.0
 * Interpolates between adjacent SCORE_METALS hex colors
 */
export function scoreToColorContinuous(score) {
  const s = Math.max(1, Math.min(10, Number(score) || 5));
  const lo = Math.max(1, Math.floor(s));
  const hi = Math.min(10, lo + 1);
  const t = s - lo;
  return lerpColor(SCORE_METALS[lo].hex, SCORE_METALS[hi].hex, t);
}

/**
 * Score 1-10 → Hebrew label
 */
export function scoreToLabel(s) {
  const n = Number(s);
  if (n >= 9) return 'מעולה';
  if (n >= 7) return 'טוב מאוד';
  if (n >= 5) return 'טוב';
  if (n >= 3) return 'בינוני';
  if (n >= 2) return 'חלש';
  return 'לא מומלץ';
}

/**
 * ISO datetime string → 'HH:MM'
 */
export function formatTime(iso) {
  if (!iso) return '--:--';
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * 'HH:MM' string + minutes → 'HH:MM' string
 */
export function addMinutes(timeStr, mins) {
  if (!timeStr || timeStr === '--:--') return '--:--';
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

/**
 * ISO sunset → 'HH:MM–HH:MM' civil twilight range
 */
export function twilightRange(sunsetISO) {
  const t = formatTime(sunsetISO);
  const mins = getTwilightDuration(sunsetISO);
  return `${t}–${addMinutes(t, mins)}`;
}

/**
 * Return civil twilight duration in minutes based on month (Israel)
 */
export function getTwilightDuration(sunsetISO) {
  if (!sunsetISO) return 28;
  const month = new Date(sunsetISO).getMonth() + 1;
  if (month >= 11 || month <= 2) return 22;
  if (month === 3 || month === 10) return 26;
  return 32;
}

/**
 * Difference in minutes between two 'HH:MM' strings
 */
export function minutesDiff(t1, t2) {
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  return Math.abs(toMin(t2) - toMin(t1));
}

/**
 * Haversine distance in km between two lat/lon pairs
 */
export function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Compute destination point given start, bearing (degrees) and distance (km) */
export function destPoint(lat, lon, bearingDeg, distKmVal) {
  const R = 6371;
  const d = distKmVal / R;
  const brng = bearingDeg * Math.PI / 180;
  const la1 = lat * Math.PI / 180;
  const lo1 = lon * Math.PI / 180;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(brng));
  const lo2 = lo1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return { lat: la2 * 180 / Math.PI, lon: lo2 * 180 / Math.PI };
}

/**
 * Wind degree → Hebrew direction string
 */
export function degToDir(deg) {
  const idx = Math.round(((deg % 360) / 45)) % 8;
  return WIND_DIRS[idx];
}

/**
 * Date string → Hebrew day name
 */
export function dateToHebDay(dateStr) {
  const days = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  const d = new Date(dateStr + 'T12:00:00');
  return days[d.getDay()];
}

/**
 * Date string → short date 'DD/MM'
 */
export function shortDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/**
 * Generate quality tags array from DayData
 * v2: cloud layers, delta, rain intensity
 */
export function buildTags(d) {
  const tags = [];
  const clouds = typeof d._cloudRaw === 'number' ? d._cloudRaw : parseFloat(d.cloud) || 0;
  const hum    = typeof d._humidityRaw === 'number' ? d._humidityRaw : parseFloat(d.humidity) || 0;
  const vis    = typeof d._visibilityRaw === 'number' ? d._visibilityRaw : parseFloat(d.visibility) || 0;
  const wind   = typeof d._windRaw === 'number' ? d._windRaw : parseFloat(d.wind) || 0;
  const cHigh  = d._cloudHighRaw || 0;
  const cLow   = d._cloudLowRaw || 0;
  const rainMm = d._rainMmRaw || 0;
  const delta  = d._cloudDelta || 0;

  // Sunset quality
  if (d.ssScore >= 8) tags.push('שקיעה מעולה');
  else if (d.ssScore >= 6) tags.push('שקיעה טובה');

  // Purple light potential — civil twilight glow 15-25 min post-sunset
  if ((d.twScore || 0) >= 7.5 && (d.ssScore || 0) >= 6) tags.push('פוטנציאל לאור סגול');

  // Cloud cover
  if (clouds < 20) tags.push('שמיים נקיים');
  else if (clouds > 70) tags.push('עננות כבדה');
  else if (clouds >= 20 && clouds <= 40) tags.push('עננות אופטימלית');

  // Cloud layers
  if (cHigh > 30 && cLow < 30) tags.push('עננים גבוהים — צבעים');
  if (cLow > 60) tags.push('עננים נמוכים — חסימה');

  // Cloud delta (clearing)
  if (delta < -20) tags.push('פריצת אור');
  else if (delta > 20) tags.push('התעננות');

  // Humidity
  if (hum >= 40 && hum <= 60) tags.push('לחות אידאלית');
  else if (hum < 25) tags.push('אוויר יבש מאוד');
  else if (hum < 40) tags.push('אוויר יבש');
  else if (hum > 80) tags.push('לחות גבוהה');

  // Visibility
  if (vis >= 20) tags.push('נראות מצוינת');
  else if (vis < 5) tags.push('נראות נמוכה');

  // Wind
  if (wind < 10) tags.push('רוח נוחה');
  else if (wind > 30) tags.push('רוח חזקה');

  // Rain
  if (rainMm > 2) tags.push('גשם פעיל');
  else if (rainMm > 0.3) tags.push('טפטוף');

  // Dust / aerosol
  const dustLevel = d._dustRaw || 0;
  if (dustLevel > 80)      tags.push('אבק כבד');
  else if (dustLevel > 40) tags.push('אבק מתון');
  else if (dustLevel > 15) tags.push('אבק קל — צבעים חמים');

  return tags;
}

// ─────────────────────────────────────────
//  Golden Hour range: ~30 min before sunset → sunset
// ─────────────────────────────────────────
export function goldenHourRange(sunsetTimeStr) {
  if (!sunsetTimeStr || sunsetTimeStr === '--:--') return '--:-- – --:--';
  const start = addMinutes(sunsetTimeStr, -30);
  return `${start}–${sunsetTimeStr}`;
}

// ─────────────────────────────────────────
//  Smart recommendation text
// ─────────────────────────────────────────
export function getSmartRecommendation(dayData) {
  const s = dayData.score;
  const tags = dayData.tags || [];
  const hasClean     = tags.includes('שמיים נקיים');
  const hasCloudy    = tags.includes('עננות כבדה');
  const hasWind      = tags.includes('רוח חזקה');
  const hasGoodVis   = tags.includes('נראות מצוינת');
  const hasDryAir    = tags.includes('אוויר יבש');
  const hasHighCloud = tags.includes('עננים גבוהים — צבעים');
  const hasBreak     = tags.includes('פריצת אור');
  const hasOptCloud  = tags.includes('עננות אופטימלית');
  const hasRain      = tags.includes('גשם פעיל') || tags.includes('טפטוף');
  const hasIdealHum  = tags.includes('לחות אידאלית');
  const hasLightDust = tags.includes('אבק קל — צבעים חמים');
  const hasHeavyDust = tags.includes('אבק כבד');

  if (hasRain) return '🌧️ גשם צפוי בשעת השקיעה — לא הערב.';
  if (hasHeavyDust) return '🌫️ אבק כבד באוויר — שקיעה אפרורית צפויה.';

  if (s >= 9) {
    if (hasHighCloud && hasBreak) return '🔥 פריצת אור דרך עננים גבוהים — שקיעה דרמטית צפויה!';
    if (hasLightDust && hasGoodVis) return '🔥 אבק קל באוויר — צפו לצבעי אדום-כתום עמוקים!';
    if (hasOptCloud && hasGoodVis) return '🔥 עננות מושלמת ונראות גבוהה — תנאי שקיעה נדירים!';
    if (hasClean && hasGoodVis) return '🔥 שמיים נקיים ונראות מצוינת. אל תפספסו!';
    return '🔥 ציון גבוה במיוחד — ערב מצוין לדמדומים.';
  }
  if (s >= 7) {
    if (hasHighCloud) return '🌅 עננים גבוהים צפויים — פוטנציאל לצבעים חמים.';
    if (hasIdealHum && hasGoodVis) return '🌅 לחות אידאלית ונראות גבוהה — צפו לצבעים עמוקים.';
    if (hasOptCloud) return '🌅 עננות חלקית אופטימלית — שקיעה צבעונית צפויה.';
    if (hasClean) return '🌅 שמיים נקיים ברובם, שקיעה טובה מאוד צפויה.';
    return '🌅 תנאים טובים מאוד — שווה לצאת לצפות.';
  }
  if (s >= 5) {
    if (hasBreak) return '⛅ עננים נפתחים — ייתכן רגע דרמטי של אור.';
    if (hasCloudy) return '⛅ עננות חלקית — ייתכנו צבעים מעניינים בין העננים.';
    return '⛅ תנאים סבירים, שקיעה טובה אך לא יוצאת דופן.';
  }
  if (s >= 3) {
    if (hasCloudy && hasWind) return '🌥️ עננות כבדה ורוח — לא הערב הטוב ביותר.';
    if (hasCloudy) return '🌥️ מעונן ברובו, סיכוי נמוך לשקיעה יפה.';
    return '🌥️ תנאים בינוניים, שקיעה לא מומלצת במיוחד.';
  }
  return '☁️ תנאים לא מתאימים — שמרו אנרגיה ליום אחר.';
}

// ─────────────────────────────────────────
//  Trend arrow (today vs tomorrow)
// ─────────────────────────────────────────
export function trendArrow(todayScore, tomorrowScore) {
  if (tomorrowScore == null) return { arrow: '', label: '', css: '' };
  const diff = tomorrowScore - todayScore;
  if (diff >= 2)  return { arrow: '↑', label: 'מחר טוב יותר',   css: 'color:#7fd87f' };
  if (diff >= 1)  return { arrow: '↗', label: 'שיפור קל מחר',   css: 'color:#b8d87f' };
  if (diff <= -2) return { arrow: '↓', label: 'מחר פחות טוב',   css: 'color:#ff8888' };
  if (diff <= -1) return { arrow: '↘', label: 'ירידה קלה מחר',  css: 'color:#d8a87f' };
  return { arrow: '→', label: 'מחר דומה להיום', css: 'color:var(--cream-faint)' };
}

// ─────────────────────────────────────────
//  Solar elevation angle (degrees)
//  Simplified astronomical formula
//  Returns degrees above horizon (negative = below)
// ─────────────────────────────────────────
export function calcSolarElevation(lat, lon, date) {
  if (!date || !lat) return 3;
  const d = date instanceof Date ? date : new Date(date);

  // Day of year
  const start = new Date(d.getFullYear(), 0, 0);
  const diff  = d - start;
  const dayOfYear = Math.floor(diff / 86400000);

  // Solar declination (simplified)
  const declination = 23.45 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81));
  const decRad = declination * Math.PI / 180;

  // Hour angle
  const hours = d.getHours() + d.getMinutes() / 60;
  // Solar noon approximation for longitude (Israel ~34.8° → UTC+2/3)
  const solarNoon = 12 - (lon - 30) / 15; // rough estimate
  const hourAngle = (hours - solarNoon) * 15;
  const haRad = hourAngle * Math.PI / 180;

  // Latitude in radians
  const latRad = lat * Math.PI / 180;

  // Solar elevation
  const sinElev = Math.sin(latRad) * Math.sin(decRad) +
                  Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);

  return Math.asin(sinElev) * 180 / Math.PI;
}

// ─────────────────────────────────────────
//  SVG gauge arc for score (half-circle)
// ─────────────────────────────────────────
export function buildGaugeArc(score, color, size = 120) {
  const cx = size / 2;
  const cy = size / 2 + 4;
  const r  = size / 2 - 10;
  const strokeW = 8;
  const pct = Math.max(0, Math.min(1, (score - 1) / 9));
  const totalArc = Math.PI * r;
  const filled   = totalArc * pct;
  const gap      = totalArc - filled;
  const startX = cx - r;
  const endX   = cx + r;
  const displayScore = typeof score === 'number' ? score.toFixed(1) : score;

  return `
    <svg width="${size}" height="${size / 2 + 18}" viewBox="0 0 ${size} ${size / 2 + 18}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M ${startX} ${cy} A ${r} ${r} 0 0 1 ${endX} ${cy}"
            stroke="rgba(245,224,190,0.12)" stroke-width="${strokeW}" fill="none"
            stroke-linecap="round" />
      <path d="M ${startX} ${cy} A ${r} ${r} 0 0 1 ${endX} ${cy}"
            stroke="${color}" stroke-width="${strokeW}" fill="none"
            stroke-linecap="round"
            stroke-dasharray="${filled} ${gap}"
            style="filter:drop-shadow(0 0 6px ${color}66);transition:stroke-dasharray 0.6s ease" />
      <text x="${cx}" y="${cy - 8}" text-anchor="middle"
            font-family="var(--font-title)" font-size="32" font-weight="900"
            fill="${color}" style="filter:drop-shadow(0 0 12px ${color}44)">
        ${displayScore}
      </text>
      <text x="${cx}" y="${cy + 10}" text-anchor="middle"
            font-family="var(--font-body)" font-size="11" fill="rgba(245,230,200,0.5)">
        /10
      </text>
    </svg>`;
}

// ─────────────────────────────────────────
//  Solar azimuth (bearing from North, clockwise)
//  Standard formula: Az = atan2(-sin(H), tan(dec)*cos(lat) - sin(lat)*cos(H))
//  Verified: summer sunset Israel ≈ 300–305°, winter ≈ 240–245°
// ─────────────────────────────────────────
export function calcSolarAzimuth(lat, lon, date) {
  if (!date || lat == null) return 270;
  const d = date instanceof Date ? date : new Date(date);
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  const decRad = (23.45 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81))) * Math.PI / 180;
  const latRad = lat * Math.PI / 180;
  const hours = d.getHours() + d.getMinutes() / 60;
  const solarNoon = 12 - (lon - 30) / 15;
  const haRad = ((hours - solarNoon) * 15) * Math.PI / 180;
  const az = Math.atan2(
    -Math.sin(haRad),
    Math.tan(decRad) * Math.cos(latRad) - Math.sin(latRad) * Math.cos(haRad)
  ) * 180 / Math.PI;
  return (az + 360) % 360;
}

// ─────────────────────────────────────────
//  Golden hour duration in minutes
//  Based on rate of solar elevation change at sunset:
//  rate = 15 * cos(lat) * cos(dec) * sin(H_sunset) deg/hr
//  golden hour = 6 / rate * 60 minutes
// ─────────────────────────────────────────
export function calcGoldenHourMin(lat, date) {
  if (!date || lat == null) return 28;
  const d = date instanceof Date ? date : new Date(date);
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  const decRad = (23.45 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81))) * Math.PI / 180;
  const latRad = lat * Math.PI / 180;
  const tanProduct = Math.tan(latRad) * Math.tan(decRad);
  if (Math.abs(tanProduct) >= 1) return 28;
  const sinH = Math.sqrt(1 - tanProduct * tanProduct);
  const rateDegPerHour = 15 * Math.cos(latRad) * Math.cos(decRad) * sinH;
  if (rateDegPerHour <= 0) return 28;
  return Math.round(6 / rateDegPerHour * 60);
}

// ✓ utils.js v4 — complete
