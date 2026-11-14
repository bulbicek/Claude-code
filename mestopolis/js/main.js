import { World } from './world.js';
import { Sim } from './sim.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';
import { BUILDINGS, COST, HS, SEA, TOOL_GROUPS, fmtMoney, zoneDense } from './config.js';

const SPEED_MONTH = [Infinity, 7, 3.2, 1.1]; // sekúnd na mesiac
const LINE_TOOLS = ['road', 'pline', 'pipe'];
const RECT_TOOLS = ['bulldoze', 'dezone', 'tree', 'level'];
const UNDO_ARRAYS = ['zone', 'level', 'pop', 'variant', 'road', 'pline', 'pipe', 'tree', 'bid', 'rubble', 'abandoned', 'fire'];

class Game {
  constructor() {
    this.canvas = document.getElementById('view');
    this.r = new Renderer(this.canvas);
    this.ui = new UI(this);
    this.speed = 2;
    this.tool = 'query';
    this.monthAcc = 0; this.fastAcc = 0; this.miniAcc = 0; this.roadAcc = 0; this.autoAcc = 0;
    this.autosave = true;
    this.keys = new Set();
    this.hover = null; this.drag = null; this.pan = null;
    this.tornado = null;
    this.loadSettings();
    this.bindInput();
    addEventListener('resize', () => this.r.resize());
    this.r.resize();
    this.ui.markSpeed(this.speed);
    this.setTool('query');

    // úvodná mapa v pozadí + dialóg
    this.newCity({ name: 'Nové Mesto', size: 128, year: 1950, funds: 20000, hills: 0.45, water: 0.4, trees: 0.5, coast: true, river: true, seed: Math.floor(Math.random() * 99999) }, true);
    this.ui.newCityDialog(true);
    this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
  }

  // ---------- mesto ----------
  newCity(o, silent = false) {
    const w = new World(o.size);
    w.generate(o);
    Object.assign(w.state, { name: o.name, funds: o.funds, year: o.year, month: 0 });
    if (o.year >= 2000) w.state.demand.I = 0.3;
    this.attach(w);
    if (!silent) {
      this.ui.pushNews(`Vitajte, starosta! Mesto ${o.name} bolo založené v roku ${o.year}.`, 'good');
      this.ui.pushNews('Začnite elektrárňou, cestami a zónami. Pomoc nájdete pod tlačidlom „?“.', 'info');
    }
  }

  attach(w) {
    this.world = w;
    this.sim = new Sim(w, {
      news: (m, t) => this.ui.pushNews(m, t),
      focus: (x, y) => { this.r.view.tx = x + 0.5; this.r.view.tz = y + 0.5; },
    });
    this.r.setWorld(w);
    this.refreshMaps();
    this.r.cars.refreshRoads(w);
    this.r.particles.clear(); this.r.flames.clear();
    this.undoStack = []; this.snap = null; this.updateUndoBtn();
    this.tornado = null;
    this.r.syncWorld(1e9);
    this.ui.updateTop();
    this.ui.drawMinimap();
  }

  refreshMaps() {
    const s = this.sim;
    s.computeWaterDist(); s.computePower(); s.computeWater(); s.computeCoverage(); s.computeTraffic();
    s.computePollution(); s.computeCrime(); s.computeLandValue();
    this.world.terrainColorDirty = true;
  }

  save(silent = false) {
    try {
      localStorage.setItem('mestopolis-save', this.world.serialize());
      if (!silent) this.ui.pushNews('Mesto bolo uložené.', 'good');
    } catch (e) { this.ui.pushNews('Uloženie zlyhalo: ' + e.message, 'bad'); }
  }
  load() {
    let s = null; try { s = localStorage.getItem('mestopolis-save'); } catch (e) { }
    if (!s) { this.ui.pushNews('Žiadne uložené mesto.', 'warn'); return; }
    try { this.attach(World.deserialize(s)); this.ui.pushNews(`Mesto ${this.world.state.name} bolo nahraté.`, 'good'); }
    catch (e) { this.ui.pushNews('Nahrávanie zlyhalo: ' + e.message, 'bad'); }
  }
  exportFile() {
    const blob = new Blob([this.world.serialize()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = (this.world.state.name || 'mesto').replace(/\s+/g, '_') + '.mestopolis.json';
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  importFile() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
    inp.onchange = async () => {
      try { this.attach(World.deserialize(await inp.files[0].text())); this.ui.pushNews('Mesto bolo importované.', 'good'); }
      catch (e) { this.ui.pushNews('Import zlyhal: ' + e.message, 'bad'); }
    };
    inp.click();
  }
  saveSettings() { try { localStorage.setItem('mestopolis-settings', JSON.stringify({ ...this.r.settings, autosave: this.autosave })); } catch (e) { } }
  loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('mestopolis-settings') || '{}');
      if ('autosave' in s) this.autosave = s.autosave;
      delete s.autosave;
      Object.assign(this.r.settings, s);
    } catch (e) { }
  }

  setSpeed(s) { this.speed = s; this.ui.markSpeed(s); }
  setOverlay(k) {
    this.r.overlay = k;
    this.world.terrainColorDirty = true;
    this.ui.legend(k);
    this.r.setUnderground(k === 'water' || this.tool === 'pipe');
  }

  setTool(t) {
    if (this.drag) this.cancelDrag();
    this.tool = t;
    this.ui.markTool(t);
    this.r.setUnderground(t === 'pipe' || this.r.overlay === 'water');
    this.ui.status(this.toolLabel(t));
    this.updateHighlight();
  }

  toolLabel(t) {
    for (const g of TOOL_GROUPS) for (const it of g.items) if (it.id === t) {
      if (t.startsWith('b:')) { const d = BUILDINGS[t.slice(2)]; return `${d.name} – ${fmtMoney(d.cost)}`; }
      return it.name + (it.cost ? ` – ${fmtMoney(it.cost)}` : '');
    }
    return t;
  }

  // ---------- disasters ----------
  disaster(kind) {
    if (kind === 'fire') this.sim.startFire();
    else if (kind === 'quake') { this.sim.earthquake(); this.r.shake = 1.2; }
    else if (kind === 'tornado') {
      const N = this.world.N;
      const x = N * 0.2 + Math.random() * N * 0.6, z = N * 0.2 + Math.random() * N * 0.6;
      const a = Math.random() * Math.PI * 2;
      this.tornado = { x, z, vx: Math.cos(a) * 1.6, vz: Math.sin(a) * 1.6, life: 22, acc: 0 };
      this.ui.pushNews('TORNÁDO! Obyvatelia sa ukrývajú v pivniciach.', 'bad');
      this.r.view.tx = x; this.r.view.tz = z;
    }
  }

  updateTornado(dt) {
    const t = this.tornado; if (!t) return;
    const w = this.world;
    t.life -= dt;
    t.vx += (Math.random() - 0.5) * dt * 3; t.vz += (Math.random() - 0.5) * dt * 3;
    const sp = Math.hypot(t.vx, t.vz); t.vx = t.vx / sp * 1.7; t.vz = t.vz / sp * 1.7;
    t.x += t.vx * dt; t.z += t.vz * dt;
    if (t.life <= 0 || t.x < 1 || t.z < 1 || t.x > w.N - 1 || t.z > w.N - 1) { this.tornado = null; return; }
    t.acc += dt;
    if (t.acc > 0.12) { t.acc = 0; this.sim.smash(Math.floor(t.x), Math.floor(t.z)); if (Math.random() < 0.4) this.sim.smash(Math.floor(t.x + Math.random() * 2 - 1), Math.floor(t.z + Math.random() * 2 - 1)); }
    const gy = w.heightAt(t.x, t.z) * HS;
    for (let k = 0; k < 6; k++) {
      const hgt = Math.random() * 3.2, a = Math.random() * Math.PI * 2, rad = 0.12 + hgt * 0.28;
      const g = 0.35 + Math.random() * 0.25;
      this.r.particles.spawn(t.x + Math.cos(a) * rad, gy + hgt, t.z + Math.sin(a) * rad, -Math.sin(a) * 2.5, 0.8, Math.cos(a) * 2.5, 0.15 + hgt * 0.07, 0.3 + hgt * 0.1, 0.35, [g, g * 0.95, g * 0.85], 0.8);
    }
  }

  // ---------- vstup ----------
  ndc(e) {
    const r = this.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1];
  }

  bindInput() {
    const c = this.canvas;
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('mousedown', e => {
      this.ui.hideFlyout();
      if ((e.button === 2 || e.button === 1) && this.drag) { this.cancelDrag(); return; }
      if (e.button === 1 || e.button === 2) { this.pan = { x: e.clientX, y: e.clientY, tx: this.r.view.tx, tz: this.r.view.tz }; return; }
      if (e.button !== 0) return;
      const p = this.r.pick(...this.ndc(e));
      if (!p || p.outside) return;
      this.startTool(p);
    });
    addEventListener('mousemove', e => {
      if (this.pan) {
        const v = this.r.view, s = (v.zoom * 2) / this.canvas.clientHeight;
        const { right, fwd } = this.r.screenAxes();
        const dx = (e.clientX - this.pan.x) * s, dy = (e.clientY - this.pan.y) * s / Math.sin(v.el);
        v.tx = this.pan.tx - right[0] * dx + fwd[0] * dy;
        v.tz = this.pan.tz - right[1] * dx + fwd[1] * dy;
        this.clampView();
        return;
      }
      if (e.target !== c) return;
      const p = this.r.pick(...this.ndc(e));
      this.onHover(p);
    });
    addEventListener('mouseup', e => {
      if (this.pan && (e.button === 1 || e.button === 2)) { this.pan = null; return; }
      if (e.button === 0 && this.drag) this.endTool();
    });
    // ---- dotykové ovládanie: 1 prst = nástroj (pri info nástroji posun), 2 prsty = posun + zoom ----
    const tpos = t => ({ clientX: t.clientX, clientY: t.clientY });
    let touch = null;
    c.addEventListener('touchstart', e => {
      e.preventDefault();
      this.ui.hideFlyout();
      const ts = e.touches;
      if (ts.length >= 2) {
        if (this.drag) this.cancelDrag();
        const mx = (ts[0].clientX + ts[1].clientX) / 2, my = (ts[0].clientY + ts[1].clientY) / 2;
        touch = { mode: 'pinch', x: mx, y: my, d: Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY), zoom: this.r.view.zoom, tx: this.r.view.tx, tz: this.r.view.tz };
        return;
      }
      const t = tpos(ts[0]);
      const p = this.r.pick(...this.ndc(t));
      if (this.tool === 'query') { touch = { mode: 'pan', x: t.clientX, y: t.clientY, tx: this.r.view.tx, tz: this.r.view.tz, moved: false, p }; return; }
      touch = { mode: 'tool' };
      this.onHover(p);
      if (p && !p.outside) this.startTool(p);
    }, { passive: false });
    c.addEventListener('touchmove', e => {
      e.preventDefault();
      if (!touch) return;
      const ts = e.touches, v = this.r.view;
      const panBy = (sx, sy, x, y, tx, tz) => {
        const s = (v.zoom * 2) / this.canvas.clientHeight, { right, fwd } = this.r.screenAxes();
        const dx = (x - sx) * s, dy = (y - sy) * s / Math.sin(v.el);
        v.tx = tx - right[0] * dx + fwd[0] * dy; v.tz = tz - right[1] * dx + fwd[1] * dy;
        this.clampView();
      };
      if (touch.mode === 'pinch' && ts.length >= 2) {
        const mx = (ts[0].clientX + ts[1].clientX) / 2, my = (ts[0].clientY + ts[1].clientY) / 2;
        const d = Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
        v.zoom = Math.max(3, Math.min(this.world.N * 0.6, touch.zoom * touch.d / Math.max(10, d)));
        panBy(touch.x, touch.y, mx, my, touch.tx, touch.tz);
      } else if (touch.mode === 'pan') {
        const t = ts[0];
        if (Math.hypot(t.clientX - touch.x, t.clientY - touch.y) > 8) touch.moved = true;
        if (touch.moved) panBy(touch.x, touch.y, t.clientX, t.clientY, touch.tx, touch.tz);
      } else if (touch.mode === 'tool') {
        this.onHover(this.r.pick(...this.ndc(tpos(ts[0]))));
      }
    }, { passive: false });
    c.addEventListener('touchend', e => {
      e.preventDefault();
      if (!touch) return;
      if (e.touches.length > 0) return;
      if (touch.mode === 'pan' && !touch.moved && touch.p && !touch.p.outside) this.startTool(touch.p);
      if (touch.mode === 'tool' && this.drag) this.endTool();
      touch = null;
    }, { passive: false });

    c.addEventListener('wheel', e => {
      e.preventDefault();
      const v = this.r.view;
      v.zoom = Math.max(3, Math.min(this.world.N * 0.6, v.zoom * (e.deltaY > 0 ? 1.15 : 1 / 1.15)));
    }, { passive: false });
    addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === 'q') this.rotate(-1);
      if (k === 'e') this.rotate(1);
      if (k === ' ') { e.preventDefault(); this.setSpeed(this.speed === 0 ? (this.prevSpeed || 2) : (this.prevSpeed = this.speed, 0)); }
      if (k === '1' || k === '2' || k === '3') this.setSpeed(+k);
      if (k === '0') this.setSpeed(0);
      if (k === 'escape') { if (!this.cancelDrag()) { this.setTool('query'); this.ui.hideFlyout(); } }
      if (k === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.undo(); return; }
      if (k === 'b') this.setTool('bulldoze');
      if (k === 'r') this.setTool('road');
      if (k === 'g') { this.r.settings.grid = !this.r.settings.grid; this.saveSettings(); }
      if (k === 'u') this.r.setUnderground(!this.r.underground);
      if (k === '+' || k === '=') this.r.view.zoom = Math.max(3, this.r.view.zoom / 1.2);
      if (k === '-') this.r.view.zoom = Math.min(this.world.N * 0.6, this.r.view.zoom * 1.2);
      if (k === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.save(); }
    });
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    document.getElementById('rotL').onclick = () => this.rotate(-1);
    document.getElementById('rotR').onclick = () => this.rotate(1);
    document.getElementById('undoBtn').onclick = () => this.undo();
    document.getElementById('zoomIn').onclick = () => this.r.view.zoom = Math.max(3, this.r.view.zoom / 1.3);
    document.getElementById('zoomOut').onclick = () => this.r.view.zoom = Math.min(this.world.N * 0.6, this.r.view.zoom * 1.3);
    const mm = document.getElementById('minimap');
    const mmMove = e => {
      const r = mm.getBoundingClientRect();
      this.r.view.tx = (e.clientX - r.left) / r.width * this.world.N;
      this.r.view.tz = (e.clientY - r.top) / r.height * this.world.N;
    };
    mm.addEventListener('mousedown', e => { mmMove(e); const mv = ev => mmMove(ev); const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); }; addEventListener('mousemove', mv); addEventListener('mouseup', up); });
  }

  rotate(d) {
    const v = this.r.view;
    if (d < 0) v.rot -= 1; else v.rot += 1;
    // az nasleduje plynulo (v.rot môže byť ľubovoľné celé číslo)
  }

  clampView() {
    const v = this.r.view, N = this.world.N;
    v.tx = Math.max(-5, Math.min(N + 5, v.tx)); v.tz = Math.max(-5, Math.min(N + 5, v.tz));
  }

  // ---------- nástroje ----------
  bSize() { return this.tool.startsWith('b:') ? BUILDINGS[this.tool.slice(2)].size : 1; }
  bOrigin(p) { const s = this.bSize(); return [p.tx - Math.floor((s - 1) / 2), p.ty - Math.floor((s - 1) / 2)]; }

  onHover(p) {
    const key = p && !p.outside ? `${p.tx},${p.ty}` : null;
    const changed = key !== this.hoverKey;
    this.hover = p && !p.outside ? p : null;
    this.hoverKey = key;
    if (!this.hover) { this.r.setHighlight([], 0xffffff); return; }
    if (this.drag) {
      if (changed) {
        this.drag.cur = [p.tx, p.ty];
        if (['raise', 'lower', 'tree'].includes(this.tool) && this.drag.paint) this.applyPaint(p.tx, p.ty);
      }
    }
    if (changed) this.updateHighlight();
  }

  linePath(a, b) {
    const pts = [];
    let [x, y] = a; const [x1, y1] = b;
    const horizFirst = Math.abs(x1 - x) >= Math.abs(y1 - y);
    const sx = Math.sign(x1 - x), sy = Math.sign(y1 - y);
    pts.push([x, y]);
    if (horizFirst) { while (x !== x1) { x += sx; pts.push([x, y]); } while (y !== y1) { y += sy; pts.push([x, y]); } }
    else { while (y !== y1) { y += sy; pts.push([x, y]); } while (x !== x1) { x += sx; pts.push([x, y]); } }
    return pts;
  }
  rectTiles(a, b) {
    const pts = [];
    for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++) for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++) pts.push([x, y]);
    return pts;
  }

  // vyhodnotí operáciu: vráti {tiles:[[x,y,ok]], cost}
  evaluate(tiles) {
    const w = this.world, t = this.tool;
    let cost = 0;
    const res = [];
    for (const [x, y] of tiles) {
      if (!w.inb(x, y)) continue;
      const i = w.ti(x, y);
      let ok = false, c = 0;
      if (t === 'road') { ok = w.canRoad(x, y); c = w.water[i] ? COST.bridge : COST.road; }
      else if (t === 'pline') { ok = w.canPline(x, y); c = w.water[i] ? COST.plineWater : COST.pline; }
      else if (t === 'pipe') { ok = w.canPipe(x, y); c = COST.pipe; }
      else if (t.startsWith('z:')) { const z = +t.slice(2); ok = w.canZone(x, y, z); c = zoneDense(z) ? COST.zoneDense : COST.zoneLight; }
      else if (t === 'bulldoze') { ok = !!(w.bid[i] || w.level[i] || w.road[i] || w.pline[i] || w.rubble[i] || w.tree[i] || w.zone[i]); c = w.bid[i] ? 10 : w.level[i] ? 5 : 1; }
      else if (t === 'dezone') { ok = !!w.zone[i]; c = 1; }
      else if (t === 'tree') { ok = !w.water[i] && w.isEmpty(i) && !w.zone[i] && w.tree[i] < 3; c = COST.tree; }
      else if (t === 'level') { ok = true; }
      if (ok) cost += c;
      res.push([x, y, ok]);
    }
    return { tiles: res, cost };
  }

  updateHighlight() {
    const w = this.world; if (!w) return;
    const p = this.hover;
    if (!p) { this.r.setHighlight([], 0xffffff); return; }
    const t = this.tool;
    let tiles = [], cost = 0, extra = '';
    if (this.drag && (LINE_TOOLS.includes(t) || RECT_TOOLS.includes(t) || t.startsWith('z:'))) {
      const pts = LINE_TOOLS.includes(t) ? this.linePath(this.drag.start, this.drag.cur) : this.rectTiles(this.drag.start, this.drag.cur);
      const ev = this.evaluate(pts);
      tiles = ev.tiles.map(([x, y, ok]) => [x, y, ok ? 0x5cff5c : 0xff4040]);
      cost = ev.cost;
      if (t === 'level') { const pl = this.levelPlan(); cost = pl ? pl.cost * COST.terra : 0; if (!pl || !pl.ok) tiles = tiles.map(q => [q[0], q[1], 0xff4040]); }
    } else if (t.startsWith('b:')) {
      const [ox, oy] = this.bOrigin(p), s = this.bSize();
      const ok = w.canBuilding(t.slice(2), ox, oy);
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) tiles.push([ox + dx, oy + dy, ok.ok ? 0x5cff5c : 0xff4040]);
      cost = BUILDINGS[t.slice(2)].cost;
      if (!ok.ok) extra = ' – ' + ok.reason;
    } else {
      const col = t === 'bulldoze' ? 0xff8040 : t === 'query' ? 0xffffff : 0xffff60;
      tiles = [[p.tx, p.ty, col]];
      if (t === 'raise' || t === 'lower') cost = COST.terra;
    }
    this.r.setHighlight(tiles, 0xffffff);
    const i = w.ti(p.tx, p.ty);
    this.ui.status(`${this.toolLabel(t)}${cost ? ` | Cena: ${fmtMoney(cost)}` : ''}${extra}   [${p.tx},${p.ty}]`);
  }

  spend(cost) {
    const st = this.world.state;
    if (cost > st.funds) { this.ui.pushNews('Nedostatok peňazí v mestskej pokladnici!', 'bad'); return false; }
    st.funds -= cost; return true;
  }

  startTool(p) {
    const t = this.tool, w = this.world;
    if (t === 'query') { this.ui.tileInfo(p.tx, p.ty); return; }
    if (t.startsWith('b:')) {
      const type = t.slice(2), [ox, oy] = this.bOrigin(p);
      const ok = w.canBuilding(type, ox, oy);
      if (!ok.ok) { this.ui.status(ok.reason); return; }
      if (BUILDINGS[type].cost > w.state.funds) { this.spend(BUILDINGS[type].cost); return; }
      this.recordStart();
      this.spend(BUILDINGS[type].cost);
      w.placeBuilding(type, ox, oy);
      this.recordEnd(BUILDINGS[type].name);
      this.afterEdit();
      return;
    }
    this.recordStart();
    this.drag = { start: [p.tx, p.ty], cur: [p.tx, p.ty], paint: ['raise', 'lower', 'tree'].includes(t), done: new Set(), level: w.tileMax(p.tx, p.ty) };
    if (t === 'level') { const c = w.corners(p.tx, p.ty); this.drag.level = Math.round((c[0] + c[1] + c[2] + c[3]) / 4); }
    if (this.drag.paint) this.applyPaint(p.tx, p.ty);
    this.updateHighlight();
  }

  applyPaint(x, y) {
    const w = this.world, t = this.tool, key = x + ',' + y;
    if (t === 'tree') {
      if (this.drag.done.has(key)) return;
      this.drag.done.add(key);
      const ev = this.evaluate([[x, y]]);
      if (ev.tiles[0] && ev.tiles[0][2] && this.spend(COST.tree)) { const i = w.ti(x, y); w.tree[i] = Math.min(3, w.tree[i] + 2); w.markDirty(x, y); }
      return;
    }
    if (this.drag.done.has(key)) return;
    this.drag.done.add(key);
    const dir = t === 'raise' ? 1 : -1;
    const c = w.corners(x, y);
    const base = dir > 0 ? Math.min(...c) + 1 : Math.max(...c) - 1;
    const sets = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]].map(([cx, cy]) => [cx, cy, dir > 0 ? Math.max(w.ch(cx, cy), base) : Math.min(w.ch(cx, cy), base)]);
    const plan = w.planTerraform(sets);
    if (!plan.ok) { this.ui.status(plan.reason); return; }
    if (!plan.cost) return;
    if (!this.spend(plan.cost * COST.terra)) return;
    w.applyTerraform(plan.changed);
    this.afterEdit();
  }

  levelPlan() {
    const w = this.world, d = this.drag;
    const [a, b] = [d.start, d.cur];
    const sets = [];
    for (let cy = Math.min(a[1], b[1]); cy <= Math.max(a[1], b[1]) + 1; cy++) for (let cx = Math.min(a[0], b[0]); cx <= Math.max(a[0], b[0]) + 1; cx++) sets.push([cx, cy, d.level]);
    return w.planTerraform(sets);
  }

  endTool() {
    this._endTool();
    this.recordEnd(this.toolLabel(this.tool).split(' – ')[0]);
  }

  // zrušenie rozpracovanej akcie (Esc, pravé tlačidlo počas ťahania, druhý prst)
  cancelDrag() {
    if (!this.drag) return false;
    const painted = this.drag.paint && this.drag.done.size;
    this.drag = null;
    if (painted) { this.recordEnd('úprava'); this.undo(true); } else this.snap = null;
    this.updateHighlight();
    this.ui.status('Akcia zrušená.');
    return true;
  }

  // ---------- späť (undo) ----------
  recordStart() {
    const w = this.world;
    this.snap = { a: {}, h: w.h.slice(), b: new Map(w.buildings), nextId: w.nextId, funds: w.state.funds };
    for (const k of UNDO_ARRAYS) this.snap.a[k] = w[k].slice();
  }
  recordEnd(label) {
    const s = this.snap, w = this.world; this.snap = null;
    if (!s) return;
    const rec = { label, a: {}, h: [], added: [], removed: [], nextId: s.nextId, spent: s.funds - w.state.funds };
    let any = false;
    for (const k of UNDO_ARRAYS) {
      const o = s.a[k], c = w[k], d = [];
      for (let i = 0; i < c.length; i++) if (o[i] !== c[i]) d.push(i, o[i]);
      if (d.length) { rec.a[k] = d; any = true; }
    }
    for (let i = 0; i < w.h.length; i++) if (s.h[i] !== w.h[i]) { rec.h.push(i, s.h[i]); any = true; }
    for (const id of w.buildings.keys()) if (!s.b.has(id)) rec.added.push(id);
    for (const [id, b] of s.b) if (!w.buildings.has(id)) rec.removed.push(b);
    if (!any && !rec.added.length && !rec.removed.length) return;
    this.undoStack.push(rec);
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.updateUndoBtn();
  }
  undo(silent = false) {
    if (this.drag) { this.cancelDrag(); return; }
    const rec = this.undoStack.pop(), w = this.world;
    this.updateUndoBtn();
    if (!rec) { this.ui.status('Nie je čo vrátiť.'); return; }
    const N = w.N, W = N + 1, tiles = new Set();
    for (const k in rec.a) { const d = rec.a[k], arr = w[k]; for (let j = 0; j < d.length; j += 2) { arr[d[j]] = d[j + 1]; tiles.add(d[j]); } }
    for (let j = 0; j < rec.h.length; j += 2) {
      const ci = rec.h[j]; w.h[ci] = rec.h[j + 1];
      const cx = ci % W, cy = (ci / W) | 0;
      for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) if (w.inb(cx + dx, cy + dy)) tiles.add(w.ti(cx + dx, cy + dy));
    }
    if (rec.h.length) w.terrainDirty = true;
    for (const id of rec.added) w.buildings.delete(id);
    for (const b of rec.removed) w.buildings.set(b.id, b);
    if (rec.added.length && w.nextId === rec.nextId + rec.added.length) w.nextId = rec.nextId;
    for (const t of tiles) { const x = t % N, y = (t / N) | 0; w.updateWater(x, y); w.markDirty(x, y); }
    w.state.funds += rec.spent;
    this.afterEdit();
    this.updateHighlight();
    if (!silent) this.ui.status(`Vrátené: ${rec.label}${rec.spent > 0 ? ` (+${fmtMoney(rec.spent)})` : ''}`);
  }
  updateUndoBtn() {
    const b = document.getElementById('undoBtn');
    if (b) b.disabled = !(this.undoStack && this.undoStack.length);
  }

  _endTool() {
    const d = this.drag; this.drag = null;
    const w = this.world, t = this.tool;
    if (d.paint) { this.updateHighlight(); return; }
    if (t === 'level') {
      const plan = (this.drag = d, this.levelPlan()); this.drag = null;
      if (!plan.ok) { this.ui.pushNews('Terén sa nedá vyrovnať: ' + plan.reason, 'warn'); }
      else if (plan.cost && this.spend(plan.cost * COST.terra)) { w.applyTerraform(plan.changed); this.afterEdit(); }
      this.updateHighlight();
      return;
    }
    const pts = LINE_TOOLS.includes(t) ? this.linePath(d.start, d.cur) : this.rectTiles(d.start, d.cur);
    const ev = this.evaluate(pts);
    if (!ev.tiles.some(q => q[2])) { this.updateHighlight(); return; }
    if (ev.cost > w.state.funds) { this.ui.pushNews('Nedostatok peňazí v mestskej pokladnici!', 'bad'); this.updateHighlight(); return; }
    let spent = 0;
    for (const [x, y, ok] of ev.tiles) {
      if (!ok) continue;
      if (t === 'road') { if (!w.canRoad(x, y)) continue; spent += w.water[w.ti(x, y)] ? COST.bridge : COST.road; w.placeRoad(x, y); }
      else if (t === 'pline') { if (!w.canPline(x, y)) continue; spent += w.water[w.ti(x, y)] ? COST.plineWater : COST.pline; w.placePline(x, y); }
      else if (t === 'pipe') { spent += COST.pipe; w.placePipe(x, y); }
      else if (t.startsWith('z:')) { const z = +t.slice(2); spent += zoneDense(z) ? COST.zoneDense : COST.zoneLight; w.placeZone(x, y, z); }
      else if (t === 'bulldoze') spent += w.bulldoze(x, y);
      else if (t === 'dezone') spent += w.bulldoze(x, y, true);
    }
    w.state.funds -= spent;
    this.afterEdit();
    this.updateHighlight();
  }

  afterEdit() {
    this.sim.computePower(); this.sim.computeWater(); this.sim.computeTraffic();
    this.r.cars.refreshRoads(this.world);
    this.world.terrainColorDirty = true;
    this.ui.updateTop();
  }

  // ---------- slučka ----------
  frame(t) {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    const time = t / 1000;
    const w = this.world;
    // posun klávesmi
    const v = this.r.view, { right, fwd } = this.r.screenAxes(), sp = v.zoom * 1.2 * dt;
    const K = this.keys;
    if (!document.querySelector('#dialogs input:focus')) {
      if (K.has('a') || K.has('arrowleft')) { v.tx -= right[0] * sp; v.tz -= right[1] * sp; }
      if (K.has('d') || K.has('arrowright')) { v.tx += right[0] * sp; v.tz += right[1] * sp; }
      if (K.has('w') || K.has('arrowup')) { v.tx += fwd[0] * sp; v.tz += fwd[1] * sp; }
      if (K.has('s') || K.has('arrowdown')) { if (!K.has('control')) { v.tx -= fwd[0] * sp; v.tz -= fwd[1] * sp; } }
      this.clampView();
    }
    // simulácia
    if (this.speed > 0) {
      this.monthAcc += dt;
      if (this.monthAcc >= SPEED_MONTH[this.speed]) {
        this.monthAcc = 0;
        this.sim.monthTick();
        this.r.cars.refreshRoads(w);
        this.ui.updateTop();
        if (this.autosave && ++this.autoAcc >= 12) { this.autoAcc = 0; this.save(true); }
      }
      this.fastAcc += dt * [0, 0.6, 1, 1.8][this.speed];
      if (this.fastAcc > 0.35) { this.fastAcc = 0; this.sim.fastTick(); }
      if (this.r.settings.timeMode === 'cycle') this.r.tod = (this.r.tod + dt / 150 * [0, 0.7, 1, 2][this.speed]) % 1;
      this.updateTornado(dt);
    }
    w.state.dayFrac = this.monthAcc / SPEED_MONTH[this.speed || 2];
    this.r.syncWorld(this.speed === 0 ? 14 : 7);
    const sf = [0, 0.6, 1, 1.6][this.speed];
    this.r.spawnEffects(dt * (this.speed ? 1 : 0), this.sim, sf);
    const target = Math.round(Math.min(650, this.r.cars.roadTiles.length * 0.12 + (this.sim.totalTraffic || 0) / 260));
    this.r.cars.update(dt * sf, w, target, this.r.night, 1);
    this.r.icons.update(w, time, this.r.view.zoom);
    this.r.render(dt, time);
    this.miniAcc += dt;
    if (this.miniAcc > 1) { this.miniAcc = 0; this.ui.drawMinimap(); }
    requestAnimationFrame(tt => this.frame(tt));
  }
}

function showFatal(msg) {
  let el = document.getElementById('fatal');
  if (!el) {
    el = document.createElement('div'); el.id = 'fatal'; el.className = 'win';
    el.innerHTML = '<div class="title"><span>Chyba</span><button>✕</button></div><div class="body"></div>';
    el.querySelector('button').onclick = () => el.remove();
    document.body.appendChild(el);
  }
  el.querySelector('.body').textContent = msg;
}
addEventListener('error', e => showFatal('Nastala chyba: ' + (e.message || e.error) + (e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : '')));
addEventListener('unhandledrejection', e => showFatal('Nastala chyba: ' + (e.reason && e.reason.message || e.reason)));
try { window.game = new Game(); }
catch (e) {
  const webgl = (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch (_) { return false; } })();
  showFatal(webgl ? 'Hru sa nepodarilo spustiť: ' + e.message : 'Toto zariadenie alebo prehliadač nepodporuje WebGL 2, ktoré hra potrebuje.');
  throw e;
}

// ---- PWA: service worker (offline) ----
try { if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw && nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) window.game.ui.pushNews('Je dostupná nová verzia hry – obnovte stránku.', 'good');
      });
    });
  }).catch(e => console.warn('SW:', e));
} } catch (e) { /* napr. v sandboxe bez service workerov */ }
let deferredInstall = null;
addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredInstall = e;
  const b = document.getElementById('installBtn');
  b.classList.remove('hidden');
  b.onclick = async () => { b.classList.add('hidden'); deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; };
});
addEventListener('appinstalled', () => document.getElementById('installBtn').classList.add('hidden'));
