/* =====================================================================
   sky.js — the live, realistic background.
   The sky colour comes from CSS (body[data-sky]). This canvas paints
   what is in that sky, matched to the real weather:

   1. CLOUDS   Real-looking clouds made from "fractal noise" (many layers
               of smooth random patterns added together, the same trick
               films and games use). Two layers drift at different speeds
               so the sky has depth. How much sky they cover follows the
               real cloud cover; how dark they are follows the weather.
   2. RAIN     Three depths of drops (far, middle, near). The number,
               length and speed follow the real rain rate in mm per hour,
               slanted by the real wind. Heavier rain adds splashes at the
               bottom and a grey haze.
   3. LIGHTNING Only during thunderstorms, every 8–18 seconds: either a
               branching bolt or a flash inside the clouds, with a
               moderate white glow that fades out. Never rapid flicker.

   With "reduce motion" on, it paints one still sky with no rain or
   lightning movement.
   ===================================================================== */
const Sky = (function () {
  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0;
  let state = { scene: 'cloudy-day', rate: 0, wind: 0, clouds: 0.6, storm: false };
  let layers = [], drops = [], splashes = [], stars = [];
  let flash = null, nextFlash = 0, running = false, last = 0;

  /* ---------- 1. cloud texture from fractal noise ----------------- */
  // Smooth random values on a grid, blended between grid points.
  function makeNoise(seed, period) {
    const rand = (x, y) => {
      x = ((x % period) + period) % period;            // wraps sideways, so clouds tile
      let n = x * 374761393 + y * 668265263 + seed * 2147483647;
      n = (n ^ (n >>> 13)) * 1274126177;
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    };
    const fade = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = fade(x - xi), yf = fade(y - yi);
      const a = rand(xi, yi), b = rand(xi + 1, yi), c = rand(xi, yi + 1), d = rand(xi + 1, yi + 1);
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    };
  }

  // colours of the lit top and the shadowed base of the clouds, per sky
  const CLOUD_TONES = {
    'clear-day':   { top: [255, 255, 255], base: [196, 210, 226] },
    'cloudy-day':  { top: [250, 251, 252], base: [150, 164, 178] },
    'rain-day':    { top: [168, 180, 192], base: [72, 84, 98] },
    'storm':       { top: [120, 132, 146], base: [30, 38, 48] },
    'clear-night': { top: [70, 86, 112],   base: [20, 28, 44] },
    'rain-night':  { top: [72, 84, 100],   base: [18, 24, 32] },
  };

  /* One cloud texture. Used for the big sky and for the small weather
     pictures. TW×TH is the texture size; fade = how fast clouds thin out
     towards the bottom (0 = no thinning). */
  function cloudTexture({ seed, cover, scale, tone, TW = 384, TH = 200, alpha = 220, fade = 2.2, octaves: levels = 5 }) {
    const period = Math.round(6 * scale);    // whole number, so the noise repeats exactly across the width
    const octaves = [1, 2, 4, 8, 16].slice(0, levels).map((f, i) => ({ f, amp: 0.5 ** i, n: makeNoise(seed + i * 17, period * f) }));
    const total = octaves.reduce((s, o) => s + o.amp, 0);
    const fbm = (x, y) => octaves.reduce((s, o) => s + o.n(x * o.f, y * o.f) * o.amp, 0) / total;

    // more cloud cover → lower threshold → more of the noise becomes cloud
    const threshold = 0.62 - cover * 0.34;
    const img = new ImageData(TW, TH);
    for (let y = 0; y < TH; y++) {
      const v = y / TH;
      const fadeDown = fade ? Math.min(1, (1 - v) * fade) : 1;   // clouds thin out towards the bottom
      for (let x = 0; x < TW; x++) {
        const nx = (x / TW) * period, ny = (y / TH) * scale * 3.2;
        const n = fbm(nx, ny);
        let a = (n - threshold) / 0.2;
        a = Math.max(0, Math.min(1, a));
        a = a * a * (3 - 2 * a) * fadeDown;
        if (a <= 0) continue;
        // light from above: compare with the noise a little higher up
        const lit = Math.max(0, Math.min(1, 0.55 + (n - fbm(nx, ny - 0.25)) * 5 - v * 0.35));
        const i = (y * TW + x) * 4;
        img.data[i]     = tone.base[0] + (tone.top[0] - tone.base[0]) * lit;
        img.data[i + 1] = tone.base[1] + (tone.top[1] - tone.base[1]) * lit;
        img.data[i + 2] = tone.base[2] + (tone.top[2] - tone.base[2]) * lit;
        img.data[i + 3] = a * alpha;
      }
    }
    const c = document.createElement('canvas');
    c.width = TW; c.height = TH;
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  }

  function cloudLayer(seed, cover, scale, height, near) {
    const tone = CLOUD_TONES[state.scene] || CLOUD_TONES['cloudy-day'];
    const tex = cloudTexture({ seed, cover, scale, tone, alpha: near ? 245 : 200 });
    // speed in texture-widths per millisecond: a full crossing takes several minutes
    return { tex, height, offset: Math.random(), speed: near ? 0.0000022 : 0.0000012 };
  }

  /* ---------- 2. rain --------------------------------------------- */
  // drops per depth for a rain rate in mm per hour (scaled to the screen)
  function rainCounts(rate) {
    if (rate <= 0) return [0, 0, 0];
    const area = Math.max(0.4, (W * H) / (1400 * 900));
    const k = rate < 0.5 ? 0.35 : rate < RATE.light ? 0.7 : rate < RATE.heavy ? 1.4 : 2.4;
    return [140, 90, 40].map((n) => Math.round(n * k * area));
  }
  const DEPTH = [
    { len: 9,  speed: 9,  width: 0.8, alpha: 0.22 },   // far
    { len: 16, speed: 15, width: 1.1, alpha: 0.32 },   // middle
    { len: 28, speed: 23, width: 1.6, alpha: 0.42 },   // near
  ];
  function drop(depth, anywhere) {
    const drizzle = state.rate < 0.5;
    const d = DEPTH[depth];
    return {
      depth,
      x: Math.random() * (W + 300) - 150,
      y: anywhere ? Math.random() * H : -40 - Math.random() * H * 0.3,
      len: d.len * (drizzle ? 0.45 : 1) * (0.8 + Math.random() * 0.4),
      v: d.speed * (drizzle ? 0.55 : 1) * (0.85 + Math.random() * 0.3),
    };
  }

  /* ---------- 3. lightning ---------------------------------------- */
  // a jagged path made by repeatedly bending the middle of each segment
  function bolt(x1, y1, x2, y2, rough, depth, out) {
    if (depth === 0) { out.push([x1, y1, x2, y2]); return; }
    const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * rough;
    const my = (y1 + y2) / 2 + (Math.random() - 0.5) * rough * 0.3;
    bolt(x1, y1, mx, my, rough / 2, depth - 1, out);
    bolt(mx, my, x2, y2, rough / 2, depth - 1, out);
    if (depth > 2 && Math.random() < 0.35) {          // a side branch
      const bx = mx + (Math.random() - 0.5) * rough * 1.6, by = my + rough * (0.6 + Math.random());
      bolt(mx, my, bx, by, rough / 2.5, depth - 2, out.branches || (out.branches = []));
    }
  }
  function newFlash(time) {
    const x = W * (0.12 + Math.random() * 0.76);
    const cloudy = Math.random() < 0.4;                 // sometimes only the clouds light up
    const segs = [];
    if (!cloudy) bolt(x, H * 0.12, x + (Math.random() - 0.5) * W * 0.15, H * (0.55 + Math.random() * 0.3), W * 0.12, 7, segs);
    return { x, y: H * 0.15, start: time, segs, cloudy };
  }

  /* ---------- building and drawing --------------------------------- */
  function build() {
    const cover = Math.max(0.1, state.clouds);
    const heavySky = /rain|storm/.test(state.scene);
    layers = [
      cloudLayer(3, Math.min(1, cover + (heavySky ? 0.25 : 0)), 1, 0.75, false),
      cloudLayer(11, Math.min(1, cover * 0.85 + (heavySky ? 0.2 : 0)), 1.6, 0.6, true),
    ];
    drops = [];
    rainCounts(state.rate).forEach((n, depth) => { for (let i = 0; i < n; i++) drops.push(drop(depth, true)); });
    splashes = [];
    stars = state.scene === 'clear-night'
      ? Array.from({ length: 50 }, () => ({ x: Math.random() * W, y: Math.random() * H * 0.6, r: Math.random() * 1.2 + 0.3, t: Math.random() * 6 }))
      : [];
  }

  function resize() {
    // the sky is soft anyway, so draw it at normal resolution even on
    // sharp (Retina) screens: 4 times fewer pixels to paint every frame
    const dpr = 1;
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    build();
    if (reduce || !running) draw(0, 0);
  }

  function drawClouds(dt, glowBoost) {
    layers.forEach((L) => {
      if (!reduce) L.offset = (L.offset + L.speed * dt * (1 + Math.abs(state.wind) / 120)) % 1;
      const h = H * L.height, w = Math.max(W * 1.4, h * 2.6);   // stretched wide so the clouds look long
      const x = -L.offset * w;
      // Paint the texture as a repeating pattern instead of two copies side
      // by side. Two copies left a thin flickering line where they met;
      // a pattern wraps the edges smoothly, so there is no seam.
      if (!L.pattern) L.pattern = ctx.createPattern(L.tex, 'repeat-x');
      L.pattern.setTransform(new DOMMatrix().translateSelf(x, 0).scaleSelf(w / L.tex.width, h / L.tex.height));
      ctx.fillStyle = L.pattern;
      ctx.globalAlpha = 1;
      ctx.fillRect(0, 0, W, h);
      if (glowBoost > 0) {                                        // clouds light up during a flash
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = glowBoost * 0.55;
        ctx.fillRect(0, 0, W, h);
        ctx.globalCompositeOperation = 'source-over';
      }
    });
    ctx.globalAlpha = 1;
  }

  function draw(time, dt) {
    ctx.clearRect(0, 0, W, H);
    const dark = /night|rain|storm/.test(state.scene);

    // stars
    stars.forEach((s) => {
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(time / 1500 + s.t);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    });

    // lightning timing: rise in 90 ms, fade over ~700 ms
    let glow = 0;
    if (state.storm && !reduce) {
      if (!flash && time > nextFlash) flash = newFlash(time);
      if (flash) {
        const t = time - flash.start;
        glow = t < 90 ? t / 90 : Math.max(0, 1 - (t - 90) / 700);
        if (t > 800) { flash = null; nextFlash = time + 8000 + Math.random() * 10000; }
      }
    }

    drawClouds(dt, glow);

    if (flash && glow > 0) {
      // moderate white wash over the whole sky, strongest near the bolt
      const g = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, Math.max(W, H) * 0.8);
      g.addColorStop(0, `rgba(255,255,255,${0.32 * glow})`);
      g.addColorStop(1, `rgba(220,230,255,${0.08 * glow})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      if (flash.segs.length) {
        const strokeAll = (segs, width) => {
          ctx.lineWidth = width;
          ctx.beginPath();
          segs.forEach(([a, b, c, d]) => { ctx.moveTo(a, b); ctx.lineTo(c, d); });
          ctx.stroke();
        };
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = `rgba(210,225,255,${0.35 * glow})`;   // outer glow
        ctx.shadowColor = 'rgba(200,215,255,0.9)'; ctx.shadowBlur = 18;
        strokeAll(flash.segs, 6);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(255,255,255,${0.95 * glow})`;   // bright core
        strokeAll(flash.segs, 1.8);
        if (flash.segs.branches) strokeAll(flash.segs.branches, 1);
      }
    }

    // grey haze in heavy rain
    if (state.rate >= RATE.light) {
      ctx.fillStyle = dark ? 'rgba(150,165,180,0.10)' : 'rgba(120,135,150,0.08)';
      ctx.fillRect(0, 0, W, H);
    }

    // rain
    if (drops.length) {
      const slant = Math.max(-0.4, Math.min(0.4, state.wind / 70));
      const colour = dark ? '220,232,245' : '70,100,140';
      ctx.lineCap = 'round';
      DEPTH.forEach((d, depth) => {
        ctx.lineWidth = d.width;
        ctx.strokeStyle = `rgba(${colour},${d.alpha * (state.rate < 0.5 ? 0.7 : 1)})`;
        ctx.beginPath();
        drops.forEach((p, i) => {
          if (p.depth !== depth) return;
          if (!reduce) {
            p.y += p.v * dt / 16; p.x += p.v * slant * dt / 16;
            if (p.y > H + 30) {
              if (depth === 2 && state.rate >= RATE.light && Math.random() < 0.6) splashes.push({ x: p.x, y: H - 4 - Math.random() * 30, t: 0 });
              drops[i] = drop(depth, false);
              return;
            }
          }
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.len * slant, p.y - p.len);
        });
        ctx.stroke();
      });

      // splashes: small rings that widen and fade
      ctx.lineWidth = 1;
      splashes = splashes.filter((s) => (s.t += dt) < 380);
      splashes.forEach((s) => {
        const p = s.t / 380;
        ctx.strokeStyle = `rgba(${colour},${0.45 * (1 - p)})`;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, 2 + p * 9, 0.8 + p * 2.5, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
      });
    }
    ctx.globalAlpha = 1;
  }

  function loop(t) {
    const dt = Math.min(50, t - (last || t));
    last = t;
    if (!document.hidden) {
      draw(t, dt);
    }
    requestAnimationFrame(loop);
  }

  addEventListener('resize', resize);
  resize();

  return {
    /* scene: clear-day | cloudy-day | rain-day | storm | clear-night | rain-night
       rate:  rain in mm per hour,  wind: km/h,  clouds: 0–1 */
    set(next) {
      state = { ...state, ...next };
      document.body.dataset.sky = state.scene;
      build();
      nextFlash = performance.now() + 2000;
      if (reduce) { draw(0, 0); return; }
      if (!running) { running = true; requestAnimationFrame(loop); }
    },
  };
})();
