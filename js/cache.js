// ═══════════════════════════════════════════
//  TWILIGHT — cache.js
//  localStorage cache with TTL expiration
// ═══════════════════════════════════════════

const PREFIX = 'twl_';

/**
 * Store data with TTL (minutes).
 * Handles QuotaExceededError: clears all cache then retries once.
 */
export function setCache(key, data, ttlMin) {
  const entry = {
    data,
    created: Date.now(),
    expires: Date.now() + ttlMin * 60 * 1000
  };
  const value = JSON.stringify(entry);

  try {
    localStorage.setItem(PREFIX + key, value);
  } catch (e) {
    if (
      e.name === 'QuotaExceededError' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    ) {
      console.warn('[cache] Storage full — clearing all cache and retrying');
      try {
        clearAll();
        localStorage.setItem(PREFIX + key, value);
      } catch (e2) {
        console.warn('[cache] setCache failed even after clearAll:', e2);
      }
    } else {
      console.warn('[cache] setCache failed:', e);
    }
  }
}

/**
 * Retrieve data if not expired. Returns null if missing or expired.
 */
export function getCache(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() > entry.expires) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Remove all expired entries from localStorage.
 */
export function clearExpired() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(PREFIX)) continue;
      try {
        const entry = JSON.parse(localStorage.getItem(k) || '{}');
        if (!entry.expires || Date.now() > entry.expires) {
          localStorage.removeItem(k);
        }
      } catch {
        localStorage.removeItem(k);
      }
    }
  } catch (e) {
    console.warn('[cache] clearExpired failed:', e);
  }
}

/**
 * Clear ALL twilight cache entries.
 */
export function clearAll() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.warn('[cache] clearAll failed:', e);
  }
}

/**
 * Returns age in minutes of a valid cache entry.
 * Returns null if missing, expired, or entry pre-dates the 'created' field.
 */
export function getCacheAge(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() > entry.expires) return null;
    if (!entry.created) return null;
    return Math.round((Date.now() - entry.created) / 60000);
  } catch {
    return null;
  }
}

// ✓ cache.js — deduplicated, single clean copy