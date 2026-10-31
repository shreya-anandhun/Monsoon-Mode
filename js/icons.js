/* =====================================================================
   icons.js — every picture in the app, drawn as SVG in code.
   weatherIcon(kind, isDay) gives the big soft weather pictures.
   UI holds the small line icons used on buttons.
   Colours: sun and lightning use the yellow, rain uses the blue,
   cloud shadows use the grey.
   ===================================================================== */

let _gid = 0; // every icon needs its own gradient ids

function weatherIcon(kind, isDay = true) {
  const id = 'g' + (++_gid);
  const defs = `
    <defs>
      <radialGradient id="${id}sun" cx="40%" cy="35%" r="70%">
        <stop offset="0" stop-color="#ffe9a6"/><stop offset=".55" stop-color="#f4c24d"/><stop offset="1" stop-color="#dea82a"/>
      </radialGradient>
      <linearGradient id="${id}moon" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fbf8ee"/><stop offset="1" stop-color="#c6ccd6"/>
      </linearGradient>
      <linearGradient id="${id}cl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cdd6df"/>
      </linearGradient>
      <linearGradient id="${id}cd" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a9b6c2"/><stop offset="1" stop-color="#5a6973"/>
      </linearGradient>
      <linearGradient id="${id}drop" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#7fb0ff"/><stop offset="1" stop-color="#2a6fde"/>
      </linearGradient>
      <linearGradient id="${id}bolt" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#dea82a"/>
      </linearGradient>
    </defs>`;

  const sun = (x, y, r) => `
    <circle cx="${x}" cy="${y}" r="${r * 1.45}" fill="#f4c24d" opacity=".18"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="url(#${id}sun)"/>`;
  // crescent moon: a full circle with a smaller circle cut out of it
  const moon = (x, y, r) => `
    <mask id="${id}mk"><circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/><circle cx="${x + r * 0.5}" cy="${y - r * 0.35}" r="${r * 0.82}" fill="#000"/></mask>
    <circle cx="${x}" cy="${y}" r="${r * 1.4}" fill="#fbf8ee" opacity=".12"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="url(#${id}moon)" mask="url(#${id}mk)"/>`;
  // a fluffy cloud, drawn in a 100×60 box, then moved and scaled
  const cloud = (x, y, s, dark) => `
    <g transform="translate(${x} ${y}) scale(${s})">
      <path d="M22 60C10 60 4 50 6 42 8 32 18 28 26 30 28 16 42 8 54 10 66 12 74 22 74 32 86 30 96 38 94 48 92 56 86 60 80 60Z"
        fill="url(#${id}${dark ? 'cd' : 'cl'})"/>
    </g>`;
  const drop = (x, y, s = 1) => `
    <path transform="translate(${x} ${y}) scale(${s})" d="M0 0C3 5 5 8 5 11a5 5 0 0 1-10 0C-5 8-3 5 0 0z" fill="url(#${id}drop)"/>`;
  const bolt = (x, y) => `
    <path transform="translate(${x} ${y})" d="M8 0h14l-7 13h9L6 36l5-16H2z" fill="url(#${id}bolt)"/>`;
  const sky = (x, y, r) => (isDay ? sun(x, y, r) : moon(x, y, r));

  let body = '';
  switch (kind) {
    case 'clear':   body = sky(60, 60, 30); break;
    case 'partly':  body = sky(44, 42, 22) + cloud(24, 46, 0.85, false); break;
    case 'cloudy':  body = cloud(30, 26, 0.75, true) + cloud(12, 44, 0.95, false); break;
    case 'fog':     body = cloud(14, 24, 0.95, false) +
                      '<g stroke="#5a6973" stroke-width="5" stroke-linecap="round" opacity=".7"><path d="M24 92h58"/><path d="M38 104h56"/></g>'; break;
    case 'drizzle': body = cloud(12, 22, 0.95, false) + drop(40, 84, 0.8) + drop(64, 90, 0.8) + drop(86, 82, 0.8); break;
    case 'rain':    body = (isDay ? sun(82, 30, 16) : '') + cloud(10, 22, 0.95, false) + drop(36, 84) + drop(60, 92) + drop(84, 82); break;
    case 'heavy':   body = cloud(10, 20, 0.98, true) + drop(28, 82) + drop(48, 92) + drop(68, 82) + drop(88, 92) + drop(38, 104, 0.7) + drop(78, 104, 0.7); break;
    case 'storm':   body = cloud(10, 18, 0.98, true) + bolt(48, 70) + drop(30, 84) + drop(88, 86); break;
    default:        body = cloud(12, 30, 0.95, false);
  }
  return `<svg class="wx" viewBox="0 0 120 120" aria-hidden="true">${defs}${body}</svg>`;
}

/* ---------- small line icons ------------------------------------- */
const line = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

const UI = {
  pin:      line('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  bell:     line('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  umbrella: line('<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v6.5a2 2 0 0 1-4 0"/><path d="M12 3v0"/>'),
  warn:     line('<path d="M12 3 2 20h20z"/><path d="M12 10v4"/><path d="M12 17v.01"/>'),
  today:    line('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>'),
  map:      line('<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>'),
  week:     line('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  ready:    line('<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>'),
  refresh:  line('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  ext:      line('<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  close:    line('<path d="M6 6l12 12M18 6 6 18"/>'),
  locate:   line('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  drop:     line('<path d="M12 3c3.5 4.5 6 8 6 11a6 6 0 0 1-12 0c0-3 2.5-6.5 6-11z"/>'),
  wind:     line('<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 16h15a3 3 0 1 1-3 3"/><path d="M3 12h8"/>'),
  humid:    line('<path d="M8 4c2 2.6 3.5 4.6 3.5 6.3a3.5 3.5 0 0 1-7 0C4.5 8.6 6 6.6 8 4z"/><path d="M16.5 10c2 2.6 3.5 4.6 3.5 6.3a3.5 3.5 0 0 1-7 0c0-1.7 1.5-3.7 3.5-6.3z"/>'),
  chevron:  line('<path d="m6 9 6 6 6-6"/>'),
  news:     line('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h10M7 13h10M7 17h6"/>'),
};
