import * as THREE from 'three';
import { HS, SEA, CHUNK, MAX_H, zoneKind, zoneDense } from './config.js';
import { GB, glowMaterial, col, mix, shade } from './geom.js';
import * as BG from './buildgeo.js';
import { hash2 } from './noise.js';

const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerpC = (a, b, t) => new THREE.Color().copy(a).lerp(b, t);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.scene = new THREE.Scene();
    this.uniforms = { uNight: { value: 0 }, uTime: { value: 0 }, uGrid: { value: 0 } };
    this.settings = { pixel: 2, dither: true, grid: false, timeMode: 'cycle', shadows: true };
    this.overlay = null;
    this.underground = false;
    this.tod = 0.38;

    // kamera
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
    this.view = { tx: 64, tz: 64, zoom: 22, rot: 0, az: Math.PI / 4, el: 0.62 };

    // svetlá
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a4a35, 1.0);
    this.scene.add(this.hemi);
    this.amb = new THREE.AmbientLight(0xffffff, 0.15);
    this.scene.add(this.amb);

    // materiály
    this.matSolid = glowMaterial(this.uniforms);
    this.matTerrain = this.makeTerrainMaterial();
    this.matWater = this.makeWaterMaterial();
    this.matSkirt = new THREE.MeshLambertMaterial({ vertexColors: true });

    this.chunks = new Map();
    this.emitters = new Map();
    this.groupChunks = new THREE.Group(); this.scene.add(this.groupChunks);
    this.groupPipes = new THREE.Group(); this.groupPipes.visible = false; this.scene.add(this.groupPipes);

    // zvýraznenie
    this.hlMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.hlMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.hlMat);
    this.hlMesh.renderOrder = 5;
    this.scene.add(this.hlMesh);

    this.initPost();
    this.particles = new Particles(1400, false);
    this.flames = new Particles(700, true);
    this.scene.add(this.particles.mesh, this.flames.mesh);
    this.cars = new Cars(this.scene, this.uniforms);
    this.icons = new PowerIcons(this.scene);
    this.tornadoObj = null;
    this.shake = 0;
  }

  // ---------- materiály ----------
  makeTerrainMaterial() {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = sh => {
      sh.uniforms.uGrid = this.uniforms.uGrid;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nuniform float uGrid;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 fw = fract(vWP.xz); vec2 gd = min(fw, 1.0 - fw);
          float e = min(gd.x, gd.y);
          diffuseColor.rgb *= mix(1.0, mix(0.72, 1.0, smoothstep(0.0, 0.035, e)), uGrid);`);
    };
    return m;
  }
  makeWaterMaterial() {
    const m = new THREE.MeshLambertMaterial({ color: 0x2c6cb2, transparent: true, opacity: 0.82 });
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = this.uniforms.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nuniform float uTime;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          vec2 q = floor(vWP.xz * 4.0) / 4.0;
          vec3 wn = vec3(sin(q.x * 2.1 + uTime * 1.3) * 0.16 + sin(q.y*1.3 - uTime)*0.08, 1.0, cos(q.y * 2.4 + uTime * 1.1) * 0.16);
          normal = normalize((viewMatrix * vec4(normalize(wn), 0.0)).xyz);`);
    };
    return m;
  }

  // ---------- svet ----------
  setWorld(world) {
    this.world = world;
    for (const c of this.chunks.values()) { c.mesh && (this.groupChunks.remove(c.mesh), c.mesh.geometry.dispose()); c.pipe && (this.groupPipes.remove(c.pipe), c.pipe.geometry.dispose()); }
    this.chunks.clear(); this.emitters.clear();
    if (this.terrain) { this.scene.remove(this.terrain, this.water, this.skirt); this.terrain.geometry.dispose(); this.water.geometry.dispose(); this.skirt.geometry.dispose(); }
    const N = world.N;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * N * 18), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N * N * 18), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * N * 18), 3));
    this.terrain = new THREE.Mesh(geo, this.matTerrain);
    this.terrain.receiveShadow = true; this.terrain.castShadow = true;
    this.terrain.frustumCulled = false;
    this.scene.add(this.terrain);
    this.water = new THREE.Mesh(new THREE.BufferGeometry(), this.matWater);
    this.water.receiveShadow = true; this.water.renderOrder = 2;
    this.scene.add(this.water);
    this.skirt = new THREE.Mesh(new THREE.BufferGeometry(), this.matSkirt);
    this.skirt.receiveShadow = true;
    this.scene.add(this.skirt);
    const sc = this.sun.shadow.camera;
    const ext = N * 0.75 + 10;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = N * 3 + 200;
    sc.updateProjectionMatrix();
    this.view.tx = N / 2; this.view.tz = N / 2;
    this.view.zoom = 14;
    this.cars.reset();
    world.markAllDirty();
  }

  rebuildTerrainGeometry() {
    const w = this.world, N = w.N;
    const pos = this.terrain.geometry.attributes.position.array;
    const nor = this.terrain.geometry.attributes.normal.array;
    let o = 0;
    const tmp = [];
    const push = (x, h, z) => { pos[o] = x; pos[o + 1] = h * HS; pos[o + 2] = z; o += 3; };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const [a, b, c, d] = w.corners(x, y);
      if (Math.abs(a - d) <= Math.abs(b - c)) {
        push(x, a, y); push(x + 1, d, y + 1); push(x + 1, b, y);
        push(x, a, y); push(x, c, y + 1); push(x + 1, d, y + 1);
      } else {
        push(x, a, y); push(x, c, y + 1); push(x + 1, b, y);
        push(x + 1, b, y); push(x, c, y + 1); push(x + 1, d, y + 1);
      }
    }
    // normály (plošné)
    for (let i = 0; i < pos.length; i += 9) {
      const ux = pos[i + 3] - pos[i], uy = pos[i + 4] - pos[i + 1], uz = pos[i + 5] - pos[i + 2];
      const vx = pos[i + 6] - pos[i], vy = pos[i + 7] - pos[i + 1], vz = pos[i + 8] - pos[i + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (let k = 0; k < 3; k++) { nor[i + k * 3] = nx; nor[i + k * 3 + 1] = ny; nor[i + k * 3 + 2] = nz; }
    }
    this.terrain.geometry.attributes.position.needsUpdate = true;
    this.terrain.geometry.attributes.normal.needsUpdate = true;
    this.terrain.geometry.computeBoundingSphere();
    this.buildWaterAndSkirt();
  }

  buildWaterAndSkirt() {
    const w = this.world, N = w.N;
    const wl = SEA * HS + 0.1;
    // voda: rovina nad vodnými dlaždicami + okolie (rozšírené o 1)
    const wp = [];
    const need = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (w.tileMin(x, y) <= SEA) need[y * N + x] = 1;
    for (let y = 0; y < N; y++) {
      let x = 0;
      while (x < N) {
        if (!need[y * N + x]) { x++; continue; }
        let x2 = x; while (x2 < N && need[y * N + x2]) x2++;
        wp.push(x, wl, y, x, wl, y + 1, x2, wl, y + 1, x, wl, y, x2, wl, y + 1, x2, wl, y);
        x = x2;
      }
    }
    // bočné steny vody na okraji mapy
    const sp = [], sc = [];
    const dirtA = col(0x7a5a3a), dirtB = col(0x6a4c30), rock = col(0x4a3a2c), grassE = col(0x5f9b3c);
    const bottom = -1.2;
    const edge = (x0, z0, x1, z1, h0, h1, outward) => {
      // vrstvy pôdy
      const top0 = h0 * HS, top1 = h1 * HS;
      const levels = Math.max(h0, h1);
      let yb0 = bottom, yb1 = bottom;
      const quad = (ya0, ya1, yb0_, yb1_, c) => {
        // a = spodné body, b = horné body
        const p = [[x0, ya0, z0], [x0, yb0_, z0], [x1, yb1_, z1], [x1, ya1, z1]];
        const n = outward;
        const tri = (A, B, C) => {
          let ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
          const nx = uy * vz - uz * vy, nz = ux * vy - uy * vx;
          if (nx * n[0] + nz * n[2] < 0) { const t = B; B = C; C = t; }
          sp.push(...A, ...B, ...C); sc.push(...c, ...c, ...c);
        };
        tri(p[0], p[1], p[2]); tri(p[0], p[2], p[3]);
      };
      quad(bottom, bottom, 0, 0, rock);
      for (let k = 0; k < levels; k++) {
        const a0 = Math.min(k, h0) * HS, a1 = Math.min(k, h1) * HS;
        const b0 = Math.min(k + 1, h0) * HS, b1 = Math.min(k + 1, h1) * HS;
        if (b0 - a0 <= 0 && b1 - a1 <= 0) continue;
        quad(a0, a1, b0, b1, k === levels - 1 ? grassE : (k % 2 ? dirtA : dirtB));
      }
      // voda
      if (h0 < SEA || h1 < SEA) {
        const p = [[x0, Math.min(h0 * HS, wl), z0], [x0, wl, z0], [x1, wl, z1], [x1, Math.min(h1 * HS, wl), z1]];
        const n = outward;
        let ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
        let vx = p[2][0] - p[0][0], vy = p[2][1] - p[0][1], vz = p[2][2] - p[0][2];
        const nx = uy * vz - uz * vy, nz = ux * vy - uy * vx;
        if (nx * n[0] + nz * n[2] >= 0) wp.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]);
        else wp.push(...p[0], ...p[2], ...p[1], ...p[0], ...p[3], ...p[2]);
      }
    };
    for (let i = 0; i < N; i++) {
      edge(i, 0, i + 1, 0, w.ch(i, 0), w.ch(i + 1, 0), [0, 0, -1]);
      edge(i, N, i + 1, N, w.ch(i, N), w.ch(i + 1, N), [0, 0, 1]);
      edge(0, i, 0, i + 1, w.ch(0, i), w.ch(0, i + 1), [-1, 0, 0]);
      edge(N, i, N, i + 1, w.ch(N, i), w.ch(N, i + 1), [1, 0, 0]);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    wg.computeVertexNormals();
    // horná plocha má normálu hore
    this.water.geometry.dispose(); this.water.geometry = wg;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    sg.computeVertexNormals();
    this.skirt.geometry.dispose(); this.skirt.geometry = sg;
  }

  tileBaseColor(x, y) {
    const w = this.world, i = w.ti(x, y);
    const [a, b, c, d] = w.corners(x, y);
    const avg = (a + b + c + d) / 4, mx = Math.max(a, b, c, d), mn = Math.min(a, b, c, d);
    let cc;
    if (w.water[i]) {
      const depth = SEA - avg;
      cc = mix(col(0xb9a77a), col(0x1f4a5e), Math.min(1, depth / 3));
    } else {
      const e = avg - SEA;
      if (mn <= SEA && e < 1.2) cc = col(0xd6c58f);
      else if (e < 4) cc = mix(col(0x79ad48), col(0x669d3d), e / 4);
      else if (e < 9) cc = mix(col(0x669d3d), col(0x557f37), (e - 4) / 5);
      else if (e < 14) cc = mix(col(0x557f37), col(0x8a7f6c), (e - 9) / 5);
      else if (e < 17) cc = mix(col(0x8a7f6c), col(0x9a9590), (e - 14) / 3);
      else cc = col(0xeef0f4);
      if (mx - mn >= 2) cc = mix(cc, col(0x8a7356), 0.35);
      const z = w.zone[i];
      if (z) {
        const zc = [null, 0x63c04d, 0x2f9a35, 0x58a3e8, 0x2d6cc9, 0xe3c447, 0xc79a1f][z];
        cc = mix(cc, col(zc), w.level[i] > 0 ? 0.25 : 0.62);
      }
      if (w.rubble[i]) cc = mix(cc, col(0x6a5a4a), 0.7);
      if (w.road[i]) cc = mix(cc, col(0x8f8c80), 0.5);
      if (w.fire[i]) cc = mix(cc, col(0x2a2018), 0.6);
    }
    const j = 0.94 + hash2(x, y, 5) * 0.08 * (((x + y) & 1) ? 1 : 0.85);
    return [cc[0] * j, cc[1] * j, cc[2] * j];
  }

  overlayColor(x, y, base) {
    const w = this.world, i = w.ti(x, y), m = this.overlay;
    if (w.water[i]) return base;
    const ramp = v => {
      const t = v / 255;
      return t < 0.5 ? mix(col(0x2fa84f), col(0xf2d33a), t * 2) : mix(col(0xf2d33a), col(0xd4302b), (t - 0.5) * 2);
    };
    let c, k = 0.85;
    switch (m) {
      case 'power':
        if (w.zone[i] || w.bid[i] || w.pline[i]) c = w.powered[i] ? col(0xffe14d) : col(0xd4302b);
        else { c = shade(base, 0.5); k = 1; }
        break;
      case 'water':
        if (w.zone[i] || w.bid[i] || w.pipe[i]) c = w.watered[i] ? col(0x3fa0ff) : (w.pipe[i] ? col(0x6a7c8c) : col(0xd4302b));
        else { c = shade(base, 0.5); k = 1; }
        break;
      case 'lv': { const t = w.lv[i] / 255; c = mix(col(0x4a2a6a), col(0x5fe08a), t); break; }
      case 'poll': c = ramp(w.poll[i]); break;
      case 'crime': c = ramp(w.crime[i]); break;
      case 'traffic': c = w.road[i] ? ramp(w.traffic[i]) : shade(base, 0.55); k = w.road[i] ? 0.9 : 1; break;
      case 'police': c = mix(col(0x3a3a3a), col(0x3f7bff), w.police[i] / 255); break;
      case 'fire': c = mix(col(0x3a3a3a), col(0xff6a2b), w.fireCov[i] / 255); break;
      case 'edu': c = mix(col(0x3a3a3a), col(0xf2d33a), w.edu[i] / 255); break;
      case 'health': c = mix(col(0x3a3a3a), col(0xff5fa0), w.health[i] / 255); break;
      case 'pop': c = ramp(Math.min(255, w.pop[i] / 2.5)); break;
      default: return base;
    }
    return mix(base, c, k);
  }

  updateTerrainColors() {
    const w = this.world, N = w.N;
    const arr = this.terrain.geometry.attributes.color.array;
    let o = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let c = this.tileBaseColor(x, y);
      if (this.overlay) c = this.overlayColor(x, y, c);
      for (let k = 0; k < 6; k++) { arr[o++] = c[0]; arr[o++] = c[1]; arr[o++] = c[2]; }
    }
    this.terrain.geometry.attributes.color.needsUpdate = true;
  }

  // ---------- bloky ----------
  buildChunk(ci) {
    const w = this.world, cn = w.chunksN;
    const cx0 = (ci % cn) * CHUNK, cy0 = Math.floor(ci / cn) * CHUNK;
    const gb = new GB(), gp = new GB();
    const emit = [];
    for (let y = cy0; y < Math.min(cy0 + CHUNK, w.N); y++) for (let x = cx0; x < Math.min(cx0 + CHUNK, w.N); x++) {
      const i = w.ti(x, y);
      if (w.road[i]) BG.road(gb, w, x, y);
      if (w.pline[i]) BG.powerline(gb, w, x, y);
      if (w.pipe[i]) BG.pipe(gp, w, x, y);
      if (w.bid[i]) {
        const b = w.buildings.get(w.bid[i]);
        if (b && b.x === x && b.y === y) BG.serviceBuilding(gb, w, b, emit);
        continue;
      }
      if (w.level[i] > 0 && w.zone[i]) { BG.zoneBuilding(gb, w, x, y, emit); continue; }
      if (w.rubble[i]) BG.rubble(gb, w, x, y, x * 911 + y);
      if (w.tree[i] && !w.road[i]) BG.trees(gb, w, x, y, w.tree[i], x * 7331 + y * 17 + 1);
    }
    let c = this.chunks.get(ci);
    if (!c) { c = {}; this.chunks.set(ci, c); }
    if (c.mesh) { this.groupChunks.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; }
    if (c.pipe) { this.groupPipes.remove(c.pipe); c.pipe.geometry.dispose(); c.pipe = null; }
    if (gb.count) {
      c.mesh = new THREE.Mesh(gb.toGeometry(), this.matSolid);
      c.mesh.castShadow = true; c.mesh.receiveShadow = true;
      this.groupChunks.add(c.mesh);
    }
    if (gp.count) {
      c.pipe = new THREE.Mesh(gp.toGeometry(), this.matSolid);
      this.groupPipes.add(c.pipe);
    }
    this.emitters.set(ci, emit);
  }

  syncWorld(maxChunks = 8) {
    const w = this.world;
    if (w.terrainDirty) { this.rebuildTerrainGeometry(); w.terrainDirty = false; }
    if (w.terrainColorDirty) { this.updateTerrainColors(); w.terrainColorDirty = false; }
    const t0 = performance.now();
    for (const ci of w.dirtyChunks) {
      this.buildChunk(ci);
      w.dirtyChunks.delete(ci);
      if (performance.now() - t0 > maxChunks) break;
    }
  }

  setUnderground(on) {
    this.underground = on;
    this.groupPipes.visible = on;
    this.groupChunks.visible = !on;
  }

  // ---------- zvýraznenie ----------
  setHighlight(tiles, color) {
    const w = this.world;
    const p = [], c = [];
    const cc = col(color);
    for (const [x, y, clr] of tiles) {
      if (!w.inb(x, y)) continue;
      const k = clr ? col(clr) : cc;
      const pts = [[x, y], [x, y + 1], [x + 1, y + 1], [x + 1, y]].map(([a, b]) => [a, w.heightAt(Math.min(a, w.N - 0.001), Math.min(b, w.N - 0.001)) * HS + 0.05, b]);
      // presné rohy
      const cr = w.corners(x, y);
      pts[0][1] = cr[0] * HS + 0.05; pts[1][1] = cr[2] * HS + 0.05; pts[2][1] = cr[3] * HS + 0.05; pts[3][1] = cr[1] * HS + 0.05;
      if (w.water[w.ti(x, y)]) for (const q of pts) q[1] = Math.max(q[1], SEA * HS + 0.15);
      p.push(...pts[0], ...pts[1], ...pts[2], ...pts[0], ...pts[2], ...pts[3]);
      for (let k2 = 0; k2 < 6; k2++) c.push(...k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    this.hlMesh.geometry.dispose();
    this.hlMesh.geometry = g;
  }

  // ---------- kamera ----------
  resize() {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    this.gl.setSize(W, H, false);
    const px = this.settings.pixel;
    this.rt.setSize(Math.max(1, Math.floor(W / px)), Math.max(1, Math.floor(H / px)));
    this.postMat.uniforms.res.value.set(Math.floor(W / px), Math.floor(H / px));
    this.aspect = W / H;
  }

  updateCamera(dt) {
    const v = this.view;
    const targetAz = v.rot * Math.PI / 2 + Math.PI / 4;
    let d = targetAz - v.az;
    v.az += d * Math.min(1, dt * 8);
    const c = this.cam;
    const zoom = v.zoom;
    c.left = -zoom * this.aspect; c.right = zoom * this.aspect; c.top = zoom; c.bottom = -zoom;
    c.near = 1; c.far = 2000;
    c.updateProjectionMatrix();
    const ty = this.world ? this.world.heightAt(Math.max(0, Math.min(this.world.N - 0.01, v.tx)), Math.max(0, Math.min(this.world.N - 0.01, v.tz))) * HS : 0;
    v.ty = lerp(v.ty ?? ty, ty, Math.min(1, dt * 4));
    const dist = 400;
    let sx = 0, sz = 0;
    if (this.shake > 0) { sx = (Math.random() - 0.5) * this.shake; sz = (Math.random() - 0.5) * this.shake; }
    c.position.set(v.tx + sx + Math.sin(v.az) * Math.cos(v.el) * dist, v.ty + Math.sin(v.el) * dist, v.tz + sz + Math.cos(v.az) * Math.cos(v.el) * dist);
    c.lookAt(v.tx + sx, v.ty, v.tz + sz);
  }

  // smer kamery v rovine (pre posun klávesmi)
  screenAxes() {
    const az = this.view.az;
    return { right: [Math.cos(az), -Math.sin(az)], fwd: [-Math.sin(az), -Math.cos(az)] };
  }

  pick(ndcX, ndcY) {
    const w = this.world;
    if (!w) return null;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.cam);
    const o = rc.ray.origin, d = rc.ray.direction;
    const top = MAX_H * HS + 1;
    let t = (o.y - top) / -d.y;
    if (!(t > 0)) t = 0;
    const step = 0.06;
    let prev = null;
    for (let s = 0; s < 4000; s++) {
      const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
      if (py < -2) break;
      const inside = px >= 0 && pz >= 0 && px < w.N && pz < w.N;
      if (inside) {
        let gy = w.heightAt(px, pz) * HS;
        gy = Math.max(gy, SEA * HS + 0.1 - 0.0001 > gy && w.water[w.ti(Math.floor(px), Math.floor(pz))] ? SEA * HS + 0.1 : gy);
        if (py <= gy) {
          // spresnenie
          let lo = prev ?? t - step, hi = t;
          for (let k = 0; k < 10; k++) {
            const m = (lo + hi) / 2;
            const mx = o.x + d.x * m, my = o.y + d.y * m, mz = o.z + d.z * m;
            if (my <= w.heightAt(Math.max(0, Math.min(w.N - 1e-3, mx)), Math.max(0, Math.min(w.N - 1e-3, mz))) * HS) hi = m; else lo = m;
          }
          const fx = o.x + d.x * hi, fz = o.z + d.z * hi;
          return { x: fx, z: fz, tx: Math.floor(fx), ty: Math.floor(fz), cx: Math.round(fx), cy: Math.round(fz) };
        }
      }
      prev = t;
      t += step;
    }
    // mimo terénu: priesečník s rovinou y=SEA
    const tt = (o.y - SEA * HS) / -d.y;
    const fx = o.x + d.x * tt, fz = o.z + d.z * tt;
    return { x: fx, z: fz, tx: Math.floor(fx), ty: Math.floor(fz), cx: Math.round(fx), cy: Math.round(fz), outside: true };
  }

  // ---------- post-processing ----------
  initPost() {
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.rt.texture }, res: { value: new THREE.Vector2(4, 4) },
        dither: { value: 1 }, levels: { value: 28 }, skyTop: { value: new THREE.Color() }, skyBot: { value: new THREE.Color() },
        night: { value: 0 }, exposure: { value: 1.0 }, time: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform vec2 res; uniform float dither, levels, night, exposure, time;
        uniform vec3 skyTop, skyBot; varying vec2 vUv;
        float bayer(vec2 p){
          int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
          int i = x + y * 4;
          float m[16]; m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
          for (int k=0;k<16;k++) if (k==i) return m[k]/16.0;
          return 0.0;
        }
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          vec2 pix = floor(vUv * res);
          vec3 bg = mix(skyBot, skyTop, smoothstep(0.0, 1.0, vUv.y));
          float st = step(0.997, hash(pix)) * night * (0.5 + 0.5 * sin(time * 2.0 + hash(pix + 3.0) * 30.0));
          bg += vec3(st);
          vec3 col = mix(bg, c.rgb, clamp(c.a, 0.0, 1.0));
          col = aces(col * exposure);
          col = pow(col, vec3(1.0/2.2));
          if (dither > 0.5) {
            float b = bayer(pix) - 0.5;
            col += b / levels;
            col = floor(col * levels + 0.5) / levels;
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat);
    q.frustumCulled = false;
    this.postScene.add(q);
  }

  // ---------- deň/noc ----------
  updateLighting(dt) {
    const s = this.settings;
    let tod = this.tod;
    if (s.timeMode === 'day') tod = 0.34; else if (s.timeMode === 'night') tod = 0.97;
    const th = (tod - 0.25) * Math.PI * 2;
    const elev = Math.sin(th);
    const N = this.world ? this.world.N : 128;
    const center = new THREE.Vector3(N / 2, 0, N / 2);
    const day = smoothstep(-0.12, 0.3, elev);
    const night = 1 - smoothstep(-0.2, 0.08, elev);
    const dusk = Math.max(0, 1 - Math.abs(elev) / 0.35) * (1 - night * 0.6);
    let dir;
    if (elev > -0.08) {
      dir = new THREE.Vector3(Math.cos(th) * 0.85, Math.max(0.12, elev), 0.45 + Math.sin(th) * 0.2).normalize();
      const sc = lerpC(new THREE.Color(0xff9a50), new THREE.Color(0xfff1dc), smoothstep(0.05, 0.5, elev));
      this.sun.color.copy(sc);
      this.sun.intensity = 3.6 * smoothstep(-0.08, 0.2, elev);
    } else {
      dir = new THREE.Vector3(-Math.cos(th) * 0.6, 0.75, -0.4).normalize();
      this.sun.color.set(0x8aa2ff);
      this.sun.intensity = 0.55 * smoothstep(-0.08, -0.3, elev);
    }
    this.sun.position.copy(center).addScaledVector(dir, N * 1.4 + 50);
    this.sun.target.position.copy(center);
    this.sun.castShadow = s.shadows;
    this.hemi.color.copy(lerpC(new THREE.Color(0x26325c), new THREE.Color(0xc4dcff), day));
    this.hemi.groundColor.copy(lerpC(new THREE.Color(0x1a1612), new THREE.Color(0x6a5638), day));
    this.hemi.intensity = lerp(0.55, 0.85, day);
    this.amb.intensity = lerp(0.12, 0.18, day);
    this.uniforms.uNight.value = night;
    const top = lerpC(lerpC(new THREE.Color(0x03050c), new THREE.Color(0x3d6fc0), day), new THREE.Color(0x3a3a7a), dusk * 0.6);
    const bot = lerpC(lerpC(new THREE.Color(0x10162c), new THREE.Color(0xbcd7ef), day), new THREE.Color(0xf09a5a), dusk * 0.7);
    this.postMat.uniforms.skyTop.value.copy(top);
    this.postMat.uniforms.skyBot.value.copy(bot);
    this.postMat.uniforms.night.value = night;
    this.postMat.uniforms.exposure.value = lerp(1.35, 1.0, day);
    this.night = night;
  }

  render(dt, time) {
    this.uniforms.uTime.value = time;
    this.postMat.uniforms.time.value = time;
    this.postMat.uniforms.dither.value = this.settings.dither ? 1 : 0;
    this.uniforms.uGrid.value = this.settings.grid ? 1 : 0;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 0.6);
    this.updateLighting(dt);
    this.updateCamera(dt);
    this.particles.mesh.material.uniforms.uLight.value = 1 - this.night * 0.78;
    this.particles.update(dt, this.cam);
    this.flames.update(dt, this.cam);
    const g = this.gl;
    g.setRenderTarget(this.rt);
    g.setClearColor(0x000000, 0);
    g.clear();
    g.render(this.scene, this.cam);
    g.setRenderTarget(null);
    g.render(this.postScene, this.postCam);
  }

  // dym z komínov a oheň
  spawnEffects(dt, sim, speedFactor) {
    const w = this.world;
    for (const list of this.emitters.values()) for (const e of list) {
      const rate = (e[4] || 1) * 1.2 * dt * Math.max(0.3, speedFactor);
      if (Math.random() < rate) {
        const steam = e[3] === 1;
        const g = steam ? 0.9 + Math.random() * 0.1 : 0.35 + Math.random() * 0.2;
        this.particles.spawn(e[0], e[1], e[2], (Math.random() - 0.5) * 0.05 + 0.15, 0.35 + Math.random() * 0.15, (Math.random() - 0.5) * 0.05 + 0.08,
          steam ? 0.25 : 0.12, steam ? 1.3 : 0.7, 4 + Math.random() * 2, [g, g, g * 1.02], steam ? 0.75 : 0.65);
      }
    }
    // požiare
    if (sim && sim.burning) {
      const N = w.N;
      for (let i = 0; i < N * N; i++) {
        if (!w.fire[i]) continue;
        const x = i % N + 0.5, z = ((i / N) | 0) + 0.5;
        const y = w.tileMax(i % N, (i / N) | 0) * HS + 0.1;
        if (Math.random() < dt * 14) this.flames.spawn(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6, 0, 0.6 + Math.random() * 0.5, 0, 0.25, 0.05, 0.7 + Math.random() * 0.4, [3.0, 1.1 + Math.random() * 0.6, 0.2], 1);
        if (Math.random() < dt * 4) this.particles.spawn(x, y + 0.5, z, 0.1, 0.5, 0.05, 0.2, 1.0, 3, [0.12, 0.11, 0.1], 0.8);
      }
    }
  }
}

// ---------- častice (billboardy) ----------
class Particles {
  constructor(max, additive) {
    this.max = max;
    this.list = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 4 * 3);
    this.col = new Float32Array(max * 4 * 4);
    this.uv = new Float32Array(max * 4 * 2);
    const idx = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) {
      this.uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('acol', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      vertexShader: `attribute vec4 acol; varying vec4 vC; varying vec2 vUv; void main(){ vC = acol; vUv = uv; gl_Position = projectionMatrix * viewMatrix * vec4(position,1.0); }`,
      uniforms: { uLight: { value: 1 } },
      fragmentShader: `uniform float uLight; varying vec4 vC; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = (1.0 - smoothstep(0.55, 1.0, d)) * vC.a; if (a < 0.02) discard; gl_FragColor = vec4(vC.rgb * uLight, a); }`,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }
  spawn(x, y, z, vx, vy, vz, s0, s1, life, color, alpha) {
    if (this.list.length >= this.max) return;
    this.list.push({ x, y, z, vx, vy, vz, s0, s1, life, age: 0, color, alpha });
  }
  clear() { this.list.length = 0; }
  update(dt, cam) {
    const right = new THREE.Vector3(), up = new THREE.Vector3();
    cam.matrixWorld.extractBasis(right, up, new THREE.Vector3());
    const L = this.list;
    let n = 0;
    for (let k = 0; k < L.length; k++) {
      const p = L[k];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vy *= 0.995;
      const t = p.age / p.life;
      const s = p.s0 + (p.s1 - p.s0) * t;
      const a = p.alpha * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
      const o = n * 12;
      const rx = right.x * s, ry = right.y * s, rz = right.z * s, ux = up.x * s, uy = up.y * s, uz = up.z * s;
      this.pos[o] = p.x - rx - ux; this.pos[o + 1] = p.y - ry - uy; this.pos[o + 2] = p.z - rz - uz;
      this.pos[o + 3] = p.x + rx - ux; this.pos[o + 4] = p.y + ry - uy; this.pos[o + 5] = p.z + rz - uz;
      this.pos[o + 6] = p.x + rx + ux; this.pos[o + 7] = p.y + ry + uy; this.pos[o + 8] = p.z + rz + uz;
      this.pos[o + 9] = p.x - rx + ux; this.pos[o + 10] = p.y - ry + uy; this.pos[o + 11] = p.z - rz + uz;
      for (let v = 0; v < 4; v++) { const c = n * 16 + v * 4; this.col[c] = p.color[0]; this.col[c + 1] = p.color[1]; this.col[c + 2] = p.color[2]; this.col[c + 3] = a; }
      L[n++] = p;
    }
    L.length = n;
    this.geo.setDrawRange(0, n * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.acol.needsUpdate = true;
  }
}

// ---------- autá ----------
class Cars {
  constructor(scene, uniforms) {
    this.max = 700;
    const g = new THREE.BoxGeometry(0.17, 0.065, 0.085);
    g.translate(0, 0.045, 0);
    const top = new THREE.BoxGeometry(0.09, 0.04, 0.075); top.translate(-0.01, 0.095, 0);
    const merged = mergeBoxes([g, top]);
    this.mesh = new THREE.InstancedMesh(merged, new THREE.MeshLambertMaterial(), this.max);
    this.mesh.castShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    const lg = new THREE.BoxGeometry(0.02, 0.025, 0.08); lg.translate(0.09, 0.05, 0);
    this.lightsMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.lights = new THREE.InstancedMesh(lg, this.lightsMat, this.max);
    this.lights.frustumCulled = false;
    scene.add(this.mesh, this.lights);
    const palette = [0xc8352b, 0x2f5fa8, 0xeeeeea, 0x2b2b2b, 0xe0a224, 0x3d8a4a, 0x8a8f96, 0x6a2f8a];
    for (let i = 0; i < this.max; i++) this.mesh.setColorAt(i, new THREE.Color(palette[i % palette.length]));
    this.list = [];
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(1, 1, 1); this.p = new THREE.Vector3();
    this.roadTiles = [];
  }
  reset() { this.list = []; }
  refreshRoads(w) {
    this.roadTiles = [];
    for (let i = 0; i < w.N * w.N; i++) if (w.road[i]) this.roadTiles.push(i);
  }
  update(dt, w, target, night, speed) {
    const N = w.N;
    // spawn / despawn
    while (this.list.length < Math.min(target, this.max) && this.roadTiles.length) {
      let i = this.roadTiles[Math.floor(Math.random() * this.roadTiles.length)];
      if (w.traffic[i] < 10 && Math.random() < 0.7) break;
      const x = i % N, y = (i / N) | 0;
      const nx = this.next(w, x, y, -1);
      if (nx < 0) break;
      this.list.push({ x, y, d: nx, t: Math.random(), v: 0.9 + Math.random() * 0.5 });
    }
    if (this.list.length > target + 5) this.list.length = Math.max(0, target);
    const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
    let n = 0;
    for (let k = 0; k < this.list.length; k++) {
      const c = this.list[k];
      if (!w.road[w.ti(c.x, c.y)]) continue;
      const jam = w.traffic[w.ti(c.x, c.y)] / 255;
      c.t += dt * c.v * (1.4 - jam) * speed;
      while (c.t >= 1) {
        c.t -= 1;
        c.x += DX[c.d]; c.y += DY[c.d];
        if (!w.inb(c.x, c.y) || !w.road[w.ti(c.x, c.y)]) { c.dead = true; break; }
        const nd = this.next(w, c.x, c.y, (c.d + 2) % 4);
        if (nd < 0) { c.dead = true; break; }
        c.d = nd;
      }
      if (c.dead) continue;
      const lane = 0.13;
      const px = c.x + 0.5 + DX[c.d] * c.t - DY[c.d] * lane, pz = c.y + 0.5 + DY[c.d] * c.t + DX[c.d] * lane;
      if (px < 0 || pz < 0 || px >= N || pz >= N) continue;
      const ti = w.ti(Math.floor(px), Math.floor(pz));
      const py = w.water[ti] ? SEA * HS + 0.32 : w.heightAt(px, pz) * HS + 0.03;
      this.p.set(px, py, pz);
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), [Math.PI / 2, 0, -Math.PI / 2, Math.PI][c.d]);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      this.lights.setMatrixAt(n, this.m);
      this.list[n++] = c;
    }
    this.list.length = n;
    this.mesh.count = n; this.lights.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.lights.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.lightsMat.color.setRGB(2.5 * night, 2.1 * night, 1.2 * night);
    this.lights.visible = night > 0.05;
  }
  next(w, x, y, back) {
    const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
    const opts = [];
    for (let d = 0; d < 4; d++) {
      if (d === back) continue;
      const xx = x + DX[d], yy = y + DY[d];
      if (w.inb(xx, yy) && w.road[w.ti(xx, yy)]) opts.push(d);
    }
    if (!opts.length) return back >= 0 && w.inb(x + DX[back], y + DY[back]) && w.road[w.ti(x + DX[back], y + DY[back])] ? back : -1;
    return opts[Math.floor(Math.random() * opts.length)];
  }
}

function mergeBoxes(geos) {
  const p = [], n = [], idx = [];
  let off = 0;
  for (const g of geos) {
    const gi = g.toNonIndexed ? g : g;
    const pa = g.attributes.position.array, na = g.attributes.normal.array, ia = g.index.array;
    p.push(...pa); n.push(...na);
    for (const i of ia) idx.push(i + off);
    off += pa.length / 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setIndex(idx);
  return g;
}

// ---------- ikonky "bez elektriny" ----------
class PowerIcons {
  constructor(scene) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 16;
    const x = cv.getContext('2d');
    x.fillStyle = '#000'; x.beginPath(); x.arc(8, 8, 7.5, 0, 7); x.fill();
    x.fillStyle = '#ffd400'; x.beginPath(); x.arc(8, 8, 6.5, 0, 7); x.fill();
    x.fillStyle = '#c00';
    x.beginPath(); x.moveTo(9, 2); x.lineTo(4, 9); x.lineTo(8, 9); x.lineTo(6, 14); x.lineTo(12, 6); x.lineTo(8, 6); x.lineTo(10, 2); x.fill();
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.LinearSRGBColorSpace;
    this.mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    this.group = new THREE.Group(); this.group.renderOrder = 20;
    scene.add(this.group);
    this.sprites = [];
  }
  update(w, time, zoom) {
    const list = [];
    if (w) for (let i = 0; i < w.N * w.N; i++) if (w.level[i] > 0 && !w.powered[i] && !w.abandoned[i] && w.zone[i]) list.push(i);
    const vis = Math.sin(time * 5) > -0.3;
    while (this.sprites.length < Math.min(list.length, 600)) { const s = new THREE.Sprite(this.mat); s.renderOrder = 20; this.group.add(s); this.sprites.push(s); }
    const sc = Math.max(0.35, zoom * 0.03);
    for (let k = 0; k < this.sprites.length; k++) {
      const s = this.sprites[k];
      if (k < list.length && vis) {
        const i = list[k], x = i % w.N, y = (i / w.N) | 0;
        const L = w.level[i];
        s.position.set(x + 0.5, w.tileMax(x, y) * HS + 0.5 + L * 0.25, y + 0.5);
        s.scale.set(sc, sc, 1);
        s.visible = true;
      } else s.visible = false;
    }
  }
}
