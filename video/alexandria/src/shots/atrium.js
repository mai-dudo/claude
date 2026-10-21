// Shots 6b (0:24-0:26) and 7b (0:27.6-0:30): inside the Great Library of
// the future. The ancient manuscript rests at the centre of the atrium; at
// the end its symbol lights up and the camera falls into it, closing the loop.
import * as THREE from 'three';
import { Book, T, GOLD, TURQ, beam, glow, makeSwarm, makeDustMotes, roomEnv, applyEnv, setRepeat } from '../lib.js';
import { ss, eio, eIn, ktrack, lerp, mulberry32, makeCanvas, tex } from '../util.js';
import { floorPattern } from './table.js';

function domeTexture() {
  const W = 2048, H = 1024;
  const [c, ctx] = makeCanvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#02040c');
  g.addColorStop(1, '#0a1630');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const r = mulberry32(99);
  for (let i = 0; i < 1400; i++) {
    const s = r() < 0.05 ? 3 : 1.5;
    ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
    ctx.fillRect(r() * W, r() * H * 0.9, s, s);
  }
  ctx.strokeStyle = 'rgba(230,180,90,1)';
  ctx.lineWidth = 6;
  for (let i = 0; i < 24; i++) {
    ctx.beginPath();
    ctx.moveTo((i / 24) * W, 0);
    ctx.lineTo((i / 24) * W, H);
    ctx.stroke();
  }
  for (let j = 1; j < 6; j++) {
    ctx.beginPath();
    ctx.moveTo(0, (j / 6) * H);
    ctx.lineTo(W, (j / 6) * H);
    ctx.stroke();
  }
  return tex(c);
}

export function createAtrium(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020308);
  scene.fog = new THREE.FogExp2(0x0c1224, 0.012);
  const camera = new THREE.PerspectiveCamera(48, 1080 / 1920, 0.02, 300);

  const R_IN = 14, R_OUT = 22, TIERS = 6, TIER_H = 6.5;
  const topY = TIERS * TIER_H + 2;

  // Floor with glowing pattern
  const pattern = floorPattern();
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R_OUT, 96), new THREE.MeshStandardMaterial({
    color: 0x101418, metalness: 0.5, roughness: 0.14, emissive: new THREE.Color(1, 0.72, 0.4), emissiveMap: pattern, emissiveIntensity: 0.15,
  }));
  pattern.repeat.set(R_OUT / 9, R_OUT / 9);
  pattern.offset.set(0.5 - R_OUT / 18, 0.5 - R_OUT / 18);
  pattern.wrapS = pattern.wrapT = THREE.ClampToEdgeWrapping;
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Tiers of balconies with shelves of books behind
  const sp = T.spines();
  const shelfMat = new THREE.MeshStandardMaterial({ map: setRepeat(sp.map, 10, 1), emissiveMap: setRepeat(sp.emissiveMap, 10, 1), emissive: new THREE.Color(1, 0.75, 0.45), emissiveIntensity: 1.4, roughness: 0.8, side: THREE.BackSide });
  const slabMat = new THREE.MeshStandardMaterial({ color: 0xd8ccb8, map: setRepeat(T.marble(), 6, 1), roughness: 0.35 });
  const glassRail = new THREE.MeshStandardMaterial({ color: 0x9fd8e0, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.18 });
  const colMat = new THREE.MeshStandardMaterial({ color: 0xe9dcc6, roughness: 0.4 });
  const goldM = new THREE.MeshStandardMaterial({ color: 0xe0b050, metalness: 1, roughness: 0.25 });
  for (let k = 0; k < TIERS; k++) {
    const y = k * TIER_H;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R_OUT, R_OUT, TIER_H, 96, 1, true), shelfMat);
    wall.position.y = y + TIER_H / 2 + 0.6;
    scene.add(wall);
    if (k === 0) continue;
    const prof = [[R_IN, -0.35], [R_OUT, -0.35], [R_OUT, 0.35], [R_IN, 0.35], [R_IN, -0.35]].map(([x, yy]) => new THREE.Vector2(x, yy));
    const slab = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), slabMat);
    slab.position.y = y;
    slab.receiveShadow = slab.castShadow = true;
    scene.add(slab);
    const strip = new THREE.Mesh(new THREE.TorusGeometry(R_IN - 0.02, 0.07, 6, 160), new THREE.MeshBasicMaterial({ color: (k % 2 ? TURQ : GOLD).clone().multiplyScalar(2.6), toneMapped: false }));
    strip.rotation.x = Math.PI / 2;
    strip.position.y = y - 0.3;
    scene.add(strip);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(R_IN + 0.2, R_IN + 0.2, 1.1, 96, 1, true), glassRail);
    rail.position.y = y + 0.9;
    scene.add(rail);
    const top = new THREE.Mesh(new THREE.TorusGeometry(R_IN + 0.2, 0.05, 6, 160), goldM);
    top.rotation.x = Math.PI / 2;
    top.position.y = y + 1.45;
    scene.add(top);
  }
  const cols = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.32, 1, 16).translate(0, 0.5, 0), colMat, 24 * TIERS);
  {
    const m4 = new THREE.Matrix4();
    let i = 0;
    for (let k = 0; k < TIERS; k++) for (let j = 0; j < 24; j++) {
      const a = (j / 24) * Math.PI * 2;
      m4.makeScale(1, TIER_H - 0.7, 1).setPosition(Math.cos(a) * (R_IN + 0.6), k * TIER_H + 0.35, Math.sin(a) * (R_IN + 0.6));
      cols.setMatrixAt(i++, m4);
    }
  }
  cols.castShadow = true;
  scene.add(cols);

  // Glass dome with the night sky
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R_OUT, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: domeTexture(), side: THREE.BackSide, color: new THREE.Color(1, 1, 1).multiplyScalar(0.9) }));
  dome.position.y = topY;
  scene.add(dome);
  const oculus = glow(new THREE.Color(1, 0.85, 0.6), 9, 1.2);
  oculus.position.set(0, topY + R_OUT - 0.5, 0);
  scene.add(oculus);

  // Pedestal and the manuscript
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 1.05, 64), new THREE.MeshStandardMaterial({ color: 0x1c2228, metalness: 0.7, roughness: 0.25 }));
  ped.position.y = 0.525;
  ped.castShadow = ped.receiveShadow = true;
  scene.add(ped);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.025, 8, 96), goldM);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.05;
  scene.add(rim);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.18, 96), new THREE.MeshStandardMaterial({ color: 0x2a2620, metalness: 0.4, roughness: 0.3 }));
  base.position.y = 0.09;
  base.receiveShadow = true;
  scene.add(base);
  const book = new Book();
  book.group.position.set(0, 1.05, 0);
  scene.add(book.group);

  // Holographic rings around the pedestal
  const holo = [1.2, 1.55, 1.9].map((r, i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 6, 160), new THREE.MeshBasicMaterial({
      color: (i % 2 ? TURQ : GOLD).clone().multiplyScalar(3), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    m.position.y = 1.5 + i * 0.45;
    scene.add(m);
    return m;
  });

  // Light from the oculus
  const spot = new THREE.SpotLight(0xffd9a8, 900, 60, 0.13, 0.5, 2);
  spot.position.set(0, topY + 18, 0);
  spot.target.position.set(0, 1, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.bias = -0.0003;
  scene.add(spot, spot.target);
  const shaft = beam(topY + 18, 3.2, new THREE.Color(1, 0.85, 0.62), 1);
  shaft.position.set(0, topY + 18, 0);
  shaft.userData.mat.opacity = 0.12;
  scene.add(shaft);
  const hemi = new THREE.HemisphereLight(0x6a88c0, 0x2a1a0c, 0.9);
  scene.add(hemi);
  const fillWarm = new THREE.PointLight(0xffb070, 160, 40, 2);
  fillWarm.position.set(0, 10, 0);
  scene.add(fillWarm);
  const motes = makeDustMotes(900, [-1.6, 1.6, 0.8, 22, -1.6, 1.6], { size: [0.008, 0.02], intensity: 1.3, drift: 0.05 });
  scene.add(motes);
  const glyphs = makeSwarm(260, (i, r) => {
    const a = r() * Math.PI * 2, d = 0.3 + r() * 1.4;
    return {
      o: [Math.cos(a) * d, 1.2, Math.sin(a) * d], v: [0, 0.35 + r() * 0.5, 0],
      t0: 23.5 + r() * 7, life: 3 + r() * 3, size: 0.03 + r() * 0.04, glyph: Math.floor(r() * 62),
      freq: 0.6 + r(), amp: 0.25, phase: r() * 6.28, spin: (r() - 0.5),
    };
  }, { color: GOLD, intensity: 1.6, twinkle: 0.4 });
  scene.add(glyphs);

  applyEnv(scene, roomEnv(renderer), 0.25);

  const atriumPos = ktrack([
    [24.0, [0.8, 8.5, 9.5]],
    [25.3, [0.8, 5.4, 7.0]],
    [26.5, [0.4, 3.2, 4.4]],
  ]);
  const atriumTgt = ktrack([
    [24.0, [0, 15, -14]],
    [25.3, [0, 4.5, -6]],
    [26.5, [0, 1.4, 0]],
  ]);
  const sigWorld = new THREE.Vector3();
  const up = new THREE.Vector3();

  function update(t, mode) {
    const final = mode === 'final';
    let ink = 0.25, sig = 0;
    if (!final) {
      const p = atriumPos(t), q = atriumTgt(t);
      camera.position.set(...p);
      camera.up.set(0, 1, 0);
      camera.lookAt(...q);
      camera.fov = 48;
    } else {
      // Close on the book, the symbol lights up, then we fall into it.
      book.group.updateMatrixWorld();
      sigWorld.copy(book.sigilLocal).applyMatrix4(book.group.matrixWorld);
      const k1 = eio(ss(27.65, 28.6, t));
      const k2 = eIn(ss(28.55, 29.85, t));
      const start = new THREE.Vector3(0.35, 2.6, 2.4);
      const mid = new THREE.Vector3(sigWorld.x + 0.05, 1.9, sigWorld.z + 0.75);
      const end = new THREE.Vector3(sigWorld.x, sigWorld.y + 0.035, sigWorld.z + 0.0005);
      const pos = start.clone().lerp(mid, k1).lerp(end, k2);
      camera.position.copy(pos);
      const tgt = new THREE.Vector3(0, 1.1, 0).lerp(sigWorld, ss(27.65, 28.4, t));
      up.set(0, 1, 0).lerp(new THREE.Vector3(0, 0, -1), ss(28.6, 29.4, t)).normalize();
      camera.up.copy(up);
      camera.lookAt(tgt);
      camera.fov = lerp(40, 34, k1);
      ink = 0.3 + 0.3 * ss(27.9, 28.5, t) - 0.4 * ss(29.0, 29.7, t);
      sig = ss(27.95, 28.5, t) * (1 + 0.6 * ss(29.0, 29.8, t));
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    book.set({ open: 1, fan: 1, ink, sig, sigil: Math.min(1, sig), dust: 1 });
    book.sigilMat.color.copy(GOLD).multiplyScalar(1.4 + 0.8 * Math.max(0, sig - 0.5));
    holo.forEach((m, i) => {
      m.rotation.set(Math.PI / 2 + Math.sin(t * 0.4 + i) * 0.25, Math.cos(t * 0.3 + i * 2) * 0.25, t * 0.2 * (i % 2 ? -1 : 1));
    });
    motes.material.uniforms.uTime.value = t;
    glyphs.material.uniforms.uTime.value = t;
  }

  return { scene, camera, update, grade: { exposure: 1.0, bloom: 0.55, vignette: 0.6 } };
}
