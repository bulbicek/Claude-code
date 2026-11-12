import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { t, lang, setLangCode } from './i18n.js';

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
  let i = Math.floor(Math.log10(n) / 3);
  if (i >= SUF.length) return n.toExponential(2).replace('e+', 'e');
  let v = n / Math.pow(1000, i);
  if (v >= 999.5 && i < SUF.length - 1) { v /= 1000; i++; }   // 999.9M sa nezaokrúhli na „1000M“, ale na 1.00B
  return (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : v.toFixed(0)) + SUF[i];
}

// Canvas -> DataTexture: dáta zostanú v pamäti JS (mobilné prehliadače po uspatí zahadzujú obsah skrytých canvasov)
function bakeTexture(c, repeatX) {
  const w = c.width, h = c.height, src = c.getContext('2d').getImageData(0, 0, w, h).data, row = w * 4, out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) out.set(src.subarray(y * row, (y + 1) * row), (h - 1 - y) * row);   // canvas má riadok 0 hore, textúra dole
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  if (repeatX) t.wrapS = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/* ================================================================
   Herný stav, vylepšenia, tiery budov
   ================================================================ */
const SAVE_KEY = 'tornadoIdle.v1';
const S = { money: 0, total: 0, life: 0, pts: 0, fronts: 0, destroyed: 0, cars: 0, bridges: 0, buys: 0, boosts: 0, qn: 0, qbase: 0, qgoal: 0, rate: 0, muted: false, cine: null, lang: null, qty: '1', time: Date.now(),
  lv: { power: 0, radius: 0, speed: 0, storm: 0, value: 0, offline: 0 } };
try {
  const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  if (raw && (raw.v === 1 || raw.v === 2)) { Object.assign(S, raw.s); if (raw.v === 1) { S.pts = Math.min(S.pts || 0, 25); S.rate = 0; } S.lv = Object.assign({ power: 0, radius: 0, speed: 0, storm: 0, value: 0, offline: 0 }, raw.s.lv); }
} catch (e) { /* ignore */ }

setLangCode(S.lang || (/^(sk|cs)/i.test(navigator.language || '') ? 'sk' : 'en'));

const dpsOf = l => 8 * Math.pow(1.195, l);
const UPG = [
  { id: 'power', icon: '💨', base: 12, g: 1.62, show: l => fmt(dpsOf(l)) + ' ' + t('dmg') },
  { id: 'radius', icon: '🌪️', base: 25, g: 1.73, max: 150, show: l => (2 * radiusAt(l)).toFixed(1) + ' m' },
  { id: 'speed', icon: '🧭', base: 40, g: 1.78, max: 30, show: l => speedAt(l).toFixed(1) + ' m/s' },
  { id: 'storm', icon: '⚡', base: 300, g: 2.14, show: l => l === 0 ? t('off') : `${stormInterval(l).toFixed(1)} s · ×${stormCount(l)}` },
  { id: 'value', icon: '💶', base: 90, g: 2.08, show: l => '×' + fmt(Math.pow(VALUE_B, l)) },
  { id: 'offline', icon: '🌙', base: 400, g: 2.6, max: 15, show: l => Math.round(offlineEff(l) * 100) + ' %' },
];
const stormInterval = l => 7 / (1 + 0.18 * (l - 1));
const stormCount = l => 1 + Math.floor((l - 1) / 6);
const offlineEff = l => Math.min(1, 0.1 + 0.06 * l);
const costOf = (u, l) => Math.floor(u.base * Math.pow(u.g, l));
// polomer rastie čoraz pomalšie a blíži sa k stropu 22 m – tornádo nikdy neprerastie mapu
const radiusAt = l => 2.6 + 19.4 * (1 - Math.pow(.98, l)), speedAt = l => Math.min(18, 4.2 * Math.pow(1.05, l));
const radiusOf = () => radiusAt(S.lv.radius);
const speedOf = () => speedAt(S.lv.speed);
const PRESTIGE_BASE = 1.2e6, PRESTIGE_K = .15, VALUE_B = 1.19;
const prestigeMult = () => 1 + PRESTIGE_K * S.pts;
const prestigeGain = () => Math.floor(Math.cbrt(S.total / PRESTIGE_BASE));
const valueMult = () => Math.pow(VALUE_B, S.lv.value) * prestigeMult();
const windKmh = () => 85 + 16 * S.lv.power;
function efOf(k) {
  if (k >= 450) return ['EF5+', '#ff4d6d'];
  if (k >= 322) return ['EF5', '#ff4d6d'];
  if (k >= 267) return ['EF4', '#ff8a3d'];
  if (k >= 218) return ['EF3', '#ffc533'];
  if (k >= 178) return ['EF2', '#e6e84a'];
  if (k >= 138) return ['EF1', '#9be85f'];
  if (k >= 105) return ['EF0', '#8be28b'];
  return [t('tb'), '#8fd3ff'];
}

const TIERS = [
  { w: 2.4, d: 2.4, h: 1.9, hp: 14, val: 7, roof: 'pitch', rows: 1, cols: 2, unlock: 0 },
  { w: 3.4, d: 3.0, h: 2.7, hp: 40, val: 24, roof: 'pitch', rows: 2, cols: 3, unlock: 180 },
  { w: 4.6, d: 3.4, h: 6.6, hp: 160, val: 110, roof: 'flat', rows: 7, cols: 5, unlock: 3000 },
  { w: 4.2, d: 4.2, h: 8, hp: 700, val: 560, roof: 'flat', rows: 8, cols: 6, unlock: 50000 },
  { w: 4.0, d: 4.0, h: 11, hp: 3600, val: 3200, roof: 'flat', rows: 11, cols: 5, unlock: 1.3e6 },
  { w: 4.6, d: 4.6, h: 15, hp: 20000, val: 20000, roof: 'flat', rows: 15, cols: 6, unlock: 4e7 },
];
// Štýly fasád pre každý typ budovy (každý štýl = vlastná textúra) – okrem farby steny sa líšia aj usporiadaním okien
const GLASS_TINT = { blue: ['#a9c3d6', '#4f7189'], teal: ['#a9d0c9', '#437a72'], grey: ['#cdd5dc', '#6b7884'], bronze: ['#dccaa4', '#7d6445'], deep: ['#8aa3c0', '#34506f'] };
const STYLES = [
  [{ k: 'classic' }, { k: 'shutters', sh: '#3f6a5a' }, { k: 'shutters', sh: '#8a3b2e' }],
  [{ k: 'classic' }, { k: 'shutters', sh: '#35507a' }, { k: 'shutters', sh: '#6b4a35' }],
  [{ k: 'grid' }, { k: 'balcony' }, { k: 'stripes' }],
  [{ k: 'curtain', c: 'blue' }, { k: 'ribbon', c: 'grey', sp: '#bdb7aa' }, { k: 'piers', c: 'teal' }],
  [{ k: 'curtain', c: 'blue' }, { k: 'curtain', c: 'bronze' }, { k: 'ribbon', c: 'teal', sp: '#8f979f' }, { k: 'piers', c: 'deep' }],
  [{ k: 'curtain', c: 'deep' }, { k: 'piers', c: 'grey' }, { k: 'ribbon', c: 'blue', sp: '#d7d2c6' }, { k: 'curtain', c: 'teal' }],
];
const WALLS = [
  ['#e8d9c5', '#d9a38a', '#c9d6b0', '#b7cbe0', '#e7c9c9', '#f0e6b8', '#d8c0a0', '#f2f2ee', '#a9c4a0', '#e6b98f'],
  ['#e1cfb6', '#c9b79c', '#d7b8a8', '#bcd0c0', '#e6dcb0', '#c4cde0', '#f0ece0', '#cfa89a', '#b4c3d4', '#d9d0a0'],
  ['#c9c6bf', '#dccaa6', '#e6cfae', '#b9c6a8', '#c8d4dc', '#d8b8a4', '#ebe4d0', '#a8b0a0', '#cfa6a0', '#9fb4c8'],
  ['#ffffff', '#f4f0e6', '#e8eef5', '#f2e9e0', '#e3e9e3'],
  ['#ffffff', '#f1ede4', '#e6edf4', '#f0e8de', '#e1e7e1'],
  ['#ffffff', '#f3efe6', '#e8eef4', '#efe8df', '#e4eaea'],
];
const ROOFS = ['#8a3b2e', '#6b4a3a', '#4d5a66', '#a05a3a', '#7a2f2f'];
const unlockedTier = () => { let t = 0; TIERS.forEach((d, i) => { if (S.total >= d.unlock) t = i; }); return t; };
const megaScale = () => S.total > 4e8 ? Math.pow(2, Math.floor(Math.log10(S.total / 4e7))) : 1;

/* ================================================================
   Renderer, scéna, kamera
   ================================================================ */
const canvas = $('c');
const LOW = matchMedia('(pointer:coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4;   // mobil / slabšie zariadenie
document.body.classList.toggle('low', LOW);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
const BASE_PR = Math.min(window.devicePixelRatio || 1, LOW ? 1.5 : 2);
let pr = BASE_PR;
renderer.setPixelRatio(pr);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = LOW ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = !LOW;        // na mobile sa tiene prepočítavajú len každú druhú snímku
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb9c4cf, 60, 400);
const camera = new THREE.PerspectiveCamera(48, 1, 1, 2500);
const cam = { yaw: 0.65, pitch: 0.6, zoom: 1, dist: 40, tx: 0, tz: 0, shake: 0 };

const HALF = 64, WORLD = 92;
const LAKES = [];   // ploché jazerá boli odstránené (vodu tvorí len 3D rieka)
const inLake = (x, z, pad) => LAKES.some(l => Math.pow((x - l.x) / (l.rx + pad), 2) + Math.pow((z - l.z) / (l.rz + pad), 2) < 1);
function paintGeo(g, col) { const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
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

/* ---- obloha (shader s mrakmi) + prostredie pre odlesky ---- */
const SKY_FRAG = `uniform vec3 uTop,uHor,uGround,uSunCol,uSunDir; uniform float uGlow,uTime; varying vec3 vP;
  float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y); }
  void main(){ vec3 d=normalize(vP); float y=d.y;
    vec3 c=mix(uHor,uTop,pow(clamp(y,0.0,1.0),0.55));
    if(y<0.0) c=mix(uHor,uGround,smoothstep(0.0,-0.25,y));
    float s=max(dot(d,uSunDir),0.0); c+=uSunCol*(pow(s,24.0)*0.6+pow(s,4.0)*0.15)*uGlow;
    if(y>0.02){
      vec2 p=d.xz/(y+0.2)*1.5+vec2(uTime*0.012,uTime*0.006);
      float n=vn(p)*0.55+vn(p*2.3)*0.3;
      #ifdef HQ
      n+=vn(p*5.1)*0.15;
      #endif
      float m=smoothstep(0.38,0.72,n)*smoothstep(0.02,0.3,y);
      vec3 cc=mix(uHor*0.95,uTop*0.55,smoothstep(0.45,0.85,n));
      c=mix(c,cc,m*0.8);
    }
    gl_FragColor=vec4(c,1.0); gl_FragColor=linearToOutputTexel(gl_FragColor); }`;
const SKY_COL = { top: '#4d78a8', hor: '#aab9c6', ground: '#566448' };
function makeSkyMat() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, defines: LOW ? {} : { HQ: 1 },
    uniforms: { uTop: { value: new THREE.Color(SKY_COL.top) }, uHor: { value: new THREE.Color(SKY_COL.hor) }, uGround: { value: new THREE.Color(SKY_COL.ground) },
      uSunDir: { value: new THREE.Vector3(.5, .8, .3).normalize() }, uSunCol: { value: new THREE.Color('#fff0d8') }, uGlow: { value: .4 }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: SKY_FRAG,
  });
}
const skyMat = makeSkyMat(), skyUniforms = skyMat.uniforms;
const sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 24, 12), skyMat);
sky.renderOrder = -10; sky.frustumCulled = false;
scene.add(sky);
{ // jednorazovo vypočítané prostredie: jemné okolité svetlo a odlesky na skle
  const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), makeSkyMat()));
  scene.environment = pm.fromScene(es, 0, .1, 200).texture; scene.environmentIntensity = .55; pm.dispose();
}

/* ---- svetlá ---- */
const HEMI_I = .6;
const hemi = new THREE.HemisphereLight(0xbcd2ee, 0x5a6b4a, HEMI_I);
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
/* ================================================================
   Pôdorys mesta: kľukaté ulice, rieka, mosty, kruhové objazdy, parky
   ================================================================ */
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const prng = mulberry32(7731), pr_ = (a, b) => a + prng() * (b - a);
const STEP = 1.5, RIVER_HALF = 4.2;
function resample(pts, step) {            // rovnomerné vzorky po oblúku
  const out = [pts[0]]; let prev = pts[0], need = step;
  for (let i = 1; i < pts.length; i++) {
    let a = prev; const b = pts[i]; let d = Math.hypot(b.x - a.x, b.z - a.z);
    while (d >= need) { const t = need / d, q = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }; out.push(q); a = q; d = Math.hypot(b.x - a.x, b.z - a.z); need = step; }
    need -= d; prev = b;
  }
  return out;
}
function spline(ctrl, step) {             // Catmull-Rom cez kontrolné body
  const fine = [], n = ctrl.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(n - 1, i + 2)];
    for (let k = 0; k < 12; k++) {
      const t = k / 12, t2 = t * t, t3 = t2 * t, f = j => .5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      fine.push({ x: f(0), z: f(1) });
    }
  }
  fine.push({ x: ctrl[n - 1][0], z: ctrl[n - 1][1] });
  return resample(fine, step);
}
const riverPts = spline([[-115, -26], [-80, -18], [-52, -4], [-30, 10], [-6, 14], [18, 6], [40, -6], [64, -12], [95, -4], [115, 10]], STEP);
const riverTan = riverPts.map((p, i) => { const a = riverPts[Math.max(0, i - 1)], b = riverPts[Math.min(riverPts.length - 1, i + 1)], d = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { x: (b.x - a.x) / d, z: (b.z - a.z) / d }; });
function distRiver(x, z) { let m = 1e9; for (const p of riverPts) { const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z); if (d < m) m = d; } return Math.sqrt(m); }

// 3D koryto: breh klesá z úrovne terénu (0) na dno (BED) a voda stojí na WATER_Y
const BED = -1.7, WATER_Y = -.55, BANK0 = RIVER_HALF + 3.4, BANK1 = RIVER_HALF - .6, GRID = LOW ? 120 : 200;
const riverCoarse = riverPts.filter((_, i) => i % 3 === 0), HF = new Float32Array((GRID + 1) * (GRID + 1));
function terrainH(x, z) {
  let m = 1e9; for (const p of riverCoarse) { const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z); if (d < m) m = d; }
  if (m > (BANK0 + 5) * (BANK0 + 5)) return 0;
  const fade = (1 - smooth(86, 100, Math.abs(x))) * (1 - smooth(86, 100, Math.abs(z)));   // pri okraji mapy sa koryto vyplytčuje
  return BED * (1 - smooth(BANK1, BANK0, distRiver(x, z))) * fade;
}
function heightAt(x, z) {                          // rýchly dotaz na výšku terénu (bilineárne z mriežky)
  const u = clamp((x + 100) * GRID / 200, 0, GRID - .001), v = clamp((z + 100) * GRID / 200, 0, GRID - .001), i = u | 0, j = v | 0, a = u - i, b = v - j, w = GRID + 1;
  return (HF[j * w + i] * (1 - a) + HF[j * w + i + 1] * a) * (1 - b) + (HF[(j + 1) * w + i] * (1 - a) + HF[(j + 1) * w + i + 1] * a) * b;
}
const ROADS = [], PLAZAS = [], PARKS = [], BRIDGES = [], JUNCTIONS = [], LOT_SPECS = [];
const RS = { x: [], z: [], h: [], id: [] };       // všetky vzorky ciest pre dotazy na vzdialenosť
function addStreet(kind, pts, extra) {
  const half = kind === 'avenue' ? 3 : 2.1, id = ROADS.length;
  const st = Object.assign({ id, kind, half, pts, tx: [], tz: [], len: (pts.length - 1) * STEP, y: new Float32Array(pts.length), bridges: [], cap: false }, extra);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], d = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    st.tx.push((b.x - a.x) / d); st.tz.push((b.z - a.z) / d);
    RS.x.push(pts[i].x); RS.z.push(pts[i].z); RS.h.push(half); RS.id.push(id);
  }
  ROADS.push(st); return st;
}
function clearance(x, z, skipId) {        // vzdialenosť od okraja najbližšej cesty / námestia
  let m = 1e9;
  for (let i = 0; i < RS.x.length; i++) { if (RS.id[i] === skipId) continue; const dx = RS.x[i] - x, dz = RS.z[i] - z, d = Math.sqrt(dx * dx + dz * dz) - RS.h[i]; if (d < m) m = d; }
  for (const pl of PLAZAS) m = Math.min(m, Math.hypot(pl.x - x, pl.z - z) - pl.r);
  return m;
}
function tryBranch(par, i0, side) {
  const nx = -par.tz[i0] * side, nz = par.tx[i0] * side, p0 = par.pts[i0];
  let x = p0.x + nx * (par.half - .4), z = p0.z + nz * (par.half - .4), ang = Math.atan2(nz, nx) + pr_(-.3, .3);
  const a0 = ang, curv = pr_(-.045, .045), steps = Math.floor(pr_(14, 28)), pts = [{ x, z }];
  let end = 'cap';
  for (let k = 1; k <= steps; k++) {
    ang += curv + pr_(-.02, .02); x += Math.cos(ang) * STEP; z += Math.sin(ang) * STEP;
    if (Math.abs(x) > 66 || Math.abs(z) > 66) { end = 'edge'; break; }
    if (distRiver(x, z) < RIVER_HALF + 7) { end = 'cap'; break; }
    const c = clearance(x, z, par.id);
    if (k > 4 && c < 3.6) { pts.push({ x, z }); end = 'join'; break; }
    if (k > 5 && c < 8.5) { end = 'cap'; break; }
    pts.push({ x, z });
  }
  if (pts.length < 9) return null;
  JUNCTIONS.push({ x: pts[0].x, z: pts[0].z, a: a0, half: par.half });
  return addStreet('street', pts, { cap: end === 'cap', parent: par.id });
}
function buildPlan() {
  // hlavné bulváre (kľukaté)
  const AVS = [
    ['sever', [[-72, -34], [-44, -24], [-14, -30], [18, -22], [48, -30], [74, -22]], false],
    ['juh', [[-72, 36], [-40, 34], [-8, 40], [26, 34], [56, 42], [74, 36]], true],
    ['A', [[-22, -70], [-28, -36], [-16, -6], [-12, 24], [-22, 50], [-18, 70]], true],
    ['B', [[34, -70], [28, -40], [36, -8], [30, 22], [40, 50], [34, 70]], false],
    ['C', [[-56, -68], [-52, -32], [-60, -6], [-50, 24], [-58, 50], [-54, 70]], false],
    ['D', [[62, -68], [58, -36], [66, -10], [60, 20], [66, 48], [62, 70]], false],
  ];
  const avs = AVS.map(([name, c, median]) => addStreet('avenue', spline(c, STEP), { name, median }));
  // kruhové objazdy v najbližších križovatkách bulvárov
  const hits = [];
  for (let a = 0; a < avs.length; a++) for (let b = a + 1; b < avs.length; b++) {
    let best = null;
    for (const p of avs[a].pts) for (const q of avs[b].pts) { const d = Math.hypot(p.x - q.x, p.z - q.z); if (d < 2 && (!best || d < best.d)) best = { d, x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 }; }
    if (best && Math.abs(best.x) < 58 && Math.abs(best.z) < 58 && distRiver(best.x, best.z) > RIVER_HALF + 10) hits.push(best);
  }
  hits.sort((u, v) => Math.hypot(u.x, u.z) - Math.hypot(v.x, v.z));
  for (const h of hits.slice(0, 3)) if (!PLAZAS.some(p => Math.hypot(p.x - h.x, p.z - h.z) < 30)) PLAZAS.push({ x: h.x, z: h.z, r: 5.6 });
  // promenády popri rieke
  for (const [side, xa, xb] of [[-1, -50, 14], [1, 8, 60]]) {
    const pts = [];
    riverPts.forEach((p, i) => { if (p.x < xa || p.x > xb) return; const t = riverTan[i]; pts.push({ x: p.x - t.z * side * (RIVER_HALF + 8.5), z: p.z + t.x * side * (RIVER_HALF + 8.5) }); });
    if (pts.length > 8) addStreet('street', resample(pts, STEP), { promenade: true });
  }
  // vedľajšie ulice: odbočky z bulvárov a promenád, potom z nich ďalšie
  for (const par of ROADS.filter(r => r.kind === 'avenue' || r.promenade)) for (let s = 9; s < par.len - 9; s += pr_(13, 20)) for (const side of [-1, 1]) if (prng() < .75) tryBranch(par, Math.round(s / STEP), side);
  for (const par of ROADS.filter(r => r.kind === 'street' && !r.promenade && r.pts.length >= 16)) for (let s = 10; s < par.len - 8; s += pr_(14, 22)) for (const side of [-1, 1]) if (prng() < .45) tryBranch(par, Math.round(s / STEP), side);
  // mosty: úseky bulvárov v koridore rieky
  for (const st of avs) {
    let i = 0; const n = st.pts.length;
    while (i < n) {
      if (distRiver(st.pts[i].x, st.pts[i].z) < RIVER_HALF + 2.2) {
        let j = i; while (j + 1 < n && distRiver(st.pts[j + 1].x, st.pts[j + 1].z) < RIVER_HALF + 2.2) j++;
        const m = (i + j) >> 1, c = st.pts[m], len = (j - i) * STEP + 5, s0 = i * STEP - 2.5, s1 = j * STEP + 2.5;
        const br = { st, s0, s1, x: c.x, z: c.z, yaw: -Math.atan2(st.tz[m], st.tx[m]), len, wid: st.half * 2 + 1.8 };
        BRIDGES.push(br); st.bridges.push(br);
        for (let k = 0; k < n; k++) { const sk = k * STEP; st.y[k] = Math.max(st.y[k], .3 * clamp(Math.min(sk - (s0 - 3), (s1 + 3) - sk) / 3, 0, 1)); }
        i = j + 1;
      } else i++;
    }
  }
  // parky
  for (let tries = 0; tries < 160 && PARKS.length < 3; tries++) {
    const x = pr_(-50, 50), z = pr_(-50, 50);
    if (clearance(x, z, -1) < 14 || distRiver(x, z) < 17 || PARKS.some(p => Math.hypot(p.x - x, p.z - z) < 36)) continue;
    PARKS.push({ x, z, r: 9 }); prng();   // prng() ponechané, aby sa nezmenil pôdorys mesta
  }
  // parcely pozdĺž ulíc – budovy otočené k ulici
  const placed = [];
  const fits = (x, z, st) => {
    if (Math.abs(x) > WORLD - 10 || Math.abs(z) > WORLD - 10) return false;
    if (distRiver(x, z) < RIVER_HALF + 4.6 || clearance(x, z, -1) < 2.4 || inLake(x, z, 3)) return false;
    for (const pk of PARKS) if (Math.hypot(pk.x - x, pk.z - z) < pk.r + 2.5) return false;
    for (const q of placed) if ((q.x - x) * (q.x - x) + (q.z - z) * (q.z - z) < 5.3 * 5.3) return false;
    return true;
  };
  for (const st of ROADS) {
    for (let s = 4; s < st.len - 3; s += 6.4 + pr_(-.3, .7)) {
      const i = Math.min(st.pts.length - 1, Math.round(s / STEP)), p = st.pts[i], tx = st.tx[i], tz = st.tz[i];
      for (const side of [-1, 1]) for (const row of [0, 1]) {
        if (row === 1 && prng() < .3) continue;
        const off = st.half + 3.4 + row * 6.2, x = p.x - tz * side * off + pr_(-.4, .4) * row, z = p.z + tx * side * off + pr_(-.4, .4) * row;
        if (!fits(x, z, st)) continue;
        placed.push({ x, z });
        const c = clamp(1 - Math.hypot(x, z) / (HALF * 1.1) + (st.kind === 'avenue' ? .2 : 0), 0, 1);
        LOT_SPECS.push({ kind: 'house', x, z, yaw: -Math.atan2(tz, tx), c, park: prng() < .08 });
      }
    }
  }
  // pevné stavby: dve vodárenské veže v meste, dva veterné mlyny a dve stodoly za mestom
  const lmPlaced = [];
  const lmFits = (x, z, r, inTown) => {
    if (distRiver(x, z) < RIVER_HALF + (inTown ? 6 : 9) || clearance(x, z, -1) < (inTown ? r : r + 1) || inLake(x, z, 4)) return false;
    if (inTown ? (Math.abs(x) > 52 || Math.abs(z) > 52) : (Math.abs(x) < HALF + 5 && Math.abs(z) < HALF + 5 || Math.abs(x) > WORLD - 9 || Math.abs(z) > WORLD - 9)) return false;
    for (const q of placed) if ((q.x - x) * (q.x - x) + (q.z - z) * (q.z - z) < (inTown ? r + 1.6 : r + 3) * (inTown ? r + 1.6 : r + 3)) return false;
    for (const q of lmPlaced) if (Math.hypot(q.x - x, q.z - z) < (inTown ? 20 : 24)) return false;
    for (const pk of PARKS) if (Math.hypot(pk.x - x, pk.z - z) < pk.r + r + 1) return false;
    return true;
  };
  for (const [model, count, r, inTown] of [['tower', 2, 2.5, true], ['windmill', 2, 5, false], ['barn', 2, 8, false]]) {
    for (let k = 0, tries = 0; k < count && tries < 700; tries++) {
      const x = pr_(-WORLD + 8, WORLD - 8), z = pr_(-WORLD + 8, WORLD - 8);
      if (!lmFits(x, z, r, inTown)) continue;
      lmPlaced.push({ x, z }); k++;
      LOT_SPECS.push({ kind: 'landmark', model, x, z, yaw: pr_(0, 6.283), c: .5, park: false, r });
    }
  }
  for (const br of BRIDGES) LOT_SPECS.push({ kind: 'bridge', x: br.x, z: br.z, yaw: br.yaw, len: br.len, wid: br.wid, c: 1, park: false });
}
buildPlan();

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
  // jazerá
  for (const l of LAKES) {
    const cx = px(l.x), cz = px(l.z);
    for (const [k, col] of [[1.18, '#cdbb8a'], [1.0, '#3d7fb0'], [.7, '#4a93c4'], [.4, '#5aa6d2']]) {
      g.fillStyle = col; g.beginPath(); g.ellipse(cx, cz, l.rx * k * ppu, l.rz * k * ppu, 0.3, 0, 7); g.fill();
    }
  }
  // parky
  for (const pk of PARKS) {
    const cx = px(pk.x), cz = px(pk.z);
    g.fillStyle = '#7fae5e'; g.beginPath(); g.arc(cx, cz, pk.r * ppu, 0, 7); g.fill();
    g.fillStyle = '#8cba68'; g.beginPath(); g.arc(cx, cz, pk.r * .8 * ppu, 0, 7); g.fill();
    g.strokeStyle = '#cdbf95'; g.lineWidth = 1.1 * ppu; g.beginPath(); g.arc(cx, cz, pk.r * .55 * ppu, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(cx - pk.r * ppu, cz); g.lineTo(cx + pk.r * ppu, cz); g.moveTo(cx, cz - pk.r * ppu); g.lineTo(cx, cz + pk.r * ppu); g.stroke();
  }
  // dvory pred domami
  for (const l of LOT_SPECS) {
    if (l.kind === 'landmark') { g.fillStyle = l.model === 'barn' ? '#a99b6b' : '#8fa86a'; g.beginPath(); g.arc(px(l.x), px(l.z), (l.model === 'barn' ? 7 : 4.2) * ppu, 0, 7); g.fill(); continue; }
    if (l.kind === 'bridge') continue;
    g.save(); g.translate(px(l.x), px(l.z)); g.rotate(-l.yaw);
    g.fillStyle = pick(['#6f9c4f', '#78a556', '#668f49', '#82ad5c']); g.fillRect(-3.3 * ppu, -2.9 * ppu, 6.6 * ppu, 5.8 * ppu);
    if (Math.random() < .5) for (let k = 0, nf = randi(5, 12); k < nf; k++) { g.fillStyle = pick(['#e0507a', '#f0d040', '#ffffff', '#c070e8', '#ff9a40']); g.beginPath(); g.arc(rand(-3, 3) * ppu, rand(-2.7, 2.7) * ppu, rand(.5, 1.3) * ppu * .18, 0, 7); g.fill(); }
    if (Math.random() < .4) { g.fillStyle = 'rgba(80,60,40,.35)'; g.fillRect(rand(-2.8, 1) * ppu, rand(-2.4, 1.4) * ppu, 1.8 * ppu, .9 * ppu); }   // záhonček
    g.restore();
  }
  // cesty: chodník → obrubník → asfalt → značenie
  g.lineCap = 'round'; g.lineJoin = 'round';
  const trace = (st, w, style) => { g.beginPath(); st.pts.forEach((q, i) => i ? g.lineTo(px(q.x), px(q.z)) : g.moveTo(px(q.x), px(q.z))); g.lineWidth = w * ppu; g.strokeStyle = style; g.stroke(); };
  const disc = (x, z, r, style) => { g.fillStyle = style; g.beginPath(); g.arc(px(x), px(z), r * ppu, 0, 7); g.fill(); };
  for (const st of ROADS) { trace(st, st.half * 2 + 2.6, '#9a9d90'); if (st.cap) disc(st.pts[st.pts.length - 1].x, st.pts[st.pts.length - 1].z, st.half + 2.4, '#9a9d90'); }
  for (const pl of PLAZAS) disc(pl.x, pl.z, pl.r + 1.4, '#9a9d90');
  for (const st of ROADS) { trace(st, st.half * 2 + .5, '#6b6e66'); if (st.cap) disc(st.pts[st.pts.length - 1].x, st.pts[st.pts.length - 1].z, st.half + .3, '#6b6e66'); }
  for (const pl of PLAZAS) disc(pl.x, pl.z, pl.r + .3, '#6b6e66');
  for (const st of ROADS) { trace(st, st.half * 2, '#4a4e54'); if (st.cap) disc(st.pts[st.pts.length - 1].x, st.pts[st.pts.length - 1].z, st.half, '#4a4e54'); }
  for (const pl of PLAZAS) { disc(pl.x, pl.z, pl.r, '#4a4e54'); disc(pl.x, pl.z, pl.r * .45 + .3, '#8a8d84'); disc(pl.x, pl.z, pl.r * .45, '#6f9c4f'); }
  for (const st of ROADS) {
    if (st.median) { trace(st, 1.9, '#8a8d84'); trace(st, 1.4, '#5f9a4a'); }
    else { g.setLineDash(st.kind === 'avenue' ? [22, 22] : [14, 18]); trace(st, st.kind === 'avenue' ? .2 : .14, st.kind === 'avenue' ? '#d8d27a' : '#d8d8d0'); g.setLineDash([]); }
  }
  for (const pl of PLAZAS) { disc(pl.x, pl.z, pl.r * .45 + .3, '#8a8d84'); disc(pl.x, pl.z, pl.r * .45, '#6f9c4f'); }   // ostrovček cez značenie
  // priechody pre chodcov na odbočkách
  g.fillStyle = 'rgba(235,235,225,.8)';
  for (const j of JUNCTIONS) {
    const hx = Math.cos(j.a), hz = Math.sin(j.a), cx = j.x + hx * 2.8, cz = j.z + hz * 2.8;
    g.save(); g.translate(px(cx), px(cz)); g.rotate(j.a);
    for (let k = -2; k <= 2; k++) g.fillRect(-1.1 * ppu, (k * .8 - .21) * ppu, 2.2 * ppu, .42 * ppu);
    g.restore();
  }
  // rieka: breh, voda, jadro (voda sa navyše animuje samostatným pásom)
  g.beginPath(); riverPts.forEach((q, i) => i ? g.lineTo(px(q.x), px(q.z)) : g.moveTo(px(q.x), px(q.z)));
  for (const [w, col] of [[BANK0 * 2 + .6, '#bdae80'], [(RIVER_HALF + 2.2) * 2, '#a39465'], [(RIVER_HALF + .8) * 2, '#85775a'], [(RIVER_HALF - 1.2) * 2, '#665b45']]) { g.lineWidth = w * ppu; g.strokeStyle = col; g.stroke(); }
  for (let i = 0; i < 26000; i++) { // jemná zrnitosť
    g.fillStyle = Math.random() < .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';
    g.fillRect(rand(0, SZ), rand(0, SZ), randi(1, 3), randi(1, 3));
  }
  const tex = bakeTexture(c); tex.anisotropy = 8;
  const gg = new THREE.PlaneGeometry(W, W, GRID, GRID).rotateX(-Math.PI / 2), gp = gg.attributes.position;
  for (let i = 0; i < gp.count; i++) { const h = terrainH(gp.getX(i), gp.getZ(i)); gp.setY(i, h); HF[i] = h; }
  gg.computeVertexNormals();
  const m = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  m.receiveShadow = true; m.matrixAutoUpdate = false;
  scene.add(m);
  const base = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6d9a50, roughness: 1 }));
  base.position.y = -2.6; base.receiveShadow = true; scene.add(base);
  // „sukňa" okolo mapy: zelené steny od terénu po základnú plochu (okraj mapy nesmie ukázať schod)
  const skirtGeo = new THREE.BufferGeometry(), sv = [], sc = 100;
  for (const [ax, az, bx, bz] of [[-sc, -sc, sc, -sc], [sc, -sc, sc, sc], [sc, sc, -sc, sc], [-sc, sc, -sc, -sc]]) sv.push(ax, 0, az, bx, 0, bz, bx, -2.6, bz, ax, 0, az, bx, -2.6, bz, ax, -2.6, az);
  skirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3)); skirtGeo.computeVertexNormals();
  const skirt = new THREE.Mesh(skirtGeo, new THREE.MeshBasicMaterial({ color: 0x4f7a3a, side: THREE.DoubleSide })); skirt.matrixAutoUpdate = false; scene.add(skirt);
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
function windowTexture(def, tier, st) {
  const glass = tier >= 3, cw = glass ? 28 : 22, ch = glass ? 28 : 22, W = def.cols * cw, H = def.rows * ch;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), mix = (a, b, k) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.substr(i, 2), 16) * (1 - k) + parseInt(b.substr(i, 2), 16) * k).toString(16).padStart(2, '0')).join('');
  const pane = (x, y, w, h, tint, bright) => {            // jedna sklenená tabuľa: prechod odrazu oblohy, rôzna jasnosť, odlesky
    const lighter = Math.random() < .09, top = mix(tint[0], '#dbe8f1', lighter ? .5 : 0), bot = mix(tint[1], '#8fb0c6', lighter ? .4 : 0), gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, top); gr.addColorStop(1, bot);
    g.globalAlpha = Math.min(1, bright); g.fillStyle = gr; g.fillRect(x, y, w, h); g.globalAlpha = 1;
    g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(x, y, w, 1.5); g.fillStyle = 'rgba(20,40,60,.14)'; g.fillRect(x, y + h - 2, w, 2);
    if (Math.random() < .12) { g.fillStyle = 'rgba(255,255,255,.13)'; g.beginPath(); g.moveTo(x + w * .15, y + h); g.lineTo(x + w * .55, y); g.lineTo(x + w * .75, y); g.lineTo(x + w * .35, y + h); g.fill(); }
  };
  const rnd = () => .84 + Math.random() * .26;
  if (glass) {
    const tint = GLASS_TINT[st.c];
    if (st.k === 'curtain') {                                                      // celá presklená fasáda
      g.fillStyle = '#d2d8de'; g.fillRect(0, 0, W, H);
      for (let r = 0; r < def.rows; r++) for (let k = 0; k < def.cols; k++) pane(k * cw + 2, r * ch + 1, cw - 4, ch - 6, tint, rnd());
      g.fillStyle = 'rgba(120,132,144,.55)'; for (let r = 0; r < def.rows; r++) g.fillRect(0, r * ch + ch - 5, W, 2);
    } else if (st.k === 'ribbon') {                                                // súvislé pásy skla a plné parapety medzi poschodiami
      g.fillStyle = st.sp; g.fillRect(0, 0, W, H);
      for (let r = 0; r < def.rows; r++) {
        const y = r * ch + 4, h = ch - 11;
        for (let k = 0; k < def.cols; k++) pane(k * cw, y, cw, h, tint, rnd());
        g.fillStyle = 'rgba(90,100,110,.55)'; for (let k = 0; k <= def.cols; k++) g.fillRect(k * cw - 1, y, 2, h);
      }
    } else {                                                                       // piers: úzke okná medzi svetlými piliermi
      g.fillStyle = '#e0dbd0'; g.fillRect(0, 0, W, H);
      for (let r = 0; r < def.rows; r++) for (let k = 0; k < def.cols; k++) { pane(k * cw + 8, r * ch + 3, cw - 16, ch - 8, tint, rnd()); g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(k * cw + 6, r * ch + 3, 2, ch - 8); }
      g.fillStyle = 'rgba(150,145,135,.5)'; for (let r = 0; r < def.rows; r++) g.fillRect(0, r * ch + ch - 3, W, 2);
    }
  } else {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    if (st.k === 'stripes') { g.fillStyle = 'rgba(70,90,115,.17)'; for (let k = 0; k <= def.cols; k++) g.fillRect(k * cw - 3, 0, 6, H); }
    for (let r = 0; r < def.rows; r++) for (let k = 0; k < def.cols; k++) {
      const x = k * cw + 5, y = r * ch + 5, w = cw - 10, h = ch - 10;
      if (tier <= 1 && r === 0 && k === 0) { g.fillStyle = '#6b4a35'; g.fillRect(x, y - 2, w, h + 4); continue; }  // dvere
      if (st.k === 'shutters') { g.fillStyle = st.sh; g.fillRect(x - 4, y - 1, 3, h + 2); g.fillRect(x + w + 1, y - 1, 3, h + 2); }
      const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#9db4cb'); gr.addColorStop(1, '#6a85a3');
      g.fillStyle = '#c9c5bb'; g.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);        // rám okna
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x, y, w, 2);
      g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x + w / 2 - .5, y, 1, h);        // stredový stĺpik
      g.fillStyle = '#b9b4a8'; g.fillRect(x - 2, y + h + 1.5, w + 4, 1.5);         // parapet
      if (st.k === 'balcony') { g.fillStyle = 'rgba(70,66,60,.55)'; g.fillRect(k * cw + 1, r * ch + ch - 6, cw - 2, 4); g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(k * cw + 1, r * ch + ch - 7, cw - 2, 1); }   // balkón
    }
  }
  const t = bakeTexture(c); t.anisotropy = 4;
  return t;
}
const roofMats = {};
const roofMat = hex => roofMats[hex] || (roofMats[hex] = new THREE.MeshStandardMaterial({ color: hex, roughness: .9, vertexColors: true }));
const wallMats = {};
const winTex = TIERS.map((d, i) => STYLES[i].map(st => windowTexture(d, i, st)));
function wallMat(tier, st, hex) {
  const k = tier + ':' + st + ':' + hex;
  if (wallMats[k]) return wallMats[k];
  const col = new THREE.Color(hex);
  return wallMats[k] = new THREE.MeshStandardMaterial({ map: winTex[tier][st], vertexColors: true, color: col, roughness: tier >= 3 ? .3 : .85, metalness: tier >= 3 ? .12 : 0, envMapIntensity: tier >= 3 ? 1.5 : 1 });
}
const bodyGeo = TIERS.map(d => {   // zapečené "ambient occlusion" pri zemi a mierne zosvetlenie smerom hore (zadarmo za behu)
  const g = new THREE.BoxGeometry(d.w, d.h, d.d, 1, Math.ceil(d.h / 1.2), 1).translate(0, d.h / 2, 0);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), reach = Math.min(2.6, d.h * .7);
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), v = (.5 + .5 * smooth(0, reach, y)) * (.9 + .1 * y / d.h); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
});
const pyr = (d, hh) => { const g = new THREE.ConeGeometry(1, hh, 4, 1).rotateY(Math.PI / 4); g.scale(d.w / 2 / .7071 * 1.12, 1, d.d / 2 / .7071 * 1.12); g.translate(0, d.h + hh / 2, 0); return g; };
// Varianty budov: každá je JEDEN mesh s dvoma skupinami (steny, strecha) – menej volaní vykresľovania a viac rozmanitosti
const VARIANTS = TIERS.map((d, t) => {
  const B = (w, h, dd, x, y, z, col) => paintGeo(new THREE.BoxGeometry(w, h, dd).translate(x, y, z), col || '#ffffff');
  const mk = (walls, roofs, top) => ({ geo: mergeGeometries([mergeGeometries(walls), mergeGeometries(roofs)], true), top });
  const body = bodyGeo[t], H0 = d.h;
  if (d.roof === 'pitch') {
    const hh = t ? 1.6 : 1.2, hip = (w, dd, h, x, y, z) => { const g = new THREE.ConeGeometry(1, h, 4, 1).rotateY(Math.PI / 4); g.scale(w / 2 / .7071 * 1.12, 1, dd / 2 / .7071 * 1.12); g.translate(x, y + h / 2, z); return paintGeo(g, '#ffffff'); };
    const flat = '#d8d2c4', ch = (x, z, y0) => B(.28, .7, .28, x, y0 + .35, z, '#ffffff');
    return [
      mk([body], [paintGeo(pyr(d, hh), '#ffffff'), B(.28, .7, .28, d.w * .22, H0 + .95, d.d * .12)], hh),                                                       // klasický domček
      mk([body, B(d.w * .56, H0 * .46, .6, 0, H0 * .23, d.d / 2 + .3)], [hip(d.w, d.d, hh * 1.25, 0, H0, 0), B(d.w * .68, .1, .86, 0, H0 * .46 + .05, d.d / 2 + .38, flat), ch(-d.w * .25, -d.d * .15, H0 + .35)], hh * 1.25),   // s verandou
      mk([body, B(d.w * .52, H0 * .72, d.d * .72, d.w / 2 + d.w * .22, H0 * .36, 0)], [hip(d.w, d.d, hh * 1.4, 0, H0, 0), hip(d.w * .6, d.d * .84, hh * .55, d.w / 2 + d.w * .22, H0 * .72, 0), ch(-d.w * .28, d.d * .1, H0 + .3)], hh * 1.4),  // s prístavbou (garáž)
    ];
  }
  const slab = () => B(d.w * 1.04, .22, d.d * 1.04, 0, H0 + .11, 0, '#4b5057');
  const ac = () => [B(d.w * .22, .35, d.d * .22, -d.w * .25, H0 + .4, d.d * .22, '#6a7078'), B(d.w * .16, .28, d.d * .3, d.w * .26, H0 + .36, -d.d * .2, '#6a7078')];
  const step = (k, hh, y0) => B(d.w * k, hh, d.d * k, 0, H0 + .22 + (y0 || 0) + hh / 2, 0);                        // nadstavba (steny)
  const cap = (k, y) => B(d.w * k * 1.05, .18, d.d * k * 1.05, 0, H0 + .22 + y + .09, 0, '#4b5057');            // jej strecha
  const spire = (hh, y0) => paintGeo(new THREE.ConeGeometry(.24, hh, 6).translate(0, H0 + .22 + y0 + hh / 2, 0), '#aab3bd');
  const out = [mk([body], [slab(), ...ac()], .6)];                                                              // rovná strecha s klimatizáciou
  if (t >= 3) out.push(mk([body, step(.62, H0 * .2)], [slab(), cap(.62, H0 * .2)], H0 * .2 + .4));               // jedna nadstavba
  if (t >= 4) {
    out.push(mk([body, step(.66, 1.6)], [slab(), cap(.66, 1.6), spire(H0 * .24, 1.8)], 2 + H0 * .24));          // korunka s ihlou
    out.push(mk([body, step(.74, H0 * .16), step(.46, H0 * .14, H0 * .16)], [slab(), cap(.74, H0 * .16), cap(.46, H0 * .3)], H0 * .3 + .4));   // stupňovitá veža
    out.push(mk([body, step(.5, H0 * .1)], [slab(), cap(.5, H0 * .1), spire(H0 * .12, H0 * .1 + .2), ...ac()], H0 * .22 + .6));              // úzka nadstavba s anténou
  }
  return out;
});
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

const bridgeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85 });
function bridgeGeo(len, wid) {
  const parts = [], add = (g, col) => parts.push(paintGeo(g, col));
  add(new THREE.BoxGeometry(len, .34, wid).translate(0, .17, 0), '#8e9094');
  add(new THREE.BoxGeometry(len - .2, .03, wid - 1.9).translate(0, .355, 0), '#4a4e54');
  for (const sg of [-1, 1]) {
    add(new THREE.BoxGeometry(len, .12, .2).translate(0, .34 + .6, sg * (wid / 2 - .12)), '#d4d6da');
    add(new THREE.BoxGeometry(len, .08, .16).translate(0, .34 + .3, sg * (wid / 2 - .12)), '#bfc2c7');
    for (let x = -len / 2 + .3; x <= len / 2 - .2; x += 2.2) add(new THREE.BoxGeometry(.22, .7, .24).translate(x, .34 + .35, sg * (wid / 2 - .12)), '#c4c7cc');
  }
  for (const k of [-.32, 0, .32]) add(new THREE.BoxGeometry(.9, 2.2, wid * .7).translate(k * len, -.85, 0), '#5c5f66');
  return mergeGeometries(parts);
}
const LM_DEF = {
  tower: { name: 'tower', w: 3.4, d: 3.4, h: 10, hp: 70, val: 90, csz: .4, wall: '#cfd6dd', roof: '#6b6f76' },
  windmill: { name: 'windmill', w: 3.4, d: 3.4, h: 8.5, hp: 85, val: 100, csz: .35, wall: '#e0dac9', roof: '#8a3b2e' },
  barn: { name: 'barn', w: 8.2, d: 5.6, h: 5.4, hp: 140, val: 130, csz: .55, wall: '#a23b2e', roof: '#4d5a66' },
};
const lmMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 }), lmGeo = {};
function lmGeometry(model) {
  if (lmGeo[model]) return lmGeo[model];
  const P = [], add = (g, col) => P.push(paintGeo(g, col)), B = (w, h, d, x, y, z, col) => add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col);
  const C = (rt, rb, h, x, y, z, col, seg) => add(new THREE.CylinderGeometry(rt, rb, h, seg || 10).translate(x, y, z), col);
  if (model === 'tower') {                                   // vodárenská veža: nohy, nádrž, kužeľová strecha
    for (const [sx, sz] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) B(.2, 6.4, .2, sx * 1.1, 3.2, sz * 1.1, '#6b6f76');
    B(2.6, .2, .2, 0, 3.5, 1.1, '#6b6f76'); B(2.6, .2, .2, 0, 3.5, -1.1, '#6b6f76'); B(.2, .2, 2.6, 1.1, 3.5, 0, '#6b6f76'); B(.2, .2, 2.6, -1.1, 3.5, 0, '#6b6f76');
    C(1.6, 1.6, 2.6, 0, 7.7, 0, '#cfd6dd', 14); add(new THREE.ConeGeometry(1.75, 1.1, 14).translate(0, 9.55, 0), '#8a9099'); C(.12, .12, .5, 0, 10.3, 0, '#aab3bd', 6);
  } else if (model === 'windmill') {                         // veterný mlyn (listy sú samostatný mesh)
    C(.95, 1.5, 6.6, 0, 3.3, 0, '#e0dac9', 12); add(new THREE.ConeGeometry(1.25, 1.5, 12).translate(0, 7.3, 0), '#8a3b2e'); B(.9, 1.1, .1, 0, 1.0, 1.42, '#6b4a35');
  } else {                                                   // stodola so silom
    B(7.2, 3.6, 4.6, 0, 1.8, 0, '#a23b2e'); const roof = new THREE.ConeGeometry(1, 1.9, 4).rotateY(Math.PI / 4); roof.scale(7.6 / 2 / .7071, 1, 5 / 2 / .7071); roof.translate(0, 3.6 + .95, 0); add(roof, '#4d5a66');
    B(2.2, 2.6, .12, 0, 1.3, 2.34, '#e8dcc0'); C(1.15, 1.15, 6.2, 4.6, 3.1, -1.2, '#c9ccd0', 14); add(new THREE.SphereGeometry(1.15, 14, 6, 0, 6.283, 0, 1.571).translate(4.6, 6.2, -1.2), '#9aa0a8');
  }
  return lmGeo[model] = mergeGeometries(P);
}
function makeLandmark(lot, instant) {                         // pevná stavba: životy, hodnota, dorastá, dá sa zničiť (ako most)
  const m = [1, 1.5, 3, 8, 25, 80][unlockedTier()] * (unlockedTier() >= 4 ? megaScale() : 1), base = LM_DEF[lot.model];
  const def = Object.assign({ roof: 'flat' }, base, { hp: base.hp * m, val: base.val * m });
  const g = new THREE.Group(), mesh = new THREE.Mesh(lmGeometry(lot.model), lmMat);
  mesh.castShadow = mesh.receiveShadow = true; g.add(mesh);
  let blades = null;
  if (lot.model === 'windmill') {
    const bm = new THREE.Mesh(mergeGeometries([paintGeo(new THREE.BoxGeometry(.22, 5.2, .07), '#cfc6ae'), paintGeo(new THREE.BoxGeometry(5.2, .22, .07), '#cfc6ae'),
      paintGeo(new THREE.BoxGeometry(.9, 2.2, .04).translate(.6, 1.5, .05), '#f2ede0'), paintGeo(new THREE.BoxGeometry(2.2, .9, .04).translate(-1.5, .6, .05), '#f2ede0'),
      paintGeo(new THREE.BoxGeometry(.9, 2.2, .04).translate(-.6, -1.5, .05), '#f2ede0'), paintGeo(new THREE.BoxGeometry(2.2, .9, .04).translate(1.5, -.6, .05), '#f2ede0')]), lmMat);
    bm.position.set(0, 6.9, 1.35); bm.castShadow = true; g.add(bm); blades = bm;
  }
  g.userData.base = new THREE.Vector3(1, 1, 1);
  g.position.set(lot.x, 0, lot.z); g.rotation.order = 'XZY'; g.rotation.y = lot.yaw;
  g.scale.setScalar(instant ? 1 : 0.001);
  g.children.forEach(c => { if (c !== blades) { c.updateMatrix(); c.matrixAutoUpdate = false; } });
  cityGroup.add(g);
  if (lot.rubble) { cityGroup.remove(lot.rubble); lot.rubble = null; }
  const hp = def.hp * rand(.9, 1.1);
  const b = { lot, tier: 2, def, x: lot.x, z: lot.z, group: g, hp, max: hp, value: def.val * rand(.9, 1.1), alive: true, grow: instant ? 1 : 0, shake: 0, acc: 0, emitted: 0,
    chunks: 26, r: Math.max(def.w, def.d) / 2, h: def.h, wallHex: def.wall, roofHex: def.roof, lx: 0, lz: 0, earned: 0, glass: false, sy: 1, settled: false, blades };
  g.scale.setScalar(b.grow || .001);
  lot.b = b; buildings.push(b);
  return b;
}
function makeBridge(lot, instant) {                 // most je „budova": má životy, hodnotu, dorastá a dá sa zničiť
  const ut = unlockedTier(), m = [1, 1.5, 3, 8, 25, 80][ut] * (ut >= 4 ? megaScale() : 1);
  const def = { w: lot.len, d: lot.wid, h: .9, hp: 140 * m, val: 100 * m, roof: 'flat', csz: .45 };
  const g = new THREE.Group(), mesh = new THREE.Mesh(lot.geo || (lot.geo = bridgeGeo(lot.len, lot.wid)), bridgeMat);
  mesh.castShadow = mesh.receiveShadow = true; g.add(mesh);
  g.userData.base = new THREE.Vector3(1, 1, 1);
  g.position.set(lot.x, 0, lot.z); g.rotation.order = 'XZY'; g.rotation.y = lot.yaw;
  g.scale.setScalar(instant ? 1 : 0.001);
  g.children.forEach(c => { c.updateMatrix(); c.matrixAutoUpdate = false; });
  cityGroup.add(g);
  if (lot.rubble) { cityGroup.remove(lot.rubble); lot.rubble = null; }
  const hp = def.hp * rand(.9, 1.1);
  const b = { lot, tier: 3, def, x: lot.x, z: lot.z, group: g, hp, max: hp, value: def.val * rand(.9, 1.1), alive: true, grow: instant ? 1 : 0, shake: 0, acc: 0, emitted: 0,
    chunks: 30, r: Math.max(lot.len, lot.wid) / 2, h: .9, wallHex: '#8e9094', roofHex: '#d4d6da', lx: 0, lz: 0, earned: 0, glass: false, sy: 1, settled: false };
  g.scale.setScalar(b.grow || .001);
  lot.b = b; buildings.push(b);
  return b;
}
function makeBuilding(lot, instant) {
  if (lot.kind === 'bridge') return makeBridge(lot, instant);
  if (lot.kind === 'landmark') return makeLandmark(lot, instant);
  const tier = chooseTier(lot), def = TIERS[tier];
  const mega = tier >= 4 ? megaScale() : 1;
  const wallHex = pick(WALLS[tier]);
  const g = new THREE.Group();
  let roofHex = pick(ROOFS);
  const v = pick(VARIANTS[tier]), sty = randi(0, STYLES[tier].length - 1), roofTone = def.roof === 'pitch' ? roofHex : pick(['#ffffff', '#ffffff', '#e6dccc', '#cfd8e0', '#d6dccf', '#bfb6a8']);
  const mesh = new THREE.Mesh(v.geo, [wallMat(tier, sty, wallHex), roofMat(roofTone)]);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  const tall = tier >= 3, sx = tall ? rand(.8, 1.15) : rand(.88, 1.12), sz = tall ? rand(.8, 1.15) : sx, sy = tall ? rand(.74, 1.1) : tier === 2 ? rand(.8, 1.2) : rand(.92, 1.12);   // vyššie budovy sa líšia viac
  g.userData.base = new THREE.Vector3(sx, sy, sz);
  g.position.set(lot.x, 0, lot.z);
  g.rotation.order = 'XZY'; g.rotation.y = lot.yaw + (Math.random() < .5 ? 0 : Math.PI);   // tilt okolo svetových osí
  g.scale.setScalar(instant ? 1 : 0.001);
  g.children.forEach(c => { c.updateMatrix(); c.matrixAutoUpdate = false; });
  cityGroup.add(g);
  if (lot.rubble) { cityGroup.remove(lot.rubble); lot.rubble = null; }
  const hp = def.hp * mega * rand(.9, 1.1);
  const b = {
    lot, tier, def, x: lot.x, z: lot.z, group: g, hp, max: hp, value: def.val * mega * rand(.9, 1.1), alive: true,
    grow: instant ? 1 : 0, shake: 0, acc: 0, emitted: 0, chunks: 8 + tier * 9, r: Math.max(def.w, def.d) / 2 * Math.max(sx, sz, 1),
    h: (def.h + v.top) * sy, wallHex, roofHex: def.roof === 'pitch' ? roofHex : '#5a5f66', lx: 0, lz: 0, earned: 0,
    glass: tier >= 3, sy, settled: false,
  };
  g.scale.set(b.grow * sx, b.grow * sy, b.grow * sz);
  lot.b = b; buildings.push(b);
  return b;
}

function initCity() {
  for (const sp of LOT_SPECS) {
    const lot = Object.assign({ b: null, timer: 0, rubble: null }, sp);
    lots.push(lot);
    if (lot.kind === 'bridge') BRIDGES.find(br => br.x === lot.x && br.z === lot.z).lotRef = lot;
    if (!lot.park) makeBuilding(lot, true);
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
  treeMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, flatShading: true }), 900);
  treeMesh.castShadow = true; treeMesh.receiveShadow = true; treeMesh.frustumCulled = false;
  treeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(treeMesh);
  const houses = lots.filter(l => l.kind !== 'bridge'), nearLot = (x, z, d) => houses.some(l => (l.x - x) * (l.x - x) + (l.z - z) * (l.z - z) < d * d);
  const add = (x, z, o) => {
    o = o || {};
    if (inLake(x, z, 1.5) || distRiver(x, z) < RIVER_HALF + 4) return;
    if (!o.force && (clearance(x, z, -1) < (o.pad === undefined ? 1.8 : o.pad) || (o.lots && nearLot(x, z, 3.4)))) return;
    trees.push({ x, z, sy: rand(.85, 1.3), s: rand(.8, 1.5), rot: rand(0, 6), hp: 5, max: 5, alive: true, grow: 1, shake: 0, timer: 0, idx: trees.length, dirty: true, acc: 0 });
  };
  for (let n = 0, tries = 0; n < 330 && tries < 3000; tries++) {      // lesy za mestom
    const x = rand(-WORLD - 4, WORLD + 4), z = rand(-WORLD - 4, WORLD + 4);
    if (Math.abs(x) < HALF + 3 && Math.abs(z) < HALF + 3) continue;
    const before = trees.length;
    if (Math.random() < .5 && trees.length > 4) { const t = trees[randi(0, trees.length - 1)]; add(t.x + rand(-5, 5), t.z + rand(-5, 5)); } else add(x, z);
    if (trees.length > before) n++;
  }
  for (let k = 0; k < 400 && trees.length < 560; k++) add(rand(-HALF, HALF), rand(-HALF, HALF), { lots: true, pad: 2.2 });   // stromy v meste
  for (const pk of PARKS) for (let k = 0; k < 16; k++) { const a = rand(0, 6.3), r = pk.r * Math.sqrt(Math.random()) * .9; add(pk.x + Math.cos(a) * r, pk.z + Math.sin(a) * r, { force: true }); }
  for (const pl of PLAZAS) for (let k = 0; k < 3; k++) { const a = k * 2.1 + .5; add(pl.x + Math.cos(a) * pl.r * .22, pl.z + Math.sin(a) * pl.r * .22, { force: true }); }
  for (const st of ROADS) if (st.median) for (let i = 3; i < st.pts.length - 3; i += 4) { const q = st.pts[i]; if (!PLAZAS.some(pl => Math.hypot(pl.x - q.x, pl.z - q.z) < pl.r + 1.5)) add(q.x, q.z, { force: true }); }
  lots.filter(l => l.park).forEach(l => { for (let k = 0; k < 3; k++) add(l.x + rand(-2.2, 2.2), l.z + rand(-2.2, 2.2), { force: true }); });
  trees.forEach(t => {
    t.x = clamp(t.x, -WORLD - 6, WORLD + 6); t.z = clamp(t.z, -WORLD - 6, WORLD + 6);
    const f = rand(.75, 1.25), autumn = Math.random() < .12;
    treeMesh.setColorAt(t.idx, _c.setRGB(autumn ? 7 * f : f, autumn ? 2.4 * f : f * rand(.9, 1.15), autumn ? .5 : f * rand(.85, 1)));
  });
}
const dummy = new THREE.Object3D();
function writeTree(t, time) {
  const k = t.alive ? t.grow : 0;
  const lean = t.alive ? (1 - t.hp / t.max) * .5 : 0;
  dummy.position.set(t.x + Math.sin(time * 40 + t.idx) * .05 * t.shake, 0, t.z);
  dummy.rotation.set(Math.sin(t.idx) * lean, t.rot, Math.cos(t.idx) * lean);
  const s = t.s * k;
  dummy.scale.set(s, s * t.sy * (t.alive ? 1 : 0), s); dummy.updateMatrix();
  treeMesh.setMatrixAt(t.idx, dummy.matrix);
}

/* ================================================================
   Úlomky (instancing + fyzika)
   ================================================================ */
const MAXD = 2600;
const debMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: .9, flatShading: true }), MAXD);
debMesh.castShadow = !LOW; debMesh.frustumCulled = false;
debMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(debMesh);
const D = {};
['px', 'py', 'pz', 'vx', 'vy', 'vz', 'rx', 'ry', 'rz', 'wx', 'wy', 'wz', 'sx', 'sy', 'sz', 'life', 'resp', 'ejY', 'ej'].forEach(k => D[k] = new Float32Array(MAXD));
let dn = 0, colorDirty = false;
{ const z = new THREE.Matrix4().makeScale(0, 0, 0), c = new THREE.Color(1, 1, 1); for (let i = 0; i < MAXD; i++) { debMesh.setMatrixAt(i, z); debMesh.setColorAt(i, c); } }
const _c = new THREE.Color();
function spawnDebris(x, y, z, vx, vy, vz, size, hex, life) {
  const i = dn; dn = (dn + 1) % MAXD;
  D.px[i] = x; D.py[i] = y; D.pz[i] = z; D.vx[i] = vx; D.vy[i] = vy; D.vz[i] = vz;
  D.rx[i] = rand(0, 6); D.ry[i] = rand(0, 6); D.rz[i] = rand(0, 6);
  D.wx[i] = rand(-6, 6); D.wy[i] = rand(-6, 6); D.wz[i] = rand(-6, 6);
  D.sx[i] = size * rand(.6, 1.5); D.sy[i] = size * rand(.4, 1.2); D.sz[i] = size * rand(.6, 1.5);
  D.life[i] = life || rand(9, 15); D.resp[i] = rand(.5, 1.4) / (.6 + size); D.ejY[i] = rand(.5, 1.0); D.ej[i] = 0;
  _c.set(hex); _c.offsetHSL(0, 0, rand(-.06, .06));
  debMesh.setColorAt(i, _c); colorDirty = true;
}

/* ================================================================
   Čiastice (prach, víry)
   ================================================================ */
const pUniforms = { uScale: { value: 1000 }, uTint: { value: new THREE.Color(1, 1, 1) } };
// Pozn.: v shaderi sa nepoužíva smoothstep s obrátenými hranicami (v GLSL nedefinované) a NaN alfa sa zahadzuje.
const pMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, uniforms: pUniforms,
  vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale; varying float vA; varying vec3 vC;
    void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=min(aSize*uScale/max(-mv.z,0.1),400.0); vA=aAlpha; vC=aColor; }`,
  fragmentShader: `uniform vec3 uTint; varying float vA; varying vec3 vC;
    void main(){ float d=length(gl_PointCoord-0.5); float a=(1.0-smoothstep(0.05,0.5,d))*clamp(vA,0.0,1.0); if(!(a>=0.004)) discard; gl_FragColor=vec4(vC*uTint,a); gl_FragColor=linearToOutputTexel(gl_FragColor); }`,
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
const SW = LOW ? 750 : 1600;
const swirl = new Particles(SW, 6);
const sw = { ang: new Float32Array(SW), t: new Float32Array(SW), rf: new Float32Array(SW), spd: new Float32Array(SW), sz: new Float32Array(SW), shade: new Float32Array(SW), cls: new Uint8Array(SW) };
for (let i = 0; i < SW; i++) {   // 0 = mrak prachu, 1 = tmavé úlomky (silueta), 2 = prachová sukňa pri zemi
  const c = sw.cls[i] = i % 100 < 56 ? 0 : i % 100 < 86 ? 1 : 2;
  sw.ang[i] = rand(0, 6.3); sw.spd[i] = rand(.6, 1.4); sw.sz[i] = rand(.6, 1.4); sw.shade[i] = rand(0, 1);
  sw.t[i] = c === 0 ? Math.pow(Math.random(), 1.3) : c === 1 ? Math.pow(Math.random(), 1.7) * .8 : Math.random() * .12;
  sw.rf[i] = c === 0 ? rand(.78, 1.08) : c === 1 ? rand(.7, 1.7) : rand(.9, 1.4);
}
// kúdoly
const PF = LOW ? 700 : 1300;
const puffs = new Particles(PF, 7);
const pf = { life: new Float32Array(PF), max: new Float32Array(PF), vx: new Float32Array(PF), vy: new Float32Array(PF), vz: new Float32Array(PF), s0: new Float32Array(PF), s1: new Float32Array(PF), a0: new Float32Array(PF) };
let pn = 0;
const fires = [];
// Elektrické iskrenie: po niektorých zničených budovách krátko preskakujú oblúky (reťaz svietivých bodov, aditívne miešanie) + lietajúce iskry
const SPN = 520, sp = { pos: new Float32Array(SPN * 3), size: new Float32Array(SPN), alpha: new Float32Array(SPN), col: new Float32Array(SPN * 3), vel: new Float32Array(SPN * 3),
  ttl: new Float32Array(SPN), max: new Float32Array(SPN), grav: new Float32Array(SPN) };
let spI = 0;
const spGeo = new THREE.BufferGeometry();
for (const [k, a, n] of [['position', sp.pos, 3], ['aSize', sp.size, 1], ['aAlpha', sp.alpha, 1], ['aColor', sp.col, 3]]) spGeo.setAttribute(k, new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage));
const spPoints = new THREE.Points(spGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uScale: pUniforms.uScale },
  vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale; varying float vA; varying vec3 vC;
    void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=min(max(aSize*uScale/max(-mv.z,0.1),2.0),90.0); vA=aAlpha; vC=aColor; }`,
  fragmentShader: `varying float vA; varying vec3 vC;
    void main(){ float d=length(gl_PointCoord-0.5)*2.0; float a=pow(clamp(1.0-d,0.0,1.0),1.7)*vA; if(!(a>=0.004)) discard; gl_FragColor=vec4(vC,a); gl_FragColor=linearToOutputTexel(gl_FragColor); }`,
}));
spPoints.frustumCulled = false; spPoints.renderOrder = 9; scene.add(spPoints);
function spPoint(x, y, z, vx, vy, vz, size, ttl, r, g, b, grav) {
  const i = spI; spI = (spI + 1) % SPN;
  sp.pos[i * 3] = x; sp.pos[i * 3 + 1] = y; sp.pos[i * 3 + 2] = z; sp.vel[i * 3] = vx; sp.vel[i * 3 + 1] = vy; sp.vel[i * 3 + 2] = vz;
  sp.size[i] = size; sp.ttl[i] = sp.max[i] = ttl; sp.col[i * 3] = r; sp.col[i * 3 + 1] = g; sp.col[i * 3 + 2] = b; sp.grav[i] = grav || 0;
}
function spawnArc(x, y, z) {                                      // jeden zubatý oblúk dĺžky ~1–2,5 m + záblesk a pár lietajúcich iskier
  const a = rand(0, 6.3), len = rand(1.6, 3.6), dx = Math.cos(a), dz = Math.sin(a), n = 10, sx = x + rand(-.7, .7), sz = z + rand(-.7, .7), lift = rand(-.1, .7);
  for (let i = 0; i <= n; i++) {
    const f = i / n, j = Math.sin(f * 3.14) * .45, px = sx + dx * len * f - dz * rand(-j, j), pz = sz + dz * len * f + dx * rand(-j, j), py = y + Math.sin(f * 3.14) * lift + rand(-.12, .12), life = rand(.07, .13);
    spPoint(px, py, pz, 0, 0, 0, .27, life, .9, .97, 1.4);          // jasné jadro
    spPoint(px, py, pz, 0, 0, 0, .85, life, .3, .55, 1.3);          // modrastá žiara
  }
  spPoint(sx, y, sz, 0, 0, 0, 2.0, .12, .35, .55, 1.2);              // záblesk v mieste vzniku
  for (let k = 0, m = randi(3, 6); k < m; k++) { const b = rand(0, 6.3), v = rand(1.5, 4); spPoint(sx, y + .2, sz, Math.cos(b) * v, rand(2, 5), Math.sin(b) * v, rand(.13, .2), rand(.35, .8), 1.4, rand(.75, .95), rand(.3, .5), 11); }
  sparkSound();
}
const sparks = [];
function updateSparks(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const e = sparks[i]; e.t += dt; e.next -= dt;
    if (e.t > e.life) { sparks.splice(i, 1); continue; }
    if (e.next <= 0) { spawnArc(e.x, e.y, e.z); e.next = Math.random() < .35 ? .06 : rand(.14, .55); }   // občas dva oblúky tesne za sebou, inak nepravidelné pauzy
  }
  for (let i = 0; i < SPN; i++) {
    if (sp.ttl[i] <= 0) { sp.alpha[i] = 0; continue; }
    sp.ttl[i] -= dt;
    if (sp.ttl[i] <= 0) { sp.alpha[i] = 0; sp.size[i] = 0; continue; }
    sp.vel[i * 3 + 1] -= sp.grav[i] * dt;
    sp.pos[i * 3] += sp.vel[i * 3] * dt; sp.pos[i * 3 + 1] = Math.max(.05, sp.pos[i * 3 + 1] + sp.vel[i * 3 + 1] * dt); sp.pos[i * 3 + 2] += sp.vel[i * 3 + 2] * dt;
    sp.alpha[i] = Math.pow(sp.ttl[i] / sp.max[i], .6) * (sp.grav[i] ? 1 : .55 + .45 * Math.random());          // oblúky mierne blikajú
  }
  for (const k of ['position', 'aSize', 'aAlpha', 'aColor']) spGeo.attributes[k].needsUpdate = true;
}
const FIRE_T = 6, SMOKE_T = 10, FIRE_TINT = [1, .55, .12], SMOKE_TINT = [1, 1, 1];
function updateFires(dt) {
  for (let i = fires.length - 1; i >= 0; i--) {
    const f = fires[i]; f.t += dt;
    if (f.t >= SMOKE_T) { fires.splice(i, 1); continue; }
    if (f.t < FIRE_T) {                                   // plamene: malé, jasné, rýchlo stúpajú a zmenšujú sa
      f.fa += dt * 28 * Math.min(1, (FIRE_T - f.t) * 1.2);
      while (f.fa >= 1) {
        f.fa -= 1;
        const core = Math.random() < .3;                     // svetlé žlté jadro vs. oranžovo-červený plameň
        FIRE_TINT[1] = core ? rand(.7, .9) : rand(.16, .42); FIRE_TINT[2] = core ? .25 : .03;
        puff(f.x + rand(-.6, .6) * f.s * (core ? .5 : 1), rand(.2, .7), f.z + rand(-.6, .6) * f.s * (core ? .5 : 1), rand(-.3, .3), rand(2.4, 4.6), rand(-.3, .3), f.s * (core ? rand(.7, 1) : rand(1.3, 1.9)), f.s * .35, rand(.45, .9), 1, 1.2, FIRE_TINT);
      }
    }
    f.sa += dt * 9 * Math.min(1, (SMOKE_T - f.t) * .6);      // dym: tmavý, pomaly sa rozpína a stúpa
    while (f.sa >= 1) {
      f.sa -= 1;
      puff(f.x + rand(-.4, .4) * f.s, f.s * rand(.8, 1.6), f.z + rand(-.4, .4) * f.s, rand(-.4, .4), rand(1.8, 3), rand(-.4, .4), f.s * 1.2, f.s * rand(3, 4.2), rand(2.4, 3.6), .55, rand(.07, .16), SMOKE_TINT);
    }
  }
}
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
const H_SCALE = 1.2;                              // výška lievika (×1,2 oproti pôvodnej)
let R = radiusOf(), H = (14 + R * 4) * H_SCALE;
// Tvar lievika sa plynule mení: 0 = lano · .33 = „komín" (stovepipe) · .66 = kužeľ · 1 = široký klin (wedge).
// Závisí od sily vetra, v čase mierne kolíše a občas sa tornádo „vylanuje" (zúži a skrúti) a opäť naberie silu.
const SHAPES = [   // [m, polomer pri zemi (×R, +c), polomer hore (×R, +c), exponent profilu, výška ×]
  [0, .10, .2, .28, .7, 1.0, 1.15],
  [.33, .20, .3, .55, 1.2, .6, 1.0],
  [.66, .22, .3, 1.6, 2.5, 1.8, 1.0],
  [1, .70, .6, 1.9, 3.0, .9, .85],
];
const SH = { m: .35, rbv: 1, rtv: 3, ex: 1, hf: 1, ropeT: rand(140, 220), ropeLeft: 0 };
function applyShape() {
  let i = 0; while (i < SHAPES.length - 2 && SH.m > SHAPES[i + 1][0]) i++;
  const a = SHAPES[i], b = SHAPES[i + 1], k = clamp((SH.m - a[0]) / (b[0] - a[0]), 0, 1), L = (x, y) => lerp(x, y, k);
  SH.rbv = L(a[1], b[1]) * R + L(a[2], b[2]); SH.rtv = L(a[3], b[3]) * R + L(a[4], b[4]); SH.ex = L(a[5], b[5]); SH.hf = L(a[6], b[6]);
}
function updateShape(dt) {
  if (SH.ropeLeft > 0) { SH.ropeLeft -= dt; if (SH.ropeLeft <= 0) { SH.ropeT = rand(170, 280); news(t('ropeEnd')); } }
  else { SH.ropeT -= dt; if (SH.ropeT <= 0) { SH.ropeLeft = rand(24, 34); news(pick(t('ropeStart'))); } }
  let target = clamp(.2 + S.lv.power * .035, 0, .95) + .14 * Math.sin(time * .03) + .1 * Math.sin(time * .075 + 1.7);
  if (SH.ropeLeft > 0) target *= .1;
  if (boost.t > 0) target = 1;
  SH.m += (clamp(target, 0, 1) - SH.m) * (1 - Math.exp(-dt * (boost.t > 0 ? .7 : .14)));   // tvar sa mení pozvoľna (desiatky sekúnd)
  applyShape();
  H = (14 + R * 4) * SH.hf * H_SCALE;
}
const rb = () => SH.rbv, rtop = () => SH.rtv;
const funnelR = t => SH.rbv + (SH.rtv - SH.rbv) * Math.pow(t, SH.ex) + SH.rtv * .5 * Math.pow(smooth(.78, 1, t), 2);   // na vrchu sa rozlieva do oblaku
let FX = 0, FZ = 0;
let time = 0;
function funnelAt(t) {
  const lag = Math.pow(t, 1.3), A = R * (.18 + .5 * (1 - SH.m) * (1 - SH.m) + (SH.ropeLeft > 0 ? .45 : 0));   // tenšie lievik = väčšie vlnenie
  FX = T.x - T.vx * lag * .9 + (Math.sin(time * .8 + t * 3.2) + .35 * t * Math.sin(time * 1.7 + t * 7)) * A * t;
  FZ = T.z - T.vz * lag * .9 + (Math.cos(time * .7 + t * 2.7) + .35 * t * Math.cos(time * 1.5 + t * 6.5)) * A * t;
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
  return bakeTexture(c, true);
}
const baseStreak = streakTex();
const ROWS = FT - 1, SEGS = 36;
const COS = new Float32Array(SEGS + 1), SIN = new Float32Array(SEGS + 1);
for (let i = 0; i <= SEGS; i++) { COS[i] = Math.cos(i / SEGS * Math.PI * 2); SIN[i] = Math.sin(i / SEGS * Math.PI * 2); }
const tubeTint = new THREE.Color(1, 1, 1), tubeSunV = new THREE.Vector3(0, 1, 0);
const TUBE_LIGHT = new THREE.Color('#b4b8bf'), TUBE_DARK = new THREE.Color('#33291f');
function makeTube(rows, segs, rep, op, edge, bias, dirtOnly) {
  const n = (rows + 1) * (segs + 1), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), nor = new Float32Array(n * 3), dirt = new Float32Array(n), idx = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= segs; i++) {
    const k = j * (segs + 1) + i, t = j / rows, a = i / segs * Math.PI * 2;
    uv[k * 2] = i / segs * rep; uv[k * 2 + 1] = t;
    nor[k * 3] = Math.cos(a); nor[k * 3 + 2] = Math.sin(a);
    dirt[k] = dirtOnly ? 1 : clamp((1 - smooth(0, .85, t)) * 1.0 + bias, 0, 1);   // spodok lievika je špinavý od úlomkov
    if (j < rows && i < segs) { const c = k + segs + 1; idx.push(k, c, k + 1, k + 1, c, c + 1); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aDirt', new THREE.BufferAttribute(dirt, 1));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    uniforms: { uMap: { value: baseStreak }, uOp: { value: op }, uEdge: { value: edge }, uTint: { value: tubeTint }, uSunV: { value: tubeSunV },
      uOff: { value: 0 }, uLight: { value: TUBE_LIGHT }, uDark: { value: TUBE_DARK }, uDirtAmt: { value: 1 } },
    vertexShader: `attribute float aDirt; varying float vD; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv=uv; vD=aDirt; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uMap; uniform float uOp,uEdge,uOff,uDirtAmt; uniform vec3 uTint,uSunV,uLight,uDark; varying float vD; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vec4 t=texture2D(uMap,vec2(vUv.x+uOff,vUv.y));
        vec3 n=normalize(vN); float f=abs(dot(n,normalize(vV))); float edge=pow(f,uEdge);          // mäkký, "objemový" okraj
        float lit=0.62+0.5*(dot(n,uSunV)*0.5+0.5);                                             // tienenie od slnka
        vec3 base=mix(uLight,uDark,clamp(vD*uDirtAmt,0.0,1.0));
        vec3 c=base*(0.55+t.r*0.75)*lit*uTint;
        gl_FragColor=vec4(c,t.a*uOp*edge); gl_FragColor=linearToOutputTexel(gl_FragColor); }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
  scene.add(mesh);
  return { geo, pos, mat, mesh, rows, segs, op };
}
const funnelLayers = [
  { sc: 1.18, op: .6, spd: .5, rep: 3, edge: .6, bias: -.2, shadow: false },
  { sc: 1.0, op: .85, spd: 1.0, rep: 4, edge: .45, bias: .05, shadow: false },
  { sc: .8, op: .9, spd: 1.7, rep: 5, edge: .38, bias: .25, shadow: false },
  { sc: .52, op: .95, spd: 2.5, rep: 6, edge: .3, bias: .55, shadow: false },       // tmavé jadro
].filter((d, i) => !LOW || i !== 2).map((d, li) => {   // na mobile o jednu priehľadnú vrstvu menej
  const L = Object.assign(d, makeTube(ROWS, SEGS, d.rep, d.op, d.edge, d.bias, false));
  L.mesh.renderOrder = 2 + li; L.mesh.castShadow = d.shadow;
  L.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  return L;
});
// podvíry (suction vortices) – tenké tmavé lieviky krúžiace okolo hlavného, viditeľné pri širokom tvare
const SUBR = 10, SUBS = 14;
const subVortices = [0, 1, 2].map(k => {
  const L = Object.assign({ k, off: 0 }, makeTube(SUBR, SUBS, 3, .8, .5, 1, true));
  L.mesh.renderOrder = 5; L.mesh.visible = false; return L;
});
function updateFunnel(dt) {
  const dirtAmt = .55 + .45 * SH.m, opK = .8 + .3 * SH.m;
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
    L.mat.uniforms.uOff.value -= dt * L.spd * .35;
    L.mat.uniforms.uDirtAmt.value = dirtAmt; L.mat.uniforms.uOp.value = L.op * opK;
  }
  const vis = LOW ? 0 : smooth(.5, .82, SH.m);
  for (const V of subVortices) {
    V.mesh.visible = vis > .02; if (!V.mesh.visible) continue;
    V.mat.uniforms.uOp.value = .8 * vis; V.mat.uniforms.uOff.value -= dt * 2.2;
    const p = V.pos;
    for (let j = 0; j <= SUBR; j++) {
      const t = j / SUBR * .42, th = time * (2.4 + .5 * V.k) + V.k * 2.094 - t * 3, rho = funnelR(0) * .95 * (1 - t * 1.5) + .15, rr = R * .075 + .2 + t * R * .08;
      funnelLookup(t); const cx = FX + Math.cos(th) * rho, cz = FZ + Math.sin(th) * rho, y = t * H;
      for (let i = 0; i <= SUBS; i++) { const a = i / SUBS * Math.PI * 2, k = (j * (SUBS + 1) + i) * 3; p[k] = cx + Math.cos(a) * rr; p[k + 1] = y; p[k + 2] = cz + Math.sin(a) * rr; }
    }
    V.geo.attributes.position.needsUpdate = true;
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
  return bakeTexture(c);
}
const cTex = cloudTex();
const clouds = [];
for (let i = 0; i < (LOW ? 12 : 26); i++) {
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
   Dekorácie: pouličné lampy, kry, kamene (3 instancované meshe)
   ================================================================ */
const decor = [], DECOR = {};
function mkDecor(name, geo, mat, max) {
  const m = new THREE.InstancedMesh(geo, mat, max); m.castShadow = name !== 'bush'; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m);
  return DECOR[name] = { name, mesh: m, n: 0, max };
}
function initDecor() {
  const lampG = mergeGeometries([paintGeo(new THREE.CylinderGeometry(.05, .07, 3.4, 5).translate(0, 1.7, 0), '#4a4e54'), paintGeo(new THREE.BoxGeometry(.95, .07, .07).translate(.42, 3.38, 0), '#4a4e54'),
    paintGeo(new THREE.BoxGeometry(.34, .12, .22).translate(.88, 3.3, 0), '#fff2c0')]);
  const bushG = paintGeo(new THREE.IcosahedronGeometry(.55, 0).scale(1.15, .8, 1.15).translate(0, .38, 0), '#ffffff');
  const rockG = paintGeo(new THREE.DodecahedronGeometry(.6, 0).scale(1.25, .7, 1).translate(0, .18, 0), '#ffffff');
  const lamps = mkDecor('lamp', lampG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55, metalness: .3 }), 260);
  const bushes = mkDecor('bush', bushG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), 380);
  const rocks = mkDecor('rock', rockG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, flatShading: true }), 150);
  const BUSH_COL = ['#3f8a45', '#34773c', '#4f9a4c', '#2f6b3a', '#6aa04a'], FLOWER = ['#d94f7a', '#e8c43a', '#f0f0f0', '#b55adf'], ROCK_COL = ['#8b8f94', '#7a7e83', '#9a9a92', '#6f7378'];
  const houses = lots.filter(l => l.kind === 'house');
  const free = (x, z, pad) => !inLake(x, z, 1) && distRiver(x, z) > RIVER_HALF + 1.5 && clearance(x, z, -1) > pad;
  const add = (D, x, z, s, rot, col, val) => {
    if (D.n >= D.max) return; const it = { D, x, z, s, rot, alive: true, timer: 0, idx: D.n++, dirty: true, val };
    D.mesh.setColorAt(it.idx, col); decor.push(it);
  };
  // lampy popri uliciach (na okraji chodníka, rameno smeruje k ceste)
  for (const st of ROADS) for (let sdist = 7 + pr_(0, 6), side = 1; sdist < st.len - 5; sdist += 14 + pr_(-2, 4), side = -side) {
    const i = Math.min(st.pts.length - 1, Math.round(sdist / STEP)), p = st.pts[i], nx = -st.tz[i] * side, nz = st.tx[i] * side, x = p.x + nx * (st.half + .7), z = p.z + nz * (st.half + .7);
    if (distRiver(x, z) < RIVER_HALF + 4 || clearance(x, z, st.id) < .5) continue;
    add(lamps, x, z, 1, Math.atan2(nz, -nx), _c.set('#ffffff'), 1.5);
  }
  // kry pri domoch (niektoré kvitnú)
  for (const l of houses) {
    if (Math.random() > .75) continue;
    const cy = Math.cos(l.yaw), sy = Math.sin(l.yaw);
    for (let k = 0; k < randi(1, 2); k++) {
      const lx = (Math.random() < .5 ? -1 : 1) * rand(2.6, 3.1), lz = rand(-1.4, 1.4), x = l.x + lx * cy + lz * sy, z = l.z - lx * sy + lz * cy;
      if (!free(x, z, .4) || decor.some(d => d.D === bushes && (d.x - x) * (d.x - x) + (d.z - z) * (d.z - z) < 1.2)) continue;
      add(bushes, x, z, rand(.8, 1.4), rand(0, 6), _c.set(Math.random() < .2 ? pick(FLOWER) : pick(BUSH_COL)), .8);
    }
  }
  for (const pk of PARKS) for (let k = 0; k < 18; k++) { const a = rand(0, 6.3), r = pk.r * rand(.35, .95); add(bushes, pk.x + Math.cos(a) * r, pk.z + Math.sin(a) * r, rand(.9, 1.6), rand(0, 6), _c.set(Math.random() < .3 ? pick(FLOWER) : pick(BUSH_COL)), .8); }
  // kamene a trstina pri brehu rieky
  for (let i = 3; i < riverPts.length; i += 4) {
    const t = riverTan[i], side = Math.random() < .5 ? -1 : 1, off = RIVER_HALF + rand(2.2, 4.4), x = riverPts[i].x - t.z * side * off + rand(-1, 1), z = riverPts[i].z + t.x * side * off + rand(-1, 1);
    if (Math.abs(x) > 95 || Math.abs(z) > 95 || clearance(x, z, -1) < 1.5) continue;
    if (Math.random() < .55) add(rocks, x, z, rand(.6, 1.7), rand(0, 6), _c.set(pick(ROCK_COL)), 1.2); else add(bushes, x, z, rand(.7, 1.2), rand(0, 6), _c.set(pick(BUSH_COL)), .8);
  }
  for (let k = 0, tries = 0; k < 40 && tries < 400; tries++) { const x = rand(-WORLD, WORLD), z = rand(-WORLD, WORLD); if (!free(x, z, 2.5) || (Math.abs(x) < HALF && Math.abs(z) < HALF)) continue; add(rocks, x, z, rand(.7, 2), rand(0, 6), _c.set(pick(ROCK_COL)), 1.2); k++; }
  for (const D of Object.values(DECOR)) D.mesh.instanceColor && (D.mesh.instanceColor.needsUpdate = true);
  const z0 = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const D of Object.values(DECOR)) for (let i = D.n; i < D.max; i++) D.mesh.setMatrixAt(i, z0);
}
function updateDecor(dt) {
  const rr = R * 1.05 + .5, rr2 = rr * rr;
  for (const it of decor) {
    if (it.alive) {
      const dx = T.x - it.x, dz = T.z - it.z;
      if (dx * dx + dz * dz < rr2) {                       // tornádo zbalí lampu, kroviny aj kamene
        it.alive = false; it.timer = rand(16, 30); it.dirty = true; earn(it.val * valueMult());
        const col = it.D.name === 'rock' ? '#7a7e83' : it.D.name === 'bush' ? '#3f8a45' : '#4a4e54';
        for (let k = 0; k < 3; k++) spawnDebris(it.x + rand(-.3, .3), rand(.2, 1.2), it.z + rand(-.3, .3), rand(-2, 2), rand(1, 4), rand(-2, 2), it.D.name === 'lamp' ? .12 : .2, col);
        puff(it.x, .5, it.z, rand(-1, 1), rand(.5, 1.5), rand(-1, 1), .8, 2.4, rand(.8, 1.4), .35, .6);
      }
    } else { it.timer -= dt; if (it.timer <= 0) { it.alive = true; it.dirty = true; } }
    if (it.dirty) {
      dummy.position.set(it.x, heightAt(it.x, it.z), it.z); dummy.rotation.set(0, it.rot, 0);
      const k = it.alive ? it.s : 0; dummy.scale.set(k, k, k); dummy.updateMatrix(); it.D.mesh.setMatrixAt(it.idx, dummy.matrix); it.D.mesh.instanceMatrix.needsUpdate = true; it.dirty = false;
    }
  }
}

/* ================================================================
   Autá na cestách (1 instancovaný mesh) + mäkký tieň pod tornádom
   ================================================================ */
const CAR_COLORS = ['#d9d9d9', '#c0392b', '#2c5fa8', '#e0b030', '#3a3a40', '#f0f0f0', '#3d8b5a', '#8e4ea0'];
const cars = [];
let carMesh;
const streetPos = { x: 0, y: 0, z: 0, tx: 1, tz: 0 };
function streetAt(st, s, lane) {                     // poloha a smer na ulici vo vzdialenosti s (od začiatku), s bočným posunom
  const f = clamp(s / STEP, 0, st.pts.length - 1.001), i = f | 0, k = f - i, a = st.pts[i], b = st.pts[i + 1];
  const tx = lerp(st.tx[i], st.tx[i + 1], k), tz = lerp(st.tz[i], st.tz[i + 1], k), d = Math.hypot(tx, tz) || 1;
  streetPos.tx = tx / d; streetPos.tz = tz / d;
  streetPos.x = lerp(a.x, b.x, k) - streetPos.tz * lane; streetPos.z = lerp(a.z, b.z, k) + streetPos.tx * lane;
  streetPos.y = lerp(st.y[i], st.y[i + 1], k);
}
function initCars() {
  const geo = mergeGeometries([
    paintGeo(new THREE.BoxGeometry(1.7, .2, .76).translate(0, .22, 0), '#15151a'),
    paintGeo(new THREE.BoxGeometry(1.7, .42, .8).translate(0, .5, 0), '#ffffff'),
    paintGeo(new THREE.BoxGeometry(.9, .36, .7).translate(-.1, .9, 0), '#202a36'),
  ]);
  const n = LOW ? 24 : 40, routes = ROADS.filter(r => r.len >= 36).sort((a, b) => b.len - a.len);
  carMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .45, metalness: .35 }), n);
  carMesh.castShadow = true; carMesh.frustumCulled = false; carMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(carMesh);
  for (let i = 0; i < n; i++) {
    const st = routes[i % routes.length], dir = (Math.floor(i / routes.length) + i) % 2 ? 1 : -1;
    cars.push({ i, st, dir, s: rand(0, st.len), speed: 3.8 + ((st.id * 3 + (dir > 0 ? 1 : 0)) % 5) * .8, alive: true, timer: 0 });   // rovnaká rýchlosť v pruhu – nepredbiehajú sa
    carMesh.setColorAt(i, _c.set(pick(CAR_COLORS)));
  }
}
function updateCars(dt) {
  for (const c of cars) {
    const st = c.st;
    if (!c.alive) {
      c.timer -= dt;
      if (c.timer <= 0) { c.alive = true; c.s = c.dir > 0 ? 0 : st.len; carMesh.setColorAt(c.i, _c.set(pick(CAR_COLORS))); carMesh.instanceColor.needsUpdate = true; }
      else { dummy.scale.set(0, 0, 0); dummy.updateMatrix(); carMesh.setMatrixAt(c.i, dummy.matrix); continue; }
    }
    c.s += c.dir * c.speed * dt;
    if (c.s > st.len) c.s = 0; else if (c.s < 0) c.s = st.len;
    streetAt(st, c.s, c.dir * .9);
    const x = streetPos.x, z = streetPos.z;
    for (const br of st.bridges) if (c.s > br.s0 && c.s < br.s1 && !br.lotRef.b) { c.alive = false; c.timer = 8; break; }   // most je zničený – auto sa tam nedostane
    if (!c.alive) continue;
    const dx = T.x - x, dz = T.z - z;
    if (dx * dx + dz * dz < Math.pow(R * 1.05 + 1.3, 2)) {   // auto zasiahnuté tornádom
      c.alive = false; c.timer = rand(10, 18); S.cars++;
      const col = carMesh.instanceColor ? '#' + _c.fromArray(carMesh.instanceColor.array, c.i * 3).getHexString() : '#cccccc';
      for (let k = 0; k < 6; k++) spawnDebris(x + rand(-.6, .6), streetPos.y + rand(.3, 1), z + rand(-.4, .4), rand(-3, 3), rand(2, 6), rand(-3, 3), .3, k < 4 ? col : '#202a36');
      for (let k = 0; k < 4; k++) puff(x, .4, z, rand(-2, 2), rand(.5, 2), rand(-2, 2), 1, 3, rand(1, 1.8), .4, .6);
      const e = 3 * valueMult(); earn(e); crashSound(0);
      continue;
    }
    dummy.position.set(x, streetPos.y, z);
    dummy.rotation.set(0, -Math.atan2(c.dir * streetPos.tz, c.dir * streetPos.tx), 0);
    dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    carMesh.setMatrixAt(c.i, dummy.matrix);
  }
  carMesh.instanceMatrix.needsUpdate = true;
}
const f3 = v => v.toFixed(3);
const riverMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, defines: LOW ? {} : { HQ: 1 },
  uniforms: { uTime: { value: 0 }, uTint: { value: tubeTint }, uTop: skyUniforms.uTop, uHor: skyUniforms.uHor, uSunDir: skyUniforms.uSunDir, uSunCol: skyUniforms.uSunCol,
    uDeep: { value: new THREE.Color('#082c47') }, uShallow: { value: new THREE.Color('#3a8a9c') }, uFogC: { value: scene.fog.color }, uFogN: { value: 60 }, uFogF: { value: 400 } },
  vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
  fragmentShader: `uniform float uTime,uFogN,uFogF; uniform vec3 uTint,uTop,uHor,uSunDir,uSunCol,uDeep,uShallow,uFogC; varying vec2 vUv; varying vec3 vW;
    float bedH(float d){ return ${f3(BED)}*(1.0-smoothstep(${f3(BANK1)},${f3(BANK0)},d)); }
    float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y); }
    float wh(vec2 q){ return vn(q)*.65+vn(q*2.1+3.7)*.35; }      // výška vody: šum bez periodicity
    vec3 skyAt(vec3 r){                                                           // odraz oblohy vrátane mrakov
      vec3 c=mix(uHor,uTop,pow(clamp(r.y,0.0,1.0),.55));
      #ifdef HQ
      vec2 q=r.xz/(r.y+.2)*1.5+vec2(uTime*.012,uTime*.006);
      float n=vn(q)*.6+vn(q*2.3)*.4;
      float m=smoothstep(.38,.72,n)*smoothstep(.02,.3,r.y);
      c=mix(c,mix(uHor*.95,uTop*.55,smoothstep(.45,.85,n)),m*.8);
      #endif
      return c;
    }
    void main(){
      float d=abs(vUv.x-.5)*2.0*${f3(RIVER_HALF + 2.4)};
      float fade=(1.0-smoothstep(86.0,100.0,abs(vW.x)))*(1.0-smoothstep(86.0,100.0,abs(vW.z)));
      float depth=${f3(WATER_Y)}-bedH(d)*fade;                                   // hĺbka vody nad dnom
      if(depth<=0.0) discard;
      vec2 p=vW.xz; float t=uTime;
      vec2 q=vec2((vUv.x-.5)*${f3(2 * (RIVER_HALF + 2.4))}*.3, vUv.y*5.0*.3);                      // súradnice pozdĺž toku: vlny sa ťahajú po prúde
      vec2 qa=q+vec2(0.0,-t*.14), qb=q*vec2(1.7,1.3)+vec2(4.3,-t*.23), qc=q*vec2(3.1,2.2)+vec2(9.1,-t*.35);
      float amp=.55+.9*vn(p*.07+vec2(t*.01,0.0));                                 // pomalé veľkoplošné zmeny sily vlnenia
      vec2 g=vec2(0.0); float e=.14;
      g.x=wh(qa+vec2(e,0.))-wh(qa-vec2(e,0.))+(wh(qb+vec2(e,0.))-wh(qb-vec2(e,0.)))*.6;
      g.y=wh(qa+vec2(0.,e))-wh(qa-vec2(0.,e))+(wh(qb+vec2(0.,e))-wh(qb-vec2(0.,e)))*.6;
      #ifdef HQ
      g.x+=(wh(qc+vec2(e,0.))-wh(qc-vec2(e,0.)))*.3; g.y+=(wh(qc+vec2(0.,e))-wh(qc-vec2(0.,e)))*.3;
      #endif
      g*=amp*1.25;
      vec3 n=normalize(vec3(-g.x,1.0,-g.y));
      vec3 v=normalize(cameraPosition-vW);
      float F=clamp(.07+.93*pow(1.0-max(dot(n,v),0.0),3.0),0.0,1.0);         // Fresnel: pri plytkom uhle zrkadlí
      vec3 r=reflect(-v,n); r.y=abs(r.y)+.02;
      vec3 sky=skyAt(normalize(r));
      float sd=max(dot(normalize(r),normalize(uSunDir)),0.0);
      vec3 spec=uSunCol*(pow(sd,120.0)*5.0+pow(sd,14.0)*.35);                 // odlesky slnka
      vec3 col=mix(uDeep,uShallow,exp(-depth*1.6));
      col=mix(col,sky,clamp(F*.95+.16,0.0,1.0))+spec;
      float foam=1.0-smoothstep(.0,.2,depth+sin(p.x*5.0+t*2.0)*.04+sin(p.y*4.0-t*1.7)*.04);
      col=mix(col,vec3(.93,.96,.98),foam*.8);
      float a=clamp(depth*2.8,0.0,1.0)*.95+F*.05;
      col*=uTint;
      float ff=smoothstep(uFogN,uFogF,length(cameraPosition-vW));
      gl_FragColor=vec4(mix(col,uFogC,ff),a); gl_FragColor=linearToOutputTexel(gl_FragColor); }`,
});
{
  const n = riverPts.length, pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = [];
  for (let i = 0; i < n; i++) {
    const p = riverPts[i], t = riverTan[i], w = RIVER_HALF + 2.4;
    pos.set([p.x - t.z * w, WATER_Y, p.z + t.x * w, p.x + t.z * w, WATER_Y, p.z - t.x * w], i * 6);
    uv.set([0, i * STEP / 5, 1, i * STEP / 5], i * 4);
    if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
  const river = new THREE.Mesh(geo, riverMat); river.renderOrder = 1; river.frustumCulled = false; river.matrixAutoUpdate = false;
  scene.add(river);
}
// Stopa skazy: tmavé škvrny na zemi tam, kadiaľ tornádo prešlo (jeden mesh, pomaly blednú)
const TR_N = 160, TR_LIFE = 55, trAge = new Float32Array(TR_N).fill(1e9), trPos = new Float32Array(TR_N * 12), trUv = new Float32Array(TR_N * 8), trA = new Float32Array(TR_N * 4);
let trI = 0, trLX = 1e9, trLZ = 1e9;
const trGeo = new THREE.BufferGeometry();
{
  const idx = [];
  for (let i = 0; i < TR_N; i++) { trUv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8); idx.push(i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2); }
  trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3).setUsage(THREE.DynamicDrawUsage));
  trGeo.setAttribute('uv', new THREE.BufferAttribute(trUv, 2));
  trGeo.setAttribute('aA', new THREE.BufferAttribute(trA, 1).setUsage(THREE.DynamicDrawUsage));
  trGeo.setIndex(idx);
  const m = new THREE.Mesh(trGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    vertexShader: 'attribute float aA; varying float vA; varying vec2 vUv; void main(){ vA=aA; vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying float vA; varying vec2 vUv; void main(){ float r=length(vUv-.5)*2.0; float a=(1.0-smoothstep(.3,1.0,r))*vA; if(a<.004) discard; gl_FragColor=vec4(.05,.035,.02,a); }',
  }));
  m.frustumCulled = false; m.renderOrder = .5; m.matrixAutoUpdate = false; scene.add(m);
}
function updateTrail(dt) {
  const dx = T.x - trLX, dz = T.z - trLZ, need = Math.max(1.2, R * .7);
  if (dx * dx + dz * dz > need * need) {
    trLX = T.x; trLZ = T.z;
    if (Math.abs(heightAt(T.x, T.z)) < .05) {        // len na rovnom teréne (nie v koryte)
      const i = trI, s = R * 1.3 * rand(.85, 1.25), x = T.x + rand(-.3, .3) * R, z = T.z + rand(-.3, .3) * R, y = .04 + i * .0003;
      trI = (trI + 1) % TR_N; trAge[i] = 0;
      trPos.set([x - s, y, z - s, x + s, y, z - s, x + s, y, z + s, x - s, y, z + s], i * 12);
      trGeo.attributes.position.needsUpdate = true;
    }
  }
  for (let i = 0; i < TR_N; i++) {
    if (trAge[i] > TR_LIFE) continue;
    trAge[i] += dt;
    const a = trAge[i] > TR_LIFE ? 0 : .5 * (1 - trAge[i] / TR_LIFE) * Math.min(1, trAge[i] * 1.5);
    trA[i * 4] = trA[i * 4 + 1] = trA[i * 4 + 2] = trA[i * 4 + 3] = a;
  }
  trGeo.attributes.aA.needsUpdate = true;
}
const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
  map: (() => { const n = 64, d = new Uint8Array(n * n * 4); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const r = Math.min(1, Math.hypot(x - 31.5, y - 31.5) / 32), a = 1 - r, k = (y * n + x) * 4; d[k + 3] = a * a * (3 - 2 * a) * 255; }
    const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t; })(),
  color: 0x0a1208, transparent: true, opacity: .5, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2,
}));
blob.position.y = .08; blob.renderOrder = 1; scene.add(blob);
blob.material.opacity = .36;
const castBlob = new THREE.Mesh(blob.geometry, blob.material.clone()); castBlob.material.opacity = .24; castBlob.renderOrder = 1; scene.add(castBlob);   // vrhnutý tieň lievika

/* ================================================================
   Zvuk
   ================================================================ */
const AU = { ctx: null };
function audioInit() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended' && !document.hidden) AU.ctx.resume(); return; }
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
    const rs = c.createBufferSource(), rf = c.createBiquadFilter(), rgn = c.createGain();          // šum dažďa
    rs.buffer = buf; rs.loop = true; rs.playbackRate.value = 1.7; rf.type = 'highpass'; rf.frequency.value = 2600; rgn.gain.value = .05;
    rs.connect(rf); rf.connect(rgn); rgn.connect(AU.master); rs.start(0, 1.3);
    AU.screamBus = c.createGain(); AU.screamBus.gain.value = 0; AU.screamBus.connect(AU.master);
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
function tone(freq, dur, vol, delay, type) {
  if (!AU.ctx || S.muted || AU.ctx.state !== 'running') return;
  const c = AU.ctx, t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
  o.type = type || 'triangle'; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .012); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g); g.connect(AU.master); o.start(t); o.stop(t + dur + .03);
}
function buySound() { tone(660, .1, .09); tone(990, .14, .08, .07); }
function questSound() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .22, .1, i * .09)); }
let lastSpark = 0;
function sparkSound() { const n = performance.now(); if (n - lastSpark < 110) return; lastSpark = n; burst(5200, .05, .07, 3); }
function thunderSound() { burst(260, .9, 2.4, .7); }
// keď hru nevidno (minimalizovaná, iná karta, iná aplikácia), zvuk sa úplne pozastaví
function audioFocus(on) { if (!AU.ctx) return; if (on) AU.ctx.resume(); else AU.ctx.suspend(); }
document.addEventListener('visibilitychange', () => audioFocus(!document.hidden));
window.addEventListener('pagehide', () => audioFocus(false));
window.addEventListener('pageshow', () => audioFocus(!document.hidden));
function setMuted(m) { S.muted = m; $('btn-mute').textContent = m ? '🔇' : '🔊'; if (AU.master) AU.master.gain.value = m ? 0 : .6; }
// Výkriky obyvateľov: veľmi tichá vrstva, počuť ju len pri maximálnom priblížení kamery k tornádu
function scream() {
  const c = AU.ctx, t = c.currentTime, f0 = rand(850, 1500), dur = rand(.45, 1.1), peak = f0 * rand(1.15, 1.45), pan = c.createStereoPanner ? c.createStereoPanner() : null;
  const o = c.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(peak, t + dur * .35); o.frequency.exponentialRampToValueAtTime(f0 * .8, t + dur);
  const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = rand(5.5, 8); lg.gain.value = f0 * .03; lfo.connect(lg); lg.connect(o.frequency);   // vibrato
  const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + .06); g.gain.setValueAtTime(1, t + dur * .5); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  const outNode = pan || g; if (pan) { pan.pan.value = rand(-.8, .8); }
  for (const [fq, q, vol] of [[1100, 6, 1], [2900, 8, .55]]) {     // formanty „áá“
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fq * rand(.92, 1.1); bp.Q.value = q;
    const bg = c.createGain(); bg.gain.value = vol; o.connect(bp); bp.connect(bg); bg.connect(g);
  }
  if (pan) g.connect(pan);
  outNode.connect(AU.screamBus);
  o.start(t); lfo.start(t); o.stop(t + dur + .05); lfo.stop(t + dur + .05);
}
let screamT = 1;
function updateScreams(dt) {
  const k = smooth(.66, .46, cam.zoom);                  // 0 = ďaleko, 1 = úplne najbližší zoom
  AU.screamBus.gain.setTargetAtTime(S.muted ? 0 : .05 * k, AU.ctx.currentTime, .4);
  if (k < .08 || S.muted) { screamT = 1; return; }
  screamT -= dt * (.4 + k);
  if (screamT > 0) return;
  let crowd = 0; for (const b of buildings) if (b.alive && Math.abs(b.x - T.x) < R * 3 + 16 && Math.abs(b.z - T.z) < R * 3 + 16) crowd++;   // je tam kto kričať?
  screamT = rand(.7, 2.2);
  if (crowd > 0 && Math.random() < Math.min(1, .35 + crowd * .1)) { scream(); if (Math.random() < .35) setTimeout(() => AU.ctx && AU.ctx.state === 'running' && scream(), rand(80, 350)); }
}
function updateAudio(dt) {
  if (!AU.ctx) return;
  if (AU.ctx.state === 'running') updateScreams(dt);
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
function earn(x) { S.money += x; S.total += x; S.life += x; income += x; }

function emitChunks(b, n, burstMode) {
  const def = b.def, sz = (def.csz || def.w * .13) * (burstMode ? 1.15 : 1), bridge = b.lot.kind === 'bridge';
  for (let k = 0; k < n; k++) {
    if (bridge) {                                   // úlomky mosta pozdĺž jeho dĺžky
      const u = rand(-.5, .5) * b.lot.len, v = rand(-.5, .5) * b.lot.wid, cy = Math.cos(b.lot.yaw), sy = Math.sin(b.lot.yaw), out = burstMode ? rand(2, 6) : rand(.5, 2), a = rand(0, 6.3);
      spawnDebris(b.x + cy * u + sy * v, rand(.1, .9), b.z - sy * u + cy * v, Math.cos(a) * out, rand(1, burstMode ? 7 : 3), Math.sin(a) * out, sz * rand(.6, 1.6), Math.random() < .3 ? '#5c5f66' : b.wallHex);
      continue;
    }
    const a = rand(0, 6.3), r = rand(0, b.r), y = rand(.1, 1) * b.h * b.group.scale.y;
    const col = b.glass && Math.random() < .35 ? '#9fd0f0' : Math.random() < .25 ? b.roofHex : Math.random() < .2 ? '#8d8a85' : b.wallHex;
    const out = burstMode ? rand(2, 7) : rand(.5, 2);
    spawnDebris(b.x + Math.cos(a) * r, y, b.z + Math.sin(a) * r, Math.cos(a) * out, rand(1, burstMode ? 8 : 4), Math.sin(a) * out, sz * rand(.6, 1.4), col);
  }
}
// Hustý oblak prachu naprieč celým objemom budovy + rázová vlna pri zemi: zakryje okamih, keď model zmizne
function dustBurst(b) {
  const bridge = b.lot.kind === 'bridge', w = bridge ? b.lot.len : b.def.w, dd = bridge ? b.lot.wid : b.def.d;
  const hh = Math.min(b.h * (b.group.scale.y || 1), 16), yaw = b.lot.yaw || 0, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const sc = clamp(Math.min(w, dd) * .45, 1.1, 3), n = Math.min(64, 22 + b.tier * 8 + (bridge ? 12 : 0));
  for (let i = 0; i < n; i++) {
    const u = rand(-.5, .5) * w, v = rand(-.5, .5) * dd, y = Math.pow(Math.random(), .8) * hh + .2, a = rand(0, 6.3), sp = rand(1, 4.5);
    puff(b.x + cy * u + sy * v, y, b.z - sy * u + cy * v, Math.cos(a) * sp, rand(.4, 3.2), Math.sin(a) * sp, sc * rand(1.3, 2.1), sc * rand(3, 4.6), rand(1.9, 3.6), .62, rand(.5, .78));
  }
  for (let i = 0; i < 16; i++) {                                      // nízka rázová vlna
    const a = i / 16 * 6.283 + rand(-.2, .2), sp = rand(4.5, 8);
    puff(b.x + Math.cos(a) * w * .25, .35, b.z + Math.sin(a) * dd * .25, Math.cos(a) * sp, rand(.1, .8), Math.sin(a) * sp, sc * 1.6, sc * rand(4, 5.5), rand(1.5, 2.6), .5, rand(.55, .75));
  }
  for (let i = 0; i < 6; i++) puff(b.x + rand(-.4, .4) * w, rand(.5, 1.5), b.z + rand(-.4, .4) * dd, rand(-.5, .5), rand(2.5, 4), rand(-.5, .5), sc * 1.4, sc * 3, rand(2.8, 4.2), .42, rand(.3, .5));   // dlhšie stúpajúci dym
}
function destroyBuilding(b) {
  b.alive = false; b.hp = 0;
  const left = Math.max(0, b.chunks - b.emitted);
  emitChunks(b, left, true);
  // roof chunk
  if (b.tier <= 1) for (let i = 0; i < 4; i++) spawnDebris(b.x + rand(-1, 1), b.h, b.z + rand(-1, 1), rand(-3, 3), rand(3, 8), rand(-3, 3), b.def.w * .35, b.roofHex);
  dustBurst(b);
  floatText(b.x, b.h, b.z, '+' + fmt(b.earned), b.tier);
  cam.shake = Math.min(1.2, cam.shake + .08 + b.tier * .1);
  crashSound(b.tier);
  S.destroyed++; if (b.lot.kind === 'bridge') S.bridges++;
  if (b.lot.kind !== 'bridge' && sparks.length < 5 && Math.random() < .17) {            // občas po budove preskakujú iskry
    sparks.push({ x: b.x, y: .4, z: b.z, t: 0, life: rand(1.2, 2.2), next: rand(.05, .3) });
    if (Math.random() < .3) news(pick(t('sparkNews')));
  }
  if (b.lot.kind === 'bridge') { /* most nehorí */ }
  else if (fires.length < 8 && Math.random() < .22) {     // občas po budove ostane požiar
    fires.push({ x: b.x, z: b.z, t: 0, s: clamp(b.def.w * .45, .9, 2.2), fa: 0, sa: 0 });
    if (Math.random() < .3) news(pick(t('fire')));
  }
  b.group.visible = false; cityGroup.remove(b.group);
  const lot = b.lot; lot.b = null; lot.timer = rand(16, 30);
  const rb = new THREE.Mesh(rubbleGeo, rubbleMat); rb.position.set(lot.x, lot.kind === 'bridge' ? -1.2 : 0, lot.z); rb.scale.set(b.def.w * 1.05, .03, b.def.d * 1.05); rb.rotation.y = lot.yaw !== undefined ? lot.yaw : rand(0, 3); rb.castShadow = true; rb.receiveShadow = true;
  cityGroup.add(rb); lot.rubble = rb;
  const i = buildings.indexOf(b); if (i >= 0) buildings.splice(i, 1);
  if (S.destroyed % 50 === 0) news(t('milestone', S.destroyed));
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
function strike(target, quiet) {
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
    for (const [m, s] of [[mCore, w], [mGlow, w * 2.6]]) {
      const c = new THREE.Mesh(boltGeo, m); c.position.copy(a); c.quaternion.copy(q); c.scale.set(s, L, s); c.renderOrder = 10; grp.add(c);
    }
  }
  scene.add(grp); bolts.push({ grp, ttl: .26, mats: [mCore, mGlow] });
  if (quiet) flash = Math.max(flash, .35); else { flash = 1; thunderSound(); }   // tiché údery (Supercela) nezahlcujú obraz ani zvuk
  for (let i = 0; i < 8; i++) puff(top.x, .4, top.z, rand(-3, 3), rand(.5, 3), rand(-3, 3), 1, 3, .8, .6, 1, [1, 1, 1]);
}

/* ================================================================
   Počasie, deň / noc
   ================================================================ */
const SUN_PERIOD = 240;           // s na jeden okruh slnka
let sunPhase = .15;
const C_TOP = new THREE.Color(SKY_COL.top), C_HOR = new THREE.Color(SKY_COL.hor);
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
  sky.position.copy(camera.position); skyUniforms.uTime.value = time; riverMat.uniforms.uTime.value = time;
  if (flash === lastFlash) return;           // zvyšok sa mení iba pri blesku
  lastFlash = flash;
  sun.intensity = 2.5 + flash * 1.2;
  hemi.intensity = HEMI_I + flash * 1.5;
  skyUniforms.uTop.value.copy(C_TOP).lerp(C_FLASH_TOP, flash * .5);
  skyUniforms.uHor.value.copy(C_HOR).lerp(C_FLASH_HOR, flash * .5);
  scene.fog.color.copy(skyUniforms.uHor.value);
  tint.setScalar(1 + flash * .5); tubeTint.copy(tint);
  pUniforms.uTint.value.copy(tint).multiplyScalar(1.15);
  for (const c of clouds) c.sp.material.color.setRGB(.27, .3, .35).multiply(tint);
}
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
  const sp = speedOf() * (boost.t > 0 ? 1.5 : 1) * (manual ? 1 : smooth(0, R * 1.6 + 1.5, d) * .85 + .15);
  const px = -dz / d, pz = dx / d, wob = Math.sin(time * .9) * .25 * Math.min(1, d / 10);
  const wantX = (dx / d + px * wob) * sp, wantZ = (dz / d + pz * wob) * sp;
  const k = 1 - Math.exp(-dt * 1.6);
  T.vx += (wantX - T.vx) * k; T.vz += (wantZ - T.vz) * k;
  const lim = WORLD + 2 - R * .6;                    // veľké tornádo ostáva celé na mape
  T.x = clamp(T.x + T.vx * dt, -lim, lim); T.z = clamp(T.z + T.vz * dt, -lim, lim);
}
function commandTo(x, z) {
  manual = { x: clamp(x, -WORLD, WORLD), z: clamp(z, -WORLD, WORLD) }; manualHold = 0;
  marker.position.set(manual.x, .2, manual.z); marker.visible = true;
}

/* ================================================================
   Hlavný update
   ================================================================ */
const BOOST_DUR = 10, BOOST_CD = 75, boost = { t: 0, cd: 0, bolt: 0 };
function useBoost() {
  if (boost.cd > 0) return;
  audioInit(); boost.t = BOOST_DUR; boost.cd = BOOST_CD; boost.bolt = .2; S.boosts++;
  thunderSound(); flash = 1; cam.shake = Math.max(cam.shake, .8);
  news(t('boostNews'), true);
}
let lightningTimer = 3, tierSeen = unlockedTier(), megaSeen = megaScale(), flashEl = $('flash');
const rateHist = [];
let groundAcc = 0;
const DIRT_COLS = ['#5a4632', '#6d5a40', '#3f5a2e', '#7a6a52', '#4a4a48', '#8a7b5f', '#3a2f25'], DIRT_TINT = [1, .82, .6];
function update(dt) {
  time += dt;
  R = lerp(R, radiusOf(), 1 - Math.exp(-dt * 3)); updateShape(dt);
  steer(dt);
  updateFunnelTable();
  blob.position.set(T.x, .08, T.z); blob.scale.setScalar(R * 3.4 + 5);
  {
    const hz = Math.hypot(sunDir.x, sunDir.z) || 1, len = Math.min(H * .7 * hz / Math.max(.25, sunDir.y), 40 + R * 4), wid = R * 3 + SH.rtv * .8 + 3, ux = -sunDir.x / hz, uz = -sunDir.z / hz;
    castBlob.position.set(T.x + ux * len * .45, .07, T.z + uz * len * .45);
    castBlob.rotation.y = -Math.atan2(uz, ux); castBlob.scale.set(len + wid, 1, wid);
  }
  if (boost.cd > 0) boost.cd -= dt;
  if (boost.t > 0) boost.t -= dt;
  const boosted = boost.t > 0, dps = dpsOf(S.lv.power) * (boosted ? 3 : 1);
  updateTrail(dt);

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
      const lk = Math.min(1, dt * 1.2); b.lx += (dx / (d || 1) - b.lx) * lk; b.lz += (dz / (d || 1) - b.lz) * lk;   // smer náklonu sa mení plynulo, nie skokom
      b.group.matrixAutoUpdate = true; b.settled = false;
    } else if (b.settled) continue;            // budova v pokoji – nič nepočítame
    b.shake = Math.max(0, b.shake - dt * 2);
    const hp = b.hp / b.max, bs = b.group.userData.base, g = b.group;
    const tall = clamp(b.h / 20, 0, 1), ys = lerp(.55 + .3 * tall, 1, smooth(0, 1, hp)), lean = (1 - hp) * Math.min(.28, .8 / b.h);   // vrchol sa vychýli najviac o ~0,8 m bez ohľadu na výšku
    g.scale.set(bs.x, bs.y * ys, bs.z);
    g.rotation.x = lean * b.lz; g.rotation.z = -lean * b.lx;
    g.position.x = b.x + Math.sin(time * 26 + b.x) * .03 * b.shake;
    g.position.z = b.z + Math.cos(time * 22 + b.z) * .03 * b.shake;
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
    if (lot.rubble) { if (lot.timer < 3) lot.rubble.scale.y = Math.max(.05, lot.timer / 3); else if (lot.rubble.scale.y < 1) lot.rubble.scale.y = Math.min(1, lot.rubble.scale.y + dt * 1.6); }   // ruina sa vynorí spod prachu
    if (lot.timer <= 0) {
      makeBuilding(lot, false);
    }
  }
  if (boosted) {                                   // počas Supercely udierajú blesky bez ohľadu na úroveň búrky
    boost.bolt -= dt;
    if (boost.bolt <= 0) {
      boost.bolt = .7;
      const near = buildings.filter(b => b.alive && b.grow >= 1 && Math.hypot(b.x - T.x, b.z - T.z) < 30 + R * 2);
      if (near.length) { const b = pick(near); strike({ x: b.x, z: b.z, h: b.h * b.group.scale.y }, true); hurt(b, dps); }
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
      if (Math.random() < .25) news(pick(t('storm')));
    }
  }
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i]; b.ttl -= dt;
    b.mats[0].opacity = clamp(b.ttl / .26, 0, 1); b.mats[1].opacity = .35 * clamp(b.ttl / .26, 0, 1);
    if (b.ttl <= 0) { scene.remove(b.grp); b.mats.forEach(m => m.dispose()); bolts.splice(i, 1); }
  }
  flash = Math.max(0, flash - dt * 3.2);
  flashEl.style.opacity = String(flash * .35);

  updateCars(dt);
  updateDecor(dt);
  for (const b of buildings) if (b.blades && b.alive) b.blades.rotation.z += dt * (.5 + S.lv.power * .02);   // mlyn sa točí
  updateDebris(dt);
  updateFires(dt);
  updateSparks(dt);
  updatePuffs(dt);
  updateSwirl(dt);
  updateFunnel(dt);
  updateClouds(dt);
  updateWeather(dt);

  // prach a špina pri zemi
  if (Math.random() < dt * 45 * (1 + R * .05)) {
    const a = rand(0, 6.3), r = rand(R * .4, R * 1.2), tv = 2 + R * .3;
    puff(T.x + Math.cos(a) * r, .3, T.z + Math.sin(a) * r, -Math.sin(a) * tv - T.vx * .2, rand(.5, 2), Math.cos(a) * tv - T.vz * .2, R * .5 + .8, R * 1.5 + 2.8, rand(1.2, 2.6), .38, rand(.35, .6), DIRT_TINT);
  }
  groundAcc += dt * Math.min(LOW ? 26 : 55, 14 + R * 3);   // úlomky, hlina a lístie zdvihnuté zo zeme
  while (groundAcc >= 1) {
    groundAcc -= 1;
    const a = rand(0, 6.3), r = R * rand(.25, 1.15), tv = 4 + R * .5;
    spawnDebris(T.x + Math.cos(a) * r, rand(.05, .4), T.z + Math.sin(a) * r, -Math.sin(a) * tv * .6, rand(.5, 3), Math.cos(a) * tv * .6, rand(.07, .2) * (1 + R * .03), pick(DIRT_COLS), rand(2.5, 5));
  }
  // marker
  if (marker.visible) { const s = 1.2 + .4 * Math.sin(time * 5); marker.scale.setScalar(s * (1 + R * .15)); }

  // povýšenie zóny
  const ut = unlockedTier(), ms = megaScale();
  if (ut > tierSeen) { tierSeen = ut; news(t('tierNews', t('tiers')[ut]), true); }
  if (ms > megaSeen) { megaSeen = ms; news(t('megaNews'), true); }
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
    const hy = D.sy[i] * .5 + heightAt(x, z);
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
    if (pf.life[i] <= 0) { pf.life[i] = 0; puffs.alpha[i] = 0; puffs.size[i] = 0; continue; }   // koniec života: nikdy nepočítať so zápornou hodnotou (NaN → nepriehľadná guľa)
    const p = clamp(1 - pf.life[i] / pf.max[i], 0, 1), d = 1 - Math.min(1, dt * 1.5);
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
  for (let i = 0; i < SW; i++) {
    const c = sw.cls[i];
    let t = sw.t[i] + dt * (c === 0 ? .07 : c === 1 ? .05 : .025) * sw.spd[i];
    if (t > (c === 0 ? 1 : c === 1 ? .85 : .12)) { t = Math.random() * (c === 2 ? .04 : .06); sw.ang[i] = rand(0, 6.3); }
    sw.t[i] = t;
    const f = (1 + (1 - t) * 1.8) * sw.spd[i] * (1.4 + 1.5 / (1 + R * .25)) * (c === 1 ? 1.35 : 1);
    sw.ang[i] += dt * f * (1.5 + (1 - t) * 2.5);
    const a = sw.ang[i], k = i * 3, sh = sw.shade[i];
    let r, y, size, alpha, cr, cg, cb;
    if (c === 2) {                                   // prachová sukňa: široký tmavohnedý prstenec pri zemi
      r = R * sw.rf[i] * (.9 + t * 3.5); y = t * H * .5 + .2;
      size = (1.4 + R * .4) * sw.sz[i]; alpha = .4 * (1 - t / .12);
      cr = .5 + sh * .2; cg = .4 + sh * .16; cb = .28 + sh * .12;
    } else {
      r = funnelLookup(t) * sw.rf[i];
      if (t < .16) r += R * 1.05 * Math.pow(1 - t / .16, 2) * sw.rf[i];
      y = t * H + Math.sin(a * 2 + i) * .5;
      if (c === 1) {                                 // úlomky: malé, tmavé, ostré siluety
        size = (.12 + R * .014) * sw.sz[i]; alpha = .9 * (1 - t * t);
        cr = .06 + sh * .12; cg = .05 + sh * .09; cb = .04 + sh * .07;
      } else {                                       // mrak prachu: dole tmavý a hnedý, hore svetlejší
        const lt = smooth(0, .55, t);
        size = (1.7 + R * .34 + t * R * .42) * (.8 + .4 * sw.sz[i]) * (1 + (t < .16 ? .6 : 0));
        alpha = (t < .05 ? t / .05 : 1) * (1 - Math.pow(t, 3)) * .17;
        const v = .92 + .16 * sh; cr = lerp(.27, .47, lt) * v; cg = lerp(.22, .47, lt) * v; cb = lerp(.16, .49, lt) * v;
      }
    }
    funnelLookup(c === 2 ? 0 : t);
    swirl.pos[k] = FX + Math.cos(a) * r; swirl.pos[k + 1] = y; swirl.pos[k + 2] = FZ + Math.sin(a) * r;
    swirl.size[i] = size; swirl.alpha[i] = alpha; swirl.col[k] = cr; swirl.col[k + 1] = cg; swirl.col[k + 2] = cb;
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
    c.sp.material.opacity = .85 * clamp((dc - s * .45) / (s * .6), 0, 1) * clamp((y - camera.position.y + 2) / 8, 0, 1);   // mrak pod úrovňou kamery by zahmlil celý výhľad
    c.sp.visible = c.sp.material.opacity > .01;
  }
}

/* ================================================================
   Kamera a vstup
   ================================================================ */
function updateCamera(dt) {
  if (performance.now() - lastInput > 12000 && !ptrs.size) cam.yaw += dt * .035;   // pri nečinnosti kamera pomaly obieha (idle pohľad)
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
  camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  tubeSunV.copy(sunDir).transformDirection(camera.matrixWorldInverse);
  // tiene
  const ext = clamp(cam.dist * .8 + 14, 34, 150);
  if (Math.abs(ext - shadowExt) / ext > .06) {
    shadowExt = ext;
    const sc = sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = ext * 6 + 140; sc.updateProjectionMatrix();
  }
  scene.fog.near = cam.dist * 1.2; scene.fog.far = cam.dist * 6 + 160;
  riverMat.uniforms.uFogN.value = scene.fog.near; riverMat.uniforms.uFogF.value = scene.fog.far;
}
const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
function screenToWorld(cx, cy) {
  ray.setFromCamera(new THREE.Vector2(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1), camera);
  return ray.ray.intersectPlane(ground, hit) ? hit : null;
}
const ptrs = new Map(); let down = null, pinch = 0;
let lastInput = performance.now();
canvas.addEventListener('pointerdown', e => {
  audioInit(); lastInput = performance.now();
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
canvas.addEventListener('wheel', e => { e.preventDefault(); lastInput = performance.now(); cam.zoom = clamp(cam.zoom * Math.exp(e.deltaY * .001), .45, 2.4); }, { passive: false });

/* ================================================================
   UI: vylepšenia, HUD, radar, správy
   ================================================================ */
const upWrap = $('upgrades'), upEls = {};
UPG.forEach((u, i) => {
  const el = document.createElement('div'); el.className = 'up';
  el.innerHTML = `<div class="ic">${u.icon}</div><div><div class="nm"><span></span><i></i></div><div class="ef2"></div></div><div class="buy"></div>`;
  el.addEventListener('click', () => { audioInit(); buy(u); });
  upWrap.appendChild(el); upEls[u.id] = { el, nm: el.querySelector('.nm span'), lv: el.querySelector('i'), ef: el.querySelector('.ef2'), buy: el.querySelector('.buy') };
});
const presEl = (() => {
  const el = document.createElement('div'); el.className = 'up pres';
  el.innerHTML = '<div class="ic">🌀</div><div><div class="nm"><span></span><i></i></div><div class="ef2"></div></div><div class="buy"></div>';
  el.addEventListener('click', () => { audioInit(); askPrestige(); });
  upWrap.appendChild(el);
  return { el, nm: el.querySelector('.nm span'), ef: el.querySelector('.ef2'), buy: el.querySelector('.buy') };
})();
function askPrestige() {
  const g = prestigeGain();
  if (g < 1) { news(t('prestigeNeedNews', fmt(PRESTIGE_BASE)), true); return; }
  modal(t('prestigeModal', g, prestigeMult().toFixed(1), (1 + PRESTIGE_K * (S.pts + g)).toFixed(1)));
  $('m-no').onclick = closeModal;
  $('m-yes').onclick = () => {
    S.pts += prestigeGain(); S.fronts++;
    newRun(); closeModal(); news(t('prestigeDone'), true);
  };
}
// Úlohy: krátkodobé ciele s odmenou (cyklus šiestich typov, náročnosť postupne rastie)
const QUESTS = [
  { goal: L => Math.round(5 * Math.pow(1.7, L)), val: () => S.destroyed },
  { goal: L => 3 + 2 * L, val: () => S.cars },
  { goal: () => 3, val: () => S.buys },
  { goal: L => Math.min(4, 1 + Math.floor(L / 3)), val: () => S.bridges },
  { goal: () => 1, val: () => S.boosts },
  { goal: () => Math.max(150, Math.round(S.rate * 90)), val: () => S.life },
];
const questReward = () => Math.max(15 + 6 * S.qn, S.rate * 12);
function startQuest() { const q = QUESTS[S.qn % QUESTS.length]; S.qgoal = q.goal(Math.floor(S.qn / QUESTS.length)); S.qbase = q.val(); }
if (!S.qgoal) startQuest();
function updateQuest() {
  const qi = S.qn % QUESTS.length, q = QUESTS[qi], prog = Math.max(0, q.val() - S.qbase), qText = () => t('quests')[qi](qi === 5 ? fmt(S.qgoal) : S.qgoal);
  if (prog >= S.qgoal) {
    const r = questReward(); S.money += r; S.total += r; S.life += r;
    news(t('questDone', qText(), fmt(r)), true); questSound();
    $('quest').classList.remove('done'); void $('quest').offsetWidth; $('quest').classList.add('done');
    S.qn++; startQuest(); return updateQuest();
  }
  setText($('q-text'), qText()); setText($('q-rew'), '+' + fmt(questReward()) + ' €');
  setText($('q-num'), `${fmt(prog)} / ${fmt(S.qgoal)}`);
  $('q-bar').style.width = Math.min(100, prog / S.qgoal * 100) + '%';
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
  S.money -= p.cost; S.lv[u.id] += p.n; S.buys += p.n; buySound();
  const k = windKmh();
  news(u.id === 'power' ? t('buy_power', k, efOf(k)[0]) : t('buy_' + u.id), true);
  refreshUI(true);
  save();
}
$('qty').addEventListener('click', e => { const q = e.target.dataset && e.target.dataset.q; if (!q) return; S.qty = q; [...$('qty').children].forEach(b => b.classList.toggle('on', b.dataset.q === q)); refreshUI(true); });
window.addEventListener('keydown', e => {
  audioInit();
  if (e.key >= '1' && e.key <= '6') { const u = UPG[+e.key - 1]; if (u) buy(u); }
  else if (e.key === 'm' || e.key === 'M') setMuted(!S.muted);
  else if (e.key === ' ') { e.preventDefault(); useBoost(); }
  else if (e.key === 'l' || e.key === 'L') setLang(lang() === 'sk' ? 'en' : 'sk');
  else if (e.key === 'c' || e.key === 'C') setCine(!document.body.classList.contains('cine'), true);
  lastInput = performance.now();
});
$('btn-mute').addEventListener('click', () => { audioInit(); setMuted(!S.muted); });
// Filmový vzhľad: zrno + farebné ladenie + kontrast + vinetácia (len prekryvné vrstvy, žiadny ďalší prechod vykresľovania)
{
  const n = 128, cv = document.createElement('canvas'); cv.width = cv.height = n;
  const g = cv.getContext('2d'), im = g.createImageData(n, n);
  for (let i = 0; i < n * n; i++) { const v = 128 + (Math.random() + Math.random() - 1) * 120; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
  g.putImageData(im, 0, 0);
  $('grain').style.backgroundImage = `url(${cv.toDataURL()})`;      // dataURL – nezávisí od obsahu canvasu
}
function applyLang() {
  document.documentElement.lang = lang(); document.title = t('title');
  document.querySelectorAll('[data-i]').forEach(el => { el.textContent = t(el.dataset.i); });
  document.querySelectorAll('[data-ih]').forEach(el => { el.innerHTML = t(el.dataset.ih); });
  document.querySelectorAll('[data-it]').forEach(el => { el.title = t(el.dataset.it); });
  $('btn-lang').textContent = lang().toUpperCase();
}
function setLang(code) {
  setLangCode(code); S.lang = lang(); applyLang();
  flavorBag = []; tkq.length = 0;                      // staré správy v pôvodnom jazyku zahodiť
  refreshUI(); updateHUD(0); nextNews(); save();
}
$('btn-lang').addEventListener('click', () => setLang(lang() === 'sk' ? 'en' : 'sk'));
function setCine(on, user) { if (user) S.cine = on; document.body.classList.toggle('cine', on); $('btn-cine').style.opacity = on ? 1 : .45; }
$('btn-cine').addEventListener('click', () => { setCine(!document.body.classList.contains('cine'), true); save(); });
setCine(S.cine == null ? !LOW : S.cine);
applyLang();   // na mobile je filmový filter predvolene vypnutý (šetrí výkon)
$('btn-reset').addEventListener('click', () => {
  modal(t('resetModal'));
  $('m-no').onclick = closeModal;
  $('m-yes').onclick = () => { for (const k of ['pts', 'fronts', 'destroyed', 'life', 'cars', 'bridges', 'buys', 'boosts', 'qn', 'qbase', 'qgoal']) S[k] = 0; newRun(); startQuest(); closeModal(); };
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
    setText(e.nm, t('up_' + u.id)); setText(e.lv, t('lv') + l);
    setHTML(e.ef, p.max ? `<b>${u.show(l)}</b> ${t('maximum')}` : `${u.show(l)} → <b>${u.show(l + p.n)}</b>`);
    setText(e.buy, p.max ? 'MAX' : (p.n > 1 ? `+${p.n} · ` : '') + fmt(p.cost) + ' €');
    e.el.classList.toggle('can', !p.max && S.money >= p.cost);
    e.el.classList.toggle('max', p.max);
    e.buy.style.setProperty('--p', p.max ? '0%' : Math.min(100, S.money / p.cost * 100).toFixed(0) + '%');   // ako ďaleko som od ceny
  }
  updateQuest();
  // prestíž
  const g = prestigeGain(), pe = presEl;
  setText(pe.nm, t('prestigeName'));
  setHTML(pe.ef, g >= 1 ? t('prestigeGain', g, (1 + PRESTIGE_K * (S.pts + g)).toFixed(1), prestigeMult().toFixed(1)) : t('prestigeNeed', fmt(PRESTIGE_BASE), prestigeMult().toFixed(1)));
  setText(pe.buy, g >= 1 ? t('start') : t('locked'));
  pe.el.classList.toggle('can', g >= 1);
}
let shownMoney = S.money;
const boostEl = $('boost');
boostEl.addEventListener('click', useBoost);
function updateHUD(dt) {
  boostEl.classList.toggle('on', boost.t > 0); boostEl.classList.toggle('cd', boost.t <= 0 && boost.cd > 0);
  boostEl.style.setProperty('--cd', (100 - clamp(boost.cd / BOOST_CD, 0, 1) * 100).toFixed(0) + '%');
  setText($('boost-t'), boost.t > 0 ? Math.ceil(boost.t) + ' s' : boost.cd > 0 ? Math.ceil(boost.cd) + ' s' : t('boost'));
  shownMoney = lerp(shownMoney, S.money, 1 - Math.exp(-dt * 12));
  if (Math.abs(shownMoney - S.money) < .5) shownMoney = S.money;
  setHTML($('money'), fmt(shownMoney) + ' <small>€</small>');
  let r = 0; if (rateHist.length > 1) { for (const h of rateHist) r += h[1]; r /= Math.max(.5, rateHist[rateHist.length - 1][0] - rateHist[0][0] + .0001); }
  S.rate = lerp(S.rate, r, .1);
  setText($('rate'), '+' + fmt(S.rate) + ' €/s');
  setText($('destroyed'), t('destroyedN', fmt(S.destroyed)));
  const k = windKmh(), ef = efOf(k);
  setText($('wind'), String(k)); setText($('ef'), ef[0]); $('ef').style.background = ef[1];
  setText($('diam'), (2 * R).toFixed(1));
  setText($('zone'), unlockedTier() + 1 + (megaScale() > 1 ? '+' : ''));
  setText($('clock'), t('front', S.fronts + 1) + (S.pts ? ' · ×' + fmt(prestigeMult()) : ''));
}
/* radar */
const rc = $('radar'), rg = rc.getContext('2d');
const TIER_COL = ['#6fe08a', '#a8e05a', '#f2d14a', '#f29a3d', '#ee5a4a', '#d94fe0'];
let radarBase = null;
function buildRadarBase() {
  const W = rc.width, c = W / 2, sc = W / (2 * (WORLD + 6)), cv = document.createElement('canvas'); cv.width = cv.height = W;
  const g = cv.getContext('2d'); g.lineCap = g.lineJoin = 'round';
  const trace = (pts, w, col) => { g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(c + q.x * sc, c + q.z * sc) : g.moveTo(c + q.x * sc, c + q.z * sc)); g.lineWidth = w; g.strokeStyle = col; g.stroke(); };
  for (const pk of PARKS) { g.fillStyle = 'rgba(60,140,90,.35)'; g.beginPath(); g.arc(c + pk.x * sc, c + pk.z * sc, pk.r * sc, 0, 7); g.fill(); }
  trace(riverPts, RIVER_HALF * 2 * sc, '#1f6fb5');
  for (const st of ROADS) trace(st.pts, Math.max(1.5, st.half * sc * 1.1), st.kind === 'avenue' ? 'rgba(150,190,230,.55)' : 'rgba(110,150,200,.4)');
  for (const pl of PLAZAS) { g.fillStyle = 'rgba(150,190,230,.55)'; g.beginPath(); g.arc(c + pl.x * sc, c + pl.z * sc, pl.r * sc, 0, 7); g.fill(); }
  radarBase = cv;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && radarBase) buildRadarBase(); });   // mobil môže zahodiť obsah skrytého canvasu
function drawRadar() {
  if (!radarBase) buildRadarBase();
  const W = rc.width, c = W / 2, sc = W / (2 * (WORLD + 6)), X = x => c + x * sc, Y = z => c + z * sc;
  rg.clearRect(0, 0, W, W);
  rg.save(); rg.beginPath(); rg.arc(c, c, c - 2, 0, 7); rg.clip();
  rg.fillStyle = '#06224a'; rg.fillRect(0, 0, W, W);
  rg.drawImage(radarBase, 0, 0);
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
let flavorBag = [];
function nextFlavor() { if (!flavorBag.length) flavorBag = t('flavor').slice().sort(() => Math.random() - .5); return flavorBag.pop(); }   // každá hláška raz, kým sa nevyčerpajú
const tkq = []; let tkBusy = false; const tkEl = $('tk');
function news(msg, prio) { if (tkq.length > 6) tkq.pop(); prio ? tkq.unshift(msg) : tkq.push(msg); if (!tkBusy) nextNews(); }
function nextNews() {
  const m = tkq.shift() || nextFlavor(); tkEl.textContent = m; tkBusy = true;
  const cw = tkEl.parentElement.clientWidth; document.documentElement.style.setProperty('--cw', cw + 'px');
  const dur = (cw + tkEl.offsetWidth) / 120;
  tkEl.style.animation = 'none'; void tkEl.offsetWidth; tkEl.style.animation = `tk ${dur}s linear forwards`;
  $('headline').textContent = m.length < 90 ? m : t('headline');
}
tkEl.addEventListener('animationend', () => { tkBusy = false; nextNews(); });

/* ================================================================
   Ukladanie, offline, úvod
   ================================================================ */
function save() { if (window.__noSave) return; try { S.time = Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, s: S })); } catch (e) { /* ignore */ } }
function modal(html) { $('mbox').innerHTML = html; $('modal').classList.add('show'); }
function closeModal() { $('modal').classList.remove('show'); }
function offlineClaim(sec, fromHidden) {
  if (sec < 30 || S.rate < .5) return false;
  const eff = offlineEff(S.lv.offline), gain = S.rate * Math.min(sec, 8 * 3600) * eff;
  if (gain < 1) return false;
  S.money += gain; S.total += gain; S.life += gain; shownMoney = S.money - gain;   // nezapočítavať do €/s (inak sa offline zisk násobí)
  const mins = Math.floor(sec / 60);
  modal(t('offlineModal', t('dur', mins), Math.round(eff * 100), fmt(gain)));
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
initCity(); initTrees(); initDecor(); initCars();
setMuted(S.muted);
[...$('qty').children].forEach(b => b.classList.toggle('on', b.dataset.q === S.qty));
window.addEventListener('resize', resize); resize();
// počiatočná poloha tornáda – mimo mesta, nech vidíme príchod
T.x = -HALF - 14; T.z = -20; cam.tx = T.x; cam.tz = T.z;
for (const t of trees) writeTree(t, 0);
treeMesh.instanceMatrix.needsUpdate = true;
refreshUI(true);

setTimeout(() => { $('hint').style.opacity = 0; }, 30000);
const firstRun = S.total === 0 && !localStorage.getItem(SAVE_KEY);
news(t('news1'), true);
news(t('news2'));
const away = (Date.now() - S.time) / 1000;
// Úvodné okno s voľbou jazyka (dá sa prepnúť ešte pred štartom)
function showIntro() {
  modal(`<span class="live" style="display:inline-flex"><i></i>LIVE</span> <span class="langsel"><button data-l="sk" class="${lang() === 'sk' ? 'on' : ''}">SK</button><button data-l="en" class="${lang() === 'en' ? 'on' : ''}">EN</button></span>` + t('introModal'));
  $('mbox').querySelectorAll('.langsel button').forEach(b => { b.onclick = () => { setLang(b.dataset.l); showIntro(); }; });
  $('m-ok').onclick = () => { audioInit(); closeModal(); };
}
if (firstRun) {
  showIntro();
} else if (!offlineClaim(away, false)) { /* nič */ }

let frameNo = 0;
let last = performance.now(), hudT = 0, radT = 0, saveT = 0, uiT = 0, fpsAcc = 0, fpsN = 0, fpsT = 0;
window.__tornado = { sparks, sp, puffs, fires, renderer, AU, SH, scene, camera, S, ts: 1, T, get R() { return R; }, get H() { return H; }, buildings, trees, update, commandTo, UPG, buy, news, fmt, cam };
function frame(now) {
  const rdt = Math.min(.1, (now - last) / 1000); last = now;
  const ts = window.__tornado.ts;
  let remaining = rdt * ts;
  while (remaining > 1e-6) { const step = Math.min(.05, remaining); update(step); remaining -= step; }
  const dt = rdt;
  for (const t of trees) if (t.dirty) { writeTree(t, time); treeMesh.instanceMatrix.needsUpdate = true; if (!t.alive || (t.shake <= 0 && t.grow >= 1)) t.dirty = false; }
  updateCamera(dt); updateRain(dt); updatePops(dt); updateAudio(dt);
  hudT += dt; if (hudT > .1) { updateHUD(hudT); hudT = 0; }
  uiT += dt; if (uiT > .25) { refreshUI(); uiT = 0; }
  radT += dt; if (radT > (LOW ? .16 : .08)) { drawRadar(); radT = 0; }
  saveT += dt; if (saveT > 5) { save(); saveT = 0; }
  // adaptívna kvalita
  fpsAcc += rdt; fpsN++; fpsT += rdt;
  if (fpsT > 3) { const fps = fpsN / fpsAcc; if (fps < (LOW ? 40 : 28) && pr > (LOW ? .75 : .6)) { pr = Math.max(LOW ? .75 : .6, pr - .2); resize(); } fpsAcc = fpsN = fpsT = 0; }
  if (LOW) renderer.shadowMap.needsUpdate = (frameNo++ & 1) === 0;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
