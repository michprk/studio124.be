/* ==========================================================================
   Studio 124 — interactions du site
   Héros : l’appareil photo tourne ; UN geste (molette, glissé, flèche, clic
   sur l’appareil ou le déclencheur) suffit : il se tourne vers vous, déclenche,
   flash, et le diaphragme s’ouvre sur le site. Ensuite : défilement amorti,
   apparitions, galerie continue, espaces, FAQ, lignes de téléphone en direct,
   réservation avec estimation (validation, anti-spam, API ou e-mail), cookies
   et mesure d’audience après accord, page 404.
   Chaque bloc est isolé : si l’un échoue, le reste du site fonctionne.
   ========================================================================== */
(() => {
  'use strict';
  const d = document.documentElement;
  const reduced = d.classList.contains('reduced');
  const BASE = d.dataset.base || '';
  const PAGE = d.dataset.page || '';
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const safe = (name, fn) => { try { fn(); } catch (error) { console.warn('[studio124] ' + name, error); } };
  const STUDIO_EMAIL = 'ceicrpasbl@gmail.com';
  const KEY = 's124_';
  const euro = (n) => new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 0 }).format(n) + ' €';

  /* ---------- Mesure d’audience (Google Analytics 4, uniquement après accord) ---------- */
  const GA_ID = (d.dataset.ga || '').trim();
  function track(name, params) {
    if (window.gtag && window.__s124Ga) window.gtag('event', name, params || {});
  }
  function loadAnalytics() {
    if (!GA_ID || window.__s124Ga) return;
    window.__s124Ga = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { anonymize_ip: true });
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
  }
  function clearAnalyticsCookies() {
    const host = location.hostname.split('.');
    document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => /^_ga/.test(n)).forEach((n) => {
      for (let i = 0; i < host.length; i++) document.cookie = n + '=; Max-Age=0; path=/; domain=' + host.slice(i).join('.');
      document.cookie = n + '=; Max-Age=0; path=/';
    });
  }
  // Le choix est redemandé après 6 mois (durée annoncée dans la politique de confidentialité)
  function readConsent() {
    try {
      const c = JSON.parse(localStorage.getItem(KEY + 'consent') || 'null');
      if (c && c.date && Date.now() - Date.parse(c.date) > 182 * 864e5) return null;
      return c;
    } catch (e) { return null; }
  }
  safe('cookies', () => {
    const box = $('[data-cookie]');
    const main = box && $('[data-cookie-main]', box);
    const prefs = box && $('[data-cookie-prefs]', box);
    const toggle = box && $('[data-consent-analytics]', box);
    const consent = readConsent();
    if (consent && consent.analytics) loadAnalytics();
    if (!box) return;
    const open = (showPrefs) => {
      const c = readConsent();
      if (toggle) toggle.checked = !!(c && c.analytics);
      box.hidden = false;
      main.hidden = !!showPrefs;
      prefs.hidden = !showPrefs;
      const btn = $('[data-consent="customize"]', box);
      if (btn) btn.setAttribute('aria-expanded', String(!!showPrefs));
    };
    const save = (analytics) => {
      try { localStorage.setItem(KEY + 'consent', JSON.stringify({ analytics, date: new Date().toISOString().slice(0, 10), v: 1 })); } catch (e) { /* navigation privée */ }
      box.hidden = true;
      if (analytics) loadAnalytics();
      else {
        if (window.gtag && window.__s124Ga) window.gtag('consent', 'update', { analytics_storage: 'denied' });
        clearAnalyticsCookies();
      }
    };
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-consent]');
      if (!b) return;
      const action = b.dataset.consent;
      if (action === 'accept') save(true);
      else if (action === 'refuse') save(false);
      else if (action === 'customize') open(true);
      else if (action === 'save') save(!!(toggle && toggle.checked));
    });
    $$('[data-cookie-open]').forEach((b) => b.addEventListener('click', () => open(true)));
    // sur l’accueil, le bandeau ne cache pas le héros : il arrive une fois l’appareil
    // déclenché (le visiteur a quitté le haut de page), ou au bout de 15 s
    if (!consent) {
      if (PAGE !== 'index') setTimeout(() => open(false), 900);
      else {
        let shown = false;
        const show = () => { if (shown || readConsent()) return; shown = true; window.removeEventListener('scroll', onScroll); setTimeout(() => open(false), 1200); };
        const onScroll = () => { if (window.scrollY > window.innerHeight * 0.5) show(); };
        window.addEventListener('scroll', onScroll, { passive: true });
        setTimeout(show, 15000);
      }
    }
  });

  // Clics suivis (boutons d’action, téléphone, WhatsApp, e-mail, agenda…)
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-track]');
    if (el) track(el.dataset.track, { link_url: el.getAttribute('href') || '', page: PAGE });
  });

  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

  /* ---------- Défilement amorti (Lenis) ----------
     La molette glisse au lieu d’avancer par crans. Le héros intercepte les gestes
     (heroInput) tant que la page est tout en haut. */
  const heroInput = { wheel: null, touch: null };
  let lenis = null;
  safe('lenis', () => {
    if (reduced || typeof window.Lenis !== 'function') return;
    lenis = new window.Lenis({
      lerp: 0.1,
      smoothWheel: true,
      syncTouch: false,
      autoRaf: true,
      respectReducedMotion: false, // le visiteur garde la main avec « Réduire les animations »
      virtualScroll: (data) => {
        const ev = data.event;
        const fn = ev.type.indexOf('wheel') > -1 ? heroInput.wheel : ev.type.indexOf('touch') > -1 ? heroInput.touch : null;
        if (fn && fn(data.deltaX, data.deltaY, ev)) { if (ev.cancelable) ev.preventDefault(); return false; }
        return true;
      }
    });
    window.__s124Lenis = lenis; // accès pratique pour le débogage
  });
  function scrollToY(y, duration) {
    if (lenis) lenis.scrollTo(y, { duration: duration || 1.3, easing: easeInOut, lock: true, force: true });
    else window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
  }
  function jumpToY(y) {
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
  }
  const header = $('[data-header]');
  const hdrH = () => (header ? header.offsetHeight : 0);
  const targetY = (el) => (el.id === 'top' ? 0 : el.getBoundingClientRect().top + window.scrollY - (el.matches('[data-shot]') ? 0 : hdrH()));

  /* ---------- Entrée du héros ---------- */
  safe('intro', () => {
    let done = false;
    const show = () => { if (!done) { done = true; requestAnimationFrame(() => d.classList.add('hero-in')); } };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(show);
    setTimeout(show, 700);
  });

  /* ---------- Moteur commun des animations continues ---------- */
  const scrubbers = [];
  const visible = new Set();
  let rafId = 0;
  let lastY = window.scrollY;
  function requestTick() { if (!rafId) rafId = requestAnimationFrame(frame); }
  function frame() {
    rafId = 0;
    const y = window.scrollY;
    const dy = y - lastY;
    lastY = y;
    let again = false;
    scrubbers.forEach((s) => { if (visible.has(s.el) && s.update(dy) === true) again = true; });
    if (again) requestTick();
  }
  function addScrubber(el, update, margin) {
    if (!el) return;
    scrubbers.push({ el, update });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) visible.add(el); else visible.delete(el); });
        requestTick();
      }, { rootMargin: margin || '20% 0px 20% 0px' }).observe(el);
    } else visible.add(el);
  }
  window.addEventListener('scroll', requestTick, { passive: true });
  window.addEventListener('resize', requestTick);

  /* ---------- En-tête : transparent sur le héros, voilé ensuite ---------- */
  const hero = $('[data-hero]');
  safe('header', () => {
    if (!header) return;
    const update = () => {
      const limit = hero ? hero.offsetHeight - hdrH() : 10;
      header.classList.toggle('is-solid', window.scrollY > limit - 2 || d.classList.contains('menu-open') || !hero);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // Lien actif selon la section affichée
    const links = $$('.hdr__nav a[data-nav]');
    if (!links.length || !('IntersectionObserver' in window)) return;
    const map = new Map(links.map((a) => [a.dataset.nav, a]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const link = map.get(entry.target.id);
        if (!link) return;
        if (entry.isIntersecting) { links.forEach((a) => a.classList.remove('is-active')); link.classList.add('is-active'); }
        else link.classList.remove('is-active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  });

  /* ---------- Menu mobile ---------- */
  safe('menu', () => {
    const btn = $('[data-menu-toggle]');
    const menu = $('[data-menu]');
    if (!btn || !menu) return;
    const label = $('.sr-only', btn);
    const set = (open) => {
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (label) label.textContent = open ? 'Fermer le menu' : 'Ouvrir le menu';
      d.classList.toggle('menu-open', open);
      if (lenis) { if (open) lenis.stop(); else lenis.start(); }
      if (header) header.classList.toggle('is-solid', open || window.scrollY > (hero ? hero.offsetHeight - hdrH() : -1));
      if (open) { const first = $('a', menu); if (first) first.focus({ preventScroll: true }); }
    };
    btn.addEventListener('click', () => set(menu.hidden));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', (e) => {
      if (menu.hidden) return;
      if (e.key === 'Escape') { set(false); btn.focus(); }
      if (e.key === 'Tab') {
        const items = [btn, ...$$('a, button', menu)];
        const i = items.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
        else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
      }
    });
    window.addEventListener('resize', () => { if (window.innerWidth > 1180 && !menu.hidden) set(false); });
  });

  /* ==========================================================================
     Le déclenchement : flash + diaphragme qui s’ouvre sur le site
     ========================================================================== */
  const flash = $('[data-flash]');
  const shotSection = $('[data-shot]');
  let shooting = false;

  // Diaphragme plein écran en SVG : N lames, l’ouverture est un polygone qui grandit
  // en tournant ; chaque lame prolonge une arête du polygone (effet « moulinet »).
  const iris = (() => {
    const svg = $('[data-iris]');
    if (!svg) return null;
    const NS = 'http://www.w3.org/2000/svg';
    const N = 7;
    svg.innerHTML = '';
    const defs = document.createElementNS(NS, 'defs');
    const grad = document.createElementNS(NS, 'radialGradient');
    grad.setAttribute('id', 'iris-shade');
    grad.setAttribute('gradientUnits', 'userSpaceOnUse');
    [['0', '#232326'], ['0.45', '#111113'], ['1', '#050506']].forEach(([o, c]) => {
      const s = document.createElementNS(NS, 'stop');
      s.setAttribute('offset', o);
      s.setAttribute('stop-color', c);
      grad.appendChild(s);
    });
    defs.appendChild(grad);
    svg.appendChild(defs);
    const blades = [];
    for (let i = 0; i < N; i++) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('fill', 'url(#iris-shade)');
      p.setAttribute('stroke', 'rgba(255,255,255,0.13)');
      p.setAttribute('stroke-width', '1.2');
      p.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(p);
      blades.push(p);
    }
    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', '#eaaf43');
    ring.setAttribute('stroke-width', '2');
    ring.setAttribute('opacity', '0');
    svg.appendChild(ring);
    function draw(cx, cy, r, rot, W, H) {
      const F = (W + H) * 3;
      const V = [], E = [];
      for (let i = 0; i < N; i++) {
        const a = rot + (i / N) * Math.PI * 2;
        V.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        const m = rot + ((i + 0.5) / N) * Math.PI * 2 + Math.PI / 2;
        E.push([Math.cos(m), Math.sin(m)]);
      }
      for (let i = 0; i < N; i++) {
        const v0 = V[i], v1 = V[(i + 1) % N], e0 = E[i], ep = E[(i - 1 + N) % N];
        const pts = [v0, v1, [v1[0] + e0[0] * F, v1[1] + e0[1] * F], [v0[0] + ep[0] * F, v0[1] + ep[1] * F]];
        blades[i].setAttribute('d', 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z');
      }
    }
    return {
      // image fixe à une étape donnée (0 = fermé, 1 = ouvert) : pour les tests
      frame(cx, cy, e) {
        const W = window.innerWidth, H = window.innerHeight;
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
        grad.setAttribute('cx', cx); grad.setAttribute('cy', cy); grad.setAttribute('r', Math.hypot(W, H) * 0.7);
        const far = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy));
        draw(cx, cy, (far / Math.cos(Math.PI / N)) * 1.04 * e, (1 - e) * 1.05, W, H);
        svg.classList.toggle('is-on', e < 1);
      },
      // ouvre le diaphragme depuis (cx, cy) ; la promesse se résout une fois l’écran dégagé
      open(cx, cy, dur) {
        return new Promise((resolve) => {
          const W = window.innerWidth, H = window.innerHeight;
          svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
          grad.setAttribute('cx', cx); grad.setAttribute('cy', cy); grad.setAttribute('r', Math.hypot(W, H) * 0.7);
          const far = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy));
          const R = (far / Math.cos(Math.PI / N)) * 1.04;
          ring.setAttribute('cx', cx); ring.setAttribute('cy', cy);
          draw(cx, cy, 0, 0, W, H);
          svg.classList.add('is-on');
          const t0 = performance.now();
          const step = (now) => {
            const t = clamp((now - t0) / dur, 0, 1);
            const e = easeInOut(t);
            const r = R * e;
            draw(cx, cy, r, (1 - e) * 1.05, W, H);
            ring.setAttribute('r', (r * Math.cos(Math.PI / N)).toFixed(1));
            ring.setAttribute('opacity', (Math.sin(t * Math.PI) * 0.7).toFixed(3));
            if (t < 1) requestAnimationFrame(step);
            else { svg.classList.remove('is-on'); resolve(); }
          };
          requestAnimationFrame(step);
          setTimeout(() => { svg.classList.remove('is-on'); resolve(); }, dur + 600); // onglet en arrière-plan
        });
      }
    };
  })();

  window.__s124Iris = iris; // accès pratique pour le débogage

  function stageCenter() {
    const st = $('[data-stage]');
    const r = st ? st.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const y = st && st.dataset.stageY ? Number(st.dataset.stageY) : 0.5;
    return { x: r.left + r.width / 2, y: r.top + r.height * y };
  }

  // shoot(cible) : déclenche puis amène la page sur la cible (par défaut, la photo du plateau)
  function shoot(target, source) {
    target = target || shotSection;
    if (!target) return;
    if (shooting) return;
    if (reduced || !flash || !iris) { scrollToY(targetY(target), 1); return; }
    shooting = true;
    d.classList.add('is-shooting');
    if (lenis) lenis.stop();
    track('hero_shot', { source: source || 'scroll', target: target.id || '' });
    const cam = window.__s124Cam;
    const ready = cam && !cam.busy
      ? cam.shoot().catch(() => stageCenter())
      : new Promise((r) => setTimeout(() => r(stageCenter()), 380));
    ready.then((lens) => {
      if (window.__s124Sound) window.__s124Sound.shutter();
      flash.style.setProperty('--fx', (lens.x / window.innerWidth * 100).toFixed(1) + '%');
      flash.style.setProperty('--fy', (lens.y / window.innerHeight * 100).toFixed(1) + '%');
      flash.classList.add('is-on');
      // sous le blanc : la page saute sur la cible, le diaphragme se referme…
      setTimeout(() => {
        jumpToY(targetY(target));
        if (target === shotSection) shotSection.classList.add('is-shot', 'is-in');
        const mid = { x: window.innerWidth / 2, y: window.innerHeight * 0.48 };
        // …puis s’ouvre sur le site pendant que le flash retombe
        iris.open(mid.x, mid.y, 980).then(() => {
          shooting = false;
          d.classList.remove('is-shooting');
          if (lenis) lenis.start();
          if (target.id === 'contact') { const f = $('#contact-form [name="name"]'); if (f && fine) f.focus({ preventScroll: true }); }
        });
        requestAnimationFrame(() => flash.classList.remove('is-on'));
      }, 120);
    });
  }

  /* ---------- Héros : les gestes qui déclenchent ---------- */
  safe('hero', () => {
    if (!hero) return;
    const GAP = 220;
    let lastEvt = 0, touchAcc = 0, touchUsed = false;
    const atTop = () => window.scrollY <= 4;
    const blocked = () => d.classList.contains('menu-open');

    heroInput.wheel = (dx, dy, ev) => {
      if (shooting) return true; // pendant le déclenchement, la page ne bouge pas
      if (blocked() || ev.ctrlKey || Math.abs(dx) > Math.abs(dy) || !atTop() || dy <= 0) return false;
      const now = performance.now();
      const fresh = now - lastEvt > GAP;
      lastEvt = now;
      if (fresh) shoot(null, 'wheel');
      return true;
    };
    heroInput.touch = (dx, dy, ev) => {
      if (shooting) return true;
      if (ev.type === 'touchstart') { touchAcc = 0; touchUsed = false; return false; }
      if (ev.type !== 'touchmove' || blocked() || !atTop()) return false;
      if (touchUsed) return true;
      if (Math.abs(dx) > Math.abs(dy)) return false;
      touchAcc += dy;
      if (touchAcc < 0) { touchAcc = 0; return false; }
      if (touchAcc > 24) { touchUsed = true; shoot(null, 'touch'); }
      return true;
    };
    // Sans Lenis (script bloqué), mêmes règles avec des écouteurs natifs
    if (!lenis && !reduced) {
      window.addEventListener('wheel', (e) => { if (heroInput.wheel(e.deltaX, e.deltaY, e)) e.preventDefault(); }, { passive: false });
      let tx = 0, ty = 0;
      window.addEventListener('touchstart', (e) => { const p = e.touches[0]; tx = p.clientX; ty = p.clientY; heroInput.touch(0, 0, e); }, { passive: true });
      window.addEventListener('touchmove', (e) => {
        const p = e.touches[0];
        const dx = tx - p.clientX, dy = ty - p.clientY;
        tx = p.clientX; ty = p.clientY;
        if (heroInput.touch(dx, dy, e) && e.cancelable) e.preventDefault();
      }, { passive: false });
    }
    // Clavier : flèche bas, page suivante, espace
    document.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || blocked() || !atTop() || reduced) return;
      if (e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey && !e.target.closest('button, a'))) {
        e.preventDefault();
        shoot(null, 'key');
      }
    });
    // Le bouton « Déclenchez »
    $$('[data-shoot]').forEach((b) => b.addEventListener('click', () => shoot(null, 'button')));
    // Clic sur l’appareil, survol, regard qui suit la souris
    const stage = $('[data-stage]');
    let hover = false;
    const camHit = (x, y) => { const c = window.__s124Cam; return !!(c && c.hit(x, y)); };
    hero.addEventListener('pointermove', (e) => {
      const c = window.__s124Cam;
      if (!c || shooting) return;
      const r = hero.getBoundingClientRect();
      c.setPointer((e.clientX - r.left) / r.width * 2 - 1, (e.clientY - r.top) / r.height * 2 - 1);
      if (e.target.closest('a, button')) { if (hover) { hover = false; stage.classList.remove('is-hover'); } return; }
      const h = camHit(e.clientX, e.clientY);
      if (h !== hover) { hover = h; stage.classList.toggle('is-hover', h); }
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { const c = window.__s124Cam; if (c) c.setPointer(0, 0); hover = false; if (stage) stage.classList.remove('is-hover'); });
    hero.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      if (camHit(e.clientX, e.clientY)) shoot(null, 'camera');
    });
  });

  /* ---------- Ancres douces + présélection du formulaire ---------- */
  const formApi = {};
  safe('anchors', () => {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href*="#"]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const url = new URL(a.getAttribute('href'), location.href);
      if (url.pathname.replace(/index\.html$/, '') !== location.pathname.replace(/index\.html$/, '') || !url.hash) return;
      const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (!target) return;
      e.preventDefault();
      if (target.id === 'contact' && formApi.preset) formApi.preset(a.dataset);
      history.replaceState(null, '', url.hash);
      // depuis le haut de l’accueil, chaque lien passe par le déclenchement
      if (hero && window.scrollY <= 4 && a.closest('[data-hero], [data-header]') && !reduced) { shoot(target, 'link'); return; }
      scrollToY(targetY(target), 1.4);
      if (target.id === 'contact') setTimeout(() => { const f = $('#contact-form [name="name"]'); if (f && fine) f.focus({ preventScroll: true }); }, reduced ? 0 : 1200);
    });
  });

  /* ---------- Titres : lignes qui montent derrière un masque ---------- */
  safe('lines', () => {
    $$('[data-lines]').forEach((el) => {
      // (pas d’attribut style dans le HTML injecté : la politique de sécurité CSP l’interdit)
      const parts = el.innerHTML.split(/<br\s*\/?>/i);
      el.innerHTML = parts.map((html) => '<span class="ml"><span>' + html.trim() + '</span></span>').join('');
      $$('.ml > span', el).forEach((s, i) => s.style.setProperty('--l', String(i)));
    });
  });

  /* ---------- Apparitions à l’entrée dans l’écran ---------- */
  safe('reveal', () => {
    const groups = new Map();
    $$('[data-reveal]').forEach((el) => {
      const p = el.parentElement;
      const n = groups.get(p) || 0;
      groups.set(p, n + 1);
      if (n) el.style.setProperty('--d', Math.min(0.48, n * 0.07).toFixed(2) + 's');
    });
    const targets = $$('[data-reveal], [data-lines], [data-shot]');
    if (!('IntersectionObserver' in window)) { targets.forEach((el) => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    targets.forEach((el) => io.observe(el));
  });

  /* ---------- Chiffres qui comptent ---------- */
  safe('counters', () => {
    const nums = $$('[data-count]');
    if (!nums.length || reduced || !('IntersectionObserver' in window)) return;
    const run = (el) => {
      const to = Number(el.dataset.count);
      const t0 = performance.now();
      const step = (now) => {
        const t = clamp((now - t0) / 1500, 0, 1);
        el.textContent = String(Math.round(to * easeOut(t)));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      run(e.target);
      io.unobserve(e.target);
    }), { threshold: 0.6 });
    nums.forEach((el) => io.observe(el));
  });

  /* ---------- Fonds couleur ---------- */
  const PAPERS = [
    ['Chromakey blue', '#3d5cb2'], ['Bleu ciel', '#79c0e4'], ['Vert printemps', '#93d08a'], ['Chromakey green', '#3c9a58'],
    ['Savage rose', '#e75c8f'], ['Orange citrouille', '#ee761f'], ['Jaune bouton d’or', '#f3b320'], ['Dandelion', '#f8d34c'],
    ['Maïs', '#f1c56f'], ['Blanc arctique', '#eef0f2'], ['Storm grey', '#a2a5a9'], ['Smock grey', '#7b7d7f'],
    ['Gris tonnerre', '#4c4e51'], ['Noir', '#141414'], ['Tourbe', '#6d4c39'], ['Blanc', '#ffffff'], ['Rouge cramoisi', '#b2101f']
  ];
  safe('papers', () => {
    $$('[data-chips-mini]').forEach((ul) => {
      PAPERS.forEach(([, c]) => { const li = document.createElement('li'); li.style.setProperty('--c', c); ul.appendChild(li); });
    });
    const list = $('[data-chips]');
    if (!list) return;
    const name = $('[data-paper-name]');
    const sweep = $('[data-paper-sweep]');
    const pick = (i) => {
      const [label, c] = PAPERS[i];
      $$('button', list).forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
      if (name) name.textContent = label;
      if (sweep) sweep.style.setProperty('--c', c);
      track('paper_pick', { color: label });
    };
    PAPERS.forEach(([label, c], i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.setAttribute('aria-pressed', 'false');
      b.style.setProperty('--c', c);
      b.addEventListener('click', () => pick(i));
      li.appendChild(b);
      list.appendChild(li);
    });
    pick(PAPERS.length - 1);
  });

  /* ---------- Espaces : onglets ---------- */
  safe('spaces', () => {
    const root = $('[data-spaces]');
    if (!root) return;
    const tabs = $$('[data-space]', root);
    const panels = $$('[data-space-panel]', root);
    let current = 0;
    const set = (i, focus) => {
      if (i === current && !focus) return;
      current = (i + tabs.length) % tabs.length;
      tabs.forEach((t, j) => {
        const on = j === current;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        if (on && focus) { t.focus(); t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
      });
      panels.forEach((p, j) => {
        const on = j === current;
        if (on) { p.hidden = false; requestAnimationFrame(() => p.classList.add('is-active')); }
        else { p.classList.remove('is-active'); p.hidden = true; }
      });
      track('space_view', { space: tabs[current].textContent.replace(/^\d+/, '').trim() });
    };
    tabs.forEach((t, i) => t.addEventListener('click', () => set(i)));
    root.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
      const k = e.key;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(k)) return;
      e.preventDefault();
      if (k === 'Home') set(0, true);
      else if (k === 'End') set(tabs.length - 1, true);
      else set(current + (k === 'ArrowLeft' || k === 'ArrowUp' ? -1 : 1), true);
    });
  });

  /* ---------- « Ce qu’on tourne ici » : rail horizontal ---------- */
  safe('rail', () => {
    const rail = $('[data-rail]');
    if (!rail) return;
    const prev = $('[data-rail-prev]');
    const next = $('[data-rail-next]');
    const stepW = () => { const c = rail.querySelector('.case'); return c ? c.getBoundingClientRect().width + 16 : 300; };
    const sync = () => {
      if (prev) prev.disabled = rail.scrollLeft < 8;
      if (next) next.disabled = rail.scrollLeft > rail.scrollWidth - rail.clientWidth - 8;
    };
    if (prev) prev.addEventListener('click', () => rail.scrollBy({ left: -stepW(), behavior: reduced ? 'auto' : 'smooth' }));
    if (next) next.addEventListener('click', () => rail.scrollBy({ left: stepW(), behavior: reduced ? 'auto' : 'smooth' }));
    rail.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  });

  /* ---------- Galerie : défile en continu, accélère et suit le sens du défilement ---------- */
  safe('marquee', () => {
    const trackEl = $('[data-marquee]');
    if (!trackEl) return;
    const row = trackEl.firstElementChild;
    // La copie du ruban (pour boucler sans fin) n’est créée qu’à l’approche de la galerie
    const cloneRow = () => {
      if (trackEl.children.length > 1) return;
      const clone = row.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      $$('img', clone).forEach((img) => { img.alt = ''; });
      trackEl.appendChild(clone);
    };
    if ('IntersectionObserver' in window) {
      const near = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { cloneRow(); near.disconnect(); }
      }, { rootMargin: '600px 0px' });
      near.observe(trackEl.parentElement);
    } else cloneRow();
    if (reduced) return;
    let x = 0, dir = 1, boost = 0;
    addScrubber(trackEl.parentElement, (dy) => {
      if (dy) dir = dy > 0 ? 1 : -1;
      boost += (Math.min(40, Math.abs(dy)) * 0.45 - boost) * 0.1;
      x -= (0.5 + boost) * dir;
      const w = row.offsetWidth;
      if (w) { if (x <= -w) x += w; if (x > 0) x -= w; }
      trackEl.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
      return true;
    }, '10% 0px 10% 0px');
  });

  /* ---------- Questions fréquentes (une seule ouverte à la fois) ---------- */
  safe('faq', () => {
    $$('[data-accordion]').forEach((acc) => {
      const items = $$('.qa', acc);
      items.forEach((qa) => {
        const btn = $('button', qa);
        if (btn.getAttribute('aria-expanded') === 'true') qa.classList.add('is-open');
        btn.addEventListener('click', () => {
          const wasOpen = btn.getAttribute('aria-expanded') === 'true';
          items.forEach((o) => { o.classList.remove('is-open'); $('button', o).setAttribute('aria-expanded', 'false'); });
          if (!wasOpen) {
            qa.classList.add('is-open');
            btn.setAttribute('aria-expanded', 'true');
            track('faq_open', { question: btn.textContent.trim().slice(0, 80) });
          }
        });
      });
    });
  });

  /* ---------- Téléphone : ligne de jour (9 h – 18 h) ou de soirée, à l’heure de Bruxelles ---------- */
  const LINES = {
    day: { tel: '+32472040501', label: '0472 04 05 01' },
    night: { tel: '+32472500890', label: '0472 50 08 90' }
  };
  function brusselsNow() {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const get = (t) => (parts.find((p) => p.type === t) || {}).value;
    return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
  }
  safe('phone', () => {
    const update = () => {
      const { minutes } = brusselsNow();
      const isDay = minutes >= 540 && minutes < 1080;
      const line = isDay ? LINES.day : LINES.night;
      $$('[data-phone]').forEach((a) => a.setAttribute('href', 'tel:' + line.tel));
      $$('[data-phone-label]').forEach((el) => { el.textContent = line.label; });
      $$('[data-phone-status]').forEach((el) => {
        el.textContent = isDay ? 'Ligne de jour ouverte · jusqu’à 18 h' : 'Ligne de soirée ouverte · jusqu’à 9 h';
        el.classList.add('is-open');
      });
    };
    update();
    setInterval(update, 60000);
  });

  /* ---------- Réservation & devis ---------- */
  safe('form', () => {
    const form = $('[data-form]');
    if (!form) return;
    const tabs = $('.tabs', form);
    const tabBtns = $$('[data-tab-btn]', form);
    const panels = $$('[data-panel]', form);
    const kind = form.elements.form;
    const errorBox = $('[data-form-error]', form);
    const success = $('[data-form-success]', form);
    const submit = $('[data-submit]', form);
    const phoneStar = $('[data-phone-required]', form);
    const est = $('[data-estimate]');
    const startedAt = Date.now();
    let active = 'reservation';

    const SESSIONS = { location: 'Location du studio', photo: 'Shooting photo', video: 'Production vidéo' };
    const NEEDS = { photo: 'Production photo', video: 'Production vidéo', graphisme: 'Communication visuelle', atelier: 'Atelier cinéma', formation: 'Formation', casting: 'Modèles & casting', appartement: 'Appartement', autre: 'Autre demande' };
    const val = (n) => (form.elements[n] ? String(form.elements[n].value || '').trim() : '');
    const radio = (n) => (form.querySelector('input[name="' + n + '"]:checked') || {}).value || '';
    const checked = (n) => !!(form.elements[n] && form.elements[n].checked);

    // Heures de début (le studio est ouvert 24 h/24)
    const hourSel = $('[data-hours-select]', form);
    if (hourSel) {
      for (let h = 0; h < 24; h++) {
        const o = document.createElement('option');
        o.value = String(h);
        o.textContent = String(h).padStart(2, '0') + ':00';
        if (h === 10) o.selected = true;
        hourSel.appendChild(o);
      }
    }
    // Date : pas avant aujourd’hui
    const dateInput = form.elements.date;
    const today = () => { const n = new Date(); return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
    if (dateInput) dateInput.min = today();

    const setTab = (name, focus) => {
      active = name === 'devis' ? 'devis' : 'reservation';
      tabBtns.forEach((b) => {
        const on = b.dataset.tabBtn === active;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
      });
      panels.forEach((p) => { p.hidden = p.dataset.panel !== active; });
      tabs.dataset.active = active;
      kind.value = active;
      if (phoneStar) phoneStar.hidden = active !== 'reservation';
      if (est) est.classList.toggle('is-devis', active === 'devis');
      clearErrors();
      estimate();
    };
    tabBtns.forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tabBtn)));
    tabs.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      setTab(active === 'devis' ? 'reservation' : 'devis', true);
    });
    const check = (name, value) => { const r = form.querySelector('input[name="' + name + '"][value="' + value + '"]'); if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } };
    formApi.preset = (data) => {
      if (form.classList.contains('is-sent')) reset();
      if (data.tab) setTab(data.tab);
      if (data.session) check('session', data.session);
      if (data.need) check('besoin', data.need);
    };

    // Options selon la formule
    const syncOptions = () => {
      const s = radio('session');
      $$('[data-when]', form).forEach((el) => { el.hidden = el.dataset.when !== s; if (el.hidden) { const i = $('input', el); if (i) i.checked = false; } });
      const ap = $('[data-assist-price]', form);
      if (ap) ap.textContent = s === 'video' ? '+75 € par session' : '+35 €/h';
    };

    /* ----- Estimation en direct (grille tarifaire du studio) ----- */
    const RATE = { morning: 55, weekday: 65, weekend: 75, crew: 250, assistHour: 35, assistVideo: 75, lastMinute: 15 };
    function estimate() {
      if (!est) return;
      const totalEl = $('[data-est-total]', est);
      const lines = $('[data-est-lines]', est);
      const note = $('[data-est-note]', est);
      if (active === 'devis') {
        totalEl.innerHTML = 'Sur devis';
        lines.innerHTML = '';
        const need = NEEDS[radio('besoin')] || '';
        [['Demande', need], ['Réponse', 'proposition chiffrée']].forEach(([a, b]) => { const li = document.createElement('li'); li.innerHTML = '<span></span><span></span>'; li.firstChild.textContent = a; li.lastChild.textContent = b; lines.appendChild(li); });
        note.textContent = 'Décrivez votre projet : le studio revient vers vous avec une proposition.';
        return;
      }
      const s = radio('session') || 'location';
      const hours = Number(radio('duree') || 2);
      const start = Number(val('heure') || 10);
      const date = /^\d{4}-\d{2}-\d{2}$/.test(val('date')) ? val('date') : '';
      const rows = [];
      let total = 0;
      let weekendCrew = false;
      const dayOf = (offsetH) => {
        if (!date) return 2; // sans date : tarif de semaine
        const dt = new Date(date + 'T00:00:00');
        dt.setHours(start + offsetH);
        return dt.getDay();
      };
      if (s === 'location') {
        const buckets = {};
        for (let i = 0; i < hours; i++) {
          const h = (start + i) % 24, dow = dayOf(i);
          const rate = dow === 0 || dow === 6 ? RATE.weekend : h >= 9 && h < 12 ? RATE.morning : RATE.weekday;
          buckets[rate] = (buckets[rate] || 0) + 1;
          total += rate;
        }
        Object.keys(buckets).sort((a, b) => b - a).forEach((r) => rows.push(['Plateau · ' + buckets[r] + ' h × ' + r + ' €', euro(buckets[r] * r)]));
        if (checked('assistance')) { rows.push(['Assistance lumière · ' + hours + ' h', euro(hours * RATE.assistHour)]); total += hours * RATE.assistHour; }
        if (date) {
          const startAt = new Date(date + 'T' + String(start).padStart(2, '0') + ':00:00');
          if (startAt - Date.now() < 864e5 && startAt > Date.now() - 36e5) { rows.push(['Réservation dans les 24 h', euro(RATE.lastMinute)]); total += RATE.lastMinute; }
        }
      } else {
        for (let i = 0; i < hours; i++) { const dow = dayOf(i); if (dow === 0 || dow === 6) weekendCrew = true; }
        rows.push([SESSIONS[s] + ' · ' + hours + ' h', euro(hours * RATE.crew)]);
        total += hours * RATE.crew;
        if (checked('assistance')) {
          const a = s === 'video' ? RATE.assistVideo : hours * RATE.assistHour;
          rows.push(['Assistance lumière', euro(a)]);
          total += a;
        }
        if (checked('retouche')) rows.push(['Retouche', '5 € / photo']);
        if (checked('montage')) rows.push(['Montage', 'sur devis']);
      }
      rows.push(['Matériel & éclairages', 'inclus']);
      totalEl.innerHTML = (weekendCrew ? '<small>dès </small>' : '') + euro(total).replace(/ €$/, '<small> €</small>');
      lines.innerHTML = '';
      rows.forEach(([a, b]) => { const li = document.createElement('li'); li.innerHTML = '<span></span><span></span>'; li.firstChild.textContent = a; li.lastChild.textContent = b; lines.appendChild(li); });
      note.textContent = weekendCrew
        ? 'Tarif de semaine affiché : le tarif week-end est confirmé par le studio.'
        : (date ? 'Tarifs indicatifs, confirmés par le studio après examen du projet.' : 'Estimation au tarif de semaine : choisissez une date pour l’affiner.');
      est.dataset.total = String(total);
    }
    form.addEventListener('change', (e) => {
      if (e.target.name === 'session') syncOptions();
      estimate();
    });
    form.addEventListener('input', (e) => { if (e.target.name === 'date') estimate(); });

    /* ----- Validation ----- */
    const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i;
    const PHONE_RE = /^\+?[0-9 ()./-]{8,20}$/;
    const TYPOS = { 'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.fr': 'gmail.com', 'gamil.com': 'gmail.com', 'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com', 'yahoo.co': 'yahoo.com', 'skynet.b': 'skynet.be', 'telenet.b': 'telenet.be', 'proximus.b': 'proximus.be' };
    function clearErrors() {
      $$('[aria-invalid="true"]', form).forEach((el) => el.removeAttribute('aria-invalid'));
      $$('.field__error', form).forEach((el) => { el.textContent = ''; });
      if (errorBox) errorBox.textContent = '';
    }
    function showError(name, message, html) {
      const input = form.elements[name];
      const box = $('#err-' + name, form);
      if (input && input.setAttribute) input.setAttribute('aria-invalid', 'true');
      if (box) { if (html) box.innerHTML = html; else box.textContent = message; }
    }
    form.addEventListener('input', (e) => {
      const n = e.target.name;
      if (!n || e.target.getAttribute('aria-invalid') !== 'true') return;
      e.target.removeAttribute('aria-invalid');
      const box = $('#err-' + n, form);
      if (box) box.textContent = '';
    });
    // Contrôle à la sortie du champ (pas pendant la frappe)
    ['email', 'phone'].forEach((n) => {
      const el = form.elements[n];
      if (!el) return;
      el.addEventListener('blur', () => {
        const v = el.value.trim();
        if (!v) return;
        if (n === 'email' && !EMAIL_RE.test(v)) showError('email', 'Cette adresse e-mail ne semble pas valide.');
        if (n === 'phone' && !PHONE_RE.test(v)) showError('phone', 'Ce numéro ne semble pas valide.');
      });
    });

    function collect() {
      const data = { form: kind.value, name: val('name'), societe: val('societe'), email: val('email'), phone: val('phone'), message: val('message'), consent: checked('consent'), website: val('website'), elapsed: Date.now() - startedAt };
      if (active === 'reservation') {
        Object.assign(data, { session: radio('session'), duree: radio('duree'), date: val('date'), heure: val('heure'), assistance: checked('assistance'), retouche: checked('retouche'), montage: checked('montage'), estimation: est ? Number(est.dataset.total || 0) : 0 });
      } else Object.assign(data, { besoin: radio('besoin'), quand: val('quand'), budget: val('budget') });
      return data;
    }
    function validate(data) {
      const errors = {};
      if (data.name.length < 2) errors.name = 'Indiquez votre nom.';
      if (!data.email) errors.email = 'Indiquez votre adresse e-mail.';
      else if (!EMAIL_RE.test(data.email)) errors.email = 'Cette adresse e-mail ne semble pas valide.';
      if (data.phone && !PHONE_RE.test(data.phone)) errors.phone = 'Ce numéro ne semble pas valide.';
      if ((data.message.match(/https?:\/\/|www\./gi) || []).length > 1) errors.message = 'Un seul lien maximum dans le message, s’il vous plaît.';
      if (!data.consent) errors.consent = 'Cochez la case pour que le studio puisse vous répondre.';
      if (data.form === 'reservation') {
        if (!data.phone) errors.phone = 'Indiquez un numéro : le studio confirme chaque créneau par téléphone ou WhatsApp.';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) errors.date = 'Choisissez une date.';
        else if (data.date < today()) errors.date = 'Cette date est déjà passée.';
      }
      return errors;
    }
    function typoHint(email) {
      const at = email.lastIndexOf('@');
      if (at < 1) return '';
      const domain = email.slice(at + 1).toLowerCase();
      return TYPOS[domain] ? email.slice(0, at + 1) + TYPOS[domain] : '';
    }

    function summary(data) {
      const lines = [];
      if (data.form === 'reservation') {
        lines.push('Demande de réservation — ' + (SESSIONS[data.session] || ''));
        lines.push('Date : ' + data.date.split('-').reverse().join('/') + ' à ' + String(data.heure).padStart(2, '0') + ':00');
        lines.push('Durée : ' + data.duree + ' h');
        const opts = [data.assistance && 'assistance lumière', data.retouche && 'retouche photo', data.montage && 'montage vidéo'].filter(Boolean);
        if (opts.length) lines.push('Options : ' + opts.join(', '));
        if (data.estimation) lines.push('Estimation affichée : ' + euro(data.estimation) + ' (indicatif)');
      } else {
        lines.push('Demande de devis — ' + (NEEDS[data.besoin] || ''));
        if (data.quand) lines.push('Pour quand : ' + data.quand);
        if (data.budget) lines.push('Budget : ' + data.budget);
      }
      lines.push('', 'Nom : ' + data.name);
      if (data.societe) lines.push('Société : ' + data.societe);
      lines.push('E-mail : ' + data.email);
      if (data.phone) lines.push('Téléphone : ' + data.phone);
      if (data.message) lines.push('', data.message);
      return lines.join('\n');
    }
    function mailto(data) {
      const subject = (data.form === 'reservation' ? 'Réservation ' + (SESSIONS[data.session] || '') : 'Devis ' + (NEEDS[data.besoin] || '')) + ' — ' + data.name + (data.societe ? ' (' + data.societe + ')' : '');
      return 'mailto:' + STUDIO_EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(summary(data));
    }

    function showSuccess(data, viaMail) {
      const first = data.name.split(' ')[0];
      $('[data-success-name]', success).textContent = first ? ', ' + first : '';
      $('[data-success-text]', success).textContent = viaMail
        ? 'Votre messagerie s’est ouverte avec la demande prête à envoyer. Le studio vous répond dès réception.'
        : (data.form === 'reservation' ? 'Le studio vérifie le créneau et vous recontacte pour le confirmer, avec les informations de paiement.' : 'Le studio étudie votre projet et revient vers vous avec une proposition.');
      form.classList.add('is-sent');
      success.hidden = false;
      success.focus({ preventScroll: true });
      try { localStorage.setItem(KEY + 'last_submit', String(Date.now())); } catch (e) { /* rien */ }
      track('generate_lead', { form_type: data.form, session: data.session || data.besoin || '', value: data.estimation || 0, currency: 'EUR', method: viaMail ? 'mailto' : 'api' });
    }
    function reset() {
      form.reset();
      form.classList.remove('is-sent');
      success.hidden = true;
      if (hourSel) hourSel.value = '10';
      syncOptions();
      clearErrors();
      setTab(active);
    }
    $('[data-form-reset]', form).addEventListener('click', () => { reset(); form.elements.name.focus(); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();
      const data = collect();
      // Anti-spam 1 : champ piège rempli par un robot → on fait comme si tout allait bien
      if (data.website) { showSuccess(data, false); return; }
      const errors = validate(data);
      const keys = Object.keys(errors);
      if (keys.length) {
        keys.forEach((k) => showError(k, errors[k]));
        if (errorBox) errorBox.textContent = keys.length > 1 ? 'Merci de corriger les ' + keys.length + ' champs indiqués.' : 'Merci de corriger le champ indiqué.';
        const firstBad = $('[aria-invalid="true"]', form);
        if (firstBad) firstBad.focus();
        track('form_error', { form_type: data.form, fields: keys.join(',') });
        return;
      }
      const hint = typoHint(data.email);
      if (hint && !form.dataset.typoChecked) {
        form.dataset.typoChecked = '1';
        showError('email', '', 'Vouliez-vous dire <button type="button" data-fix-email>' + hint.replace(/[<>&"]/g, '') + '</button>&nbsp;?');
        const fix = $('[data-fix-email]', form);
        if (fix) fix.addEventListener('click', () => { form.elements.email.value = hint; form.elements.email.removeAttribute('aria-invalid'); $('#err-email', form).textContent = ''; });
        return;
      }
      // Anti-spam 2 : envoi trop rapide pour un humain
      if (data.elapsed < 3000) { if (errorBox) errorBox.textContent = 'Un instant… réessayez dans quelques secondes.'; return; }
      // Anti-spam 3 : une demande par minute depuis ce navigateur
      let last = 0;
      try { last = Number(localStorage.getItem(KEY + 'last_submit') || 0); } catch (err) { last = 0; }
      if (Date.now() - last < 60000) { if (errorBox) errorBox.textContent = 'Votre demande vient d’être envoyée. Patientez une minute avant d’en envoyer une autre.'; return; }

      const api = (d.dataset.api || '').trim().replace(/\/$/, '');
      if (!api) {
        // Sans API (maquette, hébergement statique) : la messagerie du visiteur prend le relais
        window.location.href = mailto(data);
        showSuccess(data, true);
        return;
      }
      submit.classList.add('is-busy');
      submit.setAttribute('aria-busy', 'true');
      const controller = 'AbortController' in window ? new AbortController() : null;
      const timer = setTimeout(() => controller && controller.abort(), 12000);
      try {
        const res = await fetch(api + '/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data),
          signal: controller ? controller.signal : undefined
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.ok) { showSuccess(data, false); return; }
        if (json.fields) Object.keys(json.fields).forEach((k) => showError(k, json.fields[k]));
        if (errorBox) errorBox.textContent = json.error || 'Envoi impossible pour le moment.';
      } catch (err) {
        if (errorBox) errorBox.innerHTML = 'Connexion impossible. <a href="' + mailto(data).replace(/"/g, '&quot;') + '">Envoyer la demande par e-mail</a> ou appelez le 0472&nbsp;04&nbsp;05&nbsp;01.';
      } finally {
        clearTimeout(timer);
        submit.classList.remove('is-busy');
        submit.removeAttribute('aria-busy');
      }
    });
    syncOptions();
    setTab('reservation');
  });

  /* ---------- Barre d’action mobile : après le héros, cachée près du formulaire ---------- */
  safe('dock', () => {
    const dock = $('[data-dock]');
    if (!dock) return;
    const contact = $('#contact');
    const footer = $('.ftr');
    let near = false;
    if ('IntersectionObserver' in window) {
      const seen = new Set();
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); });
        near = seen.size > 0;
        update();
      }, { threshold: 0.05 });
      if (contact) io.observe(contact);
      if (footer) io.observe(footer);
    }
    function update() {
      const after = window.scrollY > (hero ? hero.offsetHeight * 0.6 : 300);
      dock.classList.toggle('is-on', after && !near);
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
  });

  /* ---------- Animations : réduire / réactiver ---------- */
  safe('motion', () => {
    $$('[data-motion-toggle]').forEach((b) => {
      b.textContent = reduced ? 'Réactiver les animations' : 'Réduire les animations';
      b.addEventListener('click', () => {
        try { localStorage.setItem(KEY + 'motion', reduced ? 'full' : 'reduce'); } catch (e) { /* rien */ }
        const url = new URL(location.href);
        url.searchParams.delete('motion');
        location.replace(url.toString());
      });
    });
  });

  /* ---------- Page 404 : retrouver la bonne page depuis une ancienne adresse ---------- */
  safe('404', () => {
    if (PAGE !== '404') return;
    track('page_404', { path: location.pathname });
    const lost = $('.lost');
    if (lost) setTimeout(() => lost.classList.add('is-focused'), 500);
    const path = decodeURIComponent(location.pathname.toLowerCase());
    const guesses = [
      [/mat[eé]riel|equipement|lumiere/, '#materiel', 'La fiche du matériel'],
      [/tarif|prix|booking|reserv/, '#tarifs', 'Les tarifs et formules'],
      [/services-1|appartement|logement/, '#plus', 'L’appartement du studio'],
      [/services-3|services-4|atelier|cinema|formation|general-clean/, '#plus', 'L’atelier cinéma et les formations'],
      [/services|graphisme|online-ordering/, '#tarifs', 'Les formules du studio'],
      [/galerie|portfolio|nos-guest|realisation|grossesse|enfants|seniors|food|musique/, '#realisations', 'Les réalisations'],
      [/about|equipe|gr[eé]gory|daphn|notre/, '#equipe', 'L’équipe du studio'],
      [/copie-de-le-studio|le-studio|studio$/, '#studio', 'Le plateau'],
      [/contact|devis/, '#contact', 'Le formulaire de réservation'],
      [/confidentialit|privacy|rgpd|cookie|politique/, '', 'La politique de confidentialité', '/confidentialite.html'],
      [/cgu|mention|condition|legal/, '', 'Les conditions et mentions légales', '/cgu.html'],
      [/accueil|copie-de-accueil|home/, '', 'L’accueil de Studio 124']
    ];
    const hit = guesses.find((g) => g[0].test(path));
    const box = $('[data-guess]');
    if (hit && box) {
      const a = $('a', box);
      a.href = BASE + (hit[3] || '/') + (hit[1] || '');
      $('[data-guess-label]', box).textContent = hit[2];
      box.hidden = false;
    }
  });

  d.classList.add('js-ready');
  requestTick();
})();
