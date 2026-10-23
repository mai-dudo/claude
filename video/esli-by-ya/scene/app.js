// «Если бы я...» — every frame is a pure function of time: renderAt(t).
// tools/render.js calls it frame by frame; opening the page in a browser plays it live.
import { buildTimeline } from './timeline.js';
import { characterSVG, avatarSVG, mouthPath } from './characters.js';

const params = new URLSearchParams(location.search);
const RENDER = params.has('render');

/* ---------- motion helpers (Material 3 easing) ---------- */
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (sx(t) - x) / d;
    }
    return sy(Math.min(1, Math.max(0, t)));
  };
}
const E = {
  emph: bezier(0.05, 0.7, 0.1, 1),
  std: bezier(0.2, 0, 0, 1),
  acc: bezier(0.3, 0, 0.8, 0.15),
  // small overshoot, like the M3 expressive spatial spring
  pop: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3) * Math.cos(x * Math.PI * 1.6) * (1 - x * 0.2)),
};
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, start, dur, ease = E.emph) => ease(clamp((t - start) / dur));
const lerp = (a, b, p) => a + (b - a) * p;
const win = (t, a, b, r = 0.25) => clamp((t - a) / r) * clamp((b - t) / r);

function h(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild;
}
const icon = (name, cls = '') => `<span class="ms ${cls}">${name}</span>`;

// Fades/slides an element in at tin and out at tout.
function fx(el, t, tin, tout, o = {}) {
  const p = (o.ease || E.emph)(clamp((t - tin) / (o.din ?? 0.7)));
  const q = tout == null ? 0 : E.acc(clamp((t - tout) / (o.dout ?? 0.35)));
  const x = (o.x ?? 0) * (1 - p);
  const y = (o.y ?? 36) * (1 - p) - (o.yOut ?? 24) * q;
  const s = lerp(o.s ?? 0.96, 1, p) * lerp(1, o.sOut ?? 0.98, q) * (o.scale ?? 1);
  el.style.opacity = (p * (1 - q) * (o.alpha ?? 1)).toFixed(3);
  el.style.transform = `translate(${x.toFixed(1)}px,${(y + (o.dy ?? 0)).toFixed(1)}px) scale(${s.toFixed(4)})${o.rot ? ` rotate(${o.rot}deg)` : ''}`;
  return p * (1 - q);
}

/* ---------- Material 3 Expressive shapes ---------- */
function shapePath(kind, cx = 50, cy = 50, r = 48) {
  const spec = { cookie: [9, 0.07], flower: [8, 0.13], clover: [4, 0.16], burst: [12, 0.06], soft: [5, 0.05] }[kind];
  const [n, a] = spec;
  const pts = [];
  for (let i = 0; i < 180; i++) {
    const th = (i / 180) * Math.PI * 2;
    const rr = (r / (1 + a)) * (1 + a * Math.cos(n * th));
    pts.push(`${(cx + rr * Math.cos(th)).toFixed(2)},${(cy + rr * Math.sin(th)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}
const shapeSVG = (kind, cls = '') => `<svg class="${cls}" viewBox="0 0 100 100"><path d="${shapePath(kind)}"/></svg>`;

function deco(kind, x, y, size, cls = '') {
  const el = h(`<svg class="deco ${cls}" viewBox="0 0 100 100" style="left:${x}px;top:${y}px;width:${size}px;height:${size}px"><path d="${shapePath(kind)}"/></svg>`);
  el.dataset.spin = String((size % 7) - 3 || 2);
  return el;
}
function spinDeco(root, t) {
  for (const d of root.querySelectorAll('.deco')) d.style.transform = `rotate(${(t * +d.dataset.spin).toFixed(2)}deg)`;
}

/* ---------- characters ---------- */
const chars = [];
const BLINK = { A: [3.6, 0.4], M: [4.3, 1.7], T: [5.1, 2.6], N: [3.9, 3.1] };
function mountChar(parent, who, avatar = false) {
  const svg = h(avatar ? avatarSVG(who) : characterSVG(who));
  parent.appendChild(svg);
  const mouth = svg.querySelector('.c-mouth');
  chars.push({
    who, svg,
    body: svg.querySelector('.c-body'),
    heads: [...svg.querySelectorAll('.c-head')],
    eyes: svg.querySelector('.c-eyes'),
    mouth, cy: +mouth.dataset.cy, last: -1,
  });
  return svg;
}

let TL, TIMING, BY_WHO;
function speakingLine(who, t) {
  for (const l of BY_WHO[who]) if (t >= l.start && t <= l.end) return l;
  return null;
}
function mouthOpen(line, t) {
  const lt = t - line.start;
  const env = TIMING?.lines?.[line.id]?.env;
  if (env) return clamp(env[Math.floor(lt * TL.fps)] ?? 0);
  const edge = clamp(lt / 0.08) * clamp((line.dur - lt) / 0.12);
  const a = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4.6 * lt);
  const b = 0.55 + 0.45 * Math.sin(2 * Math.PI * 1.9 * lt + 1.3);
  return clamp(a * b * 1.15) * edge;
}
function animateChar(c, t) {
  const [period, off] = BLINK[c.who];
  const line = speakingLine(c.who, t);
  const lt = (t + off) % period;
  const blink = lt < 0.16 ? 1 - Math.sin((Math.PI * lt) / 0.16) * 0.9 : 1;
  c.eyes.style.transform = `scaleY(${blink.toFixed(3)})`;
  const talk = line ? win(t, line.start, line.end, 0.3) : 0;
  const rot = Math.sin(t * 0.9 + off) * 1.2 + talk * Math.sin(t * 3.3 + off) * 1.8;
  for (const hd of c.heads) hd.style.transform = `rotate(${rot.toFixed(2)}deg)`;
  c.body.style.transform = `translateY(${(Math.sin(t * 1.7 + off) * 3).toFixed(2)}px)`;
  const open = line ? mouthOpen(line, t) : 0;
  const q = Math.round(open * 40);
  if (q !== c.last) {
    c.mouth.setAttribute('d', mouthPath(q / 40, c.cy));
    c.last = q;
  }
}

/* ---------- subtitles ---------- */
function chunkText(text) {
  if (text.length <= 96) return [text];
  const out = [];
  for (const s of text.split(/(?<=[.!?…»])\s+(?=[А-ЯЁA-Z«])/)) {
    if (s.length <= 92) { out.push(s); continue; }
    const mid = s.length / 2;
    let best = -1;
    for (const m of s.matchAll(/(, | — |: )/g)) {
      if (best < 0 || Math.abs(m.index - mid) < Math.abs(best - mid)) best = m.index;
    }
    if (best < 0) { out.push(s); continue; }
    const sep = s.slice(best).match(/^(, | — |: )/)[0];
    out.push(s.slice(0, best + sep.trimEnd().length), s.slice(best + sep.length));
  }
  return out;
}
class Subtitles {
  constructor(stage, cast) {
    this.el = h('<div class="subs"></div>');
    this.subs = {};
    for (const [k, c] of Object.entries(cast)) {
      const s = h(`<div class="sub th-${k}"><div class="who"><div class="dot"></div>${c.name}</div><div class="tx"></div></div>`);
      mountChar(s.querySelector('.dot'), k, true);
      this.el.appendChild(s);
      this.subs[k] = { el: s, tx: s.querySelector('.tx'), cur: null };
    }
    stage.appendChild(this.el);
    for (const l of TL.lines) {
      const parts = chunkText(l.text);
      const total = parts.reduce((a, p) => a + p.length, 0);
      let at = l.start;
      l.chunks = parts.map((p) => {
        const c = { text: p, start: at };
        at += (l.dur * p.length) / total;
        return c;
      });
    }
  }
  update(t) {
    const lines = TL.lines;
    let cur = -1;
    for (let i = 0; i < lines.length; i++) if (t >= lines[i].start - 0.12 && t <= lines[i].end + 0.25) cur = i;
    for (const k in this.subs) {
      const s = this.subs[k];
      const l = lines[cur];
      if (!l || l.who !== k || l.noSub) { s.el.style.opacity = 0; continue; }
      const prev = lines[cur - 1], next = lines[cur + 1];
      const joinPrev = prev && prev.who === k && l.start - prev.end < 0.7 && !prev.noSub;
      const joinNext = next && next.who === k && next.start - l.end < 0.7 && !next.noSub;
      const a = joinPrev ? 1 : clamp((t - (l.start - 0.12)) / 0.18);
      const b = joinNext ? 1 : clamp((l.end + 0.25 - t) / 0.18);
      let chunk = l.chunks[0];
      for (const c of l.chunks) if (t >= c.start - 0.05) chunk = c;
      if (s.cur !== chunk) { s.tx.textContent = chunk.text; s.cur = chunk; }
      s.el.style.opacity = (a * b).toFixed(3);
      s.el.style.transform = `translateY(${((1 - a) * 14).toFixed(1)}px)`;
    }
  }
}

/* ---------- visuals for the right panel ---------- */
function countUp(str, p) {
  const m = str.match(/\d+(?:[.,]\d+)?/);
  if (!m) return str;
  const dec = (m[0].split(/[.,]/)[1] || '').length;
  const num = parseFloat(m[0].replace(',', '.')) * p;
  return str.slice(0, m.index) + num.toFixed(dec).replace('.', ',') + str.slice(m.index + m[0].length);
}
const fmtInt = (n) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');

const VISUALS = {
  call(v, line) {
    const el = h(`<div class="vis v-call">
      <div class="phone"><div class="scr"><div class="notch"></div>
        <div class="who"><div class="pav"><div class="ring"></div><div class="ring"></div>${icon("person")}</div>
          <div class="pn">${v.caller}</div><div class="pnum">+998 •• ••• •• ••</div><div class="pst">Входящий вызов…</div></div>
        <div class="bubble"><span class="ty"></span></div>
        <div class="btns"><div class="btn no">${icon("call_end")}</div><div class="btn yes">${icon("call")}</div></div>
      </div></div>
      <div class="side">
        <div class="warn">${icon("warning")}Это мошенник!</div>
        <div class="tip">${icon("block")}Банк никогда не спрашивает код из СМС</div>
        <div class="tip">${icon("call_end")}Положите трубку и позвоните в банк сами</div>
      </div></div>`);
    const phone = el.querySelector('.phone'), rings = el.querySelectorAll('.ring'), ty = el.querySelector('.ty');
    const side = [...el.querySelectorAll('.side > div')];
    const tWarn = Math.max(1.6, line.dur * 0.55);
    return {
      el,
      update(lt) {
        const shake = lt > 0.5 && lt < 1.8 ? Math.sin(lt * 42) * 2.2 * (1 - (lt - 0.5) / 1.3) : 0;
        fx(phone, lt, 0, null, { y: 60, s: 0.92, rot: shake.toFixed(2) });
        rings.forEach((r, i) => {
          const ph = ((lt + i * 0.55) % 1.1) / 1.1;
          r.style.transform = `scale(${1 + ph * 0.7})`;
          r.style.opacity = ((1 - ph) * 0.8 * clamp(2.4 - lt)).toFixed(3);
        });
        const n = Math.floor(clamp((lt - 0.5) * 24, 0, v.message.length));
        ty.textContent = v.message.slice(0, n);
        side.forEach((s, i) => fx(s, lt, tWarn + i * 0.35, null, { x: 40, y: 0, s: 0.9, ease: i ? E.emph : E.pop }));
      },
    };
  },

  stat(v) {
    const ring = v.ring != null;
    const el = h(`<div class="vis card v-stat ${ring ? 'has-ring' : ''}">
      <div class="ic">${icon(v.icon)}</div>
      <div class="val" ${ring ? 'style="font-size:150px"' : ''}>${v.value}</div>
      <div class="cap">${v.caption}</div>
      ${ring ? `<div class="ringbox"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="var(--soft)" stroke-width="13"/>
        <circle class="arc" cx="50" cy="50" r="42" fill="none" stroke="var(--primary)" stroke-width="13" stroke-linecap="round" stroke-dasharray="263.9" stroke-dashoffset="263.9"/></svg>${icon(v.icon)}</div>` : ''}
      ${v.progress != null ? `<div class="prog"><div class="lbl">${v.progressLabel}</div><div class="track"><div class="fill"></div></div></div>` : ''}
      ${v.badge ? `<div class="badge">${icon("warning")}${v.badge}</div>` : ''}
      <div class="src">${icon("info", "line")}Источник: ${v.source}</div>
    </div>`);
    const val = el.querySelector('.val'), arc = el.querySelector('.arc'), fill = el.querySelector('.fill');
    const badge = el.querySelector('.badge'), src = el.querySelector('.src'), cap = el.querySelector('.cap'), ic = el.querySelector('.ic');
    return {
      el,
      update(lt) {
        fx(el, lt, 0, null, { y: 50 });
        fx(ic, lt, 0.15, null, { y: 0, s: 0.4, ease: E.pop });
        const p = prog(lt, 0.3, 1.5, E.std);
        val.textContent = countUp(v.value, p);
        fx(cap, lt, 0.5, null, { y: 20 });
        if (arc) arc.setAttribute('stroke-dashoffset', (263.9 * (1 - (v.ring / 100) * p)).toFixed(2));
        if (fill) fill.style.width = `${(v.progress * prog(lt, 1.0, 1.2, E.std)).toFixed(2)}%`;
        if (badge) fx(badge, lt, 1.5, null, { y: 0, s: 0.6, ease: E.pop });
        fx(src, lt, 1.0, null, { y: 10 });
      },
    };
  },

  bars(v) {
    const max = Math.max(...v.items.map((i) => i.value));
    const el = h(`<div class="vis card v-bars">
      <h3>${v.title}</h3>
      ${v.note ? `<div class="note">${icon("agriculture")}${v.note}</div>` : ''}
      <div class="rows">${v.items.map((i) => `<div class="row"><div class="l">${i.label}</div><div class="b"><div class="f"></div><div class="n">${i.display}</div></div></div>`).join('')}</div>
      <div class="bdg">${shapeSVG('burst')}<span class="${v.badge.length > 5 ? 'small' : ''}">${v.badge}</span></div>
      <div class="src">${icon("info", "line")}Источник: ${v.source}</div>
    </div>`);
    const rows = [...el.querySelectorAll('.row')], bdg = el.querySelector('.bdg'), src = el.querySelector('.src');
    const note = el.querySelector('.note');
    return {
      el,
      update(lt) {
        fx(el, lt, 0, null, { y: 50 });
        if (note) fx(note, lt, 0.3, null, { y: 16 });
        rows.forEach((r, i) => {
          const it = v.items[i];
          const p = prog(lt, 0.45 + i * 0.5, 1.3, E.std);
          const w = (it.value / max) * 100 * p;
          r.querySelector('.f').style.width = `${w.toFixed(2)}%`;
          const n = r.querySelector('.n');
          const inside = it.value / max > 0.45;
          n.style.left = inside ? '' : `calc(${w.toFixed(2)}% + 22px)`;
          n.style.right = inside ? '30px' : '';
          n.style.color = inside ? '#fff' : 'var(--on-surface)';
          n.style.opacity = clamp(p * 3).toFixed(3);
          if (/^[\d\s]+$/.test(it.display)) n.textContent = fmtInt(it.value * p);
          fx(r, lt, 0.2 + i * 0.5, null, { y: 20 });
        });
        fx(bdg, lt, 1.8, null, { y: 0, s: 0.3, ease: E.pop, rot: (Math.sin(lt * 0.8) * 4).toFixed(2) });
        fx(src, lt, 1.2, null, { y: 10 });
      },
    };
  },

  chips(v, line) {
    const six = v.items.length > 4;
    const pos = v.items.filter((i) => i.tone !== 'warn'), neg = v.items.filter((i) => i.tone === 'warn');
    const chip = (i) => `<div class="it ${i.tone || ''}">${icon(i.icon)}<b>${i.text}</b></div>`;
    const body = six
      ? `<div class="sec">Кто страдает</div>${pos.map(chip).join('')}<div class="sec">Причины</div>${neg.map(chip).join('')}`
      : v.items.map(chip).join('');
    const el = h(`<div class="vis v-chips"><h3>${v.title}</h3><div class="grid ${six ? 'six' : ''} ${v.items.length === 3 ? 'one' : ''}">${body}</div></div>`);
    const title = el.querySelector('h3');
    const its = [...el.querySelectorAll('.it, .sec')];
    const step = Math.min(0.45, (line.dur * 0.6) / its.length);
    return {
      el,
      update(lt) {
        fx(title, lt, 0, null, { y: 24 });
        its.forEach((it, i) => fx(it, lt, 0.2 + i * step, null, { y: 30, s: 0.9, ease: E.pop }));
      },
    };
  },

  law(v, line) {
    const K = {
      right: ['Право', 'balance'],
      duty: ['Обязанность', 'assignment_turned_in'],
      resp: ['Ответственность', 'gavel'],
      power: ['Полномочие', 'badge'],
    };
    const el = h(`<div class="vis v-law"><div class="grid">${v.items
      .map((i) => `<div class="lc k-${i.k}"><div class="hd">${icon(K[i.k][1])}${K[i.k][0]}</div><p>${i.text}</p><div class="ref">${i.ref}</div></div>`)
      .join('')}</div></div>`);
    const cards = [...el.querySelectorAll('.lc')];
    const step = Math.min(0.7, (line.dur * 0.55) / cards.length);
    return {
      el,
      update(lt) {
        cards.forEach((c, i) => fx(c, lt, i * step, null, { y: 40, s: 0.88, ease: E.pop }));
      },
    };
  },

  options(v, line) {
    const el = h(`<div class="vis v-opts">
      <div class="list">${v.items.map((o, i) => `<div class="op"><div class="no">${i + 1}</div>${icon(o.icon, 'ic')}<div><b>${o.title}</b><span>${o.sub}</span></div>
        <div class="st">${(v.reject || []).includes(i) ? `${icon("close")}Не моё` : `${icon("check_circle")}Выбрано`}</div></div>`).join('')}</div>
      <div class="crit">${v.criteria.map((c) => `<div>${icon("check")}${c}</div>`).join('')}</div>
      ${v.rule ? `<div class="rule">${icon("lightbulb")}${v.rule}</div>` : ''}
    </div>`);
    const ops = [...el.querySelectorAll('.op')], crit = [...el.querySelectorAll('.crit > div')], rule = el.querySelector('.rule');
    const pickAt = line.pickAt - line.start;
    const pickDur = line.visualEnd - line.pickAt;
    const step = (line.dur * 0.72) / ops.length;
    return {
      el,
      update(lt) {
        const picked = lt >= pickAt;
        const pp = prog(lt, pickAt, 0.5, E.std);
        ops.forEach((o, i) => {
          const isPick = v.pick.includes(i), isRej = (v.reject || []).includes(i);
          o.classList.toggle('pick', picked && isPick);
          o.classList.toggle('rej', picked && isRej);
          const st = o.querySelector('.st');
          st.style.display = picked && (isPick || isRej) ? '' : 'none';
          if (picked && (isPick || isRej)) fx(st, lt, pickAt + 0.1, null, { y: 0, x: 30, s: 0.7, ease: E.pop, din: 0.5 });
          const bump = picked && isPick ? Math.sin(Math.PI * clamp((lt - pickAt) / 0.45)) * 0.035 : 0;
          fx(o, lt, 0.05 + i * step, null, { x: 60, y: 0, s: 0.94, alpha: isPick ? 1 : lerp(1, 0.45, pp), scale: 1 + bump });
        });
        crit.forEach((c, i) => fx(c, lt, pickAt + 0.5 + i * 0.3, null, { y: 16, s: 0.8, ease: E.pop }));
        if (rule) fx(rule, lt, pickAt + Math.max(1.2, pickDur * 0.55), null, { y: 30, s: 0.9, ease: E.pop });
      },
    };
  },

  scene(v) {
    return SCENES[v.scene]();
  },
};

/* illustrated mini-scenes */
const SCENES = {
  trash() {
    const bags = [
      [330, 640, 1.0, '#455A64'], [400, 660, 1.2, '#37474F'], [600, 650, 0.9, '#546E7A'], [690, 668, 1.1, '#37474F'], [240, 668, 0.8, '#546E7A'],
    ];
    const bag = ([x, y, s, c], i) => `<g class="bag" style="transform-origin:${x}px ${y}px"><g transform="translate(${x} ${y}) scale(${s})">
      <path d="M-46 0 C-60 -30 -50 -78 -14 -86 L-8 -98 L8 -98 L14 -86 C50 -78 60 -30 46 0 Z" fill="${c}"/>
      <path d="M-8 -98 L-20 -112 M8 -98 L20 -112" stroke="${c}" stroke-width="7" stroke-linecap="round"/>
      <path d="M-26 -60 C-30 -40 -28 -22 -20 -10" stroke="rgba(255,255,255,.18)" stroke-width="7" fill="none" stroke-linecap="round"/></g></g>`;
    const litter = [
      `<g class="bag" style="transform-origin:520px 676px"><rect x="490" y="660" width="70" height="26" rx="10" fill="#81D4FA" transform="rotate(-18 520 676)"/><rect x="555" y="652" width="16" height="16" rx="4" fill="#0277BD" transform="rotate(-18 520 676)"/></g>`,
      `<g class="bag" style="transform-origin:770px 690px"><rect x="752" y="672" width="34" height="44" rx="8" fill="#E57373" transform="rotate(70 770 690)"/></g>`,
      `<g class="bag" style="transform-origin:160px 690px"><rect x="140" y="680" width="56" height="22" rx="9" fill="#AED581" transform="rotate(12 160 690)"/></g>`,
    ];
    const el = h(`<div class="vis v-scene">
      <svg viewBox="0 0 1040 740" preserveAspectRatio="xMidYMid slice">
        <rect width="1040" height="740" fill="#E3F2FD"/>
        <circle class="sun" cx="880" cy="130" r="64" fill="#FFE082"/>
        <rect x="110" y="250" width="440" height="260" rx="18" fill="#FFCC80"/>
        <rect x="90" y="226" width="480" height="44" rx="14" fill="#F57C00"/>
        <rect x="250" y="168" width="160" height="62" rx="14" fill="#fff"/>
        <text x="330" y="212" text-anchor="middle" font-family="Google Sans" font-weight="700" font-size="34" fill="#E65100">MAKTAB</text>
        ${[0, 1, 2, 3].map((c) => [0, 1].map((r) => `<rect x="${140 + c * 100}" y="${296 + r * 90}" width="70" height="58" rx="10" fill="#90CAF9"/>`).join('')).join('')}
        <rect x="300" y="420" width="64" height="90" rx="10" fill="#8D6E63"/>
        <rect x="660" y="330" width="20" height="190" fill="#8D6E63"/><circle cx="670" cy="300" r="90" fill="#81C784"/><circle cx="620" cy="350" r="60" fill="#66BB6A"/>
        <rect x="850" y="360" width="18" height="160" fill="#8D6E63"/><circle cx="860" cy="340" r="72" fill="#66BB6A"/>
        <rect y="500" width="1040" height="240" fill="#C5E1A5"/>
        <path d="M0 560 C200 540 400 580 620 556 C800 538 940 560 1040 552 L1040 612 C900 620 780 598 600 618 C400 640 200 600 0 620 Z" fill="#4FC3F7"/>
        <path class="wave" d="M40 586 q30 -10 60 0 t60 0 M300 596 q30 -10 60 0 t60 0 M640 584 q30 -10 60 0 t60 0" stroke="#E1F5FE" stroke-width="5" fill="none" stroke-linecap="round"/>
        ${litter.join('')}${bags.map(bag).join('')}
        ${[0, 1, 2, 3, 4].map(() => `<circle class="fly" r="5" fill="#212121"/>`).join('')}
      </svg>
      <div class="lbl warn">${icon("warning")}Стихийная свалка у арыка</div></div>`);
    const items = [...el.querySelectorAll('.bag')], flies = [...el.querySelectorAll('.fly')], lbl = el.querySelector('.lbl');
    const wave = el.querySelector('.wave');
    return {
      el,
      update(lt) {
        fx(el, lt, 0, null, { y: 40 });
        items.forEach((b, i) => {
          const p = prog(lt, 0.4 + i * 0.16, 0.6, E.pop);
          b.style.transform = `scale(${p.toFixed(3)})`;
        });
        flies.forEach((f, i) => {
          const cx = [360, 640, 420, 700, 260][i], cy = [560, 580, 540, 600, 600][i];
          const a = lt * (2.2 + i * 0.4) + i;
          f.setAttribute('cx', (cx + Math.cos(a) * 34 + Math.sin(a * 2.3) * 10).toFixed(1));
          f.setAttribute('cy', (cy + Math.sin(a * 1.3) * 22).toFixed(1));
          f.style.opacity = clamp((lt - 1.4) * 2);
        });
        wave.style.transform = `translateX(${(Math.sin(lt * 1.5) * 14).toFixed(1)}px)`;
        fx(lbl, lt, 1.0, null, { y: -20, s: 0.8, ease: E.pop });
      },
    };
  },

  smog() {
    const buildings = [
      [40, 380, 110, '#90A4AE'], [160, 300, 90, '#B0BEC5'], [470, 340, 120, '#90A4AE'], [600, 260, 100, '#78909C'],
      [710, 360, 130, '#B0BEC5'], [850, 290, 90, '#90A4AE'], [950, 400, 90, '#78909C'],
    ];
    const el = h(`<div class="vis v-scene">
      <svg viewBox="0 0 1040 740" preserveAspectRatio="xMidYMid slice">
        <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#90CAF9"/><stop offset="1" stop-color="#E3F2FD"/></linearGradient>
          <linearGradient id="smogG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8D8173" stop-opacity=".55"/><stop offset=".6" stop-color="#A1958A" stop-opacity=".9"/><stop offset="1" stop-color="#BCAAA4" stop-opacity=".95"/></linearGradient></defs>
        <rect width="1040" height="740" fill="url(#sky)"/>
        <circle cx="830" cy="150" r="70" fill="#FFD54F"/>
        <g fill="#607D8B">
          <path d="M306 600 L330 470 L354 600 Z" fill="#546E7A"/>
          <rect x="324" y="150" width="12" height="330"/>
          <rect x="331" y="70" width="4" height="90"/>
          <ellipse cx="330" cy="300" rx="44" ry="18"/><ellipse cx="330" cy="330" rx="34" ry="12"/>
          <ellipse cx="330" cy="200" rx="22" ry="9"/>
        </g>
        ${buildings.map(([x, y, w, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${600 - y}" rx="8" fill="${c}"/>
          ${Array.from({ length: Math.floor((600 - y - 30) / 46) }, (_, r) => `<rect x="${x + 16}" y="${y + 20 + r * 46}" width="${w - 32}" height="18" rx="5" fill="#ECEFF1" opacity=".7"/>`).join('')}`).join('')}
        <rect y="600" width="1040" height="140" fill="#CFD8DC"/>
        <rect y="650" width="1040" height="8" fill="#fff" opacity=".7"/>
        <g class="cars">${[0, 1, 2, 3].map((i) => `<g class="car"><rect x="0" y="-36" width="110" height="40" rx="14" fill="${['#E53935', '#1E88E5', '#FDD835', '#43A047'][i]}"/><rect x="18" y="-58" width="70" height="28" rx="10" fill="${['#E53935', '#1E88E5', '#FDD835', '#43A047'][i]}"/><circle cx="26" cy="6" r="13" fill="#263238"/><circle cx="86" cy="6" r="13" fill="#263238"/></g>`).join('')}</g>
        <rect class="smog" width="1040" height="740" fill="url(#smogG)"/>
        ${[0, 1, 2].map((i) => `<ellipse class="puff" cx="${200 + i * 320}" cy="${360 + (i % 2) * 90}" rx="260" ry="80" fill="#A1958A" opacity=".35"/>`).join('')}
      </svg>
      <div class="lbl warn">${icon("masks")}Смог над Ташкентом</div></div>`);
    const smog = el.querySelector('.smog'), puffs = [...el.querySelectorAll('.puff')], cars = [...el.querySelectorAll('.car')];
    const lbl = el.querySelector('.lbl');
    return {
      el,
      update(lt) {
        fx(el, lt, 0, null, { y: 40 });
        const p = prog(lt, 0.4, 2.6, E.std);
        smog.style.opacity = (p * 0.85).toFixed(3);
        puffs.forEach((pf, i) => {
          pf.style.opacity = (p * 0.45).toFixed(3);
          pf.style.transform = `translateX(${(Math.sin(lt * 0.4 + i * 2) * 60).toFixed(1)}px)`;
        });
        cars.forEach((c, i) => {
          const dir = i % 2 ? -1 : 1;
          const x = (((lt * (110 + i * 25) + i * 300) % 1300) - 150) * dir + (dir < 0 ? 1040 : 0);
          c.setAttribute('transform', `translate(${x.toFixed(1)} ${i % 2 ? 640 : 700})`);
        });
        fx(lbl, lt, 1.2, null, { y: -20, s: 0.8, ease: E.pop });
      },
    };
  },

  water() {
    const drop = 'M520 80 C520 80 340 290 340 410 A180 180 0 0 0 700 410 C700 290 520 80 520 80 Z';
    const el = h(`<div class="vis v-scene">
      <svg viewBox="0 0 1040 740" preserveAspectRatio="xMidYMid slice">
        <defs><clipPath id="dropClip"><path d="${drop}"/></clipPath>
          <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF8E1"/><stop offset="1" stop-color="#FFE0B2"/></linearGradient></defs>
        <rect width="1040" height="740" fill="url(#sand)"/>
        <rect y="590" width="1040" height="150" fill="#D7B48A"/>
        <path d="M60 640 L140 660 L180 700 M300 620 L360 650 L350 700 L420 730 M600 630 L660 670 L740 660 L790 710 M880 620 L930 670 L1000 680" stroke="#B08860" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${drop}" fill="#E1F5FE"/>
        <g clip-path="url(#dropClip)"><path class="w2" fill="#81D4FA"/><path class="w1" fill="#29B6F6"/></g>
        <path d="${drop}" fill="none" stroke="#0288D1" stroke-width="10"/>
        <path d="M430 380 C430 330 460 280 480 250" stroke="#fff" stroke-width="16" stroke-linecap="round" fill="none" opacity=".75"/>
      </svg>
      <div class="lbl">${icon("water_drop")}Вода — это жизнь</div>
      <div class="lbl warn" style="top:auto;bottom:34px;left:auto;right:34px">${icon("trending_down")}Её всё меньше</div></div>`);
    const w1 = el.querySelector('.w1'), w2 = el.querySelector('.w2'), lbls = el.querySelectorAll('.lbl');
    const wave = (level, ph, amp) => {
      let d = `M300 ${level}`;
      for (let x = 300; x <= 740; x += 20) d += ` L${x} ${(level + Math.sin(x / 38 + ph) * amp).toFixed(1)}`;
      return `${d} L740 620 L300 620 Z`;
    };
    return {
      el,
      update(lt) {
        fx(el, lt, 0, null, { y: 40 });
        const level = lerp(170, 470, prog(lt, 0.8, 3.2, E.std));
        w1.setAttribute('d', wave(level + 10, lt * 3, 10));
        w2.setAttribute('d', wave(level, lt * 2.2 + 1.5, 12));
        fx(lbls[0], lt, 0.4, null, { y: -20, s: 0.8, ease: E.pop });
        fx(lbls[1], lt, 2.0, null, { y: 20, s: 0.8, ease: E.pop });
      },
    };
  },
};

/* ---------- scenes ---------- */
class Scene {
  constructor(data, stage, z) {
    this.d = data;
    this.el = h(`<section class="scene ${data.type}"></section>`);
    this.el.style.zIndex = z;
    stage.appendChild(this.el);
  }
  visible(t) {
    return t >= this.d.start && t < this.d.end + 0.9;
  }
  lineById(id) {
    return this.d.lines.find((l) => l.id === id);
  }
}

class CastScene extends Scene {
  // Shared by intro and outro: four character cards in a row.
  buildCast(cast) {
    const row = h('<div class="cast"></div>');
    this.cards = Object.entries(cast).map(([k, c], i) => {
      const card = h(`<div class="ccard th-${k}"><div class="tag"><b>${c.name}</b><span>${c.role}</span></div></div>`);
      card.prepend(deco(['cookie', 'flower', 'clover', 'burst'][i], 40, 40, 300));
      mountChar(card, k).style.bottom = '0';
      row.appendChild(card);
      return { k, el: card, role: card.querySelector('.tag span') };
    });
    this.el.appendChild(row);
  }
  castWeights(t) {
    const w = {};
    for (const c of this.cards) {
      w[c.k] = 0;
      for (const l of this.d.lines) if (l.who === c.k) w[c.k] = Math.max(w[c.k], win(t, l.start - 0.25, l.end + 0.25, 0.3));
    }
    return w;
  }
}

class Intro extends CastScene {
  constructor(data, stage, z, story) {
    super(data, stage, z);
    this.el.append(deco('cookie', -160, -200, 620), deco('flower', 1460, 640, 620, 'alt'));
    this.title = h(`<div class="big-title">Если бы я<em>...</em></div>`);
    this.sub = h(`<div class="big-sub">${story.subtitle}</div>`);
    this.el.append(this.title, this.sub);
    this.buildCast(story.cast);
    this.roleAt = { A: 'I2', M: 'I3', T: 'I4', N: 'I5' };
  }
  update(t) {
    const lt = t - this.d.start;
    this.el.style.opacity = 1;
    spinDeco(this.el, t);
    fx(this.title, lt, 0.1, null, { y: 50, s: 0.9 });
    fx(this.sub, lt, 0.4, null, { y: 20 });
    const w = this.castWeights(t);
    const any = Math.max(...Object.values(w));
    this.cards.forEach((c, i) => {
      const lift = w[c.k];
      fx(c.el, lt, 0.5 + i * 0.12, null, { y: 90, s: 0.85, ease: E.pop, dy: -22 * lift, scale: 1 + 0.03 * lift, alpha: 1 - 0.28 * (any - lift) });
      const line = this.lineById(this.roleAt[c.k]);
      c.role.style.opacity = clamp((t - line.start) / 0.4).toFixed(3);
    });
  }
}

class Block extends Scene {
  constructor(data, stage, z, story) {
    super(data, stage, z);
    const c = story.cast[data.who];
    this.el.classList.add(`th-${data.who}`);
    this.el.append(deco('soft', 1180, 520, 900, 'alt'), deco('cookie', -220, 760, 520, 'alt'));

    this.appbar = h(`<div class="appbar"><div class="av"></div><div class="nm"><b>${c.name}</b><span>${c.role}</span></div>
      <div class="steps">${['Проблема', 'Основная часть', 'Решение'].map((s, i) => `<div class="step"><i>${i + 1}</i>${s}</div>`).join('')}</div></div>`);
    mountChar(this.appbar.querySelector('.av'), data.who, true);
    this.steps = [...this.appbar.querySelectorAll('.step')];

    this.stagecard = h(`<div class="stagecard"><div class="topic">${icon(data.icon)}${data.topic}</div></div>`);
    this.stagecard.prepend(deco('cookie', 70, 60, 560));
    mountChar(this.stagecard, data.who);

    this.panel = h('<div class="panel"></div>');
    const withVis = data.lines.filter((l) => l.visual);
    this.visuals = withVis.map((l, i) => {
      const v = VISUALS[l.visual.type](l.visual, l);
      this.panel.appendChild(v.el);
      const next = withVis[i + 1];
      return { ...v, start: l.start - 0.1, end: next ? next.start - 0.25 : null };
    });

    this.tcard = h(`<div class="tcard"><div class="num">${data.num}</div>
      <div class="shape">${shapeSVG('cookie')}${icon(data.icon)}</div>
      <div class="topic">${data.topic}</div>
      <div class="who"><div class="dot"></div>${c.name} · ${c.role}</div></div>`);
    mountChar(this.tcard.querySelector('.dot'), data.who, true);
    this.tparts = [...this.tcard.children];
    this.el.append(this.appbar, this.stagecard, this.panel, this.tcard);
  }
  update(t) {
    const d = this.d, lt = t - d.start, cs = d.contentStart;
    spinDeco(this.el, t);
    // Title card: circular reveal from the shape, then shrinks into the avatar.
    const grow = prog(t, d.start, 0.8, E.emph);
    const shrink = prog(t, cs - 0.35, 0.65, E.acc);
    const r = grow * 2300 * (1 - shrink);
    const cx = lerp(1450, 106, shrink), cy = lerp(510, 84, shrink);
    this.tcard.style.visibility = r < 1 ? 'hidden' : 'visible';
    this.tcard.style.clipPath = `circle(${r.toFixed(1)}px at ${cx.toFixed(1)}px ${cy.toFixed(1)}px)`;
    const [num, shape, topic, who] = this.tparts;
    fx(num, lt, 0.2, null, { x: -80, y: 0 });
    fx(shape, lt, 0.15, null, { y: 0, s: 0.5, ease: E.pop, rot: (lt * 12).toFixed(2) });
    shape.querySelector('.ms').style.transform = `rotate(${(-lt * 12).toFixed(2)}deg)`;
    fx(topic, lt, 0.3, null, { y: 50 });
    fx(who, lt, 0.5, null, { y: 30 });

    // Under the card: hidden while it grows so the previous scene shows around the circle.
    const under = t >= d.start + 0.8 ? 1 : 0;
    this.el.style.background = under ? '' : 'transparent';
    for (const n of this.el.querySelectorAll(':scope > .deco')) n.style.opacity = under ? '' : 0;
    fx(this.appbar, t, cs - 0.2, null, { y: -30, s: 1, alpha: under });
    fx(this.stagecard, t, cs - 0.25, null, { x: -60, y: 0, s: 0.94, alpha: under });

    d.parts.forEach((p, i) => {
      const next = d.parts[i + 1];
      const on = t >= p.start && (!next || t < next.start);
      const done = next && t >= next.start;
      const s = this.steps[i];
      const cls = `step${on ? ' on' : ''}${done ? ' done' : ''}`;
      if (s.className !== cls) {
        s.className = cls;
        s.querySelector('i').innerHTML = done ? icon("check") : String(i + 1);
      }
      const bump = Math.sin(Math.PI * clamp((t - p.start) / 0.4)) * 0.08;
      s.style.transform = `scale(${(1 + bump).toFixed(3)})`;
    });

    for (const v of this.visuals) {
      const show = t >= v.start - 0.05 && (v.end == null || t < v.end + 0.5);
      v.el.style.display = show ? '' : 'none';
      if (!show) continue;
      v.update(t - v.start, t);
      if (v.end != null && t > v.end) {
        const q = E.acc(clamp((t - v.end) / 0.35));
        v.el.style.opacity = (parseFloat(v.el.style.opacity || 1) * (1 - q)).toFixed(3);
        v.el.style.transform = `${v.el.style.transform || ''} translateY(${(-30 * q).toFixed(1)}px)`;
      }
    }
  }
}

class Outro extends CastScene {
  constructor(data, stage, z, story) {
    super(data, stage, z);
    this.el.append(deco('flower', -200, 560, 640), deco('cookie', 1500, -220, 600, 'alt'));
    this.buildCast(story.cast);
    const acts = [
      ['A', 'elderly', 'Научить бабушку'], ['M', 'cleaning_services', 'Выйти на хашар'],
      ['T', 'park', 'Посадить дерево'], ['N', 'water_drop', 'Закрыть кран'],
    ];
    this.acts = h(`<div class="acts">${acts.map(([k, ic, tx]) => `<div class="act th-${k}">${icon(ic)}${tx}</div>`).join('')}</div>`);
    this.quote = h(`<div class="quote">Не «если бы я», а <em>«я начну сегодня»</em><div style="font-size:40px;font-weight:500;letter-spacing:0;color:var(--on-surface-v);margin-top:22px">Спасибо за внимание!</div></div>`);
    this.el.append(this.acts, this.quote);
    this.lineById('O4').noSub = true;
  }
  update(t) {
    const d = this.d, lt = t - d.start;
    this.el.style.opacity = prog(t, d.start, 0.6, E.std).toFixed(3);
    spinDeco(this.el, t);
    const w = this.castWeights(t);
    const any = Math.max(...Object.values(w));
    this.cards.forEach((c, i) => {
      const lift = w[c.k];
      fx(c.el, lt, 0.2 + i * 0.1, null, { y: 70, s: 0.9, ease: E.pop, dy: -18 * lift, scale: 1 + 0.03 * lift, alpha: 1 - 0.25 * (any - lift) });
    });
    const o3 = this.lineById('O3'), o4 = this.lineById('O4');
    [...this.acts.children].forEach((a, i) => fx(a, t, o3.start + i * (o3.dur / 4.5), null, { y: 30, s: 0.7, ease: E.pop }));
    fx(this.quote, t, o4.start - 0.1, null, { y: 40, s: 0.92 });
    fx(this.quote.lastElementChild, t, o4.start + o4.dur * 0.62, null, { y: 16 });
  }
}

class Sources extends Scene {
  constructor(data, stage, z, story) {
    super(data, stage, z);
    this.el.append(deco('cookie', 1480, -180, 600, 'alt'));
    this.title = h('<h2>Источники</h2>');
    this.list = h(`<ol>${data.items.map((s, i) => `<li><i>${i + 1}</i>${s}</li>`).join('')}</ol>`);
    this.foot = h(`<div class="foot">${icon("groups")}Выполнили: ${story.team.join(', ')} · ${story.subtitle}</div>`);
    this.el.append(this.title, this.list, this.foot);
  }
  update(t) {
    const lt = t - this.d.start;
    this.el.style.opacity = prog(t, this.d.start, 0.6, E.std).toFixed(3);
    spinDeco(this.el, t);
    fx(this.title, lt, 0.1, null, { y: 30 });
    [...this.list.children].forEach((li, i) => fx(li, lt, 0.3 + i * 0.12, null, { x: 40, y: 0 }));
    fx(this.foot, lt, 1.2, null, { y: 10 });
  }
}

/* ---------- boot ---------- */
async function load() {
  const story = await (await fetch('../story.json', { cache: 'no-store' })).json();
  let timing = null;
  try {
    const r = await fetch('../voice/timing.json', { cache: 'no-store' });
    if (r.ok) timing = await r.json();
  } catch { /* no voice-overs yet */ }
  return { story, timing };
}

const { story, timing } = await load();
TIMING = timing;
TL = buildTimeline(story, timing);
BY_WHO = {};
for (const k of Object.keys(story.cast)) BY_WHO[k] = TL.lines.filter((l) => l.who === k);

const stage = document.getElementById('stage');
const CLASSES = { intro: Intro, block: Block, outro: Outro, sources: Sources };
const scenes = TL.scenes.map((s, i) => new CLASSES[s.type](s, stage, i + 1, story));
const subs = new Subtitles(stage, story.cast);

function renderAt(t) {
  for (const s of scenes) {
    const vis = s.visible(t);
    s.el.style.visibility = vis ? 'visible' : 'hidden';
    if (vis) s.update(t);
  }
  for (const c of chars) {
    if (c.svg.closest('.scene')?.style.visibility === 'hidden') continue;
    animateChar(c, t);
  }
  subs.update(t);
}

await document.fonts.ready;
await Promise.all([
  document.fonts.load('700 40px "Google Sans"', 'АБВ'),
  document.fonts.load('500 40px "Google Sans"', 'АБВ'),
  document.fonts.load('48px "Material Symbols Rounded"', 'check'),
]);

window.__video = { duration: TL.duration, fps: TL.fps, renderAt, timeline: TL };
renderAt(+(params.get('t') || 0));
window.__ready = true;

if (!RENDER) {
  // Live preview: scale to the window, space = pause, arrows = seek.
  const fit = () => {
    const k = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `scale(${k})`;
    stage.style.transformOrigin = '0 0';
    document.body.style.width = document.body.style.height = 'auto';
  };
  fit();
  addEventListener('resize', fit);
  let t0 = +(params.get('t') || 0), playing = !params.has('pause'), base = performance.now();
  const audio = new Audio('../out/audio.m4a');
  const now = () => (playing ? t0 + (performance.now() - base) / 1000 : t0);
  const seek = (t) => {
    t0 = clamp(t, 0, TL.duration);
    base = performance.now();
    audio.currentTime = t0;
  };
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      t0 = now(); base = performance.now(); playing = !playing;
      playing ? audio.play().catch(() => {}) : audio.pause();
    }
    if (e.code === 'ArrowRight') seek(now() + 5);
    if (e.code === 'ArrowLeft') seek(now() - 5);
  });
  addEventListener('click', () => { audio.currentTime = now(); audio.play().catch(() => {}); }, { once: true });
  const loop = () => {
    renderAt(Math.min(now(), TL.duration));
    requestAnimationFrame(loop);
  };
  loop();
}
