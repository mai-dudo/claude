import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { drawOverlay } from './overlay.js';
import { SCHEDULE, FACTORIES } from './schedule.js';
import { ss, clamp, lerp } from './util.js';
import { W, H } from './lib.js';

const params = new URLSearchParams(location.search);
const only = params.get('shots') ? params.get('shots').split(',') : null;

const canvas = document.getElementById('gl');
const ov = document.getElementById('ov').getContext('2d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const rtOpts = { type: THREE.HalfFloatType, samples: +(params.get('msaa') ?? 4) };
const rtA = new THREE.WebGLRenderTarget(W, H, rtOpts);
const rtB = new THREE.WebGLRenderTarget(W, H, rtOpts);

const MixShader = {
  uniforms: {
    tDiffuse: { value: null }, tA: { value: null }, tB: { value: null },
    uMix: { value: 0 }, uMode: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uFlash: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tA, tB; uniform float uMix; uniform int uMode; uniform vec2 uCenter; uniform float uFlash;
    varying vec2 vUv;
    void main(){
      vec3 a = texture2D(tA, vUv).rgb;
      vec3 b = texture2D(tB, vUv).rgb;
      vec3 c;
      float m = uMix;
      if (uMode == 1) {
        // Wave of golden light expanding from the centre
        vec2 d = (vUv - uCenter) * vec2(1080.0 / 1920.0, 1.0);
        float r = length(d);
        float R = m * 1.25;
        float inside = smoothstep(R, R - 0.12, r);
        c = mix(a, b, inside);
        float ring = exp(-pow((r - R) / 0.05, 2.0));
        c += vec3(1.0, 0.72, 0.38) * ring * 5.0 * (1.0 - m);
        c += vec3(1.0, 0.75, 0.45) * (1.0 - smoothstep(0.0, 0.5, m)) * 1.2;
      } else if (uMode == 2) {
        // Dip through black
        float k = m < 0.5 ? 1.0 - m * 2.0 : (m - 0.5) * 2.0;
        c = (m < 0.5 ? a : b) * k * k;
      } else if (uMode == 3) {
        // White-gold flash
        c = mix(a, b, smoothstep(0.35, 0.65, m));
        c += vec3(1.0, 0.82, 0.6) * pow(1.0 - abs(m * 2.0 - 1.0), 2.0) * 2.2;
      } else if (uMode == 4) {
        // Whip: slight push with a luminous seam
        vec2 d = vUv - 0.5;
        vec3 a2 = texture2D(tA, 0.5 + d * (1.0 - 0.08 * m)).rgb;
        vec3 b2 = texture2D(tB, 0.5 + d * (1.0 + 0.08 * (1.0 - m))).rgb;
        c = mix(a2, b2, smoothstep(0.0, 1.0, m));
        c += vec3(1.0, 0.8, 0.55) * pow(1.0 - abs(m * 2.0 - 1.0), 2.0) * 0.12;
      } else {
        c = mix(a, b, m);
      }
      c += vec3(1.0, 0.8, 0.55) * uFlash;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uExposure: { value: 1 }, uTime: { value: 0 }, uFade: { value: 0 },
    uVignette: { value: 0.55 }, uGrain: { value: 0.045 }, uCA: { value: 0.012 }, uSat: { value: 1.05 },
    uContrast: { value: 1.06 }, uWarm: { value: 0.0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uExposure, uTime, uFade, uVignette, uGrain, uCA, uSat, uContrast, uWarm;
    varying vec2 vUv;
    vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 color){
      const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      color *= 1.0 / 0.6; color = I * color; color = RRTAndODTFit(color); color = O * color; return clamp(color, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec2 dc = vUv - 0.5;
      float ca = uCA * dot(dc, dc);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - dc * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + dc * ca).b;
      col = aces(col * uExposure);
      col = toSRGB(col);
      // Teal shadows, warm highlights
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col += (vec3(-0.012, 0.004, 0.018) * (1.0 - l) + vec3(0.02, 0.008, -0.018) * l) * (1.0 + uWarm);
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      float v = smoothstep(1.05, 0.25, length(dc * vec2(0.9, 1.0)));
      col *= mix(1.0, v, uVignette);
      float g = h(vUv * vec2(1080.0, 1920.0) + fract(uTime * 7.13) * 917.0) - 0.5;
      col += g * uGrain * (1.0 - 0.6 * l);
      col *= 1.0 - uFade;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType }));
composer.setPixelRatio(1);
composer.setSize(W, H);
const mixPass = new ShaderPass(MixShader);
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.5, 1.1);
const grade = new ShaderPass(GradeShader);
const ovTex = new THREE.CanvasTexture(document.getElementById('ov'));
ovTex.colorSpace = THREE.NoColorSpace;
ovTex.premultiplyAlpha = true;
const overlayPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, tOv: { value: ovTex } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse, tOv; varying vec2 vUv;
    void main(){ vec4 b = texture2D(tDiffuse, vUv); vec4 o = texture2D(tOv, vUv); gl_FragColor = vec4(o.rgb + b.rgb * (1.0 - o.a), 1.0); }`,
});
overlayPass.uniforms.tOv.value = ovTex;
composer.addPass(mixPass);
composer.addPass(bloom);
composer.addPass(grade);
composer.addPass(overlayPass);
// The overlay is composited in GL now; hide the DOM copy.
document.getElementById('ov').style.display = 'none';

const MODES = { fade: 0, wave: 1, dip: 2, flash: 3, whip: 4 };

let timeline = { vo: [] };
const shots = {};

async function init() {
  await Promise.all([
    document.fonts.load('800 80px "Playfair Display"', 'АБВ'),
    document.fonts.load('700 80px "Playfair Display"', 'АБВ'),
    document.fonts.load('700 54px Inter', 'АБВ'),
  ]);
  try {
    const r = await fetch('../build/timeline.json', { cache: 'no-store' });
    if (r.ok) timeline = await r.json();
  } catch (e) { /* subtitles optional */ }
  const needed = new Set(SCHEDULE.map((s) => s.shot).filter((s) => !only || only.includes(s)));
  for (const name of needed) {
    const t0 = performance.now();
    shots[name] = await FACTORIES[name](renderer);
    console.log(`shot ${name} ready in ${(performance.now() - t0).toFixed(0)} ms`);
  }
  return true;
}

function active(t) {
  const list = SCHEDULE.filter((s) => t >= s.t0 && t < s.t1 && shots[s.shot]);
  if (list.length === 0) return [];
  if (list.length === 1) return [{ e: list[0], w: 1 }];
  const a = list[list.length - 2], b = list[list.length - 1];
  const m = clamp((t - b.t0) / (b.in?.dur ?? 0.3));
  if (m >= 1) return [{ e: b, w: 1 }];
  return [{ e: a, w: 1 - m }, { e: b, w: m }];
}

function renderShot(entry, t, rt) {
  const s = shots[entry.shot];
  s.update(t, entry.param);
  renderer.setRenderTarget(rt);
  renderer.clear();
  renderer.render(s.scene, s.camera);
  renderer.setRenderTarget(null);
  return s.grade || {};
}

window.renderFrame = (t) => {
  const act = active(t);
  let g = { exposure: 1, bloom: 0.8, warm: 0, vignette: 0.55 };
  if (act.length === 0) {
    renderer.setRenderTarget(rtA);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.setRenderTarget(null);
    mixPass.uniforms.tA.value = mixPass.uniforms.tB.value = rtA.texture;
    mixPass.uniforms.uMix.value = 0;
    mixPass.uniforms.uMode.value = 0;
  } else {
    const ga = renderShot(act[0].e, t, rtA);
    mixPass.uniforms.tA.value = rtA.texture;
    mixPass.uniforms.tB.value = rtA.texture;
    mixPass.uniforms.uMix.value = 0;
    mixPass.uniforms.uMode.value = 0;
    const gx = (k, def) => (typeof ga[k] === 'function' ? ga[k](t) : ga[k] ?? def);
    g = { exposure: gx('exposure', 1), bloom: gx('bloom', 0.8), warm: gx('warm', 0), vignette: gx('vignette', 0.55) };
    if (act.length === 2) {
      const gb = renderShot(act[1].e, t, rtB);
      const gy = (k, def) => (typeof gb[k] === 'function' ? gb[k](t) : gb[k] ?? def);
      const m = act[1].w;
      mixPass.uniforms.tB.value = rtB.texture;
      mixPass.uniforms.uMix.value = m;
      const tr = act[1].e.in || {};
      mixPass.uniforms.uMode.value = MODES[tr.mode || 'fade'];
      if (tr.center) mixPass.uniforms.uCenter.value.set(...tr.center);
      for (const k of ['exposure', 'bloom', 'warm', 'vignette']) g[k] = lerp(g[k], gy(k, g[k]), m);
    }
  }
  mixPass.uniforms.uFlash.value = 0;
  bloom.strength = g.bloom;
  grade.uniforms.uExposure.value = g.exposure;
  grade.uniforms.uWarm.value = g.warm;
  grade.uniforms.uVignette.value = g.vignette;
  grade.uniforms.uTime.value = t;
  grade.uniforms.uFade.value = ss(29.72, 29.98, t);
  drawOverlay(ov, t, timeline);
  ovTex.needsUpdate = true;
  composer.render();
  return true;
};

// Read back the finished frame (bottom-up RGBA) and post it to the host.
const gl = renderer.getContext();
const pixels = new Uint8Array(W * H * 4);
window.renderAndSend = async (t, index) => {
  window.renderFrame(t);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const r = await fetch(`/frame?i=${index}`, { method: 'POST', body: pixels });
  return r.ok;
};

window.__dbg = { renderer, composer, bloom, grade, shots };
window.ready = init().then(() => true, (e) => {
  console.error('init failed', e && e.stack ? e.stack : e);
  return false;
});
