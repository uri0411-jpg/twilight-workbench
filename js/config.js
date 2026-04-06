// ═══════════════════════════════════════════
//  TWILIGHT — config.js v3
// ═══════════════════════════════════════════

export const OPEN_METEO_URL         = 'https://api.open-meteo.com/v1/forecast';
export const OPEN_METEO_AQ_URL      = 'https://air-quality-api.open-meteo.com/v1/air-quality';
export const OPEN_METEO_HIST_URL    = 'https://archive-api.open-meteo.com/v1/archive';
export const NOMINATIM_URL          = 'https://nominatim.openstreetmap.org/reverse';
export const OVERPASS_URL           = 'https://overpass-api.de/api/interpreter';
export const OVERPASS_FALLBACK_URL  = 'https://overpass.kumi.systems/api/interpreter';

export const CACHE_TTL = {
  weather: 30,
  airq:    60,
  sun:     360,
  spots:   30
};

export const LOGO_SUNRISE  = 'images/sunrise.png';
export const LOGO_SUNSET   = 'images/sunset.png';
export const LOGO_TWILIGHT = 'images/twilight.png';

export const DAYS_HE = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

export const WEATHER_CODES = {
  0:'שמיים בהירים',1:'בהיר בעיקר',2:'ענני חלקית',3:'מעונן',
  45:'ערפל',48:'ערפל קפוא',
  51:'טפטוף קל',53:'טפטוף מתון',55:'טפטוף כבד',
  61:'גשם קל',63:'גשם מתון',65:'גשם כבד',
  71:'שלג קל',73:'שלג מתון',75:'שלג כבד',
  80:'מקלחות קלות',81:'מקלחות מתונות',82:'מקלחות כבדות',
  95:'סופת רעמים',96:'סופת רעמים עם ברד',99:'סופת רעמים עם ברד כבד'
};

export const WIND_DIRS = ['צפון','צפון-מזרח','מזרח','דרום-מזרח','דרום','דרום-מערב','מערב','צפון-מערב'];

// Fog/storm weather codes that kill sunsets
export const OVERRIDE_CODES = new Set([45, 48, 65, 75, 82, 95, 96, 99]);

export const SEASONAL_BASELINE = {
  1:  { clouds: 45, humidity: 65, visibility: 15, wind: 18, dust: 20 },
  2:  { clouds: 40, humidity: 60, visibility: 16, wind: 17, dust: 22 },
  3:  { clouds: 32, humidity: 50, visibility: 18, wind: 16, dust: 35 },
  4:  { clouds: 20, humidity: 40, visibility: 20, wind: 14, dust: 45 },
  5:  { clouds: 10, humidity: 35, visibility: 22, wind: 12, dust: 50 },
  6:  { clouds: 5,  humidity: 45, visibility: 20, wind: 10, dust: 35 },
  7:  { clouds: 3,  humidity: 50, visibility: 18, wind: 10, dust: 30 },
  8:  { clouds: 3,  humidity: 55, visibility: 17, wind: 9,  dust: 28 },
  9:  { clouds: 5,  humidity: 50, visibility: 19, wind: 10, dust: 32 },
  10: { clouds: 15, humidity: 45, visibility: 20, wind: 12, dust: 25 },
  11: { clouds: 30, humidity: 55, visibility: 18, wind: 15, dust: 18 },
  12: { clouds: 42, humidity: 62, visibility: 16, wind: 17, dust: 16 },
};

export const COAST_LON = 34.65;
export const ELEV_BONUS_THRESHOLD = 400;
export const CALIBRATION_MIN_DAYS = 14;
export const CALIBRATION_KEY = 'twl_calibration';

// ✓ config.js v3
