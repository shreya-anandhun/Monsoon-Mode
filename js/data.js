/* =====================================================================
   data.js — fixed information the app needs.
   1. Cities you can pick if you don't share your location
   2. What each Open-Meteo weather code means, in plain words
   3. Rain thresholds used for the verdict and the warnings
   ===================================================================== */

/* ---------- 1. Cities ------------------------------------------------ */
const CITIES = {
  chennai:   { name: 'Chennai',          lat: 13.0827, lon: 80.2707, news: 'Chennai' },
  madurai:   { name: 'Madurai',          lat: 9.9252,  lon: 78.1198, news: 'Madurai' },
  trichy:    { name: 'Tiruchirappalli',  lat: 10.7905, lon: 78.7047, news: 'Trichy' },
  bengaluru: { name: 'Bengaluru',        lat: 12.9716, lon: 77.5946, news: 'Bengaluru' },
};

/* ---------- 2. Weather codes ----------------------------------------
   Open-Meteo sends a number (a "WMO code") instead of words.
   kind = which picture and which sky to show. */
const CODES = {
  0:  { text: 'Clear sky',            kind: 'clear' },
  1:  { text: 'Mostly clear',         kind: 'clear' },
  2:  { text: 'Partly cloudy',        kind: 'partly' },
  3:  { text: 'Cloudy',               kind: 'cloudy' },
  45: { text: 'Foggy',                kind: 'fog' },
  48: { text: 'Foggy',                kind: 'fog' },
  51: { text: 'Light drizzle',        kind: 'drizzle' },
  53: { text: 'Drizzle',              kind: 'drizzle' },
  55: { text: 'Heavy drizzle',        kind: 'drizzle' },
  56: { text: 'Icy drizzle',          kind: 'drizzle' },
  57: { text: 'Icy drizzle',          kind: 'drizzle' },
  61: { text: 'Light rain',           kind: 'rain' },
  63: { text: 'Rain',                 kind: 'rain' },
  65: { text: 'Heavy rain',           kind: 'heavy' },
  66: { text: 'Icy rain',             kind: 'rain' },
  67: { text: 'Icy rain',             kind: 'heavy' },
  71: { text: 'Light snow',           kind: 'cloudy' },
  73: { text: 'Snow',                 kind: 'cloudy' },
  75: { text: 'Heavy snow',           kind: 'cloudy' },
  77: { text: 'Snow grains',          kind: 'cloudy' },
  80: { text: 'Light showers',        kind: 'rain' },
  81: { text: 'Rain showers',         kind: 'rain' },
  82: { text: 'Very heavy showers',   kind: 'heavy' },
  85: { text: 'Snow showers',         kind: 'cloudy' },
  86: { text: 'Snow showers',         kind: 'cloudy' },
  95: { text: 'Thunderstorm',         kind: 'storm' },
  96: { text: 'Thunderstorm, hail',   kind: 'storm' },
  99: { text: 'Thunderstorm, hail',   kind: 'storm' },
};
const describe = (code) => CODES[code] || { text: 'Unknown', kind: 'cloudy' };

/* ---------- 3. Rain thresholds ---------------------------------------
   DAILY totals use the India Meteorological Department (IMD) categories
   for rain in 24 hours. HOURLY rates use the common meteorology scale
   for how hard it is raining right now. */
const IMD_24H = [
  { min: 204.5, label: 'Extremely heavy rain' },
  { min: 115.6, label: 'Very heavy rain' },
  { min: 64.5,  label: 'Heavy rain' },
  { min: 15.6,  label: 'Moderate rain' },
  { min: 2.5,   label: 'Light rain' },
  { min: 0.1,   label: 'Very light rain' },
  { min: 0,     label: 'No rain' },
];
const imdCategory = (mm) => IMD_24H.find((c) => mm >= c.min).label;

const RATE = { light: 2.5, heavy: 7.6 }; // mm per hour

/* Official places to check. We cannot read their alerts directly
   from a website, so we link to them instead. */
const OFFICIAL = [
  { name: 'SACHET (NDMA)', what: 'Official disaster alerts for your state', url: 'https://sachet.ndma.gov.in/' },
  { name: 'IMD Chennai', what: 'Rain and cyclone warnings for Tamil Nadu', url: 'https://mausam.imd.gov.in/chennai/' },
  { name: 'INCOIS', what: 'Tsunami and high-wave warnings', url: 'https://incois.gov.in/' },
];
