/* ==========================================================================
   Studio 124 — l’appareil photo du héros, en 3D (Three.js)
   Un hybride argentique / numérique modélisé à la main (aucun fichier 3D) :
   capot titane, gainage cuir, objectif 35 mm à bague jaune Studio 124,
   diaphragme qui se ferme au déclenchement, écran arrière allumé.
   Éclairé comme un packshot : des boîtes à lumière virtuelles se reflètent
   dans le métal et le verre traité.

   Au repos, l’appareil tourne lentement sur lui-même et suit la souris.
   shoot() : il pivote dans l’autre sens pour regarder le visiteur, avance,
   le diaphragme se ferme, le déclencheur s’enfonce… et la promesse se résout
   à l’instant du flash avec la position de l’objectif à l’écran.
   ========================================================================== */
import * as THREE from '../vendor/three.module.min.js';

const TAU = Math.PI * 2;
const YELLOW = 0xeaaf43;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const out3 = (t) => 1 - Math.pow(1 - t, 3);
const inOutQuint = (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2);

/* ---------- Géométries ---------- */
function rrect(w, h, r) {
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
  const s = new THREE.Shape();
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  s.moveTo(x0 + bl, y0);
  s.lineTo(x1 - br, y0);
  if (br) s.absarc(x1 - br, y0 + br, br, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - tr);
  if (tr) s.absarc(x1 - tr, y1 - tr, tr, 0, Math.PI / 2, false);
  s.lineTo(x0 + tl, y1);
  if (tl) s.absarc(x0 + tl, y1 - tl, tl, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + bl);
  if (bl) s.absarc(x0 + bl, y0 + bl, bl, Math.PI, Math.PI * 1.5, false);
  return s;
}

// Trapèze aux angles hauts arrondis (bosse du viseur)
function hump(wBottom, wTop, h, r) {
  const s = new THREE.Shape();
  const b = wBottom / 2, t = wTop / 2, y0 = -h / 2, y1 = h / 2;
  s.moveTo(-b, y0);
  s.lineTo(b, y0);
  s.lineTo(t + r * 0.4, y1 - r);
  s.quadraticCurveTo(t, y1, t - r, y1);
  s.lineTo(-t + r, y1);
  s.quadraticCurveTo(-t, y1, -t - r * 0.4, y1 - r);
  s.closePath();
  return s;
}

// Normales lissées sous un angle de pli : reflets continus sur les biseaux
function crease(geo, angle) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const pos = geo.attributes.position, n = pos.count;
  const cos = Math.cos(angle || Math.PI / 3.4);
  const fw = new Float32Array(n * 3), fu = new Float32Array(n * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    c.sub(b); a.sub(b); c.cross(a);
    const len = c.length() || 1;
    for (let k = 0; k < 3; k++) {
      fw.set([c.x, c.y, c.z], (i + k) * 3);
      fu.set([c.x / len, c.y / len, c.z / len], (i + k) * 3);
    }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const k = Math.round(pos.getX(i) * 2e3) + '|' + Math.round(pos.getY(i) * 2e3) + '|' + Math.round(pos.getZ(i) * 2e3);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(i);
  }
  const outN = new Float32Array(n * 3);
  for (const list of groups.values()) {
    for (const i of list) {
      let sx = 0, sy = 0, sz = 0;
      const ux = fu[i * 3], uy = fu[i * 3 + 1], uz = fu[i * 3 + 2];
      for (const j of list) {
        if (ux * fu[j * 3] + uy * fu[j * 3 + 1] + uz * fu[j * 3 + 2] >= cos) { sx += fw[j * 3]; sy += fw[j * 3 + 1]; sz += fw[j * 3 + 2]; }
      }
      const l = Math.hypot(sx, sy, sz) || 1;
      outN[i * 3] = sx / l; outN[i * 3 + 1] = sy / l; outN[i * 3 + 2] = sz / l;
    }
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(outN, 3));
  return geo;
}

function slab(shape, depth, bevel, segs) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: segs || 6, curveSegments: 28
  });
  g.translate(0, 0, -depth / 2);
  return crease(g, Math.PI / 3.2);
}

// Profil tourné autour de l’axe de l’objectif (+Z)
function lathe(points, segs) {
  const g = new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(r, h)), segs || 128);
  g.rotateX(Math.PI / 2);
  return g;
}

function ridges(rIn, rOut, h0, h1, count) {
  const pts = [];
  const step = (h1 - h0) / count;
  for (let i = 0; i < count; i++) {
    const h = h0 + i * step;
    pts.push([rIn, h], [rOut, h + step * 0.22], [rOut, h + step * 0.62], [rIn, h + step * 0.86]);
  }
  pts.push([rIn, h1]);
  return pts;
}

function cylinder(r, h, segs, open) {
  const g = new THREE.CylinderGeometry(r, r, h, segs || 96, 1, !!open);
  return g;
}

/* ---------- Textures dessinées ---------- */
function canvasTex(w, h, draw, srgb) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Grain de cuir → carte de normales
function leatherNormal() {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d');
  x.fillStyle = '#808080';
  x.fillRect(0, 0, N, N);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    const px = rnd() * N, py = rnd() * N, r = 1.2 + rnd() * 3.2;
    const v = 70 + rnd() * 120;
    x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
    x.beginPath();
    for (let k = -1; k <= 1; k++) for (let m = -1; m <= 1; m++) x.moveTo(px + k * N + r, py + m * N), x.arc(px + k * N, py + m * N, r, 0, TAU);
    x.fill();
  }
  const src = x.getImageData(0, 0, N, N).data;
  const out = x.createImageData(N, N);
  const hgt = (i, j) => src[(((j + N) % N) * N + ((i + N) % N)) * 4] / 255;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const dx = (hgt(i + 1, j) - hgt(i - 1, j)) * 2.2;
      const dy = (hgt(i, j + 1) - hgt(i, j - 1)) * 2.2;
      const l = Math.hypot(dx, dy, 1);
      const o = (j * N + i) * 4;
      out.data[o] = (-dx / l * 0.5 + 0.5) * 255;
      out.data[o + 1] = (dy / l * 0.5 + 0.5) * 255;
      out.data[o + 2] = (1 / l * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  }
  x.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2.6, 2.6);
  return t;
}

// Moletage des molettes → carte de normales en bandes verticales
function knurlNormal(count) {
  const t = canvasTex(1024, 8, (x, w, h) => {
    const img = x.createImageData(w, h);
    for (let i = 0; i < w; i++) {
      const s = Math.sin((i / w) * count * TAU);
      const nx = s * 0.8, nz = Math.sqrt(1 - nx * nx);
      for (let j = 0; j < h; j++) {
        const o = (j * w + i) * 4;
        img.data[o] = (nx * 0.5 + 0.5) * 255; img.data[o + 1] = 128; img.data[o + 2] = (nz * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
  }, false);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function ringText(text, opts) {
  const o = Object.assign({ size: 1024, radius: 0.47, font: '600 34px "JetBrains Mono", monospace', color: '#e9e6df', ring: null, start: -Math.PI / 2 }, opts);
  return canvasTex(o.size, o.size, (x, w) => {
    x.translate(w / 2, w / 2);
    if (o.ring) {
      x.strokeStyle = o.ring; x.lineWidth = w * 0.006;
      x.beginPath(); x.arc(0, 0, w * (o.radius + 0.038), 0, TAU); x.stroke();
    }
    x.font = o.font;
    x.fillStyle = o.color;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const chars = Array.from(text);
    const R = w * o.radius;
    const widths = chars.map((ch) => x.measureText(ch).width + w * 0.004);
    const total = widths.reduce((s, v) => s + v, 0);
    let a = o.start - (total / R) / 2;
    chars.forEach((ch, i) => {
      const half = widths[i] / 2 / R;
      a += half;
      x.save();
      x.rotate(a + Math.PI / 2);
      x.fillText(ch, 0, -R);
      x.restore();
      a += half;
    });
  });
}

/* ---------- Environnement studio (boîtes à lumière) ---------- */
function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: 0x070708, side: THREE.BackSide }));
  env.add(room);
  const panel = (w, h, color, k, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...(look || [0, 0, 0]));
    env.add(m);
  };
  panel(9, 5, 0xffffff, 3.4, [0, 11, 2]);             // grande boîte à lumière au-dessus
  panel(2.2, 12, 0xfff6ec, 6.5, [-10, 1, 3]);          // bande verticale à gauche
  panel(1.6, 10, 0xeef3ff, 4.2, [10, 2, -1]);          // bande froide à droite
  panel(7, 1.2, 0xffffff, 3.2, [0, 4, -11]);           // liseré arrière (contre-jour)
  panel(10, 3, 0xffffff, 0.55, [0, -4, 10]);           // réflecteur bas, face
  panel(3, 3, 0xffffff, 1.8, [-6, 5, 9]);              // parapluie avant gauche
  // couronne de diffuseurs à hauteur d’objectif : le métal reste argenté sous tous les angles
  [2.4, 0.5, 1.7, 0.35, 3.0, 0.7, 2.0, 0.45, 1.5, 0.6].forEach((k, i) => {
    const a = (i / 10) * Math.PI * 2 + 0.2;
    panel(3.2, 3.6, i % 3 ? 0xffffff : 0xfff4e6, k, [Math.sin(a) * 12, 0.6, Math.cos(a) * 12]);
  });
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.02);
  pmrem.dispose();
  return rt.texture;
}

// Reflets propres au verre : une grande boîte à lumière, une bande, une petite fenêtre
function lensEnvironment(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: 0x050507, side: THREE.BackSide })));
  const add = (geo, color, k, pos) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  // face au visiteur : le verre est presque plat, seuls les reflets proches de l’axe se voient
  add(new THREE.CircleGeometry(1.1, 48), 0xffffff, 3.4, [-2.1, 2.3, 10]); // parapluie
  add(new THREE.PlaneGeometry(0.22, 4.2), 0xf2f5ff, 4, [2.5, 0.3, 10]);  // bande
  add(new THREE.PlaneGeometry(0.55, 0.55), 0xffffff, 2.4, [1.3, -2, 10]); // fenêtre
  add(new THREE.CircleGeometry(0.22, 32), YELLOW, 3, [-1.4, -2.1, 10]);   // point jaune
  // de trois quarts : boîtes à lumière latérales
  add(new THREE.CircleGeometry(2.2, 48), 0xffffff, 2.6, [-9, 3, 5]);
  add(new THREE.PlaneGeometry(0.5, 7), 0xf6f1ea, 3.2, [9, 1, 5]);
  add(new THREE.PlaneGeometry(6, 0.4), 0xffffff, 1.6, [0, 7, 7]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.01);
  pmrem.dispose();
  return rt.texture;
}

/* ---------- L’appareil ---------- */
function buildCamera(lcdImage) {
  const rig = new THREE.Group();
  const leatherN = leatherNormal();
  const knurl = knurlNormal(90);

  const mat = {
    titanium: new THREE.MeshPhysicalMaterial({ color: 0xd9d8d6, metalness: 1, roughness: 0.26, clearcoat: 0.35, clearcoatRoughness: 0.25 }),
    chrome: new THREE.MeshPhysicalMaterial({ color: 0xe8e8ea, metalness: 1, roughness: 0.12 }),
    leather: new THREE.MeshPhysicalMaterial({ color: 0x161618, metalness: 0, roughness: 0.58, normalMap: leatherN, normalScale: new THREE.Vector2(0.55, 0.55), sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x333338) }),
    satin: new THREE.MeshPhysicalMaterial({ color: 0x18181b, metalness: 0.35, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    anodized: new THREE.MeshPhysicalMaterial({ color: 0x101012, metalness: 0.75, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.18 }),
    rubber: new THREE.MeshPhysicalMaterial({ color: 0x0c0c0d, metalness: 0, roughness: 0.82 }),
    yellow: new THREE.MeshPhysicalMaterial({ color: YELLOW, metalness: 0.25, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, emissive: YELLOW, emissiveIntensity: 0.08 }),
    knurled: new THREE.MeshPhysicalMaterial({ color: 0xd1cdc5, metalness: 1, roughness: 0.28, normalMap: knurl, normalScale: new THREE.Vector2(1.4, 1.4) }),
    dark: new THREE.MeshStandardMaterial({ color: 0x020203, roughness: 0.95, metalness: 0 }),
    blade: new THREE.MeshStandardMaterial({ color: 0x232327, metalness: 0.9, roughness: 0.38, side: THREE.DoubleSide })
  };
  const add = (geo, m, x, y, z, parent) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x || 0, y || 0, z || 0);
    (parent || rig).add(mesh);
    return mesh;
  };

  const W = 2.9, D = 0.62, BEV = 0.05;
  const FRONT = D / 2 + BEV;            // face avant du boîtier
  const LX = 0.16, LY = -0.2;           // centre de l’objectif

  // Boîtier : gainage cuir en bas, capot titane en haut
  add(slab(rrect(W - 2 * BEV, 1.2 - BEV, [0, 0, 0.14, 0.14]), D, BEV), [mat.leather, mat.satin], 0, -0.22);
  add(slab(rrect(W - 2 * BEV, 0.42, [0.13, 0.13, 0, 0]), D, BEV), mat.titanium, 0, 0.61);
  // filet noir entre capot et gainage
  add(new THREE.BoxGeometry(W - 0.02, 0.025, D + 2 * BEV - 0.02), mat.dark, 0, 0.39);

  // Bosse du viseur
  const hb = add(slab(hump(1.12, 0.74, 0.5, 0.1), 0.56, 0.04), mat.titanium, LX, 1.06, -0.06);
  // griffe porte-flash
  add(new THREE.BoxGeometry(0.46, 0.035, 0.38), mat.chrome, LX, 1.36, -0.06);
  add(new THREE.BoxGeometry(0.34, 0.03, 0.3), mat.dark, LX, 1.38, -0.06);
  // gravure « STUDIO 124 » sur la face avant du viseur
  const plate = canvasTex(1024, 256, (x, w, h) => {
    x.fillStyle = '#26262a';
    x.font = '800 150px Archivo, "Arial Black", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if ('letterSpacing' in x) x.letterSpacing = '18px';
    x.fillText('STUDIO 124', w / 2 + 9, h / 2 + 6);
  });
  const plateMesh = add(new THREE.PlaneGeometry(0.66, 0.165), new THREE.MeshPhysicalMaterial({ map: plate, transparent: true, metalness: 0.4, roughness: 0.5 }), LX, 1.0, -0.06 + 0.28 + 0.041);
  plateMesh.renderOrder = 2;

  // Poignée (à gauche quand l’appareil nous fait face)
  add(slab(rrect(0.54, 1.06, [0.24, 0.24, 0.26, 0.26]), 0.3, 0.06), mat.leather, -1.1, -0.27, FRONT + 0.12);
  // voyant d’assistance AF / retardateur
  const lamp = add(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 32), new THREE.MeshStandardMaterial({ color: 0x3b2a0c, emissive: YELLOW, emissiveIntensity: 0.25, roughness: 0.2 }), -0.66, 0.2, FRONT + 0.005);
  lamp.rotation.x = Math.PI / 2;

  // Déclencheur sur la poignée, avec bague de mise sous tension
  const collar = add(cylinder(0.19, 0.06, 64), mat.chrome, -1.1, 0.86, 0.04);
  const lever = add(new THREE.BoxGeometry(0.16, 0.05, 0.07), mat.chrome, -1.3, 0.86, 0.12);
  lever.rotation.y = 0.5;
  const shutter = new THREE.Group();
  shutter.position.set(-1.1, 0.92, 0.04);
  rig.add(shutter);
  add(cylinder(0.115, 0.08, 64), mat.chrome, 0, 0, 0, shutter);
  add(cylinder(0.092, 0.03, 64), mat.yellow, 0, 0.045, 0, shutter);

  // Molettes : vitesses (moletée, graduée), sensibilité, correction
  const speeds = ringText('B  1  2  4  8  15  30  60  125  250  500  1000  T  ', { size: 512, radius: 0.36, font: '600 23px "JetBrains Mono", monospace', color: '#1b1b1d', start: Math.PI / 2 });
  const dialTop = new THREE.MeshPhysicalMaterial({ color: 0xd8d4cc, metalness: 1, roughness: 0.26, map: speeds });
  add(cylinder(0.22, 0.15, 128), [mat.knurled, dialTop, mat.knurled], 1.0, 0.93, -0.06).rotation.y = 0.3;
  add(cylinder(0.026, 0.012, 24), mat.yellow, 1.0, 0.876, 0.25);
  const isoTop = new THREE.MeshPhysicalMaterial({ color: 0xd8d4cc, metalness: 1, roughness: 0.26, map: ringText('ISO  100  200  400  800  1600  3200  ', { size: 512, radius: 0.34, font: '600 26px "JetBrains Mono", monospace', color: '#1b1b1d' }) });
  add(cylinder(0.21, 0.13, 128), [mat.knurled, isoTop, mat.knurled], -0.64, 0.92, -0.04);
  const evTop = new THREE.MeshPhysicalMaterial({ color: 0xd8d4cc, metalness: 1, roughness: 0.26, map: ringText('-3  -2  -1  0  +1  +2  +3  ', { size: 512, radius: 0.33, font: '600 35px "JetBrains Mono", monospace', color: '#1b1b1d' }) });
  add(cylinder(0.13, 0.1, 96), [mat.knurled, evTop, mat.knurled], 1.3, 0.9, 0.17);

  // Œillets de courroie
  [-1.47, 1.47].forEach((x) => {
    const t = add(new THREE.TorusGeometry(0.06, 0.018, 12, 32), mat.chrome, x, 0.62, 0);
    t.rotation.y = Math.PI / 2;
  });

  // Dos : écran, bordure, œilleton, boutons, molette arrière
  // (au dos, la main droite du photographe est du côté x négatif)
  const BACK = -FRONT;
  add(slab(rrect(1.92, 1.16, 0.06), 0.02, 0.01), mat.satin, 0.22, -0.2, BACK - 0.01);
  const lcdTex = canvasTex(960, 576, (x, w, h) => drawLcd(x, w, h, lcdImage));
  const lcd = add(new THREE.PlaneGeometry(1.8, 1.08), new THREE.MeshPhysicalMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: lcdTex, emissiveIntensity: 0.95, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.04 }), 0.22, -0.2, BACK - 0.032);
  lcd.rotation.y = Math.PI;
  add(slab(rrect(0.62, 0.36, 0.12), 0.14, 0.04), mat.rubber, LX, 1.04, -0.06 - 0.28 - 0.08);
  add(new THREE.CircleGeometry(0.12, 48), new THREE.MeshPhysicalMaterial({ color: 0x050508, roughness: 0.05, metalness: 0.2, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.4 }), LX, 1.04, -0.06 - 0.28 - 0.08 - 0.112).rotation.y = Math.PI;
  [[-1.02, 0.12, 0.055, mat.satin], [-1.02, -0.16, 0.055, mat.satin], [-1.02, -0.44, 0.055, mat.satin], [-1.26, 0.3, 0.07, mat.yellow]].forEach(([x, y, r, m]) => {
    add(cylinder(r, 0.04, 40), m, x, y, BACK - 0.02).rotation.x = Math.PI / 2;
  });
  add(cylinder(0.15, 0.07, 96), mat.knurled, -1.12, 0.58, BACK - 0.02).rotation.z = Math.PI / 2;

  /* ----- Objectif ----- */
  const lens = new THREE.Group();
  lens.position.set(LX, LY, FRONT);
  rig.add(lens);
  add(lathe([[0.58, -0.02], [0.69, -0.02], [0.69, 0.035], [0.6, 0.05]], 128), mat.chrome, 0, 0, 0, lens);           // baïonnette
  add(lathe([[0.6, 0.05], [0.6, 0.1], [0.585, 0.11]].concat(ridges(0.585, 0.603, 0.11, 0.3, 16)).concat([[0.585, 0.32], [0.6, 0.34]]), 128), mat.anodized, 0, 0, 0, lens); // bague de diaphragme
  add(lathe([[0.6, 0.34], [0.605, 0.36], [0.605, 0.5], [0.615, 0.52]], 128), mat.anodized, 0, 0, 0, lens);             // fût
  add(lathe([[0.615, 0.52]].concat(ridges(0.615, 0.64, 0.53, 0.86, 30)).concat([[0.62, 0.88]]), 160), mat.rubber, 0, 0, 0, lens); // bague de mise au point
  add(lathe([[0.62, 0.88], [0.632, 0.885], [0.632, 0.905], [0.62, 0.91]], 128), mat.yellow, 0, 0, 0, lens);           // bague jaune Studio 124
  add(lathe([[0.62, 0.91], [0.645, 0.93], [0.66, 0.96], [0.66, 1.03], [0.645, 1.045], [0.57, 1.05], [0.54, 1.04], [0.515, 1.0], [0.505, 0.97]], 128), mat.anodized, 0, 0, 0, lens); // pare-soleil court
  // marquages sur le fût
  const barrel = canvasTex(2048, 96, (x, w, h) => {
    x.fillStyle = '#e8e4dc';
    x.font = '600 44px "JetBrains Mono", monospace';
    x.textBaseline = 'middle';
    x.fillText('STUDIO 124 · BRUXELLES', 120, h / 2);
    x.fillText('35 mm  1:1.4', 1180, h / 2);
    x.fillStyle = '#eaaf43';
    x.fillText('●', 960, h / 2);
  });
  barrel.wrapS = THREE.RepeatWrapping;
  const bm = add(cylinder(0.6065, 0.12, 160, true), new THREE.MeshPhysicalMaterial({ map: barrel, transparent: true, metalness: 0.2, roughness: 0.4 }), 0, 0, 0.43, lens);
  bm.rotation.x = Math.PI / 2;
  bm.rotation.y = 1.1;
  // inscriptions de la face avant
  const front = add(new THREE.RingGeometry(0.508, 0.568, 160), new THREE.MeshStandardMaterial({ map: ringText('STUDIO 124  ·  35 mm  1:1.4  ·  Ø 62  ·  RUE VERTE 124  ·  BRUXELLES  ·  ', { radius: 0.452, font: '600 22px "JetBrains Mono", monospace', color: '#cfcac0', ring: '#eaaf43' }), transparent: true, roughness: 0.5, metalness: 0.3 }), 0, 0, 1.047, lens);
  front.renderOrder = 2;

  // Intérieur : chambre noire, chicanes, diaphragme, lentille arrière
  add(cylinder(0.505, 0.9, 96, true), new THREE.MeshStandardMaterial({ color: 0x030304, roughness: 1, side: THREE.BackSide }), 0, 0, 0.52, lens).rotation.x = Math.PI / 2;
  [0.82, 0.38].forEach((z) => add(new THREE.RingGeometry(0.4, 0.505, 96), mat.dark, 0, 0, z, lens));
  const rear = add(sphereCap(0.36, 0.05), new THREE.MeshPhysicalMaterial({ color: 0x0a0d18, metalness: 0.1, roughness: 0.06, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.5, iridescenceThicknessRange: [180, 620], envMapIntensity: 2.2 }), 0, 0, 0.3, lens);
  rear.renderOrder = 1;
  const iris = { mesh: null, lines: null, open: 0.24 };
  const irisGroup = new THREE.Group();
  irisGroup.position.z = 0.62;
  lens.add(irisGroup);
  const setIris = (r) => {
    iris.open = r;
    if (iris.mesh) { iris.mesh.geometry.dispose(); irisGroup.remove(iris.mesh); }
    if (iris.lines) { iris.lines.geometry.dispose(); irisGroup.remove(iris.lines); }
    const N = 9, rot = (0.24 - r) * 2.2;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 0.505, 0, TAU, false);
    const hole = new THREE.Path();
    const lineV = [];
    for (let i = 0; i <= N; i++) {
      const a = rot + (i / N) * TAU;
      const px = Math.cos(a) * Math.max(r, 0.002), py = Math.sin(a) * Math.max(r, 0.002);
      if (i === 0) hole.moveTo(px, py); else hole.lineTo(px, py);
      if (i < N) {
        const a2 = rot + ((i + 1) / N) * TAU;
        const dx = Math.cos(a2) * r - px, dy = Math.sin(a2) * r - py;
        const l = Math.hypot(dx, dy) || 1;
        const qx = Math.cos(a2) * r, qy = Math.sin(a2) * r;
        // prolongement de l’arête jusqu’au bord du fût : la lame suivante passe dessous
        const ux = dx / l, uy = dy / l, b = qx * ux + qy * uy;
        const t = -b + Math.sqrt(Math.max(0, b * b - (qx * qx + qy * qy - 0.5 * 0.5)));
        lineV.push(qx, qy, 0.002, qx + ux * t, qy + uy * t, 0.002);
      }
    }
    shape.holes.push(hole);
    iris.mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48), mat.blade);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lineV, 3));
    iris.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x5a5a60, transparent: true, opacity: 0.7 }));
    irisGroup.add(iris.mesh, iris.lines);
  };
  setIris(0.24);

  // Lentille frontale : verre traité, transparent (on voit le diaphragme)
  const glass = add(sphereCap(0.506, 0.075), new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.25, ior: 1.62,
    iridescence: 0.5, iridescenceIOR: 1.3, iridescenceThicknessRange: [120, 420],
    specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.7,
    attenuationColor: new THREE.Color(0x6f7d9a), attenuationDistance: 0.9
  }), 0, 0, 0.955, lens);
  glass.renderOrder = 3;

  return { rig, shutter, lamp, setIris, iris, lens, lensCenter: new THREE.Vector3(LX, LY, FRONT + 1.03), mats: mat, lcdTex, glass, rear };
}

// Calotte sphérique de rayon de base `base` et de flèche `sag`, tournée vers +Z
function sphereCap(base, sag) {
  const R = (base * base + sag * sag) / (2 * sag);
  const theta = Math.asin(base / R);
  const g = new THREE.SphereGeometry(R, 96, 24, 0, TAU, 0, theta);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, -R * Math.cos(theta));
  return g;
}

// Écran arrière : la photo du plateau avec l’interface de prise de vue
function drawLcd(x, w, h, img) {
  x.fillStyle = '#0b0b0c';
  x.fillRect(0, 0, w, h);
  if (img) {
    const k = Math.max(w / img.width, h / img.height);
    x.drawImage(img, (w - img.width * k) / 2, (h - img.height * k) / 2, img.width * k, img.height * k);
    x.fillStyle = 'rgba(0,0,0,.18)';
    x.fillRect(0, 0, w, h);
  }
  x.strokeStyle = 'rgba(255,255,255,.85)';
  x.lineWidth = 3;
  const m = 34, L = 40;
  [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]].forEach(([px, py, sx, sy]) => {
    x.beginPath(); x.moveTo(px, py + sy * L); x.lineTo(px, py); x.lineTo(px + sx * L, py); x.stroke();
  });
  x.strokeStyle = '#eaaf43';
  x.strokeRect(w / 2 - 46, h / 2 - 46, 92, 92);
  x.fillStyle = 'rgba(0,0,0,.55)';
  x.fillRect(0, h - 74, w, 74);
  x.fillStyle = '#f5f3ee';
  x.font = '600 30px "JetBrains Mono", monospace';
  x.textBaseline = 'middle';
  x.fillText('1/125   F8.0   ISO 100   ±0.0', 40, h - 37);
  x.fillStyle = '#eaaf43';
  x.fillText('● 124', w - 150, h - 37);
  x.fillStyle = '#f5f3ee';
  x.fillText('STUDIO 124', 40, 64);
  x.fillText('24/7 ▮▮▮▮', w - 230, 64);
}

/* ---------- Ombre portée douce ---------- */
function contactShadow() {
  const t = canvasTex(512, 256, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,.85)');
    g.addColorStop(0.45, 'rgba(0,0,0,.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.setTransform(1, 0, 0, 0.5, 0, h / 4);
    x.fillStyle = g;
    x.fillRect(0, 0, w, w);
  }, false);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.9 }));
  m.rotation.x = -Math.PI / 2;
  return m;
}


/* ==========================================================================
   Mise en scène
   ========================================================================== */
const CY = -0.24; // l’appareil est recentré verticalement (bosse du viseur comprise)

function waitFonts(ms) {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const loads = Promise.all([
    document.fonts.load('800 150px Archivo'),
    document.fonts.load('600 40px "JetBrains Mono"')
  ]).catch(() => {});
  return Promise.race([loads, new Promise((r) => setTimeout(r, ms))]);
}

export async function createCamera3D(container, options) {
  const opts = Object.assign({ still: false, lcdSrc: '', onFirstFrame: null }, options);
  await waitFonts(1500); // les gravures utilisent les polices du site

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = 'cam3d';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(-3, 5, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xfff1dd, 1.4);
  rim.position.set(4, 2, -5);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.08));

  const root = new THREE.Group();
  scene.add(root);
  const cam = buildCamera(null);
  cam.rig.position.y = CY;
  root.add(cam.rig);
  const lensEnv = lensEnvironment(renderer);
  cam.glass.material.envMap = lensEnv;
  cam.rear.material.envMap = lensEnv;
  const shadow = contactShadow();
  shadow.position.y = -1.18;
  root.add(shadow);

  /* ----- État ----- */
  const IDLE_SPEED = 0.32; // rad/s
  const REST = { yaw: -0.62, pitch: 0.2 };
  let W = 1, H = 1, stageY = 0.5, fit = 1;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const pose = { yaw: REST.yaw, pitch: REST.pitch, roll: 0, bob: 0, dist: 10, center: 0, lift: 0 };
  let mode = opts.still ? 'still' : 'idle';
  let shot = null;
  let dirty = true;
  let running = false;
  let visible = true;
  let last = performance.now();
  let first = true;
  const lensWorld = new THREE.Vector3();
  let clockFn = null; // horloge remplaçable pour les tests image par image
  const nowMs = () => (clockFn ? clockFn() : performance.now());

  // L’écran arrière affiche la photo du plateau dès qu’elle est chargée
  if (opts.lcdSrc) {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => {
      const c = cam.lcdTex.image;
      drawLcd(c.getContext('2d'), c.width, c.height, im);
      cam.lcdTex.needsUpdate = true;
      dirty = true;
    };
    im.src = opts.lcdSrc;
  }

  // Distance qui cadre l’appareil dans la zone prévue, quelle que soit la taille d’écran
  function idleDist() {
    const aspect = W / H;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const fw = W < 700 ? 0.92 : W < 1100 ? 0.7 : 0.56; // part de la largeur
    const fh = Number(container.dataset.fill || (W < 700 ? 0.38 : 0.52)); // part de la hauteur
    return Math.max(3.7 / (fw * 2 * t * aspect), 2.6 / (fh * 2 * t));
  }
  function resize() {
    const r = container.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    stageY = clamp(Number(container.dataset.stageY || 0.5), 0.2, 0.8);
    fit = idleDist();
    if (mode !== 'shoot') pose.dist = fit;
    dirty = true;
  }

  function applyPose() {
    // décalage du centre de projection : l’appareil se pose dans la zone prévue
    const dy = (stageY - 0.5) * H * (1 - pose.center);
    camera.setViewOffset(W, H, 0, -dy, W, H);
    camera.position.set(0, 0, pose.dist);
    camera.lookAt(0, 0, 0);
    const free = 1 - pose.lift;
    cam.rig.rotation.set(pose.pitch + pointer.y * 0.14 * free, pose.yaw + pointer.x * 0.3 * free, pose.roll);
    // pendant le déclenchement, l’objectif vient sur l’axe de visée
    root.position.set(-cam.lensCenter.x * pose.center, pose.bob - (CY + cam.lensCenter.y) * pose.center, 0);
    shadow.material.opacity = 0.9 * free;
  }

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible && mode !== 'shoot') return;
    const k = Math.min(1, dt * 3.2);
    if (Math.abs(pointer.tx - pointer.x) > 1e-4 || Math.abs(pointer.ty - pointer.y) > 1e-4) {
      pointer.x += (pointer.tx - pointer.x) * k;
      pointer.y += (pointer.ty - pointer.y) * k;
      dirty = true;
    }
    if (mode === 'idle') {
      pose.yaw += IDLE_SPEED * dt;
      pose.bob = Math.sin(now / 1400) * 0.035;
      pose.roll = Math.sin(now / 2100) * 0.018;
      dirty = true;
    } else if (mode === 'shoot' && shot) {
      shot(nowMs());
      dirty = true;
    }
    if (!dirty) return;
    dirty = false;
    applyPose();
    renderer.render(scene, camera);
    if (first) { first = false; if (opts.onFirstFrame) opts.onFirstFrame(); }
  }
  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  // Position de l’objectif à l’écran (en pixels de la fenêtre)
  function lensScreen() {
    root.updateMatrixWorld(true);
    lensWorld.copy(cam.lensCenter);
    cam.rig.localToWorld(lensWorld);
    lensWorld.project(camera);
    const r = container.getBoundingClientRect();
    return { x: r.left + (lensWorld.x * 0.5 + 0.5) * W, y: r.top + (-lensWorld.y * 0.5 + 0.5) * H };
  }

  /* ----- Déclenchement ----- */
  function shoot() {
    if (mode === 'shoot') return Promise.reject(new Error('busy'));
    return new Promise((resolve) => {
      const t0 = nowMs();
      const from = { yaw: pose.yaw + pointer.x * 0.3, pitch: pose.pitch + pointer.y * 0.14, roll: pose.roll, bob: pose.bob, dist: pose.dist };
      // il pivote dans l’autre sens jusqu’à regarder le visiteur
      let to = from.yaw - (((from.yaw % TAU) + TAU) % TAU);
      if (from.yaw - to < 1.4) to -= TAU;
      const near = 3.1 + (W < H ? 0.55 : 0);
      const TURN = 920, PRESS = 1040, FIRE = 1150;
      let pressed = false, fired = false;
      pointer.x = pointer.tx = 0;
      pointer.y = pointer.ty = 0;
      mode = 'shoot';
      shot = (now) => {
        const t = now - t0;
        const k = clamp(t / TURN, 0, 1);
        pose.yaw = lerp(from.yaw, to, inOutQuint(k));
        pose.pitch = lerp(from.pitch, 0, out3(k));
        pose.roll = lerp(from.roll, 0, k);
        pose.lift = out3(k);
        const z = inOut(clamp((t - 260) / (FIRE - 260), 0, 1));
        pose.bob = lerp(from.bob, 0, z);
        pose.dist = lerp(from.dist, near, z);
        pose.center = z;
        // le diaphragme se ferme, le voyant clignote, le déclencheur s’enfonce
        cam.setIris(lerp(0.24, 0.03, clamp((t - 640) / 460, 0, 1)));
        cam.lamp.material.emissiveIntensity = t > 560 ? 2.2 + Math.sin(t / 38) * 0.9 : 0.25;
        const p = clamp((t - PRESS + 80) / 80, 0, 1) - clamp((t - PRESS - 60) / 140, 0, 1);
        cam.shutter.position.y = 0.92 - 0.045 * p;
        if (!pressed && t >= PRESS) { pressed = true; window.dispatchEvent(new CustomEvent('s124:press')); }
        if (!fired && t >= FIRE) { fired = true; resolve(lensScreen()); }
        if (t > FIRE + 1000) reset();
      };
      start();
    });
  }

  // Retour discret à l’état de repos (pendant que le site est affiché)
  function reset() {
    mode = opts.still ? 'still' : 'idle';
    shot = null;
    Object.assign(pose, { yaw: REST.yaw, pitch: REST.pitch, roll: 0, bob: 0, center: 0, lift: 0, dist: fit });
    cam.setIris(0.24);
    cam.lamp.material.emissiveIntensity = 0.25;
    cam.shutter.position.y = 0.92;
    dirty = true;
  }

  /* ----- Souris : l’appareil suit le regard ; détection du survol ----- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hit(clientX, clientY) {
    const r = container.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    root.updateMatrixWorld(true);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObject(cam.rig, true).length > 0;
  }
  function setPointer(nx, ny) { pointer.tx = clamp(nx, -1, 1); pointer.ty = clamp(ny, -1, 1); }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) dirty = true; }).observe(container);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
  window.addEventListener('resize', resize);
  resize();
  applyPose();
  start();

  return {
    canvas,
    shoot,
    reset,
    setPointer,
    hit,
    lensScreen,
    resize,
    pause: stop,
    resume: start,
    get busy() { return mode === 'shoot'; },
    // pose figée (image fixe de repli, réglages)
    hold(p) { mode = 'still'; if (p) Object.assign(pose, p); dirty = true; start(); },
    release() { if (mode === 'still' && !opts.still) mode = 'idle'; },
    snapshot() { applyPose(); renderer.render(scene, camera); return canvas.toDataURL('image/png'); },
    pose,
    _debug: { scene, cam, renderer, THREE, redraw: () => { dirty = true; }, setClock(fn) { clockFn = fn; }, tick() { if (shot) shot(nowMs()); applyPose(); renderer.render(scene, camera); return canvas.toDataURL('image/png'); } }
  };
}
