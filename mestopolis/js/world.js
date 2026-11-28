import { CHUNK, MAX_H, SEA, BUILDINGS, Z, zoneKind } from './config.js';
import { makeNoise, rng, hash2 } from './noise.js';

const TILE_ARRAYS = {
  water: Uint8Array, zone: Uint8Array, level: Uint8Array, pop: Uint16Array, variant: Uint8Array,
  road: Uint8Array, pline: Uint8Array, pipe: Uint8Array, tree: Uint8Array, bid: Int32Array,
  fire: Uint8Array, rubble: Uint8Array, powered: Uint8Array, watered: Uint8Array, abandoned: Uint8Array,
  noPow: Uint8Array, roadAcc: Uint8Array, cons: Uint8Array, consTot: Uint8Array, consFrom: Uint8Array,
  rail: Uint8Array, garbage: Uint8Array, garbCov: Uint8Array, trainCov: Uint8Array,
  lv: Uint8Array, poll: Uint8Array, crime: Uint8Array, traffic: Uint8Array,
  police: Uint8Array, fireCov: Uint8Array, health: Uint8Array, edu: Uint8Array, park: Uint8Array,
};
const SAVE_ARRAYS = ['zone', 'level', 'pop', 'variant', 'road', 'pline', 'pipe', 'tree', 'bid', 'rubble', 'abandoned', 'fire', 'cons', 'consTot', 'consFrom', 'rail', 'garbage'];
// trvanie výstavby budov (v rýchlych krokoch simulácie) podľa veľkosti
const B_CONS = { 1: 5, 2: 7, 3: 10, 4: 14, 6: 18 };

export class World {
  constructor(N) {
    this.N = N;
    this.h = new Int8Array((N + 1) * (N + 1));
    for (const [k, T] of Object.entries(TILE_ARRAYS)) this[k] = new T(N * N);
    this.buildings = new Map();
    this.nextId = 1;
    this.chunksN = Math.ceil(N / CHUNK);
    this.dirtyChunks = new Set();
    this.terrainDirty = true;      // geometria terénu
    this.terrainColorDirty = true; // farby terénu
    this.state = {
      name: 'Nové mesto', funds: 20000, year: 1950, month: 0, dayFrac: 0,
      tax: { R: 7, C: 7, I: 7 },
      funding: { police: 100, fire: 100, health: 100, edu: 100, roads: 100, waste: 100 },
      unburied: 0, deaths: 0,
      demand: { R: 0.6, C: 0.1, I: 0.5 },
      stats: { resPop: 0, comJobs: 0, indJobs: 0, powerSupply: 0, powerDemand: 0, waterSupply: 0, waterDemand: 0 },
      history: [], milestone: 0, disasters: true,
      yearAcc: { taxR: 0, taxC: 0, taxI: 0, roads: 0, police: 0, fire: 0, health: 0, edu: 0, power: 0, waste: 0, other: 0 },
      lastYear: null,
    };
  }

  // ---------- indexy ----------
  ci(cx, cy) { return cy * (this.N + 1) + cx; }
  ti(x, y) { return y * this.N + x; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.N && y < this.N; }
  ch(cx, cy) { return this.h[cy * (this.N + 1) + cx]; }
  corners(x, y) {
    const W = this.N + 1, i = y * W + x;
    return [this.h[i], this.h[i + 1], this.h[i + W], this.h[i + W + 1]];
  }
  tileMax(x, y) { const c = this.corners(x, y); return Math.max(c[0], c[1], c[2], c[3]); }
  tileMin(x, y) { const c = this.corners(x, y); return Math.min(c[0], c[1], c[2], c[3]); }

  // výška v úrovniach v ľubovoľnom bode – zodpovedá triangulácii terénu
  heightAt(wx, wz) {
    const N = this.N;
    if (wx < 0) wx = 0; if (wz < 0) wz = 0; if (wx > N - 1e-4) wx = N - 1e-4; if (wz > N - 1e-4) wz = N - 1e-4;
    const x = Math.floor(wx), y = Math.floor(wz);
    const fx = wx - x, fz = wz - y;
    const [a, b, c, d] = this.corners(x, y);
    if (Math.abs(a - d) <= Math.abs(b - c)) {
      if (fx >= fz) return a + (b - a) * fx + (d - b) * fz;
      return a + (c - a) * fz + (d - c) * fx;
    }
    if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }

  updateWater(x, y) { this.water[this.ti(x, y)] = this.tileMax(x, y) <= SEA ? 1 : 0; }

  markDirty(x, y) {
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    this.dirtyChunks.add(cy * this.chunksN + cx);
    // susedné bloky (prepojenie ciest, vedení)
    const lx = x % CHUNK, ly = y % CHUNK;
    if (lx === 0 && cx > 0) this.dirtyChunks.add(cy * this.chunksN + cx - 1);
    if (lx === CHUNK - 1 && cx < this.chunksN - 1) this.dirtyChunks.add(cy * this.chunksN + cx + 1);
    if (ly === 0 && cy > 0) this.dirtyChunks.add((cy - 1) * this.chunksN + cx);
    if (ly === CHUNK - 1 && cy < this.chunksN - 1) this.dirtyChunks.add((cy + 1) * this.chunksN + cx);
    this.terrainColorDirty = true;
  }
  // len prekreslenie bloku (bez prefarbenia terénu) – pre animáciu stavenísk
  markChunk(x, y) { this.dirtyChunks.add(Math.floor(y / CHUNK) * this.chunksN + Math.floor(x / CHUNK)); }
  markAllDirty() {
    for (let i = 0; i < this.chunksN * this.chunksN; i++) this.dirtyChunks.add(i);
    this.terrainDirty = true; this.terrainColorDirty = true;
  }

  // ---------- generovanie ----------
  generate(o) {
    const N = this.N, W = N + 1;
    const nz = makeNoise(o.seed);
    const r = rng(o.seed * 7 + 3);
    const hills = o.hills, wat = o.water;
    const coastSide = Math.floor(r() * 4);
    const tmp = new Float32Array(W * W);
    const scale = 128 / N;
    for (let cy = 0; cy < W; cy++) for (let cx = 0; cx < W; cx++) {
      const nx = cx / 128, ny = cy / 128;
      let e = nz.fbm(nx * 2.2 + 11, ny * 2.2 + 5, 5) * 1.5;
      const ridge = Math.pow(1 - Math.abs(nz.n2(nx * 3.1 + 40, ny * 3.1 - 7)), 3);
      let hgt = SEA + 2.2 + e * (3 + hills * 13) + ridge * hills * 7 - wat * 2.5;
      if (o.coast) {
        const u = cx / N, v = cy / N;
        const d = [u, 1 - u, v, 1 - v][coastSide] + nz.n2(nx * 4, ny * 4) * 0.08;
        hgt -= (1 - smooth(0.04, 0.3 + wat * 0.15, d)) * (8 + wat * 6);
      }
      tmp[cy * W + cx] = hgt;
    }
    for (let i = 0; i < W * W; i++) this.h[i] = Math.max(0, Math.min(MAX_H, Math.round(tmp[i])));

    // rieka
    if (o.river) {
      const vertical = r() < 0.5;
      let pos = N * (0.3 + r() * 0.4);
      const width = 1.6 + r() * 1.4;
      for (let t = -3; t <= N + 3; t++) {
        pos += (nz.n2(t * 0.04, 77.7) * 1.7) + (N / 2 - pos) * 0.004;
        for (let k = -Math.ceil(width) - 1; k <= Math.ceil(width) + 1; k++) {
          const p = Math.round(pos + k);
          const cx = vertical ? p : t, cy = vertical ? t : p;
          if (cx < 0 || cy < 0 || cx > N || cy > N) continue;
          const dd = Math.abs(pos + k - pos);
          if (dd <= width) this.h[this.ci(cx, cy)] = Math.min(this.h[this.ci(cx, cy)], SEA - 1);
        }
      }
    }
    // jazerá
    const lakes = Math.round(wat * 6 * (N / 128));
    for (let l = 0; l < lakes; l++) {
      const lx = r() * N, ly = r() * N, rad = 2 + r() * 5;
      for (let cy = Math.floor(ly - rad); cy <= ly + rad; cy++) for (let cx = Math.floor(lx - rad); cx <= lx + rad; cx++) {
        if (cx < 0 || cy < 0 || cx > N || cy > N) continue;
        const d = Math.hypot(cx - lx, cy - ly) + nz.n2(cx * 0.3, cy * 0.3) * 1.5;
        if (d < rad) this.h[this.ci(cx, cy)] = Math.min(this.h[this.ci(cx, cy)], SEA - 1);
      }
    }
    this.relaxAll();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) this.updateWater(x, y);

    // lesy
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = this.ti(x, y);
      if (this.water[i]) continue;
      const f = nz.fbm(x / 22 + 100, y / 22 - 50, 4) + (hash2(x, y, o.seed) - 0.5) * 0.25;
      const thr = 0.25 - o.trees * 0.55;
      if (f > thr && this.tileMax(x, y) < MAX_H - 3) this.tree[i] = f > thr + 0.25 ? 3 : f > thr + 0.1 ? 2 : 1;
    }
    this.markAllDirty();
  }

  // obmedzenie: susedné rohy sa líšia max. o 1 úroveň (iba znižuje)
  relaxAll() {
    const N = this.N, W = N + 1, h = this.h;
    for (let it = 0; it < 60; it++) {
      let changed = false;
      for (let pass = 0; pass < 2; pass++) {
        for (let k = 0; k < W * W; k++) {
          const i = pass === 0 ? k : W * W - 1 - k;
          const cx = i % W, cy = (i / W) | 0;
          let m = h[i];
          if (cx > 0) m = Math.min(m, h[i - 1] + 1);
          if (cx < N) m = Math.min(m, h[i + 1] + 1);
          if (cy > 0) m = Math.min(m, h[i - W] + 1);
          if (cy < N) m = Math.min(m, h[i + W] + 1);
          if (m < h[i]) { h[i] = m; changed = true; }
        }
      }
      if (!changed) break;
    }
  }

  // ---------- terraformovanie ----------
  cornerLocked(cx, cy) {
    for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
      const x = cx + dx, y = cy + dy;
      if (!this.inb(x, y)) continue;
      const i = this.ti(x, y);
      if (this.bid[i] || this.level[i] > 0) return true;
    }
    return false;
  }

  // sets: [[cx,cy,target],...] -> vráti {ok, cost, changed:Map}
  planTerraform(sets) {
    const N = this.N, W = N + 1;
    const nh = new Map(); // ci -> new height
    const get = i => (nh.has(i) ? nh.get(i) : this.h[i]);
    const fixed = new Set();
    const queue = [];
    for (const [cx, cy, t] of sets) {
      if (cx < 0 || cy < 0 || cx > N || cy > N) continue;
      const i = this.ci(cx, cy), v = Math.max(0, Math.min(MAX_H, t));
      fixed.add(i);
      if (v !== this.h[i]) { nh.set(i, v); queue.push(i); }
    }
    let guard = 0;
    while (queue.length && guard++ < 200000) {
      const i = queue.shift();
      const cx = i % W, cy = (i / W) | 0, v = get(i);
      const nb = [];
      if (cx > 0) nb.push(i - 1); if (cx < N) nb.push(i + 1);
      if (cy > 0) nb.push(i - W); if (cy < N) nb.push(i + W);
      for (const n of nb) {
        if (fixed.has(n)) continue;
        const hv = get(n);
        if (hv < v - 1) { nh.set(n, v - 1); queue.push(n); }
        else if (hv > v + 1) { nh.set(n, v + 1); queue.push(n); }
      }
    }
    let cost = 0;
    for (const [i, v] of nh) {
      const cx = i % W, cy = (i / W) | 0;
      if (this.cornerLocked(cx, cy)) return { ok: false, reason: 'V ceste sú budovy.' };
      cost += Math.abs(v - this.h[i]);
    }
    return { ok: true, cost, changed: nh };
  }

  applyTerraform(changed) {
    const N = this.N, W = N + 1;
    const tiles = new Set();
    for (const [i, v] of changed) {
      this.h[i] = v;
      const cx = i % W, cy = (i / W) | 0;
      for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
        const x = cx + dx, y = cy + dy;
        if (this.inb(x, y)) tiles.add(this.ti(x, y));
      }
    }
    for (const t of tiles) {
      const x = t % N, y = (t / N) | 0;
      this.updateWater(x, y);
      if (this.water[t]) { this.zone[t] = 0; this.tree[t] = 0; this.level[t] = 0; this.pipe[t] = 0; }
      const mn = this.tileMin(x, y), mx = this.tileMax(x, y);
      if (mx - mn > 1 && !this.water[t]) { this.road[t] = 0; this.rail[t] = 0; }
      this.markDirty(x, y);
    }
    this.terrainDirty = true;
  }

  // ---------- stavanie ----------
  isEmpty(i) { return !this.road[i] && !this.pline[i] && !this.bid[i] && !this.rail[i]; }

  clearForBuild(i) { this.tree[i] = 0; this.rubble[i] = 0; this.zone[i] = 0; this.level[i] = 0; this.pop[i] = 0; this.abandoned[i] = 0; this.fire[i] = 0; this.cons[i] = 0; this.consFrom[i] = 0; }

  canRoad(x, y) {
    if (!this.inb(x, y)) return false;
    const i = this.ti(x, y);
    if (this.road[i] || this.bid[i]) return false;
    if (this.level[i] > 0) return false;
    if (this.rail[i] && this.water[i]) return false;
    if (this.water[i]) return true; // most
    return this.tileMax(x, y) - this.tileMin(x, y) <= 1;
  }
  placeRoad(x, y) {
    const i = this.ti(x, y);
    this.clearForBuild(i); this.road[i] = 1; this.markDirty(x, y);
  }
  // železnica: ako cesta, môže križovať cestu (železničné priecestie) a ísť po moste cez vodu
  canRail(x, y) {
    if (!this.inb(x, y)) return false;
    const i = this.ti(x, y);
    if (this.rail[i] || this.bid[i] || this.level[i] > 0) return false;
    if (this.road[i] && this.water[i]) return false;
    if (this.water[i]) return true;
    return this.tileMax(x, y) - this.tileMin(x, y) <= 1;
  }
  placeRail(x, y) {
    const i = this.ti(x, y);
    const keepRoad = this.road[i], keepLine = this.pline[i];
    this.clearForBuild(i); this.road[i] = keepRoad; this.pline[i] = keepLine; this.rail[i] = 1; this.markDirty(x, y);
  }
  canPline(x, y) {
    if (!this.inb(x, y)) return false;
    const i = this.ti(x, y);
    return !this.pline[i] && !this.bid[i] && !(this.level[i] > 0);
  }
  placePline(x, y) {
    const i = this.ti(x, y);
    const keepRoad = this.road[i], keepRail = this.rail[i];
    this.clearForBuild(i); this.road[i] = keepRoad; this.rail[i] = keepRail; this.pline[i] = 1; this.markDirty(x, y);
  }
  canPipe(x, y) { return this.inb(x, y) && !this.pipe[this.ti(x, y)] && !this.water[this.ti(x, y)]; }
  placePipe(x, y) { this.pipe[this.ti(x, y)] = 1; this.markDirty(x, y); }

  canZone(x, y, z) {
    if (!this.inb(x, y)) return false;
    const i = this.ti(x, y);
    if (this.water[i] || !this.isEmpty(i)) return false;
    if (this.zone[i] === z) return false;
    if (this.level[i] > 0) return false;
    return true;
  }
  placeZone(x, y, z) {
    const i = this.ti(x, y);
    this.tree[i] = 0; this.rubble[i] = 0; this.zone[i] = z; this.level[i] = 0; this.pop[i] = 0;
    this.variant[i] = (Math.random() * 256) | 0; this.markDirty(x, y);
  }

  canBuilding(type, x, y) {
    const def = BUILDINGS[type], s = def.size;
    if (def.year > this.state.year) return { ok: false, reason: `Dostupné od roku ${def.year}.` };
    if (def.unique) for (const b of this.buildings.values()) if (b.type === type) return { ok: false, reason: 'Môže existovať iba jedna.' };
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      const tx = x + dx, ty = y + dy;
      if (!this.inb(tx, ty)) return { ok: false, reason: 'Mimo mapy.' };
      const i = this.ti(tx, ty);
      if (this.water[i]) return { ok: false, reason: 'Nedá sa stavať na vode.' };
      if (this.road[i] || this.pline[i] || this.bid[i] || this.rail[i]) return { ok: false, reason: 'Pozemok je obsadený.' };
      if (this.level[i] > 0) return { ok: false, reason: 'Pozemok je zastavaný.' };
    }
    if (def.needsWaterEdge) {
      let found = false;
      for (let dy = -1; dy <= s && !found; dy++) for (let dx = -1; dx <= s; dx++) {
        const tx = x + dx, ty = y + dy;
        if (this.inb(tx, ty) && this.water[this.ti(tx, ty)]) { found = true; break; }
      }
      if (!found) return { ok: false, reason: 'Musí susediť s vodou.' };
    }
    if (def.needsRailEdge) {
      let found = false;
      for (let dy = -1; dy <= s && !found; dy++) for (let dx = -1; dx <= s; dx++) {
        const tx = x + dx, ty = y + dy;
        if ((dx === -1 || dx === s) && (dy === -1 || dy === s)) continue; // rohy sa nepočítajú
        if (this.inb(tx, ty) && this.rail[this.ti(tx, ty)]) { found = true; break; }
      }
      if (!found) return { ok: false, reason: 'Stanica musí susediť so železnicou.' };
    }
    return { ok: true };
  }
  placeBuilding(type, x, y) {
    const def = BUILDINGS[type], s = def.size, id = this.nextId++;
    const park = def.cat === 'park';
    const b = { id, type, x, y, size: s, powered: 0, watered: 0, age: 0, cons: park ? 0 : (B_CONS[s] || 8) };
    b.consTot = b.cons;
    this.buildings.set(id, b);
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      const i = this.ti(x + dx, y + dy);
      this.clearForBuild(i); this.pipe[i] = 1; this.bid[i] = id; this.markDirty(x + dx, y + dy);
    }
    return b;
  }
  removeBuilding(id, rubble = false) {
    const b = this.buildings.get(id);
    if (!b) return;
    for (let dy = 0; dy < b.size; dy++) for (let dx = 0; dx < b.size; dx++) {
      const i = this.ti(b.x + dx, b.y + dy);
      this.bid[i] = 0; this.fire[i] = 0; this.powered[i] = 0; this.rubble[i] = rubble ? 1 : 0;
      this.markDirty(b.x + dx, b.y + dy);
    }
    this.buildings.delete(id);
  }

  // vráti cenu búrania alebo 0
  bulldoze(x, y, dezoneOnly = false) {
    if (!this.inb(x, y)) return 0;
    const i = this.ti(x, y);
    if (dezoneOnly) {
      if (!this.zone[i]) return 0;
      const c = this.level[i] > 0 ? 5 : 1;
      this.zone[i] = 0; this.level[i] = 0; this.pop[i] = 0; this.abandoned[i] = 0; this.cons[i] = 0; this.markDirty(x, y);
      return c;
    }
    if (this.bid[i]) { this.removeBuilding(this.bid[i]); return 10; }
    if (this.level[i] > 0) { this.level[i] = 0; this.pop[i] = 0; this.abandoned[i] = 0; this.zone[i] = 0; this.fire[i] = 0; this.cons[i] = 0; this.markDirty(x, y); return 5; }
    if (this.road[i] || this.pline[i] || this.rail[i]) { const c = this.water[i] ? 5 : 1; this.road[i] = 0; this.pline[i] = 0; this.rail[i] = 0; this.markDirty(x, y); return c; }
    if (this.rubble[i] || this.tree[i]) { this.rubble[i] = 0; this.tree[i] = 0; this.markDirty(x, y); return 1; }
    if (this.zone[i]) { this.zone[i] = 0; this.markDirty(x, y); return 1; }
    return 0;
  }

  // ---------- uloženie ----------
  serialize() {
    const enc = arr => {
      const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s);
    };
    const o = { v: 1, N: this.N, nextId: this.nextId, h: enc(this.h), state: this.state, buildings: [...this.buildings.values()] };
    for (const k of SAVE_ARRAYS) o[k] = enc(this[k]);
    return JSON.stringify(o);
  }
  static deserialize(str) {
    const o = JSON.parse(str);
    const w = new World(o.N);
    const dec = (b64, arr) => {
      const s = atob(b64), u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
      for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    };
    dec(o.h, w.h);
    for (const k of SAVE_ARRAYS) if (o[k]) dec(o[k], w[k]);
    w.nextId = o.nextId;
    const defFunding = { ...w.state.funding }, defAcc = { ...w.state.yearAcc };
    Object.assign(w.state, o.state);
    // staršie uložené hry nemajú nové položky
    w.state.funding = { ...defFunding, ...(o.state.funding || {}) };
    w.state.yearAcc = { ...defAcc, ...(o.state.yearAcc || {}) };
    w.state.unburied = w.state.unburied || 0; w.state.deaths = w.state.deaths || 0;
    for (const b of o.buildings) w.buildings.set(b.id, b);
    for (let y = 0; y < w.N; y++) for (let x = 0; x < w.N; x++) w.updateWater(x, y);
    w.markAllDirty();
    return w;
  }
}

function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
export { Z, zoneKind };
