// Shot 2 (0:03-0:07): the library awakens. A flight down the nave of the
// Great Library, sun shafts through the clerestory, holograms over scrolls.
import * as THREE from 'three';
import { T, GOLD, TURQ, makeSwarm, makeDustMotes, beam, glow, lineMat, lines, seg, gearShape, setRepeat } from '../lib.js';
import { ss, eio, ktrack, rigCamera, lerp, clamp, mulberry32 } from '../util.js';
import { makeCanvas, tex } from '../util.js';

const NAVE_X = 3.6, AISLE_X = 8.2, BAY = 4, BAYS = 22;

function cofferTexture() {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#2a1c12';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const x = i * 256, y = j * 256;
    const g = ctx.createLinearGradient(x, y, x + 256, y + 256);
    g.addColorStop(0, '#5a4028');
    g.addColorStop(1, '#3a281a');
    ctx.fillStyle = g;
    ctx.fillRect(x + 20, y + 20, 216, 216);
    ctx.fillStyle = '#241710';
    ctx.fillRect(x + 50, y + 50, 156, 156);
    ctx.fillStyle = '#c99a4a';
    ctx.beginPath();
    ctx.arc(x + 128, y + 128, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c99a4a';
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 46, y + 46, 164, 164);
  }
  return tex(c, { repeat: true });
}

function placeInstances(mesh, list) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  list.forEach((it, i) => {
    p.set(...it.p);
    q.setFromEuler(new THREE.Euler(...(it.r || [0, 0, 0])));
    s.set(...(it.s || [1, 1, 1]));
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    if (it.c && mesh.instanceColor !== undefined) mesh.setColorAt(i, it.c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function instanced(geo, mat, list, shadows = true) {
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  placeInstances(m, list);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

// ----------------------------------------------------------- holograms
function holoGroup() {
  const g = new THREE.Group();
  g.userData.mats = [];
  return g;
}
function addLines(g, segs, color, width, opacity = 1) {
  const m = lineMat(color, width * 1.5, opacity);
  g.userData.mats.push([m, opacity]);
  const l = lines(segs, m);
  g.add(l);
  return l;
}

function holoStarGlobe(R) {
  const g = holoGroup();
  const s = [];
  for (let k = -5; k <= 5; k++) {
    const lat = (k / 6) * (Math.PI / 2);
    seg.circle(s, R * Math.cos(lat), 72, (x, y) => [x, R * Math.sin(lat), y]);
  }
  const s2 = [];
  for (let k = 0; k < 12; k++) {
    const lon = (k / 12) * Math.PI;
    seg.circle(s2, R, 72, (x, y) => [x * Math.cos(lon), y, x * Math.sin(lon)]);
  }
  addLines(g, s, GOLD.clone().multiplyScalar(1.2), 1.4, 0.55);
  addLines(g, s2, GOLD.clone().multiplyScalar(1.2), 1.4, 0.55);
  // Ecliptic and armillary rings
  const e = [];
  seg.circle(e, R * 1.18, 120, (x, y) => [x, y * Math.sin(0.41), y * Math.cos(0.41)]);
  seg.circle(e, R * 1.3, 120, (x, y) => [x, y, 0]);
  addLines(g, e, TURQ.clone().multiplyScalar(1.6), 2.4, 0.9);
  // Constellations on the sphere
  const r = mulberry32(17);
  const c = [];
  const stars = [];
  for (let k = 0; k < 14; k++) {
    let th = r() * Math.PI * 2, ph = (r() - 0.5) * 2.4;
    const pts = [];
    for (let i = 0; i < 4 + Math.floor(r() * 3); i++) {
      th += (r() - 0.5) * 0.5;
      ph += (r() - 0.5) * 0.4;
      pts.push([R * Math.cos(ph) * Math.cos(th), R * Math.sin(ph), R * Math.cos(ph) * Math.sin(th)]);
    }
    for (let i = 0; i < pts.length - 1; i++) c.push(...pts[i], ...pts[i + 1]);
    stars.push(...pts);
  }
  addLines(g, c, GOLD.clone().multiplyScalar(2.2), 2.2, 1);
  const sw = makeSwarm(stars.length + 160, (i, rr) => {
    if (i < stars.length) return { o: stars[i], size: R * 0.07, glyph: 63 };
    const th = rr() * 6.283, ph = Math.asin(rr() * 2 - 1);
    return { o: [R * Math.cos(ph) * Math.cos(th), R * Math.sin(ph), R * Math.cos(ph) * Math.sin(th)], size: R * 0.03, glyph: 63 };
  }, { color: new THREE.Color(1, 0.85, 0.6), intensity: 3, twinkle: 0.5 });
  g.add(sw);
  g.userData.swarm = sw;
  // Earth at the centre
  const earth = new THREE.Mesh(new THREE.SphereGeometry(R * 0.16, 32, 16), new THREE.MeshBasicMaterial({ color: TURQ.clone().multiplyScalar(0.9), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(earth);
  g.userData.mats.push([earth.material, 0.8]);
  return g;
}

function holoMap(R) {
  const g = holoGroup();
  const coast = [[-5.6, 36], [-2, 36.7], [0, 38.5], [0.5, 40.5], [3, 42], [4.5, 43.4], [6.5, 43.1], [8.5, 44.3], [10.5, 43.5], [12, 41.8], [14, 40.8], [16, 38.5], [15.7, 38], [16.5, 39.5], [17, 40.5], [18.5, 40.2], [18, 40.6], [16, 41.5], [14, 42.5], [13, 43.6], [12.3, 45.3], [13.7, 45.6], [15, 44.5], [17, 43], [19, 42], [19.5, 40.5], [21, 38.5], [22, 37], [23, 36.5], [23, 38], [24, 38.5], [22.9, 40.5], [26, 40.8], [26.5, 40], [27, 38.5], [27.5, 37], [29, 36.6], [31, 36.8], [33, 36.2], [36, 36.8], [35.9, 35.5], [35.5, 34], [34.9, 32.5], [34.2, 31.3], [32.5, 31.1], [31, 31.5], [29.9, 31.2], [28, 31], [25, 31.6], [23, 32.6], [20, 32], [20, 30.6], [18, 30.7], [15.5, 31.5], [13, 32.8], [11, 33.2], [10.2, 34.3], [11, 35.5], [10.3, 37.2], [9.5, 37.3], [8, 37], [5, 36.8], [2, 36.6], [0, 35.8], [-2, 35.1], [-5.3, 35.9]];
  const isl = [
    [[12.4, 38.1], [15.6, 38.2], [15.1, 36.7]],
    [[23.5, 35.3], [24.5, 35.5], [26.3, 35.2], [25, 35]],
    [[32.3, 34.7], [34.5, 35.6], [33.9, 35], [32.9, 34.6]],
    [[8.4, 41], [9.8, 41], [9.6, 39], [8.5, 39]],
    [[9.2, 43], [9.5, 42.9], [9.4, 41.4], [8.6, 41.7]],
  ];
  const P = (lon, lat) => [((lon - 15) / 22) * R, ((lat - 38) / 22) * R];
  const s = [];
  seg.poly(s, coast.map((p) => P(...p)), true);
  isl.forEach((i) => seg.poly(s, i.map((p) => P(...p)), true));
  addLines(g, s, GOLD.clone().multiplyScalar(2.2), 2.4, 1);
  const grid = [];
  for (let lon = -5; lon <= 36; lon += 5) seg.line(grid, [...P(lon, 28), 0], [...P(lon, 48), 0]);
  for (let lat = 30; lat <= 46; lat += 4) seg.line(grid, [...P(-8, lat), 0], [...P(38, lat), 0]);
  addLines(g, grid, TURQ.clone().multiplyScalar(1.1), 1.2, 0.4);
  const a = P(29.9, 31.2);
  const ring = [];
  seg.circle(ring, R * 0.05, 32, (x, y) => [a[0] + x, a[1] + y, 0]);
  seg.circle(ring, R * 0.1, 32, (x, y) => [a[0] + x, a[1] + y, 0]);
  addLines(g, ring, TURQ.clone().multiplyScalar(2.5), 2.6, 1);
  return g;
}

function holoGeometry(R) {
  const g = holoGroup();
  const s = [];
  const A = [-0.45 * R, -0.3 * R], B = [0.35 * R, -0.3 * R], C = [-0.45 * R, 0.3 * R];
  seg.poly(s, [A, B, C]);
  const sq = (p, q) => {
    const dx = q[0] - p[0], dy = q[1] - p[1];
    seg.poly(s, [p, q, [q[0] + dy, q[1] - dx], [p[0] + dy, p[1] - dx]]);
  };
  sq(A, B);
  sq(C, A);
  sq(B, C);
  seg.circle(s, R * 0.95, 96);
  addLines(g, s, GOLD.clone().multiplyScalar(2.2), 2.4, 1);
  const s2 = [];
  seg.circle(s2, R * 0.3, 64, (x, y) => [x - 0.05 * R, y, 0]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    seg.line(s2, [Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95, 0], [Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05, 0]);
  }
  addLines(g, s2, TURQ.clone().multiplyScalar(1.6), 1.6, 0.8);
  return g;
}

function holoAnatomy(R) {
  const g = holoGroup();
  const s = [];
  seg.circle(s, R, 96);
  seg.poly(s, [[-0.82 * R, -0.95 * R], [0.82 * R, -0.95 * R], [0.82 * R, 0.69 * R], [-0.82 * R, 0.69 * R]]);
  seg.circle(s, R * 0.13, 40, (x, y) => [x, y + 0.5 * R, 0]);
  const body = [[0, 0.37], [0, -0.15], [-0.12, -0.95], [0, -0.15], [0.12, -0.95]];
  seg.poly(s, body.map(([x, y]) => [x * R, y * R]), false);
  seg.poly(s, [[-0.36, -0.9], [0, -0.15], [0.36, -0.9]].map(([x, y]) => [x * R, y * R]), false);
  seg.poly(s, [[-0.82, 0.3], [0, 0.28], [0.82, 0.3]].map(([x, y]) => [x * R, y * R]), false);
  seg.poly(s, [[-0.75, 0.62], [0, 0.28], [0.75, 0.62]].map(([x, y]) => [x * R, y * R]), false);
  addLines(g, s, GOLD.clone().multiplyScalar(2.2), 2.4, 1);
  // Ribs and heart as a turquoise inset
  const h = [];
  for (let i = 0; i < 5; i++) seg.circle(h, R * (0.08 + i * 0.02), 24, (x, y) => [x * 1.4, y * 0.6 + 0.12 * R - i * 0.05 * R, 0]);
  addLines(g, h, TURQ.clone().multiplyScalar(1.5), 1.4, 0.7);
  return g;
}

function holoGears(R) {
  const g = holoGroup();
  const gears = [];
  const mk = (r, n, x, y, speed) => {
    const geo = new THREE.ShapeGeometry(gearShape(r, n, 0.14, 0.2, 5), 6);
    const edges = new THREE.EdgesGeometry(geo);
    const pos = edges.attributes.position.array;
    const grp = new THREE.Group();
    grp.position.set(x, y, 0);
    grp.userData.mats = g.userData.mats;
    addLines(grp, Array.from(pos), TURQ.clone().multiplyScalar(1.8), 1.8, 0.95);
    const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: GOLD.clone().multiplyScalar(0.5), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    g.userData.mats.push([fill.material, 0.18]);
    grp.add(fill);
    g.add(grp);
    gears.push([grp, speed]);
  };
  mk(R * 0.55, 18, -0.25 * R, 0.1 * R, 1);
  mk(R * 0.33, 11, 0.55 * R, 0.32 * R, -18 / 11);
  mk(R * 0.3, 10, 0.32 * R, -0.52 * R, -1.8);
  g.userData.gears = gears;
  return g;
}

export function createLibrary() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0805);
  scene.fog = new THREE.FogExp2(0x24170d, 0.02);
  const camera = new THREE.PerspectiveCamera(52, 1080 / 1920, 0.05, 200);

  const zEnd = -BAY * BAYS;
  const len = -zEnd + 10;
  const zMid = (zEnd + 6) / 2;

  // Floor
  const fl = T.floor();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(AISLE_X * 2, len), new THREE.MeshStandardMaterial({ map: setRepeat(fl, AISLE_X, len / 2), roughness: 0.18, metalness: 0.0, color: 0x8c7a68 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, zMid);
  floor.receiveShadow = true;
  scene.add(floor);

  // Marble columns
  const marble = T.marble();
  const colMat = new THREE.MeshStandardMaterial({ map: setRepeat(marble, 1, 3), bumpMap: setRepeat(T.flute(), 1, 1), bumpScale: 2.2, roughness: 0.35, color: 0xf2e8d8 });
  const capMat = new THREE.MeshStandardMaterial({ map: marble, roughness: 0.4, color: 0xf0e4d0 });
  const goldM = new THREE.MeshStandardMaterial({ color: 0xd8a84e, metalness: 1, roughness: 0.3 });
  const shaftL = [], baseL = [], plinthL = [], capL = [], abaL = [], voluteL = [];
  for (let k = 0; k <= BAYS; k++) {
    const z = 2 - k * BAY;
    for (const sx of [-1, 1]) {
      const x = sx * NAVE_X;
      shaftL.push({ p: [x, 4.4, z] });
      baseL.push({ p: [x, 0.42, z] });
      plinthL.push({ p: [x, 0.13, z] });
      capL.push({ p: [x, 8.65, z] });
      abaL.push({ p: [x, 8.9, z] });
      voluteL.push({ p: [x, 8.7, z - 0.48], r: [0, Math.PI / 2, Math.PI / 2] }, { p: [x, 8.7, z + 0.48], r: [0, Math.PI / 2, Math.PI / 2] });
    }
  }
  scene.add(instanced(new THREE.CylinderGeometry(0.38, 0.44, 8.1, 32, 1), colMat, shaftL));
  scene.add(instanced(new THREE.CylinderGeometry(0.56, 0.6, 0.3, 32), capMat, baseL));
  scene.add(instanced(new THREE.BoxGeometry(1.3, 0.26, 1.3), capMat, plinthL));
  scene.add(instanced(new THREE.CylinderGeometry(0.46, 0.4, 0.3, 32), capMat, capL));
  scene.add(instanced(new THREE.BoxGeometry(1.2, 0.2, 1.2), capMat, abaL));
  scene.add(instanced(new THREE.CylinderGeometry(0.17, 0.17, 1.0, 20), capMat, voluteL));

  // Entablature with a gilded band
  for (const sx of [-1, 1]) {
    const arch = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, len), capMat);
    arch.position.set(sx * NAVE_X, 9.35, zMid);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.16, len), goldM);
    band.position.set(sx * NAVE_X, 9.78, zMid);
    const corn = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, len), capMat);
    corn.position.set(sx * NAVE_X, 10.0, zMid);
    for (const m of [arch, band, corn]) {
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    }
  }

  // Clerestory walls with windows
  const st = T.stone(3, [176, 150, 116]);
  const wallMat = new THREE.MeshStandardMaterial({ map: setRepeat(st.map, 1, 1), bumpMap: st.bump, bumpScale: 2, roughness: 0.9, color: 0xd8c4a4 });
  const winEmit = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.86, 0.66).multiplyScalar(5), toneMapped: false });
  const winEmitR = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.8, 1.0).multiplyScalar(1.6), toneMapped: false });
  const sunDir = new THREE.Vector3(1, -0.78, -0.3).normalize();
  for (const sx of [-1, 1]) {
    const x = sx * (NAVE_X + 0.2);
    const parts = [
      [0.7, 1.2, len, 10.75],
      [0.7, 1.4, len, 15.6],
    ];
    for (const [w, h, l, y] of parts) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), wallMat);
      m.position.set(x, y, zMid);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    }
    for (let k = 0; k <= BAYS; k++) {
      const z = 2 - k * BAY;
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.5, 2.2), wallMat);
      pier.position.set(x, 13.1, z);
      pier.castShadow = pier.receiveShadow = true;
      scene.add(pier);
      if (k < BAYS) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3.5), sx < 0 ? winEmit : winEmitR);
        win.position.set(x + sx * 0.36, 13.1, z - BAY / 2);
        win.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
        scene.add(win);
        if (sx < 0) {
          const b = beam(24, 1.7, new THREE.Color(1, 0.82, 0.58), 1);
          b.position.set(x + 0.2, 13.1, z - BAY / 2);
          b.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), sunDir);
          b.userData.mat.opacity = 0.085;
          scene.add(b);
        }
      }
    }
  }
  // Nave ceiling, aisle ceilings
  const coffer = cofferTexture();
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(NAVE_X * 2 + 1.4, 0.6, len), new THREE.MeshStandardMaterial({ map: setRepeat(coffer, 2, len / 4), roughness: 0.8 }));
  ceil.position.set(0, 16.6, zMid);
  ceil.castShadow = true;
  scene.add(ceil);
  for (const sx of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(AISLE_X - NAVE_X, 0.4, len), new THREE.MeshStandardMaterial({ map: setRepeat(coffer, 1, len / 4), roughness: 0.8 }));
    c.position.set(sx * (NAVE_X + AISLE_X) / 2, 9.6, zMid);
    scene.add(c);
  }

  // Shelving walls full of scrolls
  const wood = T.wood([84, 52, 30], 4);
  const woodMat = new THREE.MeshStandardMaterial({ map: setRepeat(wood, 2, 2), roughness: 0.6 });
  const shelves = [], uprights = [], scrolls = [];
  const rnd = mulberry32(5);
  const tint = new THREE.Color();
  for (const sx of [-1, 1]) {
    const xw = sx * AISLE_X;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(len, 9.4), new THREE.MeshStandardMaterial({ color: 0x1c120b, roughness: 1 }));
    back.position.set(xw, 4.7, zMid);
    back.rotation.y = -sx * Math.PI / 2;
    scene.add(back);
    for (let r = 0; r <= 12; r++) shelves.push({ p: [xw - sx * 0.3, 0.3 + r * 0.72, zMid], s: [0.6, 0.06, len] });
    for (let z = 4; z >= zEnd - 4; z -= 2) uprights.push({ p: [xw - sx * 0.3, 4.6, z], s: [0.62, 9.2, 0.08] });
    for (let r = 0; r < 12; r++) {
      for (let z = 4; z >= zEnd - 4; z -= 0.16) {
        if (rnd() < 0.12) continue;
        const y = 0.3 + r * 0.72 + 0.1 + (rnd() < 0.3 ? 0.12 : 0);
        tint.setHSL(0.09 + rnd() * 0.03, 0.35 + rnd() * 0.2, 0.55 + rnd() * 0.25);
        scrolls.push({ p: [xw - sx * (0.32 + rnd() * 0.06), y, z + (rnd() - 0.5) * 0.04], r: [0, 0, Math.PI / 2], s: [1, 0.85 + rnd() * 0.3, 1], c: tint.clone() });
      }
    }
  }
  scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), woodMat, shelves, false));
  scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), woodMat, uprights, false));
  const capTex = T.scrollCap();
  const scrollSide = new THREE.MeshStandardMaterial({ map: T.parchment(8), roughness: 0.9 });
  const scrollCapM = new THREE.MeshStandardMaterial({ map: capTex, roughness: 0.9 });
  const sm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.065, 0.065, 0.55, 10), [scrollSide, scrollCapM, scrollCapM], scrolls.length);
  placeInstances(sm, scrolls);
  scene.add(sm);

  // Far apse glowing with light
  const archShape = new THREE.Shape();
  archShape.moveTo(-2.6, 0);
  archShape.lineTo(-2.6, 7.4);
  archShape.absarc(0, 7.4, 2.6, Math.PI, 0, true);
  archShape.lineTo(2.6, 0);
  archShape.closePath();
  const [ac, actx] = makeCanvas(256, 512);
  const ag = actx.createRadialGradient(128, 300, 10, 128, 300, 300);
  ag.addColorStop(0, '#fff6e0');
  ag.addColorStop(0.5, '#ffc77a');
  ag.addColorStop(1, '#b86a2a');
  actx.fillStyle = ag;
  actx.fillRect(0, 0, 256, 512);
  const archGeo = new THREE.ShapeGeometry(archShape, 24);
  archGeo.computeBoundingBox();
  const uv = archGeo.attributes.uv, ps = archGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (ps.getX(i) + 2.6) / 5.2, ps.getY(i) / 10);
  const apse = new THREE.Mesh(archGeo, new THREE.MeshBasicMaterial({ map: tex(ac), color: new THREE.Color(1, 1, 1).multiplyScalar(2.2), toneMapped: false }));
  apse.position.set(0, 0, zEnd - 4);
  const apseWall = new THREE.Mesh(new THREE.PlaneGeometry(AISLE_X * 2, 17), wallMat);
  apseWall.position.set(0, 8.5, zEnd - 4.05);
  scene.add(apseWall);
  scene.add(apse);
  const apseGlow = glow(new THREE.Color(1, 0.75, 0.45), 26, 0.6);
  apseGlow.position.set(0, 6, zEnd - 3);
  scene.add(apseGlow);

  // Lights
  const hemi = new THREE.HemisphereLight(0xffe0b8, 0x2a1a10, 0.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd7a0, 5.5);
  sun.position.copy(sunDir).multiplyScalar(-40).add(new THREE.Vector3(0, 0, -20));
  sun.target.position.set(0, 0, -20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 100 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // Bronze lamps on stands along the nave, lit by the wave
  const lampZ = [];
  for (let k = 0; k < BAYS; k++) lampZ.push(2 - k * BAY - BAY / 2);
  const standMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 1, roughness: 0.35 });
  const bowls = [];
  const lampsGlow = [];
  for (const z of lampZ) for (const sx of [-1, 1]) {
    const x = sx * (NAVE_X - 0.9);
    bowls.push({ p: [x, 1.35, z] });
    const gl = glow(new THREE.Color(1, 0.62, 0.28), 0.9, 0);
    gl.position.set(x, 1.55, z);
    scene.add(gl);
    lampsGlow.push([gl, z]);
  }
  scene.add(instanced(new THREE.CylinderGeometry(0.035, 0.06, 1.3, 10).translate(0, -0.65, 0), standMat, bowls));
  scene.add(instanced(new THREE.CylinderGeometry(0.22, 0.08, 0.16, 20), standMat, bowls.map((b) => ({ p: [b.p[0], b.p[1] + 0.05, b.p[2]] }))));
  const lampLights = [0, 1, 2].map(() => {
    const l = new THREE.PointLight(0xff9a4a, 0, 11, 2);
    scene.add(l);
    return l;
  });

  // Reading stations with holograms
  const tableMat = new THREE.MeshStandardMaterial({ map: setRepeat(wood, 1, 1), roughness: 0.5 });
  const sheet = T.scrollSheet();
  const stations = [
    { z: -6.5, x: -1.45, make: holoMap, R: 0.95 },
    { z: -11.2, x: 1.45, make: holoGeometry, R: 0.8 },
    { z: -15.8, x: -1.45, make: holoAnatomy, R: 0.85 },
    { z: -20.2, x: 1.45, make: holoGears, R: 0.9 },
  ].map((s) => {
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.07, 0.75), tableMat);
    table.position.set(s.x, 0.87, s.z);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 0.84, 16), standMat);
    leg.position.set(s.x, 0.42, s.z);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.06, 24), standMat);
    foot.position.set(s.x, 0.03, s.z);
    for (const m of [table, leg, foot]) {
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    }
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshStandardMaterial({ map: sheet, roughness: 0.9 }));
    paper.rotation.x = -Math.PI / 2;
    paper.position.set(s.x, 0.905, s.z);
    scene.add(paper);
    const rods = [-1, 1].map((d) => {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.56, 12), tableMat);
      r.rotation.x = Math.PI / 2;
      r.position.set(s.x + d * 0.45, 0.93, s.z);
      scene.add(r);
      return r;
    });
    const holo = s.make(s.R);
    holo.position.set(s.x, 2.0, s.z);
    holo.rotation.y = s.x < 0 ? 0.55 : -0.55;
    scene.add(holo);
    const cone = beam(1.0, 0.9, GOLD, 0.5);
    cone.rotation.z = Math.PI;
    cone.position.set(s.x, 0.95, s.z);
    scene.add(cone);
    return { ...s, paper, rods, holo, cone };
  });
  // The great star globe at the end of the flight
  const globe = holoStarGlobe(1.25);
  globe.position.set(0, 2.25, -30.5);
  globe.rotation.x = 0.25;
  scene.add(globe);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 0.8, 40), capMat);
  pedestal.position.set(0, 0.4, -30.5);
  pedestal.castShadow = pedestal.receiveShadow = true;
  scene.add(pedestal);
  const pedRing = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.03, 8, 64), goldM);
  pedRing.rotation.x = Math.PI / 2;
  pedRing.position.set(0, 0.8, -30.5);
  scene.add(pedRing);
  const globeCone = beam(1.0, 1.6, GOLD, 0.6);
  globeCone.rotation.z = Math.PI;
  globeCone.position.set(0, 0.82, -30.5);
  scene.add(globeCone);

  // Dust and the golden wave
  const motes = makeDustMotes(1400, [-3.4, 3.4, 0.2, 14, -34, 4], { size: [0.005, 0.012], intensity: 1.0, drift: 0.15 });
  scene.add(motes);
  const wave = makeSwarm(900, (i, r) => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 2.6;
    return {
      o: [Math.cos(a) * d, 2.2 + Math.sin(a) * d * 1.3, 2.5 - r() * 2],
      v: [Math.cos(a) * 0.3, Math.sin(a) * 0.2, -(9 + r() * 7)],
      t0: 2.95 + r() * 0.5, life: 1.2 + r() * 1.2, size: 0.02 + r() * 0.04,
      glyph: r() < 0.6 ? 63 : Math.floor(r() * 62), freq: 2, amp: 0.15, phase: r() * 6.28, spin: (r() - 0.5) * 3,
    };
  }, { color: GOLD, intensity: 2.2, twinkle: 0.3 });
  scene.add(wave);

  const camPos = ktrack([
    [2.95, [0.0, 1.75, 4.5]],
    [4.0, [-0.35, 2.3, -1.8]],
    [5.0, [0.3, 2.7, -8.5]],
    [6.0, [-0.25, 2.5, -15.5]],
    [6.75, [0.1, 2.3, -21.0]],
    [7.32, [0.0, 2.25, -25.4]],
  ]);
  const camTgt = ktrack([
    [2.95, [0.0, 3.4, -20]],
    [4.0, [0.0, 3.6, -24]],
    [5.0, [0.0, 3.4, -28]],
    [6.0, [0.0, 2.8, -30.5]],
    [7.32, [0.0, 2.25, -30.5]],
  ]);

  function update(t) {
    rigCamera(camera, camPos, camTgt, t, Math.sin(t * 0.9) * 0.012);
    const front = 4.5 - (t - 2.95) * 14; // z of the light wave
    for (const [gl, z] of lampsGlow) {
      const lit = clamp((z - front) / 3);
      gl.material.color.setRGB(1, 0.62, 0.28).multiplyScalar(lit * (2.4 + 0.3 * Math.sin(t * 13 + z)));
    }
    // Three moving point lights stand in for the nearest lamps
    const camZ = camera.position.z;
    lampLights.forEach((l, i) => {
      const z = lampZ.reduce((best, zz) => (zz < camZ - 2 - i * 4 && (best === null || zz > best) ? zz : best), null) ?? lampZ[lampZ.length - 1];
      l.position.set(i % 2 ? NAVE_X - 0.9 : -(NAVE_X - 0.9), 1.7, z);
      l.intensity = 9 * clamp((z - front) / 3);
    });
    hemi.intensity = 0.18 + 0.25 * ss(2.95, 3.8, t);
    sun.intensity = 5.5 * (0.5 + 0.5 * ss(2.95, 3.6, t));

    stations.forEach((s) => {
      const d = camZ - s.z;
      const open = eio(ss(11, 6.5, d));
      s.paper.scale.x = Math.max(0.05, open);
      s.rods[0].position.x = s.x - 0.45 * Math.max(0.05, open);
      s.rods[1].position.x = s.x + 0.45 * Math.max(0.05, open);
      s.holo.scale.setScalar(0.25 + 0.75 * open);
      s.holo.position.y = 1.3 + 1.05 * open;
      s.holo.visible = open > 0.01;
      s.holo.userData.mats.forEach(([m, o]) => (m.opacity = o * open * (0.9 + 0.1 * Math.sin(t * 23 + s.z))));
      s.cone.userData.mat.opacity = 0.18 * open;
      if (s.holo.userData.gears) s.holo.userData.gears.forEach(([g, sp]) => (g.rotation.z = t * 0.8 * sp));
      s.holo.rotation.y = (s.x < 0 ? 0.5 : -0.5) + Math.sin(t * 0.7) * 0.15;
    });
    const gOpen = eio(ss(14, 8, camZ - globe.position.z));
    globe.scale.setScalar(0.3 + 0.7 * gOpen);
    globe.rotation.y = t * 0.35;
    globe.userData.mats.forEach(([m, o]) => (m.opacity = o * gOpen));
    globe.userData.swarm.material.uniforms.uTime.value = t;
    globe.userData.swarm.material.uniforms.uFade.value = gOpen;
    globeCone.userData.mat.opacity = 0.25 * gOpen;

    motes.material.uniforms.uTime.value = t;
    wave.material.uniforms.uTime.value = t;
  }

  return { scene, camera, update, grade: { exposure: 1.0, bloom: 0.55, vignette: 0.6 } };
}
