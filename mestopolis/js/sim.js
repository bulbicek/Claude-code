import { BUILDINGS, POP, zoneKind, zoneDense, powerUse, waterUse, SEA, MILESTONES, MONTHS, fmtMoney, fmtNum } from './config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// trvanie výstavby podľa úrovne zástavby (v rýchlych krokoch)
const CONS_T = [0, 6, 8, 10, 13, 16];

export class Sim {
  constructor(world, hooks) {
    this.w = world;
    this.hooks = hooks; // { news(msg, type), effect(kind,x,y) }
    const n = world.N * world.N;
    this.tmpA = new Float32Array(n);
    this.tmpB = new Float32Array(n);
    this.waterDist = new Uint8Array(n);
    this.adviceTimer = 0;
    this.burning = 0;
  }

  news(m, t = 'info') { this.hooks.news && this.hooks.news(m, t); }

  // ================= mesačný krok =================
  monthTick() {
    const w = this.w, st = w.state;
    this.computeWaterDist();
    this.computePower();
    this.computeWater();
    this.computeCoverage();
    this.computeRail();
    this.computeGarbage();
    this.computeDeaths();
    this.computeTraffic();
    this.computePollution();
    this.computeCrime();
    this.computeLandValue();
    this.computeDemand();
    this.growth();
    this.finance();
    this.randomEvents();

    st.month++;
    if (st.month >= 12) { st.month = 0; this.yearEnd(); st.year++; this.checkUnlocks(); }
    st.history.push({ y: st.year, m: st.month, pop: st.stats.resPop, funds: Math.round(st.funds), jobs: st.stats.comJobs + st.stats.indJobs });
    if (st.history.length > 600) st.history.shift();
    this.milestones();
    this.advisors();
    w.terrainColorDirty = true;
  }

  computeWaterDist() {
    const w = this.w, N = w.N, d = this.waterDist;
    d.fill(9);
    const q = [];
    for (let i = 0; i < N * N; i++) if (w.water[i]) { d[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % N, y = (i / N) | 0, v = d[i] + 1;
      if (v > 8) continue;
      if (x > 0 && d[i - 1] > v) { d[i - 1] = v; q.push(i - 1); }
      if (x < N - 1 && d[i + 1] > v) { d[i + 1] = v; q.push(i + 1); }
      if (y > 0 && d[i - N] > v) { d[i - N] = v; q.push(i - N); }
      if (y < N - 1 && d[i + N] > v) { d[i + N] = v; q.push(i + N); }
    }
  }

  // ---- siete (elektrina / voda) – komponenty spojitosti ----
  networkPass(isConductor, sourceOf, useOf, outArr) {
    const w = this.w, N = w.N, n = N * N;
    const seen = new Uint8Array(n);
    outArr.fill(0);
    let totalSupply = 0, totalDemand = 0;
    for (let s = 0; s < n; s++) {
      if (seen[s] || !isConductor(s)) continue;
      const list = [s]; seen[s] = 1;
      for (let h = 0; h < list.length; h++) {
        const i = list[h], x = i % N, y = (i / N) | 0;
        const nb = [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, y > 0 ? i - N : -1, y < N - 1 ? i + N : -1];
        for (const j of nb) if (j >= 0 && !seen[j] && isConductor(j)) { seen[j] = 1; list.push(j); }
      }
      let supply = 0;
      const counted = new Set();
      for (const i of list) {
        const id = w.bid[i];
        if (id && !counted.has(id)) { counted.add(id); supply += sourceOf(w.buildings.get(id)); }
      }
      if (supply <= 0) continue;
      totalSupply += supply;
      // zdroje začnú – rozdelenie podľa BFS poradia od zdrojov
      let remaining = supply;
      const order = [], seen2 = new Uint8Array(0);
      // poradie: začni od dlaždíc zdrojov
      const inList = new Set(list);
      const visited = new Set();
      for (const i of list) { const id = w.bid[i]; if (id && sourceOf(w.buildings.get(id)) > 0) { order.push(i); visited.add(i); } }
      for (let h = 0; h < order.length; h++) {
        const i = order[h], x = i % N, y = (i / N) | 0;
        const nb = [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, y > 0 ? i - N : -1, y < N - 1 ? i + N : -1];
        for (const j of nb) if (j >= 0 && inList.has(j) && !visited.has(j)) { visited.add(j); order.push(j); }
      }
      for (const i of order) {
        const u = useOf(i);
        totalDemand += u;
        if (remaining >= u) { remaining -= u; outArr[i] = 1; }
      }
    }
    return { supply: totalSupply, demand: totalDemand };
  }

  computePower() {
    const w = this.w;
    const yr = w.state.year;
    const r = this.networkPass(
      i => w.zone[i] > 0 || w.pline[i] || w.bid[i] > 0,
      b => {
        const d = BUILDINGS[b.type];
        if (!d.power || b.cons > 0) return 0;
        let p = d.power;
        if (b.type === 'wind') p *= 0.6 + 0.4 * Math.min(1, (w.tileMax(b.x, b.y) - SEA) / 8);
        if (b.type === 'hydro') p *= 1;
        if (b.type === 'solar') p *= 0.85;
        return p;
      },
      i => (w.cons[i] > 0 ? 0.05 : w.level[i] > 0 && !w.abandoned[i] ? powerUse(w.level[i]) : w.bid[i] ? 0.25 : 0.02),
      w.powered
    );
    w.state.stats.powerSupply = r.supply; w.state.stats.powerDemand = r.demand;
    for (const b of w.buildings.values()) b.powered = w.powered[w.ti(b.x, b.y)];
  }

  computeWater() {
    const w = this.w;
    const r = this.networkPass(
      i => w.pipe[i] || w.zone[i] > 0 || w.bid[i] > 0,
      b => {
        const d = BUILDINGS[b.type];
        if (!d.water || !b.powered || b.cons > 0) return 0;
        let v = d.water;
        if (b.type === 'pump') v *= this.waterDist[w.ti(b.x, b.y)] <= 1 ? 1.8 : 1;
        return v;
      },
      i => (w.level[i] > 0 && !w.abandoned[i] ? waterUse(w.level[i]) : 0.01),
      w.watered
    );
    w.state.stats.waterSupply = r.supply; w.state.stats.waterDemand = r.demand;
  }

  // ---- pokrytie službami ----
  computeCoverage() {
    const w = this.w, N = w.N, st = w.state;
    w.police.fill(0); w.fireCov.fill(0); w.health.fill(0); w.edu.fill(0); w.park.fill(0);
    const stamp = (arr, cx, cy, rad, strength) => {
      const r2 = rad * rad;
      for (let y = Math.max(0, Math.floor(cy - rad)); y <= Math.min(N - 1, cy + rad); y++)
        for (let x = Math.max(0, Math.floor(cx - rad)); x <= Math.min(N - 1, cx + rad); x++) {
          const dd = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
          if (dd > r2) continue;
          const v = strength * Math.pow(1 - Math.sqrt(dd) / rad, 0.6);
          const i = y * N + x;
          arr[i] = Math.min(255, arr[i] + v);
        }
    };
    for (const b of w.buildings.values()) {
      const d = BUILDINGS[b.type];
      if (b.cons > 0) continue;
      const cx = b.x + b.size / 2, cy = b.y + b.size / 2;
      const pf = b.powered ? 1 : 0.5;
      if (d.radius && d.fund) {
        const f = st.funding[d.fund] / 100;
        const arr = { police: w.police, fire: w.fireCov, health: w.health, edu: w.edu }[d.fund];
        if (arr) stamp(arr, cx, cy, d.radius * (0.6 + 0.4 * f), 230 * f * pf);
      }
      if (d.park) stamp(w.park, cx, cy, d.radius, d.park);
    }
    // stromy = malý parkový efekt
    for (let i = 0; i < N * N; i++) if (w.tree[i]) w.park[i] = Math.min(255, w.park[i] + w.tree[i] * 8);
  }

  stampArr(arr, cx, cy, rad, strength) {
    const N = this.w.N, r2 = rad * rad;
    for (let y = Math.max(0, Math.floor(cy - rad)); y <= Math.min(N - 1, cy + rad); y++)
      for (let x = Math.max(0, Math.floor(cx - rad)); x <= Math.min(N - 1, cx + rad); x++) {
        const dd = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
        if (dd > r2) continue;
        const i = y * N + x;
        arr[i] = Math.min(255, arr[i] + strength * Math.pow(1 - Math.sqrt(dd) / rad, 0.6));
      }
  }

  // ---- železnica: siete koľají, stanice, pokrytie vlakom ----
  computeRail() {
    const w = this.w, N = w.N;
    const comp = this.railComp && this.railComp.length === N * N ? this.railComp : (this.railComp = new Int32Array(N * N));
    comp.fill(0);
    let id = 0;
    for (let s0 = 0; s0 < N * N; s0++) {
      if (!w.rail[s0] || comp[s0]) continue;
      id++; comp[s0] = id;
      const q = [s0];
      for (let h = 0; h < q.length; h++) {
        const i = q[h], x = i % N, y = (i / N) | 0;
        for (const j of [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, y > 0 ? i - N : -1, y < N - 1 ? i + N : -1])
          if (j >= 0 && w.rail[j] && !comp[j]) { comp[j] = id; q.push(j); }
      }
    }
    // stanice a ich siete
    const count = new Map();
    this.stations = [];
    for (const b of w.buildings.values()) {
      if (b.type !== 'station' || b.cons > 0) continue;
      const comps = new Set(), tiles = [];
      for (let dy = -1; dy <= b.size; dy++) for (let dx = -1; dx <= b.size; dx++) {
        if ((dx === -1 || dx === b.size) === (dy === -1 || dy === b.size)) continue; // len okraj bez rohov
        const tx = b.x + dx, ty = b.y + dy;
        if (!w.inb(tx, ty)) continue;
        const i = w.ti(tx, ty);
        if (w.rail[i]) { comps.add(comp[i]); tiles.push(i); }
      }
      for (const c of comps) count.set(c, (count.get(c) || 0) + 1);
      this.stations.push({ b, comps, tiles });
    }
    this.activeRail = new Set([...count].filter(([, n]) => n >= 2).map(([c]) => c));
    w.trainCov.fill(0);
    for (const st of this.stations) {
      st.active = [...st.comps].some(c => this.activeRail.has(c));
      if (st.active) this.stampArr(w.trainCov, st.b.x + st.b.size / 2, st.b.y + st.b.size / 2, BUILDINGS.station.radius, 230);
    }
  }

  // ---- odpad: produkcia, zvoz, skládky ----
  computeGarbage() {
    const w = this.w, N = w.N, st = w.state, fund = (st.funding.waste ?? 100) / 100;
    w.garbCov.fill(0);
    let capacity = 0, landfillCap = 0;
    const landfills = [];
    for (const b of w.buildings.values()) {
      const d = BUILDINGS[b.type];
      if (!d.garbage || b.cons > 0) continue;
      if (b.type === 'landfill' && (b.fill || 0) >= d.capacity) { if (!b.full) { b.full = true; this.news('Skládka odpadu je plná! Postavte novú skládku, spaľovňu alebo recykláciu.', 'bad'); } continue; }
      if (b.type === 'recycling' && !b.powered) continue;
      this.stampArr(w.garbCov, b.x + b.size / 2, b.y + b.size / 2, d.radius * (0.7 + 0.3 * fund), 240 * Math.max(0.2, fund));
      capacity += d.garbage * fund;
      if (b.type === 'landfill') { landfills.push(b); landfillCap += d.garbage * fund; }
    }
    // koľko odpadu by sa dalo zviezť (len z pokrytého územia)
    let demand = 0, prod = 0;
    const gen = i => (w.level[i] > 0 && !w.abandoned[i] ? 0.8 + w.pop[i] * (zoneKind(w.zone[i]) === 3 ? 0.08 : 0.05) : 0);
    for (let i = 0; i < N * N; i++) { const g = gen(i); if (!g) continue; prod += g; if (w.garbCov[i] > 30) demand += g; }
    const ratio = demand > 0 ? Math.min(1, capacity / demand) : 1;
    const collected = Math.min(capacity, demand);
    let sum = 0, cnt = 0;
    const bucket = this.garbBucket && this.garbBucket.length === N * N ? this.garbBucket : (this.garbBucket = new Uint8Array(N * N));
    for (let i = 0; i < N * N; i++) {
      let v = w.garbage[i];
      const g = gen(i);
      if (g) {
        const eff = w.garbCov[i] > 30 ? ratio * Math.min(1, w.garbCov[i] / 160) : 0;
        v = v + g * 0.7 * (1 - eff) - 18 * eff;
        sum += Math.max(0, v); cnt++;
      } else v -= 6;   // prázdne pozemky sa časom vyčistia
      v = clamp(v, 0, 255);
      w.garbage[i] = v;
      const bk = v < 90 ? 0 : v < 170 ? 1 : 2;
      if (bk !== bucket[i]) { bucket[i] = bk; w.markChunk(i % N, (i / N) | 0); }
    }
    // skládky sa plnia (spaľovňa a recyklácia odpad nehromadia)
    if (landfillCap > 0) for (const b of landfills) {
      const d = BUILDINGS.landfill;
      const before = Math.floor((b.fill || 0) / d.capacity * 6);
      b.fill = Math.min(d.capacity, (b.fill || 0) + collected * (d.garbage * fund / capacity));
      if (Math.floor(b.fill / d.capacity * 6) !== before) w.markChunk(b.x, b.y);
    }
    Object.assign(st.stats, { garbageProd: Math.round(prod), garbageCap: Math.round(capacity), garbageAvg: cnt ? sum / cnt : 0 });
  }

  // ---- úmrtia a pochovávanie ----
  computeDeaths() {
    const w = this.w, N = w.N, st = w.state;
    let hs = 0, hc = 0;
    for (let i = 0; i < N * N; i++) if (w.pop[i] && zoneKind(w.zone[i]) === 1) { hs += w.health[i]; hc++; }
    const avgH = hc ? hs / hc : 0;
    const deaths = (st.stats.resPop || 0) * 0.0006 * (1.35 - 0.7 * avgH / 255);
    let pending = (st.unburied || 0) + deaths;
    let free = 0;
    for (const b of w.buildings.values()) {
      if (b.cons > 0) continue;
      const d = BUILDINGS[b.type];
      if (d.cremate && b.powered) pending -= Math.min(pending, d.cremate);
    }
    for (const b of w.buildings.values()) {
      if (b.cons > 0 || !BUILDINGS[b.type].graves) continue;
      const cap = BUILDINGS[b.type].graves, fill = b.fill || 0;
      const take = Math.min(pending, cap - fill, 400);
      const before = Math.floor(fill / cap * 8);
      b.fill = fill + take; pending -= take;
      free += cap - b.fill;
      if (Math.floor(b.fill / cap * 8) !== before) w.markChunk(b.x, b.y);
    }
    st.unburied = Math.max(0, pending);
    st.deaths = deaths;
    st.stats.cemeteryFree = Math.round(free);
  }

  // ---- doprava + prístup k ceste ----
  computeTraffic() {
    const w = this.w, N = w.N, t = this.tmpA;
    t.fill(0);
    w.roadAcc.fill(0);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const isZone = w.zone[i] > 0, isB = w.bid[i] > 0;
      if (!isZone && !isB) continue;
      // nájdi najbližšiu cestu do 3 polí
      let best = -1;
      for (let r = 1; r <= 3 && best < 0; r++) {
        for (let dy = -r; dy <= r && best < 0; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
          const j = yy * N + xx;
          if (w.road[j]) { best = j; break; }
        }
      }
      if (best >= 0) {
        w.roadAcc[i] = 1;
        const k = zoneKind(w.zone[i]);
        t[best] += w.pop[i] * (k === 1 ? 0.6 : k === 2 ? 0.9 : 0.5) * (1 - 0.5 * w.trainCov[i] / 255);
        if (isB) { const bt = w.buildings.get(w.bid[i]).type; if (bt === 'stadium' || bt === 'airport' || bt === 'seaport' || bt === 'zoo' || bt === 'funpark') t[best] += 12; }
      }
    }
    // rozprestri po cestách
    const u = this.tmpB;
    for (let it = 0; it < 4; it++) {
      for (let i = 0; i < N * N; i++) {
        if (!w.road[i]) { u[i] = 0; continue; }
        const x = i % N, y = (i / N) | 0;
        let s = t[i] * 0.4, c = 0;
        if (x > 0 && w.road[i - 1]) { s += t[i - 1] * 0.15; c++; }
        if (x < N - 1 && w.road[i + 1]) { s += t[i + 1] * 0.15; c++; }
        if (y > 0 && w.road[i - N]) { s += t[i - N] * 0.15; c++; }
        if (y < N - 1 && w.road[i + N]) { s += t[i + N] * 0.15; c++; }
        u[i] = s + t[i] * 0.15 * (4 - c);
      }
      t.set(u);
    }
    let total = 0;
    const roadFund = w.state.funding.roads / 100;
    for (let i = 0; i < N * N; i++) {
      const v = w.road[i] ? 255 * (1 - Math.exp(-t[i] / (90 * (0.5 + 0.5 * roadFund)))) : 0;
      w.traffic[i] = v;
      total += v;
    }
    this.totalTraffic = total;
  }

  blur(arr, passes = 2) {
    const N = this.w.N, a = this.tmpA, b = this.tmpB;
    for (let i = 0; i < N * N; i++) a[i] = arr[i];
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let s = 0, c = 0;
        for (let k = -2; k <= 2; k++) { const xx = x + k; if (xx >= 0 && xx < N) { s += a[y * N + xx]; c++; } }
        b[y * N + x] = s / c;
      }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let s = 0, c = 0;
        for (let k = -2; k <= 2; k++) { const yy = y + k; if (yy >= 0 && yy < N) { s += b[yy * N + x]; c++; } }
        a[y * N + x] = s / c;
      }
    }
    return a;
  }

  computePollution() {
    const w = this.w, N = w.N, src = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const k = zoneKind(w.zone[i]), L = w.level[i];
      if (k === 3 && L > 0 && !w.abandoned[i]) src[i] += (zoneDense(w.zone[i]) ? 70 : 45) * L;
      if (w.road[i]) src[i] += w.traffic[i] * 0.55;
      if (w.fire[i]) src[i] += 150;
      src[i] += w.garbage[i] * 0.3;
    }
    for (const b of w.buildings.values()) {
      const d = BUILDINGS[b.type];
      if (!d.poll) continue;
      for (let dy = 0; dy < b.size; dy++) for (let dx = 0; dx < b.size; dx++) src[w.ti(b.x + dx, b.y + dy)] += d.poll * 1.6;
    }
    const bl = this.blur(src, 2);
    for (let i = 0; i < N * N; i++) {
      let v = bl[i] * 1.5 + src[i] * 0.25;
      v *= 1 - Math.min(0.55, w.park[i] / 255 * 0.7);
      if (w.water[i]) v *= 0.6;
      w.poll[i] = clamp(v, 0, 255);
    }
  }

  computeCrime() {
    const w = this.w, N = w.N, src = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) {
      if (!w.zone[i]) continue;
      const k = zoneKind(w.zone[i]);
      let v = w.pop[i] * (k === 1 ? 0.35 : k === 2 ? 0.45 : 0.3) + (w.abandoned[i] ? 90 : 0) + (w.level[i] > 0 ? 18 : 0);
      v -= w.lv[i] * 0.12;
      src[i] = Math.max(0, v);
    }
    const bl = this.blur(src, 1);
    for (let i = 0; i < N * N; i++) {
      const v = (bl[i] * 1.6 + src[i] * 0.3) * (1 - w.police[i] / 255 * 0.9);
      w.crime[i] = clamp(v, 0, 255);
    }
  }

  computeLandValue() {
    const w = this.w, N = w.N;
    // ťažisko mesta
    let sx = 0, sy = 0, sp = 0;
    for (let i = 0; i < N * N; i++) if (w.pop[i]) { sx += (i % N) * w.pop[i]; sy += ((i / N) | 0) * w.pop[i]; sp += w.pop[i]; }
    const cx = sp ? sx / sp : N / 2, cy = sp ? sy / sp : N / 2;
    const cityR = Math.max(10, Math.sqrt(sp) * 0.35);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (w.water[i]) { w.lv[i] = 0; continue; }
      let v = 60;
      v += Math.min(25, (w.tileMin(x, y) - SEA) * 2.2);
      const wd = this.waterDist[i];
      if (wd <= 5) v += 34 * (1 - (wd - 1) / 5);
      v += w.park[i] * 0.3 + w.edu[i] * 0.1 + w.health[i] * 0.08 + w.police[i] * 0.05;
      v -= w.poll[i] * 0.75 + w.crime[i] * 0.4 + w.traffic[i] * 0.06;
      if (w.rubble[i]) v -= 25;
      v += w.trainCov[i] * 0.09 - w.garbage[i] * 0.35;
      const dc = Math.hypot(x - cx, y - cy);
      v += Math.max(0, 1 - dc / (cityR * 2.5)) * 40 * Math.min(1, sp / 6000);
      w.lv[i] = clamp(v, 0, 255);
    }
  }

  computeDemand() {
    const w = this.w, st = w.state, N = w.N;
    let resPop = 0, comJobs = 0, indJobs = 0;
    for (let i = 0; i < N * N; i++) {
      const k = zoneKind(w.zone[i]);
      if (k === 1) resPop += w.pop[i]; else if (k === 2) comJobs += w.pop[i]; else if (k === 3) indJobs += w.pop[i];
    }
    const has = t => { for (const b of w.buildings.values()) if (b.type === t) return true; return false; };
    for (const b of w.buildings.values()) if (b.type === 'arco' && b.powered) resPop += BUILDINGS.arco.arcoPop * Math.min(1, b.age / 24);
    const yrs = st.year - 1900;
    const ext = 180 + yrs * 2 + resPop * 0.02;
    const jobs = comJobs + indJobs;
    let rD = Math.tanh((jobs * 1.7 + 420 - resPop) / (resPop * 0.3 + 320));
    let cD = Math.tanh((resPop * 0.24 + indJobs * 0.12 - comJobs + 25) / (comJobs * 0.3 + 120));
    let iD = Math.tanh((resPop * 0.26 + ext - indJobs) / (indJobs * 0.3 + 160));
    rD -= (st.tax.R - 7) * 0.08; cD -= (st.tax.C - 7) * 0.08; iD -= (st.tax.I - 7) * 0.08;
    cD += (st.funding.edu - 100) * 0.001; iD += (st.funding.edu - 100) * 0.0005;
    for (const b of w.buildings.values()) { const a = BUILDINGS[b.type].attraction; if (a && !(b.cons > 0)) { rD += a; cD += a * 0.6; } }
    // nepochovaní zosnulí: mierny, postupne rastúci pokles záujmu o bývanie
    const thr = 40 + resPop * 0.01;
    if (st.unburied > thr) rD -= Math.min(0.25, (st.unburied - thr) / (resPop * 0.05 + 300));
    if (this.activeRail && this.activeRail.size) cD += 0.04;
    if (resPop > 25000 && !has('stadium')) rD = Math.min(rD, 0.05);
    if (comJobs > 6000 && !has('airport')) cD = Math.min(cD, 0.05);
    if (indJobs > 7000 && !has('seaport')) iD = Math.min(iD, 0.05);
    const s = st.demand;
    s.R = clamp(s.R * 0.5 + rD * 0.5, -1, 1);
    s.C = clamp(s.C * 0.5 + cD * 0.5, -1, 1);
    s.I = clamp(s.I * 0.5 + iD * 0.5, -1, 1);
    Object.assign(st.stats, { resPop: Math.round(resPop), comJobs, indJobs });
  }

  growth() {
    const w = this.w, N = w.N, st = w.state;
    const dem = [0, st.demand.R, st.demand.C, st.demand.I];
    for (let i = 0; i < N * N; i++) {
      const z = w.zone[i];
      if (!z || w.fire[i] || w.cons[i] > 0) continue;
      const k = zoneKind(z), dense = zoneDense(z);
      let L = w.level[i];
      const x = i % N, y = (i / N) | 0;
      const powered = w.powered[i], watered = w.watered[i], acc = w.roadAcc[i];
      if (L > 0) {
        if (!powered) w.noPow[i] = Math.min(255, w.noPow[i] + 1); else w.noPow[i] = 0;
      }
      if (Math.random() > 0.4) continue;
      let maxL = dense ? (k === 3 ? 4 : 5) : 2;
      if (!watered) maxL = Math.min(maxL, 2);
      if (w.tileMax(x, y) - w.tileMin(x, y) > 1) maxL = Math.min(maxL, 1);
      let score = dem[k] * 1.1 + (w.lv[i] - 95) / 160;
      if (k === 1) score -= w.poll[i] / 255 * 1.1 + w.crime[i] / 255 * 0.8 + w.traffic[i] / 255 * 0.2;
      else if (k === 2) score -= w.poll[i] / 255 * 0.35 + w.crime[i] / 255 * 0.7 + w.traffic[i] / 255 * 0.1;
      else score -= w.crime[i] / 255 * 0.4 - 0.1;
      if (k !== 3) score += w.park[i] / 255 * 0.3;
      score -= w.garbage[i] / 255 * (k === 3 ? 0.25 : 0.65);
      if (k === 1) score += w.health[i] / 255 * 0.15 + w.edu[i] / 255 * 0.15;
      score += (Math.random() - 0.5) * 0.3;
      const ok = powered && acc;

      // opustené budovy
      if (L > 0 && (w.noPow[i] > 5 || !acc || score < -0.75)) {
        if (!w.abandoned[i] && Math.random() < 0.3) { w.abandoned[i] = 1; w.pop[i] = 0; w.markDirty(x, y); }
        continue;
      }
      if (w.abandoned[i]) {
        if (ok && score > 0.05 && Math.random() < 0.25) { w.abandoned[i] = 0; w.markDirty(x, y); }
        else { if (Math.random() < 0.03) { w.level[i] = 0; w.abandoned[i] = 0; w.rubble[i] = 1; w.markDirty(x, y); } continue; }
      }
      if (!ok) continue;
      if (L < maxL && score > 0.05 && Math.random() < 0.15 + score * 0.45) {
        // vyššie úrovne potrebujú vyššiu hodnotu pozemku
        const need = [0, 0, 30, 70, 105, 140][L + 1] * (k === 3 ? 0.12 : 1);
        if (w.lv[i] >= need || L === 0) {
          const oldL = L;
          L++; w.level[i] = L; w.rubble[i] = 0; w.variant[i] = (Math.random() * 256) | 0; w.tree[i] = 0;
          // stavenisko: nová výstavba alebo prerábka existujúcej budovy
          w.cons[i] = w.consTot[i] = CONS_T[L]; w.consFrom[i] = oldL;
          w.markDirty(x, y);
        }
      } else if (L > 1 && score < -0.3 && Math.random() < -score * 0.25) {
        L--; w.level[i] = L; w.markDirty(x, y);
      } else if (L > maxL) { L = maxL; w.level[i] = L; w.markDirty(x, y); }
      if (!(w.cons[i] > 0)) w.pop[i] = Math.round(POP[k][L] * (0.85 + (w.variant[i] / 255) * 0.3));
    }
  }

  // ---- financie ----
  finance() {
    const w = this.w, st = w.state, s = st.stats, a = st.yearAcc;
    let lvSum = 0, lvCnt = 0;
    for (let i = 0; i < w.N * w.N; i++) if (w.pop[i]) { lvSum += w.lv[i]; lvCnt++; }
    const lvF = 0.7 + (lvCnt ? lvSum / lvCnt : 80) / 255 * 0.8;
    const tR = s.resPop * st.tax.R / 100 * 9 * lvF / 12;
    const tC = s.comJobs * st.tax.C / 100 * 11 * lvF / 12;
    const tI = s.indJobs * st.tax.I / 100 * 10 / 12;
    let roads = 0;
    for (let i = 0; i < w.N * w.N; i++) { if (w.road[i]) roads += w.water[i] ? 2 : 0.5; if (w.rail[i]) roads += w.water[i] ? 3 : 0.8; }
    const cat = { police: 0, fire: 0, health: 0, edu: 0, power: 0, waste: 0, other: 0 };
    for (const b of w.buildings.values()) {
      const d = BUILDINGS[b.type];
      b.age = (b.age || 0) + 1;
      const f = d.fund ? st.funding[d.fund] / 100 : 1;
      const key = d.fund || (d.cat === 'power' || d.cat === 'water' ? 'power' : d.cat === 'death' ? 'health' : 'other');
      if (d.cat === 'transport') { roads += d.upkeep * 12 / 12; continue; }
      cat[key] += d.upkeep * f / 12;
    }
    const roadCost = roads * st.funding.roads / 100 / 12;
    const income = tR + tC + tI;
    const exp = roadCost + cat.police + cat.fire + cat.health + cat.edu + cat.power + cat.waste + cat.other;
    st.funds += income - exp;
    a.taxR += tR; a.taxC += tC; a.taxI += tI; a.roads += roadCost;
    for (const k of Object.keys(cat)) a[k] += cat[k];
    st.monthIncome = income; st.monthExpense = exp;
  }

  yearEnd() {
    const st = this.w.state, a = st.yearAcc;
    const inc = a.taxR + a.taxC + a.taxI, exp = a.roads + a.police + a.fire + a.health + a.edu + a.power + (a.waste || 0) + a.other;
    st.lastYear = { ...a, income: inc, expense: exp, year: st.year };
    this.news(`Koniec roka ${st.year}: príjmy ${fmtMoney(inc)}, výdavky ${fmtMoney(exp)}, bilancia ${fmtMoney(inc - exp)}.`, inc >= exp ? 'good' : 'warn');
    for (const k of Object.keys(a)) a[k] = 0;
    if (st.funds < 0) this.news('Mestská pokladnica je v mínuse! Zvýšte dane alebo znížte výdavky.', 'bad');
  }

  checkUnlocks() {
    const yr = this.w.state.year;
    for (const [k, d] of Object.entries(BUILDINGS)) if (d.year === yr) this.news(`Novinka! Teraz môžete stavať: ${d.name}.`, 'good');
  }

  milestones() {
    const st = this.w.state;
    while (st.milestone < MILESTONES.length && st.stats.resPop >= MILESTONES[st.milestone][0]) {
      this.news(MILESTONES[st.milestone][1], 'good');
      st.milestone++;
    }
  }

  advisors() {
    const w = this.w, st = w.state, s = st.stats;
    if (--this.adviceTimer > 0) return;
    this.adviceTimer = 2 + Math.floor(Math.random() * 3);
    const tips = [];
    if (s.powerDemand > s.powerSupply * 1.0 && s.powerSupply > 0) tips.push(['Energetici hlásia: dopyt po elektrine prevyšuje výrobu! Postavte elektráreň.', 'bad']);
    if (s.powerSupply === 0 && [...w.zone].some(z => z > 0)) tips.push(['Zóny nemajú elektrinu – postavte elektráreň a pripojte ju vedením.', 'bad']);
    if (s.waterDemand > s.waterSupply && s.resPop > 1500) tips.push(['Vodári: vody je málo. Hustá zástavba bez vody nebude rásť.', 'warn']);
    if (st.demand.R > 0.5) tips.push(['Ľudia sa chcú prisťahovať – vyznačte obytné zóny.', 'info']);
    if (st.demand.C > 0.5) tips.push(['Obchodníci žiadajú viac obchodných zón.', 'info']);
    if (st.demand.I > 0.5) tips.push(['Priemysel hľadá pozemky na nové továrne.', 'info']);
    let crime = 0, poll = 0, traf = 0, cnt = 0, roads = 0;
    for (let i = 0; i < w.N * w.N; i++) { if (w.pop[i]) { crime += w.crime[i]; poll += w.poll[i]; cnt++; } if (w.road[i]) { traf += w.traffic[i]; roads++; } }
    if (cnt > 50 && crime / cnt > 90) tips.push(['Polícia: kriminalita rastie, potrebujeme ďalšie stanice.', 'warn']);
    if (cnt > 50 && poll / cnt > 100) tips.push(['Občania sa sťažujú na znečistenie ovzdušia.', 'warn']);
    if (roads > 30 && traf / roads > 140) tips.push(['Dopravné zápchy! Rozšírte cestnú sieť.', 'warn']);
    if (st.tax.R > 10 || st.tax.C > 10 || st.tax.I > 10) tips.push(['Občania protestujú proti vysokým daniam.', 'warn']);
    if (s.resPop > 3000 && ![...w.buildings.values()].some(b => b.type === 'school')) tips.push(['Rodičia volajú po škole pre svoje deti.', 'warn']);
    if (s.resPop > 3000 && ![...w.buildings.values()].some(b => b.type === 'hospital')) tips.push(['Mesto potrebuje nemocnicu.', 'warn']);
    if (s.resPop > 2000 && ![...w.buildings.values()].some(b => b.type === 'fire')) tips.push(['Mesto nemá hasičov – požiar by mohol byť katastrofou.', 'warn']);
    if (s.resPop > 25000 && ![...w.buildings.values()].some(b => b.type === 'stadium')) tips.push(['Obyvatelia nechcú žiť v meste bez štadióna.', 'warn']);
    if (s.comJobs > 6000 && ![...w.buildings.values()].some(b => b.type === 'airport')) tips.push(['Obchod stagnuje – mesto potrebuje letisko.', 'warn']);
    if (s.indJobs > 7000 && ![...w.buildings.values()].some(b => b.type === 'seaport')) tips.push(['Priemysel potrebuje prístav na vývoz tovaru.', 'warn']);
    if (s.resPop > 800 && (s.garbageAvg || 0) > 50) tips.push([s.garbageCap ? 'Smetiari nestíhajú vyvážať odpad – postavte ďalšiu skládku, spaľovňu alebo recykláciu.' : 'Na uliciach sa hromadia smeti! Postavte skládku odpadu.', 'warn']);
    for (const b of w.buildings.values()) if (b.type === 'landfill' && !b.full && (b.fill || 0) > BUILDINGS.landfill.capacity * 0.85) { tips.push(['Skládka odpadu je takmer plná.', 'warn']); break; }
    if ((st.unburied || 0) > 30) tips.push([s.cemeteryFree === 0 && [...w.buildings.values()].some(b => b.type === 'cemetery') ? 'Cintoríny sú plné – postavte nový cintorín alebo krematórium.' : 'Ľudia nemajú kde pochovávať blízkych – postavte cintorín.', 'warn']);
    if (roads > 150 && traf / roads > 120 && !(this.activeRail && this.activeRail.size)) tips.push(['Dopravu by odľahčila železnica: postavte trať a aspoň dve stanice.', 'info']);
    if (tips.length) { const t = tips[Math.floor(Math.random() * tips.length)]; this.news(t[0], t[1]); }
  }

  // ================= rýchly krok (požiare, ...) =================
  // postup výstavby: volá sa z rýchleho kroku (kým hra beží)
  tickConstruction() {
    const w = this.w, N = w.N;
    const stage = (c, t) => Math.floor((1 - c / (t || 8)) * 5);
    for (let i = 0; i < N * N; i++) {
      const c = w.cons[i];
      if (!c) continue;
      const t = w.consTot[i] || 8, before = stage(c, t);
      w.cons[i] = c - 1;
      const x = i % N, y = (i / N) | 0;
      if (c - 1 === 0) {
        const k = zoneKind(w.zone[i]), L = w.level[i];
        if (k && L > 0 && !w.abandoned[i]) w.pop[i] = Math.round(POP[k][L] * (0.85 + (w.variant[i] / 255) * 0.3));
        w.consFrom[i] = 0; w.markChunk(x, y);
      } else if (stage(c - 1, t) !== before) w.markChunk(x, y);
    }
    for (const b of w.buildings.values()) {
      if (!(b.cons > 0)) continue;
      const t = b.consTot || 8, before = stage(b.cons, t);
      b.cons--;
      if (b.cons === 0 || stage(b.cons, t) !== before) w.markChunk(b.x, b.y);
    }
  }

  fastTick() {
    const w = this.w, N = w.N;
    this.tickConstruction();
    let burning = 0;
    const toIgnite = [];
    for (let i = 0; i < N * N; i++) {
      if (!w.fire[i]) continue;
      burning++;
      const x = i % N, y = (i / N) | 0;
      const fc = w.fireCov[i] / 255;
      w.fire[i] = Math.max(0, w.fire[i] - 1 - (Math.random() < fc * 0.8 ? 2 : 0));
      if (Math.random() < 0.13 * (1 - fc * 0.9)) {
        const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];
        const xx = x + d[0], yy = y + d[1];
        if (w.inb(xx, yy)) toIgnite.push([xx, yy]);
      }
      if (w.fire[i] === 0) this.burnOut(x, y);
    }
    for (const [x, y] of toIgnite) this.ignite(x, y);
    this.burning = burning;
  }

  flammable(i) { return !this.w.water[i] && (this.w.level[i] > 0 || this.w.bid[i] > 0 || this.w.tree[i] > 0); }

  ignite(x, y) {
    const w = this.w, i = w.ti(x, y);
    if (!this.flammable(i) || w.fire[i]) return false;
    w.fire[i] = 25 + Math.floor(Math.random() * 30);
    w.markDirty(x, y);
    return true;
  }

  burnOut(x, y) {
    const w = this.w, i = w.ti(x, y);
    if (w.bid[i]) { w.removeBuilding(w.bid[i], true); return; }
    w.level[i] = 0; w.pop[i] = 0; w.abandoned[i] = 0; w.tree[i] = 0; w.rubble[i] = 1;
    w.markDirty(x, y);
  }

  randomEvents() {
    const w = this.w, N = w.N, st = w.state;
    if (!st.disasters) return;
    // náhodný požiar
    if (Math.random() < 0.06) {
      const i = Math.floor(Math.random() * N * N);
      if (w.level[i] > 0 && Math.random() > w.fireCov[i] / 255) {
        if (this.ignite(i % N, (i / N) | 0)) this.news('Požiar! V meste horí – hasiči sú na ceste.', 'bad'), this.hooks.focus && this.hooks.focus(i % N, (i / N) | 0);
      }
    }
    // jadrová havária (veľmi zriedkavo)
    for (const b of w.buildings.values()) {
      if (b.type === 'nuclear' && Math.random() < 0.0004) { this.meltdown(b); break; }
    }
  }

  meltdown(b) {
    this.news('KATASTROFA: Havária jadrovej elektrárne!', 'bad');
    const cx = b.x + 2, cy = b.y + 2;
    this.w.removeBuilding(b.id, true);
    for (let k = 0; k < 30; k++) this.ignite(Math.round(cx + (Math.random() - 0.5) * 10), Math.round(cy + (Math.random() - 0.5) * 10));
    this.hooks.focus && this.hooks.focus(cx, cy);
  }

  startFire(x, y) {
    const w = this.w, N = w.N;
    for (let k = 0; k < 200; k++) {
      const xx = x !== undefined ? x : Math.floor(Math.random() * N), yy = y !== undefined ? y : Math.floor(Math.random() * N);
      if (this.ignite(xx, yy)) { this.news('Požiar! Hasiči sú na ceste.', 'bad'); this.hooks.focus && this.hooks.focus(xx, yy); return true; }
      x = undefined; y = undefined;
    }
    return false;
  }

  earthquake() {
    const w = this.w, N = w.N;
    let cx = N / 2, cy = N / 2, best = 0;
    for (let k = 0; k < 400; k++) { const i = Math.floor(Math.random() * N * N); if (w.pop[i] > best) { best = w.pop[i]; cx = i % N; cy = (i / N) | 0; } }
    this.news('ZEMETRASENIE! Otrasy poškodili budovy.', 'bad');
    for (let k = 0; k < 160; k++) {
      const x = Math.round(cx + (Math.random() - 0.5) * 36), y = Math.round(cy + (Math.random() - 0.5) * 36);
      if (!w.inb(x, y)) continue;
      const i = w.ti(x, y);
      if (Math.random() < 0.12) this.ignite(x, y);
      else if (w.level[i] > 0 && Math.random() < 0.5) { w.level[i] = 0; w.pop[i] = 0; w.rubble[i] = 1; w.markDirty(x, y); }
      else if (w.road[i] && Math.random() < 0.3) { w.road[i] = 0; w.rubble[i] = 1; w.markDirty(x, y); }
    }
    this.hooks.focus && this.hooks.focus(cx, cy);
    return { x: cx, y: cy };
  }

  // tornádo ničí políčko
  smash(x, y) {
    const w = this.w;
    if (!w.inb(x, y)) return;
    const i = w.ti(x, y);
    if (w.bid[i]) { if (Math.random() < 0.15) w.removeBuilding(w.bid[i], true); return; }
    if (w.level[i] > 0 || w.road[i] || w.pline[i] || w.tree[i]) {
      w.level[i] = 0; w.pop[i] = 0; w.road[i] = 0; w.pline[i] = 0; w.tree[i] = 0; w.rubble[i] = 1; w.abandoned[i] = 0;
      w.markDirty(x, y);
    }
  }
}
