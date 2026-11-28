import * as THREE from 'three';

const _c = new THREE.Color();
const cache = new Map();
// hex (sRGB) -> lineárne [r,g,b]
export function col(hex) {
  let v = cache.get(hex);
  if (!v) { _c.setHex(hex); v = [_c.r, _c.g, _c.b]; cache.set(hex, v); }
  return v;
}
export function shade(c, f) { return [c[0] * f, c[1] * f, c[2] * f]; }
export function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
const ZERO = [0, 0, 0];

// Builder: pozície, normály, farby, žiara (emisia v noci)
export class GB {
  constructor() { this.p = []; this.n = []; this.c = []; this.g = []; }
  get count() { return this.p.length / 3; }

  tri(a, b, c, color, glow = ZERO, hint = null) {
    let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    let vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.c.push(color[0], color[1], color[2], color[0], color[1], color[2], color[0], color[1], color[2]);
    this.g.push(glow[0], glow[1], glow[2], glow[0], glow[1], glow[2], glow[0], glow[1], glow[2]);
  }
  quad(a, b, c, d, color, glow, hint) { this.tri(a, b, c, color, glow, hint); this.tri(a, c, d, color, glow, hint); }

  // trojuholník s farbou po vrcholoch (prechody = falošná ambientná oklúzia)
  tric(a, b, c, ca, cb, cc, glow = ZERO, hint = null) {
    let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    let vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { let t = b; b = c; c = t; t = cb; cb = cc; cc = t; nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.c.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2]);
    this.g.push(glow[0], glow[1], glow[2], glow[0], glow[1], glow[2], glow[0], glow[1], glow[2]);
  }
  quadC(a, b, c, d, ca, cb, cc, cd, glow, hint) { this.tric(a, b, c, ca, cb, cc, glow, hint); this.tric(a, c, d, ca, cc, cd, glow, hint); }

  // kváder: stred x,z, spodok y, rozmery w (x), h, d (z); colors: farba alebo {top, side}
  box(x, y, z, w, h, d, color, opt = {}) {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y0 = y, y1 = y + h;
    const top = opt.top || color, side = color;
    const g = opt.glow || ZERO;
    const sx = opt.shadeX ?? 0.86, sz = opt.shadeZ ?? 0.94;
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], top, opt.topGlow || g, [0, 1, 0]);
    if (!opt.noSides) {
      // spodok steny je tmavší (falošná ambientná oklúzia), vrch jemne svetlejší
      const ao = opt.ao ?? (h > 0.14 ? 0.72 : 0.9);
      const side4 = (f, a, b, c, d, hint) => {
        const base = shade(side, f), lo = shade(base, ao), hi = shade(base, 1.04);
        this.quadC(a, b, c, d, lo, hi, hi, lo, g, hint);
      };
      side4(sx, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
      side4(sx, [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0]);
      side4(sz, [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], [0, 0, 1]);
      side4(sz, [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1]);
    }
    if (opt.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], side, g, [0, -1, 0]);
  }

  // sedlová strecha; axis 'x' = hrebeň pozdĺž osi x
  gable(x, y, z, w, h, d, roof, wall, axis = 'x', over = 0.04) {
    if (axis === 'x') {
      const x0 = x - w / 2 - over, x1 = x + w / 2 + over, z0 = z - d / 2 - over, z1 = z + d / 2 + over, yt = y + h;
      this.quad([x0, y, z1], [x1, y, z1], [x1, yt, z], [x0, yt, z], roof, ZERO, [0, 1, 1]);
      this.quad([x1, y, z0], [x0, y, z0], [x0, yt, z], [x1, yt, z], shade(roof, 0.82), ZERO, [0, 1, -1]);
      const gx0 = x - w / 2, gx1 = x + w / 2, gz0 = z - d / 2, gz1 = z + d / 2;
      this.tri([gx1, y, gz0], [gx1, yt, z], [gx1, y, gz1], shade(wall, 0.86), ZERO, [1, 0, 0]);
      this.tri([gx0, y, gz1], [gx0, yt, z], [gx0, y, gz0], shade(wall, 0.86), ZERO, [-1, 0, 0]);
    } else {
      const z0 = z - d / 2 - over, z1 = z + d / 2 + over, x0 = x - w / 2 - over, x1 = x + w / 2 + over, yt = y + h;
      this.quad([x1, y, z0], [x1, y, z1], [x, yt, z1], [x, yt, z0], shade(roof, 0.9), ZERO, [1, 1, 0]);
      this.quad([x0, y, z1], [x0, y, z0], [x, yt, z0], [x, yt, z1], shade(roof, 0.78), ZERO, [-1, 1, 0]);
      const gx0 = x - w / 2, gx1 = x + w / 2, gz0 = z - d / 2, gz1 = z + d / 2;
      this.tri([gx0, y, gz1], [x, yt, gz1], [gx1, y, gz1], shade(wall, 0.94), ZERO, [0, 0, 1]);
      this.tri([gx1, y, gz0], [x, yt, gz0], [gx0, y, gz0], shade(wall, 0.94), ZERO, [0, 0, -1]);
    }
  }

  // ihlanová strecha
  pyramid(x, y, z, w, h, d, color, glow = ZERO) {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, t = [x, y + h, z];
    this.tri([x0, y, z1], [x1, y, z1], t, color, glow, [0, 1, 1]);
    this.tri([x1, y, z1], [x1, y, z0], t, shade(color, 0.88), glow, [1, 1, 0]);
    this.tri([x1, y, z0], [x0, y, z0], t, shade(color, 0.75), glow, [0, 1, -1]);
    this.tri([x0, y, z0], [x0, y, z1], t, shade(color, 0.8), glow, [-1, 1, 0]);
  }

  // valec / kužeľ
  cyl(x, y, z, r, h, color, seg = 8, rTop = null, opt = {}) {
    const rt = rTop === null ? r : rTop;
    const y1 = y + h, g = opt.glow || ZERO;
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const mid = (a0 + a1) / 2;
      const hint = [Math.cos(mid), 0.2, Math.sin(mid)];
      const f = 0.78 + 0.22 * Math.max(0, Math.cos(mid - 0.6));
      const cc = shade(color, f);
      if (rt > 0.0001) this.quad([x + c0 * r, y, z + s0 * r], [x + c0 * rt, y1, z + s0 * rt], [x + c1 * rt, y1, z + s1 * rt], [x + c1 * r, y, z + s1 * r], cc, g, hint);
      else this.tri([x + c0 * r, y, z + s0 * r], [x, y1, z], [x + c1 * r, y, z + s1 * r], cc, g, hint);
      if (rt > 0.0001 && !opt.noCap) this.tri([x, y1, z], [x + c1 * rt, y1, z + s1 * rt], [x + c0 * rt, y1, z + s0 * rt], opt.top || color, g, [0, 1, 0]);
    }
  }

  // hyperboloid (chladiaca veža) – niekoľko prstencov
  lathe(x, y, z, profile, color, seg = 10) {
    for (let k = 0; k < profile.length - 1; k++) {
      const [r0, h0] = profile[k], [r1, h1] = profile[k + 1];
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2, mid = (a0 + a1) / 2;
        const f = 0.75 + 0.25 * Math.max(0, Math.cos(mid - 0.6));
        this.quad([x + Math.cos(a0) * r0, y + h0, z + Math.sin(a0) * r0], [x + Math.cos(a0) * r1, y + h1, z + Math.sin(a0) * r1],
          [x + Math.cos(a1) * r1, y + h1, z + Math.sin(a1) * r1], [x + Math.cos(a1) * r0, y + h0, z + Math.sin(a0 + (a1 - a0)) * r0], shade(color, f), ZERO, [Math.cos(mid), 0, Math.sin(mid)]);
      }
    }
  }

  // pásy okien okolo kvádra (po poschodiach); lit 0..1 pravdepodobnosť svietenia
  windows(x, y, z, w, h, d, floors, rnd, opt = {}) {
    const fh = h / floors;
    const glass = opt.glass || col(0x2b3a4a);
    const warm = opt.warm || [1.0, 0.72, 0.32];
    const lit = opt.lit ?? 0.45;
    const e = 0.006;
    const x0 = x - w / 2 - e, x1 = x + w / 2 + e, z0 = z - d / 2 - e, z1 = z + d / 2 + e;
    const start = opt.skipGround ? 1 : 0;
    const aoAt = yy => { const t = Math.max(0, Math.min(1, (yy - y) / Math.max(0.0001, h))); return 0.72 + 0.32 * t; };
    for (let f = start; f < floors; f++) {
      const ya = y + f * fh + fh * 0.3, yb = y + f * fh + fh * 0.78;
      const segs = opt.segs || 2;
      for (let s = 0; s < segs; s++) {
        const t0 = s / segs + 0.06, t1 = (s + 1) / segs - 0.06;
        const sides = [
          [[x1, ya, z0 + (z1 - z0) * t0], [x1, yb, z0 + (z1 - z0) * t0], [x1, yb, z0 + (z1 - z0) * t1], [x1, ya, z0 + (z1 - z0) * t1], [1, 0, 0]],
          [[x0, ya, z1 - (z1 - z0) * t0], [x0, yb, z1 - (z1 - z0) * t0], [x0, yb, z1 - (z1 - z0) * t1], [x0, ya, z1 - (z1 - z0) * t1], [-1, 0, 0]],
          [[x1 - (x1 - x0) * t0, ya, z1], [x1 - (x1 - x0) * t0, yb, z1], [x1 - (x1 - x0) * t1, yb, z1], [x1 - (x1 - x0) * t1, ya, z1], [0, 0, 1]],
          [[x0 + (x1 - x0) * t0, ya, z0], [x0 + (x1 - x0) * t0, yb, z0], [x0 + (x1 - x0) * t1, yb, z0], [x0 + (x1 - x0) * t1, ya, z0], [0, 0, -1]],
        ];
        for (const sd of sides) {
          const on = rnd() < lit;
          const gl = on ? warm.map(v => v * (0.6 + rnd() * 0.5)) : ZERO;
          const gc = on ? mix(glass, [0.5, 0.42, 0.25], 0.25) : glass;
          this.quadC(sd[0], sd[1], sd[2], sd[3], shade(gc, aoAt(ya)), shade(gc, aoAt(yb)), shade(gc, aoAt(yb)), shade(gc, aoAt(ya)), gl, sd[4]);
        }
      }
    }
  }

  toGeometry() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    geo.setAttribute('glow', new THREE.Float32BufferAttribute(this.g, 3));
    geo.computeBoundingSphere();
    return geo;
  }
}

// šum pre shadery (hodnotový šum + fbm)
export const NOISE_GLSL = `
float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hsh(i), hsh(i + vec2(1.0, 0.0)), f.x), mix(hsh(i + vec2(0.0, 1.0)), hsh(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm2(vec2 p){ return vnoise(p) * 0.6 + vnoise(p * 2.07 + 7.3) * 0.3 + vnoise(p * 4.1 + 3.1) * 0.1; }
`;
// tiene oblakov: pomaly plávajúce tmavé škvrny na zemi
export const CLOUD_GLSL = `
float cloudShade(vec2 wp, float t){
  float c = fbm2(wp * 0.028 + vec2(t * 0.45, t * 0.18));
  return smoothstep(0.52, 0.78, c);
}
`;

// materiál s nočnou žiarou (atribút glow * uNight) a tieňmi oblakov
export function glowMaterial(uniforms, extra = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, ...extra });
  m.onBeforeCompile = sh => {
    sh.uniforms.uNight = uniforms.uNight;
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uCloud = uniforms.uCloud;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 glow;\nvarying vec3 vGlow;\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight, uTime, uCloud;\nvarying vec3 vGlow;\nvarying vec3 vWP;\n' + NOISE_GLSL + CLOUD_GLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - 0.24 * uCloud * cloudShade(vWP.xz, uTime);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow * uNight * 1.7;');
  };
  return m;
}
