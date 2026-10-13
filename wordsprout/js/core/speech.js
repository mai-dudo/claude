/* Речь: английский синтез речи (Web Speech API) и распознавание для игры «Повтори вслух».
   Только этот файл трогает speechSynthesis и SpeechRecognition.

   WS.speech:
   - init() — подписки: список голосов (voiceschanged и опрос 3 с), настройки, скрытие вкладки;
   - status — 'ok' | 'novoice' | 'blocked' | 'off' (живое значение);
     off — звук выключен в настройках; novoice — нет синтеза, нет английского голоса или движок не может
     говорить; blocked — фраза не началась за 2 с (браузер не дал звук), после удачной фразы снова ok;
   - canSpeak() — status === 'ok';
   - unlock() — вызывать внутри нажатия «Начать»: беззвучная пустая фраза открывает звук (iOS, Android);
   - speak(text, { rate, interrupt = true, force }) → Promise<boolean>, никогда не отклоняется:
     true — фраза прозвучала, false — не прозвучала (нет звука, отменили, сбой). Перед новой фразой
     старая отменяется (interrupt: false — встать в очередь). Текст длиннее 200 символов режется
     по концам предложений. Если status не ok, говорит только по нажатию пользователя (вдруг заработает)
     или с force (кнопка «Проверить» в настройках);
   - stop() — замолчать, все ожидающие обещания получают false;
   - voices() → [{ name, lang, local }] — английские голоса; voice() — выбранный голос или null.
     Выбор: сохранённый в настройках → местный en-US → местный en-GB → любой en-US → en-GB → любой en-*;
     «_» в коде языка заменяется на «-». Без голосов говорим с lang = 'en-US';
   - canListen(), listen({ timeout = 7000, lang, signal }) → Promise<{ transcript, alts } | null>.
     Распознавание выключается до конца сессии после ошибки network / not-allowed / service-not-allowed /
     audio-capture и всегда выключено в Brave (navigator.brave) и в тестовом режиме;
   - on(fn) → отписка; fn(status) вызывается при смене статуса.
   Тестовый режим (?test=1): настоящего звука нет, speak() записывает текст в WS.test.spoken и сразу
   отвечает true; с &tts=off синтеза «нет» (status = 'novoice', canSpeak() = false). */
(() => {
  'use strict';

  const test = WS.test;
  const testMode = !!test.enabled;
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  const Utterance = window.SpeechSynthesisUtterance || null;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  const START_TIMEOUT = 2000;
  const MAX_CHUNK = 200;
  const AFTER_CANCEL = 60; // Chrome на Android теряет фразу, сказанную сразу после cancel()

  const listeners = new Set();
  const jobs = new Set();      // фразы, чьи обещания ещё не выполнены
  const alive = new Set();     // ссылки на SpeechSynthesisUtterance, чтобы их не съел сборщик мусора
  let voiceList = [];
  let noEnglish = false;       // голоса есть, но среди них нет английских
  let failed = false;          // движок не смог сказать фразу, а английских голосов нет
  let failStreak = 0;
  let blocked = false;
  let lastStatus = null;
  let unlocked = false;
  let inited = false;
  let listenOff = false;
  let activeListen = null;

  const settings = () => {
    try {
      return (WS.settings && WS.settings.get()) || {};
    } catch (e) {
      return {};
    }
  };
  const soundOn = () => settings().sound !== false;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const hasGesture = () => !!(navigator.userActivation && navigator.userActivation.isActive);

  /* ---------- Статус ---------- */
  const computeStatus = () => {
    if (!soundOn()) return 'off';
    if (testMode) return test.tts === 'off' ? 'novoice' : 'ok';
    if (!synth || !Utterance) return 'novoice';
    if (noEnglish || failed) return 'novoice';
    if (blocked) return 'blocked';
    return 'ok';
  };

  const emit = () => {
    const status = computeStatus();
    if (status === lastStatus) return;
    lastStatus = status;
    if (testMode) test.events.push({ type: 'speech', status });
    listeners.forEach((fn) => {
      try {
        fn(status);
      } catch (e) {
        console.warn('WordSprout: подписчик речи', e);
      }
    });
  };

  /* ---------- Голоса ---------- */
  const normLang = (lang) => String(lang || '').replace(/_/g, '-');
  const langOf = (v) => normLang(v.lang).toLowerCase();
  const isEnglish = (v) => /^en(-|$)/.test(langOf(v));

  const refreshVoices = () => {
    if (!synth) return;
    let list = [];
    try {
      list = Array.from(synth.getVoices() || []);
    } catch (e) {
      list = [];
    }
    voiceList = list;
    const english = list.some(isEnglish);
    noEnglish = list.length > 0 && !english;
    if (english) failed = false;
    emit();
  };

  const pickVoice = () => {
    const en = voiceList.filter(isEnglish);
    if (!en.length) return null;
    const saved = settings().voice;
    if (saved) {
      const v = en.find((x) => x.name === saved || x.voiceURI === saved);
      if (v) return v;
    }
    const by = (lang, local) => en.find((v) => langOf(v) === lang && (!local || v.localService));
    return by('en-us', true) || by('en-gb', true) || by('en-us', false) || by('en-gb', false)
      || en.find((v) => v.localService) || en[0];
  };

  /* ---------- Деление длинного текста ---------- */
  const lastCut = (head, re) => {
    let k = -1;
    for (const m of head.matchAll(re)) k = m.index + m[0].length;
    return k;
  };

  const splitText = (text) => {
    let rest = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    const out = [];
    while (rest.length > MAX_CHUNK) {
      const head = rest.slice(0, MAX_CHUNK);
      let cut = lastCut(head, /[.!?…]+["'»”)\]]*\s/g);
      if (cut < MAX_CHUNK / 3) cut = Math.max(cut, lastCut(head, /[,;:—]\s/g));
      if (cut < MAX_CHUNK / 3) cut = Math.max(cut, lastCut(head, /\s/g));
      if (cut <= 0) cut = MAX_CHUNK;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
    return out;
  };

  /* ---------- Синтез ---------- */
  const cancelJobs = () => {
    Array.from(jobs).forEach((job) => job.finish(false));
  };

  const synthBusy = () => !!(synth && (synth.speaking || synth.pending));

  const cancelSynth = () => {
    if (!synth) return;
    try {
      synth.cancel();
    } catch (e) { /* ничего страшного */ }
  };

  const onEngineError = (err) => {
    if (err === 'not-allowed') {
      blocked = true;
    } else if (['synthesis-failed', 'synthesis-unavailable', 'language-unavailable', 'voice-unavailable',
      'audio-hardware'].includes(err)) {
      failStreak += 1;
      if (!voiceList.some(isEnglish) || failStreak >= 2) failed = true;
    }
    emit();
  };

  const markWorking = () => {
    failStreak = 0;
    if (blocked || failed) {
      blocked = false;
      failed = false;
      emit();
    }
  };

  // Сколько может звучать фраза: запасной таймер на случай, если 'end' не придёт (известная ошибка Chrome).
  const estimate = (text, rate) => Math.round((text.length * 85) / rate) + 4000;

  const speakReal = (chunks, opts, resolve) => {
    const job = { done: false, timers: [], utts: [] };
    job.finish = (ok) => {
      if (job.done) return;
      job.done = true;
      job.timers.forEach((id) => clearTimeout(id));
      job.utts.forEach((u) => alive.delete(u));
      jobs.delete(job);
      resolve(ok);
    };
    const interrupt = opts.interrupt !== false;
    let delay = 0;
    if (interrupt) {
      cancelJobs();
      if (synthBusy()) {
        cancelSynth();
        delay = AFTER_CANCEL;
      }
    }
    jobs.add(job);
    try {
      if (synth.paused) synth.resume();
    } catch (e) { /* ничего страшного */ }

    const rate = clamp(Number(opts.rate) || Number(settings().rate) || 0.9, 0.5, 1.5);
    const voice = pickVoice();
    let index = 0;
    let started = false;

    const speakChunk = () => {
      if (job.done) return;
      if (index >= chunks.length) {
        job.finish(true);
        return;
      }
      const text = chunks[index];
      index += 1;
      const u = new Utterance(text);
      u.lang = voice ? normLang(voice.lang) : 'en-US';
      if (voice) u.voice = voice;
      u.rate = rate;
      u.pitch = 1;
      u.volume = 1;
      job.utts.push(u);
      alive.add(u);
      let ended = false;
      const next = () => {
        if (ended) return;
        ended = true;
        alive.delete(u);
        speakChunk();
      };
      u.onstart = () => {
        if (!started) {
          started = true;
          markWorking();
        }
        if (!job.done) job.timers.push(setTimeout(next, estimate(text, rate)));
      };
      u.onend = next;
      u.onerror = (e) => {
        const err = e && e.error;
        alive.delete(u);
        if (err !== 'interrupted' && err !== 'canceled') onEngineError(err);
        job.finish(false);
      };
      try {
        synth.speak(u);
      } catch (e) {
        job.finish(false);
        return;
      }
      // Сторож старта: ничего не началось за 2 с — звук заблокирован (игра идёт дальше без голоса).
      if (!started && interrupt) {
        job.timers.push(setTimeout(() => {
          if (started || job.done) return;
          if (document.visibilityState === 'visible') {
            blocked = true;
            emit();
          }
          job.finish(false);
        }, START_TIMEOUT));
      }
    };

    if (delay) job.timers.push(setTimeout(speakChunk, delay));
    else speakChunk();
  };

  const speak = (text, opts = {}) => new Promise((resolve) => {
    try {
      const chunks = splitText(text);
      if (!chunks.length) {
        resolve(false);
        return;
      }
      const status = computeStatus();
      if (testMode) {
        const ok = status === 'ok';
        if (ok) {
          test.spoken.push(String(text));
          test.events.push({ type: 'speak', text: String(text), rate: opts.rate || null });
        }
        resolve(ok);
        return;
      }
      if (status === 'off' || !synth || !Utterance) {
        resolve(false);
        return;
      }
      // Не ok: пробуем только по нажатию пользователя (вдруг теперь заработает) или с force.
      const retry = (blocked || failed) && !noEnglish && hasGesture();
      if (status !== 'ok' && !opts.force && !retry) {
        resolve(false);
        return;
      }
      speakReal(chunks, opts, resolve);
    } catch (e) {
      resolve(false);
    }
  });

  const unlock = () => {
    if (testMode) {
      test.events.push({ type: 'speech-unlock' });
      return;
    }
    if (!synth || !Utterance) return;
    try {
      if (synth.paused) synth.resume();
      if (unlocked || !soundOn()) return;
      unlocked = true;
      const u = new Utterance('');
      u.volume = 0;
      u.lang = 'en-US';
      alive.add(u);
      const drop = () => alive.delete(u);
      u.onend = drop;
      u.onerror = drop;
      setTimeout(drop, 3000);
      synth.speak(u);
    } catch (e) { /* без разблокировки речь просто может не заработать */ }
  };

  const stop = () => {
    cancelJobs();
    if (synthBusy()) cancelSynth();
    if (activeListen) activeListen();
  };

  const voices = () => {
    if (testMode) return test.tts === 'off' ? [] : [{ name: 'Test English', lang: 'en-US', local: true }];
    return voiceList.filter(isEnglish).map((v) => ({ name: v.name, lang: normLang(v.lang), local: !!v.localService }));
  };

  const voice = () => {
    if (testMode) return voices()[0] || null;
    const v = pickVoice();
    return v ? { name: v.name, lang: normLang(v.lang), local: !!v.localService } : null;
  };

  /* ---------- Распознавание (только «Повтори вслух») ---------- */
  const canListen = () => !testMode && !!Recognition && !listenOff && !navigator.brave
    && window.isSecureContext !== false;

  const listen = ({ timeout = 7000, lang = 'en-US', signal } = {}) => new Promise((resolve) => {
    if (!canListen() || (signal && signal.aborted)) {
      resolve(null);
      return;
    }
    if (activeListen) activeListen();
    cancelJobs();
    if (synthBusy()) cancelSynth();
    let rec;
    try {
      rec = new Recognition();
    } catch (e) {
      listenOff = true;
      resolve(null);
      return;
    }
    let done = false;
    let timer = 0;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      if (activeListen === stopThis) activeListen = null;
      try {
        rec.abort();
      } catch (e) { /* уже остановлено */ }
      resolve(value);
    };
    const onAbort = () => finish(null);
    const stopThis = () => finish(null);
    activeListen = stopThis;
    rec.lang = lang;
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 3;
    rec.onresult = (e) => {
      const res = e.results && e.results[0];
      if (!res) return;
      const alts = Array.from(res).map((a) => String(a.transcript || '').trim()).filter(Boolean);
      finish(alts.length ? { transcript: alts[0], alts } : null);
    };
    rec.onerror = (e) => {
      const err = e && e.error;
      if (['network', 'not-allowed', 'service-not-allowed', 'audio-capture'].includes(err)) listenOff = true;
      finish(null);
    };
    rec.onend = () => finish(null);
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => finish(null), Math.max(1000, Number(timeout) || 7000));
    try {
      rec.start();
    } catch (e) {
      finish(null);
    }
  });

  /* ---------- Подписки ---------- */
  const on = (fn) => {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  const init = () => {
    if (inited) return;
    inited = true;
    if (synth && !testMode) {
      refreshVoices();
      try {
        synth.addEventListener('voiceschanged', refreshVoices);
      } catch (e) {
        synth.onvoiceschanged = refreshVoices;
      }
      // Safari и часть Android не присылают voiceschanged: опрашиваем 3 с.
      let tries = 0;
      const poll = setInterval(() => {
        tries += 1;
        refreshVoices();
        if (voiceList.length || tries >= 12) clearInterval(poll);
      }, 250);
    }
    if (WS.settings && typeof WS.settings.on === 'function') {
      WS.settings.on(() => {
        if (!soundOn()) stop();
        emit();
      });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') stop();
    });
    window.addEventListener('pagehide', stop);
    emit();
  };

  WS.speech = {
    get status() {
      return computeStatus();
    },
    init, canSpeak: () => computeStatus() === 'ok', unlock, speak, stop, voices, voice, canListen, listen, on,
  };
})();
