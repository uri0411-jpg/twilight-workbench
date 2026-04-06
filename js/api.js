// ═══════════════════════════════════════════
//  TWILIGHT — api.js
//  External API: Open-Meteo, Nominatim, Overpass
// ═══════════════════════════════════════════

import {
  OPEN_METEO_URL, OPEN_METEO_AQ_URL,
  NOMINATIM_URL, OVERPASS_URL, OVERPASS_FALLBACK_URL,
  CACHE_TTL
} from './config.js';
import { setCache, getCache } from './cache.js';
import { distKm }             from './utils.js';

const FETCH_TIMEOUT_MS = 10000;

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────
//  PARAMS
// ─────────────────────────────────────────
const HOURLY_PARAMS = [
  'cloudcover', 'cloudcover_low', 'cloudcover_mid', 'cloudcover_high',
  'relativehumidity_2m', 'visibility',
  'windspeed_10m', 'winddirection_10m', 'windgusts_10m',
  'temperature_2m', 'surface_pressure',
  'precipitation_probability', 'precipitation',
  'dewpoint_2m', 'uv_index', 'apparent_temperature',
  'temperature_850hPa'
].join(',');

const DAILY_PARAMS = [
  'sunrise', 'sunset',
  'temperature_2m_max', 'temperature_2m_min',
  'weathercode', 'precipitation_probability_max',
  'precipitation_sum', 'windspeed_10m_max', 'windgusts_10m_max'
].join(',');

// ─────────────────────────────────────────
//  Single model fetch
// ─────────────────────────────────────────
async function fetchModel(lat, lon, model = null) {
  const params = new URLSearchParams({
    latitude: lat, longitude: lon,
    timezone: 'Asia/Jerusalem', forecast_days: 7,
    hourly: HOURLY_PARAMS, daily: DAILY_PARAMS
  });
  if (model) params.set('models', model);

  const url = `${OPEN_METEO_URL}?${params}`;
  const res = await fetchWithTimeout(url);

  // FIX #15: check response type before attempting JSON parse
  if (!res.ok) throw new Error(`Open-Meteo ${model || 'best_match'} error ${res.status}`);
  if (res.type === 'opaque') throw new Error('Opaque response from Open-Meteo — CORS issue');

  return res.json();
}

// ─────────────────────────────────────────
//  Average hourly arrays across models
// ─────────────────────────────────────────
function averageHourlyArrays(datasets, key) {
  const primary = datasets[0]?.hourly?.[key];
  if (!primary) return undefined;

  return primary.map((_, i) => {
    let sum = 0, count = 0;
    for (const ds of datasets) {
      const val = ds.hourly?.[key]?.[i];
      if (val != null && !isNaN(val)) { sum += val; count++; }
    }
    return count > 0 ? sum / count : primary[i] ?? 0;
  });
}

// D3: Compute per-hour std-dev of cloud cover across ensemble models.
// High variance = models disagree = higher potential for surprise outcome.
function cloudVarianceArray(datasets) {
  const primary = datasets[0]?.hourly?.cloudcover;
  if (!primary || datasets.length < 2) return primary?.map(() => 0) ?? [];

  return primary.map((_, i) => {
    const vals = datasets
      .map(d => d.hourly?.cloudcover?.[i])
      .filter(v => v != null && !isNaN(v));
    if (vals.length < 2) return 0;
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    return Math.sqrt(variance);
  });
}

// ─────────────────────────────────────────
//  fetchWeek — ensemble of up to 3 models
// ─────────────────────────────────────────
export async function fetchWeek(lat, lon) {
  const cacheKey = `weather_${lat.toFixed(3)}_${lon.toFixed(3)}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const primary = await fetchModel(lat, lon);

  let datasets = [primary];
  try {
    const [ecmwf, gfs] = await Promise.allSettled([
      fetchModel(lat, lon, 'ecmwf_ifs025'),
      fetchModel(lat, lon, 'gfs_seamless')
    ]);
    if (ecmwf.status === 'fulfilled') datasets.push(ecmwf.value);
    if (gfs.status  === 'fulfilled') datasets.push(gfs.value);
  } catch (e) {
    console.warn('[api] Ensemble secondaries failed:', e.message);
  }

  if (datasets.length > 1) {
    console.log(`[api] Ensemble: averaging ${datasets.length} models`);
    const hourlyKeys = Object.keys(primary.hourly).filter(k => k !== 'time');
    for (const key of hourlyKeys) {
      primary.hourly[key] = averageHourlyArrays(datasets, key);
    }
  }

  // D3: store cloud variance for surprise-factor scoring
  primary.hourly._cloudVariance = cloudVarianceArray(datasets);
  primary._modelCount = datasets.length;
  setCache(cacheKey, primary, CACHE_TTL.weather);
  return primary;
}

// ─────────────────────────────────────────
//  fetchAirQuality
// ─────────────────────────────────────────
export async function fetchAirQuality(lat, lon) {
  const cacheKey = `airq_${lat.toFixed(3)}_${lon.toFixed(3)}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    latitude: lat, longitude: lon,
    timezone: 'Asia/Jerusalem',
    forecast_days: 5,
    hourly: 'dust,pm2_5,pm10,aerosol_optical_depth,ozone'
  });

  try {
    const res = await fetchWithTimeout(`${OPEN_METEO_AQ_URL}?${params}`);
    if (!res.ok) throw new Error(`AQ API error ${res.status}`);
    // FIX #15: opaque guard
    if (res.type === 'opaque') throw new Error('Opaque AQ response');
    const data = await res.json();
    setCache(cacheKey, data, CACHE_TTL.airq);
    return data;
  } catch (e) {
    console.warn('[api] Air quality fetch failed:', e.message);
    return null;
  }
}

// ─────────────────────────────────────────
//  fetchCityName — Nominatim reverse-geocode
// ─────────────────────────────────────────
export async function fetchCityName(lat, lon) {
  const cacheKey = `city_${lat.toFixed(3)}_${lon.toFixed(3)}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    lat, lon, format: 'json', 'accept-language': 'he'
  });

  try {
    const res = await fetchWithTimeout(
      `${NOMINATIM_URL}?${params}`,
      { headers: { 'User-Agent': 'TWILIGHT-PWA/1.0', 'Accept-Language': 'he' } }
    );
    if (!res.ok) return 'מיקום לא ידוע';
    const data = await res.json();
    const city =
      data.address?.city    ||
      data.address?.town    ||
      data.address?.village ||
      data.address?.suburb  ||
      data.address?.county  ||
      data.address?.state   || 'ישראל';
    setCache(cacheKey, city, CACHE_TTL.sun);
    return city;
  } catch {
    return 'מיקום לא ידוע';
  }
}

// ─────────────────────────────────────────
//  Overpass with fallback + one retry
// ─────────────────────────────────────────
async function fetchOverpassWithFallback(query) {
  const body    = `data=${encodeURIComponent(query)}`;
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

  try {
    const res = await fetchWithTimeout(
      OVERPASS_URL,
      { method: 'POST', headers, body },
      25000
    );
    if (res.ok) return res;
    throw new Error(`Overpass primary error ${res.status}`);
  } catch (err) {
    console.warn('[api] Overpass primary failed:', err.message);
  }

  try {
    const res2 = await fetchWithTimeout(
      OVERPASS_FALLBACK_URL,
      { method: 'POST', headers, body },
      25000
    );
    if (res2.ok) return res2;
    throw new Error(`Overpass fallback error ${res2.status}`);
  } catch (err2) {
    console.warn('[api] Overpass fallback failed, retrying primary:', err2.message);
  }

  const res3 = await fetchWithTimeout(
    OVERPASS_URL,
    { method: 'POST', headers, body },
    25000
  );
  if (!res3.ok) throw new Error(`Overpass retry error ${res3.status}`);
  return res3;
}

// ─────────────────────────────────────────
//  fetchSpots
//  FIX #16: limit aligned to 100 in both slice and comment
// ─────────────────────────────────────────
export async function fetchSpots(lat, lon, radiusKm = 25) {
  const cappedRadius = Math.min(radiusKm, 50);
  const radiusM      = cappedRadius * 1000;
  const cacheKey     = `spots_${lat.toFixed(3)}_${lon.toFixed(3)}_${cappedRadius}`;
  const cached       = getCache(cacheKey);
  if (cached) return cached;

  const query = `
    [out:json][timeout:25];
    (
      node["natural"="peak"](around:${radiusM},${lat},${lon});
      node["tourism"="viewpoint"](around:${radiusM},${lat},${lon});
      node["natural"="cliff"](around:${radiusM},${lat},${lon});
      node["natural"="beach"](around:${radiusM},${lat},${lon});
      way["natural"="peak"](around:${radiusM},${lat},${lon});
      way["tourism"="viewpoint"](around:${radiusM},${lat},${lon});
      way["natural"="cliff"](around:${radiusM},${lat},${lon});
      way["natural"="beach"](around:${radiusM},${lat},${lon});
    );
    out center;
  `;

  const res  = await fetchOverpassWithFallback(query);
  const data = await res.json();

  const typeMap = {
    peak: 'פסגה', viewpoint: 'נקודת תצפית', cliff: 'מצוק', beach: 'חוף'
  };

  // FIX #16: comment and slice both say 100 — consistent
  const spots = (data.elements || [])
    .filter(el => el.lat || el.center?.lat)
    .map(el => {
      const slat    = el.lat ?? el.center.lat;
      const slon    = el.lon ?? el.center.lon;
      const name    = el.tags?.name || el.tags?.['name:he'] || el.tags?.['name:en'] || 'נקודת תצפית';
      const natural = el.tags?.natural;
      const tourism = el.tags?.tourism;
      const type    = typeMap[natural] || typeMap[tourism] || 'נקודת תצפית';
      const dist    = distKm(lat, lon, slat, slon);
      return {
        name, type,
        lat: slat, lon: slon,
        dist: Math.round(dist * 10) / 10,
        elevation: el.tags?.ele ? Number(el.tags.ele) : null
      };
    })
    .filter(s => s.dist <= cappedRadius)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 100); // max 100 results

  setCache(cacheKey, spots, CACHE_TTL.spots);
  return spots;
}

// ─────────────────────────────────────────
//  fetchWesternHorizon
// ─────────────────────────────────────────
export async function fetchWesternHorizon(lat, lon) {
  const lonWest  = Math.max(-180, lon - 0.5);
  const cacheKey = `west_${lat.toFixed(3)}_${lonWest.toFixed(3)}`;
  const cached   = getCache(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    latitude: lat, longitude: lonWest,
    timezone: 'Asia/Jerusalem', forecast_days: 7,
    hourly: 'cloudcover_low,cloudcover'
  });

  try {
    const res = await fetchWithTimeout(`${OPEN_METEO_URL}?${params}`);
    if (!res.ok) throw new Error(`Western horizon API error ${res.status}`);
    // FIX #15: opaque guard
    if (res.type === 'opaque') throw new Error('Opaque western horizon response');
    const data = await res.json();
    setCache(cacheKey, data, CACHE_TTL.weather);
    return data;
  } catch (e) {
    console.warn('[api] Western horizon fetch failed:', e.message);
    return null;
  }
}

// ✎ fixed #15: opaque response guard before .json() in fetchModel, fetchAirQuality, fetchWesternHorizon
// ✎ fixed #16: fetchSpots comment + slice aligned to 100
// ✓ api.js — complete