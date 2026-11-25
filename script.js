/* =====================================================================
   Playa Columpio Celestún · script.js
   Sin librerías. Un solo motor de scroll (scroll + resize → rAF) que escribe
   el progreso 0–1 de cada sección en la variable CSS --p.
   El contenido es visible por defecto: todo lo que anima tiene respaldo.
   ===================================================================== */
(() => {
  'use strict';
  window.__pcOk = true;

  /* Único lugar donde vive el número de WhatsApp (formato internacional sin "+"). */
  const WHATSAPP_NUMBER = "529991778701";

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const root = document.documentElement;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const mqFine = matchMedia('(hover: hover) and (pointer: fine)');
  const mqDesk = matchMedia('(min-width: 1024px)');
  let reduce = mqReduce.matches;
  let vw = innerWidth, vh = innerHeight;

  /* ------------------------------------------------------------------
     0 · Plantillas (flamencos) y WhatsApp
     ------------------------------------------------------------------ */
  const tplFlam = $('#tpl-flam');
  if (tplFlam) $$('[data-flam]').forEach(el => { el.innerHTML = tplFlam.innerHTML; });

  const waURL = msg => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  const hasWA = /^\d{10,15}$/.test(WHATSAPP_NUMBER);

  (function setupWA() {
    $$('[data-wa]').forEach(a => {
      if (!hasWA) { a.hidden = true; return; }
      a.href = waURL(a.dataset.wa);
      a.target = '_blank';
      a.rel = 'noopener';
    });
    const wa = $('#wa');
    if (!hasWA) {
      if (wa) wa.hidden = true;
      const f = $('#form'), n = $('#nowa');
      if (f) f.hidden = true;
      if (n) n.hidden = false;
    }
  })();

  /* ------------------------------------------------------------------
     1 · Cargador (≤ 2.5 s; respaldo CSS + respaldo en el <head>)
     ------------------------------------------------------------------ */
  const loader = $('#loader');
  const pctEl = $('#pct');
  const tStart = performance.now();
  let loaderDone = false;
  const MIN_T = reduce ? 500 : 1200;
  const MAX_T = reduce ? 500 : 1800;

  function finishLoader() {
    if (loaderDone) return;
    loaderDone = true;
    if (pctEl) pctEl.textContent = '100';
    if (loader) loader.classList.add('is-done');
    root.classList.remove('loading');
    setTimeout(() => { root.classList.add('is-ready'); startReveal(); startBubble(); }, 140);
  }
  (function runLoader() {
    const step = () => {
      if (loaderDone) return;
      const p = clamp((performance.now() - tStart) / 1600);
      if (pctEl) pctEl.textContent = String(Math.round(p * 100));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(finishLoader, MAX_T);
    const onLoad = () => setTimeout(finishLoader, Math.max(0, MIN_T - (performance.now() - tStart)));
    if (document.readyState === 'complete') onLoad(); else addEventListener('load', onLoad, { once: true });
    setTimeout(() => root.classList.remove('loading'), 2200);
  })();

  /* ------------------------------------------------------------------
     2 · Revelado al hacer scroll (IntersectionObserver + respaldo geométrico)
     ------------------------------------------------------------------ */
  let revealStarted = false;
  let pending = [];
  let ioReveal = null;

  function show(el) { el.classList.add('is-in'); }
  function sweep() {
    if (!revealStarted) return;
    pending = pending.filter(el => !el.classList.contains('is-in'));
    for (const el of pending) {
      const r = el.getBoundingClientRect();
      if ((r.width || r.height) && r.bottom > 0 && r.top < vh * .95) show(el);
    }
  }
  function startReveal() {
    if (revealStarted) return;
    revealStarted = true;
    pending = $$('[data-reveal]');
    if ('IntersectionObserver' in window) {
      ioReveal = new IntersectionObserver(es => {
        es.forEach(e => { if (e.isIntersecting) { show(e.target); ioReveal.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -6% 0px', threshold: .01 });
      pending.forEach(el => ioReveal.observe(el));
    }
    sweep();
    setTimeout(sweep, 1500);
    setTimeout(sweep, 3500);
  }

  /* ------------------------------------------------------------------
     3 · Modos (scroll-on = hay animación ligada al scroll; pin-on = escritorio)
     ------------------------------------------------------------------ */
  let scrollOn = false, pinOn = false;
  function setMode() {
    const s = !reduce;
    const p = s && mqDesk.matches;
    if (s !== scrollOn || p !== pinOn) {
      scrollOn = s; pinOn = p;
      root.classList.toggle('scroll-on', scrollOn);
      root.classList.toggle('pin-on', pinOn);
      layout();
    }
  }
  mqReduce.addEventListener && mqReduce.addEventListener('change', () => { reduce = mqReduce.matches; setMode(); initCanvasState(); });
  mqDesk.addEventListener && mqDesk.addEventListener('change', setMode);

  /* ------------------------------------------------------------------
     4 · Motor de scroll
     ------------------------------------------------------------------ */
  const barEl = $('#bar');
  const hdr = $('#hdr');
  const progEls = $$('[data-prog]').map(el => ({ el, mode: el.dataset.prog, last: -1 }));
  const handlers = {};
  let ticking = false, lastY = scrollY, boost = 0, boostRunning = false;

  function requestTick() { if (!ticking) { ticking = true; requestAnimationFrame(tick); } }

  function progressOf(mode, r) {
    switch (mode) {
      case 'hero': return clamp(-r.top / Math.max(1, r.height));
      case 'pin': {
        const den = r.height - vh;
        return den > 0 ? clamp(-r.top / den) : clamp((vh - r.top) / (vh + r.height));
      }
      case 'draw': return clamp((vh * .7 - r.top) / Math.max(1, r.height));
      case 'enter': return clamp((vh - r.top) / Math.max(1, Math.min(r.height, vh)));
      default: return clamp((vh - r.top) / (vh + r.height));
    }
  }

  function tick() {
    ticking = false;
    vw = innerWidth; vh = innerHeight;
    const y = scrollY;

    if (barEl) {
      const max = root.scrollHeight - vh;
      barEl.style.setProperty('--sp', max > 0 ? clamp(y / max).toFixed(4) : '0');
    }
    if (hdr) hdr.classList.toggle('is-compact', y > 40);

    const d = Math.abs(y - lastY); lastY = y;
    if (d > 0 && !reduce) { boost = Math.min(3, boost + d * .02); startBoostLoop(); }

    for (const it of progEls) {
      const r = it.el.getBoundingClientRect();
      const p = progressOf(it.mode, r);
      if (Math.abs(p - it.last) > .0005) {
        it.last = p;
        it.el.style.setProperty('--p', p.toFixed(4));
      }
      const fn = handlers[it.el.id];
      if (fn) fn(it.last < 0 ? p : it.last, r);
    }
    checkCounters();
    sweep();
  }
  addEventListener('scroll', requestTick, { passive: true });
  addEventListener('resize', () => { vw = innerWidth; vh = innerHeight; layout(); resizeCanvas && resizeCanvas(); });

  /* Velocidad de las cintas según el scroll */
  const bandTracks = $$('.band__track');
  function startBoostLoop() {
    if (boostRunning) return;
    boostRunning = true;
    const loop = () => {
      boost *= .93;
      const rate = 1 + boost;
      bandTracks.forEach(t => { if (t.getAnimations) t.getAnimations().forEach(a => { a.playbackRate = rate; }); });
      if (boost > .01) requestAnimationFrame(loop);
      else { boost = 0; boostRunning = false; bandTracks.forEach(t => t.getAnimations && t.getAnimations().forEach(a => { a.playbackRate = 1; })); }
    };
    requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------
     5 · Header, menú y navegación activa
     ------------------------------------------------------------------ */
  const menu = $('#menu'), burger = $('#burger');
  function setMenu(open) {
    if (!menu || !burger) return;
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    burger.setAttribute('aria-expanded', String(open));
    root.classList.toggle('menu-open', open);
  }
  if (burger && menu) {
    burger.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
    $$('a', menu).forEach(a => a.addEventListener('click', () => setMenu(false)));
    addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
    mqDesk.addEventListener && mqDesk.addEventListener('change', () => { if (mqDesk.matches) setMenu(false); });
  }

  (function navActive() {
    if (!('IntersectionObserver' in window)) return;
    const links = $$('.nav a');
    const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver(es => {
      es.forEach(e => {
        const a = map.get(e.target.id);
        if (a && e.isIntersecting) { links.forEach(l => l.classList.remove('is-active')); a.classList.add('is-active'); }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  })();

  /* ------------------------------------------------------------------
     6 · Hero: paralaje con el cursor + canvas de brillos y ondas
     ------------------------------------------------------------------ */
  const hero = $('#inicio');
  const cluster = $('#cluster');
  (function heroCursor() {
    if (!hero || !cluster) return;
    let tx = 0, ty = 0, cx = 0, cy = 0, running = false;
    const loop = () => {
      cx = lerp(cx, tx, .08); cy = lerp(cy, ty, .08);
      cluster.style.setProperty('--mx', cx.toFixed(3));
      cluster.style.setProperty('--my', cy.toFixed(3));
      if (Math.abs(cx - tx) > .002 || Math.abs(cy - ty) > .002) requestAnimationFrame(loop); else running = false;
    };
    const go = () => { if (!running) { running = true; requestAnimationFrame(loop); } };
    hero.addEventListener('pointermove', e => {
      if (!mqFine.matches || reduce || e.pointerType === 'touch') return;
      const r = hero.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - .5) * 2;
      ty = ((e.clientY - r.top) / r.height - .5) * 2;
      go();
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { tx = 0; ty = 0; go(); });
  })();

  let resizeCanvas = null;
  let initCanvasState = () => {};
  (function heroCanvas() {
    const cv = $('#brillos');
    if (!cv || !cv.getContext) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0, h = 0, glints = [], ripples = [], visible = true, raf = 0, lastT = performance.now(), lastRip = 0;

    function build() {
      const n = w < 600 ? 44 : 70;
      glints = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: h * (.06 + Math.random() * .92),
        r: .8 + Math.random() * 1.8, ph: Math.random() * 6.283, sp: .6 + Math.random() * 1.6,
        c: Math.random() < .35 ? '255,226,150' : '255,255,255'
      }));
    }
    function draw(now, dt) {
      ctx.clearRect(0, 0, w, h);
      const s = now / 1000;
      for (const g of glints) {
        let a = (Math.sin(s * g.sp + g.ph) + 1) / 2;
        a = a * a * a;
        if (reduce) a = .45;
        ctx.fillStyle = `rgba(${g.c},${(a * .9).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(g.x, g.y, g.r * 2.6, g.r * .8, 0, 0, 6.283);
        ctx.fill();
      }
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.age += dt;
        const a = .75 - rp.age * .55;
        if (a <= 0) { ripples.splice(i, 1); continue; }
        const rad = 8 + rp.age * 70;
        ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(rp.x, rp.y, rad, rad * .36, 0, 0, 6.283);
        ctx.stroke();
      }
    }
    function frame(now) {
      raf = 0;
      if (!visible || document.hidden || reduce) return;
      const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
      draw(now, dt);
      raf = requestAnimationFrame(frame);
    }
    function start() { if (!raf && visible && !document.hidden && !reduce) { lastT = performance.now(); raf = requestAnimationFrame(frame); } }
    resizeCanvas = function () {
      const r = cv.getBoundingClientRect();
      w = r.width; h = r.height;
      if (!w || !h) return;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      draw(performance.now(), 0);
    };
    initCanvasState = function () { if (reduce) { draw(performance.now(), 0); } else start(); };
    resizeCanvas();
    initCanvasState();

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) start(); }, { threshold: 0 }).observe(cv);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });

    function ripple(e) {
      if (reduce) return;
      const now = performance.now();
      if (now - lastRip < 110) return;
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (y < 0 || y > r.height || x < 0 || x > r.width) return;
      lastRip = now;
      ripples.push({ x, y, age: 0 });
      if (ripples.length > 8) ripples.shift();
      start();
    }
    if (hero) {
      hero.addEventListener('pointermove', ripple, { passive: true });
      hero.addEventListener('pointerdown', ripple, { passive: true });
    }
  })();

  /* ------------------------------------------------------------------
     7 · Manifiesto: palabras que se encienden
     ------------------------------------------------------------------ */
  const words = [];
  (function splitWords() {
    const p = $('[data-words]');
    if (!p) return;
    const text = p.textContent.trim().split(/\s+/);
    p.textContent = '';
    p.setAttribute('aria-label', text.join(' '));
    text.forEach((t, i) => {
      const s = document.createElement('span');
      s.className = 'wd'; s.textContent = t; s.setAttribute('aria-hidden', 'true');
      p.appendChild(s);
      if (i < text.length - 1) p.appendChild(document.createTextNode(' '));
      words.push({ s, o: -1 });
    });
  })();
  function updateWords() {
    for (const w of words) {
      let o = 1;
      if (!reduce) {
        const t = w.s.getBoundingClientRect().top;
        o = clamp((vh * .8 - t) / (vh * .18));
      }
      if (Math.abs(o - w.o) > .02) { w.o = o; w.s.style.setProperty('--o', o.toFixed(3)); }
    }
  }
  handlers.recorrido = (p, r) => { if (r.bottom > -100 && r.top < vh + 100) updateWords(); };

  /* Count-up */
  const counters = $$('[data-count]').map(el => ({ el, done: false, target: +el.dataset.count }));
  function runCount(c) {
    c.done = true;
    if (reduce) return;
    const t0 = performance.now(), dur = 1400;
    const step = now => {
      const k = clamp((now - t0) / dur);
      c.el.textContent = String(Math.round(c.target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step); else c.el.textContent = String(c.target);
    };
    c.el.textContent = '0';
    requestAnimationFrame(step);
  }
  function checkCounters() {
    if (!revealStarted) return;
    for (const c of counters) {
      if (c.done) continue;
      const r = c.el.getBoundingClientRect();
      if ((r.width || r.height) && r.top < vh * .88 && r.bottom > 0) runCount(c);
    }
  }

  /* ------------------------------------------------------------------
     8 · La ruta (carta náutica)
     ------------------------------------------------------------------ */
  const ruta = $('#ruta');
  const stopEls = $$('.stop', ruta || document);
  const segEls = $$('#segs i');
  const stopsBox = $('#stops');
  const pillB = $('#pill b');
  const stopNames = stopEls.map(s => ($('h3', s) || {}).textContent || '');
  const chart = { ready: false, failed: false };
  let curStop = -1;

  function buildChart() {
    if (chart.ready || chart.failed) return;
    try {
      const prog = $('#route-prog'), base = $('#route-base'), nodesG = $('#nodes');
      if (!prog || !nodesG) { chart.failed = true; return; }
      const NS = 'http://www.w3.org/2000/svg';
      chart.prog = prog;
      chart.L = prog.getTotalLength();
      prog.style.strokeDasharray = chart.L;
      prog.style.strokeDashoffset = chart.L;
      if (base) base.style.strokeLinecap = 'round';
      chart.pts = [];
      chart.nodes = [];
      nodesG.textContent = '';
      for (let i = 0; i < 9; i++) {
        const pt = prog.getPointAtLength(chart.L * i / 8);
        chart.pts.push(pt);
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'node');
        g.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
        const ring = document.createElementNS(NS, 'circle'); ring.setAttribute('class', 'node__ring'); ring.setAttribute('r', '17');
        const c = document.createElementNS(NS, 'circle'); c.setAttribute('class', 'node__c'); c.setAttribute('r', '17');
        const t = document.createElementNS(NS, 'text'); t.setAttribute('class', 'node__t'); t.setAttribute('dy', '.35em'); t.textContent = String(i + 1);
        g.append(ring, c, t);
        nodesG.appendChild(g);
        chart.nodes.push({ g, state: '' });
      }
      chart.boat = $('#boat');
      chart.wake = $$('#wake circle');
      chart.label = $('#nlabel');
      chart.labelRect = chart.label ? $('rect', chart.label) : null;
      chart.labelText = chart.label ? $('text', chart.label) : null;
      chart.ready = true;
    } catch (err) { chart.failed = true; }
  }

  function updateChart(pb, s) {
    if (!chart.ready) return;
    const L = chart.L, l = L * pb, prog = chart.prog;
    prog.style.strokeDashoffset = (L * (1 - pb)).toFixed(1);
    const pt = prog.getPointAtLength(l);
    const a = prog.getPointAtLength(Math.min(L, l + 4)), b = prog.getPointAtLength(Math.max(0, l - 4));
    const ang = clamp(Math.atan2(a.y - b.y, a.x - b.x) * 180 / Math.PI, -35, 35);
    if (chart.boat) chart.boat.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${(pt.y - 8).toFixed(1)}) rotate(${ang.toFixed(1)})`);
    chart.wake.forEach((c, k) => {
      const q = prog.getPointAtLength(Math.max(0, l - (k + 1) * 15));
      c.setAttribute('cx', q.x.toFixed(1)); c.setAttribute('cy', (q.y + 6).toFixed(1));
    });
    chart.nodes.forEach((n, i) => {
      const st = (pb >= i / 8 - .002 ? 'is-visited ' : '') + (i === s ? 'is-current' : '');
      if (st !== n.state) { n.g.setAttribute('class', 'node ' + st); n.state = st; }
    });
    if (chart.label && chart.labelText) {
      const name = stopNames[s] || '';
      if (chart.labelText.textContent !== name) {
        chart.labelText.textContent = name;
        const wd = Math.round(name.length * 10.6 + 28);
        chart.labelRect.setAttribute('width', String(wd));
        chart.labelW = wd;
      }
      const wd = chart.labelW || 160, np = chart.pts[s];
      const x = clamp(np.x - wd / 2, 14, 986 - wd);
      let y = np.y - 56; if (y < 8) y = np.y + 26;
      chart.label.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      chart.label.setAttribute('opacity', '1');
    }
  }

  function updateRutaList(r) {
    if (!stopsBox) return;
    if (r.bottom < -50 || r.top > vh + 50) return;
    const br = stopsBox.getBoundingClientRect();
    stopsBox.style.setProperty('--lp', clamp((vh * .55 - br.top) / Math.max(1, br.height)).toFixed(4));
    if (pillB) {
      let idx = 0;
      stopEls.forEach((el, i) => { if (el.getBoundingClientRect().top < vh * .5) idx = i; });
      const txt = String(idx + 1);
      if (pillB.textContent !== txt) pillB.textContent = txt;
    }
  }

  handlers.ruta = (p, r) => {
    if (!pinOn) { updateRutaList(r); return; }
    const s = Math.min(8, Math.floor(p * 9));
    const pb = clamp((p * 9 - .5) / 8);
    updateChart(pb, s);
    if (s !== curStop) {
      stopEls.forEach((el, i) => { el.classList.toggle('is-active', i === s); el.classList.toggle('is-past', i < s); });
      segEls.forEach((x, i) => x.classList.toggle('on', i <= s));
      curStop = s;
    }
    ruta.classList.toggle('is-end', p > .97);
  };

  /* ------------------------------------------------------------------
     9 · Playa Columpio: la imagen se abre
     ------------------------------------------------------------------ */
  const col = $('#columpio');
  const colText = $('.col__text', col || document);
  handlers.columpio = p => {
    if (!scrollOn || !col) return;
    const e = ease(clamp(p / .6));
    const t = clamp((p - .55) / .25);
    col.style.setProperty('--e', e.toFixed(4));
    col.style.setProperty('--t', t.toFixed(4));
    if (colText) colText.classList.toggle('is-live', t > .6);
  };

  /* ------------------------------------------------------------------
     10 · Galería: scroll horizontal anclado + lightbox
     ------------------------------------------------------------------ */
  const gal = $('#galeria');
  const galTrack = $('#galTrack');
  const galImgs = $$('.gcard__img');
  function layoutGal() {
    if (!gal || !galTrack) return;
    if (pinOn) {
      const max = Math.max(0, galTrack.scrollWidth - vw);
      gal.style.height = (max + vh) + 'px';
    } else {
      gal.style.height = '';
      galTrack.style.transform = '';
      galImgs.forEach(i => i.style.removeProperty('--ix'));
    }
  }
  handlers.galeria = p => {
    if (!pinOn || !galTrack) return;
    const max = Math.max(0, galTrack.scrollWidth - vw);
    galTrack.style.transform = `translate3d(${(-p * max).toFixed(1)}px,0,0)`;
    galImgs.forEach(img => {
      const r = img.parentElement.getBoundingClientRect();
      const c = (r.left + r.width / 2 - vw / 2) / vw;
      img.style.setProperty('--ix', (clamp(c, -1, 1) * -7).toFixed(2));
    });
  };

  (function lightbox() {
    const lb = $('#lb'), img = $('#lbImg'), cap = $('#lbCap');
    const btns = $$('.gcard__btn');
    if (!lb || !img || !btns.length) return;
    let cur = 0;
    const set = i => {
      cur = (i + btns.length) % btns.length;
      const im = $('img', btns[cur]);
      img.src = im.currentSrc || im.src;
      img.alt = im.alt;
      const fc = $('figcaption', btns[cur].parentElement);
      cap.textContent = fc ? fc.textContent : '';
    };
    const openAt = i => {
      set(i);
      if (typeof lb.showModal === 'function') { if (!lb.open) lb.showModal(); } else lb.setAttribute('open', '');
    };
    const close = () => { if (typeof lb.close === 'function') lb.close(); else lb.removeAttribute('open'); };
    btns.forEach((b, i) => b.addEventListener('click', () => openAt(i)));
    lb.addEventListener('click', e => {
      const a = e.target.dataset ? e.target.dataset.lb : null;
      if (a === 'close' || e.target === lb) close();
      else if (a === 'prev') set(cur - 1);
      else if (a === 'next') set(cur + 1);
    });
    lb.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') set(cur - 1);
      if (e.key === 'ArrowRight') set(cur + 1);
    });
    let x0 = null;
    lb.addEventListener('pointerdown', e => { x0 = e.clientX; });
    lb.addEventListener('pointerup', e => {
      if (x0 === null) return;
      const dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) set(cur + (dx < 0 ? 1 : -1));
    });
  })();

  /* ------------------------------------------------------------------
     11 · Tilt 3D de tarjetas (solo puntero fino)
     ------------------------------------------------------------------ */
  (function tilt() {
    $$('[data-tilt]').forEach(el => {
      el.addEventListener('pointermove', e => {
        if (!mqFine.matches || reduce || e.pointerType === 'touch') return;
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        el.style.setProperty('--ry', ((x - .5) * 14).toFixed(2) + 'deg');
        el.style.setProperty('--rx', ((.5 - y) * 14).toFixed(2) + 'deg');
        el.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
        el.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
      });
      el.addEventListener('pointerleave', () => {
        el.style.setProperty('--ry', '0deg'); el.style.setProperty('--rx', '0deg');
      });
    });
  })();

  /* ------------------------------------------------------------------
     12 · Credencial 3D (scroll + cursor + giro)
     ------------------------------------------------------------------ */
  const credWrap = $('#cred');
  const guias = $('#guias');
  const credFlip = $('#credFlip');
  const credBtn = $('#credBtn');
  let credTarget = { ry: -20, rx: 8 }, credCur = { ry: -20, rx: 8 }, credCursor = { x: 0, y: 0 }, credRunning = false, credP = .5;
  function credApply() {
    if (!credWrap) return;
    credWrap.style.setProperty('--ry', credCur.ry.toFixed(2) + 'deg');
    credWrap.style.setProperty('--rx', credCur.rx.toFixed(2) + 'deg');
    credWrap.style.setProperty('--ang', (200 + credCur.ry * 4).toFixed(1) + 'deg');
    credWrap.style.setProperty('--sx', (-credCur.ry * 1.1).toFixed(1) + 'px');
  }
  function credLoop() {
    credCur.ry = lerp(credCur.ry, credTarget.ry, .1);
    credCur.rx = lerp(credCur.rx, credTarget.rx, .1);
    credApply();
    if (Math.abs(credCur.ry - credTarget.ry) > .05 || Math.abs(credCur.rx - credTarget.rx) > .05) requestAnimationFrame(credLoop);
    else credRunning = false;
  }
  function credGo() {
    credTarget.ry = (-28 + credP * 56) + credCursor.x * 12;
    credTarget.rx = 8 + credCursor.y * -6;
    if (reduce) { credCur.ry = -12; credCur.rx = 8; credApply(); return; }
    if (!credRunning) { credRunning = true; requestAnimationFrame(credLoop); }
  }
  handlers.guias = (p, r) => {
    if (r.bottom < -50 || r.top > vh + 50) return;
    credP = p; credGo();
  };
  if (guias && credWrap) {
    guias.addEventListener('pointermove', e => {
      if (!mqFine.matches || reduce || e.pointerType === 'touch') return;
      const r = credWrap.getBoundingClientRect();
      credCursor.x = clamp(((e.clientX - r.left) / r.width - .5) * 2, -1, 1);
      credCursor.y = clamp(((e.clientY - r.top) / r.height - .5) * 2, -1, 1);
      credGo();
    }, { passive: true });
    guias.addEventListener('pointerleave', () => { credCursor.x = 0; credCursor.y = 0; credGo(); });
  }
  function flipCred() {
    if (!credFlip) return;
    const on = credFlip.classList.toggle('is-flipped');
    if (credBtn) credBtn.setAttribute('aria-pressed', String(on));
  }
  if (credBtn) credBtn.addEventListener('click', flipCred);
  if (credFlip) credFlip.addEventListener('click', flipCred);

  /* ------------------------------------------------------------------
     13 · Preguntas (details animados)
     ------------------------------------------------------------------ */
  $$('.faq').forEach(d => {
    const sum = $('summary', d);
    if (!sum) return;
    sum.addEventListener('click', e => {
      e.preventDefault();
      if (d.open && d.classList.contains('is-open')) {
        d.classList.remove('is-open');
        setTimeout(() => { if (!d.classList.contains('is-open')) d.open = false; }, 470);
      } else {
        d.open = true;
        void d.offsetHeight;
        requestAnimationFrame(() => d.classList.add('is-open'));
      }
    });
  });

  /* ------------------------------------------------------------------
     14 · Formulario → WhatsApp
     ------------------------------------------------------------------ */
  (function form() {
    const f = $('#form');
    if (!f) return;
    const nombre = $('#f-nombre'), pers = $('#f-personas'), fecha = $('#f-fecha'), hor = $('#f-horario'), msg = $('#f-mensaje');
    const eN = $('#e-nombre'), eP = $('#e-personas');
    const setErr = (input, box, text) => {
      box.textContent = text;
      if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    };
    nombre.addEventListener('input', () => setErr(nombre, eN, ''));
    pers.addEventListener('input', () => setErr(pers, eP, ''));
    f.addEventListener('submit', e => {
      e.preventDefault();
      if (!hasWA) return;
      const n = nombre.value.trim();
      const k = parseInt(pers.value, 10);
      let first = null;
      if (!n) { setErr(nombre, eN, 'Cuéntanos tu nombre para saludarte.'); first = first || nombre; } else setErr(nombre, eN, '');
      if (!k || k < 1) { setErr(pers, eP, 'Indica cuántas personas van (mínimo 1).'); first = first || pers; } else setErr(pers, eP, '');
      if (first) { first.focus(); return; }
      let fechaTxt = '';
      if (fecha.value) {
        const [y, m, d] = fecha.value.split('-').map(Number);
        fechaTxt = new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
      }
      let text = `Hola, soy ${n}. Quiero hacer el recorrido en lancha por la ría de Celestún (Playa Columpio). Somos ${k} persona${k > 1 ? 's' : ''}`;
      if (fechaTxt) text += `, nos gustaría ir el ${fechaTxt}`;
      if (hor.value) text += ` en horario de ${hor.value}`;
      text += '.';
      if (msg.value.trim()) text += ' ' + msg.value.trim();
      window.open(waURL(text), '_blank', 'noopener');
    });
  })();

  /* ------------------------------------------------------------------
     15 · Burbuja del botón flotante (una sola vez)
     ------------------------------------------------------------------ */
  function startBubble() {
    const wa = $('#wa');
    if (!wa || wa.hidden) return;
    setTimeout(() => {
      wa.classList.add('show-bubble');
      setTimeout(() => wa.classList.remove('show-bubble'), 6000);
    }, 4000);
  }

  /* ------------------------------------------------------------------
     Layout general (cambio de modo, resize, fuentes)
     ------------------------------------------------------------------ */
  function layout() {
    vw = innerWidth; vh = innerHeight;
    if (pinOn) {
      buildChart();
      curStop = -1;
    } else {
      stopEls.forEach(el => el.classList.remove('is-active', 'is-past'));
      segEls.forEach(x => x.classList.remove('on'));
      if (ruta) ruta.classList.remove('is-end');
    }
    layoutGal();
    requestTick();
  }

  setMode();
  layout();
  tick();
  addEventListener('load', () => { layout(); resizeCanvas && resizeCanvas(); updateWords(); requestTick(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layout(); updateWords(); });
})();
