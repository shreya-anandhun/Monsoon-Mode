/* =====================================================================
   app.js — runs the Today page.
   1.  Saved settings (name, city, unit) in localStorage
   2.  Pages: switching between Today / This week / Be ready
   3.  First visit: ask for a name, then a location
   4.  Location: GPS + place name, or a chosen city
   5.  Weather: fetch from Open-Meteo, with a timeout and a saved copy
   6.  Reading the data: verdict, warnings, sky
   7.  Drawing the page
   8.  News from data/news.json (made by a GitHub Action, see README)
   ===================================================================== */

const $ = (s) => document.querySelector(s);
const REFRESH_MS = 15 * 60 * 1000;   // fetch fresh weather every 15 minutes

/* ---------- 1. Settings --------------------------------------------- */
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }   // storage can be blocked (private mode)
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  },
};

// Only the name and the chosen city are kept. No address, no coordinates.
let settings = store.get('mm-settings', { name: '', mode: '', city: 'chennai' });
let unit = store.get('mm-unit', 'c');
let place = null;       // { lat, lon, label, newsCity }
let weather = null;     // the last Open-Meteo answer
let refreshTimer = null;

/* put the line icons into their spans */
function paintIcons() {
  const map = { 'pin-i': 'pin', 'bell-i': 'bell', 'banner-i': 'warn', 'retry-i': 'refresh', 'gps-i': 'locate' };
  Object.entries(map).forEach(([id, name]) => { const el = document.getElementById(id); if (el) el.innerHTML = UI[name]; });
  document.querySelectorAll('[data-i]').forEach((el) => { el.innerHTML = UI[el.dataset.i]; });
  document.querySelectorAll('.tab').forEach((t) => { t.querySelector('.i').innerHTML = UI[t.dataset.view]; });
  document.querySelectorAll('.chev').forEach((el) => { el.innerHTML = UI.chevron; });
  document.querySelectorAll('.i.x').forEach((el) => { el.innerHTML = UI.close; });
  $('#ob-art').innerHTML = weatherIcon('rain', true);
  $('#soon-ready').innerHTML = weatherIcon('drizzle', true);
}

/* ---------- 2. Pages ------------------------------------------------- */
function showView() {
  const view = ['today', 'week', 'map', 'ready'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today';
  document.body.dataset.view = view;
  // "map" is the phone-only tab; its content lives inside the This week section
  const section = view === 'map' ? 'week' : view;
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== 'view-' + section; });
  if (window.Week) Week.onView(view);
  // on a laptop the Live map tab is hidden, so highlight This week instead
  const current = view === 'map' && matchMedia('(min-width: 960px)').matches ? 'week' : view;
  document.querySelectorAll('.tab').forEach((t) => {
    if (t.dataset.view === current) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  scrollTo(0, 0);
}
addEventListener('hashchange', showView);

/* ---------- 3. First visit ------------------------------------------- */
function greet() {
  const name = settings.name || 'there';
  $('#welcome').textContent = `Welcome, ${name}`;
  $('#avatar').textContent = (settings.name || '?').trim().charAt(0).toUpperCase();
}

const onboard = $('#onboard');
onboard.addEventListener('cancel', (e) => e.preventDefault()); // a name is needed first
$('#ob-name').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#name-input').value.trim();
  if (!name) return;
  settings.name = name;
  store.set('mm-settings', settings);
  greet();
  onboard.close();
  openWhere(true);
});

/* ---------- 4. Location ---------------------------------------------- */
const where = $('#where');

function openWhere(firstTime) {
  where.querySelector('[data-close]').hidden = !!firstTime;
  where.dataset.first = firstTime ? '1' : '';
  $('#gps-msg').hidden = true;
  $('#cities').innerHTML = Object.entries(CITIES).map(([key, c]) =>
    `<button type="button" data-city="${key}" aria-pressed="${settings.mode === 'city' && settings.city === key}">${c.name}</button>`).join('');
  where.showModal();
}
where.addEventListener('cancel', (e) => { if (where.dataset.first) e.preventDefault(); });

$('#cities').addEventListener('click', (e) => {
  const b = e.target.closest('[data-city]');
  if (!b) return;
  settings.mode = 'city';
  settings.city = b.dataset.city;
  store.set('mm-settings', settings);
  where.close();
  start();
});

$('#use-gps').addEventListener('click', async () => {
  const msg = $('#gps-msg');
  msg.hidden = false;
  msg.textContent = 'Asking your browser for your location…';
  try {
    const coords = await getPosition();
    settings.mode = 'gps';
    store.set('mm-settings', settings);
    where.close();
    start(coords);
  } catch (err) {
    msg.textContent = err.message;
  }
});

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('This browser cannot share your location. Pick a city instead.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (err) => reject(new Error(err.code === 1
        ? 'Location access is off. Pick a city below instead.'
        : 'We couldn\'t find your location. Pick a city below instead.')),
      { timeout: 10000, maximumAge: 10 * 60 * 1000 }
    );
  });
}

/* the city nearest to a point, so GPS users still get local news */
function nearestCity(lat, lon) {
  let best = 'chennai', bestD = Infinity;
  Object.entries(CITIES).forEach(([key, c]) => {
    const d = (c.lat - lat) ** 2 + ((c.lon - lon) * Math.cos(lat * Math.PI / 180)) ** 2;
    if (d < bestD) { bestD = d; best = key; }
  });
  return best;
}

/* coordinates → "Vinayaga Nagar, Chennai" (BigDataCloud, free, no key) */
async function placeName(lat, lon) {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
  const r = await fetchWithTimeout(url, 8000);
  const j = await r.json();
  const parts = [j.locality, j.city].filter(Boolean);
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.join(', ') || j.principalSubdivision || 'Your location';
}

async function resolvePlace(coords) {
  if (settings.mode === 'gps') {
    try {
      const c = coords || await getPosition();
      const near = nearestCity(c.lat, c.lon);
      let label = 'Your location';
      try { label = await placeName(c.lat, c.lon); } catch (e) { /* weather still works without a name */ }
      return { lat: c.lat, lon: c.lon, label, newsCity: near };
    } catch (err) {
      // GPS refused or failed: ask for a city, as agreed
      openWhere(false);
      $('#gps-msg').hidden = false;
      $('#gps-msg').textContent = err.message;
      settings.mode = 'city';
      store.set('mm-settings', settings);
    }
  }
  const c = CITIES[settings.city] || CITIES.chennai;
  return { lat: c.lat, lon: c.lon, label: c.name, newsCity: settings.city };
}

/* ---------- 5. Weather ----------------------------------------------- */
function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).then((r) => {
    clearTimeout(t);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r;
  });
}

function weatherUrl(lat, lon) {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m',
    hourly: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_gusts_10m,is_day',
    daily: 'sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max',
    timezone: 'Asia/Kolkata',
    forecast_days: '7',          // today + the next 6 days, shared by Today and This week
  });
  return 'https://api.open-meteo.com/v1/forecast?' + p;
}

async function loadWeather() {
  clearTimeout(refreshTimer);
  if (!weather) document.body.dataset.state = 'loading';
  $('#error').hidden = true;

  const key = 'v7:' + place.lat.toFixed(2) + ',' + place.lon.toFixed(2);   // v7: old 2-day caches no longer match
  try {
    const r = await fetchWithTimeout(weatherUrl(place.lat, place.lon), 12000);
    weather = await r.json();
    store.set('mm-cache', { key, data: weather, savedAt: Date.now() });
    render(weather, null);
  } catch (err) {
    const cache = store.get('mm-cache', null);
    if (cache && cache.key === key) {
      weather = cache.data;
      render(weather, cache.savedAt);       // show the saved copy, say how old it is
    } else {
      weather = null;
      document.body.dataset.state = 'error';
      if (window.Week) Week.fail();
      $('#error').hidden = false;
      $('#error-text').textContent = navigator.onLine === false
        ? 'You seem to be offline. Check your internet, then try again.'
        : 'The weather service didn\'t answer. Wait a moment, then try again.';
      $('#verdict-text').textContent = 'No live weather right now.';
      $('#verdict-i').innerHTML = UI.warn;
      $('#updated').textContent = '';
    }
  }
  refreshTimer = setTimeout(loadWeather, REFRESH_MS);
}
$('#retry').addEventListener('click', loadWeather);
addEventListener('online', () => place && loadWeather());

/* ---------- 6. Reading the data -------------------------------------- */
function read(w) {
  const cur = w.current, h = w.hourly;
  let i0 = h.time.indexOf(cur.time.slice(0, 13) + ':00');
  if (i0 < 0) i0 = 0;
  const range = (n) => h.time.slice(i0, i0 + n).map((_, k) => i0 + k);
  const next6 = range(6), next24 = range(24);

  const minutes = (cur.interval || 3600) / 60;
  const rateNow = cur.precipitation * (60 / minutes);            // mm per hour
  const total24 = next24.reduce((s, i) => s + (h.precipitation[i] || 0), 0);
  let max3h = 0;
  for (let k = 0; k + 2 < next24.length; k++) {
    max3h = Math.max(max3h, next24.slice(k, k + 3).reduce((s, i) => s + (h.precipitation[i] || 0), 0));
  }
  const gust12 = Math.max(cur.wind_gusts_10m || 0, ...range(12).map((i) => h.wind_gusts_10m[i] || 0));
  const stormSoon = [cur.weather_code, ...range(3).map((i) => h.weather_code[i])].some((c) => c >= 95);
  const chanceNow = h.precipitation_probability[i0] ?? 0;
  const firstLikely = next6.find((i) => (h.precipitation_probability[i] ?? 0) >= 50);
  const maxChance6 = Math.max(...next6.map((i) => h.precipitation_probability[i] ?? 0));
  const kind = describe(cur.weather_code).kind;
  // any measured rain at all counts, so even a light drizzle shows up
  const raining = ['drizzle', 'rain', 'heavy', 'storm'].includes(kind) || rateNow > 0;

  return { cur, h, i0, next6, rateNow, total24, max3h, gust12, stormSoon, chanceNow, firstLikely, maxChance6, kind, raining, isDay: cur.is_day === 1 };
}

/* The verdict: one plain sentence, chosen by rules, most urgent first */
function verdict(d) {
  if (d.stormSoon) return { icon: 'warn', text: 'Thunderstorms around. Stay indoors and keep away from trees and open ground.' };
  if (d.total24 >= 64.5) return { icon: 'warn', text: 'Heavy rain expected in the next 24 hours. Avoid low-lying roads and underpasses.' };
  if (d.raining && (d.kind === 'heavy' || d.rateNow >= RATE.heavy)) return { icon: 'umbrella', text: 'Heavy rain right now. Stay in if you can and avoid waterlogged roads.' };
  if (d.raining && d.rateNow < RATE.light && ['drizzle', 'cloudy', 'partly', 'clear', 'fog'].includes(d.kind)) return { icon: 'umbrella', text: 'Light drizzle outside. Carry an umbrella.' };
  if (d.raining) return { icon: 'umbrella', text: 'It\'s raining. Carry an umbrella.' };
  if (d.firstLikely === d.i0) return { icon: 'umbrella', text: 'Rain could start any minute. Carry an umbrella.' };
  if (d.firstLikely !== undefined) return { icon: 'umbrella', text: `Rain likely around ${hourLabel(d.h.time[d.firstLikely])}. Carry an umbrella.` };
  if (d.maxChance6 >= 25) return { icon: 'umbrella', text: 'A small chance of rain later. Keep an umbrella handy.' };
  if (d.cur.apparent_temperature >= 38) return { icon: 'today', text: 'Very hot outside. Drink water and stay in the shade.' };
  return { icon: 'today', text: 'No rain expected in the next 6 hours.' };
}

/* Warnings worked out from the forecast. Not official. */
function warnings(d) {
  const list = [];
  if (d.stormSoon) list.push({ serious: true, title: 'Thunderstorm nearby', text: 'Lightning is possible in the next 3 hours. Stay indoors and unplug large appliances.' });
  if (d.total24 >= 64.5) list.push({ serious: true, title: imdCategory(d.total24) + ' expected', text: `About ${rain(d.total24)} of rain in the next 24 hours. IMD calls 64.5 mm or more heavy rain.` });
  if (d.max3h >= 30) list.push({ serious: true, title: 'Flooding possible on low roads', text: `Up to ${rain(d.max3h)} could fall within 3 hours. Avoid subways and low-lying streets.` });
  if (d.gust12 >= 50) list.push({ serious: d.gust12 >= 60, title: 'Strong wind gusts', text: `Gusts up to ${wind(d.gust12)} in the next 12 hours. Watch out for falling branches.` });
  if (!list.length && d.total24 >= 15.6) list.push({ serious: false, title: 'Moderate rain in the next 24 hours', text: `About ${rain(d.total24)} expected. Roads may be slow.` });
  return list;
}

/* which sky to paint */
function scene(d) {
  if (d.kind === 'storm') return 'storm';
  if (['drizzle', 'rain', 'heavy'].includes(d.kind) || d.rateNow > 0) return d.isDay ? 'rain-day' : 'rain-night';
  if (['clear', 'partly'].includes(d.kind)) return d.isDay ? 'clear-day' : 'clear-night';
  return d.isDay ? 'cloudy-day' : 'rain-night';   // cloudy nights use the dark sky
}
function skyRate(d) {
  if (d.rateNow > 0) return d.rateNow;
  return { drizzle: 1, rain: 3, heavy: 9, storm: 6 }[d.kind] || 0;
}

/* ---------- units and labels ------------------------------------------ */
const temp = (c) => Math.round(unit === 'f' ? c * 9 / 5 + 32 : c) + '°';
const rain = (mm) => unit === 'f' ? (mm / 25.4).toFixed(2) + ' in' : (mm < 10 ? mm.toFixed(1) : Math.round(mm)) + ' mm';
const wind = (kmh) => unit === 'f' ? Math.round(kmh * 0.621) + ' mph' : Math.round(kmh) + ' km/h';
function hourLabel(iso) {                 // "2026-10-24T19:00" → "7 pm"
  const hr = Number(iso.slice(11, 13));
  return (hr % 12 || 12) + (hr < 12 ? ' am' : ' pm');
}
function clockLabel(iso) {                // "2026-10-24T06:02" → "6:02 am"
  const hr = Number(iso.slice(11, 13)), mn = iso.slice(14, 16);
  return (hr % 12 || 12) + ':' + mn + (hr < 12 ? ' am' : ' pm');
}
function ago(ms) {
  const m = Math.round(ms / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  return h < 48 ? h + ' h ago' : Math.round(h / 24) + ' days ago';
}

/* ---------- 7. Drawing the page --------------------------------------- */
function render(w, savedAt) {
  const d = read(w);
  // This week draws from the same data. If anything about it is missing, only that page shows an error.
  if (window.Week) { try { Week.render(w, savedAt); } catch (e) { console.error('This week page:', e); Week.fail(); } }
  document.body.dataset.state = 'ready';
  let info = describe(d.cur.weather_code);
  // the code can say "cloudy" while a little rain is actually measured: trust the rain
  if (d.rateNow > 0 && !['drizzle', 'rain', 'heavy', 'storm'].includes(info.kind)) {
    info = d.rateNow < RATE.light ? { text: 'Light drizzle', kind: 'drizzle' } : { text: 'Rain', kind: 'rain' };
  }

  // sky
  Sky.set({ scene: scene(d), rate: skyRate(d), wind: d.cur.wind_speed_10m, clouds: (d.cur.cloud_cover ?? 50) / 100, storm: d.kind === 'storm' });
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.body).getPropertyValue('--sky-top').trim();

  // header
  $('#place').textContent = place.label;
  $('#updated').textContent = savedAt
    ? `Offline. Showing weather saved ${ago(Date.now() - savedAt)}.`
    : `Updated ${new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;

  // verdict
  const v = verdict(d);
  $('#verdict-i').innerHTML = UI[v.icon];
  $('#verdict-text').textContent = v.text;

  // current weather
  $('#now-icon').innerHTML = weatherIcon(info.kind, d.isDay);
  $('#temp').textContent = temp(d.cur.temperature_2m);
  $('#cond').textContent = info.text;
  $('#feels').textContent = `Feels like ${temp(d.cur.apparent_temperature)}`;
  $('#s-chance').textContent = d.chanceNow + '%';
  $('#s-humid').textContent = d.cur.relative_humidity_2m + '%';
  const [wn, wu] = wind(d.cur.wind_speed_10m).split(' ');
  $('#s-wind').innerHTML = `${wn}<small> ${wu}</small>`;   // smaller unit so it fits a phone tile

  $('#details-sub').textContent = `${place.label} · ${info.text}, ${temp(d.cur.temperature_2m)}`;

  // read more: next 6 hours
  $('#hours').innerHTML = d.next6.map((i, k) => `
    <li>
      <span>${k === 0 ? 'Now' : hourLabel(d.h.time[i])}</span>
      ${weatherIcon(k === 0 ? info.kind : describe(d.h.weather_code[i]).kind, d.h.is_day[i] === 1)}
      <span class="t">${temp(d.h.temperature_2m[i])}</span>
      <span>${d.h.precipitation_probability[i] ?? 0}%</span>
    </li>`).join('');

  // read more: what the numbers mean
  const rows = [
    ['Rain chance this hour', d.chanceNow + '%', 'How likely it is to rain at all. It says nothing about how much. Above 50% means rain is more likely than not.'],
    ['Rain falling now', rain(d.rateNow) + '/hr', `How hard it is raining. Under ${rain(RATE.light)} an hour is light, ${rain(RATE.light)} to ${rain(RATE.heavy)} is moderate, and above that is heavy.`],
    ['Rain in the next 24 hours', rain(d.total24), `${imdCategory(d.total24)} by IMD's scale. IMD calls 64.5 mm or more in a day heavy rain, enough to flood low-lying roads.`],
    ['Feels like', temp(d.cur.apparent_temperature), 'Humidity and wind change how hot the air feels on your skin. This is that number.'],
    ['Humidity', d.cur.relative_humidity_2m + '%', 'How much water is in the air. Above 80%, sweat dries slowly, so it feels sticky.'],
    ['Wind gusts', wind(d.cur.wind_gusts_10m), 'Short bursts of stronger wind. Above 50 km/h they can bring down weak branches.'],
    ['Sunrise and sunset', `${clockLabel(w.daily.sunrise[0])}, ${clockLabel(w.daily.sunset[0])}`, 'Roads flood faster than people expect after dark. Plan trips before sunset on heavy days.'],
  ];
  $('#explain').innerHTML = rows.map(([k, val, why]) =>
    `<div><dt><span>${k}</span><span>${val}</span></dt><dd>${why}</dd></div>`).join('');

  // alerts
  const list = warnings(d);
  const serious = list.find((a) => a.serious);
  $('#bell-dot').hidden = !list.length;
  $('#bell').setAttribute('aria-label', list.length ? `Weather alerts, ${list.length} active` : 'Weather alerts');
  $('#banner').hidden = !serious;
  if (serious) {
    // the banner names the danger; the verdict below says what to do
    $('#banner-title').textContent = serious.title;
    $('#banner-text').textContent = list.length > 1 ? `Tap to see all ${list.length} alerts` : 'Tap for details';
  }
  $('#alert-list').innerHTML = list.length
    ? list.map((a) => `<li class="${a.serious ? 'serious' : ''}"><span class="i">${UI.warn}</span><span><strong>${a.title}</strong>${a.text}</span></li>`).join('')
    : `<li><span class="i">${UI.today}</span><span><strong>No warnings right now</strong>Nothing serious in the forecast for the next 24 hours.</span></li>`;
}

/* unit toggle: re-draws from the data we already have, no new fetch */
function setUnit(u) {
  unit = u;
  store.set('mm-unit', u);
  $('#unit-c').setAttribute('aria-pressed', String(u === 'c'));
  $('#unit-f').setAttribute('aria-pressed', String(u === 'f'));
  if (weather) render(weather, null);
}
$('#unit-c').addEventListener('click', () => setUnit('c'));
$('#unit-f').addEventListener('click', () => setUnit('f'));

/* read more: opens the frosted box instead of stretching the card */
const details = $('#details');
$('#more-btn').addEventListener('click', () => details.showModal());
details.addEventListener('click', (e) => { if (e.target === details) details.close(); });  // tap outside to close

/* sheets: profile, alerts, location */
const profile = $('#profile');
$('#avatar').addEventListener('click', () => {
  $('#profile-name').value = settings.name;
  $('#profile-place').textContent = place ? place.label + (settings.mode === 'gps' ? ' (from your location)' : '') : 'Not set';
  profile.showModal();
});
$('#profile-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#profile-name').value.trim();
  if (!name) return;
  settings.name = name;
  store.set('mm-settings', settings);
  greet();
  profile.close();
});
$('#profile-change').addEventListener('click', () => { profile.close(); openWhere(false); });
$('#place-btn').addEventListener('click', () => openWhere(false));
$('#bell').addEventListener('click', () => $('#alerts').showModal());
$('#banner').addEventListener('click', () => $('#alerts').showModal());
$('#official').innerHTML = OFFICIAL.map((o) =>
  `<li><a href="${o.url}" target="_blank" rel="noopener"><span><strong>${o.name}</strong><small>${o.what}</small></span><span class="i">${UI.ext}</span></a></li>`).join('');

document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog.sheet').forEach((dlg) => {
  // tapping the dark area outside a sheet closes it (not on first visit)
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg && !dlg.dataset.first && dlg !== onboard) dlg.close();
  });
});

/* ---------- 8. News --------------------------------------------------- */
async function loadNews() {
  const city = CITIES[place.newsCity] || CITIES.chennai;
  const list = $('#news-list');
  const search = `https://news.google.com/search?q=${encodeURIComponent(city.news + ' rain')}&hl=en-IN&gl=IN&ceid=IN:en`;
  $('#news-h').textContent = `Rain news: ${city.name === 'Tiruchirappalli' ? 'Trichy' : city.name}`;

  try {
    const r = await fetchWithTimeout('data/news.json?t=' + Date.now(), 8000);
    const j = await r.json();
    const raw = j.cities[place.newsCity];
    if (raw == null) throw new Error('feed failed');     // the Action couldn't reach the news this time
    const items = raw.slice(0, 4);
    $('#news-when').textContent = 'Updated ' + ago(Date.now() - Date.parse(j.updated));
    list.innerHTML = items.length
      ? items.map((n) => `
        <li><a href="${escapeHtml(n.link)}" target="_blank" rel="noopener">
          <p class="h">${escapeHtml(n.title)}</p>
          <p class="src"><strong>${escapeHtml(n.source)}</strong><span>· ${ago(Date.now() - Date.parse(n.published))}</span><span class="i">${UI.ext}</span></p>
        </a></li>`).join('')
      : `<li class="note">No rain news in the last two days. <a href="${search}" target="_blank" rel="noopener">Search the news yourself</a></li>`;
  } catch (e) {
    $('#news-when').textContent = '';
    list.innerHTML = `<li class="note">Live headlines appear once Monsoon Mode is online on GitHub Pages. Until then, <a href="${search}" target="_blank" rel="noopener">see ${city.news} rain news on Google News</a>.</li>`;
  }
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- start ----------------------------------------------------- */
async function start(coords) {
  weather = null;
  document.body.dataset.state = 'loading';
  $('#place').textContent = settings.mode === 'gps' ? 'Finding your location…' : (CITIES[settings.city] || CITIES.chennai).name;
  place = await resolvePlace(coords);
  $('#place').textContent = place.label;
  if (window.Week) Week.setPlace(place);   // moves the live map to the new place
  loadWeather();
  loadNews();
}

window.MM = { $, temp, rain, wind, imdCategory, describe, clockLabel, hourLabel, ago, weatherIcon, UI, store, getUnit: () => unit };

paintIcons();
showView();
setUnit(unit);
greet();
if (!settings.name) onboard.showModal();
else if (!settings.mode) openWhere(true);
else start();
