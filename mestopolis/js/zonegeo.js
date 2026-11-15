// Mestopolis – modely zónových budov (veľa typov na každú úroveň) a staveniská
import { FLOOR, HS, zoneKind } from './config.js';
import { col, shade, mix } from './geom.js';
import { rng } from './noise.js';
import { trees, beam } from './buildgeo.js';

const Z0 = [0, 0, 0];
const C = {
  asphalt: col(0x3d4046), concrete: col(0xb9b5aa), darkConc: col(0x86827a), grass: col(0x5f9b3c),
  white: col(0xeeeeea), black: col(0x1d1d1f), metal: col(0x9aa3ab), darkMetal: col(0x5d646b),
  glass: col(0x2b3a4a), glassBlue: col(0x3d6f9a), brick: col(0xa0523d), brickDark: col(0x7c3b2b),
  red: col(0xc8352b), yellow: col(0xe9c23d), blue: col(0x2f5fa8), orange: col(0xd9792b), trunk: col(0x6b4a2b),
  water: col(0x3f86c4), dirt: col(0x8a6a48), dirtDark: col(0x6e5238), sand: col(0xc9b48a), wood: col(0xa07a4a),
  roofGray: col(0x5f6670), green: col(0x2f8a4f), rubbleC: col(0x7b6f63),
};
const WALLS_R = [0xe8dcc0, 0xd9c7a3, 0xc9d6c3, 0xe2c5b5, 0xc7cbd6, 0xf0e6d2, 0xd8b98f, 0xbfd1d8, 0xe9d3a5, 0xd6b0a0].map(col);
const ROOFS = [0xa3402e, 0x6d4c3a, 0x5f6670, 0x7a3a2c, 0x3f5a6b, 0x8a5a3c, 0x4b6b4a, 0x2f3a4a].map(col);
const APT = [0xcfc6b5, 0xb8a58c, 0xa9b4bd, 0xd4b8a0, 0x9fa89a, 0xc2b2a3, 0xb7c0a8, 0xc9aaa0].map(col);
const PASTEL = [0xf0c987, 0xe89c8a, 0x9fd0c4, 0xa8c4e0, 0xe8e0a0, 0xc9a8d8, 0xf2b6a0].map(col);
const COMW = [0xd8d2c4, 0x9fb5c4, 0xc9c0a8, 0x8ea1b0, 0xb7a58f, 0xe0d6c8, 0xa8b8a0].map(col);
const AWN = [0xd0402f, 0x2f7d4f, 0x2f5fa8, 0xe0a224, 0x8a3f9a, 0x1f8a8a].map(col);
const INDW = [0x9b9381, 0x8a8f93, 0xa48b6d, 0x7f8778, 0xb0a48c, 0x8d6e5a].map(col);
const TOWER = [0x5b7d99, 0x47657d, 0x6e8a8f, 0x7b8796, 0x4d6a6a, 0x8c94a0, 0x9fb0c0, 0x6a7f9a].map(col);
const CARC = [0xc8352b, 0x2f5fa8, 0xeeeeea, 0x2b2b2b, 0xe0a224, 0x3d8a4a, 0x8a8f96, 0x6a2f8a].map(col);
const CONTAINER = [0xc8352b, 0x2f5fa8, 0xd9792b, 0x2f8a4f, 0xe9c23d, 0x8a8f96, 0x6a2f8a].map(col);
const NEON = [[2.2, 0.25, 0.25], [0.3, 1.5, 2.4], [2.4, 1.8, 0.3], [0.4, 2.2, 0.7], [2.0, 0.4, 1.8]];

// počet typov budov: [druh][úroveň]
const NT = [null, [0, 6, 5, 5, 4, 4], [0, 5, 4, 4, 4, 4], [0, 4, 4, 3, 3, 0]];

// opis budovy (rovnaký pre hotovú budovu aj pre stavenisko)
export function spec(k, L, v, x, y) {
  const r = rng(v * 7919 + x * 31 + y * 17 + L * 101);
  const type = v % (NT[k][L] || 1);
  let floors = 1;
  if (k === 1) floors = [0, 1, 2, 4 + ((r() * 3) | 0), 7 + ((r() * 5) | 0), 14 + ((r() * 10) | 0)][L];
  else if (k === 2) floors = [0, 1, 2, 4 + ((r() * 4) | 0), 10 + ((r() * 7) | 0), 20 + ((r() * 14) | 0)][L];
  return { r, type, floors, L, k };
}

// ---------- pomocné prvky ----------
function carAt(gb, x, y, z, color, alongX) {
  const l = 0.15, wd = 0.08;
  gb.box(x, y, z, alongX ? l : wd, 0.045, alongX ? wd : l, color);
  gb.box(x, y + 0.045, z, alongX ? 0.08 : 0.07, 0.035, alongX ? 0.07 : 0.08, shade(color, 0.85), { top: C.glass });
}
function parking(gb, r, cx, cz, B, w, d, dull, density = 0.65) {
  gb.box(cx, B, cz, w, 0.012, d, dull(C.asphalt));
  const n = Math.floor(w / 0.16);
  for (let k = 0; k <= n; k++) gb.box(cx - w / 2 + 0.02 + k * 0.16, B + 0.0125, cz, 0.01, 0.001, d * 0.9, C.white);
  for (let k = 0; k < n; k++) if (r() < density) carAt(gb, cx - w / 2 + 0.1 + k * 0.16, B + 0.012, cz, CARC[(r() * 8) | 0], false);
}
function neonSign(gb, r, x, y, z, w, h, d, extra = 1) {
  const g = NEON[(r() * NEON.length) | 0].map(v => v * 0.55);
  gb.box(x, y, z, w, h, d, C.white, { glow: g.map(v => v * extra) });
}
function roofProps(gb, r, cx, y, cz, w, d, n = 2) {
  for (let k = 0; k < n; k++) {
    const px = cx + (r() - 0.5) * w * 0.6, pz = cz + (r() - 0.5) * d * 0.6;
    switch ((r() * 5) | 0) {
      case 0: gb.box(px, y, pz, 0.11, 0.05, 0.08, C.metal); gb.cyl(px, y + 0.05, pz, 0.025, 0.012, C.darkMetal, 6); break;
      case 1:
        for (const [ox, oz] of [[-0.03, -0.03], [0.03, -0.03], [-0.03, 0.03], [0.03, 0.03]]) gb.box(px + ox, y, pz + oz, 0.01, 0.05, 0.01, C.darkMetal);
        gb.cyl(px, y + 0.05, pz, 0.045, 0.06, col(0x8a6a4a), 8); gb.cyl(px, y + 0.11, pz, 0.048, 0.025, col(0x6e5238), 8, 0); break;
      case 2: gb.cyl(px, y, pz, 0.006, 0.22, C.metal, 4); gb.box(px, y + 0.22, pz, 0.02, 0.02, 0.02, C.red, { glow: [2, 0.15, 0.1] }); break;
      case 3: gb.quad([px - 0.1, y + 0.015, pz + 0.06], [px + 0.1, y + 0.015, pz + 0.06], [px + 0.1, y + 0.07, pz - 0.05], [px - 0.1, y + 0.07, pz - 0.05], col(0x223a6b), [0.02, 0.04, 0.1], [0, 1, 0.5]); break;
      default: gb.box(px, y, pz, 0.1, 0.07, 0.1, shade(C.concrete, 0.85)); break;
    }
  }
}
function balconies(gb, r, cx, B, cz, w, d, floors, color, per = 2, fh = 0.1) {
  const slab = shade(color, 0.9), rail = col(0xdad8d0);
  for (let f = 1; f < floors; f++) {
    const y = B + f * fh;
    for (let j = 0; j < per; j++) {
      const t = (j + 0.5) / per - 0.5;
      gb.box(cx + t * w * 0.8, y, cz + d / 2 + 0.025, 0.14, 0.012, 0.05, slab);
      gb.box(cx + t * w * 0.8, y + 0.012, cz + d / 2 + 0.048, 0.14, 0.035, 0.006, rail);
      gb.box(cx + w / 2 + 0.025, y, cz + t * d * 0.8, 0.05, 0.012, 0.14, slab);
      gb.box(cx + w / 2 + 0.048, y + 0.012, cz + t * d * 0.8, 0.006, 0.035, 0.14, rail);
    }
  }
}
function sphere(gb, x, y, z, r, color, seg = 10) {
  gb.lathe(x, y, z, [[0.001, 0], [r * 0.6, r * 0.2], [r * 0.92, r * 0.55], [r, r], [r * 0.92, r * 1.45], [r * 0.6, r * 1.8], [0.001, r * 2]], color, seg);
}
function stack(gb, emit, x, B, z, r, h, color, rate = 0.4, steam = 0) {
  gb.cyl(x, B, z, r, h, color, 8, r * 0.78, { top: C.black });
  gb.cyl(x, B + h * 0.6, z, r * 0.92, h * 0.1, C.red, 8, r * 0.9, { noCap: true });
  if (emit && rate > 0) emit.push([x, B + h + 0.03, z, steam, rate]);
}
function tank(gb, x, B, z, r, h, color) {
  gb.cyl(x, B, z, r, h, color, 12);
  gb.cyl(x, B + h, z, r * 1.02, 0.05, shade(color, 0.85), 12, 0);
  gb.box(x + r * 0.95, B, z, 0.012, h, 0.03, C.darkMetal);
}
function pad(gb, cx, cz, B, color, w = 0.96, d = 0.96) { gb.box(cx, B, cz, w, 0.012, d, color); return B + 0.014; }

// ---------- budovy typu dom ----------
function houseGeo(gb, r, cx, cz, B, o) {
  const { w, d, h, wall, roof, rt = 'gable', axis = 'x', floors = 1, lit = 0.4, rh = 0.17 } = o;
  gb.box(cx, B, cz, w, h, d, wall);
  gb.windows(cx, B, cz, w, h, d, floors, r, { lit, segs: o.segs || (w > 0.5 ? 2 : 1) });
  if (rt === 'gable') gb.gable(cx, B + h, cz, w, rh, d, roof, wall, axis);
  else if (rt === 'hip') gb.pyramid(cx, B + h, cz, w + 0.08, rh, d + 0.08, roof);
  else gb.box(cx, B + h, cz, w + 0.04, 0.025, d + 0.04, shade(wall, 0.78));
  if (o.chim) gb.box(cx + w * 0.22, B + h + rh * 0.3, cz - d * 0.1, 0.05, rh * 0.8 + 0.06, 0.05, col(0x8a5a44));
  if (o.door !== false) gb.box(cx, B, cz + d / 2 + 0.004, 0.055, 0.1, 0.01, col(0x5a3a2a));
  if (o.porch) {
    gb.box(cx, B + 0.11, cz + d / 2 + 0.06, 0.2, 0.014, 0.12, shade(roof, 0.9));
    gb.box(cx - 0.08, B, cz + d / 2 + 0.1, 0.015, 0.11, 0.015, C.white);
    gb.box(cx + 0.08, B, cz + d / 2 + 0.1, 0.015, 0.11, 0.015, C.white);
  }
}

// ---------- veže / bloky ----------
function crown(gb, r, cx, y, cz, w, d, kind, wall, glass) {
  switch (kind) {
    case 'spire':
      gb.box(cx, y, cz, w * 0.4, 0.1, d * 0.4, shade(wall, 0.8));
      gb.cyl(cx, y + 0.1, cz, 0.02, 0.5, C.metal, 6, 0.004);
      gb.box(cx, y + 0.6, cz, 0.03, 0.03, 0.03, C.red, { glow: [2.5, 0.2, 0.15] }); break;
    case 'pyramid': gb.pyramid(cx, y, cz, w, 0.26, d, shade(glass, 1.1)); gb.cyl(cx, y + 0.26, cz, 0.008, 0.18, C.metal, 4); break;
    case 'dome': gb.lathe(cx, y, cz, [[w * 0.45, 0], [w * 0.42, 0.06], [w * 0.32, 0.13], [w * 0.15, 0.19], [0.001, 0.21]], col(0x7fb3c8), 12); break;
    case 'ring':
      gb.box(cx, y, cz, w * 0.8, 0.03, d * 0.8, shade(wall, 0.7));
      gb.box(cx, y + 0.03, cz, w * 0.86, 0.03, d * 0.86, C.white, { glow: [0.3, 1.8, 2.2] });
      gb.cyl(cx, y + 0.06, cz, 0.012, 0.3, C.metal, 4); gb.box(cx, y + 0.36, cz, 0.025, 0.025, 0.025, C.red, { glow: [2.5, 0.2, 0.15] }); break;
    case 'machine':
      gb.box(cx, y, cz, w * 0.5, 0.1, d * 0.5, shade(wall, 0.7)); roofProps(gb, r, cx, y + 0.1, cz, w * 0.5, d * 0.5, 2);
      gb.cyl(cx, y + 0.1, cz, 0.008, 0.25, C.metal, 4); break;
    default: roofProps(gb, r, cx, y, cz, w, d, 2);
  }
}
function roundTier(gb, r, cx, y, cz, rad, floors, glass, wall, lit, warm) {
  for (let f = 0; f < floors; f++) {
    const on = r() < lit + 0.15;
    const g = on ? warm.map(v => v * (0.55 + r() * 0.5)) : Z0;
    gb.cyl(cx, y + f * FLOOR, cz, rad, FLOOR * 0.74, glass, 14, null, { glow: g, noCap: true });
    gb.cyl(cx, y + f * FLOOR + FLOOR * 0.74, cz, rad + 0.008, FLOOR * 0.26, wall, 14, null, { top: shade(wall, 0.8) });
  }
}
// o: w,d,floors,wall,glass,lit,warm,segs,tiers:[[podiel,mierka]],crown,round,pillars
function tower(gb, r, cx, B, cz, o) {
  const tiers = o.tiers || [[1, 1]];
  const lit = o.lit ?? 0.5, warm = o.warm || [1, 0.8, 0.45];
  const glass = o.glass || C.glass;
  let y = B, used = 0;
  tiers.forEach(([frac, sc], ti) => {
    const f = ti === tiers.length - 1 ? Math.max(1, o.floors - used) : Math.max(1, Math.round(o.floors * frac));
    used += f;
    const ww = o.w * sc, dd = o.d * sc, h = f * FLOOR;
    if (o.round) roundTier(gb, r, cx, y, cz, (o.w / 2) * sc, f, glass, o.wall, lit, warm);
    else {
      gb.box(cx, y, cz, ww, h, dd, o.wall, { top: shade(o.wall, 0.75) });
      gb.windows(cx, y, cz, ww, h, dd, f, r, { lit, segs: o.segs || 3, glass, warm });
      if (o.pillars) for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(cx + sx * ww / 2, y, cz + sz * dd / 2, 0.03, h, 0.03, shade(o.wall, 1.12));
    }
    y += h;
    if (ti < tiers.length - 1) gb.box(cx, y, cz, ww + 0.03, 0.012, dd + 0.03, shade(o.wall, 0.7));
  });
  const last = tiers[tiers.length - 1][1];
  crown(gb, r, cx, y, cz, o.w * last, o.d * last, o.crown || 'none', o.wall, glass);
  return y;
}
function twin(gb, r, cx, B, cz, o) {
  const off = o.gap ?? 0.2;
  const h = o.floors * FLOOR;
  tower(gb, r, cx - off, B, cz, { ...o, w: o.w, d: o.d });
  tower(gb, r, cx + off, B, cz, { ...o, w: o.w, d: o.d, floors: Math.max(3, Math.round(o.floors * (o.second || 0.85))) });
  const by = B + h * (o.bridgeAt || 0.6);
  gb.box(cx, by, cz, off * 2 - o.w, 0.05, o.d * 0.4, shade(o.wall, 0.9), { glow: [0.4, 0.35, 0.2] });
}

// =====================================================================
//  BÝVANIE
// =====================================================================
function resBuilding(gb, S, c) {
  const { r, type, floors, L } = S, { cx, cz, emit, dull, lit, w, x, y } = c;
  const pk = a => dull(a[Math.floor(r() * a.length)]);
  let B = c.B;
  B = pad(gb, cx, cz, B, dull(L <= 2 ? C.grass : C.concrete));
  const wall = pk(WALLS_R), roof = pk(ROOFS);
  const house = (px, pz, o) => houseGeo(gb, r, px, pz, B, { lit, wall, roof, ...o });
  const ox = (r() - 0.5) * 0.1, oz = (r() - 0.5) * 0.08;

  if (L === 1) {
    switch (type) {
      case 0: house(cx + ox, cz + oz, { w: 0.44, d: 0.36, h: 0.19, axis: r() < 0.5 ? 'x' : 'z', chim: true, porch: true }); break;
      case 1: house(cx + ox, cz + oz, { w: 0.5, d: 0.42, h: 0.18, rt: 'hip', rh: 0.15, chim: r() < 0.5 }); break;
      case 2:
        house(cx - 0.1, cz, { w: 0.34, d: 0.38, h: 0.2, axis: 'z', chim: true });
        gb.box(cx + 0.19, B, cz + 0.02, 0.2, 0.13, 0.3, shade(wall, 0.95));
        gb.box(cx + 0.19, B + 0.13, cz + 0.02, 0.22, 0.02, 0.32, shade(roof, 0.8));
        gb.box(cx + 0.19, B, cz + 0.175, 0.14, 0.09, 0.01, col(0xcfd2d6));
        carAt(gb, cx + 0.19, B, cz + 0.33, CARC[(r() * 8) | 0], false); break;
      case 3: { // statok: dom + stodola + silo
        house(cx - 0.17, cz - 0.15, { w: 0.3, d: 0.26, h: 0.17, rh: 0.13, chim: true });
        gb.box(cx + 0.18, B, cz + 0.1, 0.34, 0.2, 0.3, col(0xa33a2c));
        gb.gable(cx + 0.18, B + 0.2, cz + 0.1, 0.34, 0.16, 0.3, col(0x5f4636), col(0xa33a2c), 'z');
        gb.box(cx + 0.18, B, cz + 0.255, 0.12, 0.13, 0.01, C.white);
        gb.cyl(cx + 0.36, B, cz - 0.22, 0.06, 0.3, C.metal, 8); gb.cyl(cx + 0.36, B + 0.3, cz - 0.22, 0.062, 0.04, shade(C.metal, 0.8), 8, 0);
        for (let k = 0; k < 4; k++) gb.box(cx - 0.3 + k * 0.1, B, cz + 0.32, 0.05, 0.015, 0.2, col(k % 2 ? 0x8fa84a : 0xb8c060));
        break; }
      case 4:
        gb.box(cx - 0.08, B, cz, 0.34, 0.14, 0.36, wall);
        gb.box(cx + 0.1, B, cz - 0.04, 0.26, 0.26, 0.3, shade(wall, 0.9));
        gb.windows(cx - 0.08, B, cz, 0.34, 0.14, 0.36, 1, r, { lit, segs: 2, glass: C.glassBlue });
        gb.windows(cx + 0.1, B, cz - 0.04, 0.26, 0.26, 0.3, 2, r, { lit, segs: 2, glass: C.glassBlue });
        gb.box(cx - 0.08, B + 0.14, cz, 0.38, 0.02, 0.4, C.white); gb.box(cx + 0.1, B + 0.26, cz - 0.04, 0.3, 0.02, 0.34, C.white);
        gb.box(cx + 0.05, B, cz + 0.33, 0.26, 0.01, 0.12, C.water, { glow: [0.05, 0.2, 0.32] }); break;
      default: { // dom s vikierom
        house(cx + ox, cz + oz, { w: 0.46, d: 0.38, h: 0.2, chim: true });
        const dz = cz + oz + 0.38 * 0.18;
        gb.box(cx + ox, B + 0.2, dz, 0.12, 0.07, 0.1, wall); gb.gable(cx + ox, B + 0.27, dz, 0.12, 0.07, 0.1, roof, wall, 'z', 0.012);
        gb.box(cx + ox, B + 0.22, dz + 0.052, 0.05, 0.035, 0.005, C.glass); break; }
    }
    if (r() < 0.6) trees(gb, w, x, y, 1, c.seed + 99, 0.8);
    if (r() < 0.3 && type !== 2) carAt(gb, cx + 0.3, B, cz + 0.36, CARC[(r() * 8) | 0], true);
    return;
  }
  if (L === 2) {
    switch (type) {
      case 0:
        for (const s of [-1, 1]) {
          gb.box(cx + s * 0.2, B, cz, 0.36, 0.38, 0.5, s < 0 ? wall : pk(WALLS_R));
          gb.windows(cx + s * 0.2, B, cz, 0.36, 0.38, 0.5, 2, r, { lit, segs: 1 });
        }
        gb.gable(cx, B + 0.38, cz, 0.76, 0.2, 0.5, roof, wall, 'x'); break;
      case 1: // radovka
        for (let k = 0; k < 3; k++) {
          const wc = pk(WALLS_R), px = cx - 0.26 + k * 0.26, hh = 0.34 + (k === 1 ? 0.04 : 0);
          gb.box(px, B, cz, 0.25, hh, 0.5, wc);
          gb.windows(px, B, cz, 0.25, hh, 0.5, 2, r, { lit, segs: 1 });
          gb.gable(px, B + hh, cz, 0.25, 0.13, 0.5, pk(ROOFS), wc, 'z', 0.01);
          gb.box(px, B, cz + 0.255, 0.05, 0.09, 0.01, col(0x5a3a2a));
        } break;
      case 2: // vila
        gb.box(cx, B, cz, 0.62, 0.4, 0.5, wall);
        gb.windows(cx, B, cz, 0.62, 0.4, 0.5, 2, r, { lit, segs: 3 });
        gb.pyramid(cx, B + 0.4, cz, 0.72, 0.2, 0.6, roof);
        for (const s of [-0.2, -0.07, 0.07, 0.2]) gb.cyl(cx + s, B, cz + 0.3, 0.018, 0.22, C.white, 6);
        gb.box(cx, B + 0.22, cz + 0.3, 0.5, 0.02, 0.12, C.white);
        gb.box(cx, B, cz + 0.4, 0.68, 0.03, 0.02, shade(C.grass, 0.7)); break;
      case 3: // L-dom
        gb.box(cx - 0.08, B, cz + 0.06, 0.5, 0.34, 0.3, wall); gb.windows(cx - 0.08, B, cz + 0.06, 0.5, 0.34, 0.3, 2, r, { lit, segs: 2 });
        gb.gable(cx - 0.08, B + 0.34, cz + 0.06, 0.5, 0.17, 0.3, roof, wall, 'x');
        gb.box(cx + 0.2, B, cz - 0.12, 0.3, 0.34, 0.4, wall); gb.windows(cx + 0.2, B, cz - 0.12, 0.3, 0.34, 0.4, 2, r, { lit, segs: 2 });
        gb.gable(cx + 0.2, B + 0.34, cz - 0.12, 0.3, 0.15, 0.4, roof, wall, 'z'); break;
      default: // malý bytový dom
        gb.box(cx, B, cz, 0.62, 0.44, 0.5, wall, { top: shade(wall, 0.8) });
        gb.windows(cx, B, cz, 0.62, 0.44, 0.5, 3, r, { lit, segs: 3 });
        gb.box(cx + 0.2, B + 0.44, cz - 0.1, 0.14, 0.09, 0.14, shade(wall, 0.7));
        balconies(gb, r, cx, B, cz, 0.62, 0.5, 3, wall, 2, 0.147);
    }
    if (r() < 0.5) trees(gb, w, x, y, 1, c.seed + 5, 0.8);
    return;
  }
  // L3+ : bloky a veže
  const wallA = pk(APT);
  if (L === 3) {
    const f = floors;
    switch (type) {
      case 0: // balkónový blok
        gb.box(cx, B, cz, 0.74, f * 0.1, 0.62, wallA, { top: shade(wallA, 0.8) });
        gb.windows(cx, B, cz, 0.74, f * 0.1, 0.62, f, r, { lit, segs: 3 });
        balconies(gb, r, cx, B - 0.01, cz, 0.74, 0.62, f, wallA, 3, 0.1);
        roofProps(gb, r, cx, B + f * 0.1, cz, 0.74, 0.62, 2); break;
      case 1: // blok so sedlovou strechou
        gb.box(cx, B, cz, 0.76, f * 0.1, 0.56, col(0xb86a52));
        gb.windows(cx, B, cz, 0.76, f * 0.1, 0.56, f, r, { lit, segs: 4 });
        gb.gable(cx, B + f * 0.1, cz, 0.76, 0.2, 0.56, pk(ROOFS), col(0xb86a52), 'x');
        for (const t of [-0.22, 0, 0.22]) { gb.box(cx + t, B + f * 0.1, cz + 0.16, 0.1, 0.07, 0.08, col(0xb86a52)); gb.gable(cx + t, B + f * 0.1 + 0.07, cz + 0.16, 0.1, 0.06, 0.08, roof, col(0xb86a52), 'z', 0.01); } break;
      case 2: { // blok okolo nádvoria
        const h = f * 0.1;
        for (const [px, pz, ww, dd] of [[cx, cz - 0.3, 0.84, 0.24], [cx - 0.3, cz + 0.08, 0.24, 0.5], [cx + 0.3, cz + 0.08, 0.24, 0.5]]) {
          gb.box(px, B, pz, ww, h, dd, wallA, { top: shade(wallA, 0.8) }); gb.windows(px, B, pz, ww, h, dd, f, r, { lit, segs: 3 });
        }
        gb.box(cx, B + 0.001, cz + 0.08, 0.32, 0.012, 0.5, C.grass); trees(gb, w, x, y, 1, c.seed + 8, 0.9); break; }
      case 3: // terasový blok
        for (let k = 0; k < 3; k++) {
          const h = Math.max(2, f - k * 2) * 0.1, pz = cz - 0.26 + k * 0.26;
          gb.box(cx, B, pz, 0.74, h, 0.26, k % 2 ? shade(wallA, 1.08) : wallA, { top: shade(wallA, 0.8) });
          gb.windows(cx, B, pz, 0.74, h, 0.26, Math.round(h / 0.1), r, { lit, segs: 4 });
          gb.box(cx, B + h, pz + 0.12, 0.74, 0.02, 0.02, C.white);
        } break;
      default: { // panelák
        const wide = r() < 0.5, ww = wide ? 0.84 : 0.34, dd = wide ? 0.34 : 0.84, pc = pk(PASTEL), acc = pk(PASTEL);
        const h = (f + 1) * 0.1;
        gb.box(cx, B, cz, ww, h, dd, pc, { top: shade(pc, 0.7) });
        gb.windows(cx, B, cz, ww, h, dd, f + 1, r, { lit, segs: 5 });
        for (let k = 0; k < 4; k++) {
          const t = (k + 0.5) / 4 - 0.5;
          if (wide) { gb.box(cx + t * ww * 0.9, B, cz + dd / 2 + 0.008, 0.07, h, 0.012, acc); gb.box(cx + t * ww * 0.9, B, cz - dd / 2 - 0.008, 0.07, h, 0.012, acc); }
          else { gb.box(cx + ww / 2 + 0.008, B, cz + t * dd * 0.9, 0.012, h, 0.07, acc); gb.box(cx - ww / 2 - 0.008, B, cz + t * dd * 0.9, 0.012, h, 0.07, acc); }
        }
        gb.box(cx, B + h, cz, ww * 0.3, 0.05, dd * 0.3, shade(pc, 0.6));
        // detské ihrisko
        const px = wide ? cx : cx + 0.34, pz = wide ? cz + 0.34 : cz;
        gb.box(px, B, pz, 0.12, 0.01, 0.12, C.sand); gb.box(px + 0.03, B, pz, 0.025, 0.06, 0.025, CONTAINER[(r() * 7) | 0]); gb.box(px - 0.03, B, pz, 0.025, 0.04, 0.025, CONTAINER[(r() * 7) | 0]);
        trees(gb, w, x, y, 1, c.seed + 2, 0.8); }
    }
    return;
  }
  if (L === 4) {
    const o = { w: 0.74, d: 0.5, floors, wall: wallA, lit, segs: 4, glass: C.glass };
    switch (type) {
      case 0: tower(gb, r, cx, B, cz, { ...o, w: 0.82, d: 0.4, crown: 'machine' }); break;
      case 1: tower(gb, r, cx, B, cz, { ...o, w: 0.6, d: 0.6, tiers: [[0.7, 1], [0.3, 0.72]], crown: 'machine', pillars: true }); break;
      case 2:
        gb.box(cx, B, cz, 0.9, 0.1, 0.9, shade(wallA, 0.85)); gb.windows(cx, B, cz, 0.9, 0.1, 0.9, 1, r, { lit, segs: 5 });
        for (const s of [-1, 1]) tower(gb, r, cx + s * 0.22, B + 0.1, cz, { ...o, w: 0.32, d: 0.5, floors: floors - 2 + (s > 0 ? 0 : -1), segs: 2, crown: 'machine' }); break;
      default: tower(gb, r, cx, B, cz, { ...o, w: 0.62, d: 0.62, round: true, crown: 'machine', glass: C.glassBlue });
    }
    return;
  }
  // L5
  const o = { w: 0.6, d: 0.6, floors, wall: wallA, lit, segs: 3, glass: C.glass, pillars: true };
  switch (type) {
    case 0: tower(gb, r, cx, B, cz, { ...o, tiers: [[0.55, 1], [0.3, 0.78], [0.15, 0.55]], crown: 'pyramid' }); break;
    case 1: twin(gb, r, cx, B, cz, { ...o, w: 0.3, d: 0.4, segs: 2, gap: 0.2, crown: 'machine' }); break;
    case 2: tower(gb, r, cx, B, cz, { ...o, w: 0.62, round: true, crown: 'dome', glass: C.glassBlue }); break;
    default: tower(gb, r, cx, B, cz, { ...o, tiers: [[0.5, 1], [0.25, 0.8], [0.15, 0.6], [0.1, 0.4]], crown: 'spire' });
  }
}

// =====================================================================
//  OBCHOD
// =====================================================================
function comBuilding(gb, S, c) {
  const { r, type, floors, L } = S, { cx, cz, emit, dull, lit, w, x, y } = c;
  const pk = a => dull(a[Math.floor(r() * a.length)]);
  let B = c.B;
  B = pad(gb, cx, cz, B, dull(C.concrete));
  const wall = pk(COMW), aw = pk(AWN);
  const awning = (px, pz, ww, n) => {
    for (let k = 0; k < n; k++) gb.box(px - ww / 2 + (k + 0.5) * (ww / n), B + 0.17, pz, ww / n, 0.025, 0.09, k % 2 ? C.white : aw);
  };
  if (L === 1) {
    switch (type) {
      case 0:
        gb.box(cx, B, cz, 0.72, 0.26, 0.58, wall, { top: C.concrete });
        gb.windows(cx, B, cz, 0.72, 0.26, 0.58, 1, r, { lit: lit * 1.4, segs: 3, warm: [1, 0.85, 0.55] });
        awning(cx, cz + 0.33, 0.72, 6); neonSign(gb, r, cx, B + 0.27, cz + 0.27, 0.4, 0.07, 0.03);
        carAt(gb, cx - 0.28, B, cz + 0.42, CARC[(r() * 8) | 0], false); break;
      case 1: // kaviareň
        gb.box(cx - 0.05, B, cz - 0.14, 0.5, 0.22, 0.34, wall, { top: C.concrete });
        gb.windows(cx - 0.05, B, cz - 0.14, 0.5, 0.22, 0.34, 1, r, { lit: lit * 1.5, segs: 3, warm: [1, 0.8, 0.45] });
        awning(cx - 0.05, cz + 0.06, 0.5, 5);
        for (const [tx, tz] of [[-0.26, 0.28], [0, 0.32], [0.26, 0.28]]) {
          gb.cyl(cx + tx, B, cz + tz, 0.035, 0.04, C.white, 6);
          gb.cyl(cx + tx, B + 0.07, cz + tz, 0.075, 0.035, CONTAINER[(r() * 7) | 0], 8, 0);
          gb.box(cx + tx, B + 0.06, cz + tz, 0.012, 0.012, 0.012, C.white, { glow: [2, 1.7, 1] });
        } break;
      case 2: // čerpacia stanica
        gb.box(cx, B + 0.17, cz + 0.12, 0.62, 0.025, 0.34, C.white, { glow: [0.55, 0.55, 0.6] });
        for (const [px, pz] of [[-0.26, 0], [0.26, 0], [-0.26, 0.24], [0.26, 0.24]]) gb.box(cx + px, B, cz + 0.0 + pz, 0.018, 0.17, 0.018, C.metal);
        for (const px of [-0.1, 0.1]) gb.box(cx + px, B, cz + 0.13, 0.04, 0.08, 0.025, px < 0 ? C.red : C.white);
        gb.box(cx + 0.02, B, cz - 0.28, 0.5, 0.2, 0.2, wall, { top: C.concrete });
        gb.windows(cx + 0.02, B, cz - 0.28, 0.5, 0.2, 0.2, 1, r, { lit: lit * 1.5, segs: 3, warm: [1, 0.95, 0.7] });
        gb.cyl(cx + 0.38, B, cz - 0.06, 0.01, 0.34, C.metal, 4); gb.box(cx + 0.38, B + 0.3, cz - 0.06, 0.1, 0.08, 0.02, C.yellow, { glow: [2.2, 1.7, 0.2] });
        carAt(gb, cx - 0.1, B, cz + 0.16, CARC[(r() * 8) | 0], false); break;
      case 3: // supermarket s parkoviskom
        gb.box(cx, B, cz - 0.24, 0.84, 0.28, 0.42, wall, { top: C.concrete });
        gb.windows(cx, B, cz - 0.24, 0.84, 0.28, 0.42, 1, r, { lit: lit * 1.6, segs: 4, warm: [1, 0.95, 0.75] });
        neonSign(gb, r, cx, B + 0.29, cz - 0.03, 0.46, 0.08, 0.03, 0.9);
        parking(gb, r, cx, cz + 0.26, B, 0.86, 0.38, dull); break;
      default: // rýchle občerstvenie s drive-thru
        gb.box(cx - 0.12, B, cz - 0.1, 0.5, 0.18, 0.36, C.white, { top: aw });
        gb.windows(cx - 0.12, B, cz - 0.1, 0.5, 0.18, 0.36, 1, r, { lit: lit * 1.6, segs: 3, warm: [1, 0.85, 0.5] });
        gb.box(cx - 0.12, B + 0.18, cz - 0.1, 0.54, 0.03, 0.4, aw);
        gb.cyl(cx + 0.2, B, cz - 0.28, 0.012, 0.34, C.metal, 4); gb.cyl(cx + 0.2, B + 0.34, cz - 0.28, 0.07, 0.025, C.yellow, 12, null, { glow: [2.4, 1.8, 0.2] });
        gb.box(cx, B, cz + 0.3, 0.9, 0.012, 0.14, dull(C.asphalt)); carAt(gb, cx - 0.2, B + 0.012, cz + 0.3, CARC[(r() * 8) | 0], true);
    }
    return;
  }
  if (L === 2) {
    switch (type) {
      case 0: // obchodná zástavba
        for (let k = 0; k < 3; k++) {
          const px = cx - 0.26 + k * 0.26, wc = pk(COMW), a2 = pk(AWN);
          gb.box(px, B, cz, 0.25, 0.44, 0.62, wc, { top: C.concrete });
          gb.windows(px, B + 0.0, cz, 0.25, 0.44, 0.62, 2, r, { lit: lit * 1.3, segs: 1, warm: [1, 0.9, 0.6] });
          gb.box(px, B + 0.14, cz + 0.34, 0.25, 0.025, 0.08, a2);
          neonSign(gb, r, px, B + 0.3, cz + 0.32, 0.14, 0.05, 0.02, 0.9);
        } break;
      case 1: tower(gb, r, cx, B, cz, { w: 0.72, d: 0.62, floors: 4, wall: pk(COMW), lit, segs: 4, glass: C.glassBlue, crown: 'machine', pillars: true }); break;
      case 2: // obchodné centrum
        gb.box(cx, B, cz - 0.14, 0.86, 0.22, 0.5, wall, { top: C.concrete });
        gb.windows(cx, B, cz - 0.14, 0.86, 0.22, 0.5, 1, r, { lit: lit * 1.5, segs: 5, warm: [1, 0.95, 0.75] });
        gb.box(cx, B, cz + 0.12, 0.3, 0.3, 0.1, C.glassBlue, { glow: [0.35, 0.55, 0.7] });
        neonSign(gb, r, cx, B + 0.3, cz + 0.12, 0.34, 0.07, 0.03);
        parking(gb, r, cx, cz + 0.34, B, 0.86, 0.26, dull, 0.55); break;
      default: // hotel
        gb.box(cx, B, cz, 0.84, 0.15, 0.74, shade(wall, 0.95)); gb.windows(cx, B, cz, 0.84, 0.15, 0.74, 1, r, { lit, segs: 4, warm: [1, 0.9, 0.6] });
        tower(gb, r, cx, B + 0.15, cz - 0.05, { w: 0.5, d: 0.44, floors: 4, wall: pk(APT), lit, segs: 3, crown: 'none' });
        gb.box(cx, B + 0.15 + 4 * FLOOR, cz - 0.05, 0.36, 0.08, 0.03, C.white, { glow: NEON[1].map(v => v * 0.9) });
        gb.box(cx, B, cz + 0.3, 0.3, 0.02, 0.14, C.red);
    }
    return;
  }
  const o = { w: 0.74, d: 0.68, floors, wall: wall, lit, segs: 4, glass: pk(TOWER), warm: [0.95, 0.9, 0.7] };
  if (L === 3) {
    switch (type) {
      case 0: tower(gb, r, cx, B, cz, { ...o, glass: C.glass, crown: 'machine' }); break;
      case 1: // obchodný dom
        tower(gb, r, cx, B, cz, { ...o, w: 0.84, d: 0.7, floors: Math.min(floors, 5), wall: pk(APT), segs: 5, crown: 'none' });
        neonSign(gb, r, cx, B + Math.min(floors, 5) * FLOOR, cz + 0.2, 0.5, 0.1, 0.03, 1.1); break;
      case 2:
        tower(gb, r, cx, B, cz - 0.2, { ...o, w: 0.8, d: 0.3, floors, crown: 'none' });
        tower(gb, r, cx + 0.25, B, cz + 0.12, { ...o, w: 0.3, d: 0.4, floors: Math.max(3, floors - 2), segs: 2, crown: 'machine' }); break;
      default: tower(gb, r, cx, B, cz, { ...o, glass: C.glassBlue, wall: shade(pk(TOWER), 0.9), pillars: true, crown: 'machine' });
    }
    return;
  }
  if (L === 4) {
    switch (type) {
      case 0: tower(gb, r, cx, B, cz, { ...o, w: 0.82, d: 0.42, crown: 'machine', pillars: true }); break;
      case 1: tower(gb, r, cx, B, cz, { ...o, w: 0.66, d: 0.66, tiers: [[0.55, 1], [0.3, 0.78], [0.15, 0.56]], crown: 'ring', pillars: true }); break;
      case 2: twin(gb, r, cx, B, cz, { ...o, w: 0.32, d: 0.5, segs: 2, gap: 0.2, crown: 'machine' }); break;
      default: tower(gb, r, cx, B, cz, { ...o, w: 0.66, round: true, crown: 'machine', glass: C.glassBlue });
    }
    return;
  }
  switch (type) {
    case 0: tower(gb, r, cx, B, cz, { ...o, w: 0.6, d: 0.6, tiers: [[0.65, 1], [0.35, 0.7]], crown: 'spire', pillars: true }); break;
    case 1: twin(gb, r, cx, B, cz, { ...o, w: 0.3, d: 0.4, segs: 2, gap: 0.2, bridgeAt: 0.7, crown: 'spire' }); break;
    case 2: tower(gb, r, cx, B, cz, { ...o, w: 0.62, round: true, crown: 'dome', glass: C.glassBlue }); break;
    default: tower(gb, r, cx, B, cz, { ...o, w: 0.62, d: 0.62, tiers: [[0.45, 1], [0.25, 0.8], [0.18, 0.6], [0.12, 0.4]], crown: 'ring', pillars: true });
  }
}

// =====================================================================
//  PRIEMYSEL
// =====================================================================
function indBuilding(gb, S, c) {
  const { r, type, L } = S, { cx, cz, emit, dull, lit, w, x, y } = c;
  const pk = a => dull(a[Math.floor(r() * a.length)]);
  let B = c.B;
  B = pad(gb, cx, cz, B, dull(C.darkConc));
  const wall = pk(INDW), warm = [1, 0.6, 0.25], liq = pk([col(0xdfe3e6), col(0xc9d2d8), col(0xd8c9a8), col(0x9fb0a0)]);
  const truck = (px, pz, color) => {
    gb.box(px, B, pz, 0.26, 0.09, 0.1, color); gb.box(px + 0.17, B, pz, 0.09, 0.075, 0.1, C.white, { top: C.glass });
  };
  if (L === 1) {
    switch (type) {
      case 0: // pílová hala
        gb.box(cx, B, cz, 0.8, 0.26, 0.62, wall);
        for (let s = 0; s < 3; s++) gb.gable(cx - 0.26 + s * 0.26, B + 0.26, cz, 0.26, 0.1, 0.62, C.roofGray, wall, 'z', 0);
        for (let s = 0; s < 3; s++) gb.box(cx - 0.3 + s * 0.15, B, cz + 0.38, 0.1, 0.08, 0.1, [C.orange, C.blue, C.red][s]); break;
      case 1: // sklad s rampami
        gb.box(cx, B, cz - 0.12, 0.84, 0.3, 0.5, wall, { top: shade(wall, 0.8) });
        for (let s = 0; s < 3; s++) gb.box(cx - 0.26 + s * 0.26, B, cz + 0.135, 0.15, 0.17, 0.012, C.darkMetal);
        gb.windows(cx, B + 0.18, cz - 0.12, 0.84, 0.12, 0.5, 1, r, { lit: lit * 0.5, segs: 5, warm });
        truck(cx - 0.18, cz + 0.32, pk(CONTAINER)); break;
      case 2: // dielňa s komínom
        gb.box(cx - 0.1, B, cz, 0.56, 0.24, 0.66, wall);
        gb.windows(cx - 0.1, B, cz, 0.56, 0.24, 0.66, 1, r, { lit: lit * 0.7, segs: 3, warm });
        gb.gable(cx - 0.1, B + 0.24, cz, 0.56, 0.1, 0.66, C.roofGray, wall, 'x');
        stack(gb, emit, cx + 0.3, B, cz + 0.2, 0.05, 0.7, C.brick, 0.3);
        for (let k = 0; k < 3; k++) gb.box(cx + 0.3, B, cz - 0.3 + k * 0.1, 0.1, 0.04, 0.08, C.wood); break;
      default: // kontajnerový dvor
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
          const n = 1 + ((r() * 3) | 0);
          for (let k = 0; k < n; k++) gb.box(cx - 0.28 + a * 0.28, B + k * 0.075, cz - 0.28 + b * 0.22 + 0.04, 0.24, 0.07, 0.1, pk(CONTAINER));
        }
        gb.box(cx, B, cz + 0.4, 0.3, 0.1, 0.1, C.darkMetal); break;
    }
    return;
  }
  if (L === 2) {
    switch (type) {
      case 0:
        gb.box(cx - 0.08, B, cz, 0.62, 0.36, 0.7, wall);
        gb.windows(cx - 0.08, B, cz, 0.62, 0.36, 0.7, 1, r, { lit: lit * 0.6, segs: 3, warm });
        stack(gb, emit, cx + 0.32, B, cz + 0.2, 0.06, 0.95, C.brick, 0.3);
        beam(gb, [cx + 0.2, B + 0.36, cz - 0.2], [cx + 0.32, B + 0.3, cz + 0.2], 0.02, C.metal); break;
      case 1: // silá
        gb.box(cx - 0.1, B, cz + 0.25, 0.6, 0.16, 0.3, wall, { top: shade(wall, 0.8) });
        for (let k = 0; k < 3; k++) { gb.cyl(cx - 0.28 + k * 0.2, B, cz - 0.16, 0.085, 0.5, liq, 10); gb.cyl(cx - 0.28 + k * 0.2, B + 0.5, cz - 0.16, 0.088, 0.07, shade(liq, 0.8), 10, 0); }
        beam(gb, [cx - 0.28, B + 0.45, cz - 0.16], [cx + 0.12, B + 0.45, cz - 0.16], 0.015, C.darkMetal); break;
      case 2: // zásobníky
        for (let k = 0; k < 3; k++) tank(gb, cx - 0.22 + (k % 2) * 0.4, B, cz - 0.2 + k * 0.22, 0.14, 0.2 + (k === 1 ? 0.08 : 0), k === 1 ? col(0xb8c4b0) : liq);
        beam(gb, [cx - 0.22, B + 0.1, cz - 0.2], [cx + 0.18, B + 0.1, cz + 0.02], 0.014, C.red);
        gb.box(cx + 0.3, B, cz + 0.36, 0.2, 0.1, 0.1, wall); break;
      default: // tehelňa / mlyn
        gb.box(cx - 0.12, B, cz, 0.6, 0.3, 0.7, col(0x9a5a44));
        gb.windows(cx - 0.12, B, cz, 0.6, 0.3, 0.7, 1, r, { lit: lit * 0.7, segs: 3, warm });
        for (let s = 0; s < 3; s++) gb.gable(cx - 0.3 + s * 0.2, B + 0.3, cz, 0.2, 0.1, 0.7, C.roofGray, col(0x9a5a44), 'z', 0);
        stack(gb, emit, cx + 0.3, B, cz - 0.15, 0.055, 0.8, C.brick, 0.35);
    }
    return;
  }
  if (L === 3) {
    switch (type) {
      case 0: // elektráreň / závod
        gb.box(cx - 0.18, B, cz - 0.05, 0.56, 0.4, 0.75, wall);
        gb.windows(cx - 0.18, B, cz - 0.05, 0.56, 0.4, 0.75, 2, r, { lit: lit * 0.6, segs: 3, warm });
        stack(gb, emit, cx + 0.2, B, cz + 0.3, 0.05, 1.2, C.white, 0.5); stack(gb, emit, cx - 0.35, B, cz + 0.36, 0.05, 1.35, C.brick, 0.5);
        gb.lathe(cx + 0.3, B, cz - 0.25, [[0.17, 0], [0.12, 0.3], [0.1, 0.45], [0.12, 0.58]], col(0xd8d6d0), 12); emit.push([cx + 0.3, B + 0.62, cz - 0.25, 1, 2]); break;
      case 1: // rafinéria
        for (let k = 0; k < 3; k++) { gb.cyl(cx - 0.3 + k * 0.18, B, cz - 0.2, 0.05, 0.7 + k * 0.1, C.metal, 8, 0.045); gb.cyl(cx - 0.3 + k * 0.18, B + 0.35, cz - 0.2, 0.055, 0.03, C.red, 8, 0.055, { noCap: true }); }
        for (let k = 0; k < 3; k++) tank(gb, cx - 0.2 + k * 0.24, B, cz + 0.2, 0.1, 0.18, liq);
        beam(gb, [cx - 0.3, B + 0.3, cz - 0.2], [cx + 0.2, B + 0.3, cz - 0.2], 0.013, C.red);
        gb.cyl(cx + 0.36, B, cz - 0.32, 0.012, 0.9, C.metal, 4); gb.cyl(cx + 0.36, B + 0.9, cz - 0.32, 0.03, 0.08, C.orange, 6, 0, { glow: [3.2, 1.2, 0.2] }); break;
      default: // oceliareň
        gb.box(cx, B, cz - 0.1, 0.88, 0.34, 0.46, wall, { top: shade(wall, 0.7) });
        gb.windows(cx, B, cz - 0.1, 0.88, 0.34, 0.46, 1, r, { lit: 0.8, segs: 6, warm: [1.6, 0.7, 0.2] });
        for (const sx of [-1, 1]) { beam(gb, [cx + sx * 0.38, B, cz + 0.28], [cx + sx * 0.38, B + 0.45, cz + 0.28], 0.02, C.orange); }
        beam(gb, [cx - 0.38, B + 0.45, cz + 0.28], [cx + 0.38, B + 0.45, cz + 0.28], 0.025, C.orange);
        stack(gb, emit, cx + 0.34, B + 0.34, cz - 0.3, 0.07, 0.7, col(0x8d6e5a), 0.6);
        gb.box(cx - 0.3, B + 0.34, cz - 0.1, 0.2, 0.01, 0.2, C.orange, { glow: [2.5, 0.9, 0.2] });
    }
    return;
  }
  switch (type) { // L4
    case 0:
      gb.box(cx - 0.15, B, cz - 0.05, 0.6, 0.5, 0.75, wall);
      gb.windows(cx - 0.15, B, cz - 0.05, 0.6, 0.5, 0.75, 2, r, { lit: lit * 0.6, segs: 3, warm });
      for (let s = 0; s < 3; s++) stack(gb, emit, cx - 0.32 + s * 0.2, B, cz + 0.34, 0.055, 1.3 + s * 0.15, s === 1 ? C.white : C.brick, 0.5);
      gb.cyl(cx + 0.34, B, cz - 0.32, 0.012, 0.8, C.metal, 4); gb.cyl(cx + 0.34, B + 0.8, cz - 0.32, 0.03, 0.08, C.orange, 6, 0, { glow: [3.2, 1.2, 0.2] });
      gb.cyl(cx + 0.32, B, cz + 0.2, 0.12, 0.35, C.metal, 10); break;
    case 1: // chemický závod
      for (let k = 0; k < 3; k++) sphere(gb, cx - 0.25 + k * 0.25, B + 0.1, cz + 0.22, 0.1, pk([col(0xd8d6d0), col(0xc9d8e0)]));
      for (let k = 0; k < 3; k++) { gb.cyl(cx - 0.3 + k * 0.2, B, cz - 0.22, 0.045, 0.8 + (k % 2) * 0.15, C.metal, 8, 0.04); }
      beam(gb, [cx - 0.3, B + 0.4, cz - 0.22], [cx + 0.1, B + 0.4, cz - 0.22], 0.013, C.yellow); beam(gb, [cx - 0.25, B + 0.2, cz + 0.22], [cx - 0.25, B + 0.3, cz - 0.22], 0.012, C.red);
      stack(gb, emit, cx + 0.36, B, cz - 0.1, 0.05, 1.1, C.white, 0.5);
      gb.cyl(cx + 0.36, B, cz + 0.36, 0.012, 0.75, C.metal, 4); gb.cyl(cx + 0.36, B + 0.75, cz + 0.36, 0.03, 0.08, C.orange, 6, 0, { glow: [3.2, 1.2, 0.2] }); break;
    default: // kontajnerový terminál
      for (let a = 0; a < 4; a++) for (let b = 0; b < 2; b++) {
        const n = 2 + ((r() * 3) | 0);
        for (let k = 0; k < n; k++) gb.box(cx - 0.33 + a * 0.22, B + k * 0.075, cz + 0.28 - b * 0.18, 0.2, 0.07, 0.1, pk(CONTAINER));
      }
      for (const sx of [-0.3, 0.3]) for (const sz of [-0.28, -0.06]) beam(gb, [cx + sx, B, cz + sz], [cx + sx, B + 0.6, cz + sz], 0.02, C.orange);
      for (const sz of [-0.28, -0.06]) beam(gb, [cx - 0.34, B + 0.6, cz + sz], [cx + 0.34, B + 0.6, cz + sz], 0.03, C.orange);
      beam(gb, [cx - 0.3, B + 0.6, cz - 0.17], [cx + 0.3, B + 0.6, cz - 0.17], 0.02, C.darkMetal);
      gb.box(cx + 0.05, B + 0.5, cz - 0.17, 0.08, 0.08, 0.08, C.yellow, { glow: [1.4, 1.1, 0.2] });
      gb.box(cx - 0.2, B, cz - 0.4, 0.5, 0.2, 0.14, wall); break;
  }
}

// ---------- hotová zónová budova ----------
export function zoneBuilding(gb, w, x, y, emit) {
  const i = w.ti(x, y), L = w.level[i], k = zoneKind(w.zone[i]), v = w.variant[i];
  const S = spec(k, L, v, x, y);
  const ab = w.abandoned[i];
  const cx = x + 0.5, cz = y + 0.5;
  const mx = w.tileMax(x, y), mn = w.tileMin(x, y);
  const B = mx * HS;
  if (mx !== mn) gb.box(cx, mn * HS - 0.02, cz, 0.94, B - mn * HS + 0.03, 0.94, C.concrete);
  const dull = c => (ab ? mix(c, col(0x5a5148), 0.6) : c);
  const ctx = { cx, cz, B, emit, dull, lit: ab ? 0 : 0.5, w, x, y, seed: v + x * 31 + y * 7 };
  if (k === 1) resBuilding(gb, S, ctx);
  else if (k === 2) comBuilding(gb, S, ctx);
  else indBuilding(gb, S, ctx);
}

// =====================================================================
//  STAVENISKO (výkop -> základy -> skelet -> lešenie -> opláštenie)
// =====================================================================
const OLD_H = { 1: [0, 0.28, 0.52, 0.5, 1.0, 2.0], 2: [0, 0.26, 0.45, 0.6, 1.4, 2.6], 3: [0, 0.28, 0.4, 0.55, 0.7, 0.7] };

// o: cx,cz,B,ww,dd,H,fh (výška poschodia),stage 0..4,wall,from (výška starej budovy alebo 0),seed,emit,crane
function siteCore(gb, r, o) {
  const { cx, cz, B, ww, dd, H, fh, stage, wall, emit } = o;
  const K = o.cell || 1;
  const conc = col(0xa6a39a), prog = [0.1, 0.22, 0.45, 0.75, 1.0][stage];
  const Hs = Math.max(0.05, H * prog);
  // kopaný pozemok
  gb.box(cx, B, cz, 0.96 * K, 0.012, 0.96 * K, C.dirt);
  for (let k = 0; k < 4; k++) gb.box(cx + (r() - 0.5) * 0.7 * K, B + 0.012, cz + (r() - 0.5) * 0.7 * K, 0.14 + r() * 0.12, 0.002, 0.1 + r() * 0.1, C.dirtDark);
  // stará budova (prerábka): zmenšuje sa počas búrania
  if (o.from > 0 && stage < 2) {
    const oh = o.from * (stage === 0 ? 0.85 : 0.4);
    gb.box(cx, B + 0.012, cz, ww * 0.95, oh, dd * 0.95, mix(wall, C.darkConc, 0.4));
    gb.windows(cx, B + 0.012, cz, ww * 0.95, oh, dd * 0.95, Math.max(1, Math.round(oh / fh)), r, { lit: 0, segs: 3 });
    for (let k = 0; k < 5; k++) gb.box(cx + (r() - 0.5) * ww * 0.9, B + 0.012 + oh, cz + (r() - 0.5) * dd * 0.9, 0.05 + r() * 0.06, 0.03 + r() * 0.05, 0.05 + r() * 0.06, C.rubbleC);
  }
  const base = B + 0.012;
  if (stage >= 1 || !(o.from > 0)) {
    if (stage === 0) { // výkop
      gb.box(cx, B + 0.003, cz, ww * 0.9, 0.004, dd * 0.9, C.dirtDark);
    } else {
      gb.box(cx, base, cz, ww * 1.02, 0.03, dd * 1.02, conc, { top: shade(conc, 0.9) });  // základová doska
    }
  }
  // opláštená spodná časť
  const clad = [0, 0, 0.3, 0.55, 0.85][stage] * H;
  if (clad > 0.03) {
    gb.box(cx, base + 0.03, cz, ww, clad, dd, wall, { top: shade(wall, 0.8) });
    gb.windows(cx, base + 0.03, cz, ww, clad, dd, Math.max(1, Math.round(clad / fh)), r, { lit: 0, segs: o.segs || 3 });
  }
  // betónový skelet nad opláštením
  if (stage >= 1) {
    const y0 = base + 0.03 + clad, top = base + 0.03 + Hs;
    if (top > y0 + 0.01) {
      const px = [-1, 1], cols = ww > 0.5 ? [-1, 0, 1] : [-1, 1];
      for (const sx of cols) for (const sz of px) gb.box(cx + sx * ww / 2 * 0.94, y0, cz + sz * dd / 2 * 0.94, 0.035, top - y0, 0.035, conc);
      const step = Math.max(fh, (top - y0) / 6);
      for (let yy = y0 + step; yy <= top + 0.001; yy += step) gb.box(cx, yy - 0.012, cz, ww, 0.016, dd, shade(conc, 1.05));
      gb.box(cx, top - 0.012, cz, ww, 0.016, dd, shade(conc, 1.05));
      // výstuže trčiace nahor
      for (const sx of px) for (const sz of px) gb.box(cx + sx * ww / 2 * 0.94, top, cz + sz * dd / 2 * 0.94, 0.008, 0.07, 0.008, col(0x7a4a3a));
    }
  }
  // lešenie
  if (stage >= 2) {
    const top = base + 0.03 + Hs + 0.03, sw = ww / 2 + 0.05, sd = dd / 2 + 0.05;
    const pole = (px, pz) => gb.box(px, base, pz, 0.012, top - base, 0.012, C.metal);
    for (const sx of [-1, -0.34, 0.34, 1]) { pole(cx + sx * sw, cz + sd); pole(cx + sx * sw, cz - sd); }
    for (const sz of [-1, 1]) { pole(cx + sw, cz + sz * sd * 0.34); pole(cx - sw, cz + sz * sd * 0.34); }
    const stepY = Math.max(fh, 0.1);
    for (let yy = base + stepY; yy <= top; yy += stepY) {
      gb.box(cx, yy, cz + sd, sw * 2, 0.012, 0.03, C.wood); gb.box(cx, yy, cz - sd, sw * 2, 0.012, 0.03, C.wood);
      gb.box(cx + sw, yy, cz, 0.03, 0.012, sd * 2, C.wood); gb.box(cx - sw, yy, cz, 0.03, 0.012, sd * 2, C.wood);
    }
    beam(gb, [cx - sw, base, cz + sd], [cx + sw, top, cz + sd], 0.005, C.metal); beam(gb, [cx + sw, base, cz + sd], [cx + sw, top, cz - sd], 0.005, C.metal);
    // zelená sieť na spodnej časti
    gb.box(cx, base, cz + sd + 0.008, sw * 2, Math.min(top - base, clad + 0.12), 0.004, col(0x3f6a3a));
    gb.box(cx + sw + 0.008, base, cz, 0.004, Math.min(top - base, clad + 0.12), sd * 2, col(0x3f6a3a));
  }
  // oplotenie staveniska
  for (const [fx, fz, fw, fd] of [[0, 0.46 * K, 0.92 * K, 0.012], [0, -0.46 * K, 0.92 * K, 0.012], [0.46 * K, 0, 0.012, 0.92 * K], [-0.46 * K, 0, 0.012, 0.92 * K]]) {
    gb.box(cx + fx, B + 0.014, cz + fz, fw, 0.07, fd, C.orange);
    gb.box(cx + fx, B + 0.06, cz + fz, fw, 0.012, fd, C.white);
  }
  for (const [px, pz] of [[-0.46, -0.46], [0.46, -0.46], [-0.46, 0.46], [0.46, 0.46]]) gb.box(cx + px * K, B, cz + pz * K, 0.015, 0.1, 0.015, C.darkMetal);
  // žeriav alebo stavebné stroje
  if (o.crane) {
    const mx = cx + 0.4 * K, mz = cz - 0.4 * K, mh = Math.max(Hs + 0.3, 0.55) + 0.02, ang = [0.8, 2.3, 3.9, 5.4][(r() * 4) | 0];
    gb.box(mx, base, mz, 0.04, mh, 0.04, C.yellow);
    for (let yy = base + 0.1; yy < base + mh; yy += 0.1) beam(gb, [mx - 0.02, yy, mz - 0.02], [mx + 0.02, yy + 0.1, mz + 0.02], 0.004, C.yellow);
    const jx = Math.cos(ang), jz = Math.sin(ang), top = base + mh;
    beam(gb, [mx - jx * 0.2, top, mz - jz * 0.2], [mx + jx * 0.75, top, mz + jz * 0.75], 0.016, C.yellow);
    gb.box(mx - jx * 0.2, top - 0.05, mz - jz * 0.2, 0.06, 0.06, 0.06, C.darkMetal);
    gb.box(mx, top, mz, 0.06, 0.05, 0.06, C.white);
    const hx = mx + jx * 0.5, hz = mz + jz * 0.5, hy = Math.max(base + Hs + 0.12, base + 0.2);
    beam(gb, [hx, top, hz], [hx, hy, hz], 0.003, C.black);
    gb.box(hx, hy - 0.04, hz, 0.06, 0.04, 0.04, C.orange);
    gb.box(mx, top + 0.06, mz, 0.02, 0.02, 0.02, C.red, { glow: [2.5, 0.15, 0.1] });
  } else {
    gb.box(cx + 0.3 * K, B + 0.014, cz - 0.32 * K, 0.14, 0.05, 0.08, C.yellow); gb.box(cx + 0.35 * K, B + 0.064, cz - 0.32 * K, 0.05, 0.04, 0.06, C.glassBlue);
    beam(gb, [cx + 0.26 * K, B + 0.07, cz - 0.32 * K], [cx + 0.14 * K, B + 0.14, cz - 0.28 * K], 0.012, C.yellow);
  }
  // materiál a unimobunka
  gb.box(cx - 0.32 * K, B + 0.014, cz + 0.32 * K, 0.12, 0.05, 0.08, col(0xb0603f));
  gb.box(cx - 0.18 * K, B + 0.014, cz + 0.34 * K, 0.08, 0.04, 0.08, C.wood);
  gb.pyramid(cx - 0.34 * K, B + 0.014, cz - 0.3 * K, 0.14, 0.07, 0.12, C.sand);
  gb.box(cx + 0.3 * K, B + 0.014, cz + 0.32 * K, 0.12, 0.07, 0.08, col(0x4f7fb0), { top: shade(col(0x4f7fb0), 1.2) });
  if (emit) emit.push([cx, B + 0.15, cz, 0, 0.35]);
}

export function construction(gb, w, x, y, emit) {
  const i = w.ti(x, y), L = w.level[i], k = zoneKind(w.zone[i]), v = w.variant[i];
  const S = spec(k, L, v, x, y), r = S.r;
  const tot = w.consTot[i] || 8, rem = w.cons[i];
  const stage = Math.max(0, Math.min(4, Math.floor((1 - rem / tot) * 5)));
  const mx = w.tileMax(x, y), mn = w.tileMin(x, y), B = mx * HS;
  const cx = x + 0.5, cz = y + 0.5;
  if (mx !== mn) gb.box(cx, mn * HS - 0.02, cz, 0.94, B - mn * HS + 0.03, 0.94, C.concrete);
  let H, ww, dd, fh, wall;
  const palPick = a => a[v % a.length];   // vždy platný index (palety majú rôznu dĺžku)
  if (k === 3) { H = 0.3 + L * 0.14; ww = 0.76; dd = 0.66; fh = 0.2; wall = palPick(INDW); }
  else if (L <= 2) { H = L === 1 ? 0.3 : 0.5; ww = L === 1 ? 0.5 : 0.64; dd = L === 1 ? 0.4 : 0.52; fh = 0.2; wall = palPick(k === 1 ? WALLS_R : COMW); }
  else { H = S.floors * FLOOR; ww = 0.72; dd = 0.68; fh = FLOOR; wall = palPick(k === 1 ? APT : TOWER); }
  siteCore(gb, r, { cx, cz, B, ww, dd, H, fh, stage, wall, from: w.consFrom[i] ? OLD_H[k][w.consFrom[i]] : 0, emit, crane: H > 0.55, segs: 3 });
}

// stavenisko špeciálnej / službovej budovy
const BH = { coal: 1.0, nuclear: 1.1, gas: 0.7, solar: 0.4, fusion: 1.0, police: 0.6, fire: 0.6, hospital: 0.8, school: 0.5, college: 0.8, stadium: 0.8, seaport: 0.5, airport: 0.5, cityhall: 0.9, arco: 3.0, wtower: 1.2, pump: 0.3, hydro: 0.5, wind: 0.5 };
export function buildingSite(gb, w, b, emit, plinthFn) {
  const s = b.size, r = rng(b.id * 977 + 5);
  const B = plinthFn(gb, w, b.x, b.y, s);
  const tot = b.consTot || 8, stage = Math.max(0, Math.min(4, Math.floor((1 - (b.cons || 0) / tot) * 5)));
  const H = BH[b.type] || 0.6, cx = b.x + s / 2, cz = b.y + s / 2;
  // staveniská veľkých budov = viac menších dielov
  const sub = s >= 3 ? 2 : 1;
  const cell = s / sub;
  for (let a = 0; a < sub; a++) for (let c = 0; c < sub; c++) {
    siteCore(gb, rng(b.id * 31 + a * 7 + c), {
      cx: b.x + (a + 0.5) * cell, cz: b.y + (c + 0.5) * cell, B, ww: cell * 0.72, dd: cell * 0.66, H: H * (a === c ? 1 : 0.6), fh: 0.2, stage,
      wall: col(0xc9c4b8), from: 0, emit, cell: cell / 1.0, crane: a === 0 && c === 0 && (H > 0.6 || s >= 3), segs: 3,
    });
  }
}
