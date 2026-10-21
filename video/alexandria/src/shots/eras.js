// Shot 3 (0:07-0:11): two thousand years of progress. One study, one camera
// move, four eras: the instrument on the table, the props, the light through
// the window and the scholar's shadow change; the place stays the same.
import * as THREE from 'three';
import { T, GOLD, glow, beam, gearMesh, brass, makeDustMotes, setRepeat, roomEnv, applyEnv } from '../lib.js';
import { ss, ktrack, rigCamera, lerp, mulberry32, makeCanvas, tex } from '../util.js';

const ERA_LIGHT = [
  new THREE.Color(1.0, 0.8, 0.56),
  new THREE.Color(1.0, 0.66, 0.36),
  new THREE.Color(0.62, 0.72, 1.0),
  new THREE.Color(0.92, 0.96, 1.0),
];
const ERA_WALL = [0xd9c09a, 0xc49a6c, 0x6a5848, 0x57635c];
const ERA_FOG = [0x2b2014, 0x2a1a0e, 0x0e1018, 0x15191c];

function lathe(points, mat, segs = 32) {
  return new THREE.Mesh(new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segs), mat);
}

function gaugeTexture() {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#efe6d2';
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.42, Math.PI * 0.75, Math.PI * 2.25);
  ctx.stroke();
  for (let i = 0; i <= 30; i++) {
    const a = Math.PI * 0.75 + (i / 30) * Math.PI * 1.5;
    const l = i % 5 === 0 ? 40 : 20;
    ctx.lineWidth = i % 5 === 0 ? 5 : 2.5;
    ctx.beginPath();
    ctx.moveTo(S / 2 + Math.cos(a) * S * 0.42, S / 2 + Math.sin(a) * S * 0.42);
    ctx.lineTo(S / 2 + Math.cos(a) * (S * 0.42 - l), S / 2 + Math.sin(a) * (S * 0.42 - l));
    ctx.stroke();
  }
  ctx.fillStyle = '#8a1a14';
  ctx.beginPath();
  ctx.arc(S * 0.5, S * 0.5, 14, 0, Math.PI * 2);
  ctx.fill();
  return tex(c);
}

function armillary() {
  const g = new THREE.Group();
  const bronze = new THREE.MeshStandardMaterial({ color: 0xb07a3a, metalness: 1, roughness: 0.42 });
  const ring = (r, tube, rx, ry, rz) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 12, 128), bronze);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    return m;
  };
  const spin = new THREE.Group();
  spin.rotation.z = 0.5;
  spin.add(ring(0.27, 0.007, Math.PI / 2, 0, 0));
  spin.add(ring(0.27, 0.006, Math.PI / 2 + 0.41, 0, 0));
  spin.add(ring(0.27, 0.006, 0, 0, 0));
  spin.add(ring(0.27, 0.006, 0, Math.PI / 2, 0));
  spin.add(ring(0.2, 0.005, Math.PI / 2, 0, 0.3));
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.68, 8), bronze);
  spin.add(axle);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(0.05, 32, 16), new THREE.MeshStandardMaterial({ color: 0x5a7a8a, roughness: 0.6, metalness: 0.2 }));
  spin.add(earth);
  g.add(spin);
  g.add(ring(0.31, 0.011, 0, 0, 0));
  const hor = new THREE.Mesh(new THREE.RingGeometry(0.31, 0.36, 96), bronze);
  hor.rotation.x = -Math.PI / 2;
  hor.material = bronze.clone();
  hor.material.side = THREE.DoubleSide;
  g.add(hor);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.32, 8), bronze);
    leg.position.set(Math.cos(a) * 0.3, -0.16, Math.sin(a) * 0.3);
    leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
    g.add(leg);
  }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.03, 48), bronze);
  base.position.y = -0.33;
  g.add(base);
  g.userData.spin = spin;
  return g;
}

function astrolabe() {
  const g = new THREE.Group();
  const b = brass(0.3);
  const faceMat = new THREE.MeshStandardMaterial({ map: T.astrolabe(), metalness: 0.55, roughness: 0.4 });
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.025, 96), [b, faceMat, b]);
  disk.rotation.x = Math.PI / 2;
  disk.castShadow = true;
  g.add(disk);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.012, 12, 96), b);
  g.add(rim);
  const rete = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.56), new THREE.MeshStandardMaterial({
    color: 0xe0b45a, metalness: 1, roughness: 0.25, alphaMap: T.rete(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide,
  }));
  rete.position.z = 0.016;
  rete.castShadow = true;
  g.add(rete);
  const rule = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.024, 0.006), b);
  rule.position.z = 0.024;
  g.add(rule);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.06, 16), b);
  pin.rotation.x = Math.PI / 2;
  g.add(pin);
  const throne = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.03, 3), b);
  throne.position.y = 0.29;
  throne.rotation.z = Math.PI;
  g.add(throne);
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 8, 32), b);
  shackle.position.y = 0.34;
  g.add(shackle);
  // Stand
  const wood = new THREE.MeshStandardMaterial({ map: T.wood([70, 40, 22], 6), roughness: 0.5 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.78, 12), wood);
  post.position.set(-0.36, 0.0, -0.05);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.36, 10), wood);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(-0.19, 0.39, -0.05);
  const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.04, 6), b);
  hook.position.set(0, 0.37, -0.02);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.03, 32), wood);
  foot.position.set(-0.36, -0.38, -0.05);
  g.add(post, arm, hook, foot);
  g.userData.rete = rete;
  g.userData.rule = rule;
  return g;
}

function globeInstrument() {
  const g = new THREE.Group();
  const b = brass(0.35);
  const wood = new THREE.MeshStandardMaterial({ map: T.wood([60, 34, 20], 7), roughness: 0.45 });
  const axis = new THREE.Group();
  axis.rotation.z = 0.41;
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.24, 64, 32), new THREE.MeshStandardMaterial({ map: T.celestial(), roughness: 0.45, metalness: 0.25 }));
  sphere.castShadow = true;
  axis.add(sphere);
  const mer = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.009, 10, 128), b);
  axis.add(mer);
  g.add(axis);
  const hor = new THREE.Mesh(new THREE.RingGeometry(0.27, 0.33, 96), wood);
  hor.rotation.x = -Math.PI / 2;
  hor.material = wood.clone();
  hor.material.side = THREE.DoubleSide;
  g.add(hor);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.34, 10), wood);
    leg.position.set(Math.cos(a) * 0.3, -0.17, Math.sin(a) * 0.3);
    g.add(leg);
  }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.025, 48), wood);
  base.position.y = -0.34;
  g.add(base);
  g.userData.sphere = sphere;
  return g;
}

function gearMachine() {
  const g = new THREE.Group();
  const b = brass(0.3);
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa3a8, metalness: 1, roughness: 0.3 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.62, 0.02), new THREE.MeshStandardMaterial({ color: 0x2a2724, metalness: 0.6, roughness: 0.5 }));
  plate.position.z = -0.05;
  plate.receiveShadow = true;
  g.add(plate);
  const gears = [];
  const add = (R, n, x, y, z, speed, mat) => {
    const m = gearMesh(R, n, 0.018, mat, { spokes: R > 0.1 ? 5 : 0 });
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    const ax = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 12), steel);
    ax.rotation.x = Math.PI / 2;
    ax.position.set(x, y, z - 0.03);
    g.add(ax);
    gears.push([m, speed]);
  };
  add(0.2, 30, -0.05, 0.02, 0.0, 1, b);
  add(0.1, 15, 0.235, 0.12, 0.0, -2, steel);
  add(0.085, 13, 0.16, -0.21, 0.0, -30 / 13, b);
  add(0.12, 18, -0.25, -0.2, 0.025, -30 / 18, steel);
  add(0.06, 9, -0.22, 0.22, 0.025, 3, b);
  const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 48), [b, new THREE.MeshStandardMaterial({ map: gaugeTexture(), roughness: 0.4 }), b]);
  gauge.rotation.x = Math.PI / 2;
  gauge.position.set(0.22, 0.24, 0.03);
  g.add(gauge);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.055, 0.002), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  needle.geometry.translate(0, 0.025, 0);
  needle.position.set(0.22, 0.24, 0.042);
  g.add(needle);
  // Frame legs
  for (const x of [-0.33, 0.33]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.72, 0.06), b);
    leg.position.set(x, -0.02, -0.05);
    g.add(leg);
  }
  g.userData.gears = gears;
  g.userData.needle = needle;
  return g;
}

export function createEras(renderer) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x221a12, 0.06);
  scene.background = new THREE.Color(0x0a0705);
  const camera = new THREE.PerspectiveCamera(40, 1080 / 1920, 0.05, 50);

  // Room
  const st = T.stone(4, [190, 170, 140]);
  const wallMat = new THREE.MeshStandardMaterial({ map: setRepeat(st.map, 2, 1.5), bumpMap: setRepeat(st.bump, 2, 1.5), bumpScale: 1.2, roughness: 0.95 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 4.5), wallMat);
  wall.position.set(0, 1.9, -1.45);
  wall.receiveShadow = true;
  scene.add(wall);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(4, 4.5), wallMat);
  side.position.set(1.9, 1.9, 0.4);
  side.rotation.y = -Math.PI / 2;
  side.receiveShadow = true;
  scene.add(side);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ map: setRepeat(T.floor(), 3, 3), roughness: 0.4, color: 0x6a5a4a }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Table
  const woodT = new THREE.MeshStandardMaterial({ map: setRepeat(T.wood([88, 54, 30], 9), 2, 1), roughness: 0.42 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 1.2), woodT);
  top.position.set(0, 0.77, 0);
  top.receiveShadow = top.castShadow = true;
  scene.add(top);
  for (const [x, z] of [[-0.9, -0.5], [0.9, -0.5], [-0.9, 0.5], [0.9, 0.5]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.74, 0.08), woodT);
    l.position.set(x, 0.37, z);
    scene.add(l);
  }

  // Light patch with the scholar's shadow on the back wall
  const patches = [0, 1, 2, 3].map((e) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({
      map: T.windowLight(e), color: ERA_LIGHT[e].clone().multiplyScalar(0.55), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    m.position.set(0.45, 1.75, -1.43);
    scene.add(m);
    return m;
  });

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.position.set(-1.8, 3.2, 2.2);
  sun.target.position.set(0.2, 0.9, -0.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -1.6, right: 1.6, top: 1.6, bottom: -1.6, near: 0.5, far: 8 });
  sun.shadow.bias = -0.0005;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new THREE.HemisphereLight(0xffe2c0, 0x1a120a, 0.25);
  scene.add(fill);
  const practical = new THREE.PointLight(0xff9a50, 0, 3, 2);
  practical.castShadow = false;
  scene.add(practical);
  const shaft = beam(4.2, 1.1, new THREE.Color(1, 0.85, 0.6), 1);
  shaft.position.set(-1.7, 3.4, 1.4);
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(1.9, -1.9, -2.6).normalize());
  scene.add(shaft);
  const motes = makeDustMotes(500, [-1.2, 1.4, 0.8, 2.6, -1.3, 1.0], { size: [0.003, 0.008], intensity: 1, drift: 0.03 });
  scene.add(motes);

  // Instruments
  const CENTER = new THREE.Vector3(0, 1.17, 0);
  const objs = [armillary(), astrolabe(), globeInstrument(), gearMachine()];
  objs.forEach((o) => {
    o.position.copy(CENTER);
    o.traverse((c) => c.isMesh && (c.castShadow = true));
    scene.add(o);
  });

  // Props per era
  const props = [new THREE.Group(), new THREE.Group(), new THREE.Group(), new THREE.Group()];
  props.forEach((p) => scene.add(p));
  const parchMat = new THREE.MeshStandardMaterial({ map: T.parchment(10), roughness: 0.9 });
  const r = mulberry32(4);
  // Era 0: scrolls, oil lamp, papyrus with the Eratosthenes drawing
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.36, 16), parchMat);
    s.rotation.z = Math.PI / 2;
    s.rotation.y = 0.4 + r() * 0.3;
    s.position.set(-0.62 + (i % 3) * 0.06, 0.83 + (i > 2 ? 0.055 : 0), 0.28 + (i % 3) * 0.06);
    props[0].add(s);
  }
  const papyrus = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.56), new THREE.MeshStandardMaterial({ map: T.pageL().map, roughness: 0.9 }));
  papyrus.rotation.set(-Math.PI / 2, 0, 0.35);
  papyrus.position.set(0.55, 0.802, 0.25);
  props[0].add(papyrus);
  const clay = new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 0.8 });
  const oil = lathe([[0, 0], [0.06, 0.005], [0.08, 0.03], [0.05, 0.05], [0.015, 0.055], [0, 0.055]], clay);
  oil.position.set(0.55, 0.8, -0.32);
  props[0].add(oil);
  const flame0 = glow(new THREE.Color(1, 0.6, 0.25), 0.12, 3);
  flame0.position.set(0.62, 0.9, -0.32);
  props[0].add(flame0);
  // Era 1: books, alembic, brass lamp
  const leather = [0x5a1a14, 0x23384a, 0x3a2a14, 0x1d3a2a];
  for (let i = 0; i < 4; i++) {
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.22), new THREE.MeshStandardMaterial({ color: leather[i], roughness: 0.7 }));
    bk.position.set(-0.6, 0.825 + i * 0.05, 0.25);
    bk.rotation.y = (r() - 0.5) * 0.3;
    props[1].add(bk);
  }
  const glass = new THREE.MeshStandardMaterial({ color: 0xb8e0c8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.4 });
  const alembic = lathe([[0, 0], [0.09, 0.02], [0.11, 0.09], [0.08, 0.17], [0.025, 0.22], [0.022, 0.32], [0.04, 0.34], [0, 0.35]], glass);
  alembic.position.set(0.58, 0.8, 0.12);
  props[1].add(alembic);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.3, 8), glass);
  spout.position.set(0.7, 1.08, 0.12);
  spout.rotation.z = -1.0;
  props[1].add(spout);
  const liquid = lathe([[0, 0.005], [0.085, 0.022], [0.1, 0.07], [0, 0.07]], new THREE.MeshStandardMaterial({ color: 0x7a2a18, roughness: 0.1, transparent: true, opacity: 0.8 }));
  liquid.position.copy(alembic.position);
  props[1].add(liquid);
  const lamp1 = lathe([[0, 0], [0.05, 0.0], [0.07, 0.03], [0.04, 0.06], [0.01, 0.12], [0, 0.12]], brass(0.3));
  lamp1.position.set(-0.55, 0.8, -0.3);
  props[1].add(lamp1);
  const flame1 = glow(new THREE.Color(1, 0.6, 0.25), 0.12, 3);
  flame1.position.set(-0.55, 0.95, -0.3);
  props[1].add(flame1);
  // Era 2: anatomy sheet, candle, telescope, inkwell and quill
  const anat = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.48), new THREE.MeshStandardMaterial({ map: T.anatomy(), roughness: 0.9 }));
  anat.rotation.set(-Math.PI / 2, 0, -0.3);
  anat.position.set(-0.55, 0.802, 0.25);
  props[2].add(anat);
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.2, 16), new THREE.MeshStandardMaterial({ color: 0xf0e6cc, roughness: 0.6 }));
  wax.position.set(0.6, 0.9, -0.25);
  props[2].add(wax);
  const holder = lathe([[0, 0], [0.07, 0], [0.07, 0.01], [0.02, 0.02], [0.03, 0.03], [0, 0.03]], brass());
  holder.position.set(0.6, 0.8, -0.25);
  props[2].add(holder);
  const flame2 = glow(new THREE.Color(1, 0.62, 0.3), 0.1, 3.5);
  flame2.position.set(0.6, 1.03, -0.25);
  props[2].add(flame2);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.7, 24), brass(0.25));
  tube.rotation.set(0, 0, -1.0);
  tube.position.set(0.62, 1.15, 0.2);
  props[2].add(tube);
  const ink = lathe([[0, 0], [0.04, 0], [0.045, 0.04], [0.015, 0.06], [0, 0.06]], new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.15 }));
  ink.position.set(-0.3, 0.8, 0.4);
  props[2].add(ink);
  // Era 3: blueprint, microscope, gas lamp
  const bp = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.42), new THREE.MeshStandardMaterial({ map: T.blueprint(), roughness: 0.85 }));
  bp.rotation.set(-Math.PI / 2, 0, 0.2);
  bp.position.set(-0.52, 0.802, 0.22);
  props[3].add(bp);
  const micro = new THREE.Group();
  const mb = brass(0.25);
  const mBase = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.16), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }));
  const mArm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.03), mb);
  mArm.position.set(0, 0.1, -0.05);
  const mTube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.18, 20), mb);
  mTube.position.set(0, 0.17, 0.0);
  mTube.rotation.x = 0.25;
  const mStage = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.008, 0.08), mb);
  mStage.position.y = 0.07;
  micro.add(mBase, mArm, mTube, mStage);
  micro.position.set(0.6, 0.8, 0.22);
  props[3].add(micro);
  const chim = lathe([[0.03, 0], [0.05, 0.06], [0.035, 0.16], [0.02, 0.22]], new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.05 }));
  chim.position.set(0.58, 0.8, -0.32);
  props[3].add(chim);
  const flame3 = glow(new THREE.Color(1, 0.8, 0.5), 0.14, 3);
  flame3.position.set(0.58, 0.9, -0.32);
  props[3].add(flame3);
  props.forEach((p) => p.traverse((c) => c.isMesh && (c.castShadow = c.receiveShadow = true)));

  applyEnv(scene, roomEnv(renderer), 0.35);
  // Walls and wood should not pick up the studio reflections
  for (const m of [wallMat, woodT]) m.envMapIntensity = 0.05;

  const flamePos = [flame0, flame1, flame2, flame3].map((f) => f.getWorldPosition(new THREE.Vector3()));

  // One continuous orbit across all four eras
  const camPos = ktrack([
    [7.0, [-0.75, 1.42, 2.05]],
    [9.2, [0.0, 1.36, 2.2]],
    [11.5, [0.78, 1.32, 2.0]],
  ]);
  const camTgt = ktrack([
    [7.0, [0.02, 1.2, 0.0]],
    [11.5, [-0.02, 1.15, 0.0]],
  ]);

  function update(t, era) {
    rigCamera(camera, camPos, camTgt, t);
    objs.forEach((o, i) => (o.visible = i === era));
    props.forEach((p, i) => (p.visible = i === era));
    patches.forEach((p, i) => (p.visible = i === era));
    const L = ERA_LIGHT[era];
    sun.color.copy(L);
    sun.intensity = [3.4, 3.0, 1.3, 2.8][era];
    fill.intensity = [0.35, 0.28, 0.14, 0.32][era];
    fill.color.copy(L).lerp(new THREE.Color(1, 1, 1), 0.4);
    wallMat.color.setHex(ERA_WALL[era]);
    scene.fog.color.setHex(ERA_FOG[era]);
    shaft.userData.mat.color.copy(L).multiplyScalar(era === 2 ? 0.6 : 1);
    shaft.userData.mat.opacity = 0.07;
    practical.position.copy(flamePos[era]);
    practical.intensity = [0.5, 0.9, 1.6, 1.0][era] * (1 + 0.08 * Math.sin(t * 19));
    practical.color.set(era === 3 ? 0xffd090 : 0xff9a50);

    const o = objs[era];
    const spinBoost = 1 + 4 * Math.max(ss(-0.25, 0, -(t - [7.02, 8.08, 9.16, 10.24][era])), 0);
    if (era === 0) o.userData.spin.rotation.y = t * 0.6;
    if (era === 1) {
      o.userData.rete.rotation.z = t * 0.5;
      o.userData.rule.rotation.z = -t * 0.8 + 0.6;
      o.rotation.y = Math.sin(t * 0.8) * 0.12;
    }
    if (era === 2) o.userData.sphere.rotation.y = t * 0.7;
    if (era === 3) {
      o.userData.gears.forEach(([g, sp]) => (g.rotation.z = t * 1.2 * sp));
      o.userData.needle.rotation.z = -0.8 + Math.sin(t * 2.3) * 0.3;
    }
    o.rotation.y = (era === 1 ? o.rotation.y : 0) + (spinBoost - 1) * 0.02;
    motes.material.uniforms.uTime.value = t;
  }

  return { scene, camera, update, grade: { exposure: 1.0, bloom: 0.45, vignette: 0.65 } };
}
