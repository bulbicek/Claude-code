import { TOOL_GROUPS, BUILDINGS, MONTHS, fmtMoney, fmtNum, KIND_NAME, zoneKind, zoneDense, SEA } from './config.js';
import { iconCanvas } from './icons.js';

const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); Object.assign(e, attrs); if (html) e.innerHTML = html; return e; };

export const OVERLAYS = [
  [null, 'Žiadna (normálny pohľad)'], ['power', 'Elektrina'], ['water', 'Voda'], ['lv', 'Hodnota pozemkov'],
  ['poll', 'Znečistenie'], ['crime', 'Kriminalita'], ['traffic', 'Doprava'], ['pop', 'Hustota obyvateľov'],
  ['police', 'Pokrytie políciou'], ['fire', 'Pokrytie hasičmi'], ['health', 'Zdravotníctvo'], ['edu', 'Vzdelanie'],
];

export class UI {
  constructor(game) {
    this.g = game;
    this.news = [];
    this.groupSel = {};
    this.buildToolbar();
    this.bindMenus();
    this.mini = $('#minimap');
    this.miniCtx = this.mini.getContext('2d');
    this.miniTimer = 0;
  }

  itemInfo(it) {
    if (it.id.startsWith('b:')) {
      const d = BUILDINGS[it.id.slice(2)];
      return { name: d.name, cost: d.cost, year: d.year, size: d.size };
    }
    return { name: it.name, cost: it.cost, year: 0 };
  }

  buildToolbar() {
    const tb = $('#toolbar');
    tb.innerHTML = '';
    for (const g of TOOL_GROUPS) {
      const b = el('button', { title: g.label });
      b.appendChild(iconCanvas(g.id));
      b.dataset.group = g.id;
      if (g.items.length > 1) b.classList.add('sub');
      this.groupSel[g.id] = g.items[0].id;
      b.onclick = e => {
        if (g.items.length === 1) { this.g.setTool(g.items[0].id); this.hideFlyout(); }
        else this.showFlyout(g, b);
      };
      b.oncontextmenu = e => { e.preventDefault(); this.g.setTool(this.groupSel[g.id]); };
      tb.appendChild(b);
    }
  }

  showFlyout(g, btn) {
    const f = $('#flyout');
    f.innerHTML = '';
    f.appendChild(el('div', { className: 'title' }, g.label));
    const yr = this.g.world ? this.g.world.state.year : 9999;
    for (const it of g.items) {
      const inf = this.itemInfo(it);
      const dis = inf.year > yr;
      const row = el('div', { className: 'item' + (dis ? ' dis' : '') },
        `<span>${inf.name}${inf.size > 1 ? ` <small>(${inf.size}×${inf.size})</small>` : ''}</span><span class="cost">${dis ? 'od ' + inf.year : fmtMoney(inf.cost)}</span>`);
      if (!dis) row.onclick = () => { this.groupSel[g.id] = it.id; this.g.setTool(it.id); this.hideFlyout(); };
      f.appendChild(row);
    }
    const r = btn.getBoundingClientRect();
    f.style.left = r.right + 4 + 'px';
    f.style.top = Math.min(r.top, window.innerHeight - 40 - g.items.length * 26) + 'px';
    f.classList.remove('hidden');
  }
  hideFlyout() { $('#flyout').classList.add('hidden'); }

  markTool(tool) {
    for (const b of document.querySelectorAll('#toolbar button')) {
      const g = TOOL_GROUPS.find(gg => gg.id === b.dataset.group);
      b.classList.toggle('on', g.items.some(i => i.id === tool));
    }
  }

  bindMenus() {
    for (const b of document.querySelectorAll('[data-menu]')) b.onclick = () => this.menu(b.dataset.menu, b);
    for (const b of document.querySelectorAll('[data-speed]')) b.onclick = () => this.g.setSpeed(+b.dataset.speed);
    document.addEventListener('mousedown', e => { if (!e.target.closest('#flyout') && !e.target.closest('#toolbar') && !e.target.closest('.menu')) this.hideFlyout(); });
  }

  markSpeed(s) { for (const b of document.querySelectorAll('[data-speed]')) b.classList.toggle('on', +b.dataset.speed === s); }

  menuList(btn, items) {
    const f = $('#flyout');
    f.innerHTML = '';
    for (const [label, fn, extra] of items) {
      const row = el('div', { className: 'item' }, `<span>${label}</span><span class="cost">${extra || ''}</span>`);
      row.onclick = () => { this.hideFlyout(); fn(); };
      f.appendChild(row);
    }
    const r = btn.getBoundingClientRect();
    f.style.left = r.left + 'px'; f.style.top = r.bottom + 2 + 'px';
    f.classList.remove('hidden');
  }

  menu(id, btn) {
    const g = this.g;
    switch (id) {
      case 'city': return this.menuList(btn, [
        ['Nové mesto…', () => this.newCityDialog()],
        ['Uložiť mesto', () => g.save()],
        ['Nahrať uložené mesto', () => g.load()],
        ['Exportovať do súboru', () => g.exportFile()],
        ['Importovať zo súboru…', () => g.importFile()],
        ['Premenovať mesto…', () => { const n = prompt('Názov mesta:', g.world.state.name); if (n) { g.world.state.name = n; this.updateTop(); } }],
      ]);
      case 'budget': return this.budgetDialog();
      case 'maps': return this.menuList(btn, OVERLAYS.map(([k, n]) => [n, () => g.setOverlay(k), g.r.overlay === k ? '●' : '']));
      case 'graphs': return this.graphDialog();
      case 'disasters': return this.menuList(btn, [
        ['Požiar', () => g.disaster('fire')],
        ['Tornádo', () => g.disaster('tornado')],
        ['Zemetrasenie', () => g.disaster('quake')],
        [g.world.state.disasters ? 'Vypnúť náhodné katastrofy' : 'Zapnúť náhodné katastrofy', () => { g.world.state.disasters = !g.world.state.disasters; }],
      ]);
      case 'options': return this.optionsDialog();
      case 'help': return this.helpDialog();
    }
  }

  // ---------- horný panel ----------
  updateTop() {
    const w = this.g.world; if (!w) return;
    const st = w.state;
    $('#cityName').textContent = st.name;
    $('#date').textContent = `${MONTHS[st.month]} ${st.year}`;
    const f = $('#funds'); f.textContent = fmtMoney(st.funds); f.classList.toggle('neg', st.funds < 0);
    $('#pop').textContent = 'Obyv.: ' + fmtNum(st.stats.resPop);
    const set = (cls, v) => {
      const e = document.querySelector('#rci .fill.' + cls);
      const h = Math.abs(v) * 50;
      e.style.height = h + '%';
      e.style.top = v >= 0 ? (50 - h) + '%' : '50%';
    };
    set('r', st.demand.R); set('c', st.demand.C); set('i', st.demand.I);
  }

  status(msg) { $('#status').textContent = msg; }

  pushNews(msg, type = 'info') {
    this.news.push({ msg, type });
    if (this.news.length > 6) this.news.shift();
    const t = $('#tickerText');
    t.innerHTML = this.news.map(n => `<span class="${n.type}">★ ${n.msg}</span>`).join('&nbsp;&nbsp;&nbsp;&nbsp;');
    t.style.animation = 'none'; void t.offsetWidth;
    t.style.animation = `tick ${Math.max(18, t.textContent.length * 0.12)}s linear infinite`;
  }

  // ---------- dialógy ----------
  dialog(title, html, opts = {}) {
    const host = $('#dialogs');
    if (opts.id) { const old = host.querySelector(`[data-id="${opts.id}"]`); if (old) { old._close(); } }
    let bg = null;
    if (opts.modal) { bg = el('div', { className: 'modalbg' }); host.appendChild(bg); }
    const d = el('div', { className: 'win' });
    d.dataset.id = opts.id || '';
    d.innerHTML = `<div class="title"><span>${title}</span>${opts.noClose ? '' : '<button class="x">✕</button>'}</div><div class="body">${html}</div>`;
    host.appendChild(d);
    const W = window.innerWidth, H = window.innerHeight;
    d.style.width = Math.min(opts.width || 360, W - 12) + 'px';
    const r = d.getBoundingClientRect();
    d.style.left = Math.max(6, Math.min(opts.x ?? (W - r.width) / 2, W - r.width - 6)) + 'px';
    d.style.top = Math.max(6, opts.y ?? (H - r.height) / 2) + 'px';
    d._close = () => { d.remove(); bg && bg.remove(); opts.onClose && opts.onClose(); };
    const x = d.querySelector('.x'); if (x) x.onclick = d._close;
    // presúvanie okna
    const t = d.querySelector('.title');
    t.onmousedown = e => {
      if (e.target.tagName === 'BUTTON') return;
      const ox = e.clientX - d.offsetLeft, oy = e.clientY - d.offsetTop;
      const mv = ev => { d.style.left = ev.clientX - ox + 'px'; d.style.top = ev.clientY - oy + 'px'; };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
    };
    return d;
  }

  newCityDialog(first = false) {
    let hasSave = false; try { hasSave = !!localStorage.getItem('mestopolis-save'); } catch (e) { }
    const seed = Math.floor(Math.random() * 99999);
    const d = this.dialog('Nové mesto', `
      <div class="logo">MESTOPOLIS 3D</div>
      <p style="font-weight:normal;margin:4px 0 10px">Postavte si vlastné mesto – zónujte, stavajte elektrárne, cesty a služby.</p>
      <div class="row"><label>Názov mesta</label><input type="text" id="nc-name" value="Nové Mesto" style="flex:1"></div>
      <div class="row"><label>Veľkosť mapy</label><select id="nc-size"><option value="96">Malá (96×96)</option><option value="128" selected>Stredná (128×128)</option><option value="192">Veľká (192×192)</option><option value="256">Obrovská (256×256)</option></select></div>
      <div class="row"><label>Začiatočný rok</label><select id="nc-year"><option>1900</option><option selected>1950</option><option>2000</option><option>2050</option></select></div>
      <div class="row"><label>Obtiažnosť</label><select id="nc-diff"><option value="30000">Ľahká (30 000 €)</option><option value="20000" selected>Stredná (20 000 €)</option><option value="10000">Ťažká (10 000 €)</option></select></div>
      <div class="row"><label>Kopcovitosť</label><input type="range" id="nc-hills" min="0" max="100" value="45"></div>
      <div class="row"><label>Množstvo vody</label><input type="range" id="nc-water" min="0" max="100" value="40"></div>
      <div class="row"><label>Lesy</label><input type="range" id="nc-trees" min="0" max="100" value="50"></div>
      <div class="row"><label>Pobrežie / rieka</label><label style="min-width:0"><input type="checkbox" id="nc-coast" checked> more</label><label style="min-width:0"><input type="checkbox" id="nc-river" checked> rieka</label></div>
      <div class="row"><label>Semienko mapy</label><input type="number" id="nc-seed" value="${seed}" style="width:100px"></div>
      <div class="btns">${hasSave && first ? '<button id="nc-cont">Pokračovať v uloženom</button>' : ''}<button id="nc-go">Založiť mesto</button></div>
    `, { modal: true, width: 420, id: 'newcity', noClose: first });
    const v = id => d.querySelector(id);
    v('#nc-go').onclick = () => {
      const o = {
        name: v('#nc-name').value || 'Mesto', size: +v('#nc-size').value, year: +v('#nc-year').value, funds: +v('#nc-diff').value,
        hills: v('#nc-hills').value / 100, water: v('#nc-water').value / 100, trees: v('#nc-trees').value / 100,
        coast: v('#nc-coast').checked, river: v('#nc-river').checked, seed: +v('#nc-seed').value || 1,
      };
      d._close();
      this.g.newCity(o);
    };
    const c = v('#nc-cont'); if (c) c.onclick = () => { d._close(); this.g.load(); };
  }

  budgetDialog() {
    const w = this.g.world, st = w.state;
    const ly = st.lastYear;
    const a = st.yearAcc;
    const rows = [
      ['Dane – bývanie', 'taxR'], ['Dane – obchod', 'taxC'], ['Dane – priemysel', 'taxI'],
    ];
    const exps = [['Doprava (cesty)', 'roads'], ['Polícia', 'police'], ['Hasiči', 'fire'], ['Zdravotníctvo', 'health'], ['Školstvo', 'edu'], ['Energetika a voda', 'power'], ['Ostatné', 'other']];
    const fm = v => fmtMoney(v || 0);
    const html = `
      <table class="budget">
        <tr><td></td><td class="n">Tento rok</td><td class="n">Minulý rok</td></tr>
        ${rows.map(([n, k]) => `<tr><td>${n}</td><td class="n">${fm(a[k])}</td><td class="n">${ly ? fm(ly[k]) : '—'}</td></tr>`).join('')}
        ${exps.map(([n, k]) => `<tr><td>${n}</td><td class="n">${fm(-a[k])}</td><td class="n">${ly ? fm(-ly[k]) : '—'}</td></tr>`).join('')}
        <tr class="tot"><td>Bilancia</td><td class="n">${fm(a.taxR + a.taxC + a.taxI - a.roads - a.police - a.fire - a.health - a.edu - a.power - a.other)}</td><td class="n">${ly ? fm(ly.income - ly.expense) : '—'}</td></tr>
        <tr><td>Pokladnica</td><td class="n">${fm(st.funds)}</td><td></td></tr>
      </table>
      <h4 style="margin:10px 0 4px">Dane (%)</h4>
      ${['R', 'C', 'I'].map(k => `<div class="row"><label>${{ R: 'Bývanie', C: 'Obchod', I: 'Priemysel' }[k]}</label><input type="range" min="0" max="20" value="${st.tax[k]}" data-tax="${k}"><span class="val">${st.tax[k]} %</span></div>`).join('')}
      <h4 style="margin:10px 0 4px">Financovanie (%)</h4>
      ${[['roads', 'Doprava'], ['police', 'Polícia'], ['fire', 'Hasiči'], ['health', 'Zdravotníctvo'], ['edu', 'Školstvo']].map(([k, n]) => `<div class="row"><label>${n}</label><input type="range" min="0" max="100" step="5" value="${st.funding[k]}" data-fund="${k}"><span class="val">${st.funding[k]} %</span></div>`).join('')}
      <div class="btns"><button class="ok">OK</button></div>`;
    const d = this.dialog('Rozpočet mesta', html, { width: 420, id: 'budget' });
    d.querySelectorAll('[data-tax]').forEach(i => i.oninput = () => { st.tax[i.dataset.tax] = +i.value; i.nextElementSibling.textContent = i.value + ' %'; });
    d.querySelectorAll('[data-fund]').forEach(i => i.oninput = () => { st.funding[i.dataset.fund] = +i.value; i.nextElementSibling.textContent = i.value + ' %'; });
    d.querySelector('.ok').onclick = d._close;
  }

  graphDialog() {
    const d = this.dialog('Grafy', `<canvas id="gr" width="440" height="220" style="background:#000;display:block;image-rendering:pixelated"></canvas>
      <div class="row"><span style="color:#2a2">■ Obyvatelia</span><span style="color:#36c">■ Pracovné miesta</span><span style="color:#c90">■ Pokladnica</span></div>
      <div class="row" id="gr-stats" style="font-weight:normal"></div>`, { width: 470, id: 'graphs' });
    const draw = () => {
      if (!d.isConnected) return;
      const cv = d.querySelector('#gr'), x = cv.getContext('2d');
      const h = this.g.world.state.history.slice(-240);
      x.fillStyle = '#000'; x.fillRect(0, 0, cv.width, cv.height);
      x.strokeStyle = '#123'; for (let i = 0; i < 10; i++) { x.beginPath(); x.moveTo(0, i * 22); x.lineTo(440, i * 22); x.stroke(); }
      const line = (key, color) => {
        if (h.length < 2) return;
        let mx = Math.max(1, ...h.map(p => Math.abs(p[key])));
        x.strokeStyle = color; x.lineWidth = 2; x.beginPath();
        h.forEach((p, i) => { const px = i / (h.length - 1) * 438 + 1, py = 210 - Math.max(0, p[key]) / mx * 195; i ? x.lineTo(px, py) : x.moveTo(px, py); });
        x.stroke();
      };
      line('pop', '#3d3'); line('jobs', '#47f'); line('funds', '#fb2');
      const s = this.g.world.state.stats;
      d.querySelector('#gr-stats').innerHTML = `Elektrina: ${Math.round(s.powerDemand)}/${Math.round(s.powerSupply)} MW &nbsp; Voda: ${Math.round(s.waterDemand)}/${Math.round(s.waterSupply)} &nbsp; Obchod: ${fmtNum(s.comJobs)} &nbsp; Priemysel: ${fmtNum(s.indJobs)}`;
      setTimeout(draw, 1000);
    };
    draw();
  }

  optionsDialog() {
    const s = this.g.r.settings;
    const d = this.dialog('Možnosti', `
      <div class="row"><label>Veľkosť pixelu</label><select id="op-px"><option value="0">Auto (retro zblízka, ostré z diaľky)</option><option value="1">1 (ostré)</option><option value="2">2 (retro)</option><option value="3">3 (veľmi retro)</option><option value="4">4 (8-bit)</option></select></div>
      <div class="row"><label>Dithering a paleta</label><input type="checkbox" id="op-dither" ${s.dither ? 'checked' : ''}></div>
      <div class="row"><label>Mriežka</label><input type="checkbox" id="op-grid" ${s.grid ? 'checked' : ''}> <small>(G)</small></div>
      <div class="row"><label>Tiene</label><input type="checkbox" id="op-sh" ${s.shadows ? 'checked' : ''}></div>
      <div class="row"><label>Denná doba</label><select id="op-time"><option value="cycle">Striedanie dňa a noci</option><option value="day">Stále deň</option><option value="night">Stále noc</option></select></div>
      <div class="row"><label>Automatické ukladanie</label><input type="checkbox" id="op-auto" ${this.g.autosave ? 'checked' : ''}></div>
      <div class="btns"><button class="ok">OK</button></div>`, { width: 360, id: 'options' });
    const q = i => d.querySelector(i);
    q('#op-px').value = s.pixel; q('#op-time').value = s.timeMode;
    q('#op-px').onchange = () => { s.pixel = +q('#op-px').value; this.g.r.resize(); this.g.saveSettings(); };
    q('#op-dither').onchange = () => { s.dither = q('#op-dither').checked; this.g.saveSettings(); };
    q('#op-grid').onchange = () => { s.grid = q('#op-grid').checked; this.g.saveSettings(); };
    q('#op-sh').onchange = () => { s.shadows = q('#op-sh').checked; this.g.saveSettings(); };
    q('#op-time').onchange = () => { s.timeMode = q('#op-time').value; this.g.saveSettings(); };
    q('#op-auto').onchange = () => { this.g.autosave = q('#op-auto').checked; this.g.saveSettings(); };
    q('.ok').onclick = d._close;
  }

  helpDialog() {
    this.dialog('Pomoc', `<div class="help">
      <p><b>Cieľ:</b> vybudujte prosperujúce mesto. Vyznačte zóny (bývanie, obchod, priemysel), pripojte ich cestami a elektrinou – budovy vyrastú samé podľa dopytu (ukazovateľ R/C/I hore).</p>
      <p><b>Prvé kroky:</b> 1) elektráreň, 2) cesty, 3) obytné a priemyselné zóny pri cestách, 4) elektrické vedenie k zónam (zóny vedú prúd ďalej), 5) neskôr obchod, voda, polícia, hasiči, školy.</p>
      <p><b>Myš:</b> ľavé tlačidlo – použiť nástroj (ťahaním cesty, vedenia, zóny); pravé/stredné tlačidlo – posun mapy (počas ťahania pravé tlačidlo akciu zruší); tlačidlo <b>↶ Späť</b> vráti poslednú stavbu aj s peniazmi; koliesko – zoom. Pravý klik na ikonu – posledný nástroj zo skupiny.</p>
      <p><b>Klávesy:</b> <kbd>WASD</kbd>/šípky posun, <kbd>Q</kbd>/<kbd>E</kbd> otáčanie, <kbd>+</kbd>/<kbd>-</kbd> zoom, <kbd>Medzera</kbd> pauza, <kbd>1</kbd>-<kbd>3</kbd> rýchlosť, <kbd>Esc</kbd> zrušiť rozpracovanú akciu / info nástroj, <kbd>Ctrl+Z</kbd> späť, <kbd>B</kbd> buldozér, <kbd>R</kbd> cesta, <kbd>G</kbd> mriežka, <kbd>U</kbd> podzemie (potrubie), <kbd>Ctrl+S</kbd> uložiť.</p>
      <p><b>Tipy:</b> hustá zástavba potrebuje vodu (čerpadlá + potrubie), hodnota pozemkov rastie pri vode, parkoch a službách, klesá so znečistením a kriminalitou. Pri veľkom meste treba štadión, letisko a prístav.</p>
      <p style="color:#555">Verzia: ${(document.querySelector('meta[name=app-version]') || {}).content || '?'} · <a href="?reset">vymazať cache a načítať znova</a></p>
    </div><div class="btns"><button class="ok">Zavrieť</button></div>`, { width: 520, id: 'help' }).querySelector('.ok').onclick = function () { this.closest('.win')._close(); };
  }

  tileInfo(x, y) {
    const w = this.g.world, i = w.ti(x, y);
    const meter = (v, c) => `<span class="meter"><i style="width:${(v / 255 * 100).toFixed(0)}%;background:${c}"></i></span>`;
    let what = 'Voľný pozemok';
    if (w.water[i]) what = w.road[i] ? 'Most' : 'Voda';
    else if (w.bid[i]) { const b = w.buildings.get(w.bid[i]); what = BUILDINGS[b.type].name; }
    else if (w.zone[i]) {
      const k = zoneKind(w.zone[i]);
      what = `${KIND_NAME[k]} zóna (${zoneDense(w.zone[i]) ? 'hustá' : 'riedka'})`;
      if (w.abandoned[i]) what += ' – opustená';
    } else if (w.road[i]) what = 'Cesta';
    else if (w.pline[i]) what = 'Elektrické vedenie';
    else if (w.rubble[i]) what = 'Trosky';
    else if (w.tree[i]) what = 'Les';
    const k = zoneKind(w.zone[i]);
    let extra = '';
    if (w.bid[i]) {
      const b = w.buildings.get(w.bid[i]), d = BUILDINGS[b.type];
      if (d.power) extra += `<span>Výkon</span><span>${d.power} MW</span>`;
      if (d.water) extra += `<span>Čerpanie</span><span>${d.water}</span>`;
      extra += `<span>Údržba</span><span>${fmtMoney(d.upkeep)}/rok</span>`;
    }
    this.dialog('Informácie', `<div class="info-grid">
      <span>Pozemok</span><span>${what}</span>
      <span>Súradnice</span><span>${x}, ${y} (výška ${w.tileMin(x, y) - SEA})</span>
      ${w.level[i] ? `<span>${k === 1 ? 'Obyvatelia' : 'Pracovné miesta'}</span><span>${fmtNum(w.pop[i])} (úroveň ${w.level[i]})</span>` : ''}
      ${extra}
      <span>Elektrina</span><span>${w.zone[i] || w.bid[i] || w.pline[i] ? (w.powered[i] ? 'áno' : '<b style="color:#c00">nie</b>') : '—'}</span>
      <span>Voda</span><span>${w.zone[i] || w.bid[i] ? (w.watered[i] ? 'áno' : 'nie') : '—'}</span>
      <span>Prístup k ceste</span><span>${w.zone[i] ? (w.roadAcc[i] ? 'áno' : '<b style="color:#c00">nie</b>') : '—'}</span>
      <span>Hodnota pozemku</span><span>${meter(w.lv[i], '#3c3')}</span>
      <span>Znečistenie</span><span>${meter(w.poll[i], '#a63')}</span>
      <span>Kriminalita</span><span>${meter(w.crime[i], '#c33')}</span>
      <span>Doprava</span><span>${meter(w.traffic[i], '#cc3')}</span>
      <span>Polícia</span><span>${meter(w.police[i], '#36c')}</span>
      <span>Hasiči</span><span>${meter(w.fireCov[i], '#f63')}</span>
    </div>`, { width: 320, id: 'info', x: window.innerWidth - 340, y: 60 });
  }

  legend(overlay) {
    const L = $('#overlayLegend');
    if (!overlay) { L.classList.add('hidden'); return; }
    const name = OVERLAYS.find(o => o[0] === overlay)[1];
    let grad = 'linear-gradient(90deg,#2fa84f,#f2d33a,#d4302b)', lo = 'nízke', hi = 'vysoké';
    if (overlay === 'power') { grad = 'linear-gradient(90deg,#ffe14d 50%,#d4302b 50%)'; lo = 'napájané'; hi = 'bez prúdu'; }
    if (overlay === 'water') { grad = 'linear-gradient(90deg,#3fa0ff 50%,#d4302b 50%)'; lo = 's vodou'; hi = 'bez vody'; }
    if (overlay === 'lv') grad = 'linear-gradient(90deg,#4a2a6a,#5fe08a)';
    if (['police', 'fire', 'edu', 'health'].includes(overlay)) { grad = `linear-gradient(90deg,#3a3a3a,${{ police: '#3f7bff', fire: '#ff6a2b', edu: '#f2d33a', health: '#ff5fa0' }[overlay]})`; lo = 'žiadne'; hi = 'silné'; }
    L.innerHTML = `<div class="title"><span>${name}</span><button id="lgx">✕</button></div><div class="grad" style="background:${grad}"></div><div class="lbl"><span>${lo}</span><span>${hi}</span></div>`;
    L.classList.remove('hidden');
    L.querySelector('#lgx').onclick = () => this.g.setOverlay(null);
  }

  // ---------- minimapa ----------
  drawMinimap() {
    const w = this.g.world; if (!w) return;
    const N = w.N, ctx = this.miniCtx;
    if (!this.miniImg || this.miniImg.width !== N) { this.mini.width = N; this.mini.height = N; this.miniImg = ctx.createImageData(N, N); }
    const d = this.miniImg.data;
    const zc = [null, [90, 200, 70], [40, 150, 50], [80, 150, 240], [40, 100, 210], [230, 200, 70], [200, 150, 30]];
    for (let i = 0; i < N * N; i++) {
      let c;
      if (w.water[i]) c = [40, 100, 180];
      else if (w.road[i]) c = [60, 60, 60];
      else if (w.bid[i]) c = [200, 200, 200];
      else if (w.zone[i]) c = zc[w.zone[i]].map(v => v * (w.level[i] ? 1 : 0.7));
      else if (w.fire[i]) c = [255, 80, 0];
      else {
        const x = i % N, y = (i / N) | 0, e = w.tileMin(x, y) - SEA;
        const g = Math.max(70, 160 - e * 6);
        c = w.tree[i] ? [40, g - 30, 30] : [80 + e * 4, g, 60];
      }
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
    }
    ctx.putImageData(this.miniImg, 0, 0);
    // výhľad kamery
    const r = this.g.r, pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => r.pick(a, b)).filter(Boolean);
    if (pts.length === 4) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, N / 160);
      ctx.beginPath(); pts.forEach((p, k) => k ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z)); ctx.closePath(); ctx.stroke();
    }
  }
}
