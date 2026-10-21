// Shots 5-6 (0:16-0:24) and 7a (0:26-0:28): Alexandria that never was.
// A procedural coastal city at sunset, then night, seen from the sea and the
// air. The Great Library of the future sits at its heart.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { T, GOLD, TURQ, glow, lineMat, lines, makeSwarm, setRepeat } from '../lib.js';
import { ss, eio, ktrack, lerp, clamp, mulberry32, makeCanvas, tex, pulse } from '../util.js';

const LAND_Y = 3;
const LIB = new THREE.Vector3(0, LAND_Y, -300);
const ARCH_Z = 420;

// Box with UVs scaled to world size so facade textures keep their scale.
function box(w, h, d, tile = 16, off = [0, 0]) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * spans[f][0] / tile + off[0], uv.getY(i) * spans[f][1] / tile + off[1]);
  }
  return g;
}
function cyl(rt, rb, h, seg, tile = 16, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  const uv = g.attributes.uv;
  const circ = Math.PI * 2 * Math.max(rt, rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / tile, uv.getY(i) * h / tile);
  return g;
}
function at(g, x, y, z, ry = 0) {
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g.index ? g.toNonIndexed() : g;
}
function clean(g) {
  // Keep only the attributes every merged geometry shares
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  g.morphAttributes = {};
  return g.index ? g.toNonIndexed() : g;
}

function palmLeafTexture() {
  const [c, ctx] = makeCanvas(256, 512);
  ctx.translate(128, 0);
  ctx.strokeStyle = '#3d5a22';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 512);
  ctx.stroke();
  ctx.lineWidth = 7;
  for (let y = 20; y < 500; y += 14) {
    const l = Math.sin((y / 512) * Math.PI) * 115;
    ctx.strokeStyle = `rgb(${50 + (y % 3) * 6},${78 + (y % 5) * 5},${30})`;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(s * l * 0.5, y + 10, s * l, y + 34);
      ctx.stroke();
    }
  }
  return tex(c);
}

export function createCity(renderer) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1080 / 1920, 1, 16000);
  scene.fog = new THREE.FogExp2(0xe0a684, 0.00038);
  const rnd = mulberry32(2024);

  // ------------------------------------------------------------ sky & sea
  const sky = new Sky();
  sky.scale.setScalar(12000);
  scene.add(sky);
  const su = sky.material.uniforms;
  su.turbidity.value = 9;
  su.rayleigh.value = 2.8;
  su.mieCoefficient.value = 0.006;
  su.mieDirectionalG.value = 0.86;
  const skyGain = { value: 0.55 };
  const gradMix = { value: 0.7 };
  // Blend the physical sky with a painted sunset gradient.
  const paintSky = (mat) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.skyGain = skyGain;
      sh.uniforms.gradMix = gradMix;
      sh.fragmentShader = 'uniform float skyGain; uniform float gradMix;\n' + sh.fragmentShader.replace('#include <tonemapping_fragment>', `
        vec3 dir = normalize(vWorldPosition - cameraPosition);
        float el = max(dir.y, 0.0);
        vec3 sd = normalize(vSunDirection);
        float sa = max(dot(dir, sd), 0.0);
        vec3 hor = mix(vec3(1.0, 0.42, 0.18), vec3(1.0, 0.72, 0.4), pow(sa, 3.0));
        vec3 mid = vec3(0.62, 0.36, 0.46);
        vec3 top = vec3(0.07, 0.13, 0.34);
        vec3 grad = mix(hor, mid, smoothstep(0.0, 0.14, el));
        grad = mix(grad, top, smoothstep(0.1, 0.6, el));
        grad *= 0.8 + 2.2 * pow(sa, 10.0);
        grad += vec3(1.0, 0.75, 0.45) * pow(sa, 900.0) * 40.0;
        float day = clamp(sd.y * 7.0 + 0.55, 0.0, 1.0);
        vec3 nightCol = mix(vec3(0.03, 0.05, 0.12), vec3(0.006, 0.012, 0.04), smoothstep(0.0, 0.45, el));
        nightCol += vec3(0.25, 0.12, 0.08) * pow(sa, 3.0) * clamp(sd.y * 6.0 + 1.0, 0.0, 1.0) * (1.0 - smoothstep(0.0, 0.2, el));
        grad = mix(nightCol, grad * 1.6, day);
        gl_FragColor.rgb = mix(gl_FragColor.rgb * skyGain, grad, gradMix);
        #include <tonemapping_fragment>`);
    };
  };
  paintSky(sky.material);

  const water = new Water(new THREE.PlaneGeometry(20000, 20000), {
    textureWidth: 768, textureHeight: 1024,
    waterNormals: (() => { const t = T.water(); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })(),
    sunDirection: new THREE.Vector3(), sunColor: 0xffd0a0, waterColor: 0x0b3442, distortionScale: 2.2, fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.material.uniforms.size.value = 3.0;
  scene.add(water);

  // Stars for the night
  const stars = makeSwarm(1400, (i, r) => {
    const th = r() * Math.PI * 2, ph = Math.asin(0.05 + r() * 0.95);
    const R = 7000;
    return { o: [R * Math.cos(ph) * Math.cos(th), R * Math.sin(ph), R * Math.cos(ph) * Math.sin(th)], size: 6 + Math.pow(r(), 6) * 30, glyph: 63, freq: r() * 2, phase: r() * 6 };
  }, { color: new THREE.Color(0.85, 0.9, 1), intensity: 2.2, twinkle: 0.5 });
  stars.material.fog = false;
  scene.add(stars);
  const moon = glow(new THREE.Color(0.85, 0.9, 1.0), 260, 0);
  moon.position.set(-2400, 2300, -5200);
  moon.material.fog = false;
  scene.add(moon);

  // ------------------------------------------------------------ materials
  const fs = [T.facade('stone', 1), T.facade('stone', 2)];
  const fg = [T.facade('glass', 3), T.facade('glass', 4)];
  const ft = T.facade('tower', 5);
  const facadeMat = (f, rough = 1, metal = 1, warm = new THREE.Color(1, 0.72, 0.42)) => new THREE.MeshStandardMaterial({
    map: f.map, emissiveMap: f.emissiveMap, emissive: warm, emissiveIntensity: 0,
    roughnessMap: f.mr, metalnessMap: f.mr, roughness: rough, metalness: metal,
  });
  const M = {
    stone: [facadeMat(fs[0], 1, 1), facadeMat(fs[1], 1, 1)],
    glass: [facadeMat(fg[0], 1, 1, new THREE.Color(0.85, 0.95, 1)), facadeMat(fg[1], 1, 1, new THREE.Color(1, 0.8, 0.55))],
    tower: facadeMat(ft, 1, 1),
    sand: new THREE.MeshStandardMaterial({ map: T.sandstone(), roughness: 0.85 }),
    marble: new THREE.MeshStandardMaterial({ color: 0xf2e8d8, roughness: 0.45, map: setRepeat(T.marble(), 1, 2) }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe8b860, metalness: 1, roughness: 0.22, emissive: new THREE.Color(1, 0.7, 0.35), emissiveIntensity: 0 }),
    roof: new THREE.MeshStandardMaterial({ map: T.paving(), roughness: 0.9, color: 0xb8a088 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe0d8ca, roughness: 0.6 }),
    dome: new THREE.MeshStandardMaterial({ color: 0x5e9aa6, metalness: 1.0, roughness: 0.06, emissive: new THREE.Color(1, 0.66, 0.32), emissiveIntensity: 0 }),
    cypress: new THREE.MeshStandardMaterial({ color: 0x24361e, roughness: 0.95 }),
    tree: new THREE.MeshStandardMaterial({ color: 0x3a5226, roughness: 0.95 }),
    pool: new THREE.MeshStandardMaterial({ color: 0x0e3a48, metalness: 0.9, roughness: 0.05 }),
    lawn: new THREE.MeshStandardMaterial({ color: 0x4a6a30, roughness: 1 }),
  };
  M.stone.forEach((m) => (m.color = new THREE.Color(1, 0.97, 0.94)));

  const buckets = new Map();
  const put = (mat, g) => {
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat).push(clean(g));
  };
  const columns = [];
  const column = (x, y, z, h, r = 1) => columns.push([x, y, z, h, r]);
  const crowns = []; // world points for the night constellation and tower lights
  const trees = []; // [x, z, kind(1 cypress, 0 round), scale]
  const towerTops = [];

  // ------------------------------------------------------------ ground
  const land = new THREE.Mesh(new THREE.PlaneGeometry(9000, 6000), new THREE.MeshStandardMaterial({ map: setRepeat(T.paving(), 9000 / 16, 6000 / 16), roughness: 0.92, color: 0xc4ab8a }));
  land.rotation.x = -Math.PI / 2;
  land.position.set(0, LAND_Y, -3000);
  land.receiveShadow = true;
  scene.add(land);
  put(M.sand, at(box(9000, LAND_Y + 2, 14), 0, (LAND_Y - 2) / 2, -7));
  // Promenade edge with gilded rail line
  put(M.gold, at(box(9000, 0.5, 0.5), 0, LAND_Y + 0.9, -0.5));

  // ------------------------------------------------------------ the library
  {
    const L = LIB;
    // Stepped podium
    for (let s = 0; s < 6; s++) put(M.sand, at(box(170 - s * 6, 2, 170 - s * 6), L.x, L.y + 1 + s * 2, L.z));
    const top = L.y + 12;
    put(M.stone[0], at(cyl(46, 46, 32, 64, 16), L.x, top + 16, L.z));
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      column(L.x + Math.cos(a) * 52, top, L.z + Math.sin(a) * 52, 30, 1.5);
    }
    put(M.marble, at(cyl(55, 55, 4, 64, 8), L.x, top + 32, L.z));
    put(M.gold, at(cyl(55.4, 55.4, 1.0, 64, 8), L.x, top + 30.4, L.z));
    put(M.marble, at(cyl(57, 57, 1.6, 64, 8), L.x, top + 34.8, L.z));
    const domeBase = top + 35.6;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(47, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2), M.dome);
    dome.position.set(L.x, domeBase, L.z);
    dome.castShadow = true;
    scene.add(dome);
    for (let k = 0; k < 12; k++) {
      const rib = new THREE.TorusGeometry(47.3, 0.55, 6, 96, Math.PI);
      rib.rotateY((k / 12) * Math.PI);
      put(M.gold, at(rib, L.x, domeBase, L.z));
    }
    for (const r of [0.38, 0.72]) {
      const ring = new THREE.TorusGeometry(47.3 * Math.cos(Math.asin(r)), 0.5, 6, 96);
      ring.rotateX(Math.PI / 2);
      put(M.gold, at(ring, L.x, domeBase + 47.3 * r, L.z));
    }
    // Lantern and finial
    put(M.marble, at(cyl(7, 7, 8, 24, 8), L.x, domeBase + 50, L.z));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      column(L.x + Math.cos(a) * 7.5, domeBase + 46, L.z + Math.sin(a) * 7.5, 8, 0.6);
    }
    put(M.gold, at(new THREE.ConeGeometry(8.5, 9, 24), L.x, domeBase + 58.5, L.z));
    put(M.gold, at(new THREE.SphereGeometry(2, 16, 12), L.x, domeBase + 64.5, L.z));
    crowns.push(new THREE.Vector3(L.x, domeBase + 66, L.z));
    // Portico facing the sea
    const pz = L.z + 66;
    for (let i = 0; i < 10; i++) column(L.x - 40 + i * (80 / 9), top, pz, 26, 1.7);
    for (let i = 0; i < 10; i++) column(L.x - 40 + i * (80 / 9), top, pz - 9, 26, 1.7);
    put(M.marble, at(box(88, 4, 16), L.x, top + 28, pz - 4.5));
    put(M.gold, at(box(88.4, 1, 16.4), L.x, top + 26.6, pz - 4.5));
    const ped = new THREE.Shape();
    ped.moveTo(-45, 0);
    ped.lineTo(45, 0);
    ped.lineTo(0, 14);
    ped.closePath();
    const pg = new THREE.ExtrudeGeometry(ped, { depth: 16, bevelEnabled: false });
    put(M.marble, at(pg, L.x, top + 30, pz - 12.5));
    put(M.stone[1], at(box(84, 26, 30, 16), L.x, top + 13, pz - 26));
    // Grand stairs and plaza
    for (let s = 0; s < 12; s++) put(M.sand, at(box(70, 1, 3), L.x, LAND_Y + 0.5 + s, pz + 40 - s * 3));
    put(M.roof, at(box(160, 0.4, 240), L.x, LAND_Y + 0.2, L.z + 220));
    // Gardens, pools and cypress avenues on the plaza
    for (const sx of [-1, 1]) {
      put(M.lawn, at(box(40, 0.6, 180), L.x + sx * 58, LAND_Y + 0.4, L.z + 230));
      put(M.pool, at(cyl(14, 14, 0.8, 40), L.x + sx * 22, LAND_Y + 0.5, L.z + 150));
      put(M.marble, at(cyl(15, 15, 0.6, 40), L.x + sx * 22, LAND_Y + 0.3, L.z + 150));
      for (let k = 0; k < 16; k++) for (const dx of [-16, 16]) trees.push([L.x + sx * 58 + dx, L.z + 145 + k * 11, 1, 1]);
    }
    for (let k = 0; k < 10; k++) for (const sx of [-1, 1]) trees.push([L.x + sx * 30, L.z + 200 + k * 9, 1, 0.8]);
    // Obelisks flanking the plaza
    for (const sx of [-1, 1]) {
      put(M.sand, at(new THREE.CylinderGeometry(1.5, 3.2, 44, 4), L.x + sx * 46, LAND_Y + 22, L.z + 190, Math.PI / 4));
      put(M.gold, at(new THREE.ConeGeometry(2.1, 4, 4), L.x + sx * 46, LAND_Y + 46, L.z + 190, Math.PI / 4));
    }
    // Wings
    for (const sx of [-1, 1]) {
      put(M.stone[1], at(box(90, 22, 70, 16, [0.3 * sx, 0]), L.x + sx * 125, LAND_Y + 11, L.z + 20));
      for (let i = 0; i < 12; i++) column(L.x + sx * 125 - 42 + i * (84 / 11), LAND_Y, L.z + 57, 20, 1.1);
      put(M.marble, at(box(90, 3, 6), L.x + sx * 125, LAND_Y + 21.5, L.z + 57));
      put(M.roof, at(box(90, 1, 70), L.x + sx * 125, LAND_Y + 22.5, L.z + 20));
    }
  }

  // ------------------------------------------------------------ city blocks
  const classical = (x, z, w, d, h, s) => {
    put(M.stone[s], at(box(w, h, d, 16, [rnd(), rnd()]), x, LAND_Y + h / 2, z));
    put(M.roof, at(box(w + 1, 1, d + 1), x, LAND_Y + h + 0.5, z));
    if (rnd() < 0.55) {
      const n = Math.max(4, Math.floor(w / 6));
      for (let i = 0; i < n; i++) column(x - w / 2 + 2 + i * ((w - 4) / (n - 1)), LAND_Y, z + d / 2 + 3, h * 0.82, 0.8);
      put(M.marble, at(box(w, 2, 7), x, LAND_Y + h * 0.82 + 1, z + d / 2 + 2.5));
      if (rnd() < 0.5) {
        const p = new THREE.Shape();
        p.moveTo(-w / 2, 0);
        p.lineTo(w / 2, 0);
        p.lineTo(0, w * 0.16);
        p.closePath();
        put(M.marble, at(new THREE.ExtrudeGeometry(p, { depth: 7, bevelEnabled: false }), x, LAND_Y + h * 0.82 + 2, z + d / 2 - 1));
      }
    }
    if (rnd() < 0.18) {
      put(M.white, at(new THREE.SphereGeometry(Math.min(w, d) * 0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), x, LAND_Y + h + 1, z));
      put(M.gold, at(new THREE.ConeGeometry(0.8, 4, 8), x, LAND_Y + h + 1 + Math.min(w, d) * 0.3 + 1.5, z));
    }
  };
  const research = (x, z, w, d, h, s) => {
    if (rnd() < 0.5) {
      put(M.glass[s], at(box(w, h, d, 16, [rnd(), rnd()]), x, LAND_Y + h / 2, z));
      put(M.sand, at(box(w + 4, 4, d + 4), x, LAND_Y + 2, z));
      put(M.white, at(box(w + 2, 1.5, d + 2), x, LAND_Y + h + 0.75, z));
    } else {
      const r = Math.min(w, d) / 2;
      put(M.glass[s], at(cyl(r, r, h, 32, 16), x, LAND_Y + h / 2, z));
      put(M.white, at(cyl(r + 1.5, r + 1.5, 1.5, 32), x, LAND_Y + h + 0.75, z));
      for (let k = 1; k < 4; k++) put(M.sand, at(cyl(r + 0.6, r + 0.6, 0.8, 32), x, LAND_Y + (h * k) / 4, z));
      if (rnd() < 0.5) put(M.white, at(new THREE.SphereGeometry(r * 0.7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), x, LAND_Y + h + 1.5, z));
    }
  };
  const tower = (x, z, h) => {
    const r = 11 + rnd() * 8;
    put(M.sand, at(cyl(r * 1.6, r * 1.8, 10, 24, 16), x, LAND_Y + 5, z));
    put(M.tower, at(cyl(r * 0.78, r, h, 16, 16), x, LAND_Y + 10 + h / 2, z));
    for (let k = 1; k < 5; k++) put(M.gold, at(cyl(r * (1 - 0.22 * k / 5) + 0.4, r * (1 - 0.22 * k / 5) + 0.4, 0.8, 24), x, LAND_Y + 10 + (h * k) / 5, z));
    const ty = LAND_Y + 10 + h;
    put(M.white, at(cyl(r * 0.5, r * 0.8, 6, 16), x, ty + 3, z));
    put(M.gold, at(new THREE.ConeGeometry(r * 0.5, h * 0.12, 16), x, ty + 6 + h * 0.06, z));
    towerTops.push(new THREE.Vector3(x, ty + 6 + h * 0.12, z));
  };

  const occupied = (x, z) => (Math.abs(x - LIB.x) < 190 && z > LIB.z - 110 && z < LIB.z + 270);
  // Waterfront row
  for (let x = -1500; x <= 1500; x += 34 + rnd() * 10) {
    if (occupied(x, -40)) continue;
    const w = 22 + rnd() * 10, d = 18 + rnd() * 10, h = 12 + rnd() * 14;
    classical(x, -32 - d / 2, w, d, h, rnd() < 0.5 ? 0 : 1);
  }
  // Grid blocks inland
  for (let z = -95; z > -2200; z -= 52 + rnd() * 14) {
    for (let x = -1700; x <= 1700; x += 50 + rnd() * 16) {
      if (occupied(x, z)) continue;
      const far = clamp((-z - 200) / 1600);
      const dens = 0.92 - far * 0.25;
      if (rnd() > dens) continue;
      const p = rnd();
      const jx = x + (rnd() - 0.5) * 8, jz = z + (rnd() - 0.5) * 8;
      if (p < 0.045 && -z > 160) tower(jx, jz, 70 + rnd() * 130 * (1 - far * 0.4));
      else if (p < 0.42) research(jx, jz, 24 + rnd() * 18, 24 + rnd() * 16, 20 + rnd() * 40 * (1 - far * 0.5), rnd() < 0.5 ? 0 : 1);
      else classical(jx, jz, 26 + rnd() * 14, 24 + rnd() * 14, 12 + rnd() * 18, rnd() < 0.5 ? 0 : 1);
    }
  }
  // Street trees
  for (let i = 0; i < 1600; i++) {
    const x = (rnd() - 0.5) * 3000, z = -60 - rnd() * 1500;
    if (occupied(x, z)) continue;
    trees.push([x, z, rnd() < 0.55 ? 1 : 0, 0.7 + rnd() * 0.6]);
  }
  // Landmark towers flanking the library axis
  for (const sx of [-1, 1]) {
    tower(LIB.x + sx * 260, LIB.z - 60, 230);
    tower(LIB.x + sx * 420, LIB.z + 120, 180);
  }

  // ------------------------------------------------------------ harbour
  // Breakwater with the monumental sea gate
  for (const sx of [-1, 1]) put(M.sand, at(box(1300, 7, 14), sx * (36 + 650), 3.5 - 1, ARCH_Z));
  {
    const s = new THREE.Shape();
    s.moveTo(-58, 0);
    s.lineTo(58, 0);
    s.lineTo(58, 80);
    s.lineTo(-58, 80);
    s.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-26, 0);
    hole.lineTo(-26, 34);
    hole.absarc(0, 34, 26, Math.PI, 0, true);
    hole.lineTo(26, 0);
    hole.closePath();
    s.holes.push(hole);
    const ag = new THREE.ExtrudeGeometry(s, { depth: 16, bevelEnabled: false, curveSegments: 32 });
    ag.translate(0, 0, -8);
    const uv = ag.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 16, uv.getY(i) / 16);
    put(M.sand, at(ag, 0, 0, ARCH_Z));
    put(M.gold, at(box(118, 2, 17), 0, 70, ARCH_Z));
    put(M.marble, at(box(122, 5, 19), 0, 82.5, ARCH_Z));
    for (const sx of [-1, 1]) {
      for (const dz of [-9.5, 9.5]) column(sx * 42, 0, ARCH_Z + dz, 66, 2.2);
      put(M.gold, at(new THREE.CylinderGeometry(3, 4, 6, 16), sx * 42, 88, ARCH_Z));
    }
    crowns.push(new THREE.Vector3(-42, 94, ARCH_Z), new THREE.Vector3(42, 94, ARCH_Z));
  }
  // Pharos on its island
  const PH = new THREE.Vector3(-760, 0, 230);
  {
    const isl = cyl(90, 110, 8, 40, 16);
    put(M.sand, at(isl, PH.x, 0, PH.z));
    put(M.stone[0], at(box(44, 80, 44, 16), PH.x, 4 + 40, PH.z));
    put(M.marble, at(box(48, 3, 48), PH.x, 4 + 81.5, PH.z));
    put(M.stone[1], at(cyl(16, 16, 50, 8, 16), PH.x, 83 + 25, PH.z));
    put(M.marble, at(cyl(19, 19, 3, 8), PH.x, 134.5, PH.z));
    put(M.sand, at(cyl(10, 10, 26, 24, 16), PH.x, 136 + 13, PH.z));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      column(PH.x + Math.cos(a) * 9, 162, PH.z + Math.sin(a) * 9, 12, 0.6);
    }
    put(M.gold, at(new THREE.ConeGeometry(11, 10, 16), PH.x, 179, PH.z));
    crowns.push(new THREE.Vector3(PH.x, 168, PH.z));
  }

  // ------------------------------------------------------------ build meshes
  for (const [mat, list] of buckets) {
    const g = mergeGeometries(list, false);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
  {
    const cg = new THREE.CylinderGeometry(1, 1.12, 1, 14);
    cg.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(cg, M.marble, columns.length);
    const m4 = new THREE.Matrix4();
    columns.forEach(([x, y, z, h, r], i) => {
      m4.makeScale(r, h, r).setPosition(x, y, z);
      im.setMatrixAt(i, m4);
    });
    im.castShadow = im.receiveShadow = true;
    scene.add(im);
  }

  // Trees (cypress cones and round crowns)
  {
    const cyp = trees.filter((t) => t[2] === 1), rnd2 = trees.filter((t) => t[2] === 0);
    const cg = new THREE.ConeGeometry(2.2, 16, 8).translate(0, 8, 0);
    const rg = new THREE.IcosahedronGeometry(4.5, 1).translate(0, 7, 0);
    for (const [geo, list, mat] of [[cg, cyp, M.cypress], [rg, rnd2, M.tree]]) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const m4 = new THREE.Matrix4();
      list.forEach(([x, z, , sc], i) => {
        m4.makeScale(sc, sc * (0.85 + ((i * 13) % 7) / 20), sc).setPosition(x, LAND_Y, z);
        im.setMatrixAt(i, m4);
      });
      im.castShadow = im.receiveShadow = true;
      scene.add(im);
    }
  }

  // Palms along the corniche
  {
    const leafMat = new THREE.MeshStandardMaterial({ map: palmLeafTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a6248, roughness: 0.9 });
    const crown = [];
    for (let k = 0; k < 9; k++) {
      const p = new THREE.PlaneGeometry(2.4, 7, 1, 6);
      const pos = p.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) + 3.5;
        pos.setXYZ(i, pos.getX(i), -y * y * 0.07, -y);
      }
      p.rotateX(-0.25);
      p.rotateY((k / 9) * Math.PI * 2);
      crown.push(clean(p));
    }
    const cg = mergeGeometries(crown);
    cg.computeVertexNormals();
    const xs = [];
    for (let x = -1500; x <= 1500; x += 22) if (!(Math.abs(x) < 60)) xs.push(x);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.55, 1, 8).translate(0, 0.5, 0), trunkMat, xs.length);
    const crowns2 = new THREE.InstancedMesh(cg, leafMat, xs.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    xs.forEach((x, i) => {
      const h = 12 + ((i * 7) % 5);
      m4.makeScale(1, h, 1).setPosition(x, LAND_Y, -14);
      trunks.setMatrixAt(i, m4);
      q.setFromEuler(new THREE.Euler(0, i * 1.3, 0));
      m4.compose(new THREE.Vector3(x, LAND_Y + h, -14), q, new THREE.Vector3(1.4, 1.4, 1.4));
      crowns2.setMatrixAt(i, m4);
    });
    trunks.castShadow = crowns2.castShadow = true;
    scene.add(trunks, crowns2);
  }

  // Feluccas on the water
  const boats = [];
  {
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.7 });
    const sailMat = new THREE.MeshStandardMaterial({ color: 0xf2e8d6, roughness: 0.8, side: THREE.DoubleSide });
    const spots = [[-220, 300], [160, 250], [330, 520], [-420, 600], [520, 330], [-120, 760], [60, 620]];
    for (const [x, z] of spots) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.2, 14, 10, 1, false, 0, Math.PI), hullMat);
      hull.rotation.set(Math.PI / 2, 0, Math.PI);
      hull.position.y = 1.2;
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.lineTo(9, 3);
      s.lineTo(-6, 22);
      s.closePath();
      const sail = new THREE.Mesh(new THREE.ShapeGeometry(s), sailMat);
      sail.position.set(-1, 2, 0);
      sail.rotation.y = Math.PI / 2;
      const lamp = glow(new THREE.Color(1, 0.7, 0.4), 6, 0);
      lamp.position.set(0, 4, 4);
      g.add(hull, sail, lamp);
      g.position.set(x, 0, z);
      g.rotation.y = rnd() * Math.PI;
      g.traverse((o) => o.isMesh && (o.castShadow = true));
      scene.add(g);
      boats.push({ g, lamp, x, z, ph: rnd() * 6 });
    }
  }

  // ------------------------------------------------------------ lights
  const sun = new THREE.DirectionalLight(0xffc690, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -900, right: 900, top: 900, bottom: -900, near: 10, far: 4000 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x9fb4d8, 0x6a4a30, 0.6);
  scene.add(hemi);

  // Night lights: street lamps, tower beacons, the lighthouse fire
  const lampPts = [];
  for (let x = -1500; x <= 1500; x += 22) lampPts.push([x + 11, LAND_Y + 7, -3]);
  for (let k = 0; k < 120; k++) lampPts.push([LIB.x + (k % 2 ? -1 : 1) * 36, LAND_Y + 6, LIB.z + 100 + Math.floor(k / 2) * 3.4]);
  const lamps = makeSwarm(lampPts.length, (i) => ({ o: lampPts[i], size: 4, glyph: 63, freq: 0.5, phase: i }), { color: new THREE.Color(1, 0.72, 0.42), intensity: 2.2, twinkle: 0.1 });
  scene.add(lamps);
  const beacons = makeSwarm(towerTops.length + crowns.length, (i) => {
    const p = i < towerTops.length ? towerTops[i] : crowns[i - towerTops.length];
    return { o: [p.x, p.y + 2, p.z], size: i < towerTops.length ? 14 : 22, glyph: 63, freq: 2.5, phase: i * 1.7 };
  }, { color: new THREE.Color(1, 0.55, 0.3), intensity: 3, twinkle: 0.6 });
  scene.add(beacons);
  const pharosFire = glow(new THREE.Color(1, 0.7, 0.4), 70, 0);
  pharosFire.position.set(PH.x, 168, PH.z);
  scene.add(pharosFire);
  const domeGlow = glow(new THREE.Color(1, 0.75, 0.45), 260, 0);
  domeGlow.position.set(LIB.x, LIB.y + 70, LIB.z);
  scene.add(domeGlow);

  // ------------------------------------------------------------ constellation
  const cand = towerTops.filter((p) => Math.abs(p.x - LIB.x) < 380 && p.z < LIB.z + 150 && p.z > LIB.z - 900).sort((a, b) => b.y - a.y).slice(0, 13);
  const pts = [crowns[0], ...cand, crowns[crowns.length - 1]];
  // Order around the library by angle so the figure reads as a constellation
  const lib2 = new THREE.Vector2(LIB.x, LIB.z);
  pts.sort((a, b) => Math.atan2(a.z - lib2.y, a.x - lib2.x) - Math.atan2(b.z - lib2.y, b.x - lib2.x));
  const conSegs = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    conSegs.push([a, b]);
  }
  const conMat = lineMat(GOLD.clone().multiplyScalar(1.8), 1.8, 0);
  conMat.depthTest = false;
  const conGeoPos = new Float32Array(conSegs.length * 6);
  const conLines = lines(Array.from(conGeoPos), conMat);
  conLines.renderOrder = 30;
  scene.add(conLines);
  const conStars = makeSwarm(pts.length, (i) => ({ o: [pts[i].x, pts[i].y + 4, pts[i].z], size: 40, glyph: 63, freq: 1.5, phase: i }), { color: new THREE.Color(1, 0.85, 0.6), intensity: 0, twinkle: 0.3 });
  conStars.material.depthTest = false;
  conStars.renderOrder = 31;
  scene.add(conStars);

  // ------------------------------------------------------------ environment
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(1000);
  paintSky(envSky.material);
  envScene.add(envSky);
  const sunVec = new THREE.Vector3();
  const setSun = (u, elevDeg, azDeg) => {
    const phi = THREE.MathUtils.degToRad(90 - elevDeg), theta = THREE.MathUtils.degToRad(azDeg);
    sunVec.setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(sunVec);
  };
  const SUN_AZ = -72;
  const envFor = (elev) => {
    envSky.material.uniforms.turbidity.value = 9;
    envSky.material.uniforms.rayleigh.value = 2.8;
    envSky.material.uniforms.mieCoefficient.value = 0.006;
    envSky.material.uniforms.mieDirectionalG.value = 0.86;
    setSun(envSky.material.uniforms, elev, SUN_AZ);
    return pm.fromScene(envScene, 0).texture;
  };
  const envDay = envFor(3);
  const envDusk = envFor(-1);
  const envNight = envFor(-8);
  pm.dispose();
  scene.environment = envDay;

  // ------------------------------------------------------------ cameras
  const dayPos = ktrack([
    [16.0, [10, 15, 590]],
    [17.75, [0, 17, ARCH_Z - 2]],
    [19.4, [-35, 55, 215]],
    [21.0, [-70, 135, 90]],
    [22.7, [-70, 260, 150]],
    [24.45, [-30, 520, 300]],
  ]);
  const dayTgt = ktrack([
    [16.0, [0, 45, -300]],
    [17.75, [0, 55, -300]],
    [19.4, [0, 55, -300]],
    [21.0, [0, 40, -320]],
    [22.7, [0, 10, -420]],
    [24.45, [0, 0, -620]],
  ]);
  const nightPos = ktrack([
    [26.05, [40, 22, 330]],
    [28.05, [12, 30, 150]],
  ]);
  const nightTgt = ktrack([
    [26.05, [0, 50, -300]],
    [28.05, [0, 55, -300]],
  ]);

  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  const stoneEm = [...M.stone, ...M.glass, M.tower];

  function update(t, mode) {
    const night = mode === 'night';
    const p = night ? nightPos(t) : dayPos(t);
    const q = night ? nightTgt(t) : dayTgt(t);
    camera.position.set(...p);
    camera.up.set(0, 1, 0);
    camera.lookAt(...q);
    camera.updateMatrixWorld();

    // Sun goes down, lights come up
    const n = night ? 1 : ss(20.6, 23.2, t);
    const elev = night ? -9 : lerp(3.2, -8, ss(19.5, 23.2, t));
    setSun(su, elev, SUN_AZ);
    sun.position.copy(sunVec).multiplyScalar(2500).add(LIB);
    sun.target.position.copy(LIB);
    const dayK = ss(-3, 4, elev);
    sun.intensity = 3.4 * dayK;
    sun.color.setRGB(1, lerp(0.55, 0.78, ss(0, 7, elev)), lerp(0.3, 0.56, ss(0, 7, elev)));
    hemi.intensity = lerp(0.05, 0.65, dayK);
    hemi.color.setRGB(lerp(0.25, 0.62, dayK), lerp(0.32, 0.7, dayK), lerp(0.55, 0.85, dayK));
    su.rayleigh.value = lerp(1.2, 2.8, dayK);
    skyGain.value = lerp(1.0, 0.5, dayK);
    scene.environment = elev > 2 ? envDay : elev > -4 ? envDusk : envNight;
    scene.fog.color.setRGB(lerp(0.06, 0.88, dayK), lerp(0.08, 0.62, dayK), lerp(0.16, 0.5, dayK));
    scene.fog.density = lerp(0.00026, 0.00034, dayK);

    water.material.uniforms.time.value = t * 0.5;
    water.material.uniforms.sunDirection.value.copy(sunVec).normalize();
    water.material.uniforms.sunColor.value.setRGB(1, 0.75, 0.5).multiplyScalar(dayK);
    water.material.uniforms.waterColor.value.setRGB(lerp(0.01, 0.04, dayK), lerp(0.03, 0.2, dayK), lerp(0.06, 0.26, dayK));

    const lightsOn = ss(0.15, 0.9, n);
    stoneEm.forEach((m) => (m.emissiveIntensity = lightsOn * 2.2));
    M.dome.emissiveIntensity = lightsOn * 0.22;
    M.dome.envMapIntensity = lerp(0.6, 1.0, dayK);
    M.gold.emissiveIntensity = lightsOn * 0.25;
    lamps.material.uniforms.uFade.value = lightsOn;
    lamps.material.uniforms.uTime.value = t;
    beacons.material.uniforms.uFade.value = lightsOn;
    beacons.material.uniforms.uTime.value = t;
    pharosFire.material.color.setRGB(1, 0.7, 0.4).multiplyScalar(lightsOn * 3 * (1 + 0.1 * Math.sin(t * 9)));
    domeGlow.material.color.setRGB(1, 0.7, 0.4).multiplyScalar(lightsOn * 0.22);
    stars.material.uniforms.uFade.value = ss(0.4, 1, n);
    stars.material.uniforms.uTime.value = t;
    moon.material.color.setRGB(0.85, 0.9, 1).multiplyScalar(ss(0.5, 1, n) * 1.4);
    boats.forEach((b) => {
      b.g.position.set(b.x, Math.sin(t * 1.3 + b.ph) * 0.3, b.z - t * 2);
      b.g.rotation.z = Math.sin(t * 1.1 + b.ph) * 0.04;
      b.lamp.material.color.setRGB(1, 0.7, 0.4).multiplyScalar(lightsOn * 2);
    });

    // Constellation drawn over the night city from the air
    const draw = night ? 0 : ss(22.5, 24.0, t);
    const fade = night ? 0 : (1 - ss(24.1, 24.4, t));
    const pos = [];
    const total = conSegs.length;
    conSegs.forEach(([a, b], i) => {
      const k = clamp(draw * total - i);
      tmpA.copy(a);
      tmpB.copy(a).lerp(b, k);
      pos.push(tmpA.x, tmpA.y, tmpA.z, tmpB.x, tmpB.y, tmpB.z);
    });
    conLines.geometry.setPositions(pos);
    conMat.opacity = ss(0, 0.05, draw) * fade;
    conStars.material.uniforms.uColor.value.setRGB(1, 0.85, 0.6).multiplyScalar(2.2 * ss(0, 0.3, draw) * fade);
    conStars.material.uniforms.uTime.value = t;
  }

  return {
    scene, camera, update,
    grade: { exposure: (t) => (t > 25 ? 1.05 : lerp(0.95, 1.1, ss(21, 23, t))), bloom: (t) => (t > 25 ? 0.7 : lerp(0.35, 0.7, ss(20.6, 23, t))), vignette: 0.5, warm: 0.4 },
  };
}
