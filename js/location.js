// ═══════════════════════════════════════════
//  TWILIGHT — location.js
//  GPS detection and location persistence
// ═══════════════════════════════════════════

const LOC_KEY      = 'twl_location';
const MAX_AGE_MS   = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get current GPS position
 * FIX: tries high-accuracy first (8s timeout), falls back to low-accuracy
 * Returns { lat, lon }
 */
export function getGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    // First attempt: high accuracy (better for Spot Finder)
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      _err => {
        console.warn('[location] High-accuracy GPS failed, retrying with low accuracy:', _err.message);
        // Second attempt: low accuracy, faster
        navigator.geolocation.getCurrentPosition(
          pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
          err => {
            console.warn('[location] GPS failed entirely:', err.message, '— using Tel Aviv fallback');
            const saved = loadLocation();
            if (saved) {
              resolve(saved);
            } else {
              console.warn('[location] No saved location available, defaulting to Tel Aviv (32.0853, 34.7818)');
              resolve({ lat: 32.0853, lon: 34.7818, isFallback: true });
            }
          },
          { timeout: 10000, enableHighAccuracy: false }
        );
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  });
}

/**
 * Save location + city name to localStorage
 * FIX: includes savedAt timestamp for staleness check
 */
export function saveLocation(lat, lon, city) {
  try {
    localStorage.setItem(LOC_KEY, JSON.stringify({ lat, lon, city, savedAt: Date.now() }));
  } catch (e) {
    console.warn('[location] saveLocation failed:', e);
  }
}

/**
 * Load saved location from localStorage
 * FIX: returns null if location is older than 24 hours
 * Returns { lat, lon, city } or null
 */
export function loadLocation() {
  try {
    const raw = localStorage.getItem(LOC_KEY);
    if (!raw) return null;
    const loc = JSON.parse(raw);
    if (typeof loc.lat !== 'number' || typeof loc.lon !== 'number') return null;

    // FIX: stale location check
    if (loc.savedAt && (Date.now() - loc.savedAt) > MAX_AGE_MS) {
      console.warn('[location] Saved location is older than 24h — ignoring');
      return null;
    }

    return loc;
  } catch (e) {
    return null;
  }
}

/**
 * Clear saved location
 */
export function clearLocation() {
  localStorage.removeItem(LOC_KEY);
}

// ─────────────────────────────────────────
//  Azimuth compass (Pulse 4)
//  Uses the DeviceOrientationEvent to compute the bearing delta between the
//  device's current heading and the direction of sunset.
//
//  Works across browsers:
//    – Android Chrome / Firefox: e.alpha gives magnetic heading (CCW from N)
//      → convert to CW: headingCW = (360 - alpha) % 360
//    – iOS Safari: e.webkitCompassHeading gives CW from magnetic N directly
//
//  delta > 0 → sunset is to the RIGHT of where you're facing
//  delta < 0 → sunset is to the LEFT
// ─────────────────────────────────────────

/**
 * Start watching the device orientation and report the angular delta
 * between the current heading and the sunset azimuth.
 *
 * @param {number}   sunsetAzimuthDeg  Sunset direction in degrees CW from geographic North.
 * @param {Function} onUpdate          Called with { delta, heading, sunsetAzimuth }.
 *
 * @returns {Function}  Cleanup function — call to stop watching.
 */
export function watchSunsetBearing(sunsetAzimuthDeg, onUpdate) {
  if (!window.DeviceOrientationEvent) return () => {};

  let lastUpdate = 0;

  function handleOrientation(e) {
    // Throttle to 4 fps — enough for smooth arrow, cheap on battery
    const now = Date.now();
    if (now - lastUpdate < 250) return;
    lastUpdate = now;

    let heading = null;

    if (e.webkitCompassHeading != null) {
      // iOS Safari — already CW from magnetic North
      heading = e.webkitCompassHeading;
    } else if (e.alpha != null) {
      // Android Chrome/Firefox — alpha is CCW from geographic North in [0, 360)
      heading = (360 - e.alpha) % 360;
    }

    if (heading == null) return;

    // Angular delta: how many degrees to rotate to face the sunset
    let delta = sunsetAzimuthDeg - heading;
    if (delta >  180) delta -= 360;
    if (delta < -180) delta += 360;

    onUpdate({ delta, heading, sunsetAzimuth: sunsetAzimuthDeg });
  }

  window.addEventListener('deviceorientation', handleOrientation, true);
  return () => window.removeEventListener('deviceorientation', handleOrientation, true);
}

// ✎ fixed: getGPS — high-accuracy first (8s), fallback to low-accuracy (10s)
// ✎ fixed: saveLocation — adds savedAt timestamp
// ✎ fixed: loadLocation — rejects locations older than 24h
// ✎ fixed: Tel Aviv fallback — explicit console.warn with coordinates
// ✎ added: watchSunsetBearing — DeviceOrientation compass (Pulse 4)
// ✓ location.js — complete
