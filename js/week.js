/* =====================================================================
   week.js — the "This week" page and the live map.
   1. Live map: Windy's free embed, moved to the user's place, with our
      own layer menu (rain, wind, temperature …) and a colour scale
      drawn to match Windy's own colours for each layer.
   2. Report: tomorrow plus the next 5 days, from the same Open-Meteo
      answer that Today uses. A rain chart drawn in SVG by hand, a list
      of days, and a frosted pop-up with the full picture for one day.
   ===================================================================== */
const Week = (function () {
  const { $, temp, rain, wind, imdCategory, describe, clockLabel, weatherIcon, UI, store } = window.MM;

  /* ---------- 1. Live map -------------------------------------------- */
  // Each layer: Windy's overlay name, a label, the unit, and Windy's colour
  // stops (value → colour) used for the swatch and the scale bar.
  const LAYERS = [
    { id: 'rain',     label: 'Rain & thunder', sub: 'Rain and thunder near you right now', unit: 'mm',
      stops: [[0, '#5f82a2'], [1.5, '#4f8fbf'], [3, '#3fb3b3'], [7, '#4fc45a'], [10, '#d7d94a'], [20, '#e07a3a'], [30, '#c23c8e']] },
    { id: 'wind',     label: 'Wind', sub: 'Wind speed and direction', unit: 'km/h',
      stops: [[0, '#6271b8'], [10, '#4d9cc5'], [20, '#4cbd9a'], [35, '#bfc04a'], [50, '#d9774a'], [70, '#b94a84'], [90, '#8f2d9b']] },
    { id: 'temp',     label: 'Temperature', sub: 'Air temperature', unit: '°C',
      stops: [[0, '#5a63b5'], [10, '#4a9fc9'], [20, '#5cbf78'], [25, '#c8c84a'], [30, '#e49a3c'], [35, '#d9573a'], [45, '#a8203e']] },
    { id: 'clouds',   label: 'Clouds', sub: 'Cloud cover', unit: '%',
      stops: [[0, '#4c6b8f'], [50, '#8fa3b8'], [100, '#e9edf1']] },
    { id: 'rainAccu', label: 'Rain total', sub: 'Rain expected over the next days', unit: 'mm',
      stops: [[0, '#5f82a2'], [10, '#3fb3b3'], [25, '#4fc45a'], [50, '#d7d94a'], [100, '#e07a3a'], [200, '#c23c8e']] },
    { id: 'rh',       label: 'Humidity', sub: 'Relative humidity', unit: '%',
      stops: [[30, '#c98a3a'], [50, '#c8c84a'], [70, '#5cbf78'], [85, '#4a9fc9'], [100, '#5a63b5']] },
  ];
  let layer = store.get('mm-layer', 'rain');
  let mapPlace = { lat: 13.0827, lon: 80.2707 };
  let mapShown = false;

  const gradient = (stops) => {
    const lo = stops[0][0], hi = stops[stops.length - 1][0];
    return `linear-gradient(90deg, ${stops.map(([v, c]) => `${c} ${((v - lo) / (hi - lo) * 100).toFixed(1)}%`).join(', ')})`;
  };

  function windyUrl() {
    const p = new URLSearchParams({
      type: 'map', location: 'coordinates', metricRain: 'mm', metricTemp: '°C', metricWind: 'km/h',
      zoom: '7', overlay: layer, product: 'ecmwf', level: 'surface',
      lat: mapPlace.lat.toFixed(3), lon: mapPlace.lon.toFixed(3),
      detailLat: mapPlace.lat.toFixed(3), detailLon: mapPlace.lon.toFixed(3),
      marker: 'true', message: 'true', calendar: 'now',
    });
    return 'https://embed.windy.com/embed.html?' + p;
  }

  function paintLayers() {
    $('#layers').innerHTML = LAYERS.map((L) => `
      <button type="button" data-layer="${L.id}" aria-pressed="${L.id === layer}">
        <span>${L.label}</span><i style="background:${gradient(L.stops)}" aria-hidden="true"></i>
      </button>`).join('');
    const L = LAYERS.find((x) => x.id === layer);
    $('#scale').innerHTML = `<span class="unit">${L.unit}</span><div class="bar" style="background:${gradient(L.stops)}">${
      L.stops.map(([v]) => `<b>${v}</b>`).join('')}</div>`;
    $('#map-sub').textContent = L.sub;
  }

  function loadMap() {
    if (!mapShown) return;                                  // only load once the map is on screen
    const f = $('#windy');
    $('#map-offline').hidden = navigator.onLine !== false;
    $('#map-loading').hidden = navigator.onLine === false;
    if (navigator.onLine === false) return;
    f.src = windyUrl();
    $('#map-open').href = `https://www.windy.com/?${mapPlace.lat.toFixed(3)},${mapPlace.lon.toFixed(3)},7`;
  }
  $('#windy').addEventListener('load', () => { $('#map-loading').hidden = true; });
  $('#map-ext').innerHTML = UI.ext;
  $('#layers').addEventListener('click', (e) => {
    const b = e.target.closest('[data-layer]');
    if (!b || b.dataset.layer === layer) return;
    layer = b.dataset.layer;
    store.set('mm-layer', layer);
    paintLayers();
    $('#map-loading').hidden = false;
    loadMap();
  });
  addEventListener('online', loadMap);
  addEventListener('offline', () => { $('#map-offline').hidden = false; });
  paintLayers();

  /* ---------- 2. Report --------------------------------------------- */
  const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const PERIODS = [['Morning', 6, 12], ['Afternoon', 12, 18], ['Evening', 18, 22], ['Night', 22, 30]]; // night runs into the next day
  let days = [];       // the six days, worked out from the forecast
  let lastW = null;

  function dateOf(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
  const avg = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
  const mode = (arr) => arr.slice().sort((a, b) => arr.filter((v) => v === a).length - arr.filter((v) => v === b).length).pop();
  const rainy = (code) => ['drizzle', 'rain', 'heavy', 'storm'].includes(describe(code).kind);

  /* Build one day's summary from the daily numbers plus its 24 hourly rows */
  function buildDay(w, di) {
    const dl = w.daily, h = w.hourly;
    const date = dl.time[di];
    const hours = h.time.map((t, i) => i).filter((i) => h.time[i].startsWith(date));
    const next = h.time.map((t, i) => i).filter((i) => di + 1 < dl.time.length && h.time[i].startsWith(dl.time[di + 1]) && Number(h.time[i].slice(11, 13)) < 6);
    const periods = PERIODS.map(([name, from, to]) => {
      const idx = hours.filter((i) => { const hr = Number(h.time[i].slice(11, 13)); return hr >= from && hr < to; })
        .concat(to > 24 ? next : []);
      if (!idx.length) return null;
      const codes = idx.map((i) => h.weather_code[i]);
      // if any hour in the period is rainy, show the rainiest code; otherwise the most common one
      const rainCodes = codes.filter(rainy);
      const code = rainCodes.length ? Math.max(...rainCodes) : mode(codes);
      return {
        name, code, isDay: name !== 'Night' && name !== 'Evening',
        chance: Math.round(Math.max(...idx.map((i) => h.precipitation_probability[i] ?? 0))),
        temp: avg(idx.map((i) => h.temperature_2m[i])),
        mm: idx.reduce((s, i) => s + (h.precipitation[i] || 0), 0),
      };
    }).filter(Boolean);

    return {
      date, d: dateOf(date),
      code: dl.weather_code[di],
      hi: dl.temperature_2m_max[di], lo: dl.temperature_2m_min[di],
      feelsHi: dl.apparent_temperature_max[di], feelsLo: dl.apparent_temperature_min[di],
      mm: dl.precipitation_sum[di] || 0,
      chance: Math.round(dl.precipitation_probability_max[di] ?? 0),
      gust: dl.wind_gusts_10m_max[di] || 0,
      humidity: avg(hours.map((i) => h.relative_humidity_2m[i])),
      sunrise: dl.sunrise[di], sunset: dl.sunset[di],
      periods,
    };
  }

  /* One plain sentence for the day */
  function dayVerdict(day) {
    const stormy = day.periods.some((p) => describe(p.code).kind === 'storm');
    if (stormy) return 'Thunderstorms likely. Plan to be indoors when they hit.';
    if (day.mm >= 64.5) return `${imdCategory(day.mm)}. Expect waterlogging on low roads.`;
    if (day.mm >= 15.6) return 'Moderate rain. Carry an umbrella and allow extra travel time.';
    if (day.chance >= 50) return 'Rain likely at some point. Keep an umbrella with you.';
    if (day.chance >= 25) return 'A small chance of a shower.';
    if (day.feelsHi >= 38) return 'Hot and sticky. Drink water and keep to the shade.';
    return 'Mostly dry.';
  }

  /* when the wettest spell is, in words */
  function wettest(day) {
    const wet = day.periods.filter((p) => p.chance >= 40 || p.mm >= 1);
    if (!wet.length) return 'No real rain expected at any time of day.';
    const top = wet.slice().sort((a, b) => b.mm - a.mm || b.chance - a.chance)[0];
    const dry = day.periods.filter((p) => p.chance < 25 && p.mm < 0.5).map((p) => p.name.toLowerCase());
    return `Wettest in the ${top.name.toLowerCase()}${dry.length ? `; driest in the ${dry.join(' and ')}` : ''}.`;
  }

  /* ---- rain chart, drawn in SVG by hand ---- */
  function drawChart() {
    const narrow = innerWidth < 700;          // a smaller drawing on phones, so the text stays readable
    const W = narrow ? 380 : 600, H = narrow ? 250 : 240, padL = narrow ? 38 : 44, padR = 12, padT = 44, padB = 40;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const maxMm = Math.max(10, ...days.map((d) => d.mm));
    // a tidy top value: 10, 20, 50, 100 …
    const top = [10, 20, 30, 50, 75, 100, 150, 200, 300].find((v) => v >= maxMm * 1.25) || Math.ceil(maxMm / 100) * 100;
    const y = (mm) => padT + innerH - (mm / top) * innerH;
    const slot = innerW / days.length, barW = Math.min(narrow ? 34 : 56, slot * 0.56);
    const ticks = [0, top / 2, top];
    const heavyLine = top >= 64.5 ? `<line x1="${padL}" x2="${W - padR}" y1="${y(64.5)}" y2="${y(64.5)}" class="imd"/><text x="${W - padR}" y="${y(64.5) - 5}" text-anchor="end" class="imd-t">${narrow ? 'IMD heavy, 64.5 mm' : 'IMD heavy rain, 64.5 mm'}</text>` : '';
    const inches = window.MM.getUnit() === 'f';
    const fmt = (mm) => inches ? (mm / 25.4).toFixed(mm ? 1 : 0) : Math.round(mm);

    const bars = days.map((d, i) => {
      const cx = padL + slot * i + slot / 2;
      const h = Math.max(d.mm > 0 ? 3 : 0, innerH * (d.mm / top));
      const shade = d.mm >= 64.5 ? 'heavy' : d.mm >= 15.6 ? 'moderate' : 'light';
      return `
        <g class="bar ${shade}" data-i="${i}" tabindex="0" role="button" aria-label="${DAY[d.d.getDay()]}: ${rain(d.mm)} expected, ${d.chance}% chance">
          <rect class="hit" x="${cx - slot / 2}" y="${padT - 20}" width="${slot}" height="${innerH + 60}"/>
          <rect x="${cx - barW / 2}" y="${y(0) - h}" width="${barW}" height="${h}" rx="7"/>
          <text class="chance" x="${cx}" y="${y(0) - h - 8}" text-anchor="middle">${d.chance}%</text>
          <text class="day" x="${cx}" y="${H - 16}" text-anchor="middle">${DAY[d.d.getDay()].slice(0, 3)}</text>
        </g>`;
    }).join('');

    $('#chart').innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Expected rain for the next 6 days">
        ${ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 8}" y="${y(t) + 4}" text-anchor="end" class="tick">${fmt(t)}</text>`).join('')}
        <text x="${padL - 8}" y="${padT - 16}" text-anchor="end" class="tick">${inches ? 'in' : 'mm'}</text>
        <text x="${W - padR}" y="${padT - 16}" text-anchor="end" class="tick">${narrow ? '% = chance of rain' : 'number above each bar = chance of rain'}</text>
        ${heavyLine}
        ${bars}
      </svg>`;
  }

  /* ---- the list of days ---- */
  function drawDays() {
    $('#days').innerHTML = days.map((d, i) => `
      <li>
        <button type="button" class="day-row" data-i="${i}">
          <span class="when"><strong>${i === 0 ? 'Tomorrow' : DAY[d.d.getDay()]}</strong><span class="small">${d.d.getDate()} ${MON[d.d.getMonth()]}</span></span>
          <span class="ic">${weatherIcon(describe(d.code).kind, true)}</span>
          <span class="what"><span class="cond">${describe(d.code).text}</span><span class="small">${d.chance}% chance of rain</span></span>
          <span class="hilo"><b>${temp(d.hi)}</b><span class="small">${temp(d.lo)}</span></span>
          <span class="i chev">${UI.chevron}</span>
        </button>
      </li>`).join('');
  }

  /* ---- the pop-up for one day ---- */
  const box = $('#day-box');
  function openDay(i) {
    const d = days[i];
    const info = describe(d.code);
    $('#day-title').textContent = i === 0 ? `Tomorrow, ${DAY[d.d.getDay()]}` : DAY[d.d.getDay()];
    $('#day-sub').textContent = `${d.d.getDate()} ${MON[d.d.getMonth()]} · ${$('#place').textContent}`;
    $('#day-icon').innerHTML = weatherIcon(info.kind, true);
    $('#day-range').innerHTML = `${temp(d.hi)} <span class="small">high</span> &nbsp; ${temp(d.lo)} <span class="small">low</span>`;
    $('#day-cond').textContent = info.text;
    $('#day-verdict').textContent = dayVerdict(d);
    $('#day-stats').innerHTML = [
      ['drop', 'Rain chance', d.chance + '%'],
      ['humid', 'Humidity', Math.round(d.humidity) + '%'],
      ['wind', 'Max gusts', wind(d.gust)],
    ].map(([ic, k, v]) => `<li><span class="i">${UI[ic]}</span><span class="k">${k}</span><span class="v">${v}</span></li>`).join('');

    $('#day-periods').innerHTML = d.periods.map((p) => `
      <li>
        <span class="p-name">${p.name}</span>
        <span class="ic">${weatherIcon(describe(p.code).kind, p.isDay)}</span>
        <span class="p-what"><span>${describe(p.code).text}</span><span class="small">${p.chance}% · ${temp(p.temp)}</span></span>
      </li>`).join('');

    $('#day-more').innerHTML = [
      ['Feels like', `${temp(d.feelsHi)} to ${temp(d.feelsLo)}`, 'Humidity and wind change how hot the air feels. On sticky monsoon days this runs well above the thermometer.'],
      ['Rain expected', rain(d.mm), `${imdCategory(d.mm)} by IMD's 24-hour scale. ${wettest(d)}`],
      ['Sunrise and sunset', `${clockLabel(d.sunrise)}, ${clockLabel(d.sunset)}`, 'Flooded roads are harder to spot after dark. Finish travel before sunset on wet days.'],
    ].map(([k, v, why]) => `<div><dt><span>${k}</span><span>${v}</span></dt><dd>${why}</dd></div>`).join('');
    box.showModal();
  }
  box.addEventListener('click', (e) => { if (e.target === box) box.close(); });
  $('#days').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) openDay(Number(b.dataset.i)); });
  $('#chart').addEventListener('click', (e) => { const g = e.target.closest('[data-i]'); if (g) openDay(Number(g.dataset.i)); });
  $('#chart').addEventListener('keydown', (e) => { const g = e.target.closest('[data-i]'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDay(Number(g.dataset.i)); } });
  $('#week-retry').addEventListener('click', () => $('#retry').click());

  let wasNarrow = innerWidth < 700;
  addEventListener('resize', () => { const n = innerWidth < 700; if (n !== wasNarrow && days.length) { wasNarrow = n; drawChart(); } });

  return {
    /* called by app.js whenever fresh (or cached) weather arrives */
    render(w, savedAt) {
      lastW = w;
      days = w.daily.time.slice(1, 7).map((_, k) => buildDay(w, k + 1));   // tomorrow + 5
      $('#week-error').hidden = true;
      $('#days').hidden = false;
      document.querySelector('.chart-card').hidden = false;
      const first = days[0].d, last = days[days.length - 1].d;
      $('#report-sub').textContent = `${$('#place').textContent} · ${first.getDate()} ${MON[first.getMonth()]} to ${last.getDate()} ${MON[last.getMonth()]}` + (savedAt ? ' · saved copy, offline' : '');
      drawChart();
      drawDays();
    },
    fail() {
      days = [];
      $('#chart').innerHTML = '';
      document.querySelector('.chart-card').hidden = true;
      $('#days').hidden = true;
      $('#week-error').hidden = false;
      $('#report-sub').textContent = '';
    },
    setPlace(p) {
      mapPlace = { lat: p.lat, lon: p.lon };
      loadMap();
    },
    onView(view) {
      // the map loads the first time its column is actually visible
      const visible = (view === 'map' || view === 'week') && getComputedStyle($('#map-card')).display !== 'none';
      if (visible && !mapShown) { mapShown = true; loadMap(); }
    },
  };
})();
window.Week = Week;   // app.js looks for it on window (a top-level const isn't put there)
Week.onView(document.body.dataset.view || 'today');   // app.js picked the page before this file loaded
