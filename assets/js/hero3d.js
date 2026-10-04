/* ==========================================================================
   Studio 124 — mise en place de l’appareil 3D dans le héros
   Charge le module Three.js seulement si l’écran sait faire de la 3D (WebGL)
   et si le visiteur n’a pas demandé moins d’animations ; sinon l’image fixe
   de l’appareil prend le relais. L’appareil se pose dans l’espace laissé
   libre entre le titre et les boutons, sur toutes les tailles d’écran.
   ========================================================================== */
const d = document.documentElement;
const hero = document.querySelector('[data-hero]');
const stage = hero && hero.querySelector('[data-stage]');

function webgl() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

// Zone libre entre le texte du haut et les boutons du bas
function layout() {
  const h = hero.getBoundingClientRect();
  const copy = hero.querySelector('.hero__copy').getBoundingClientRect();
  const foot = hero.querySelector('.hero__foot').getBoundingClientRect();
  const top = copy.bottom - h.top, bottom = foot.top - h.top;
  const free = Math.max(120, bottom - top);
  const y = (top + bottom) / 2 / h.height;
  stage.dataset.stageY = y.toFixed(4);
  stage.dataset.fill = Math.min(0.62, (free / h.height) * 1.02).toFixed(4);
  hero.style.setProperty('--stage-y', (y * 100).toFixed(2) + '%');
}

async function start() {
  if (!hero || !stage) return;
  layout();
  if (d.classList.contains('reduced') || !webgl()) {
    d.classList.add('no-3d');
    return;
  }
  try {
    const { createCamera3D } = await import('./camera3d.js?v=3c81983609');
    const base = d.dataset.base || '';
    const api = await createCamera3D(stage, {
      lcdSrc: base + '/assets/img/plateau-640.webp',
      onFirstFrame: () => d.classList.add('cam-ready')
    });
    window.__s124Cam = api;
    window.dispatchEvent(new CustomEvent('s124:cam'));
    let t = 0;
    const relayout = () => { cancelAnimationFrame(t); t = requestAnimationFrame(() => { layout(); api.resize(); }); };
    window.addEventListener('resize', relayout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  } catch (e) {
    console.warn('[studio124] 3D indisponible', e);
    d.classList.add('no-3d');
  }
}
start();
