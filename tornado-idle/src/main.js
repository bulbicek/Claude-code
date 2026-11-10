import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ================================================================
   Pomocné funkcie
   ================================================================ */
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const pick = a => a[Math.floor(Math.random() * a.length)];
const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : String(Math.floor(n));
  const i = Math.floor(Math.log10(n) / 3);
  if (i >= SUF.length) return n.toExponential(2).replace('e+', 'e');
  const v = n / Math.pow(1000, i);
  return (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : v.toFixed(0)) + SUF[i];
}

/* ================================================================
   Herný stav, vylepšenia, tiery budov
   ================================================================ */
const SAVE_KEY = 'tornadoIdle.v1';
const S = { money: 0, total: 0, pts: 0, fronts: 0, destroyed: 0, rate: 0, muted: false, qty: '1', time: Date.now(),
  lv: { power: 0, radius: 0, speed: 0, storm: 0, value: 0, offline: 0 } };
try {
  const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  if (raw && raw.v === 1) { Object.assign(S, raw.s); S.lv = Object.assign({ power: 0, radius: 0, speed: 0, storm: 0, value: 0, offline: 0 }, raw.s.lv); }
} catch (e) { /* ignore */ }

const dpsOf = l => 8 * Math.pow(1.22, l);
const UPG = [
  { id: 'power', icon: '💨', name: 'Sila vetra', base: 12, g: 1.55, show: l => fmt(dpsOf(l)) + ' dmg/s' },
  { id: 'radius', icon: '🌪️', name: 'Priemer vírenia', base: 25, g: 1.6, show: l => (2 * 2.6 * Math.pow(1.055, l)).toFixed(1) + ' m' },
  { id: 'speed', icon: '🧭', name: 'Rýchlosť posunu', base: 40, g: 1.65, show: l => Math.min(30, 4.2 * Math.pow(1.05, l)).toFixed(1) + ' m/s' },
  { id: 'storm', icon: '⚡', name: 'Búrka s bleskami', base: 300, g: 2.0, show: l => l === 0 ? 'vypnuté' : `${stormInterval(l).toFixed(1)} s · ×${stormCount(l)}` },
  { id: 'value', icon: '💶', name: 'Poistné plnenia', base: 90, g: 1.95, show: l => '×' + fmt(Math.pow(1.2, l)) },
  { id: 'offline', icon: '🌙', name: 'Nočná zmena (offline)', base: 400, g: 2.6, max: 15, show: l => Math.round(offlineEff(l) * 100) + ' %' },
];
const stormInterval = l => 7 / (1 + 0.18 * (l - 1));
const stormCount = l => 1 + Math.floor((l - 1) / 6);
const offlineEff = l => Math.min(1, 0.1 + 0.06 * l);
const costOf = (u, l) => Math.floor(u.base * Math.pow(u.g, l));
const radiusOf = () => 2.6 * Math.pow(1.055, S.lv.radius);
const speedOf = () => Math.min(30, 4.2 * Math.pow(1.05, S.lv.speed));
const prestigeMult = () => 1 + 0.2 * S.pts;
const prestigeGain = () => Math.floor(Math.cbrt(S.total / 2e5));
const valueMult = () => Math.pow(1.2, S.lv.value) * prestigeMult();
const windKmh = () => 85 + 16 * S.lv.power;
function efOf(k) {
  if (k >= 450) return ['EF5+', '#ff4d6d'];
  if (k >= 322) return ['EF5', '#ff4d6d'];
  if (k >= 267) return ['EF4', '#ff8a3d'];
  if (k >= 218) return ['EF3', '#ffc533'];
  if (k >= 178) return ['EF2', '#e6e84a'];
  if (k >= 138) return ['EF1', '#9be85f'];
  if (k >= 105) return ['EF0', '#8be28b'];
  return ['TB', '#8fd3ff'];
}

const TIERS = [
  { name: 'Domček', w: 2.4, d: 2.4, h: 1.9, hp: 14, val: 7, roof: 'pitch', rows: 1, cols: 2, unlock: 0 },
  { name: 'Rodinný dom', w: 3.4, d: 3.0, h: 2.7, hp: 40, val: 24, roof: 'pitch', rows: 2, cols: 3, unlock: 100 },
  { name: 'Panelák', w: 4.6, d: 3.4, h: 6.6, hp: 160, val: 110, roof: 'flat', rows: 7, cols: 5, unlock: 1200 },
  { name: 'Kancelárska budova', w: 4.2, d: 4.2, h: 11, hp: 700, val: 560, roof: 'setback', rows: 11, cols: 6, unlock: 15000 },
  { name: 'Mrakodrap', w: 3.8, d: 3.8, h: 20, hp: 3600, val: 3200, roof: 'spire', rows: 20, cols: 5, unlock: 2.5e5 },
  { name: 'Megaveža', w: 4.4, d: 4.4, h: 32, hp: 20000, val: 20000, roof: 'spire', rows: 30, cols: 6, unlock: 5e6 },
];
const WALLS = [
  ['#e8d9c5', '#d9a38a', '#c9d6b0', '#b7cbe0', '#e7c9c9', '#f0e6b8'],
  ['#e1cfb6', '#c9b79c', '#d7b8a8', '#bcd0c0', '#e6dcb0', '#c4cde0'],
  ['#c9c6bf', '#b8bdc2', '#d2c3a8', '#a9b3a0'],
  ['#8fb4d4', '#9cc3c9', '#7d98b8', '#b0b8c2'],
  ['#7aa2c8', '#6f8fae', '#a1b6c9', '#5f7f9c'],
  ['#6fa0d8', '#8fb6d0', '#7e9bd0', '#a4c4d8'],
];
const ROOFS = ['#8a3b2e', '#6b4a3a', '#4d5a66', '#a05a3a', '#7a2f2f'];
const unlockedTier = () => { let t = 0; TIERS.forEach((d, i) => { if (S.total >= d.unlock) t = i; }); return t; };
const megaScale = () => S.total > 5e6 ? Math.pow(2, Math.floor(Math.log10(S.total / 5e6) * 1.5)) : 1;

/* ================================================================
   Renderer, scéna, kamera
   ================================================================ */
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const LOW = matchMedia('(pointer:coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4;
const BASE_PR = Math.min(window.devicePixelRatio || 1, LOW ? 1.5 : 2);
let pr = BASE_PR;
renderer.setPixelRatio(pr);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb9c4cf, 60, 400);
const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 2500);
const cam = { yaw: 0.65, pitch: 0.6, zoom: 1, dist: 40, tx: 0, tz: 0, shake: 0 };

const HALF = 64, BLOCK = 16, NB = 8, WORLD = 92;
let particleScale = 1000;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  particleScale = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  pUniforms.uScale.value = particleScale;
  document.documentElement.style.setProperty('--cw', $('tk').parentElement.clientWidth + 'px');
}

/* ---- obloha ---- */
const skyUniforms = { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uGlow: { value: 0.3 } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 24, 12), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
  vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform vec3 uTop,uHor,uSunCol,uSunDir; uniform float uGlow; varying vec3 vP;
    void main(){ vec3 d=normalize(vP); float h=clamp(d.y,0.0,1.0);
      vec3 c=mix(uHor,uTop,pow(h,0.55));
      float s=max(dot(d,normalize(uSunDir)),0.0); c+=uSunCol*(pow(s,24.0)*0.6+pow(s,4.0)*0.15)*uGlow;
      gl_FragColor=vec4(c,1.0); gl_FragColor=linearToOutputTexel(gl_FragColor); }`,
}));
sky.renderOrder = -10; sky.frustumCulled = false;
scene.add(sky);

/* ---- svetlá ---- */
const hemi = new THREE.HemisphereLight(0xbcd2ee, 0x5a6b4a, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
let shadowExt = 0;

/* ================================================================
   Zem, hory
   ================================================================ */
function makeGround() {
  const SZ = 2048, W = 200;
  const c = document.createElement('canvas'); c.width = c.height = SZ;
  const g = c.getContext('2d');
  const px = x => (x + W / 2) / W * SZ, ppu = SZ / W;
  g.fillStyle = '#6d9a50'; g.fillRect(0, 0, SZ, SZ);
  for (let i = 0; i < 700; i++) { // mäkké škvrny trávy
    g.fillStyle = `rgba(${randi(70, 130)},${randi(130, 175)},${randi(60, 90)},${rand(.08, .22)})`;
    g.beginPath(); g.arc(rand(0, SZ), rand(0, SZ), rand(15, 90), 0, 7); g.fill();
  }
  // polia za mestom
  for (let i = 0; i < 40; i++) {
    const x = rand(-95, 95), z = rand(-95, 95);
    if (Math.abs(x) < HALF + 8 && Math.abs(z) < HALF + 8) continue;
    const w = rand(10, 26), h = rand(8, 20), col = pick(['#b9a85e', '#8aa84e', '#a08f4d', '#7c9a45']);
    g.fillStyle = col; g.fillRect(px(x), px(z), w * ppu, h * ppu);
    g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1;
    for (let k = 0; k < w * 1.2; k++) { g.beginPath(); g.moveTo(px(x) + k / 1.2 * ppu, px(z)); g.lineTo(px(x) + k / 1.2 * ppu, px(z) + h * ppu); g.stroke(); }
  }
  // cesty vedúce von
  g.fillStyle = '#55595e';
  for (let k = 0; k <= NB; k++) {
    const p = -HALF + k * BLOCK;
    g.fillRect(px(p) - 2 * ppu, 0, 4 * ppu, SZ);
    g.fillRect(0, px(p) - 2 * ppu, SZ, 4 * ppu);
  }
  // bloky: chodníky + dvory
  for (let bx = 0; bx < NB; bx++) for (let bz = 0; bz < NB; bz++) {
    const x0 = -HALF + bx * BLOCK + 2, z0 = -HALF + bz * BLOCK + 2;
    g.fillStyle = '#9a9d90'; g.fillRect(px(x0) - 3, px(z0) - 3, 12 * ppu + 6, 12 * ppu + 6);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = pick(['#6f9c4f', '#78a556', '#668f49']);
      g.fillRect(px(x0 + i * 6) + 4, px(z0 + j * 6) + 4, 6 * ppu - 8, 6 * ppu - 8);
    }
  }
  // čiary na ceste
  g.strokeStyle = '#d8d27a'; g.lineWidth = 3; g.setLineDash([22, 22]);
  for (let k = 0; k <= NB; k++) {
    const p = px(-HALF + k * BLOCK);
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, SZ); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(SZ, p); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, W).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  m.receiveShadow = true; m.matrixAutoUpdate = false;
  scene.add(m);
  const base = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6d9a50, roughness: 1 }));
  base.position.y = -0.05; base.receiveShadow = true; scene.add(base);
  // hory na horizonte
  const mg = new THREE.ConeGeometry(1, 1, 7, 1);
  const mm = new THREE.MeshStandardMaterial({ color: 0x6f7f78, flatShading: true, roughness: 1 });
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2 + rand(-.1, .1), r = rand(430, 560), h = rand(60, 150);
    const mt = new THREE.Mesh(mg, mm);
    mt.scale.set(h * rand(1.0, 1.7), h, h * rand(1.0, 1.7));
    mt.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
    mt.rotation.y = rand(0, 6); mt.updateMatrix(); mt.matrixAutoUpdate = false;
    scene.add(mt);
  }
}
makeGround();

/* ================================================================
   Budovy
   ================================================================ */
function windowTexture(def, tier) {
  const cw = 22, ch = 22, W = def.cols * cw, H = def.rows * ch;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), glass = tier >= 3;
  g.fillStyle = glass ? '#cfd8e2' : '#ffffff'; g.fillRect(0, 0, W, H);
  for (let r = 0; r < def.rows; r++) for (let k = 0; k < def.cols; k++) {
    const x = k * cw + (glass ? 2 : 5), y = r * ch + (glass ? 3 : 5), w = cw - (glass ? 4 : 10), h = ch - (glass ? 7 : 10);
    if (tier <= 1 && r === 0 && k === 0) { g.fillStyle = '#6b4a35'; g.fillRect(x, y - 2, w, h + 4); continue; } // dvere
    g.fillStyle = glass ? '#27425e' : '#3a4a63'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x, y, w, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const roofMats = {};
const roofMat = hex => roofMats[hex] || (roofMats[hex] = new THREE.MeshStandardMaterial({ color: hex, roughness: .9 }));
const wallMats = {};
const winTex = TIERS.map((d, i) => windowTexture(d, i));
function wallMat(tier, hex) {
  const k = tier + hex;
  if (wallMats[k]) return wallMats[k];
  return wallMats[k] = new THREE.MeshStandardMaterial({ map: winTex[tier], color: hex, roughness: tier >= 3 ? .35 : .85, metalness: tier >= 3 ? .25 : 0 });
}
const bodyGeo = TIERS.map(d => new THREE.BoxGeometry(d.w, d.h, d.d).translate(0, d.h / 2, 0));
const pyr = (d, hh) => { const g = new THREE.ConeGeometry(1, hh, 4, 1).rotateY(Math.PI / 4); g.scale(d.w / 2 / .7071 * 1.12, 1, d.d / 2 / .7071 * 1.12); g.translate(0, d.h + hh / 2, 0); return g; };
const roofGeo = [pyr(TIERS[0], 1.2), pyr(TIERS[1], 1.6)];
const slabGeo = TIERS.map(d => new THREE.BoxGeometry(d.w * 1.04, .22, d.d * 1.04).translate(0, d.h + .11, 0));
const setbackGeo = new THREE.BoxGeometry(TIERS[3].w * .62, 2.2, TIERS[3].d * .62).translate(0, TIERS[3].h + 1.1 + .2, 0);
const spireGeo = [null, null, null, null,
  new THREE.ConeGeometry(.22, 4.5, 6).translate(0, TIERS[4].h + 2.25, 0),
  new THREE.ConeGeometry(.28, 7, 6).translate(0, TIERS[5].h + 3.5, 0)];
const crownGeo = [4, 5].map(t => new THREE.BoxGeometry(TIERS[t].w * .66, 1.6, TIERS[t].d * .66).translate(0, TIERS[t].h + .9, 0));
const rubbleGeo = new THREE.BoxGeometry(1, .25, 1).translate(0, .125, 0);
const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x3f3a36, roughness: 1 });

const buildings = [];
const lots = [];
const cityGroup = new THREE.Group(); scene.add(cityGroup);

function chooseTier(lot) {
  const maxT = unlockedTier();
  const target = maxT * (0.2 + 0.8 * lot.c);
  let sum = 0; const w = [];
  for (let t = 0; t <= maxT; t++) { const x = Math.exp(-Math.pow(t - target, 2) / (0.8 + 0.25 * maxT)); w.push(x); sum += x; }
  let r = Math.random() * sum;
  for (let t = 0; t <= maxT; t++) { r -= w[t]; if (r <= 0) return t; }
  return maxT;
}

function makeBuilding(lot, instant) {
  const tier = chooseTier(lot), def = TIERS[tier];
  const mega = tier >= 4 ? megaScale() : 1;
  const wallHex = pick(WALLS[tier]);
  const g = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo[tier], [0, 1, 2, 3, 4, 5].map(i => i === 2 || i === 3 ? roofMat('#5a5f66') : wallMat(tier, wallHex)));
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  let roofHex = pick(ROOFS);
  if (def.roof === 'pitch') { const r = new THREE.Mesh(roofGeo[tier], roofMat(roofHex)); r.castShadow = true; g.add(r); }
  else {
    const r = new THREE.Mesh(slabGeo[tier], roofMat('#4b5057')); r.castShadow = true; g.add(r);
    if (def.roof === 'setback') { const s = new THREE.Mesh(setbackGeo, wallMat(tier, wallHex)); s.castShadow = true; g.add(s); }
    if (tier >= 4) {
      const c = new THREE.Mesh(crownGeo[tier - 4], wallMat(tier, wallHex)); c.castShadow = true; g.add(c);
      const sp = new THREE.Mesh(spireGeo[tier], roofMat('#aab3bd')); sp.castShadow = true; sp.position.y = .9; g.add(sp);
    }
  }
  const sx = rand(.88, 1.12), sy = rand(.92, 1.12);
  g.userData.base = new THREE.Vector3(sx, sy, sx);
  g.position.set(lot.x, 0, lot.z);
  g.rotation.y = Math.random() < .5 ? 0 : Math.PI / 2;
  g.scale.setScalar(instant ? 1 : 0.001);
  g.children.forEach(c => { c.updateMatrix(); c.matrixAutoUpdate = false; });
  cityGroup.add(g);
  if (lot.rubble) { cityGroup.remove(lot.rubble); lot.rubble = null; }
  const hp = def.hp * mega * rand(.9, 1.1);
  const b = {
    lot, tier, def, x: lot.x, z: lot.z, group: g, hp, max: hp, value: def.val * mega * rand(.9, 1.1), alive: true,
    grow: instant ? 1 : 0, shake: 0, acc: 0, emitted: 0, chunks: 8 + tier * 9, r: Math.max(def.w, def.d) / 2 * Math.max(sx, 1),
    h: def.h * sy + (tier >= 4 ? 5 : 0), wallHex, roofHex: def.roof === 'pitch' ? roofHex : '#5a5f66', lx: 0, lz: 0, earned: 0,
    glass: tier >= 3, sy, settled: false,
  };
  g.scale.set(b.grow * sx, b.grow * sy, b.grow * sx);
  lot.b = b; buildings.push(b);
  return b;
}

function initCity() {
  for (let bx = 0; bx < NB; bx++) for (let bz = 0; bz < NB; bz++) {
    const cx = -HALF + bx * BLOCK + BLOCK / 2, cz = -HALF + bz * BLOCK + BLOCK / 2;
    for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) {
      const x = cx + i * 3, z = cz + j * 3;
      const lot = { x, z, b: null, timer: 0, rubble: null, c: 1 - clamp(Math.hypot(x, z) / (HALF * 1.1), 0, 1), park: Math.random() < .1 };
      lots.push(lot);
      if (!lot.park) makeBuilding(lot, true);
    }
  }
}

/* ---- stromy (instancing) ---- */
const trees = [];
let treeMesh;
function initTrees() {
  const pine = (h, r, y, col) => { const g = new THREE.ConeGeometry(r, h, 7).translate(0, y + h / 2, 0); paint(g, col); return g; };
  const paint = (g, col) => { const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); };
  const trunk = new THREE.CylinderGeometry(.14, .2, 1, 6).translate(0, .5, 0); paint(trunk, '#5b3f2a');
  const geo = mergeGeometries([trunk, pine(1.7, 1.0, .7, '#2f6b3a'), pine(1.4, .75, 1.7, '#3a7d43')].map(g => g.toNonIndexed()));
  treeMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, flatShading: true }), 520);
  treeMesh.castShadow = true; treeMesh.receiveShadow = true; treeMesh.frustumCulled = false;
  treeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(treeMesh);
  const add = (x, z) => trees.push({ x, z, s: rand(.8, 1.5), rot: rand(0, 6), hp: 5, max: 5, alive: true, grow: 1, shake: 0, timer: 0, idx: trees.length, dirty: true, acc: 0 });
  let n = 0;
  while (n < 330) {
    const x = rand(-WORLD - 4, WORLD + 4), z = rand(-WORLD - 4, WORLD + 4);
    if (Math.abs(x) < HALF + 3 && Math.abs(z) < HALF + 3) continue;
    // lesíky
    if (Math.random() < .5 && n > 4) { const t = trees[randi(0, trees.length - 1)]; add(t.x + rand(-5, 5), t.z + rand(-5, 5)); } else add(x, z);
    n++;
  }
  lots.filter(l => l.park).forEach(l => { for (let k = 0; k < 3; k++) add(l.x + rand(-2.2, 2.2), l.z + rand(-2.2, 2.2)); });
  trees.forEach(t => { t.x = clamp(t.x, -WORLD - 6, WORLD + 6); t.z = clamp(t.z, -WORLD - 6, WORLD + 6); });
}
const dummy = new THREE.Object3D();
function writeTree(t, time) {
  const k = t.alive ? t.grow : 0;
  const lean = t.alive ? (1 - t.hp / t.max) * .5 : 0;
  dummy.position.set(t.x + Math.sin(time * 40 + t.idx) * .05 * t.shake, 0, t.z);
  dummy.rotation.set(Math.sin(t.idx) * lean, t.rot, Math.cos(t.idx) * lean);
  const s = t.s * k;
  dummy.scale.set(s, s * (t.alive ? 1 : 0), s); dummy.updateMatrix();
  treeMesh.setMatrixAt(t.idx, dummy.matrix);
}

/* ================================================================
   Úlomky (instancing + fyzika)
   ================================================================ */
const MAXD = 2600;
const debMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: .9, flatShading: true }), MAXD);
debMesh.castShadow = true; debMesh.frustumCulled = false;
debMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(debMesh);
const D = {};
['px', 'py', 'pz', 'vx', 'vy', 'vz', 'rx', 'ry', 'rz', 'wx', 'wy', 'wz', 'sx', 'sy', 'sz', 'life', 'resp', 'ejY', 'ej'].forEach(k => D[k] = new Float32Array(MAXD));
let dn = 0, colorDirty = false;
{ const z = new THREE.Matrix4().makeScale(0, 0, 0), c = new THREE.Color(1, 1, 1); for (let i = 0; i < MAXD; i++) { debMesh.setMatrixAt(i, z); debMesh.setColorAt(i, c); } }
const _c = new THREE.Color();
function spawnDebris(x, y, z, vx, vy, vz, size, hex) {
  const i = dn; dn = (dn + 1) % MAXD;
  D.px[i] = x; D.py[i] = y; D.pz[i] = z; D.vx[i] = vx; D.vy[i] = vy; D.vz[i] = vz;
  D.rx[i] = rand(0, 6); D.ry[i] = rand(0, 6); D.rz[i] = rand(0, 6);
  D.wx[i] = rand(-6, 6); D.wy[i] = rand(-6, 6); D.wz[i] = rand(-6, 6);
  D.sx[i] = size * rand(.6, 1.5); D.sy[i] = size * rand(.4, 1.2); D.sz[i] = size * rand(.6, 1.5);
  D.life[i] = rand(9, 15); D.resp[i] = rand(.5, 1.4) / (.6 + size); D.ejY[i] = rand(.5, 1.0); D.ej[i] = 0;
  _c.set(hex); _c.offsetHSL(0, 0, rand(-.06, .06));
  debMesh.setColorAt(i, _c); colorDirty = true;
}

/* ================================================================
   Čiastice (prach, víry)
   ================================================================ */
const pUniforms = { uScale: { value: 1000 }, uTint: { value: new THREE.Color(1, 1, 1) } };
const pMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, uniforms: pUniforms,
  vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale; varying float vA; varying vec3 vC;
    void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=min(aSize*uScale/max(-mv.z,0.1),400.0); vA=aAlpha; vC=aColor; }`,
  fragmentShader: `uniform vec3 uTint; varying float vA; varying vec3 vC;
    void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.05,d)*vA; if(a<0.004) discard; gl_FragColor=vec4(vC*uTint,a); gl_FragColor=linearToOutputTexel(gl_FragColor); }`,
});
class Particles {
  constructor(n, order) {
    this.n = n;
    this.pos = new Float32Array(n * 3); this.size = new Float32Array(n); this.alpha = new Float32Array(n); this.col = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.points = new THREE.Points(g, pMat); this.points.frustumCulled = false; this.points.renderOrder = order;
    scene.add(this.points);
  }
  flush() { for (const k of ['position', 'aSize', 'aAlpha', 'aColor']) this.geo.attributes[k].needsUpdate = true; }
}
// vír (stály prstenec prachu okolo lievika)
const SW = LOW ? 1300 : 2200;
const swirl = new Particles(SW, 6);
const sw = { ang: new Float32Array(SW), t: new Float32Array(SW), rf: new Float32Array(SW), spd: new Float32Array(SW), sz: new Float32Array(SW), shade: new Float32Array(SW) };
for (let i = 0; i < SW; i++) { sw.ang[i] = rand(0, 6.3); sw.t[i] = Math.pow(Math.random(), 1.4); sw.rf[i] = rand(.55, 1.25); sw.spd[i] = rand(.6, 1.4); sw.sz[i] = rand(.6, 1.4); sw.shade[i] = rand(.35, .75); }
// kúdoly
const PF = 700;
const puffs = new Particles(PF, 7);
const pf = { life: new Float32Array(PF), max: new Float32Array(PF), vx: new Float32Array(PF), vy: new Float32Array(PF), vz: new Float32Array(PF), s0: new Float32Array(PF), s1: new Float32Array(PF), a0: new Float32Array(PF) };
let pn = 0;
function puff(x, y, z, vx, vy, vz, s0, s1, life, a0, shade, tint) {
  const i = pn; pn = (pn + 1) % PF;
  puffs.pos[i * 3] = x; puffs.pos[i * 3 + 1] = y; puffs.pos[i * 3 + 2] = z;
  pf.vx[i] = vx; pf.vy[i] = vy; pf.vz[i] = vz; pf.s0[i] = s0; pf.s1[i] = s1; pf.life[i] = pf.max[i] = life; pf.a0[i] = a0;
  puffs.col[i * 3] = shade * (tint ? tint[0] : 1); puffs.col[i * 3 + 1] = shade * (tint ? tint[1] : .93); puffs.col[i * 3 + 2] = shade * (tint ? tint[2] : .82);
}

/* ================================================================
   Tornádo – lievik, mraky, dážď
   ================================================================ */
const T = { x: 0, z: 0, vx: 0, vz: 0 };
let R = radiusOf(), H = 10 + R * 3.4;
const rb = () => R * .2 + .25, rtop = () => R * 1.9 + 2.5;
const funnelR = t => rb() + (rtop() - rb()) * Math.pow(t, 1.8);
let FX = 0, FZ = 0;
let time = 0;
function funnelAt(t) {
  const lag = Math.pow(t, 1.3);
  FX = T.x - T.vx * lag * .9 + Math.sin(time * .8 + t * 3.2) * R * .22 * t;
  FZ = T.z - T.vz * lag * .9 + Math.cos(time * .7 + t * 2.7) * R * .22 * t;
}
const FT = 23;                                   // počet radov tabuľky = ROWS + 1
const ftx = new Float32Array(FT), ftz = new Float32Array(FT), ftr = new Float32Array(FT);
function updateFunnelTable() {
  for (let j = 0; j < FT; j++) { const t = j / (FT - 1); funnelAt(t); ftx[j] = FX; ftz[j] = FZ; ftr[j] = funnelR(t); }
}
function funnelLookup(t) {                       // nastaví FX, FZ a vráti polomer lievika vo výške t (0..1)
  const f = clamp(t, 0, 1) * (FT - 1), j = Math.min(FT - 2, f | 0), k = f - j;
  FX = ftx[j] + (ftx[j + 1] - ftx[j]) * k; FZ = ftz[j] + (ftz[j + 1] - ftz[j]) * k;
  return ftr[j] + (ftr[j + 1] - ftr[j]) * k;
}
function streakTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(205,198,188,.28)'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 520; i++) {
    const x = rand(0, 256), w = rand(1, 6), sl = rand(-40, 40), l = randi(90, 210);
    g.strokeStyle = `rgba(${l},${l - 6},${l - 14},${rand(.05, .3)})`; g.lineWidth = w;
    for (const o of [-256, 0, 256]) { g.beginPath(); g.moveTo(x + o, 0); g.lineTo(x + o + sl, 256); g.stroke(); }
  }
  g.globalCompositeOperation = 'destination-in';
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.14, 'rgba(0,0,0,.85)'); gr.addColorStop(.85, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,.25)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const baseStreak = streakTex();
const ROWS = FT - 1, SEGS = 36;
const COS = new Float32Array(SEGS + 1), SIN = new Float32Array(SEGS + 1);
for (let i = 0; i <= SEGS; i++) { COS[i] = Math.cos(i / SEGS * Math.PI * 2); SIN[i] = Math.sin(i / SEGS * Math.PI * 2); }
const funnelLayers = [
  { op: .82, spd: .55, sc: 1.0, col: 0x6e665d, rep: 3, shadow: false },
  { op: .7, spd: 1.1, sc: .8, col: 0x4a4540, rep: 4, shadow: true },
  { op: .5, spd: 1.8, sc: 1.14, col: 0x8a8277, rep: 5, shadow: false },
].map((d, li) => {
  const n = (ROWS + 1) * (SEGS + 1);
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
  for (let j = 0; j <= ROWS; j++) for (let i = 0; i <= SEGS; i++) {
    const k = j * (SEGS + 1) + i; uv[k * 2] = i / SEGS * d.rep; uv[k * 2 + 1] = j / ROWS;
    if (j < ROWS && i < SEGS) { const a = k, b = k + 1, c = k + SEGS + 1, e = c + 1; idx.push(a, c, b, b, c, e); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const tex = baseStreak.clone(); tex.needsUpdate = true; tex.wrapS = THREE.RepeatWrapping;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: d.op, side: THREE.DoubleSide, depthWrite: false, color: d.col, fog: false });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 2 + li;
  mesh.castShadow = d.shadow; mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  scene.add(mesh);
  return Object.assign(d, { geo, pos, tex, mesh, base: new THREE.Color(d.col) });
});
function updateFunnel(dt) {
  for (const L of funnelLayers) {
    const p = L.pos;
    for (let j = 0; j <= ROWS; j++) {
      const t = j / ROWS, r = ftr[j] * L.sc, y = t * H, cx = ftx[j], cz = ftz[j], ph = time * 2.1 + t * 7 + L.spd, ph2 = time * 3.3;
      for (let i = 0; i <= SEGS; i++) {
        const a = i / SEGS * Math.PI * 2;
        const rr = r * (1 + .07 * Math.sin(a * 3 + ph) + .04 * Math.sin(a * 5 - ph2));
        const k = (j * (SEGS + 1) + i) * 3;
        p[k] = cx + COS[i] * rr; p[k + 1] = y; p[k + 2] = cz + SIN[i] * rr;
      }
    }
    L.geo.attributes.position.needsUpdate = true;
    L.tex.offset.x -= dt * L.spd * .35;
  }
}

/* ---- búrkové mraky ---- */
function cloudTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const a = rand(0, 6.3), d = rand(0, 80), x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d, r = rand(30, 62);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }
  g.globalCompositeOperation = 'destination-in';
  const m = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(.6, 'rgba(0,0,0,.8)'); m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const cTex = cloudTex();
const clouds = [];
for (let i = 0; i < 26; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cTex, color: 0x4a505a, transparent: true, opacity: .8, depthWrite: false, fog: false }));
  sp.renderOrder = 8;
  clouds.push({ sp, ang: rand(0, 6.3), rad: rand(.1, 1.0), hh: rand(0, 1), spd: rand(.04, .16) * (Math.random() < .5 ? 1 : -1), sz: rand(.8, 1.4) });
  scene.add(sp);
}

/* ---- dážď ---- */
const RN = LOW ? 700 : 1500;
const rainPos = new Float32Array(RN * 6), rainX = new Float32Array(RN), rainY = new Float32Array(RN), rainZ = new Float32Array(RN);
const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage));
const rainMat = new THREE.LineBasicMaterial({ color: 0xb4c6d8, transparent: true, opacity: .28, depthWrite: false, fog: false });
const rain = new THREE.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; rain.renderOrder = 9; scene.add(rain);
for (let i = 0; i < RN; i++) { rainX[i] = rand(-1, 1); rainZ[i] = rand(-1, 1); rainY[i] = rand(0, 1); }
function updateRain(dt) {
  const ext = 40 + cam.dist * .8, top = 40 + cam.dist * .5;
  for (let i = 0; i < RN; i++) {
    rainY[i] -= dt * (45 / top) * 1.2; if (rainY[i] < 0) { rainY[i] += 1; rainX[i] = rand(-1, 1); rainZ[i] = rand(-1, 1); }
    const x = cam.tx + rainX[i] * ext, y = rainY[i] * top, z = cam.tz + rainZ[i] * ext, k = i * 6;
    rainPos[k] = x; rainPos[k + 1] = y; rainPos[k + 2] = z;
    rainPos[k + 3] = x + .25; rainPos[k + 4] = y + 1.5; rainPos[k + 5] = z + .08;
  }
  rainGeo.attributes.position.needsUpdate = true;
}

/* ---- ukazovateľ cieľa ---- */
const marker = new THREE.Mesh(new THREE.RingGeometry(.85, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd21f, transparent: true, opacity: .9, depthWrite: false, fog: false }));
marker.position.y = .2; marker.visible = false; marker.renderOrder = 5; scene.add(marker);

/* ================================================================
   Zvuk
   ================================================================ */
const AU = { ctx: null };
function audioInit() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)(); AU.ctx = c;
    AU.master = c.createGain(); AU.master.gain.value = S.muted ? 0 : .6; AU.master.connect(c.destination);
    const len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = (last + .02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    AU.buf = buf;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    AU.wf = c.createBiquadFilter(); AU.wf.type = 'bandpass'; AU.wf.Q.value = .5; AU.wf.frequency.value = 300;
    AU.wg = c.createGain(); AU.wg.gain.value = 0;
    src.connect(AU.wf); AU.wf.connect(AU.wg); AU.wg.connect(AU.master); src.start();
  } catch (e) { AU.ctx = null; }
}
let lastCrash = 0;
function burst(freq, gain, dur, rate) {
  if (!AU.ctx) return;
  const c = AU.ctx, s = c.createBufferSource(); s.buffer = AU.buf; s.playbackRate.value = rate || 1;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = c.createGain(); g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(gain, c.currentTime + .02);
  g.gain.exponentialRampToValueAtTime(.001, c.currentTime + dur);
  s.connect(f); f.connect(g); g.connect(AU.master); s.start(0, Math.random() * 2.5, dur + .1);
}
function crashSound(tier) { const n = performance.now(); if (n - lastCrash < 70) return; lastCrash = n; burst(500 + tier * 120, .25 + tier * .06, .35 + tier * .08, 1.4); }
function thunderSound() { burst(260, .9, 2.4, .7); }
function setMuted(m) { S.muted = m; $('btn-mute').textContent = m ? '🔇' : '🔊'; if (AU.master) AU.master.gain.value = m ? 0 : .6; }
function updateAudio() {
  if (!AU.ctx) return;
  const w = clamp(.04 + S.lv.power * .006 + R * .004, 0, .3);
  AU.wg.gain.setTargetAtTime(S.muted ? 0 : w, AU.ctx.currentTime, .3);
  AU.wf.frequency.setTargetAtTime(220 + S.lv.power * 14 + Math.sin(time) * 30, AU.ctx.currentTime, .3);
}

/* ================================================================
   Efekty ničenia
   ================================================================ */
const fxLayer = $('fx');
const pops = [];
function floatText(x, y, z, text, scale) {
  if (pops.length > 14 || (scale < 1 && pops.length > 7)) return;
  const el = document.createElement('div'); el.className = 'pop'; el.textContent = text;
  el.style.fontSize = (10 + Math.min(5, scale * 1.2)) + 'px';
  fxLayer.appendChild(el); pops.push({ el, p: new THREE.Vector3(x, y, z), t: 0 });
}
const _v = new THREE.Vector3();
function updatePops(dt) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const q = pops[i]; q.t += dt;
    if (q.t > 1.6) { q.el.remove(); pops.splice(i, 1); continue; }
    _v.copy(q.p); _v.y += q.t * 2.2; _v.project(camera);
    if (_v.z > 1) { q.el.style.opacity = 0; continue; }
    const x = (_v.x * .5 + .5) * innerWidth, y = (-_v.y * .5 + .5) * innerHeight;
    q.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) scale(${1 + Math.min(.3, q.t * .5)})`;
    q.el.style.opacity = String(clamp(1.6 - q.t, 0, 1));
  }
}
let income = 0;
function earn(x) { S.money += x; S.total += x; income += x; }

function emitChunks(b, n, burstMode) {
  const def = b.def, sz = def.w * .13 * (burstMode ? 1.15 : 1);
  for (let k = 0; k < n; k++) {
    const a = rand(0, 6.3), r = rand(0, b.r), y = rand(.1, 1) * b.h * b.group.scale.y;
    const col = b.glass && Math.random() < .35 ? '#9fd0f0' : Math.random() < .25 ? b.roofHex : Math.random() < .2 ? '#8d8a85' : b.wallHex;
    const out = burstMode ? rand(2, 7) : rand(.5, 2);
    spawnDebris(b.x + Math.cos(a) * r, y, b.z + Math.sin(a) * r, Math.cos(a) * out, rand(1, burstMode ? 8 : 4), Math.sin(a) * out, sz * rand(.6, 1.4), col);
  }
}
function destroyBuilding(b) {
  b.alive = false; b.hp = 0;
  const left = Math.max(0, b.chunks - b.emitted);
  emitChunks(b, left, true);
  // roof chunk
  if (b.tier <= 1) for (let i = 0; i < 4; i++) spawnDebris(b.x + rand(-1, 1), b.h, b.z + rand(-1, 1), rand(-3, 3), rand(3, 8), rand(-3, 3), b.def.w * .35, b.roofHex);
  const n = 10 + b.tier * 4;
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.3), s = rand(1, 4 + b.tier);
    puff(b.x + rand(-1, 1) * b.r, rand(.2, b.h * .6), b.z + rand(-1, 1) * b.r, Math.cos(a) * s, rand(.5, 3), Math.sin(a) * s, 1.5 + b.tier * .8, 4 + b.tier * 1.6, rand(1.4, 2.8), rand(.35, .6), rand(.45, .7));
  }
  floatText(b.x, b.h, b.z, '+' + fmt(b.earned), b.tier);
  cam.shake = Math.min(1.2, cam.shake + .08 + b.tier * .1);
  crashSound(b.tier);
  S.destroyed++;
  b.group.visible = false; cityGroup.remove(b.group);
  const lot = b.lot; lot.b = null; lot.timer = rand(16, 30);
  const rb = new THREE.Mesh(rubbleGeo, rubbleMat); rb.position.set(lot.x, 0, lot.z); rb.scale.set(b.def.w * 1.05, 1, b.def.d * 1.05); rb.rotation.y = rand(0, 3); rb.castShadow = true; rb.receiveShadow = true;
  cityGroup.add(rb); lot.rubble = rb;
  const i = buildings.indexOf(b); if (i >= 0) buildings.splice(i, 1);
  if (S.destroyed % 50 === 0) news(`Zničených už ${S.destroyed} objektov. Poisťovne sú v panike.`);
}
function hurt(b, dmg) {
  dmg = Math.min(dmg, b.hp);
  const f = dmg / b.max, e = b.value * valueMult() * f;
  b.hp -= dmg; b.earned += e; earn(e); b.shake = 1;
  b.acc += f * b.chunks * 1.1;
  while (b.acc >= 1 && b.emitted < b.chunks) { b.acc -= 1; b.emitted++; emitChunks(b, 1, false); }
  if (b.hp <= 1e-6) destroyBuilding(b);
}
function destroyTree(t) {
  t.alive = false; t.timer = rand(14, 24); t.dirty = true; t.shake = 0;
  for (let i = 0; i < 5; i++) spawnDebris(t.x + rand(-.5, .5), rand(.3, 1.5) * t.s, t.z + rand(-.5, .5), rand(-2, 2), rand(1, 5), rand(-2, 2), .22 * t.s, pick(['#3a7d43', '#2f6b3a', '#5b3f2a']));
  earn(1.2 * valueMult());
}

/* ---- blesky ---- */
const bolts = [];
const boltGeo = new THREE.CylinderGeometry(1, 1, 1, 5).translate(0, .5, 0);
let flash = 0;
function strike(target) {
  const grp = new THREE.Group();
  const top = new THREE.Vector3(target.x, target.h || 2, target.z);
  funnelLookup(1);
  const start = new THREE.Vector3(FX + rand(-1, 1) * rtop() * .7, H * 1.08, FZ + rand(-1, 1) * rtop() * .7);
  const pts = [start.clone()];
  const N = 12;
  for (let i = 1; i < N; i++) { const p = start.clone().lerp(top, i / N); const j = (1 - i / N) * 5 + 1; p.x += rand(-j, j); p.z += rand(-j, j); pts.push(p); }
  pts.push(top);
  const mCore = new THREE.MeshBasicMaterial({ color: 0xf2f7ff, fog: false, transparent: true });
  const mGlow = new THREE.MeshBasicMaterial({ color: 0x8fb4ff, fog: false, transparent: true, opacity: .35, depthWrite: false });
  const w = .09 + R * .012;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dir = b.clone().sub(a), L = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    for (const [m, s] of [[mCore, w], [mGlow, w * 4]]) {
      const c = new THREE.Mesh(boltGeo, m); c.position.copy(a); c.quaternion.copy(q); c.scale.set(s, L, s); c.renderOrder = 10; grp.add(c);
    }
  }
  scene.add(grp); bolts.push({ grp, ttl: .26, mats: [mCore, mGlow] });
  flash = 1; thunderSound();
  for (let i = 0; i < 8; i++) puff(top.x, .4, top.z, rand(-3, 3), rand(.5, 3), rand(-3, 3), 1, 3, .8, .6, 1, [1, 1, 1]);
}

/* ================================================================
   Počasie, deň / noc
   ================================================================ */
const SUN_PERIOD = 240;           // s na jeden okruh slnka
let sunPhase = .15;
const C_TOP = new THREE.Color('#4d78a8'), C_HOR = new THREE.Color('#aab9c6');
const C_WHITE = new THREE.Color('#fff0d8'), C_WARM = new THREE.Color('#ffb070');
const C_FLASH_TOP = new THREE.Color('#c9d8ff'), C_FLASH_HOR = new THREE.Color('#e6eeff');
const sunDir = new THREE.Vector3(), tint = new THREE.Color(1, 1, 1);
hemi.color.set('#a9bfd8'); hemi.groundColor.set('#4d5c3e');
let lastFlash = -1;
function updateWeather(dt) {
  sunPhase = (sunPhase + dt / SUN_PERIOD) % 1;
  const p = sunPhase * Math.PI * 2, el = .95 + .35 * Math.sin(p * 2 + 1);   // výška slnka kolíše medzi ~35° a 75°
  sunDir.set(Math.cos(p) * Math.cos(el), Math.sin(el), Math.sin(p) * Math.cos(el));
  const dist = shadowExt * 2.2 + 60;
  sun.position.set(T.x + sunDir.x * dist, sunDir.y * dist, T.z + sunDir.z * dist);
  sun.target.position.set(T.x, 0, T.z);
  const warm = smooth(.95, .6, el) * .6;
  sun.color.copy(C_WHITE).lerp(C_WARM, warm);
  skyUniforms.uSunDir.value.copy(sunDir); skyUniforms.uSunCol.value.copy(sun.color);
  sky.position.copy(camera.position);
  if (flash === lastFlash) return;           // zvyšok sa mení iba pri blesku
  lastFlash = flash;
  sun.intensity = 2.5 + flash * 1.2;
  hemi.intensity = 1.05 + flash * 1.5;
  skyUniforms.uTop.value.copy(C_TOP).lerp(C_FLASH_TOP, flash * .5);
  skyUniforms.uHor.value.copy(C_HOR).lerp(C_FLASH_HOR, flash * .5);
  scene.fog.color.copy(skyUniforms.uHor.value);
  tint.setScalar(1 + flash * .5);
  pUniforms.uTint.value.copy(tint).multiplyScalar(1.15);
  for (const L of funnelLayers) L.mesh.material.color.copy(L.base).multiply(tint);
  for (const c of clouds) c.sp.material.color.setRGB(.27, .3, .35).multiply(tint);
}
skyUniforms.uGlow.value = .4;
rainMat.opacity = .3;

/* ================================================================
   Riadenie tornáda (autopilot / klik)
   ================================================================ */
let target = null, targetStamp = 0, manual = null, manualHold = 0, pickTimer = 0;
function scoreOf(b, dps) {
  const d = Math.hypot(b.x - T.x, b.z - T.z);
  const killT = b.hp / Math.max(1, dps);
  return (b.value * (b.hp / b.max)) / (killT * .8 + d / speedOf() + .6);
}
function pickTarget() {
  const dps = dpsOf(S.lv.power);
  let best = null, bs = -1;
  for (const b of buildings) { if (!b.alive || b.grow < 1) continue; const s = scoreOf(b, dps); if (s > bs) { bs = s; best = b; } }
  if (target && target.alive && best && best !== target) { if (scoreOf(target, dps) * 1.3 >= bs) best = target; }
  if (best !== target) { target = best; targetStamp = time; }
}
function steer(dt) {
  let tx, tz, hold = false;
  if (manual) {
    tx = manual.x; tz = manual.z;
    if (Math.hypot(tx - T.x, tz - T.z) < R * .5 + 1) { manualHold += dt; if (manualHold > 3.5) { manual = null; marker.visible = false; } }
  }
  if (!manual) {
    pickTimer -= dt;
    if (pickTimer <= 0 || !target || !target.alive) { pickTarget(); pickTimer = 1.2; }
    if (target) { tx = target.x; tz = target.z; } else { tx = T.x + Math.cos(time) * 10; tz = T.z + Math.sin(time) * 10; }
  }
  const dx = tx - T.x, dz = tz - T.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
  const sp = speedOf() * (manual ? 1 : smooth(0, R * 1.6 + 1.5, d) * .85 + .15);
  const px = -dz / d, pz = dx / d, wob = Math.sin(time * .9) * .25 * Math.min(1, d / 10);
  const wantX = (dx / d + px * wob) * sp, wantZ = (dz / d + pz * wob) * sp;
  const k = 1 - Math.exp(-dt * 1.6);
  T.vx += (wantX - T.vx) * k; T.vz += (wantZ - T.vz) * k;
  T.x = clamp(T.x + T.vx * dt, -WORLD, WORLD); T.z = clamp(T.z + T.vz * dt, -WORLD, WORLD);
}
function commandTo(x, z) {
  manual = { x: clamp(x, -WORLD, WORLD), z: clamp(z, -WORLD, WORLD) }; manualHold = 0;
  marker.position.set(manual.x, .2, manual.z); marker.visible = true;
}

/* ================================================================
   Hlavný update
   ================================================================ */
let lightningTimer = 3, tierSeen = unlockedTier(), megaSeen = megaScale(), flashEl = $('flash');
const rateHist = [];
function update(dt) {
  time += dt;
  R = lerp(R, radiusOf(), 1 - Math.exp(-dt * 3)); H = 10 + R * 3.4;
  steer(dt);
  updateFunnelTable();
  const dps = dpsOf(S.lv.power);

  // škody na budovách
  for (let i = buildings.length - 1; i >= 0; i--) {
    const b = buildings[i];
    if (!b.alive) continue;
    if (b.grow < 1) { b.grow = Math.min(1, b.grow + dt / 1.8); const e = b.grow - 1, s = 1 + 2.70158 * e * e * e + 1.70158 * e * e; const g = b.grow < 1 ? s : 1; b.group.scale.set(g * b.group.userData.base.x, g * b.group.userData.base.y, g * b.group.userData.base.z); continue; }
    const dx = T.x - b.x, dz = T.z - b.z, d = Math.sqrt(dx * dx + dz * dz), edge = R * 1.05 + b.r;
    const inRange = d < edge;
    if (inRange) {
      hurt(b, dps * (.35 + .65 * (1 - d / edge)) * dt);
      if (!b.alive) continue;
      b.lx = dx / (d || 1); b.lz = dz / (d || 1);
      b.group.matrixAutoUpdate = true; b.settled = false;
    } else if (b.settled) continue;            // budova v pokoji – nič nepočítame
    b.shake = Math.max(0, b.shake - dt * 2);
    const hp = b.hp / b.max, bs = b.group.userData.base, g = b.group;
    const ys = lerp(.55, 1, smooth(0, 1, hp)), lean = (1 - hp) * .28;
    g.scale.set(bs.x, bs.y * ys, bs.z);
    g.rotation.x = lean * b.lz; g.rotation.z = -lean * b.lx;
    g.position.x = b.x + Math.sin(time * 55 + b.x) * .06 * b.shake * (1 + b.tier * .3);
    g.position.z = b.z + Math.cos(time * 47 + b.z) * .06 * b.shake * (1 + b.tier * .3);
    if (!inRange && b.shake <= 0) { g.position.set(b.x, 0, b.z); g.updateMatrix(); g.matrixAutoUpdate = false; b.settled = true; }
  }
  // stromy
  for (const t of trees) {
    if (t.alive) {
      const dx = T.x - t.x, dz = T.z - t.z, d = Math.sqrt(dx * dx + dz * dz), edge = R * 1.05 + .6;
      if (d < edge) {
        const k = .35 + .65 * (1 - d / edge), dm = dps * k * dt;
        t.hp -= dm; t.shake = 1; t.dirty = true;
        if (t.hp <= 0) destroyTree(t);
      } else if (t.shake > 0) { t.shake = Math.max(0, t.shake - dt * 2); t.dirty = true; }
      if (t.grow < 1) { t.grow = Math.min(1, t.grow + dt * .6); t.dirty = true; }
    } else {
      t.timer -= dt;
      if (t.timer <= 0) { t.alive = true; t.hp = t.max; t.grow = 0.01; t.dirty = true; }
    }
  }
  // obnova parciel
  for (const lot of lots) {
    if (lot.b || lot.park) continue;
    lot.timer -= dt;
    if (lot.rubble && lot.timer < 3) lot.rubble.scale.y = Math.max(.05, lot.timer / 3);
    if (lot.timer <= 0) {
      makeBuilding(lot, false);
    }
  }
  // blesky
  if (S.lv.storm > 0) {
    lightningTimer -= dt;
    if (lightningTimer <= 0) {
      lightningTimer = stormInterval(S.lv.storm);
      const near = buildings.filter(b => b.alive && b.grow >= 1 && Math.hypot(b.x - T.x, b.z - T.z) < 38 + R * 2);
      const cnt = stormCount(S.lv.storm);
      for (let i = 0; i < cnt && near.length; i++) {
        const b = near.splice(randi(0, near.length - 1), 1)[0];
        strike({ x: b.x, z: b.z, h: b.h * b.group.scale.y }); hurt(b, dps * 5);
      }
      if (Math.random() < .25) news(pick(['Nad mestom sa strieda blesk za bleskom.', 'Meteorológovia: „Zachovajte pokoj, ak sa dá.“', 'Búrková aktivita je extrémna – blesky všade navôkol.']));
    }
  }
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i]; b.ttl -= dt;
    b.mats[0].opacity = clamp(b.ttl / .26, 0, 1); b.mats[1].opacity = .35 * clamp(b.ttl / .26, 0, 1);
    if (b.ttl <= 0) { scene.remove(b.grp); b.mats.forEach(m => m.dispose()); bolts.splice(i, 1); }
  }
  flash = Math.max(0, flash - dt * 3.2);
  flashEl.style.opacity = String(flash * .35);

  updateDebris(dt);
  updatePuffs(dt);
  updateSwirl(dt);
  updateFunnel(dt);
  updateClouds(dt);
  updateWeather(dt);

  // prachová stopa
  if (Math.random() < dt * 30) {
    const a = rand(0, 6.3), r = rand(R * .4, R * 1.1);
    puff(T.x + Math.cos(a) * r, .3, T.z + Math.sin(a) * r, Math.cos(a) * rand(1, 3) - T.vx * .2, rand(.5, 2), Math.sin(a) * rand(1, 3) - T.vz * .2, R * .5 + .8, R * 1.4 + 2.5, rand(1.2, 2.4), .3, rand(.5, .7));
  }
  // marker
  if (marker.visible) { const s = 1.2 + .4 * Math.sin(time * 5); marker.scale.setScalar(s * (1 + R * .15)); }

  // povýšenie zóny
  const ut = unlockedTier(), ms = megaScale();
  if (ut > tierSeen) { tierSeen = ut; news(`Pozor: v zóne pribudli objekty typu „${TIERS[ut].name}“. Vyššia škoda, vyššie zisky!`, true); }
  if (ms > megaSeen) { megaSeen = ms; news('Mesto sa rozrastá – nové budovy sú ešte vyššie a odolnejšie!', true); }
  rateHist.push([time, income]); income = 0;
  while (rateHist.length && time - rateHist[0][0] > 4) rateHist.shift();
}

function updateDebris(dt) {
  const hs = H;
  for (let i = 0; i < MAXD; i++) {
    if (D.life[i] <= 0) continue;
    D.life[i] -= dt;
    if (D.life[i] <= 0) { D.life[i] = 0; dummy.scale.set(0, 0, 0); dummy.updateMatrix(); debMesh.setMatrixAt(i, dummy.matrix); continue; }
    let x = D.px[i], y = D.py[i], z = D.pz[i], vx = D.vx[i], vy = D.vy[i], vz = D.vz[i];
    if (!D.ej[i]) {
      const rF = funnelLookup(y / hs);
      const dx = x - FX, dz = z - FZ, d = Math.sqrt(dx * dx + dz * dz) + 1e-3;
      const rh = rF + R * .5, inf = rh * 2.4 + 3;
      if (d < inf) {
        const k = 1 - d / inf, kk = Math.sqrt(k);
        const tx = -dz / d, tz = dx / d;
        const vt = (9 + R * 1.2) * (1 + .03 * S.lv.power) * (.5 + .5 * kk);
        const rad = d > rh ? -(d - rh) * .9 : .6;
        const lift = (6 + R * .55) * kk;
        const r = Math.min(1, dt * 3 * kk * D.resp[i] + dt * .6);
        vx += (tx * vt + dx / d * rad - vx) * r; vz += (tz * vt + dz / d * rad - vz) * r;
        vy += (lift - vy) * Math.min(1, dt * 1.8 * kk * D.resp[i]);
        if (y > D.ejY[i] * hs) { D.ej[i] = 1; vx = tx * vt * 1.3 + dx / d * 8; vz = tz * vt * 1.3 + dz / d * 8; vy = rand(2, 7); }
      }
    }
    vy -= 16 * dt;
    x += vx * dt; y += vy * dt; z += vz * dt;
    const hy = D.sy[i] * .5;
    if (y < hy) { y = hy; if (vy < 0) vy = -vy * .3; vx *= 1 - Math.min(1, dt * 6); vz *= 1 - Math.min(1, dt * 6); D.wx[i] *= .9; D.wy[i] *= .9; D.wz[i] *= .9; if (Math.abs(vy) < .5) vy = 0; }
    D.px[i] = x; D.py[i] = y; D.pz[i] = z; D.vx[i] = vx; D.vy[i] = vy; D.vz[i] = vz;
    D.rx[i] += D.wx[i] * dt; D.ry[i] += D.wy[i] * dt; D.rz[i] += D.wz[i] * dt;
    const sc = Math.min(1, D.life[i]);
    dummy.position.set(x, y, z); dummy.rotation.set(D.rx[i], D.ry[i], D.rz[i]);
    dummy.scale.set(D.sx[i] * sc, D.sy[i] * sc, D.sz[i] * sc); dummy.updateMatrix();
    debMesh.setMatrixAt(i, dummy.matrix);
  }
  debMesh.instanceMatrix.needsUpdate = true;
  if (colorDirty) { debMesh.instanceColor.needsUpdate = true; colorDirty = false; }
}
function updatePuffs(dt) {
  for (let i = 0; i < PF; i++) {
    if (pf.life[i] <= 0) { puffs.alpha[i] = 0; puffs.size[i] = 0; continue; }
    pf.life[i] -= dt;
    const p = 1 - pf.life[i] / pf.max[i], d = 1 - Math.min(1, dt * 1.5);
    pf.vx[i] *= d; pf.vz[i] *= d; pf.vy[i] = pf.vy[i] * d + dt * .6;
    puffs.pos[i * 3] += pf.vx[i] * dt; puffs.pos[i * 3 + 1] += pf.vy[i] * dt; puffs.pos[i * 3 + 2] += pf.vz[i] * dt;
    // záchvat vetra – kúdoly sa točia okolo tornáda
    const dx = puffs.pos[i * 3] - T.x, dz = puffs.pos[i * 3 + 2] - T.z, dd = Math.sqrt(dx * dx + dz * dz) + .01;
    if (dd < R * 3 + 3) { const k = (1 - dd / (R * 3 + 3)) * dt * 6; pf.vx[i] += -dz / dd * k * 6; pf.vz[i] += dx / dd * k * 6; pf.vy[i] += k * 2; }
    puffs.size[i] = lerp(pf.s0[i], pf.s1[i], Math.sqrt(p));
    puffs.alpha[i] = pf.a0[i] * Math.pow(1 - p, 1.3) * Math.min(1, p * 8);
  }
  puffs.flush();
}
function updateSwirl(dt) {
  const rr = rtop();
  for (let i = 0; i < SW; i++) {
    let t = sw.t[i]; t += dt * .07 * sw.spd[i]; if (t > 1) { t = Math.random() * .06; sw.ang[i] = rand(0, 6.3); }
    sw.t[i] = t;
    const f = (1 + (1 - t) * 1.8) * sw.spd[i] * (1.4 + 1.5 / (1 + R * .25));
    sw.ang[i] += dt * f * (1.5 + (1 - t) * 2.5);
    let r = funnelLookup(t) * sw.rf[i];
    if (t < .16) r += R * 1.05 * Math.pow(1 - t / .16, 2) * sw.rf[i];
    const y = t * H + Math.sin(sw.ang[i] * 2 + i) * .5, k = i * 3;
    swirl.pos[k] = FX + Math.cos(sw.ang[i]) * r; swirl.pos[k + 1] = y; swirl.pos[k + 2] = FZ + Math.sin(sw.ang[i]) * r;
    swirl.size[i] = (.55 + R * .1 + t * R * .15) * sw.sz[i] * (1 + (t < .16 ? 1.2 : 0));
    swirl.alpha[i] = (t < .05 ? t / .05 : 1) * (1 - Math.pow(t, 3)) * .5;
    const sh = sw.shade[i] * .8; swirl.col[k] = sh; swirl.col[k + 1] = sh * .94; swirl.col[k + 2] = sh * .86;
  }
  swirl.flush();
}
function updateClouds(dt) {
  FX = ftx[FT - 1]; FZ = ftz[FT - 1];
  const rt = rtop();
  for (const c of clouds) {
    c.ang += dt * c.spd;
    const rad = (rt * 1.1 + 6 + c.rad * (rt * 2.2 + 18));
    const x = FX + Math.cos(c.ang) * rad * (c.rad < .25 ? c.rad * 2 : 1), z = FZ + Math.sin(c.ang) * rad * (c.rad < .25 ? c.rad * 2 : 1);
    const y = H * 1.06 + 4 + c.hh * (4 + R * .6);
    c.sp.position.set(x, y, z);
    const s = (rt * 3.4 + 22) * c.sz; c.sp.scale.set(s, s * .55, 1);
    const dc = camera.position.distanceTo(c.sp.position);
    c.sp.material.opacity = .85 * clamp((dc - s * .45) / (s * .6), 0, 1);
  }
}

/* ================================================================
   Kamera a vstup
   ================================================================ */
function updateCamera(dt) {
  const wantD = (26 + R * 5.4) * cam.zoom * (1 + Math.max(0, 1 - camera.aspect) * .8);
  cam.dist = lerp(cam.dist, wantD, 1 - Math.exp(-dt * 2.5));
  const k = 1 - Math.exp(-dt * 3.2);
  cam.tx = lerp(cam.tx, T.x, k); cam.tz = lerp(cam.tz, T.z, k);
  const cp = Math.cos(cam.pitch);
  const ty = Math.min(H * .22, 8);
  cam.shake = Math.max(0, cam.shake - dt * 2.5);
  const sh = cam.shake * cam.shake * .5;
  camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist + rand(-sh, sh), Math.max(2, Math.sin(cam.pitch) * cam.dist + ty) + rand(-sh, sh), cam.tz + Math.cos(cam.yaw) * cp * cam.dist + rand(-sh, sh));
  camera.lookAt(cam.tx, ty, cam.tz);
  // tiene
  const ext = clamp(cam.dist * .8 + 14, 34, 150);
  if (Math.abs(ext - shadowExt) / ext > .06) {
    shadowExt = ext;
    const sc = sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = ext * 6 + 140; sc.updateProjectionMatrix();
  }
  scene.fog.near = cam.dist * 1.2; scene.fog.far = cam.dist * 6 + 160;
}
const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
function screenToWorld(cx, cy) {
  ray.setFromCamera(new THREE.Vector2(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1), camera);
  return ray.ray.intersectPlane(ground, hit) ? hit : null;
}
const ptrs = new Map(); let down = null, pinch = 0;
canvas.addEventListener('pointerdown', e => {
  audioInit();
  canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
});
canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch) cam.zoom = clamp(cam.zoom * pinch / d, .45, 2.4); pinch = d; if (down) down.moved = 99; return;
  }
  if (down) { down.moved += Math.abs(dx) + Math.abs(dy); if (down.moved > 8) { cam.yaw -= dx * .006; cam.pitch = clamp(cam.pitch + dy * .005, .22, 1.3); } }
});
canvas.addEventListener('pointerup', e => {
  if (down && down.moved <= 8 && performance.now() - down.t < 500 && ptrs.size === 1) {
    const w = screenToWorld(e.clientX, e.clientY); if (w) commandTo(w.x, w.z);
  }
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; if (!ptrs.size) down = null;
});
canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); down = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); cam.zoom = clamp(cam.zoom * Math.exp(e.deltaY * .001), .45, 2.4); }, { passive: false });

/* ================================================================
   UI: vylepšenia, HUD, radar, správy
   ================================================================ */
const upWrap = $('upgrades'), upEls = {};
UPG.forEach((u, i) => {
  const el = document.createElement('div'); el.className = 'up';
  el.innerHTML = `<div class="ic">${u.icon}</div><div><div class="nm">${u.name}<i></i></div><div class="ef2"></div></div><div class="buy"></div>`;
  el.addEventListener('click', () => { audioInit(); buy(u); });
  upWrap.appendChild(el); upEls[u.id] = { el, lv: el.querySelector('i'), ef: el.querySelector('.ef2'), buy: el.querySelector('.buy') };
});
const presEl = (() => {
  const el = document.createElement('div'); el.className = 'up pres';
  el.innerHTML = '<div class="ic">🌀</div><div><div class="nm">Nový front<i></i></div><div class="ef2"></div></div><div class="buy"></div>';
  el.addEventListener('click', () => { audioInit(); askPrestige(); });
  upWrap.appendChild(el);
  return { el, ef: el.querySelector('.ef2'), buy: el.querySelector('.buy') };
})();
function askPrestige() {
  const g = prestigeGain();
  if (g < 1) { news('Nový front: potrebuješ aspoň 200K škody v tomto fronte.', true); return; }
  modal(`<div class="lbl">Prestíž</div><h1>NOVÝ <em>FRONT</em></h1>
    <p>Z tornáda sa stane nová tlaková níž. Stratíš peniaze, vylepšenia a mesto sa postaví odznova, ale získaš trvalý bonus.</p>
    <div class="big">+${g} 🌀</div><p>Bonus ku všetkým škodám: ×${prestigeMult().toFixed(1)} → <b>×${(1 + .2 * (S.pts + g)).toFixed(1)}</b></p>
    <button id="m-yes">NOVÝ FRONT</button> <button id="m-no" style="background:#2a4a85;color:#fff">ZRUŠIŤ</button>`);
  $('m-no').onclick = closeModal;
  $('m-yes').onclick = () => {
    S.pts += prestigeGain(); S.fronts++;
    newRun(); closeModal(); news('Nový front sa formuje! Mesto sa postavilo odznova.', true);
  };
}
function plan(u) {
  const l = S.lv[u.id], cap = u.max === undefined ? Infinity : u.max - l;
  if (cap <= 0) return { n: 0, cost: 0, max: true };
  let n = 0, cost = 0;
  if (S.qty === 'max') { while (n < cap && n < 500) { const c = costOf(u, l + n); if (cost + c > S.money) break; cost += c; n++; } if (n === 0) { n = 1; cost = costOf(u, l); } }
  else { n = Math.min(+S.qty, cap); for (let k = 0; k < n; k++) cost += costOf(u, l + k); }
  return { n, cost, max: false };
}
function buy(u) {
  const p = plan(u); if (p.max || S.money < p.cost) return;
  S.money -= p.cost; S.lv[u.id] += p.n;
  const names = { power: () => { const k = windKmh(); return `Sila vetra stúpla na ${k} km/h – ${efOf(k)[0]}. Obyvatelia sa zamýšľajú nad presťahovaním.`; },
    radius: () => 'Tornádo sa rozšírilo. Do cesty mu už padá aj susedná ulica.', speed: () => 'Tornádo zrýchlilo – meteorológovia nestíhajú aktualizovať mapy.',
    storm: () => 'Nad oblasťou sa rozbúrila elektrická búrka.', value: () => 'Poisťovne vyplácajú viac. Škody sú rekordné!', offline: () => 'Nočná zmena prináša zisk aj mimo vysielania.' };
  news(names[u.id](), true);
  refreshUI(true);
  save();
}
$('qty').addEventListener('click', e => { const q = e.target.dataset && e.target.dataset.q; if (!q) return; S.qty = q; [...$('qty').children].forEach(b => b.classList.toggle('on', b.dataset.q === q)); refreshUI(true); });
window.addEventListener('keydown', e => {
  audioInit();
  if (e.key >= '1' && e.key <= '6') { const u = UPG[+e.key - 1]; if (u) buy(u); }
  else if (e.key === 'm' || e.key === 'M') setMuted(!S.muted);
});
$('btn-mute').addEventListener('click', () => { audioInit(); setMuted(!S.muted); });
$('btn-reset').addEventListener('click', () => {
  modal(`<div class="lbl">Nová hra</div><h1>Začať <em>odznova</em>?</h1><p>Všetok postup vrátane prestíže sa stratí.</p><button id="m-yes">ZMAZAŤ</button> <button id="m-no" style="background:#2a4a85;color:#fff">ZRUŠIŤ</button>`);
  $('m-no').onclick = closeModal;
  $('m-yes').onclick = () => { S.pts = 0; S.fronts = 0; S.destroyed = 0; newRun(); closeModal(); };
});
// nový beh (prestíž / reset): vynuluje postup a postaví mesto odznova bez reloadu stránky
function newRun() {
  S.money = 0; S.total = 0; S.rate = 0; shownMoney = 0;
  for (const k in S.lv) S.lv[k] = 0;
  for (const b of buildings) cityGroup.remove(b.group);
  buildings.length = 0; target = null; manual = null; marker.visible = false;
  for (const lot of lots) {
    if (lot.rubble) { cityGroup.remove(lot.rubble); lot.rubble = null; }
    lot.b = null; lot.timer = 0;
    if (!lot.park) makeBuilding(lot, true);
  }
  for (const t of trees) { t.alive = true; t.hp = t.max; t.grow = 1; t.dirty = true; t.shake = 0; }
  tierSeen = unlockedTier(); megaSeen = megaScale(); R = radiusOf();
  refreshUI(); save();
}

const setHTML = (el, v) => { if (el._v !== v) { el._v = v; el.innerHTML = v; } };
const setText = (el, v) => { if (el._v !== v) { el._v = v; el.textContent = v; } };
function refreshUI() {
  for (const u of UPG) {
    const e = upEls[u.id], l = S.lv[u.id], p = plan(u);
    setText(e.lv, 'Úr. ' + l);
    setHTML(e.ef, p.max ? `<b>${u.show(l)}</b> (maximum)` : `${u.show(l)} → <b>${u.show(l + p.n)}</b>`);
    setText(e.buy, p.max ? 'MAX' : (p.n > 1 ? `+${p.n} · ` : '') + fmt(p.cost) + ' €');
    e.el.classList.toggle('can', !p.max && S.money >= p.cost);
    e.el.classList.toggle('max', p.max);
  }
  // prestíž
  const g = prestigeGain(), pe = presEl;
  setHTML(pe.ef, g >= 1 ? `+${g} 🌀 · bonus ×${(1 + .2 * (S.pts + g)).toFixed(1)} <b>(teraz ×${prestigeMult().toFixed(1)})</b>` : `Potrebuješ ${fmt(2e5)} škody v tomto fronte · bonus teraz ×${prestigeMult().toFixed(1)}`);
  setText(pe.buy, g >= 1 ? 'ZAČAŤ' : 'ZAMKNUTÉ');
  pe.el.classList.toggle('can', g >= 1);
}
let shownMoney = S.money;
function updateHUD(dt) {
  shownMoney = lerp(shownMoney, S.money, 1 - Math.exp(-dt * 12));
  if (Math.abs(shownMoney - S.money) < .5) shownMoney = S.money;
  setHTML($('money'), fmt(shownMoney) + ' <small>€</small>');
  let r = 0; if (rateHist.length > 1) { for (const h of rateHist) r += h[1]; r /= Math.max(.5, rateHist[rateHist.length - 1][0] - rateHist[0][0] + .0001); }
  S.rate = lerp(S.rate, r, .1);
  setText($('rate'), '+' + fmt(S.rate) + ' €/s');
  setText($('destroyed'), fmt(S.destroyed) + ' zničených');
  const k = windKmh(), ef = efOf(k);
  setText($('wind'), String(k)); setText($('ef'), ef[0]); $('ef').style.background = ef[1];
  setText($('diam'), (2 * R).toFixed(1));
  setText($('zone'), unlockedTier() + 1 + (megaScale() > 1 ? '+' : ''));
  setText($('clock'), `Front č. ${S.fronts + 1}${S.pts ? ' · ×' + prestigeMult().toFixed(1) : ''}`);
}
/* radar */
const rc = $('radar'), rg = rc.getContext('2d');
const TIER_COL = ['#6fe08a', '#a8e05a', '#f2d14a', '#f29a3d', '#ee5a4a', '#d94fe0'];
function drawRadar() {
  const W = rc.width, c = W / 2, sc = W / (2 * (WORLD + 6)), X = x => c + x * sc, Y = z => c + z * sc;
  rg.clearRect(0, 0, W, W);
  rg.save(); rg.beginPath(); rg.arc(c, c, c - 2, 0, 7); rg.clip();
  rg.fillStyle = '#06224a'; rg.fillRect(0, 0, W, W);
  rg.strokeStyle = 'rgba(110,193,255,.22)'; rg.lineWidth = 1;
  for (let i = 1; i <= 4; i++) { rg.beginPath(); rg.arc(c, c, c * i / 4, 0, 7); rg.stroke(); }
  rg.beginPath(); rg.moveTo(c, 0); rg.lineTo(c, W); rg.moveTo(0, c); rg.lineTo(W, c); rg.stroke();
  rg.fillStyle = 'rgba(90,150,90,.5)'; for (const t of trees) if (t.alive) rg.fillRect(X(t.x), Y(t.z), 2, 2);
  for (const b of buildings) { if (!b.alive) continue; rg.fillStyle = TIER_COL[b.tier]; const s = 3 + b.tier * .8; rg.fillRect(X(b.x) - s / 2, Y(b.z) - s / 2, s, s); }
  if (target && target.alive && !manual) { rg.strokeStyle = '#fff'; rg.setLineDash([4, 4]); rg.beginPath(); rg.arc(X(target.x), Y(target.z), 9, 0, 7); rg.stroke(); rg.setLineDash([]); }
  if (manual) { rg.strokeStyle = '#ffd21f'; rg.lineWidth = 2; rg.beginPath(); rg.arc(X(manual.x), Y(manual.z), 8, 0, 7); rg.stroke(); }
  // tornádo
  const tx = X(T.x), ty = Y(T.z), tr = Math.max(7, R * sc * 1.5);
  rg.strokeStyle = '#fff'; rg.lineWidth = 2.5; rg.beginPath();
  for (let a = 0; a < 12; a += .3) { const rr = tr * a / 12; rg.lineTo(tx + Math.cos(a + time * 4) * rr, ty + Math.sin(a + time * 4) * rr); } rg.stroke();
  rg.fillStyle = 'rgba(255,60,60,.25)'; rg.beginPath(); rg.arc(tx, ty, tr * 1.3, 0, 7); rg.fill();
  // sweep
  const a = time * 1.6;
  if (rg.createConicGradient) {
    const gr = rg.createConicGradient(a - 1.2, c, c); gr.addColorStop(0, 'rgba(110,255,170,0)'); gr.addColorStop(.19, 'rgba(110,255,170,.35)'); gr.addColorStop(.2, 'rgba(110,255,170,0)');
    rg.fillStyle = gr; rg.fillRect(0, 0, W, W);
  }
  rg.strokeStyle = 'rgba(140,255,190,.8)'; rg.lineWidth = 2; rg.beginPath(); rg.moveTo(c, c); rg.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c); rg.stroke();
  rg.restore();
}
rc.addEventListener('pointerdown', e => {
  audioInit();
  const r = rc.getBoundingClientRect(), W = rc.width, sc = W / (2 * (WORLD + 6));
  const px = (e.clientX - r.left) / r.width * W, pz = (e.clientY - r.top) / r.height * W;
  commandTo((px - W / 2) / sc, (pz - W / 2) / sc);
});

/* TV-ticker */
const FLAVOR = [
  'Predpoveď na zajtra: tornádo. Opäť.', 'Dopravná situácia: cesty sú voľné, lebo tam už nič nie je.', 'Starosta: „Mali sme zostať doma.“',
  'Tlak vzduchu klesá, nálada obyvateľov tiež.', 'Poisťovňa oznamuje, že už nikoho nepoistí. Nikdy.', 'Neodporúčame pikniky v okruhu 50 km od vírenia.',
  'Reportér hlási zo strechy domu. Dom už nie je.', 'Psy sa skrývajú, mačky to riešia po svojom.', 'Zber odpadu odložený. Odpad sa zbiera sám.',
  'Odborníci: „Čím väčší vietor, tým väčšie ťažkosti.“', 'Tornádo vraj radšej mieri na mrakodrapy. Má rado výhľady.', 'Slnečné prestávky sa dnes nepredpokladajú.',
];
const tkq = []; let tkBusy = false; const tkEl = $('tk');
function news(msg, prio) { if (tkq.length > 6) tkq.pop(); prio ? tkq.unshift(msg) : tkq.push(msg); if (!tkBusy) nextNews(); }
function nextNews() {
  const m = tkq.shift() || pick(FLAVOR); tkEl.textContent = m; tkBusy = true;
  const cw = tkEl.parentElement.clientWidth; document.documentElement.style.setProperty('--cw', cw + 'px');
  const dur = (cw + tkEl.offsetWidth) / 120;
  tkEl.style.animation = 'none'; void tkEl.offsetWidth; tkEl.style.animation = `tk ${dur}s linear forwards`;
  $('headline').textContent = m.length < 90 ? m : 'Tornádo · priamy prenos z postihnutej oblasti';
}
tkEl.addEventListener('animationend', () => { tkBusy = false; nextNews(); });

/* ================================================================
   Ukladanie, offline, úvod
   ================================================================ */
function save() { if (window.__noSave) return; try { S.time = Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, s: S })); } catch (e) { /* ignore */ } }
function modal(html) { $('mbox').innerHTML = html; $('modal').classList.add('show'); }
function closeModal() { $('modal').classList.remove('show'); }
function offlineClaim(sec, fromHidden) {
  if (sec < 30 || S.rate < .5) return false;
  const eff = offlineEff(S.lv.offline), gain = S.rate * Math.min(sec, 8 * 3600) * eff;
  if (gain < 1) return false;
  earn(gain); shownMoney = S.money - gain;
  const mins = Math.floor(sec / 60);
  const t = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
  modal(`<div class="lbl">Správa z miesta udalosti</div><h1>Vitaj <em>späť</em></h1><p>Počas tvojej neprítomnosti (${t}) tornádo ďalej ničilo – pri účinnosti ${Math.round(eff * 100)} %.</p><div class="big">+${fmt(gain)} €</div><p>Vylepši „Nočnú zmenu“ pre vyšší offline zisk.</p><button id="m-ok">POKRAČOVAŤ</button>`);
  $('m-ok').onclick = () => { audioInit(); closeModal(); };
  return true;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { S.time = Date.now(); save(); window.__hiddenAt = Date.now(); }
  else if (window.__hiddenAt) { const s = (Date.now() - window.__hiddenAt) / 1000; window.__hiddenAt = 0; if (!$('modal').classList.contains('show')) offlineClaim(s, true); }
});
window.addEventListener('beforeunload', save);

/* ================================================================
   Štart
   ================================================================ */
initCity(); initTrees();
setMuted(S.muted);
[...$('qty').children].forEach(b => b.classList.toggle('on', b.dataset.q === S.qty));
window.addEventListener('resize', resize); resize();
// počiatočná poloha tornáda – mimo mesta, nech vidíme príchod
T.x = -HALF - 14; T.z = -20; cam.tx = T.x; cam.tz = T.z;
for (const t of trees) writeTree(t, 0);
treeMesh.instanceMatrix.needsUpdate = true;
refreshUI(true);

const firstRun = S.total === 0 && !localStorage.getItem(SAVE_KEY);
news('Meteorologický ústav varuje: nad regiónom sa formuje tornádo.', true);
news('Ovládanie: kliknutím nasmeruješ tornádo, inak si cestu hľadá samo.');
const away = (Date.now() - S.time) / 1000;
if (firstRun) {
  modal(`<span class="live" style="display:inline-flex"><i></i>LIVE</span><h1>TORNÁDO <em>IDLE</em></h1>
  <p>Vitaj v priamom prenose METEO 24. Malý vír sa blíži k mestu. Ničí domy – za každú škodu dostávaš peniaze, ktoré investuješ do silnejšieho vetra.</p>
  <ul><li><b>Klik</b> do sveta alebo na radar – nasmeruje tornádo</li><li><b>Ťahanie</b> – otáčanie kamery, <b>koliesko</b> – zoom</li><li>Bez zásahu si tornádo vyberá najvýnosnejšie ciele samo</li><li>Hra sa ukladá a zarába aj keď si preč</li></ul>
  <button id="m-ok">ŠTART</button>`);
  $('m-ok').onclick = () => { audioInit(); closeModal(); };
} else if (!offlineClaim(away, false)) { /* nič */ }

let last = performance.now(), hudT = 0, radT = 0, saveT = 0, uiT = 0, fpsAcc = 0, fpsN = 0, fpsT = 0;
window.__tornado = { S, ts: 1, T, get R() { return R; }, buildings, trees, update, commandTo, UPG, buy, news, fmt, cam };
function frame(now) {
  const rdt = Math.min(.1, (now - last) / 1000); last = now;
  const ts = window.__tornado.ts;
  let remaining = rdt * ts;
  while (remaining > 1e-6) { const step = Math.min(.05, remaining); update(step); remaining -= step; }
  const dt = rdt;
  for (const t of trees) if (t.dirty) { writeTree(t, time); treeMesh.instanceMatrix.needsUpdate = true; if (!t.alive || (t.shake <= 0 && t.grow >= 1)) t.dirty = false; }
  updateCamera(dt); updateRain(dt); updatePops(dt); updateAudio();
  hudT += dt; if (hudT > .1) { updateHUD(hudT); hudT = 0; }
  uiT += dt; if (uiT > .25) { refreshUI(); uiT = 0; }
  radT += dt; if (radT > .08) { drawRadar(); radT = 0; }
  saveT += dt; if (saveT > 5) { save(); saveT = 0; }
  // adaptívna kvalita
  fpsAcc += rdt; fpsN++; fpsT += rdt;
  if (fpsT > 3) { const fps = fpsN / fpsAcc; if (fps < 28 && pr > .6) { pr = Math.max(.6, pr - .25); resize(); } fpsAcc = fpsN = fpsT = 0; }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
