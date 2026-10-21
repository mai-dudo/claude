// Shot 1 (0:00-0:03): the book that should not exist.
import * as THREE from 'three';
import { Book, T, GOLD, makeSwarm, makeDustMotes, beam, setRepeat } from '../lib.js';
import { ss, eio, eIn, ktrack, rigCamera, lerp, clamp, pulse } from '../util.js';

export function createVault() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x030201, 0.55);
  const camera = new THREE.PerspectiveCamera(42, 1080 / 1920, 0.01, 30);

  // Chamber
  const st = T.stone(2, [104, 86, 66]);
  const wallMat = new THREE.MeshStandardMaterial({ map: setRepeat(st.map, 3, 2), bumpMap: setRepeat(st.bump, 3, 2), bumpScale: 3, roughness: 0.95 });
  const floorMat = new THREE.MeshStandardMaterial({ map: setRepeat(st.map, 4, 4), bumpMap: setRepeat(st.bump, 4, 4), bumpScale: 2, roughness: 0.9, color: 0x9a8a78 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), wallMat);
  back.position.set(0, 0.8, -1.5);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), wallMat);
  left.position.set(-1.6, 0.8, 0.2);
  left.rotation.y = Math.PI / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.9;
  back.receiveShadow = left.receiveShadow = floor.receiveShadow = true;
  scene.add(back, left, floor);

  const pedMat = new THREE.MeshStandardMaterial({ map: setRepeat(st.map, 1, 1), bumpMap: st.bump, bumpScale: 2.5, roughness: 0.85, color: 0xb8a890 });
  const ped = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.9), pedMat);
  ped.position.set(0.05, -0.45, 0);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.06, 1.0), pedMat);
  slab.position.set(0.05, -0.03, 0);
  ped.receiveShadow = slab.receiveShadow = true;
  ped.castShadow = slab.castShadow = true;
  scene.add(ped, slab);

  // Scattered scrolls on the slab corner
  const scrollMat = new THREE.MeshStandardMaterial({ map: T.parchment(6), roughness: 0.9 });
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.32, 16), scrollMat);
    s.rotation.z = Math.PI / 2;
    s.rotation.y = 0.3 + i * 0.15;
    s.position.set(-0.4 + i * 0.03, 0.022 + (i === 2 ? 0.04 : 0), 0.3 - i * 0.05);
    s.castShadow = s.receiveShadow = true;
    scene.add(s);
  }

  const book = new Book();
  book.group.position.set(0, 0, 0);
  scene.add(book.group);

  // Light
  const lamp = new THREE.PointLight(0xffa25a, 0, 5, 2);
  lamp.position.set(-0.55, 0.62, 0.5);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.002;
  lamp.shadow.radius = 4;
  scene.add(lamp);
  const glowLight = new THREE.PointLight(0xffb35e, 0, 2.5, 2);
  glowLight.position.set(0, 0.25, 0);
  scene.add(glowLight);
  const hemi = new THREE.HemisphereLight(0x405070, 0x100804, 0.0);
  scene.add(hemi);

  const shaft = beam(2.6, 0.7, new THREE.Color(1, 0.8, 0.55), 0.0);
  shaft.position.set(0.1, 2.5, -0.2);
  shaft.rotation.z = 0.2;
  scene.add(shaft);

  // Dust swept off the cover
  const sweep = makeSwarm(420, (i, r) => {
    const u = r();
    return {
      o: [u * 0.4, 0.075 + r() * 0.004, -0.28 + r() * 0.56],
      v: [0.12 + r() * 0.18, 0.04 + r() * 0.1, (r() - 0.5) * 0.06],
      t0: 0.28 + u * 0.55, life: 0.8 + r() * 0.8, size: 0.0012 + r() * 0.003,
      glyph: 63, freq: 2 + r() * 3, amp: 0.006, phase: r() * 6.28,
    };
  }, { color: new THREE.Color(1, 0.88, 0.7), intensity: 0.35, acc: -0.02 });
  scene.add(sweep);
  const motes = makeDustMotes(260, [-0.8, 0.8, -0.1, 1.0, -0.8, 0.6], { size: [0.0015, 0.004], intensity: 0.5, drift: 0.02 });
  scene.add(motes);

  // Glyphs rising out of the pages
  const glyphs = makeSwarm(750, (i, r) => {
    const side = r() < 0.5 ? -1 : 1;
    const x = side * (0.03 + r() * 0.35);
    return {
      o: [x, 0.05, -0.26 + r() * 0.52],
      v: [x * 0.25 + (r() - 0.5) * 0.05, 0.07 + r() * 0.16, (r() - 0.5) * 0.05],
      t0: 1.25 + Math.pow(r(), 1.3) * 1.5, life: 1.3 + r() * 1.3, size: 0.005 + Math.pow(r(), 2) * 0.013,
      glyph: Math.floor(r() * 62), freq: 1 + r() * 2.5, amp: 0.01 + r() * 0.04, phase: r() * 6.28, spin: (r() - 0.5) * 2,
    };
  }, { color: GOLD, intensity: 1.6, acc: 0.015, twinkle: 0.4 });
  scene.add(glyphs);

  // The floating sigil
  const sigMat = new THREE.MeshBasicMaterial({
    map: T.sigil(), color: GOLD.clone().multiplyScalar(2), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const sigil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sigMat);
  sigil.renderOrder = 20;
  scene.add(sigil);
  const sigGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: T.dot(), color: GOLD.clone().multiplyScalar(0.8), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  sigil.add(sigGlow);
  sigGlow.position.z = -0.01;
  sigGlow.scale.setScalar(2.2);

  const camPos = ktrack([
    [0.0, [0.42, 0.3, 0.42]],
    [0.9, [0.3, 0.42, 0.52]],
    [1.6, [0.02, 0.62, 0.66]],
    [2.2, [0.0, 0.55, 0.64]],
    [2.65, [0.0, 0.33, 0.33]],
    [3.25, [0.0, 0.27, 0.035]],
  ]);
  const camTgt = ktrack([
    [0.0, [0.18, 0.02, -0.02]],
    [0.9, [0.12, 0.03, -0.04]],
    [1.6, [0.0, 0.06, -0.06]],
    [2.2, [-0.03, 0.18, -0.02]],
    [2.65, [0.0, 0.25, 0.0]],
    [3.25, [0.0, 0.27, 0.0]],
  ]);

  const sigStart = new THREE.Vector3();
  const sigEnd = new THREE.Vector3(0.0, 0.27, -0.03);
  const qFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const qFace = new THREE.Quaternion();
  const tmp = new THREE.Object3D();

  function update(t) {
    const open = eio(ss(0.95, 1.6, t));
    const ink = ss(1.15, 1.9, t) * 0.9 * (1 + 0.12 * Math.sin(t * 9));
    const liftOff = ss(1.55, 2.25, t);
    book.set({
      open, fan: ss(1.15, 1.85, t), ink,
      sigil: ss(1.2, 1.6, t) * (1 - ss(1.6, 1.75, t)),
      dust: ss(0.25, 0.9, t),
    });

    const flick = 1 + 0.06 * Math.sin(t * 17.3) + 0.04 * Math.sin(t * 29.1 + 1);
    lamp.intensity = (ss(0.0, 0.55, t) * 1.5 + ss(0.9, 1.6, t) * 0.4) * flick;
    hemi.intensity = 0.05 + ss(0.2, 1.4, t) * 0.12;
    glowLight.intensity = ss(1.2, 2.0, t) * 0.35 + liftOff * 0.25;
    shaft.userData.mat.opacity = ss(0.3, 1.5, t) * 0.11;

    sweep.material.uniforms.uTime.value = t;
    motes.material.uniforms.uTime.value = t;
    glyphs.material.uniforms.uTime.value = t;

    rigCamera(camera, camPos, camTgt, t);
    camera.fov = lerp(42, 34, ss(2.3, 3.25, t));
    camera.updateProjectionMatrix();

    // Sigil lifts off the page, turns to face us and grows.
    book.group.updateMatrixWorld();
    sigStart.copy(book.sigilLocal).applyMatrix4(book.group.matrixWorld);
    const k = eio(liftOff);
    sigil.position.lerpVectors(sigStart, sigEnd, k);
    tmp.position.copy(sigil.position);
    tmp.lookAt(camera.position);
    qFace.copy(tmp.quaternion);
    sigil.quaternion.slerpQuaternions(qFlat, qFace, eio(ss(1.6, 2.2, t)));
    const s0 = (0.3 * 0.4) / 0.42;
    sigil.scale.setScalar(s0 * lerp(1, 1.5, k) * (1 + 0.04 * Math.sin(t * 5)));
    sigil.rotateZ(t * 0.35 * liftOff);
    sigMat.opacity = ss(1.5, 1.62, t);
    sigMat.color.copy(GOLD).multiplyScalar(1.6 + 1.2 * ss(2.4, 3.2, t));
    sigGlow.material.opacity = ss(1.6, 2.2, t) * 0.25;
  }

  return { scene, camera, update, grade: { exposure: 1.0, bloom: 0.5 } };
}
