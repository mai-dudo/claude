// Shared building blocks: texture cache, the manuscript, particle swarms,
// glowing line art and machine parts.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as TX from './textures.js';
import { clamp, ss, mulberry32, GLSL_HASH } from './util.js';

export const W = 1080, H = 1920;
export const GOLD = new THREE.Color(1.0, 0.72, 0.36);
export const TURQ = new THREE.Color(0.35, 0.95, 0.9);

const cache = new Map();
export function asset(name, make) {
  if (!cache.has(name)) cache.set(name, make());
  return cache.get(name);
}
export const T = {
  sigil: () => asset('sigil', () => TX.sigilTexture(2048)),
  pageR: () => asset('pageR', () => TX.pageTextures('R')),
  pageL: () => asset('pageL', () => TX.pageTextures('L')),
  cover: () => asset('cover', () => TX.coverTextures()),
  dust: () => asset('dust', () => TX.dustTexture()),
  edge: () => asset('edge', () => TX.pageEdgeTexture()),
  atlas: () => asset('atlas', () => TX.glyphAtlas()),
  dot: () => asset('dot', () => TX.softDot()),
  beam: () => asset('beam', () => TX.beamTexture()),
  parchment: (s = 3) => asset('parch' + s, () => TX.parchmentTexture(s)),
  scrollSheet: () => asset('scrollSheet', () => TX.scrollSheetTexture()),
  scrollCap: () => asset('scrollCap', () => TX.scrollCapTexture()),
  stone: (seed = 1, tone) => asset('stone' + seed, () => TX.stoneTextures(seed, tone)),
  marble: () => asset('marble', () => TX.marbleTexture()),
  floor: () => asset('floor', () => TX.floorTexture()),
  flute: () => asset('flute', () => TX.fluteBump()),
  wood: (tone, seed = 3) => asset('wood' + seed, () => TX.woodTexture(tone, 512, seed)),
  water: () => asset('water', () => TX.waterNormals()),
  facade: (kind, seed = 1) => asset('fac' + kind + seed, () => TX.facadeTextures(kind, seed)),
  sandstone: () => asset('sandstone', () => TX.sandstoneTexture()),
  paving: () => asset('paving', () => TX.pavingTexture()),
  astrolabe: () => asset('astro', () => TX.astrolabeFace()),
  rete: () => asset('rete', () => TX.reteTexture()),
  celestial: () => asset('celestial', () => TX.celestialTexture()),
  spines: () => asset('spines', () => TX.bookSpinesTexture()),
  windowLight: (era) => asset('win' + era, () => TX.windowLightTexture(era)),
  blueprint: () => asset('blueprint', () => TX.blueprintTexture()),
  anatomy: () => asset('anatomy', () => TX.anatomyTexture()),
};

export function setRepeat(t, x, y) {
  const c = t.clone();
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(x, y);
  c.needsUpdate = true;
  return c;
}

// ------------------------------------------------------------------ the book
const PW = 0.4, PL = 0.56, BT = 0.03, CT = 0.008;

function curvedPage(width, length, flipDown) {
  const g = new THREE.PlaneGeometry(width, length, 40, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(width / 2, 0, 0);
  const pos = g.attributes.position;
  const curved = new Float32Array(pos.array.length);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    let y = 0.017 * Math.sin(Math.min(x / 0.13, 1) * Math.PI / 2) - 0.01 * ss(0.33, 0.4, x);
    curved[i * 3] = x;
    curved[i * 3 + 1] = flipDown ? -y : y;
    curved[i * 3 + 2] = pos.getZ(i);
  }
  g.morphAttributes.position = [new THREE.BufferAttribute(curved, 3)];
  g.morphTargetsRelative = false;
  if (flipDown) {
    // Face down: flip winding and normals
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i];
      idx[i] = idx[i + 2];
      idx[i + 2] = t;
    }
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setY(i, -n.getY(i));
    // Mirror u so it reads correctly after the leaf turns over
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  }
  return g;
}

export class Book {
  constructor({ shadows = true } = {}) {
    this.group = new THREE.Group();
    const edgeTex = T.edge();
    const edgeMat = new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 0.9 });
    const cov = T.cover();
    this.coverMat = new THREE.MeshStandardMaterial({
      map: cov.map, roughnessMap: cov.metalRough, metalnessMap: cov.metalRough,
      bumpMap: cov.bump, bumpScale: 1.6, roughness: 1, metalness: 1,
    });
    const coverEdge = new THREE.MeshStandardMaterial({ color: 0x3a1a10, roughness: 0.7 });
    const pr = T.pageR(), pl = T.pageL();
    this.pageMatR = new THREE.MeshStandardMaterial({
      map: pr.map, emissiveMap: pr.emissiveMap, emissive: GOLD.clone(), emissiveIntensity: 0, roughness: 0.88,
    });
    this.pageMatL = new THREE.MeshStandardMaterial({
      map: pl.map, emissiveMap: pl.emissiveMap, emissive: GOLD.clone(), emissiveIntensity: 0, roughness: 0.88,
    });
    const plain = new THREE.MeshStandardMaterial({ map: T.parchment(4), roughness: 0.9 });

    // Back cover + right block
    const back = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.012, CT, PL + 0.02), [coverEdge, coverEdge, this.coverMat, this.coverMat, coverEdge, coverEdge]);
    back.position.set(PW / 2 + 0.004, CT / 2, 0);
    const right = new THREE.Mesh(new THREE.BoxGeometry(PW, BT, PL), [edgeMat, edgeMat, plain, plain, edgeMat, edgeMat]);
    right.position.set(PW / 2, CT + BT / 2, 0);
    this.group.add(back, right);
    const top = CT + BT;
    this.pageR = new THREE.Mesh(curvedPage(PW, PL, false), this.pageMatR);
    this.pageR.position.set(0, top + 0.0005, 0);
    this.group.add(this.pageR);

    // The leaf: front cover with left block, hinged on the spine
    this.leaf = new THREE.Group();
    this.leaf.position.set(0, top, 0);
    const leftBlock = new THREE.Mesh(new THREE.BoxGeometry(PW, BT, PL), [edgeMat, edgeMat, plain, plain, edgeMat, edgeMat]);
    leftBlock.position.set(PW / 2, BT / 2, 0);
    const front = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.012, CT, PL + 0.02), [coverEdge, coverEdge, this.coverMat, this.coverMat, coverEdge, coverEdge]);
    front.position.set(PW / 2 + 0.004, BT + CT / 2, 0);
    this.pageL = new THREE.Mesh(curvedPage(PW, PL, true), this.pageMatL);
    this.pageL.position.set(0, -0.0005, 0);
    this.leaf.add(leftBlock, front, this.pageL);
    this.group.add(this.leaf);

    // Spine
    this.spine = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, PL + 0.02, 24, 1, true, Math.PI, Math.PI), coverEdge);
    this.spine.rotation.x = Math.PI / 2;
    this.spine.position.set(0, top, 0);
    this.group.add(this.spine);

    // Fanning sheets
    this.sheets = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.PlaneGeometry(PW, PL, 24, 1);
      g.translate(PW / 2, 0, 0);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k);
        p.setZ(k, p.getY(k));
        p.setY(k, Math.sin((x / PW) * Math.PI) * 0.03);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: T.parchment(5 + i), roughness: 0.9, side: THREE.DoubleSide }));
      const piv = new THREE.Group();
      piv.position.set(0, top + 0.001, 0);
      piv.add(m);
      piv.visible = false;
      this.group.add(piv);
      this.sheets.push(piv);
    }

    // Dust on the cover, swept away
    const dustMat = new THREE.MeshStandardMaterial({ map: T.dust(), transparent: true, roughness: 1, depthWrite: false });
    this.dustU = { uSweep: { value: 0 } };
    dustMat.onBeforeCompile = (sh) => {
      sh.uniforms.uSweep = this.dustU.uSweep;
      sh.fragmentShader = 'uniform float uSweep;\n' + sh.fragmentShader.replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n diffuseColor.a *= smoothstep(uSweep - 0.02, uSweep + 0.12, vMapUv.x);',
      );
    };
    this.dust = new THREE.Mesh(new THREE.PlaneGeometry(PW + 0.01, PL + 0.02), dustMat);
    this.dust.rotation.x = -Math.PI / 2;
    this.dust.position.set(PW / 2 + 0.004, BT + CT + 0.0012, 0);
    this.leaf.add(this.dust);

    // Glowing sigil decal over the drawn sigil on the right page
    this.sigilMat = new THREE.MeshBasicMaterial({
      map: T.sigil(), color: GOLD.clone().multiplyScalar(1.5), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const sz = (0.3 * PW) / 0.42;
    this.sigil = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), this.sigilMat);
    this.sigil.rotation.x = -Math.PI / 2;
    this.sigil.position.set(PW * 0.5, top + 0.018, -PL / 2 + 0.3 * PL);
    this.group.add(this.sigil);
    this.sigilLocal = this.sigil.position.clone();

    if (shadows) this.group.traverse((o) => { if (o.isMesh && o !== this.dust && o !== this.sigil) { o.castShadow = true; o.receiveShadow = true; } });
    this.set({});
  }

  // open: 0 closed .. 1 fully open; fan: 0..1 sheets turning; ink: glow of
  // the writing; sigil: glow of the page symbol; dust: sweep progress.
  set({ open = 1, fan = 1, ink = 0, sigil = 0, dust = 1, inkL = null }) {
    const a = Math.PI * clamp(open);
    this.leaf.rotation.z = a;
    const sp = 1 - clamp(open);
    this.spine.scale.set(0.012 + 0.03 * sp, 0.012 + 0.03 * sp, 1);
    this.spine.position.y = CT + BT - 0.002;
    const flat = ss(0.75, 1, open);
    this.pageR.morphTargetInfluences[0] = flat;
    this.pageL.morphTargetInfluences[0] = flat;
    this.pageMatR.emissiveIntensity = ink;
    this.pageMatL.emissiveIntensity = inkL == null ? ink : inkL;
    this.sigilMat.opacity = clamp(sigil);
    this.sigil.visible = sigil > 0.001;
    this.dustU.uSweep.value = dust * 1.25 - 0.1;
    this.dust.visible = dust < 0.999;
    this.sheets.forEach((s, i) => {
      const k = clamp(fan * 1.6 - i * 0.3);
      s.visible = k > 0.001 && k < 0.999;
      s.rotation.z = Math.PI * (1 - Math.pow(1 - k, 2));
    });
  }
}

// --------------------------------------------------------- particle swarms
// Instanced billboards using the glyph atlas. Motion is a closed-form
// function of time so every frame renders independently.
const SWARM_VS = /* glsl */ `
attribute vec3 aOrigin; attribute vec3 aVel; attribute vec4 aT; attribute vec4 aSw;
uniform float uTime; uniform float uAcc; uniform float uTwinkle;
varying vec2 vUv; varying float vA;
void main(){
  float age = uTime - aT.x;
  float life = aT.y;
  if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; vUv = vec2(0.0); return; }
  vec3 sw = vec3(sin(aSw.x * age + aSw.z), sin(aSw.x * 0.7 * age + aSw.z * 1.7) * 0.5, cos(aSw.x * age + aSw.z));
  vec3 p = aOrigin + aVel * age + sw * aSw.y + vec3(0.0, uAcc * age * age, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float rot = aSw.w * age + aSw.z;
  vec2 q = position.xy;
  q = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * q;
  mv.xy += q * aT.z;
  gl_Position = projectionMatrix * mv;
  float g = aT.w;
  vec2 cell = vec2(mod(g, 8.0), floor(g / 8.0));
  vUv = vec2((cell.x + uv.x) / 8.0, 1.0 - (cell.y + 1.0 - uv.y) / 8.0);
  vA = smoothstep(0.0, min(0.35, life * 0.3), age) * (1.0 - smoothstep(life * 0.65, life, age));
  vA *= mix(1.0, 0.55 + 0.45 * sin(age * (2.0 + aSw.x * 3.0) + aSw.z * 5.0), uTwinkle);
}`;
const SWARM_FS = /* glsl */ `
uniform sampler2D uAtlas; uniform vec3 uColor; uniform float uFade;
varying vec2 vUv; varying float vA;
void main(){
  vec4 t = texture2D(uAtlas, vUv);
  gl_FragColor = vec4(uColor * t.rgb, t.a * vA * uFade);
}`;

// spec(i, rnd) -> { o:[x,y,z], v:[x,y,z], t0, life, size, glyph, freq, amp, phase, spin }
export function makeSwarm(count, spec, { color = GOLD, intensity = 4, acc = 0, twinkle = 0, blending = THREE.AdditiveBlending } = {}) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.attributes.position = base.attributes.position;
  g.attributes.uv = base.attributes.uv;
  const O = new Float32Array(count * 3), V = new Float32Array(count * 3), A = new Float32Array(count * 4), S = new Float32Array(count * 4);
  const rnd = mulberry32(count * 7 + 3);
  for (let i = 0; i < count; i++) {
    const s = spec(i, rnd);
    O.set(s.o, i * 3);
    V.set(s.v || [0, 0, 0], i * 3);
    A.set([s.t0 ?? -100, s.life ?? 1000, s.size, s.glyph ?? 63], i * 4);
    S.set([s.freq ?? 0, s.amp ?? 0, s.phase ?? 0, s.spin ?? 0], i * 4);
  }
  g.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(O, 3));
  g.setAttribute('aVel', new THREE.InstancedBufferAttribute(V, 3));
  g.setAttribute('aT', new THREE.InstancedBufferAttribute(A, 4));
  g.setAttribute('aSw', new THREE.InstancedBufferAttribute(S, 4));
  g.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    vertexShader: SWARM_VS,
    fragmentShader: SWARM_FS,
    uniforms: {
      uTime: { value: 0 }, uAcc: { value: acc }, uTwinkle: { value: twinkle },
      uAtlas: { value: T.atlas() }, uColor: { value: color.clone().multiplyScalar(intensity) }, uFade: { value: 1 },
    },
    transparent: true, depthWrite: false, blending,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 10;
  return m;
}

// Floating dust in a box: [x0,x1] [y0,y1] [z0,z1]
export function makeDustMotes(count, box, { size = [0.004, 0.012], color = new THREE.Color(1, 0.86, 0.66), intensity = 1.6, drift = 0.05 } = {}) {
  return makeSwarm(count, (i, r) => ({
    o: [box[0] + r() * (box[1] - box[0]), box[2] + r() * (box[3] - box[2]), box[4] + r() * (box[5] - box[4])],
    v: [(r() - 0.5) * drift, (r() - 0.3) * drift * 0.5, (r() - 0.5) * drift],
    size: size[0] + r() * (size[1] - size[0]),
    freq: 0.2 + r() * 0.6, amp: drift * (0.5 + r()), phase: r() * 6.28, spin: 0,
  }), { color, intensity, twinkle: 0.7 });
}

// ------------------------------------------------------------- line art
export function lineMat(color, width = 2, opacity = 1) {
  const m = new LineMaterial({
    color: color.getHex(), linewidth: width, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, worldUnits: false,
  });
  m.color.copy(color);
  m.resolution.set(W, H);
  return m;
}
export function lines(segs, mat) {
  const g = new LineSegmentsGeometry();
  g.setPositions(segs);
  const l = new LineSegments2(g, mat);
  l.computeLineDistances();
  l.frustumCulled = false;
  return l;
}
// Helpers that push segments into an array
export const seg = {
  circle(out, r, n = 96, f = (x, y) => [x, y, 0]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
      out.push(...f(Math.cos(a) * r, Math.sin(a) * r), ...f(Math.cos(b) * r, Math.sin(b) * r));
    }
  },
  poly(out, pts, close = true, f = (x, y) => [x, y, 0]) {
    const n = pts.length;
    for (let i = 0; i < (close ? n : n - 1); i++) out.push(...f(...pts[i]), ...f(...pts[(i + 1) % n]));
  },
  line(out, a, b) {
    out.push(...a, ...b);
  },
};

// --------------------------------------------------------------- machines
export function gearShape(R, teeth, depth = 0.12, hole = 0.18, spokes = 5) {
  const s = new THREE.Shape();
  const n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = i % 4;
    const r = k === 0 || k === 1 ? R : R * (1 - depth);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  const h = new THREE.Path();
  h.absarc(0, 0, R * hole, 0, Math.PI * 2, true);
  s.holes.push(h);
  if (spokes > 0) {
    for (let i = 0; i < spokes; i++) {
      const a0 = (i / spokes) * Math.PI * 2 + 0.22, a1 = ((i + 1) / spokes) * Math.PI * 2 - 0.22;
      const p = new THREE.Path();
      const r0 = R * (hole + 0.14), r1 = R * (1 - depth - 0.14);
      p.absarc(0, 0, r1, a0, a1, false);
      p.absarc(0, 0, r0, a1, a0, true);
      p.closePath();
      s.holes.push(p);
    }
  }
  return s;
}
export function gearMesh(R, teeth, thick, mat, opts = {}) {
  const g = new THREE.ExtrudeGeometry(gearShape(R, teeth, opts.depth, opts.hole, opts.spokes ?? 5), {
    depth: thick, bevelEnabled: true, bevelThickness: thick * 0.15, bevelSize: R * 0.01, bevelSegments: 1, curveSegments: 24,
  });
  g.translate(0, 0, -thick / 2);
  return new THREE.Mesh(g, mat);
}

export function brass(rough = 0.32) {
  return new THREE.MeshStandardMaterial({ color: 0xc9953f, metalness: 1, roughness: rough });
}
export function goldMat(rough = 0.28) {
  return new THREE.MeshStandardMaterial({ color: 0xe0b050, metalness: 1, roughness: rough });
}

// Volumetric-looking light beam: crossed additive planes with a soft profile.
export function beam(length, width, color, intensity = 1) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    map: T.beam(), color: color.clone().multiplyScalar(intensity), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(width, length), mat);
    p.position.y = -length / 2;
    p.rotation.y = (i / 3) * Math.PI;
    g.add(p);
  }
  g.userData.mat = mat;
  return g;
}

// A soft glow sprite (camera facing) for lamps, beacons, stars.
export function glow(color, size, intensity = 2) {
  const m = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.dot(), color: color.clone().multiplyScalar(intensity), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  m.scale.set(size, size, 1);
  return m;
}

export function roomEnv(renderer) {
  return asset('roomEnv', () => {
    const pm = new THREE.PMREMGenerator(renderer);
    const t = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    return t;
  });
}
// Apply an environment map with a given strength to every standard material.
export function applyEnv(scene, env, intensity) {
  scene.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.isMeshStandardMaterial) {
        m.envMap = env;
        m.envMapIntensity = intensity;
        m.needsUpdate = true;
      }
    }
  });
}
