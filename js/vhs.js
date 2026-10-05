/* Картинка «с видеокассеты» поверх фона: WebGL-шейдер берёт кадр аквариума (видео или холст),
   размазывает цвет вдоль строки, дрожит строками, шумит у нижнего края кадра, иногда гонит
   полосу трекинга и дёргает экран. Строки развёртки и тёмные края — в css/style.css (.crt).
   Пока открыт просмотрщик или игра, эффект выключен, а фон не рисуется. */
(() => {
  'use strict';

  const root = document.documentElement;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const video = document.getElementById('bgVideo');
  const aquarium = document.getElementById('aquarium');
  const viewer = document.getElementById('viewer');
  const game = document.getElementById('game');
  const band = document.querySelector('.crt__band');

  const covered = () => (viewer && !viewer.hidden) || (game && !game.hidden);

  /* ---------- Что сейчас на экране ---------- */
  let tapeLoop = null;
  const sync = () => {
    const off = covered();
    root.classList.toggle('crt-off', off);
    if (tapeLoop) (off ? tapeLoop.stop() : tapeLoop.start());
  };
  const watch = new MutationObserver(sync);
  [viewer, game].forEach((el) => el && watch.observe(el, { attributes: true, attributeFilter: ['hidden'] }));

  /* ---------- Сбои ленты ---------- */
  const fx = { bandStart: -1, bandDur: 1, glitchUntil: 0 };
  const later = (fn, a, b) => setTimeout(fn, a + Math.random() * (b - a));
  const glitch = () => {
    if (document.hidden || covered()) return;
    const now = performance.now();
    fx.bandStart = now;
    fx.bandDur = 1500 + Math.random() * 1700;
    if (band && band.animate) {
      band.animate(
        [{ transform: 'translateY(-20vh)' }, { transform: 'translateY(105vh)' }],
        { duration: fx.bandDur, easing: 'linear' },
      );
    }
    if (Math.random() < 0.65) {
      const dur = 150 + Math.random() * 220;
      fx.glitchUntil = now + dur;
      root.classList.add('crt-glitch');
      setTimeout(() => root.classList.remove('crt-glitch'), dur);
    }
  };
  if (!still) {
    const schedule = () => later(() => { glitch(); schedule(); }, 6000, 15000);
    schedule();
  }

  if (still) return; // без движения остаются только строки развёртки из CSS

  /* ---------- Шейдер ---------- */
  const VERT = `
attribute vec2 a;
varying vec2 uv;
void main() {
  uv = vec2(a.x * .5 + .5, .5 - a.y * .5);
  gl_Position = vec4(a, 0., 1.);
}`;

  const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D src;
uniform vec2 res;     // размер холста
uniform vec2 cover;   // масштаб под object-fit: cover
uniform float time;   // секунды
uniform float band;   // положение полосы трекинга 0..1, меньше -0.5 — её нет
uniform float glitch; // сила сбоя 0..1
varying vec2 uv;

// хэш без sin(): на мобильных видеокартах sin() от больших чисел теряет точность и шум сбивается в полосы
float rnd(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
vec3 toYiq(vec3 c) { return vec3(dot(c, vec3(.299, .587, .114)), dot(c, vec3(.596, -.274, -.322)), dot(c, vec3(.211, -.523, .312))); }
vec3 toRgb(vec3 c) { return vec3(c.x + .956 * c.y + .621 * c.z, c.x - .272 * c.y - .647 * c.z, c.x - 1.106 * c.y + 1.703 * c.z); }
vec3 pick(vec2 p) { return texture2D(src, clamp((p - .5) * cover + .5, 0., 1.)).rgb; }

void main() {
  float line = floor(uv.y * res.y);
  float frame = mod(floor(time * 30.), 4096.); // номер кадра держим небольшим ради точности float
  float r = rnd(vec2(line, frame));

  // строки гуляют вбок
  float shift = (r - .5) * 1.5 / res.x + sin(uv.y * 11. + time * 2.) * .0006;
  // полоса трекинга рвёт строки
  float tr = band < -.5 ? 0. : smoothstep(.07, 0., abs(uv.y - band));
  shift += tr * (rnd(vec2(line, frame + 3.)) - .5) * .05;
  // сбой: кадр сдёргивает кусками
  shift += glitch * (rnd(vec2(floor(uv.y * 10.), frame)) - .5) * .06;
  // внизу кадра шумят головки
  float head = smoothstep(.975, .995, uv.y);
  shift += head * (.012 + .025 * r);

  vec2 p = vec2(uv.x + shift, uv.y);
  vec3 c = toYiq(pick(p));
  // цвет размазан вдоль строки и отстаёт от яркости
  vec2 chroma = vec2(0.);
  for (int i = 1; i <= 4; i++) chroma += toYiq(pick(p - vec2(.003 * float(i), 0.))).yz;
  c.yz = chroma * .3;

  // зерно яркости и цветные разводы
  float grain = rnd(vec2(floor(uv.x * res.x), line) + frame * 13.);
  c.x += (grain - .5) * (.07 + .3 * tr + .4 * head);
  c.yz += (rnd(vec2(floor(uv.x * res.x / 16.), line + frame * 5.)) - .5) * .05;
  // выпадения: короткие белые чёрточки
  float dropout = step(.9995, rnd(vec2(line * .5, frame + 9.))) * step(abs(uv.x - rnd(vec2(frame, line))), .05);
  c.x += dropout * .5;
  // искры в полосе трекинга
  c.x += tr * step(.85, rnd(vec2(floor(uv.x * res.x / 3.), line + frame))) * .35;

  // чёрный у затёртой кассеты не глубокий
  gl_FragColor = vec4(toRgb(c) * .9 + .04, 1.);
}`;

  const createTape = (lines) => {
    const canvas = document.createElement('canvas');
    canvas.className = 'scene__tape';
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
    if (!gl) return null;

    const compile = (type, code) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, code);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const prog = gl.createProgram();
    try {
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (err) {
      console.warn('VHS:', err);
      return null;
    }
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const U = {};
    ['res', 'cover', 'time', 'band', 'glitch'].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });

    let aspect = 16 / 9;
    const fit = () => {
      const ca = canvas.width / canvas.height;
      gl.uniform2f(U.cover, ca > aspect ? 1 : ca / aspect, ca > aspect ? aspect / ca : 1);
    };

    const tape = {
      canvas,
      lost: false,
      resize(w, h) {
        const rows = Math.max(1, Math.round(Math.min(lines, h * (devicePixelRatio || 1))));
        canvas.width = Math.max(1, Math.round((rows * w) / h));
        canvas.height = rows;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(U.res, canvas.width, canvas.height);
        fit();
      },
      upload(source, w, h) {
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
        } catch (err) {
          console.warn('VHS:', err);
          tape.lost = true;
          return false;
        }
        if (w && h && Math.abs(w / h - aspect) > 1e-3) { aspect = w / h; fit(); }
        return true;
      },
      draw(now) {
        const p = fx.bandStart < 0 ? 2 : (now - fx.bandStart) / fx.bandDur;
        gl.uniform1f(U.time, (now / 1000) % 600);
        gl.uniform1f(U.band, p <= 1 ? p * 1.2 - 0.1 : -1);
        gl.uniform1f(U.glitch, now < fx.glitchUntil ? 0.5 + Math.random() * 0.5 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); tape.lost = true; });
    return tape;
  };

  const loop = (step) => {
    let raf = 0, last = 0;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 30) return; // ~30 кадров в секунду, как у самой кассеты
      last = now;
      step(now);
    };
    return {
      start() { if (!raf) raf = requestAnimationFrame(tick); },
      stop() { cancelAnimationFrame(raf); raf = 0; },
    };
  };

  /* ---------- Источник кадра: видео, если оно играет, иначе нарисованный аквариум ---------- */
  const source = () => {
    if (video && !video.hidden && video.readyState >= 2) return { el: video, w: video.videoWidth, h: video.videoHeight, live: !video.paused };
    if (aquarium && !aquarium.hidden && aquarium.width > 0) return { el: aquarium, w: aquarium.width, h: aquarium.height, live: true };
    return null;
  };

  const tape = createTape(540);
  if (!tape) return;
  let ready = false;
  const giveUp = () => {
    tapeLoop.stop();
    tape.canvas.remove();
    root.classList.remove('crt-gl');
  };
  tapeLoop = loop((now) => {
    if (tape.lost) return giveUp();
    const s = source();
    if (s && (!ready || s.live)) {
      if (!tape.upload(s.el, s.w, s.h)) return giveUp();
      if (!ready) {
        ready = true;
        tape.canvas.classList.add('is-on');
        root.classList.add('crt-gl');
      }
    }
    if (ready) tape.draw(now);
  });
  (video || aquarium).after(tape.canvas);
  const size = () => tape.resize(innerWidth, innerHeight);
  size();
  addEventListener('resize', size);
  sync();
})();
