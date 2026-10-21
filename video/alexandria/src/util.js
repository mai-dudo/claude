import * as THREE from 'three';

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ss = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const eio = (x) => {
  x = clamp(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const eSine = (x) => -(Math.cos(Math.PI * clamp(x)) - 1) / 2;
export const eOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
export const eIn = (x) => Math.pow(clamp(x), 3);
export const pulse = (t, c, w) => Math.exp(-Math.pow((t - c) / w, 2));

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

// Periodic Perlin noise, so textures can tile.
export class Noise {
  constructor(seed) {
    const r = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  static grad(h, x, y) {
    switch (h & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  }
  n2(x, y, px = 256, py = 256) {
    px = Math.max(1, Math.round(px));
    py = Math.max(1, Math.round(py));
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X0 = ((xi % px) + px) % px, Y0 = ((yi % py) + py) % py;
    const X1 = (X0 + 1) % px, Y1 = (Y0 + 1) % py;
    const P = this.perm;
    const aa = P[P[X0] + Y0], ab = P[P[X0] + Y1], ba = P[P[X1] + Y0], bb = P[P[X1] + Y1];
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const g = Noise.grad;
    const x1 = lerp(g(aa, xf, yf), g(ba, xf - 1, yf), u);
    const x2 = lerp(g(ab, xf, yf - 1), g(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  }
  fbm(x, y, oct = 5, px = 256, py = 256) {
    let a = 0.5, f = 1, s = 0;
    for (let o = 0; o < oct; o++) {
      s += a * this.n2(x * f, y * f, Math.min(256, px * f), Math.min(256, py * f));
      a *= 0.5;
      f *= 2;
    }
    return s;
  }
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

export function tex(canvas, { srgb = true, repeat = false, aniso = 8, flipY = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.flipY = flipY;
  t.needsUpdate = true;
  return t;
}

// Smooth keyframe track: keys = [[time, value|array], ...].
// Cubic Hermite with Catmull-Rom tangents; endpoints use one-sided slopes
// (or zero slopes when ease = true) so motion stays continuous across keys.
export function ktrack(keys, { ease = false } = {}) {
  const n = keys.length;
  const T = keys.map((k) => k[0]);
  const V = keys.map((k) => (Array.isArray(k[1]) ? k[1] : [k[1]]));
  const dim = V[0].length;
  const M = V.map((v, i) => {
    const m = new Array(dim).fill(0);
    if (n < 2) return m;
    if (i === 0 || i === n - 1) {
      if (ease) return m;
      const a = i === 0 ? 0 : n - 2;
      for (let d = 0; d < dim; d++) m[d] = (V[a + 1][d] - V[a][d]) / (T[a + 1] - T[a]);
      return m;
    }
    for (let d = 0; d < dim; d++) m[d] = (V[i + 1][d] - V[i - 1][d]) / (T[i + 1] - T[i - 1]);
    return m;
  });
  const scalar = !Array.isArray(keys[0][1]);
  return (t) => {
    let out;
    if (t <= T[0]) out = V[0].slice();
    else if (t >= T[n - 1]) out = V[n - 1].slice();
    else {
      let i = 0;
      while (i < n - 2 && t > T[i + 1]) i++;
      const h = T[i + 1] - T[i];
      const s = (t - T[i]) / h;
      const s2 = s * s, s3 = s2 * s;
      const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
      out = new Array(dim);
      for (let d = 0; d < dim; d++)
        out[d] = h00 * V[i][d] + h10 * h * M[i][d] + h01 * V[i + 1][d] + h11 * h * M[i + 1][d];
    }
    return scalar ? out[0] : out;
  };
}

// Camera rig driven by position and target tracks.
export function rigCamera(camera, posTrack, tgtTrack, t, roll = 0) {
  const p = posTrack(t), q = tgtTrack(t);
  camera.position.set(p[0], p[1], p[2]);
  camera.up.set(Math.sin(roll), Math.cos(roll), 0);
  camera.lookAt(q[0], q[1], q[2]);
  camera.updateMatrixWorld();
}

export function hdr(hex, k) {
  return new THREE.Color(hex).multiplyScalar(k);
}

// Shader helpers shared by several particle systems.
export const GLSL_HASH = /* glsl */ `
float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
vec3 hash31(float p){ vec3 p3 = fract(vec3(p) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
`;
