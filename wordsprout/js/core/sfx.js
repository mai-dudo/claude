/* Звуковые эффекты WordSprout: короткие тоны, собранные на WebAudio прямо в браузере (без файлов).
   Только этот файл создаёт AudioContext. Он создаётся лениво — при первом касании или нажатии клавиши,
   потому что браузеры дают звук только после жеста пользователя.

   WS.sfx:
   - ok()   — верно: два коротких восходящих звука;
   - bad()  — неверно: низкое приглушённое жужжание;
   - done() — раунд пройден: восходящее арпеджио;
   - key()  — принятая буква: тихий щелчок (не чаще раза в 30 мс);
   - miss() — отклонённая буква: мягкий низкий щелчок;
   - play(name), unlock() — запустить контекст внутри нажатия «Начать».
   Всё молчит, если в настройках выключен звук. В тестовом режиме контекст не создаётся, а каждый звук
   записывается в WS.test.events как { type: 'sfx', name }. */
(() => {
  'use strict';

  const test = WS.test;
  const AC = window.AudioContext || window.webkitAudioContext || null;
  const GESTURES = ['pointerdown', 'keydown', 'touchend', 'click'];
  const VOLUME = 0.22;

  let ctx = null;
  let master = null;
  let lastKey = 0;

  const soundOn = () => {
    try {
      return !(WS.settings && WS.settings.get().sound === false);
    } catch (e) {
      return true;
    }
  };

  const ensure = () => {
    if (!AC || test.enabled) return null;
    if (!ctx) {
      try {
        ctx = new AC({ latencyHint: 'interactive' });
        master = ctx.createGain();
        master.gain.value = VOLUME;
        master.connect(ctx.destination);
      } catch (e) {
        ctx = null;
        return null;
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };

  // Первый жест создаёт и запускает контекст; когда он работает, слушатели больше не нужны.
  const onGesture = () => {
    if (!soundOn()) return;
    const c = ensure();
    if (!c || c.state === 'running') GESTURES.forEach((type) => window.removeEventListener(type, onGesture, true));
  };
  if (AC && !test.enabled) GESTURES.forEach((type) => window.addEventListener(type, onGesture, true));

  /* ---------- Тон: генератор → (фильтр) → огибающая → общая громкость ---------- */
  const tone = (c, { freq, to = 0, type = 'sine', at = 0, dur = 0.15, gain = 0.6, attack = 0.006, lowpass = 0 }) => {
    const t0 = c.currentTime + 0.005 + at;
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let filter = null;
    if (lowpass) {
      filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      osc.connect(filter);
      filter.connect(env);
    } else {
      osc.connect(env);
    }
    env.connect(master);
    osc.onended = () => {
      try {
        osc.disconnect();
        if (filter) filter.disconnect();
        env.disconnect();
      } catch (e) { /* уже отключено */ }
    };
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  };

  const SOUNDS = {
    ok: (c) => {
      tone(c, { freq: 659.25, type: 'triangle', dur: 0.14, gain: 0.55 });
      tone(c, { freq: 987.77, type: 'triangle', at: 0.085, dur: 0.26, gain: 0.5 });
    },
    bad: (c) => {
      tone(c, { freq: 174.6, to: 123.5, type: 'sawtooth', dur: 0.28, gain: 0.4, lowpass: 650 });
      tone(c, { freq: 87.3, type: 'square', dur: 0.22, gain: 0.18, lowpass: 380 });
    },
    done: (c) => {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        tone(c, { freq, type: 'triangle', at: i * 0.09, dur: i === 3 ? 0.55 : 0.2, gain: 0.45 });
      });
      tone(c, { freq: 1567.98, type: 'sine', at: 0.3, dur: 0.45, gain: 0.12 });
    },
    key: (c) => tone(c, { freq: 1500, to: 950, type: 'sine', dur: 0.035, gain: 0.22, attack: 0.002 }),
    miss: (c) => tone(c, { freq: 246.9, to: 185, type: 'triangle', dur: 0.09, gain: 0.32, attack: 0.003 }),
  };

  const play = (name) => {
    if (!SOUNDS[name] || !soundOn()) return;
    if (name === 'key') {
      const now = Date.now();
      if (now - lastKey < 30) return;
      lastKey = now;
    }
    if (test.enabled) {
      test.events.push({ type: 'sfx', name });
      return;
    }
    const c = ensure();
    if (!c || c.state === 'closed') return;
    // Пока контекст спит без жеста пользователя, звуки не копим: иначе они прозвучат пачкой позже.
    const activeGesture = !!(navigator.userActivation && navigator.userActivation.isActive);
    if (c.state !== 'running' && !activeGesture) return;
    try {
      SOUNDS[name](c);
    } catch (e) { /* звук не обязателен */ }
  };

  WS.sfx = {
    ok: () => play('ok'),
    bad: () => play('bad'),
    done: () => play('done'),
    key: () => play('key'),
    miss: () => play('miss'),
    play,
    unlock: () => {
      if (soundOn()) ensure();
    },
  };
})();
