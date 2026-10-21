// Shot 4 (0:11-0:16): the moment history changes. The manuscript lands on a
// round table, its geometry lines up with an inlaid mechanism, and the stone
// hall dissolves into a glass-and-metal laboratory full of sunlight.
import * as THREE from 'three';
import { Book, T, GOLD, TURQ, beam, glow, lineMat, lines, seg, roomEnv, applyEnv, makeDustMotes, setRepeat, brass } from '../lib.js';
import { ss, eio, eOut, ktrack, lerp, clamp, pulse, makeCanvas, tex } from '../util.js';

const NOISE = /* glsl */ `
float h3(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p){ return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.1) + 0.15 * vnoise(p * 4.3); }
`;

// Noise dissolve with a glowing edge. sign = 1: material burns away as
// uDis goes 0 -> 1. sign = -1: material grows in.
function dissolve(mat, U, sign, edgeColor) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDis = U;
    sh.uniforms.uEdge = { value: edgeColor };
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `uniform float uDis; uniform vec3 uEdge; varying vec3 vWP;\n${NOISE}\n` + sh.fragmentShader
      .replace('void main() {', `void main() {
        float n = fbm3(vWP * 1.6) * 0.8 + clamp(vWP.y / 9.0, 0.0, 1.0) * 0.3;
        float th = uDis * 1.25 - 0.1;
        float edge;
        ${sign > 0 ? 'if (n < th) discard; edge = 1.0 - smoothstep(th, th + 0.06, n);' : 'if (n > th) discard; edge = smoothstep(th - 0.06, th, n);'}
      `)
      .replace('#include <dithering_fragment>', 'gl_FragColor.rgb += uEdge * edge * step(0.001, uDis) * step(uDis, 0.999);\n#include <dithering_fragment>');
  };
  mat.customProgramCacheKey = () => 'dis' + sign;
  return mat;
}

export function floorPattern() {
  const S = 2048, c0 = S / 2;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#fff';
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 6;
  const circ = (r, w) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(c0, c0, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  [180, 260, 420, 600, 760, 940].forEach((r, i) => circ(r, i % 2 ? 3 : 6));
  const star = (R, n, step, w) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = ((i * step) / n) * Math.PI * 2 - Math.PI / 2;
      const x = c0 + Math.cos(a) * R, y = c0 + Math.sin(a) * R;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  };
  star(600, 16, 5, 4);
  star(420, 8, 3, 4);
  star(940, 24, 7, 3);
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(c0 + Math.cos(a) * 760, c0 + Math.sin(a) * 760);
    ctx.lineTo(c0 + Math.cos(a) * 940, c0 + Math.sin(a) * 940);
    ctx.stroke();
  }
  return tex(c);
}

function skyGradient() {
  const [c, ctx] = makeCanvas(64, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#5f8fc4');
  g.addColorStop(0.45, '#a9c8e6');
  g.addColorStop(0.62, '#f3d9b0');
  g.addColorStop(1, '#c79a6a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 512);
  return tex(c);
}

export function createTable(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070504);
  scene.fog = new THREE.FogExp2(0xc8d4dc, 0);
  const camera = new THREE.PerspectiveCamera(45, 1080 / 1920, 0.05, 120);
  const disU = { value: 0 };

  // Sky dome visible once the walls are gone
  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), new THREE.MeshBasicMaterial({ map: skyGradient(), side: THREE.BackSide, fog: false, color: new THREE.Color(1, 1, 1).multiplyScalar(0.95), transparent: true, opacity: 0, depthWrite: false }));
  scene.add(sky);

  // Floors: stone over a glass floor with a glowing star pattern
  const st = T.stone(5, [150, 130, 104]);
  const stoneFloorMat = dissolve(new THREE.MeshStandardMaterial({ map: setRepeat(st.map, 5, 5), bumpMap: setRepeat(st.bump, 5, 5), bumpScale: 2, roughness: 0.85 }), disU, 1, new THREE.Color(1, 0.7, 0.35).multiplyScalar(6));
  const stoneFloor = new THREE.Mesh(new THREE.CircleGeometry(16, 64), stoneFloorMat);
  stoneFloor.rotation.x = -Math.PI / 2;
  stoneFloor.position.y = 0.002;
  stoneFloor.receiveShadow = true;
  scene.add(stoneFloor);
  const pattern = floorPattern();
  const glassFloorMat = new THREE.MeshStandardMaterial({ color: 0x0c1a24, metalness: 0.6, roughness: 0.12, emissive: new THREE.Color(0.4, 0.95, 0.9), emissiveMap: pattern, emissiveIntensity: 0 });
  const glassFloor = new THREE.Mesh(new THREE.CircleGeometry(16, 64), glassFloorMat);
  glassFloor.rotation.x = -Math.PI / 2;
  glassFloor.receiveShadow = true;
  // The pattern spans radius 7.5 around the table
  pattern.repeat.set(16 / 7.5, 16 / 7.5);
  pattern.offset.set(0.5 - 8 / 7.5, 0.5 - 8 / 7.5);
  pattern.wrapS = pattern.wrapT = THREE.ClampToEdgeWrapping;
  scene.add(glassFloor);

  // Ring of stone pillars and wall, dissolving
  const wallMat = dissolve(new THREE.MeshStandardMaterial({ map: setRepeat(st.map, 8, 2), bumpMap: setRepeat(st.bump, 8, 2), bumpScale: 2, roughness: 0.9, side: THREE.BackSide, color: 0xcbb89c }), disU, 1, new THREE.Color(1, 0.7, 0.35).multiplyScalar(6));
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 12, 64, 1, true), wallMat);
  wall.position.y = 6;
  scene.add(wall);
  const pillarMat = dissolve(new THREE.MeshStandardMaterial({ map: setRepeat(T.marble(), 1, 3), roughness: 0.4, color: 0xe8dcc8 }), disU, 1, new THREE.Color(1, 0.7, 0.35).multiplyScalar(6));
  // New architecture: steel ribs and glass, growing in
  const steelMat = dissolve(new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 1, roughness: 0.22 }), disU, -1, new THREE.Color(0.4, 1, 0.95).multiplyScalar(6));
  const glassMat = dissolve(new THREE.MeshStandardMaterial({ color: 0x5a8ea4, metalness: 0.9, roughness: 0.04, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }), disU, -1, new THREE.Color(0.4, 1, 0.95).multiplyScalar(4));
  const goldTrim = dissolve(new THREE.MeshStandardMaterial({ color: 0xe0b050, metalness: 1, roughness: 0.25 }), disU, -1, new THREE.Color(1, 0.8, 0.4).multiplyScalar(6));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 7, 24), pillarMat);
    p.position.set(Math.cos(a) * 6.4, 3.5, Math.sin(a) * 6.4);
    p.castShadow = true;
    scene.add(p);
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.16, 9, 0.3), steelMat);
    rib.position.set(Math.cos(a) * 7.2, 4.5, Math.sin(a) * 7.2);
    rib.rotation.y = -a;
    scene.add(rib);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 9), glassMat);
    const b = a + Math.PI / 16;
    pane.position.set(Math.cos(b) * 7.15, 4.5, Math.sin(b) * 7.15);
    pane.rotation.y = -b - Math.PI / 2;
    scene.add(pane);
  }
  // Lab consoles growing in around the table
  const consoleMat = dissolve(new THREE.MeshStandardMaterial({ color: 0x1c252c, metalness: 0.8, roughness: 0.3 }), disU, -1, new THREE.Color(0.4, 1, 0.95).multiplyScalar(5));
  const stripMat = dissolve(new THREE.MeshBasicMaterial({ color: TURQ.clone().multiplyScalar(3), toneMapped: false }), disU, -1, new THREE.Color(0.4, 1, 0.95).multiplyScalar(5));
  const screenMat = dissolve(new THREE.MeshStandardMaterial({ color: 0x050a10, emissive: new THREE.Color(0.5, 0.9, 1.0), emissiveMap: T.blueprint(), emissiveIntensity: 1.2, roughness: 0.2 }), disU, -1, new THREE.Color(0.4, 1, 0.95).multiplyScalar(5));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const g = new THREE.Group();
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 0.55), consoleMat);
    desk.position.y = 0.425;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.025, 0.57), stripMat);
    strip.position.y = 0.86;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.7), screenMat);
    screen.position.set(0, 1.3, 0.12);
    screen.rotation.x = -0.25;
    g.add(desk, strip, screen);
    g.position.set(Math.cos(a) * 3.9, 0, Math.sin(a) * 3.9);
    g.lookAt(0, 0, 0);
    scene.add(g);
  }
  const lintel = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.12, 8, 96), goldTrim);
  lintel.rotation.x = Math.PI / 2;
  lintel.position.y = 9;
  scene.add(lintel);
  const ringBeam = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.25, 8, 96), pillarMat);
  ringBeam.rotation.x = Math.PI / 2;
  ringBeam.position.y = 7.1;
  scene.add(ringBeam);

  // The table
  const tableMat = new THREE.MeshStandardMaterial({ map: setRepeat(T.marble(), 2, 2), roughness: 0.18, color: 0x3a4a44 });
  const table = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.12, 96), tableMat);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.03, 10, 128), new THREE.MeshStandardMaterial({ color: 0xe0b050, metalness: 1, roughness: 0.25 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.91;
  scene.add(rim);
  table.position.y = 0.85;
  table.castShadow = table.receiveShadow = true;
  scene.add(table);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 0.8, 48), tableMat);
  foot.position.y = 0.4;
  scene.add(foot);
  const TOP = 0.91;

  // Inlaid brass rings with ticks
  const ringMat = brass(0.28);
  const rings = [0.64, 0.82, 1.0, 1.18].map((R, i) => {
    const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.RingGeometry(R - 0.035, R + 0.035, 160), ringMat);
    band.rotation.x = -Math.PI / 2;
    g.add(band);
    const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.008, 0.012, 0.05), ringMat, 72);
    const m4 = new THREE.Matrix4();
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2;
      m4.makeRotationY(-a).setPosition(Math.cos(a) * R, 0.006, Math.sin(a) * R);
      ticks.setMatrixAt(k, m4);
    }
    g.add(ticks);
    // Eight notches that align with the drawing
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const n = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.025), goldMatPlain());
      n.position.set(Math.cos(a) * R, 0.01, Math.sin(a) * R);
      n.rotation.y = -a;
      g.add(n);
    }
    g.position.y = TOP + 0.002;
    scene.add(g);
    const light = new THREE.Mesh(new THREE.TorusGeometry(R, 0.012, 8, 160), new THREE.MeshBasicMaterial({
      color: (i % 2 ? TURQ : GOLD).clone().multiplyScalar(4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    light.rotation.x = Math.PI / 2;
    scene.add(light);
    return { g, R, light, band };
  });
  function goldMatPlain() {
    return new THREE.MeshStandardMaterial({ color: 0xf0c060, metalness: 1, roughness: 0.2, emissive: new THREE.Color(1, 0.7, 0.3), emissiveIntensity: 0 });
  }

  // Radial construction lines out of the manuscript
  const radial = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    seg.line(radial, [Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42], [Math.cos(a) * 1.28, 0, Math.sin(a) * 1.28]);
  }
  const radMat = lineMat(GOLD.clone().multiplyScalar(3), 3, 1);
  radMat.dashed = true;
  radMat.dashSize = 1;
  radMat.gapSize = 1;
  const radLines = lines(radial, radMat);
  radLines.position.y = TOP + 0.01;
  scene.add(radLines);

  const book = new Book();
  book.group.scale.setScalar(1.1);
  scene.add(book.group);

  // Light
  const hemi = new THREE.HemisphereLight(0xffe8cc, 0x1a1008, 0.1);
  scene.add(hemi);
  const spot = new THREE.SpotLight(0xffc890, 22, 14, 0.5, 0.6, 1.5);
  spot.position.set(-1.2, 7.5, 1.0);
  spot.target.position.set(0, 0.9, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.bias = -0.0004;
  scene.add(spot, spot.target);
  const sun = new THREE.DirectionalLight(0xfff0dc, 0);
  sun.position.set(-8, 10, 5);
  sun.target.position.set(0, 0.9, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);
  const shafts = [];
  for (let i = 0; i < 4; i++) {
    const b = beam(14, 1.6, new THREE.Color(1, 0.92, 0.78), 1);
    b.position.set(-7 + i * 0.4, 9.5, 4 - i * 2.6);
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(8, -10, -5).normalize());
    b.userData.mat.opacity = 0;
    scene.add(b);
    shafts.push(b);
  }
  const motes = makeDustMotes(600, [-3, 3, 0.9, 5, -3, 3], { size: [0.006, 0.016], intensity: 1, drift: 0.06 });
  scene.add(motes);
  const core = glow(new THREE.Color(1, 0.8, 0.5), 1.6, 0);
  core.position.set(0, TOP + 0.4, 0);
  scene.add(core);

  applyEnv(scene, roomEnv(renderer), 0.4);
  for (const m of [stoneFloorMat, wallMat]) m.envMapIntensity = 0.05;
  glassMat.envMapIntensity = 0.25;
  tableMat.envMapIntensity = 0.3;

  const camPos = ktrack([
    [11.15, [0.0, 4.6, 0.02]],
    [12.6, [0.05, 3.9, 0.1]],
    [13.4, [0.1, 3.5, 0.6]],
    [14.6, [0.0, 2.5, 3.1]],
    [16.35, [0.0, 1.9, 4.2]],
  ]);
  const camTgt = ktrack([
    [11.15, [0.0, 0.9, 0.0]],
    [13.4, [0.0, 0.9, -0.05]],
    [14.6, [0.0, 1.5, 0.0]],
    [16.35, [0.0, 2.6, 0.0]],
  ]);
  const up = new THREE.Vector3();

  function update(t) {
    // Camera: straight down at first (up vector points away), then tilting
    const p = camPos(t), q = camTgt(t);
    camera.position.set(...p);
    const tilt = ss(12.8, 14.4, t);
    up.set(0, 0, -1).lerp(new THREE.Vector3(0, 1, 0), tilt).normalize();
    camera.up.copy(up);
    camera.lookAt(...q);
    camera.updateMatrixWorld();

    // The manuscript is set down
    const land = eOut(ss(11.15, 11.85, t));
    book.group.position.set(0, lerp(1.7, TOP, land), 0);
    book.group.rotation.y = lerp(0.35, 0, land);
    book.set({ open: 1, fan: 1, ink: ss(12.0, 12.5, t) * 0.8, sigil: ss(12.1, 12.6, t) * 0.9, dust: 1 });

    // Lines reach out, rings turn into alignment at 13.0, then lift as light
    radMat.dashSize = 2 * ss(12.0, 12.8, t) + 0.001;
    radMat.gapSize = 2 - radMat.dashSize + 0.001;
    radMat.opacity = ss(12.0, 12.2, t) * (1 - ss(14.6, 15.2, t));
    const align = pulse(t, 13.0, 0.18);
    const lift = eio(ss(13.6, 15.6, t));
    const blast = ss(15.55, 16.3, t);
    rings.forEach((r, i) => {
      const dir = i % 2 ? -1 : 1;
      const a = t < 13 ? dir * (13 - t) * (0.9 + i * 0.25) : dir * (t - 13) * 0.35 * (1 + lift * 2);
      r.g.rotation.y = a;
      r.g.children.slice(2).forEach((n) => (n.material.emissiveIntensity = align * 4));
      r.g.visible = lift < 0.999;
      const y = TOP + 0.002 + lift * (0.35 + i * 0.28);
      r.g.position.y = y;
      r.light.position.y = y;
      r.light.rotation.set(Math.PI / 2 + lift * Math.sin(i * 1.7 + t * 0.6) * 0.35, lift * Math.cos(i * 2.3 + t * 0.5) * 0.35, 0);
      const s = 1 + Math.pow(blast, 2) * (4 + i * 1.5);
      r.light.scale.setScalar(s);
      r.light.material.opacity = Math.max(align * 0.8, ss(13.5, 14.2, t)) * (1 - ss(16.0, 16.3, t) * 0.5);
    });

    // The hall transforms
    disU.value = ss(13.3, 15.3, t);
    const dis = disU.value;
    glassFloorMat.emissiveIntensity = ss(13.6, 14.8, t) * 1.6 + pulse(t, 14.5, 0.15) * 2;
    sky.material.opacity = ss(13.4, 14.6, t) * 0.75;
    hemi.intensity = 0.12 + dis * 0.4;
    spot.intensity = 22 * (1 - dis * 0.7) * ss(11.1, 11.5, t);
    sun.intensity = dis * 2.4;
    shafts.forEach((b) => (b.userData.mat.opacity = dis * 0.035));
    core.material.color.setRGB(1, 0.8, 0.5).multiplyScalar(align * 0.5 + pulse(t, 14.5, 0.2) * 0.6 + blast * 2);
    scene.background.setRGB(0.027, 0.02, 0.016).lerp(new THREE.Color(0.3, 0.4, 0.5), dis);
    scene.fog.density = 0.008 * dis;
    motes.material.uniforms.uTime.value = t;
  }

  return {
    scene, camera, update,
    grade: { exposure: (t) => 0.95 + pulse(t, 14.5, 0.12) * 0.1, bloom: (t) => 0.45 + pulse(t, 13.0, 0.2) * 0.15 + pulse(t, 14.5, 0.15) * 0.2, vignette: 0.55 },
  };
}
