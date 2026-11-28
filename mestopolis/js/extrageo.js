// Mestopolis – železnica, smeti a ďalšie budovy (parky, odpad, cintoríny, stanica)
import { HS, SEA, BUILDINGS } from './config.js';
import { col, shade, mix } from './geom.js';
import { rng } from './noise.js';
import { trees, beam, surfY, decal } from './buildgeo.js';

const C = {
  ballast: col(0x8a8378), sleeper: col(0x5a4030), steel: col(0x9aa0a6), grass: col(0x5f9b3c), grassL: col(0x74b04a),
  white: col(0xeeeeea), black: col(0x1d1d1f), red: col(0xc8352b), yellow: col(0xe9c23d), blue: col(0x2f5fa8),
  orange: col(0xd9792b), green: col(0x2f8a4f), metal: col(0x9aa3ab), darkMetal: col(0x5d646b), concrete: col(0xb9b5aa),
  darkConc: col(0x86827a), brick: col(0xa0523d), wood: col(0xa07a4a), sand: col(0xd8c690), water: col(0x3f86c4),
  dirt: col(0x7a6450), path: col(0xc9b48a), stone: col(0xb8b4ac), glass: col(0x8fc9c0), roofGray: col(0x5f6670),
};
const FLOWERS = [0xd8343a, 0xe9c23d, 0x9a4fd0, 0xf08ac0, 0xffffff, 0xf07a2a].map(col);
const DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0];   // S V J Z (sever, východ, juh, západ)

// =====================================================================
//  ŽELEZNICA
// =====================================================================
const railNb = (w, x, y) => [
  y > 0 && w.rail[w.ti(x, y - 1)], x < w.N - 1 && w.rail[w.ti(x + 1, y)], y < w.N - 1 && w.rail[w.ti(x, y + 1)], x > 0 && w.rail[w.ti(x - 1, y)],
];
// výška koľaje v bode (most nad vodou = pevná výška)
function railY(w, x, z) {
  const tx = Math.floor(x), tz = Math.floor(z);
  if (w.inb(tx, tz) && w.water[w.ti(tx, tz)]) return SEA * HS + 0.36;
  return surfY(w, Math.min(w.N - 0.001, Math.max(0, x)), Math.min(w.N - 0.001, Math.max(0, z)));
}
const left = (dx, dz) => [dz, -dx];

export function rail(gb, w, x, y) {
  const i = w.ti(x, y);
  const n = railNb(w, x, y);
  const cx = x + 0.5, cz = y + 0.5;
  const water = w.water[i], onRoad = w.road[i];
  let arms = [0, 1, 2, 3].filter(k => n[k]);
  if (!arms.length) arms = [0, 2];
  if (arms.length === 1) arms = [arms[0], (arms[0] + 2) % 4];   // koniec trate: rovný kúsok
  // štrkové lôžko alebo mostovka
  if (water) railBridge(gb, w, x, y, arms);
  else if (!onRoad) {
    const sub = w.tileMax(x, y) !== w.tileMin(x, y) ? 3 : 1, hw = 0.24;
    decal(gb, w, cx - hw, cz - hw, cx + hw, cz + hw, C.ballast, 0.02, sub);
    for (const k of arms) {
      if (k === 0) decal(gb, w, cx - hw, y, cx + hw, cz - hw, C.ballast, 0.02, sub);
      if (k === 2) decal(gb, w, cx - hw, cz + hw, cx + hw, y + 1, C.ballast, 0.02, sub);
      if (k === 3) decal(gb, w, x, cz - hw, cx - hw, cz + hw, C.ballast, 0.02, sub);
      if (k === 1) decal(gb, w, cx + hw, cz - hw, x + 1, cz + hw, C.ballast, 0.02, sub);
    }
  }
  const lift = water ? 0.0 : onRoad ? 0.045 : 0.03;
  const P = (px, pz, up) => [px, railY(w, px, pz) + lift + up, pz];
  const edge = k => [cx + DX[k] * 0.5, cz + DZ[k] * 0.5];
  // dráha: zoznam úsekov [A, B] stredovej čiary
  const segs = [];
  const corner = arms.length === 2 && (arms[0] + arms[1]) % 2 === 1;
  if (corner) {
    const [a, b] = arms; segs.push([edge(a), edge(b), a, b]);
  } else for (const k of arms) segs.push([[cx - DX[k] * 0.08, cz - DZ[k] * 0.08], edge(k), -1, k]);
  for (const [A, Bp, ka, kb] of segs) {
    const len = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]);
    const ux = (Bp[0] - A[0]) / len, uz = (Bp[1] - A[1]) / len;
    // podvaly
    const nS = Math.max(2, Math.round(len / 0.13));
    for (let s = 0; s < nS; s++) {
      const t = (s + 0.5) / nS, px = A[0] + (Bp[0] - A[0]) * t, pz = A[1] + (Bp[1] - A[1]) * t;
      const [lx, lz] = left(ux, uz);
      beam(gb, P(px - lx * 0.17, pz - lz * 0.17, 0.006), P(px + lx * 0.17, pz + lz * 0.17, 0.006), 0.012, C.sleeper);
    }
    // koľajnice
    for (const side of [-1, 1]) {
      let a0, b0;
      if (ka >= 0) { // oblúk: z ľavej strany vstupu na ľavú stranu výstupu
        const la = left(-DX[ka], -DZ[ka]), lb = left(DX[kb], DZ[kb]);
        a0 = [A[0] + la[0] * 0.1 * side, A[1] + la[1] * 0.1 * side]; b0 = [Bp[0] + lb[0] * 0.1 * side, Bp[1] + lb[1] * 0.1 * side];
      } else {
        const [lx, lz] = left(ux, uz);
        a0 = [A[0] + lx * 0.1 * side, A[1] + lz * 0.1 * side]; b0 = [Bp[0] + lx * 0.1 * side, Bp[1] + lz * 0.1 * side];
      }
      beam(gb, P(a0[0], a0[1], 0.022), P(b0[0], b0[1], 0.022), 0.009, C.steel);
    }
  }
  // železničné priecestie: závory s výstražným svetlom
  if (onRoad && !water) {
    const along = arms.includes(0) || arms.includes(2);
    for (const s of [-1, 1]) {
      const px = cx + (along ? 0.36 * s : 0.36 * s), pz = cz + (along ? -0.36 * s : 0.36 * s);
      const py = surfY(w, px, pz);
      gb.box(px, py, pz, 0.025, 0.2, 0.025, C.white);
      gb.box(px, py + 0.2, pz, 0.04, 0.035, 0.04, C.red, { glow: [2.4, 0.2, 0.15] });
    }
  }
}

function railBridge(gb, w, x, y, arms) {
  const cx = x + 0.5, cz = y + 0.5, deck = SEA * HS + 0.33;
  const alongZ = arms.includes(0) || arms.includes(2);
  const L = 1.0, W = 0.46;
  gb.box(cx, deck - 0.05, cz, alongZ ? W : L, 0.05, alongZ ? L : W, C.darkConc, { top: C.ballast });
  // oceľová priehradová konštrukcia po bokoch
  for (const s of [-1, 1]) {
    const o = s * W / 2;
    const a = alongZ ? [cx + o, deck, y] : [x, deck, cz + o], b = alongZ ? [cx + o, deck, y + 1] : [x + 1, deck, cz + o];
    const at = [a[0], deck + 0.16, a[2]], bt = [b[0], deck + 0.16, b[2]];
    beam(gb, at, bt, 0.014, C.red);
    const m = [(a[0] + b[0]) / 2, deck, (a[2] + b[2]) / 2], mt = [m[0], deck + 0.16, m[2]];
    beam(gb, a, mt, 0.01, C.red); beam(gb, mt, b, 0.01, C.red); beam(gb, at, m, 0.01, C.red); beam(gb, m, bt, 0.01, C.red);
  }
  const bottom = w.tileMin(x, y) * HS;
  if ((x + y) % 2 === 0) gb.box(cx, bottom, cz, 0.14, deck - 0.05 - bottom, 0.14, C.darkConc);
}

// =====================================================================
//  SMETI PRI BUDOVÁCH
// =====================================================================
export function garbagePile(gb, w, x, y, lvl) {
  const r = rng(x * 77 + y * 13 + lvl);
  const bags = [col(0x1f1f22), col(0x2f6a3a), col(0x2a3f7a), col(0x5a4a3a)];
  const n = lvl === 1 ? 3 : 7;
  for (let k = 0; k < n; k++) {
    const px = x + 0.08 + r() * 0.84, pz = y + 0.78 + r() * 0.17;
    gb.box(px, surfY(w, px, pz) + 0.01, pz, 0.05 + r() * 0.03, 0.04 + r() * 0.03, 0.05 + r() * 0.03, bags[(r() * 4) | 0]);
  }
  if (lvl === 2) {
    const px = x + 0.82, pz = y + 0.86;
    gb.pyramid(px, surfY(w, px, pz) + 0.01, pz, 0.2, 0.09, 0.16, col(0x6a6258));
    gb.box(x + 0.15, surfY(w, x + 0.15, y + 0.88) + 0.01, y + 0.88, 0.08, 0.1, 0.06, C.green);
  }
}

// =====================================================================
//  NOVÉ BUDOVY
// =====================================================================
function bench(gb, x, y, z, alongX = true) { gb.box(x, y + 0.025, z, alongX ? 0.1 : 0.03, 0.012, alongX ? 0.03 : 0.1, C.wood); gb.box(x, y, z, alongX ? 0.08 : 0.02, 0.025, alongX ? 0.02 : 0.08, C.darkMetal); }
function lamp(gb, x, y, z) { gb.box(x, y, z, 0.018, 0.24, 0.018, C.black); gb.box(x, y + 0.24, z, 0.045, 0.035, 0.045, C.white, { glow: [1.5, 1.25, 0.75] }); }
function fence(gb, x0, z0, x1, z1, y, color, h = 0.07) {
  gb.box((x0 + x1) / 2, y, z0, x1 - x0, h, 0.012, color); gb.box((x0 + x1) / 2, y, z1, x1 - x0, h, 0.012, color);
  gb.box(x0, y, (z0 + z1) / 2, 0.012, h, z1 - z0, color); gb.box(x1, y, (z0 + z1) / 2, 0.012, h, z1 - z0, color);
}
function flowerBed(gb, r, x, y, z, w, d) {
  gb.box(x, y, z, w, 0.02, d, col(0x6a4a30));
  const n = Math.max(2, Math.round(w / 0.07)), m = Math.max(1, Math.round(d / 0.07));
  for (let a = 0; a < n; a++) for (let b = 0; b < m; b++) gb.box(x - w / 2 + (a + 0.5) * w / n, y + 0.02, z - d / 2 + (b + 0.5) * d / m, 0.04, 0.03, 0.04, FLOWERS[(r() * FLOWERS.length) | 0]);
}
function animal(gb, x, y, z, kind, r) {
  switch (kind) {
    case 0: gb.box(x, y + 0.06, z, 0.16, 0.1, 0.09, col(0x8a8a8e)); gb.box(x + 0.09, y + 0.08, z, 0.05, 0.06, 0.05, col(0x8a8a8e)); for (const [a, b] of [[-0.05, -0.03], [0.05, -0.03], [-0.05, 0.03], [0.05, 0.03]]) gb.box(x + a, y, z + b, 0.025, 0.06, 0.025, col(0x7a7a7e)); break; // slon
    case 1: gb.box(x, y + 0.08, z, 0.1, 0.06, 0.05, col(0xd9a84a)); gb.box(x + 0.05, y + 0.12, z, 0.025, 0.16, 0.025, col(0xd9a84a)); gb.box(x + 0.07, y + 0.27, z, 0.05, 0.03, 0.03, col(0xd9a84a)); for (const a of [-0.04, 0.04]) gb.box(x + a, y, z, 0.015, 0.08, 0.015, col(0xb8883a)); break; // žirafa
    case 2: gb.box(x, y + 0.04, z, 0.12, 0.05, 0.06, col(0xd8b050)); gb.box(x + 0.07, y + 0.06, z, 0.05, 0.05, 0.06, col(0x8a5a2a)); break; // lev
    default: gb.box(x, y + 0.03, z, 0.08, 0.05, 0.05, col(0xeeeeee)); gb.box(x + 0.04, y + 0.06, z, 0.03, 0.03, 0.03, C.black); // panda
  }
}

// vráti true, ak budovu nakreslil
export function extraBuilding(gb, w, b, emit, B, cx, cz, r) {
  const x = b.x, y = b.y, s = b.size;
  switch (b.type) {
    case 'playground': {
      gb.box(cx, B, cz, 0.84, 0.012, 0.84, C.sand);
      beam(gb, [cx - 0.3, B, cz - 0.25], [cx - 0.08, B + 0.18, cz - 0.25], 0.03, C.red);
      gb.box(cx - 0.06, B, cz - 0.25, 0.06, 0.18, 0.06, C.yellow); gb.box(cx - 0.06, B + 0.18, cz - 0.25, 0.1, 0.02, 0.1, C.blue);
      for (const sx of [-1, 1]) { beam(gb, [cx + 0.1 + sx * 0.12, B, cz + 0.2], [cx + 0.1 + sx * 0.12, B + 0.2, cz + 0.2], 0.012, C.metal); }
      beam(gb, [cx - 0.02, B + 0.2, cz + 0.2], [cx + 0.22, B + 0.2, cz + 0.2], 0.012, C.metal);
      for (const ox of [0.04, 0.16]) { beam(gb, [cx + ox, B + 0.2, cz + 0.2], [cx + ox, B + 0.07, cz + 0.2], 0.004, C.black); gb.box(cx + ox, B + 0.06, cz + 0.2, 0.05, 0.01, 0.03, C.orange); }
      gb.cyl(cx + 0.28, B, cz - 0.22, 0.06, 0.04, C.green, 8); gb.box(cx + 0.28, B + 0.04, cz - 0.22, 0.2, 0.012, 0.025, C.yellow);
      bench(gb, cx - 0.3, B, cz + 0.32); trees(gb, w, x, y, 1, b.id * 5, 0.8);
      return true;
    }
    case 'garden': {
      decal(gb, w, x + 0.45, y + 0.04, x + 0.55, y + 0.96, C.path, 0.025, 1); decal(gb, w, x + 0.04, y + 0.45, x + 0.96, y + 0.55, C.path, 0.025, 1);
      for (const [ox, oz] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) flowerBed(gb, r, cx + ox, B, cz + oz, 0.3, 0.3);
      gb.cyl(cx, B, cz, 0.08, 0.04, C.stone, 8); gb.cyl(cx, B + 0.04, cz, 0.06, 0.005, C.water, 8, null, { glow: [0.05, 0.15, 0.3] });
      for (const [ox, oz] of [[-0.45, 0], [0.45, 0], [0, -0.45], [0, 0.45]]) gb.box(cx + ox, B, cz + oz, ox ? 0.04 : 0.36, 0.06, ox ? 0.36 : 0.04, col(0x3f7a30));
      return true;
    }
    case 'pond': {
      gb.lathe(cx, B - 0.01, cz, [[0.62, 0.0], [0.64, 0.012]], C.path, 16);
      gb.cyl(cx, B, cz, 0.6, 0.012, C.water, 16, null, { glow: [0.02, 0.06, 0.12] });
      beam(gb, [cx - 0.66, B + 0.04, cz + 0.1], [cx - 0.3, B + 0.08, cz + 0.1], 0.04, C.wood);
      for (let k = 0; k < 4; k++) { const a = r() * 6.28, rr = r() * 0.35; gb.box(cx + Math.cos(a) * rr, B + 0.015, cz + Math.sin(a) * rr, 0.04, 0.025, 0.025, k % 2 ? C.white : C.yellow); }
      for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) trees(gb, w, x + ox, y + oz, 1, b.id * 3 + ox * 5 + oz, 1.1);
      bench(gb, cx + 0.72, B, cz + 0.2, false); lamp(gb, cx + 0.75, B, cz - 0.4); lamp(gb, cx - 0.75, B, cz + 0.6);
      return true;
    }
    case 'sports': {
      // tenis
      gb.box(cx - 0.45, B, cz, 0.8, 0.012, 1.6, col(0x3d7ab0));
      gb.box(cx - 0.45, B + 0.013, cz, 0.6, 0.001, 1.3, col(0x4a8cc8));
      for (const zz of [-0.65, 0.65]) gb.box(cx - 0.45, B + 0.014, cz + zz, 0.6, 0.002, 0.012, C.white);
      gb.box(cx - 0.45, B + 0.014, cz, 0.012, 0.002, 1.3, C.white);
      gb.box(cx - 0.45, B, cz, 0.66, 0.05, 0.008, C.white);
      // basketbal
      gb.box(cx + 0.45, B, cz, 0.8, 0.012, 1.6, col(0xc76b3c));
      gb.cyl(cx + 0.45, B + 0.013, cz, 0.15, 0.001, C.white, 12);
      for (const zz of [-0.7, 0.7]) { gb.box(cx + 0.45, B, cz + zz, 0.02, 0.22, 0.02, C.darkMetal); gb.box(cx + 0.45, B + 0.2, cz + zz * 0.96, 0.12, 0.08, 0.01, C.white); }
      fence(gb, x + 0.03, y + 0.03, x + 1.97, y + 1.97, B, col(0x4a5a4a), 0.12);
      for (const [ox, oz] of [[0.05, 0.05], [1.95, 1.95]]) { gb.box(x + ox, B, y + oz, 0.03, 0.55, 0.03, C.metal); gb.box(x + ox, B + 0.55, y + oz, 0.12, 0.05, 0.05, C.white, { glow: [2, 2, 1.8] }); }
      return true;
    }
    case 'botanic': {
      decal(gb, w, x + 0.1, y + 1.4, x + 2.9, y + 1.6, C.path, 0.025, 4); decal(gb, w, x + 1.4, y + 0.1, x + 1.6, y + 2.9, C.path, 0.025, 4);
      // skleník
      gb.box(cx, B, cz - 0.65, 1.6, 0.35, 0.9, C.glass, { top: C.glass, glow: [0.1, 0.35, 0.3] });
      gb.gable(cx, B + 0.35, cz - 0.65, 1.6, 0.32, 0.9, mix(C.glass, C.white, 0.2), C.glass, 'x', 0.02);
      for (let k = 0; k <= 6; k++) gb.box(cx - 0.8 + k * 0.267, B, cz - 0.65, 0.015, 0.36, 0.92, C.white);
      gb.lathe(cx + 0.85, B, cz - 0.6, [[0.3, 0], [0.29, 0.15], [0.22, 0.32], [0.12, 0.42], [0.001, 0.46]], mix(C.glass, C.white, 0.1), 12);
      for (const [ox, oz] of [[-0.8, 0.7], [0.8, 0.7], [-0.3, 0.9], [0.4, 0.95]]) flowerBed(gb, r, cx + ox, B, cz + oz, 0.36, 0.3);
      for (const [ox, oz] of [[0, 2], [2, 2], [0, 0]]) trees(gb, w, x + ox, y + oz, 2, b.id * 9 + ox + oz * 3, 1.1);
      lamp(gb, cx - 0.2, B, cz + 0.2); lamp(gb, cx + 0.3, B, cz + 0.3);
      return true;
    }
    case 'zoo': {
      decal(gb, w, x + 0.2, y + 1.9, x + 3.8, y + 2.1, C.path, 0.025, 4); decal(gb, w, x + 1.9, y + 0.2, x + 2.1, y + 3.8, C.path, 0.025, 4);
      const pens = [[x + 1, y + 1, C.sand, 0], [x + 3, y + 1, C.grassL, 1], [x + 1, y + 3, col(0xc9a86a), 2], [x + 3, y + 3, C.grassL, 3]];
      for (const [px, pz, g, kind] of pens) {
        gb.box(px, B, pz, 1.6, 0.012, 1.6, g);
        fence(gb, px - 0.8, pz - 0.8, px + 0.8, pz + 0.8, B, C.wood, 0.1);
        for (let k = 0; k < 2; k++) animal(gb, px - 0.3 + k * 0.5 + (r() - 0.5) * 0.2, B + 0.012, pz - 0.2 + r() * 0.4, kind, r);
        if (kind === 1 || kind === 3) gb.cyl(px + 0.45, B, pz + 0.45, 0.22, 0.014, C.water, 10, null, { glow: [0.02, 0.06, 0.12] });
        trees(gb, w, Math.floor(px) - 1, Math.floor(pz) - 1, 1, b.id + px * 3 + pz, 1);
      }
      gb.box(cx, B, y + 0.2, 0.7, 0.3, 0.2, col(0x8a6a4a), { top: C.roofGray });
      gb.box(cx, B + 0.3, y + 0.2, 0.5, 0.08, 0.04, C.white, { glow: [0.4, 1.4, 0.4] });
      return true;
    }
    case 'funpark': {
      decal(gb, w, x + 0.2, y + 0.2, x + 3.8, y + 3.8, col(0xd8cdb0), 0.02, 4);
      // ruské koleso
      const wx = x + 1.1, wz = y + 1.2, wh = 1.05, wr = 0.75;
      for (const o of [-0.08, 0.08]) {
        beam(gb, [wx - 0.35, B, wz + o], [wx, B + wh, wz + o], 0.02, C.white); beam(gb, [wx + 0.35, B, wz + o], [wx, B + wh, wz + o], 0.02, C.white);
        for (let k = 0; k < 16; k++) {
          const a0 = k / 16 * 6.283, a1 = (k + 1) / 16 * 6.283;
          beam(gb, [wx + Math.cos(a0) * wr, B + wh + Math.sin(a0) * wr, wz + o], [wx + Math.cos(a1) * wr, B + wh + Math.sin(a1) * wr, wz + o], 0.012, C.white, k % 2 ? [1.6, 0.4, 1.4] : [0.4, 1.2, 2.0]);
          if (k % 2 === 0) beam(gb, [wx, B + wh, wz + o], [wx + Math.cos(a0) * wr, B + wh + Math.sin(a0) * wr, wz + o], 0.006, C.metal);
        }
      }
      for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; gb.box(wx + Math.cos(a) * wr, B + wh + Math.sin(a) * wr - 0.08, wz, 0.08, 0.07, 0.12, [C.red, C.yellow, C.blue, C.green][k % 4]); }
      // horská dráha
      const pts = [];
      for (let k = 0; k <= 24; k++) { const t = k / 24 * 6.283; pts.push([x + 2.8 + Math.cos(t) * 0.85, B + 0.25 + 0.35 * (1 + Math.sin(t * 2)) * (k % 12 < 6 ? 1 : 0.5), y + 1.3 + Math.sin(t) * 0.75]); }
      for (let k = 0; k < pts.length - 1; k++) {
        beam(gb, pts[k], pts[k + 1], 0.02, C.red);
        if (k % 3 === 0) beam(gb, [pts[k][0], B, pts[k][2]], pts[k], 0.01, C.white);
      }
      // kolotoč
      const kx = x + 1.2, kz = y + 3.0;
      gb.cyl(kx, B, kz, 0.42, 0.05, C.white, 12); gb.cyl(kx, B + 0.05, kz, 0.04, 0.3, C.yellow, 6);
      gb.cyl(kx, B + 0.33, kz, 0.48, 0.18, C.red, 12, 0, { glow: [0.6, 0.15, 0.1] });
      for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; gb.box(kx + Math.cos(a) * 0.3, B + 0.08, kz + Math.sin(a) * 0.3, 0.07, 0.08, 0.04, [C.white, C.blue, C.yellow][k % 3]); }
      // stánky a svetlá
      for (let k = 0; k < 3; k++) { const sx = x + 2.4 + k * 0.45; gb.box(sx, B, y + 3.2, 0.32, 0.18, 0.28, [C.yellow, C.blue, C.green][k]); gb.gable(sx, B + 0.18, y + 3.2, 0.32, 0.1, 0.28, C.white, C.white, 'x', 0.02); }
      for (let k = 0; k < 6; k++) gb.box(x + 0.4 + k * 0.6, B, y + 3.85, 0.04, 0.25, 0.04, C.white, { glow: k % 2 ? [2, 0.4, 1.6] : [2, 1.8, 0.3] });
      return true;
    }
    case 'landfill': {
      const d = BUILDINGS.landfill, f = Math.min(1, (b.fill || 0) / d.capacity);
      gb.box(cx, B, cz, s - 0.1, 0.012, s - 0.1, C.dirt);
      fence(gb, x + 0.05, y + 0.05, x + s - 0.05, y + s - 0.05, B, C.darkMetal, 0.1);
      const heaps = [[cx - 0.6, cz - 0.5], [cx + 0.5, cz - 0.6], [cx - 0.4, cz + 0.5], [cx + 0.55, cz + 0.45], [cx, cz]];
      heaps.forEach(([hx, hz], k) => {
        const hh = 0.12 + f * 0.6 * (0.6 + 0.4 * ((k * 37) % 10) / 10);
        if (k / heaps.length <= f + 0.25) {
          gb.pyramid(hx, B + 0.012, hz, 0.9, hh, 0.8, col(0x6e6458));
          for (let j = 0; j < 6; j++) gb.box(hx + (r() - 0.5) * 0.5, B + 0.02 + r() * hh * 0.4, hz + (r() - 0.5) * 0.4, 0.05, 0.03, 0.05, FLOWERS[(r() * 6) | 0]);
        }
      });
      gb.box(cx + 0.9, B, cz + 1.05, 0.22, 0.07, 0.12, C.yellow); gb.box(cx + 0.78, B + 0.01, cz + 1.05, 0.05, 0.06, 0.16, C.darkMetal);
      gb.box(cx - 1.0, B, cz + 1.1, 0.36, 0.18, 0.22, col(0x9aa0a6)); gb.windows(cx - 1.0, B, cz + 1.1, 0.36, 0.18, 0.22, 1, r, { lit: 0.6, segs: 2 });
      if (f > 0.05) emit.push([cx, B + 0.3 + f * 0.4, cz, 0, 0.12]);
      return true;
    }
    case 'incinerator': {
      gb.box(cx - 0.2, B, cz, 1.1, 0.5, 1.4, col(0x8e9aa4), { top: C.roofGray });
      gb.windows(cx - 0.2, B, cz, 1.1, 0.5, 1.4, 2, r, { lit: 0.7, segs: 3, warm: [1.5, 0.7, 0.2] });
      gb.box(cx + 0.55, B, cz - 0.4, 0.5, 0.32, 0.5, col(0x6e7880));
      gb.cyl(cx + 0.6, B, cz + 0.45, 0.09, 1.5, C.white, 10, 0.07, { top: C.black });
      gb.cyl(cx + 0.6, B + 1.2, cz + 0.45, 0.085, 0.1, C.red, 10, 0.083, { noCap: true });
      emit.push([cx + 0.6, B + 1.55, cz + 0.45, 0, 0.8]);
      gb.box(cx - 0.2, B + 0.5, cz + 0.71, 0.5, 0.1, 0.02, C.white, { glow: [0.4, 1.6, 0.6] });
      return true;
    }
    case 'recycling': {
      gb.box(cx - 0.15, B, cz - 0.3, 1.4, 0.4, 0.9, col(0x4f8a5a), { top: col(0x3f6e48) });
      gb.windows(cx - 0.15, B, cz - 0.3, 1.4, 0.4, 0.9, 1, r, { lit: 0.6, segs: 4 });
      gb.box(cx - 0.15, B + 0.4, cz + 0.16, 0.6, 0.1, 0.02, C.white, { glow: [0.4, 1.8, 0.6] });
      const cc = [C.blue, C.yellow, C.green, C.red];
      for (let k = 0; k < 4; k++) gb.box(cx - 0.6 + k * 0.32, B, cz + 0.55, 0.26, 0.14, 0.22, cc[k]);
      for (let k = 0; k < 3; k++) gb.pyramid(cx + 0.55, B + 0.012, cz - 0.6 + k * 0.38, 0.3, 0.14, 0.26, mix(cc[k], C.white, 0.3));
      beam(gb, [cx + 0.55, B + 0.05, cz + 0.4], [cx + 0.45, B + 0.38, cz - 0.1], 0.03, C.darkMetal);
      return true;
    }
    case 'cemetery': {
      const d = BUILDINGS.cemetery, f = Math.min(1, (b.fill || 0) / d.graves);
      gb.box(cx, B, cz, 1.9, 0.012, 1.9, col(0x55843e));
      fence(gb, x + 0.04, y + 0.04, x + 1.96, y + 1.96, B, col(0x2a2a2a), 0.09);
      decal(gb, w, x + 0.92, y + 0.06, x + 1.08, y + 1.94, C.path, 0.025, 2);
      // kaplnka
      gb.box(cx, B, y + 0.35, 0.36, 0.3, 0.42, col(0xe6e0d2)); gb.gable(cx, B + 0.3, y + 0.35, 0.36, 0.2, 0.42, col(0x5a4a3a), col(0xe6e0d2), 'z', 0.02);
      gb.box(cx, B + 0.5, y + 0.25, 0.08, 0.2, 0.08, col(0xe6e0d2)); gb.pyramid(cx, B + 0.7, y + 0.25, 0.1, 0.12, 0.1, col(0x5a4a3a));
      gb.box(cx, B + 0.84, y + 0.25, 0.012, 0.08, 0.012, C.black); gb.box(cx, B + 0.87, y + 0.25, 0.05, 0.012, 0.012, C.black);
      // hroby pribúdajú, ako sa cintorín plní
      const total = 44, shown = Math.max(4, Math.round(total * f));
      let n = 0;
      for (let row = 0; row < 11 && n < shown; row++) for (let side = 0; side < 2 && n < shown; side++) for (let c = 0; c < 2 && n < shown; c++, n++) {
        const gx = side ? cx + 0.25 + c * 0.32 : cx - 0.25 - c * 0.32, gz = y + 0.8 + row * 0.1;
        if (gz > y + 1.9) break;
        gb.box(gx, B, gz, 0.12, 0.012, 0.06, col(0x4a6a3a));
        gb.box(gx, B, gz - 0.03, 0.08, 0.06 + ((row + c) % 3) * 0.015, 0.015, (row + c + side) % 4 ? col(0x9a9894) : col(0x5a5a5e));
        if ((row * 3 + c + side) % 5 === 0) gb.box(gx + 0.04, B + 0.012, gz + 0.01, 0.015, 0.015, 0.015, C.red, { glow: [1.6, 0.5, 0.1] });
      }
      for (const [tx, tz] of [[x + 0.15, y + 0.2], [x + 1.85, y + 0.2], [x + 0.15, y + 1.8], [x + 1.85, y + 1.8]]) {
        gb.cyl(tx, B, tz, 0.016, 0.06, col(0x5a3a2a), 4); gb.cyl(tx, B + 0.05, tz, 0.06, 0.45, col(0x2f5a2a), 6, 0);
      }
      return true;
    }
    case 'crematorium': {
      gb.box(cx, B, cz - 0.2, 1.3, 0.4, 0.9, col(0xd8d2c4), { top: C.roofGray });
      gb.windows(cx, B, cz - 0.2, 1.3, 0.4, 0.9, 1, r, { lit: 0.4, segs: 4 });
      for (let k = 0; k < 6; k++) gb.cyl(cx - 0.5 + k * 0.2, B, cz + 0.3, 0.03, 0.36, C.white, 6);
      gb.box(cx, B + 0.36, cz + 0.3, 1.2, 0.05, 0.12, col(0xd8d2c4));
      gb.cyl(cx + 0.5, B, cz - 0.55, 0.06, 0.95, col(0x8a8a8a), 8, 0.05, { top: C.black });
      emit.push([cx + 0.5, B + 0.98, cz - 0.55, 1, 0.35]);
      for (const ox of [-0.7, 0.7]) trees(gb, w, Math.floor(cx + ox), y + 1, 1, b.id + ox * 10, 1);
      gb.box(cx, B, cz + 0.75, 1.0, 0.012, 0.3, C.path);
      return true;
    }
    case 'station': {
      // na ktorej strane je trať?
      let side = 2;
      const has = (tx, ty) => w.inb(tx, ty) && w.rail[w.ti(tx, ty)];
      for (let k = 0; k < s; k++) {
        if (has(x + k, y + s)) side = 2; else if (has(x + k, y - 1)) side = 0; else if (has(x + s, y + k)) side = 1; else if (has(x - 1, y + k)) side = 3; else continue;
        break;
      }
      const alongX = side === 0 || side === 2;
      const sgn = side === 2 || side === 1 ? 1 : -1;
      // nástupište
      const px = alongX ? cx : cx + sgn * 0.75, pz = alongX ? cz + sgn * 0.75 : cz;
      gb.box(px, B, pz, alongX ? 1.96 : 0.46, 0.07, alongX ? 0.46 : 1.96, C.concrete, { top: col(0xcfcac0) });
      gb.box(alongX ? px : px + sgn * 0.2, B + 0.07, alongX ? pz + sgn * 0.2 : pz, alongX ? 1.96 : 0.03, 0.002, alongX ? 0.03 : 1.96, C.yellow);
      // prístrešok
      for (let k = 0; k < 4; k++) { const t = -0.75 + k * 0.5; gb.box(alongX ? px + t : px - sgn * 0.05, B + 0.07, alongX ? pz - sgn * 0.05 : pz + t, 0.025, 0.28, 0.025, C.darkMetal); }
      gb.box(alongX ? px : px - sgn * 0.02, B + 0.35, alongX ? pz - sgn * 0.02 : pz, alongX ? 1.9 : 0.42, 0.03, alongX ? 0.42 : 1.9, col(0x3f6a8a));
      for (let k = 0; k < 3; k++) { const t = -0.6 + k * 0.6; lamp(gb, alongX ? px + t + 0.25 : px + sgn * 0.12, B + 0.07, alongX ? pz + sgn * 0.12 : pz + t + 0.25); }
      // staničná budova s hodinami
      const bx = alongX ? cx : cx - sgn * 0.35, bz = alongX ? cz - sgn * 0.35 : cz;
      gb.box(bx, B, bz, alongX ? 1.3 : 0.9, 0.42, alongX ? 0.9 : 1.3, C.brick, { top: C.roofGray });
      gb.windows(bx, B, bz, alongX ? 1.3 : 0.9, 0.42, alongX ? 0.9 : 1.3, 2, r, { lit: 0.7, segs: 4 });
      gb.gable(bx, B + 0.42, bz, alongX ? 1.3 : 0.9, 0.2, alongX ? 0.9 : 1.3, col(0x4a3a30), C.brick, alongX ? 'x' : 'z');
      gb.box(bx, B + 0.42, bz, 0.2, 0.42, 0.2, C.brick); gb.pyramid(bx, B + 0.84, bz, 0.26, 0.2, 0.26, col(0x3f6a5a));
      for (const [ox, oz] of [[0, 0.101], [0, -0.101], [0.101, 0], [-0.101, 0]]) gb.box(bx + ox, B + 0.66, bz + oz, ox ? 0.004 : 0.12, 0.12, oz ? 0.004 : 0.12, C.white, { glow: [1.4, 1.3, 1.0] });
      bench(gb, alongX ? px - 0.4 : px, B + 0.07, alongX ? pz : pz - 0.4, alongX);
      return true;
    }
  }
  return false;
}
