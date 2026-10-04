/* ==========================================================================
   Studio 124 — le son du déclencheur
   Un « clac » d’obturateur synthétisé (Web Audio, aucun fichier, aucune
   licence) : très discret, toujours actif, joué au moment du flash.
   Les navigateurs n’autorisent le son qu’après un premier geste du visiteur
   (clic, toucher, touche) : avant cela, le déclenchement reste muet.
   Un lien discret « Couper le son » dans le pied de page suffit (WCAG 1.4.2).
   ========================================================================== */
(() => {
  'use strict';
  const KEY = 's124_sound';
  let ctx = null;
  let master = null;
  let muted = false;
  try { muted = localStorage.getItem(KEY) === 'off'; } catch (e) { muted = false; }

  function unlock() {
    if (ctx || muted) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
  }
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach((t) => window.addEventListener(t, unlock, { passive: true, capture: true }));

  // Bruit blanc filtré : le claquement mécanique du rideau
  function burst(at, freq, q, dur, gain) {
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(bp).connect(g).connect(master);
    src.start(at);
    src.stop(at + dur + 0.02);
  }
  // Petit « toc » grave : le miroir qui retombe
  function thump(at, gain) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, at);
    o.frequency.exponentialRampToValueAtTime(55, at + 0.08);
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + 0.12);
  }

  const api = {
    get muted() { return muted; },
    press() {
      if (!ctx || muted || ctx.state !== 'running') return;
      burst(ctx.currentTime, 5200, 6, 0.012, 0.25);
    },
    shutter() {
      if (!ctx || muted || ctx.state !== 'running') return;
      const t = ctx.currentTime + 0.005;
      burst(t, 3400, 1.2, 0.028, 0.9);
      thump(t + 0.004, 0.45);
      burst(t + 0.068, 2200, 1.6, 0.04, 0.6);
      thump(t + 0.07, 0.25);
    },
    setMuted(v) {
      muted = !!v;
      try { localStorage.setItem(KEY, muted ? 'off' : 'on'); } catch (e) { /* navigation privée */ }
      if (!muted) unlock();
    }
  };
  window.__s124Sound = api;
  window.addEventListener('s124:press', () => api.press());

  // Lien du pied de page
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-sound-mute]').forEach((b) => {
      b.hidden = false;
      const label = () => { b.textContent = muted ? 'Réactiver le son' : 'Couper le son'; };
      label();
      b.addEventListener('click', () => { api.setMuted(!muted); label(); });
    });
  });
})();
