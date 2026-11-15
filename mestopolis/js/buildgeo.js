import { HS, FLOOR, SEA, zoneKind, zoneDense, BUILDINGS } from './config.js';
import { col, shade, mix } from './geom.js';
import { rng } from './noise.js';

const C = {
  asphalt: col(0x3d4046), side: col(0xa7a69c), dash: col(0xe8d36a), white: col(0xeeeeea),
  concrete: col(0xb9b5aa), darkConc: col(0x86827a), grass: col(0x5f9b3c), grassDark: col(0x4c8131),
  trunk: col(0x6b4a2b), water: col(0x3f86c4), metal: col(0x9aa3ab), darkMetal: col(0x5d646b),
  glass: col(0x2b3a4a), glassBlue: col(0x3d6f9a), rubble: col(0x7b6f63), rubble2: col(0x5c534a),
  pole: col(0x6e5a44), wire: col(0x222222), brick: col(0xa0523d), brickDark: col(0x7c3b2b),
  red: col(0xc8352b), roofRed: col(0xa3402e), roofBrown: col(0x6d4c3a), roofGray: col(0x5f6670),
  black: col(0x1d1d1f), yellow: col(0xe9c23d), blue: col(0x2f5fa8), orange: col(0xd9792b),
};
const WALLS_R = [0xe8dcc0, 0xd9c7a3, 0xc9d6c3, 0xe2c5b5, 0xc7cbd6, 0xf0e6d2, 0xd8b98f, 0xbfd1d8].map(col);
const ROOFS = [0xa3402e, 0x6d4c3a, 0x5f6670, 0x7a3a2c, 0x3f5a6b, 0x8a5a3c].map(col);
const APT = [0xcfc6b5, 0xb8a58c, 0xa9b4bd, 0xd4b8a0, 0x9fa89a, 0xc2b2a3].map(col);
const COMW = [0xd8d2c4, 0x9fb5c4, 0xc9c0a8, 0x8ea1b0, 0xb7a58f, 0xe0d6c8].map(col);
const AWN = [0xd0402f, 0x2f7d4f, 0x2f5fa8, 0xe0a224, 0x8a3f9a, 0x1f8a8a].map(col);
const INDW = [0x9b9381, 0x8a8f93, 0xa48b6d, 0x7f8778, 0xb0a48c].map(col);
const TOWER = [0x5b7d99, 0x47657d, 0x6e8a8f, 0x7b8796, 0x4d6a6a, 0x8c94a0].map(col);
const LEAF = [0x3d7a2c, 0x4b8a32, 0x2f6b2a, 0x5a9a3a, 0x3a6e3a, 0x6a9a34].map(col);
const CARC = [0xc8352b, 0x2f5fa8, 0xeeeeea, 0x2b2b2b, 0xe0a224, 0x3d8a4a].map(col);

// ---------- pomocné ----------
function surfY(w, x, z) { return w.heightAt(x, z) * HS; }

// plošný obdĺžnik kopírujúci terén
function decal(gb, w, x0, z0, x1, z1, color, lift, sub = 2, glow) {
  for (let j = 0; j < sub; j++) for (let i = 0; i < sub; i++) {
    const ax = x0 + (x1 - x0) * i / sub, bx = x0 + (x1 - x0) * (i + 1) / sub;
    const az = z0 + (z1 - z0) * j / sub, bz = z0 + (z1 - z0) * (j + 1) / sub;
    gb.quad([ax, surfY(w, ax, az) + lift, az], [ax, surfY(w, ax, bz) + lift, bz], [bx, surfY(w, bx, bz) + lift, bz], [bx, surfY(w, bx, az) + lift, az], color, glow, [0, 1, 0]);
  }
}

// šikmý trám medzi dvoma bodmi
export function beam(gb, a, b, t, color, glow) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz) || 1;
  const d = [dx / L, dy / L, dz / L];
  let up = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let s = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]];
  let sl = Math.hypot(...s); s = s.map(v => v / sl * t);
  let u = [s[1] * d[2] - s[2] * d[1], s[2] * d[0] - s[0] * d[2], s[0] * d[1] - s[1] * d[0]];
  let ul = Math.hypot(...u); u = u.map(v => v / ul * t);
  const P = (p, k1, k2) => [p[0] + s[0] * k1 + u[0] * k2, p[1] + s[1] * k1 + u[1] * k2, p[2] + s[2] * k1 + u[2] * k2];
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let k = 0; k < 4; k++) {
    const c0 = corners[k], c1 = corners[(k + 1) % 4];
    const hint = [s[0] * (c0[0] + c1[0]) + u[0] * (c0[1] + c1[1]), s[1] * (c0[0] + c1[0]) + u[1] * (c0[1] + c1[1]), s[2] * (c0[0] + c1[0]) + u[2] * (c0[1] + c1[1])];
    gb.quad(P(a, ...c0), P(b, ...c0), P(b, ...c1), P(a, ...c1), color, glow, hint);
  }
}

export function plinth(gb, w, x, y, s, color = C.concrete) {
  let mn = 99, mx = -99;
  for (let dy = 0; dy <= s; dy++) for (let dx = 0; dx <= s; dx++) { const h = w.ch(x + dx, y + dy); mn = Math.min(mn, h); mx = Math.max(mx, h); }
  const base = mx * HS + 0.02;
  gb.box(x + s / 2, mn * HS - 0.05, y + s / 2, s - 0.02, base - mn * HS + 0.05, s - 0.02, shade(color, 0.85), { top: color });
  return base;
}

// ---------- stromy ----------
export function trees(gb, w, x, y, count, seed, scale = 1) {
  const r = rng(seed);
  const AUT = [col(0xd9792b), col(0xc9a227), col(0xb5452b)];
  for (let k = 0; k < count; k++) {
    const px = x + 0.16 + r() * 0.68, pz = z0(y, r);
    const by = surfY(w, px, pz);
    const s = (0.7 + r() * 0.6) * scale;
    let leaf = LEAF[Math.floor(r() * LEAF.length)];
    if (r() < 0.08) leaf = AUT[Math.floor(r() * 3)];
    const t = r();
    if (t < 0.3) { // borovica / smrek
      gb.cyl(px, by, pz, 0.022 * s, 0.1 * s, C.trunk, 4);
      gb.cyl(px, by + 0.07 * s, pz, 0.14 * s, 0.2 * s, shade(leaf, 0.82), 7, 0);
      gb.cyl(px, by + 0.17 * s, pz, 0.11 * s, 0.19 * s, shade(leaf, 0.92), 7, 0);
      gb.cyl(px, by + 0.27 * s, pz, 0.075 * s, 0.17 * s, leaf, 7, 0);
    } else if (t < 0.58) { // listnatý strom s korunou z blokov
      gb.cyl(px, by, pz, 0.026 * s, 0.15 * s, C.trunk, 5);
      gb.cyl(px, by + 0.1 * s, pz, 0.1 * s, 0.09 * s, shade(leaf, 0.85), 7, 0.16 * s, { noCap: true });
      gb.cyl(px, by + 0.19 * s, pz, 0.16 * s, 0.1 * s, leaf, 7, 0.1 * s, { noCap: true });
      gb.cyl(px, by + 0.29 * s, pz, 0.1 * s, 0.05 * s, shade(leaf, 1.12), 7, 0.0);
    } else if (t < 0.76) { // topoľ / cyprus
      gb.cyl(px, by, pz, 0.02 * s, 0.08 * s, C.trunk, 4);
      gb.cyl(px, by + 0.06 * s, pz, 0.065 * s, 0.34 * s, leaf, 6, 0.0);
    } else if (t < 0.9) { // kroví
      gb.cyl(px, by, pz, 0.09 * s, 0.07 * s, shade(leaf, 0.9), 6, 0.06 * s);
      gb.cyl(px + 0.06 * s, by, pz + 0.03 * s, 0.06 * s, 0.05 * s, leaf, 6, 0.04 * s);
    } else { // breza
      gb.cyl(px, by, pz, 0.016 * s, 0.2 * s, col(0xe6e3d8), 4);
      gb.cyl(px, by + 0.13 * s, pz, 0.11 * s, 0.13 * s, mix(leaf, col(0xa8c860), 0.4), 6, 0.04 * s);
    }
  }
}
function z0(y, r) { return y + 0.16 + r() * 0.68; }

// ---------- cesty ----------
const nbs = (w, x, y, arr) => [
  y > 0 && arr[w.ti(x, y - 1)], x < w.N - 1 && arr[w.ti(x + 1, y)], y < w.N - 1 && arr[w.ti(x, y + 1)], x > 0 && arr[w.ti(x - 1, y)],
];

export function road(gb, w, x, y, night) {
  const i = w.ti(x, y);
  const n = nbs(w, x, y, w.road); // N E S W
  const cx = x + 0.5, cz = y + 0.5;
  if (w.water[i]) return bridge(gb, w, x, y, n);
  const any = n.some(Boolean);
  const sw = 0.42, aw = 0.31; // polovičné šírky chodník / asfalt
  const sub = w.tileMax(x, y) !== w.tileMin(x, y) ? 3 : 1;
  const rects = (hw, lift, color) => {
    decal(gb, w, cx - hw, cz - hw, cx + hw, cz + hw, color, lift, sub);
    if (n[0] || !any) decal(gb, w, cx - hw, y, cx + hw, cz - hw, color, lift, sub);
    if (n[2] || !any) decal(gb, w, cx - hw, cz + hw, cx + hw, y + 1, color, lift, sub);
    if (n[3] || !any) decal(gb, w, x, cz - hw, cx - hw, cz + hw, color, lift, sub);
    if (n[1] || !any) decal(gb, w, cx + hw, cz - hw, x + 1, cz + hw, color, lift, sub);
  };
  rects(sw, 0.018, C.side);
  rects(aw, 0.03, C.asphalt);
  // stredové čiary
  const cnt = n.filter(Boolean).length;
  if (cnt <= 2) {
    const dl = 0.022;
    if (n[0]) decal(gb, w, cx - dl, y + 0.08, cx + dl, y + 0.32, C.dash, 0.038, 1);
    if (n[2]) decal(gb, w, cx - dl, y + 0.68, cx + dl, y + 0.92, C.dash, 0.038, 1);
    if (n[3]) decal(gb, w, x + 0.08, cz - dl, x + 0.32, cz + dl, C.dash, 0.038, 1);
    if (n[1]) decal(gb, w, x + 0.68, cz - dl, x + 0.92, cz + dl, C.dash, 0.038, 1);
  } else {
    // priechody pre chodcov na križovatke
    for (let k = -2; k <= 2; k++) {
      if (n[0]) decal(gb, w, cx + k * 0.11 - 0.03, y + 0.06, cx + k * 0.11 + 0.03, y + 0.16, C.white, 0.038, 1);
      if (n[2]) decal(gb, w, cx + k * 0.11 - 0.03, y + 0.84, cx + k * 0.11 + 0.03, y + 0.94, C.white, 0.038, 1);
    }
  }
  // pouličné lampy
  if ((x * 7 + y * 13) % 3 === 0) {
    const lx = x + 0.08, lz = y + 0.08, ly = surfY(w, lx, lz);
    gb.box(lx, ly, lz, 0.025, 0.3, 0.025, C.darkMetal);
    gb.box(lx + 0.04, ly + 0.29, lz + 0.04, 0.07, 0.025, 0.07, C.white, { glow: [1.6, 1.3, 0.75] });
    // svetelný kruh na vozovke (viditeľný len v noci)
    gb.cyl(x + 0.32, surfY(w, x + 0.32, y + 0.32) + 0.034, y + 0.32, 0.13, 0.001, C.asphalt, 8, null, { glow: [0.55, 0.42, 0.16] });
  }
}

function bridge(gb, w, x, y, n) {
  const deckY = SEA * HS + 0.32;
  const ns = n[0] || n[2], ew = n[1] || n[3];
  const alongZ = ns || !ew;
  const cx = x + 0.5, cz = y + 0.5;
  if (alongZ) {
    gb.box(cx, deckY - 0.06, cz, 0.74, 0.06, 1.0, C.concrete, { top: C.asphalt });
    gb.box(cx - 0.35, deckY, cz, 0.03, 0.07, 1.0, C.white);
    gb.box(cx + 0.35, deckY, cz, 0.03, 0.07, 1.0, C.white);
    gb.box(cx, deckY + 0.002, cz, 0.03, 0.001, 0.4, C.dash);
  } else {
    gb.box(cx, deckY - 0.06, cz, 1.0, 0.06, 0.74, C.concrete, { top: C.asphalt });
    gb.box(cx, deckY, cz - 0.35, 1.0, 0.07, 0.03, C.white);
    gb.box(cx, deckY, cz + 0.35, 1.0, 0.07, 0.03, C.white);
    gb.box(cx, deckY + 0.002, cz, 0.4, 0.001, 0.03, C.dash);
  }
  const bottom = w.tileMin(x, y) * HS;
  if ((x + y) % 2 === 0) gb.box(cx, bottom, cz, 0.16, deckY - 0.06 - bottom, 0.16, C.darkConc);
}

// ---------- elektrické vedenie ----------
// poloha stĺpa vedenia na políčku: { pole, ox, oz } (posun od stredu políčka)
function plinePos(w, x, y) {
  const i = w.ti(x, y);
  const conn = (xx, yy) => w.inb(xx, yy) && (w.pline[w.ti(xx, yy)] || w.bid[w.ti(xx, yy)]);
  const n = [conn(x, y - 1), conn(x + 1, y), conn(x, y + 1), conn(x - 1, y)];
  const ew = (n[1] || n[3]) && !(n[0] || n[2]);
  const ns = (n[0] || n[2]) && !(n[1] || n[3]);
  const res = { pole: true, ox: 0, oz: 0, n, ew, ns };
  if (w.road[i] && !w.water[i]) {
    const r = nbs(w, x, y, w.road);
    if (ew && !r[1] && !r[3]) res.pole = false;        // preklenutie cesty idúcej S-J
    else if (ns && !r[0] && !r[2]) res.pole = false;   // preklenutie cesty idúcej V-Z
    else if (ew) res.oz = 0.42;                        // pozdĺž cesty – pri krajnici
    else if (ns) res.ox = 0.42;
    else { res.ox = 0.42; res.oz = 0.42; }
  }
  return res;
}

export function powerline(gb, w, x, y) {
  const i = w.ti(x, y);
  const P = plinePos(w, x, y), n = P.n;
  const H = 0.6;
  const DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0];
  const cx = x + 0.5, cz = y + 0.5;
  const groundAt = (tx, tz) => (w.water[w.ti(tx, tz)] ? SEA * HS : surfY(w, tx + 0.5, tz + 0.5));
  const cTop = groundAt(x, y);
  // bod na hrane: výška aj posun sú priemerom oboch susedných políčok -> drôty na seba nadväzujú
  const edge = k => {
    const nx = x + DX[k], nz = y + DZ[k], ni = w.ti(nx, nz);
    const hasP = w.pline[ni];
    const Q = hasP ? plinePos(w, nx, nz) : P;
    const nTop = hasP ? groundAt(nx, nz) : cTop;
    const ex = k % 2 === 0 ? cx + (P.ox + Q.ox) / 2 : cx + DX[k] * 0.5;
    const ez = k % 2 === 1 ? cz + (P.oz + Q.oz) / 2 : cz + DZ[k] * 0.5;
    return [ex, (cTop + nTop) / 2 + H - 0.1, ez];
  };
  const wire = (a, e, perpX) => {
    const mid = [(a[0] + e[0]) / 2, (a[1] + e[1]) / 2 - 0.04, (a[2] + e[2]) / 2];
    for (const sgn of [-1, 1]) {
      const o = 0.1 * sgn, d = perpX ? [o, 0, 0] : [0, 0, o];
      const A = [a[0] + d[0], a[1], a[2] + d[2]], M = [mid[0] + d[0], mid[1], mid[2] + d[2]], E = [e[0] + d[0], e[1], e[2] + d[2]];
      beam(gb, A, M, 0.006, C.wire); beam(gb, M, E, 0.006, C.wire);
    }
  };
  if (!P.pole) {
    if (P.ew) wire(edge(3), edge(1), false); else wire(edge(0), edge(2), true);
    return;
  }
  const px = cx + P.ox, pz = cz + P.oz;
  const top = (w.water[i] ? SEA * HS : surfY(w, px, pz));
  gb.box(px, top, pz, 0.035, H, 0.035, C.pole);
  if (P.ns) gb.box(px, top + H - 0.05, pz, 0.26, 0.025, 0.03, C.pole);
  else gb.box(px, top + H - 0.05, pz, 0.03, 0.025, 0.26, C.pole);
  const t = [px, top + H - 0.04, pz];
  for (let k = 0; k < 4; k++) if (n[k]) wire(t, edge(k), k % 2 === 0);
}

// ---------- potrubie (podzemný pohľad) ----------
export function pipe(gb, w, x, y) {
  const n = nbs(w, x, y, w.pipe);
  const cx = x + 0.5, cz = y + 0.5, yy = surfY(w, cx, cz) + 0.06;
  const c = col(0x4aa3df);
  gb.box(cx, yy - 0.05, cz, 0.16, 0.12, 0.16, c);
  if (n[0]) gb.box(cx, yy - 0.04, y + 0.25, 0.1, 0.1, 0.5, c);
  if (n[2]) gb.box(cx, yy - 0.04, y + 0.75, 0.1, 0.1, 0.5, c);
  if (n[3]) gb.box(x + 0.25, yy - 0.04, cz, 0.5, 0.1, 0.1, c);
  if (n[1]) gb.box(x + 0.75, yy - 0.04, cz, 0.5, 0.1, 0.1, c);
}

// ---------- trosky ----------
export function rubble(gb, w, x, y, seed) {
  const r = rng(seed);
  for (let k = 0; k < 6; k++) {
    const px = x + 0.15 + r() * 0.7, pz = y + 0.15 + r() * 0.7;
    gb.box(px, surfY(w, px, pz), pz, 0.08 + r() * 0.15, 0.03 + r() * 0.07, 0.08 + r() * 0.15, r() < 0.5 ? C.rubble : C.rubble2);
  }
}

// ---------- služby a špeciálne budovy ----------
export function serviceBuilding(gb, w, b, emit, night) {
  const s = b.size, x = b.x, y = b.y;
  const cx = x + s / 2, cz = y + s / 2;
  const r = rng(b.id * 131 + 7);
  const t = b.type;
  const isPark = t === 'park' || t === 'bigpark' || t === 'fountain';
  const base = plinth(gb, w, x, y, s, isPark ? C.grass : t === 'airport' ? col(0x8a9a7a) : C.concrete);
  const B = base;
  const winLit = 0.6;
  switch (t) {
    case 'coal': {
      gb.box(cx - 0.5, B, cz - 0.3, 2.2, 0.9, 1.7, C.brick, { top: C.roofGray });
      gb.windows(cx - 0.5, B, cz - 0.3, 2.2, 0.9, 1.7, 2, r, { lit: 0.7, segs: 4, warm: [1, 0.55, 0.2] });
      gb.gable(cx - 0.5, B + 0.9, cz - 0.3, 2.2, 0.35, 1.7, C.roofGray, C.brick, 'x');
      gb.box(cx + 1.15, B, cz - 0.5, 0.8, 1.4, 1.0, C.darkMetal);
      for (const [ox, oz] of [[2.95, 3.0], [3.5, 3.0]]) {
        const hx = x + ox, hz = y + oz;
        gb.cyl(hx, B, hz, 0.2, 3.2, C.white, 10, 0.14, { top: C.black });
        gb.cyl(hx, B + 2.6, hz, 0.152, 0.3, C.red, 10, 0.145, { noCap: true });
        gb.cyl(hx, B + 1.8, hz, 0.165, 0.3, C.red, 10, 0.16, { noCap: true });
        emit.push([hx, B + 3.25, hz, 0, 3]);
      }
      gb.pyramid(cx - 1.2, B, cz + 1.3, 1.1, 0.4, 0.9, C.black);
      gb.pyramid(cx - 0.2, B, cz + 1.4, 0.8, 0.3, 0.7, shade(C.black, 1.4));
      beam(gb, [cx - 1.2, B + 0.4, cz + 1.2], [cx - 0.7, B + 0.95, cz + 0.4], 0.04, C.darkMetal);
      break;
    }
    case 'hydro': {
      gb.box(cx, B, cz, 0.85, 0.35, 0.85, C.concrete);
      gb.box(cx, B + 0.35, cz, 0.55, 0.22, 0.5, col(0x5d7c99));
      gb.windows(cx, B + 0.35, cz, 0.55, 0.22, 0.5, 1, r, { lit: 0.8, segs: 2 });
      gb.cyl(cx + 0.28, B + 0.05, cz + 0.28, 0.1, 0.12, C.water, 8, null, { glow: [0.1, 0.4, 0.7] });
      break;
    }
    case 'gas': {
      gb.box(cx - 0.4, B, cz - 0.3, 1.6, 0.7, 1.2, col(0xbfb8a8), { top: C.roofGray });
      gb.windows(cx - 0.4, B, cz - 0.3, 1.6, 0.7, 1.2, 2, r, { lit: 0.6, segs: 3 });
      for (const [ox, oz] of [[0.75, 0.9], [-0.6, 0.95]]) {
        gb.cyl(cx + ox, B, cz + oz, 0.38, 0.55, col(0xdfe3e6), 12);
        gb.cyl(cx + ox, B + 0.55, cz + oz, 0.38, 0.18, col(0xdfe3e6), 12, 0.1);
      }
      gb.cyl(cx + 0.95, B, cz - 0.95, 0.09, 1.7, C.metal, 8, 0.08, { top: C.black });
      emit.push([cx + 0.95, B + 1.72, cz - 0.95, 0, 1]);
      break;
    }
    case 'nuclear': {
      const tw = [[x + 1.0, y + 1.0], [x + 1.0, y + 2.95]];
      for (const [tx, tz] of tw) {
        gb.lathe(tx, B, tz, [[0.85, 0], [0.62, 0.9], [0.55, 1.45], [0.6, 1.9]], col(0xd8d6d0), 14);
        gb.cyl(tx, B + 1.86, tz, 0.6, 0.02, col(0x777777), 14, 0.55);
        emit.push([tx, B + 2.0, tz, 1, 4]);
      }
      gb.cyl(x + 2.95, B, y + 1.4, 0.55, 0.9, col(0xc9c4b8), 14);
      gb.cyl(x + 2.95, B + 0.9, y + 1.4, 0.55, 0.45, col(0xb0aa9e), 14, 0.15);
      gb.box(x + 2.95, B, y + 2.95, 1.4, 0.55, 1.2, col(0xa9b0b6), { top: C.roofGray });
      gb.windows(x + 2.95, B, y + 2.95, 1.4, 0.55, 1.2, 2, r, { lit: 0.7, segs: 3 });
      gb.box(x + 2.95, B + 0.55, y + 2.95, 0.2, 0.05, 0.2, C.yellow, { glow: [1.5, 1.2, 0.1] });
      break;
    }
    case 'wind': {
      const by = B;
      gb.cyl(cx, by, cz, 0.045, 1.5, C.white, 6, 0.025);
      gb.box(cx, by + 1.48, cz, 0.08, 0.08, 0.18, C.white);
      const hub = [cx, by + 1.52, cz + 0.1];
      const a0 = r() * Math.PI * 2;
      for (let k = 0; k < 3; k++) {
        const a = a0 + (k * Math.PI * 2) / 3;
        beam(gb, hub, [hub[0] + Math.cos(a) * 0.6, hub[1] + Math.sin(a) * 0.6, hub[2]], 0.018, C.white);
      }
      gb.box(cx, by + 1.56, cz, 0.02, 0.02, 0.02, C.red, { glow: [2, 0.1, 0.1] });
      break;
    }
    case 'solar': {
      for (let j = 0; j < 4; j++) for (let k = 0; k < 3; k++) {
        const px = x + 0.55 + k * 1.0, pz = y + 0.4 + j * 0.85;
        if (j === 3 && k === 2) continue;
        const y0 = B + 0.08, y1 = B + 0.35;
        gb.quad([px - 0.42, y0, pz + 0.3], [px + 0.42, y0, pz + 0.3], [px + 0.42, y1, pz - 0.25], [px - 0.42, y1, pz - 0.25], col(0x223a6b), [0.03, 0.05, 0.12], [0, 1, 0.5]);
        gb.box(px, B, pz, 0.04, 0.2, 0.04, C.metal);
      }
      gb.box(x + 2.6, B, y + 3.2, 0.9, 0.35, 0.6, C.white);
      gb.windows(x + 2.6, B, y + 3.2, 0.9, 0.35, 0.6, 1, r, { lit: 0.8 });
      break;
    }
    case 'fusion': {
      for (let k = 0; k < 16; k++) {
        const a0 = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2;
        beam(gb, [cx + Math.cos(a0) * 1.3, B + 0.55, cz + Math.sin(a0) * 1.3], [cx + Math.cos(a1) * 1.3, B + 0.55, cz + Math.sin(a1) * 1.3], 0.22, col(0x8fa0b5));
      }
      gb.cyl(cx, B, cz, 0.55, 1.4, col(0xdde6ef), 14, 0.35);
      gb.cyl(cx, B + 1.4, cz, 0.35, 0.4, col(0x6ff3ff), 14, 0.1, { glow: [0.3, 1.6, 1.8] });
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; gb.box(cx + Math.cos(a) * 1.75, B, cz + Math.sin(a) * 1.75, 0.25, 0.9, 0.25, C.metal, { glow: [0.05, 0.3, 0.35] }); }
      break;
    }
    case 'pump': {
      gb.box(cx - 0.1, B, cz, 0.5, 0.3, 0.45, col(0x9db3c4), { top: C.roofGray });
      gb.windows(cx - 0.1, B, cz, 0.5, 0.3, 0.45, 1, r, { lit: 0.5, segs: 1 });
      gb.cyl(cx + 0.25, B, cz + 0.2, 0.14, 0.4, col(0x3f86c4), 10);
      break;
    }
    case 'wtower': {
      for (const [ox, oz] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) beam(gb, [cx + ox, B, cz + oz], [cx + ox * 0.45, B + 1.3, cz + oz * 0.45], 0.03, C.darkMetal);
      gb.cyl(cx, B + 1.25, cz, 0.15, 0.15, col(0x6fa8d6), 12, 0.55, { noCap: true });
      gb.cyl(cx, B + 1.4, cz, 0.55, 0.4, col(0x6fa8d6), 12);
      gb.cyl(cx, B + 1.8, cz, 0.56, 0.2, col(0x4d84b5), 12, 0);
      break;
    }
    case 'police': {
      const wc = col(0x6f86a8);
      gb.box(cx - 0.2, B, cz - 0.15, 1.3, 0.55, 1.1, wc, { top: C.roofGray });
      gb.windows(cx - 0.2, B, cz - 0.15, 1.3, 0.55, 1.1, 2, r, { lit: winLit, segs: 4 });
      gb.box(cx - 0.2, B + 0.55, cz - 0.15, 0.5, 0.15, 0.4, shade(wc, 0.8));
      gb.box(cx - 0.2, B + 0.7, cz - 0.15, 0.08, 0.05, 0.08, C.blue, { glow: [0.2, 0.5, 2.2] });
      for (let k = 0; k < 3; k++) {
        gb.box(cx - 0.6 + k * 0.32, B, cz + 0.72, 0.13, 0.07, 0.24, C.white);
        gb.box(cx - 0.6 + k * 0.32, B + 0.07, cz + 0.72, 0.1, 0.03, 0.06, k % 2 ? C.blue : C.red, { glow: k % 2 ? [0.2, 0.3, 1.5] : [1.5, 0.2, 0.2] });
      }
      gb.cyl(cx + 0.75, B, cz - 0.6, 0.015, 0.9, C.metal, 4);
      gb.box(cx + 0.82, B + 0.75, cz - 0.6, 0.15, 0.1, 0.01, C.blue);
      break;
    }
    case 'fire': {
      gb.box(cx - 0.1, B, cz - 0.1, 1.5, 0.55, 1.2, C.brick, { top: C.roofGray });
      gb.windows(cx - 0.1, B + 0.28, cz - 0.1, 1.5, 0.27, 1.2, 1, r, { lit: winLit, segs: 4 });
      for (let k = 0; k < 3; k++) gb.box(cx - 0.55 + k * 0.42, B, cz + 0.505, 0.3, 0.3, 0.01, k === 1 ? col(0xd9d9d9) : col(0x2a2a2a));
      gb.box(cx + 0.75, B, cz - 0.55, 0.3, 1.05, 0.3, C.brickDark, { top: C.roofGray });
      gb.box(cx - 0.55, B, cz + 0.78, 0.16, 0.12, 0.38, C.red);
      gb.box(cx + 0.3, B, cz + 0.78, 0.16, 0.12, 0.38, C.red);
      gb.box(cx - 0.55, B + 0.12, cz + 0.68, 0.08, 0.03, 0.06, C.red, { glow: [2, 0.3, 0.2] });
      break;
    }
    case 'hospital': {
      const wc = col(0xeae8e2);
      gb.box(cx - 0.3, B, cz, 1.0, 0.75, 1.5, wc, { top: col(0xcfcfcf) });
      gb.windows(cx - 0.3, B, cz, 1.0, 0.75, 1.5, 3, r, { lit: 0.75, segs: 4, warm: [0.85, 0.95, 1.0] });
      gb.box(cx + 0.55, B, cz + 0.3, 0.7, 0.45, 0.8, wc);
      gb.windows(cx + 0.55, B, cz + 0.3, 0.7, 0.45, 0.8, 2, r, { lit: 0.7, segs: 2, warm: [0.85, 0.95, 1.0] });
      gb.box(cx - 0.3, B + 0.75, cz, 0.42, 0.012, 0.12, C.red, { glow: [1.6, 0.1, 0.1] });
      gb.box(cx - 0.3, B + 0.75, cz, 0.12, 0.012, 0.42, C.red, { glow: [1.6, 0.1, 0.1] });
      gb.cyl(cx + 0.55, B + 0.45, cz - 0.45, 0.28, 0.01, col(0x555555), 12);
      gb.box(cx + 0.66, B, cz - 0.6, 0.12, 0.08, 0.25, C.white);
      break;
    }
    case 'school': {
      const bc = col(0xb5674a);
      gb.box(cx - 0.35, B, cz - 0.35, 1.2, 0.48, 0.6, bc, { top: C.roofGray });
      gb.box(cx + 0.45, B, cz + 0.05, 0.6, 0.48, 1.3, bc, { top: C.roofGray });
      gb.windows(cx - 0.35, B, cz - 0.35, 1.2, 0.48, 0.6, 2, r, { lit: 0.4, segs: 4 });
      gb.windows(cx + 0.45, B, cz + 0.05, 0.6, 0.48, 1.3, 2, r, { lit: 0.4, segs: 4 });
      gb.box(cx - 0.35, B + 0.01, cz + 0.45, 0.9, 0.012, 0.6, col(0xc76b3c));
      gb.box(cx - 0.35, B + 0.022, cz + 0.45, 0.02, 0.002, 0.6, C.white);
      gb.cyl(cx - 0.85, B, cz - 0.8, 0.012, 0.75, C.metal, 4);
      gb.box(cx - 0.78, B + 0.62, cz - 0.8, 0.14, 0.09, 0.01, C.blue);
      gb.box(cx - 0.78, B + 0.62, cz - 0.8, 0.14, 0.03, 0.012, C.white);
      gb.box(cx - 0.78, B + 0.65, cz - 0.8, 0.14, 0.03, 0.012, C.red);
      break;
    }
    case 'college': {
      const sc = col(0xd7cdb5);
      gb.box(cx, B, cz - 0.4, 2.0, 0.7, 0.9, sc, { top: C.roofGray });
      gb.windows(cx, B, cz - 0.4, 2.0, 0.7, 0.9, 3, r, { lit: 0.5, segs: 6 });
      gb.box(cx - 1.05, B, cz + 0.45, 0.6, 0.55, 0.9, sc);
      gb.box(cx + 1.05, B, cz + 0.45, 0.6, 0.55, 0.9, sc);
      gb.windows(cx - 1.05, B, cz + 0.45, 0.6, 0.55, 0.9, 2, r, { lit: 0.5 });
      gb.windows(cx + 1.05, B, cz + 0.45, 0.6, 0.55, 0.9, 2, r, { lit: 0.5 });
      for (let k = 0; k < 6; k++) gb.cyl(cx - 0.5 + k * 0.2, B, cz + 0.1, 0.035, 0.6, C.white, 6);
      gb.box(cx, B + 0.6, cz + 0.05, 1.3, 0.1, 0.2, sc);
      gb.cyl(cx, B + 0.7, cz - 0.4, 0.35, 0.3, sc, 12);
      gb.cyl(cx, B + 1.0, cz - 0.4, 0.35, 0.35, col(0x5f8f84), 12, 0.0);
      gb.box(cx, B + 0.01, cz + 0.85, 1.4, 0.012, 0.55, C.grass);
      trees(gb, w, x, y + 2, 2, b.id, 1);
      trees(gb, w, x + 2, y + 2, 2, b.id + 3, 1);
      break;
    }
    case 'park': {
      decal(gb, w, x + 0.45, y + 0.05, x + 0.55, y + 0.95, col(0xc9b48a), 0.03, 1);
      decal(gb, w, x + 0.05, y + 0.45, x + 0.95, y + 0.55, col(0xc9b48a), 0.03, 1);
      trees(gb, w, x, y, 3, b.id * 3, 1.0);
      gb.box(cx + 0.2, B, cz + 0.2, 0.15, 0.04, 0.05, C.trunk);
      break;
    }
    case 'fountain': {
      gb.box(cx, B, cz, 1.9, 0.02, 1.9, col(0xcfc6b0));
      gb.cyl(cx, B, cz, 0.55, 0.1, col(0xbab3a5), 14);
      gb.cyl(cx, B + 0.1, cz, 0.48, 0.005, C.water, 14, null, { glow: [0.05, 0.2, 0.35] });
      gb.cyl(cx, B, cz, 0.08, 0.4, col(0xd8d2c4), 8, 0.04);
      gb.cyl(cx, B + 0.4, cz, 0.14, 0.04, C.water, 8, 0.02, { glow: [0.2, 0.5, 0.8] });
      for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) trees(gb, w, x + ox, y + oz, 1, b.id + ox * 5 + oz, 0.9);
      for (const [ox, oz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
        gb.box(cx + ox * 0.7, B, cz + oz * 0.7, 0.02, 0.25, 0.02, C.black);
        gb.box(cx + ox * 0.7, B + 0.25, cz + oz * 0.7, 0.05, 0.05, 0.05, C.white, { glow: [1.4, 1.2, 0.8] });
      }
      break;
    }
    case 'bigpark': {
      gb.cyl(cx + 0.3, B, cz + 0.3, 0.75, 0.02, C.water, 14, null, { glow: [0.02, 0.06, 0.12] });
      decal(gb, w, x + 0.2, y + 0.45, x + 2.8, y + 0.55, col(0xc9b48a), 0.03, 4);
      decal(gb, w, x + 0.45, y + 0.2, x + 0.55, y + 2.8, col(0xc9b48a), 0.03, 4);
      for (let k = 0; k < 9; k++) {
        const tx = x + (k % 3), ty = y + Math.floor(k / 3);
        if ((tx === x + 1 || tx === x + 2) && (ty === y + 1 || ty === y + 2)) continue;
        trees(gb, w, tx, ty, 2, b.id * 7 + k, 1.1);
      }
      gb.cyl(x + 2.4, B, y + 2.4, 0.25, 0.22, C.white, 8);
      gb.cyl(x + 2.4, B + 0.22, y + 2.4, 0.3, 0.15, C.roofRed, 8, 0);
      break;
    }
    case 'stadium': {
      gb.box(cx, B, cz, 2.2, 0.02, 1.5, col(0x4f9a3a));
      for (let k = -2; k <= 2; k++) gb.box(cx + k * 0.44, B + 0.022, cz, 0.22, 0.003, 1.5, col(0x5aa944));
      gb.box(cx, B + 0.026, cz, 0.02, 0.002, 1.5, C.white);
      const seg = 24;
      for (let k = 0; k < seg; k++) {
        const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
        const rx0 = 1.45, rz0 = 1.05, rx1 = 1.95, rz1 = 1.65;
        const p = (a, rx, rz, yy) => [cx + Math.cos(a) * rx, yy, cz + Math.sin(a) * rz];
        const sc = k % 2 ? col(0xb8bcc2) : col(0xa9adb3);
        gb.quad(p(a0, rx0, rz0, B + 0.05), p(a0, rx1, rz1, B + 0.6), p(a1, rx1, rz1, B + 0.6), p(a1, rx0, rz0, B + 0.05), sc, undefined, [0, 1, 0]);
        gb.quad(p(a0, rx1, rz1, B), p(a0, rx1, rz1, B + 0.62), p(a1, rx1, rz1, B + 0.62), p(a1, rx1, rz1, B), col(0x8c8f94), undefined, [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)]);
      }
      for (const [ox, oz] of [[-1.8, -1.6], [1.8, -1.6], [-1.8, 1.6], [1.8, 1.6]]) {
        gb.box(cx + ox, B, cz + oz, 0.05, 1.3, 0.05, C.metal);
        gb.box(cx + ox, B + 1.3, cz + oz, 0.22, 0.12, 0.05, C.white, { glow: [2, 2, 1.8] });
      }
      break;
    }
    case 'seaport': {
      gb.box(cx - 0.8, B, cz - 0.6, 1.8, 0.55, 1.4, col(0x8f7a5e), { top: C.roofGray });
      gb.windows(cx - 0.8, B, cz - 0.6, 1.8, 0.55, 1.4, 1, r, { lit: 0.5, segs: 4 });
      const cc = [C.red, C.blue, C.orange, col(0x2f8a4f), C.yellow];
      for (let k = 0; k < 10; k++) gb.box(x + 0.4 + (k % 5) * 0.35, B + Math.floor(k / 5) * 0.14, y + 3.4, 0.3, 0.14, 0.5, cc[Math.floor(r() * 5)]);
      for (const ox of [2.6, 3.5]) {
        beam(gb, [x + ox - 0.2, B, y + 1.0], [x + ox - 0.2, B + 1.4, y + 1.0], 0.04, C.orange);
        beam(gb, [x + ox + 0.2, B, y + 1.0], [x + ox + 0.2, B + 1.4, y + 1.0], 0.04, C.orange);
        beam(gb, [x + ox, B + 1.4, y + 1.6], [x + ox, B + 1.4, y + 0.1], 0.05, C.orange);
        gb.box(x + ox, B + 1.36, y + 0.4, 0.15, 0.1, 0.15, C.yellow, { glow: [1, 0.8, 0.2] });
      }
      break;
    }
    case 'airport': {
      gb.box(cx, B, cz + 1.8, 5.6, 0.02, 0.9, col(0x3a3d42));
      for (let k = 0; k < 10; k++) gb.box(x + 0.6 + k * 0.5, B + 0.021, cz + 1.8, 0.25, 0.002, 0.04, C.white);
      for (let k = 0; k < 12; k++) gb.box(x + 0.3 + k * 0.48, B, cz + 1.3, 0.04, 0.04, 0.04, k % 2 ? C.blue : C.yellow, { glow: k % 2 ? [0.3, 0.4, 2] : [2, 1.6, 0.2] });
      gb.box(cx - 1.2, B, cz - 1.4, 2.6, 0.5, 1.0, col(0xd8dde2), { top: C.roofGray });
      gb.windows(cx - 1.2, B, cz - 1.4, 2.6, 0.5, 1.0, 2, r, { lit: 0.7, segs: 6, glass: C.glassBlue });
      gb.cyl(cx + 1.6, B, cz - 1.6, 0.14, 1.3, C.white, 8);
      gb.cyl(cx + 1.6, B + 1.3, cz - 1.6, 0.25, 0.25, col(0x4d7b9b), 8, 0.3, { glow: [0.4, 0.7, 0.9] });
      gb.box(cx + 0.9, B, cz - 0.1, 1.4, 0.55, 1.0, col(0x9aa3ab));
      gb.gable(cx + 0.9, B + 0.55, cz - 0.1, 1.4, 0.25, 1.0, C.metal, col(0x9aa3ab), 'x', 0);
      // lietadlo
      const px = cx - 1.3, pz = cz - 0.3;
      gb.box(px, B + 0.12, pz, 0.9, 0.12, 0.12, C.white);
      gb.box(px, B + 0.15, pz, 0.22, 0.03, 0.9, C.white);
      gb.box(px - 0.4, B + 0.2, pz, 0.12, 0.2, 0.03, C.red);
      break;
    }
    case 'cityhall': {
      const sc = col(0xe3dccb);
      gb.box(cx, B, cz, 2.4, 0.08, 2.0, col(0xbdb6a6));
      gb.box(cx, B + 0.08, cz - 0.2, 2.2, 0.7, 1.2, sc, { top: C.roofGray });
      gb.windows(cx, B + 0.08, cz - 0.2, 2.2, 0.7, 1.2, 2, r, { lit: 0.6, segs: 6 });
      for (let k = 0; k < 8; k++) gb.cyl(cx - 0.7 + k * 0.2, B + 0.08, cz + 0.5, 0.04, 0.62, C.white, 6);
      gb.box(cx, B + 0.7, cz + 0.45, 1.7, 0.08, 0.2, sc);
      gb.gable(cx, B + 0.78, cz + 0.45, 1.7, 0.2, 0.2, sc, sc, 'x', 0);
      gb.box(cx, B + 0.78, cz - 0.2, 0.45, 0.8, 0.45, sc);
      gb.box(cx, B + 1.25, cz + 0.03, 0.18, 0.18, 0.01, C.white, { glow: [1.6, 1.5, 1.2] });
      gb.pyramid(cx, B + 1.58, cz - 0.2, 0.5, 0.5, 0.5, col(0x5f8f84));
      gb.box(cx, B + 0.09, cz + 1.0, 1.8, 0.01, 0.6, col(0xcfc6b0));
      trees(gb, w, x, y + 2, 1, b.id, 1); trees(gb, w, x + 2, y + 2, 1, b.id + 1, 1);
      break;
    }
    case 'arco': {
      const lv = [[3.6, 1.2], [3.0, 1.4], [2.4, 1.6], [1.7, 1.6], [1.0, 1.2]];
      let yy = B;
      const ac = [col(0x9fb2c4), col(0xb8c4cc), col(0x8aa0b4), col(0xc9d0d6), col(0x7c93a8)];
      lv.forEach(([sz, hh], k) => {
        gb.box(cx, yy, cz, sz, hh, sz, ac[k]);
        gb.windows(cx, yy, cz, sz, hh, sz, Math.round(hh / FLOOR), r, { lit: 0.6, segs: Math.round(sz * 3), warm: [0.8, 0.95, 1.0] });
        yy += hh;
      });
      gb.cyl(cx, yy, cz, 0.04, 1.2, C.metal, 4, 0.01);
      gb.box(cx, yy + 1.2, cz, 0.06, 0.06, 0.06, C.red, { glow: [2.5, 0.2, 0.2] });
      break;
    }
  }
}
