// Builds the video timeline from story.json. Shared by the page (scene/app.js)
// and by the Node/Python tools, so it must not touch the DOM.

export const T = {
  introPre: 1.3,
  introPost: 0.5,
  blockTitle: 1.7,
  blockPost: 0.5,
  outroPre: 0.7,
  outroPost: 1.0,
  lineGap: 0.22,
  partGap: 0.35,
};

const VOWELS = /[аеёиоуыэюяaeiouy]/gi;
const PAUSES = /[.,—:!?…]/g;

// Rough length of a line read aloud, used until real voice-overs exist.
export function estimateDuration(text) {
  const syllables = (text.match(VOWELS) || []).length;
  const pauses = (text.match(PAUSES) || []).length;
  return Math.max(0.9, syllables / 5.6 + 0.2 + pauses * 0.1);
}

export function spoken(line) {
  return line.say || line.text;
}

export function sceneLines(scene) {
  const lines = [...(scene.lines || [])];
  for (const part of scene.parts || []) {
    for (const line of part.lines) lines.push({ ...line, part: part.part });
  }
  return lines;
}

// timing: optional { lines: { A1: { dur: 3.2 } } } produced by tools/voices.py
export function buildTimeline(story, timing) {
  const durOf = (line) => timing?.lines?.[line.id]?.dur ?? estimateDuration(spoken(line));
  const scenes = [];
  const lines = [];
  let t = 0;

  const placeLines = (scene, list, start) => {
    let at = start;
    let prevPart = null;
    for (const line of list) {
      if (prevPart && line.part && line.part !== prevPart) at += T.partGap;
      const dur = durOf(line);
      const placed = { ...line, scene: scene.id, start: at, end: at + dur, dur, voiced: !!timing?.lines?.[line.id] };
      lines.push(placed);
      scene.lines.push(placed);
      prevPart = line.part || prevPart;
      at += dur + T.lineGap;
    }
    return at - T.lineGap;
  };

  for (const src of story.scenes) {
    const scene = { ...src, start: t, lines: [] };
    delete scene.parts;
    if (src.type === 'intro') {
      const end = placeLines(scene, sceneLines(src), t + T.introPre);
      scene.end = end + T.introPost;
    } else if (src.type === 'block') {
      scene.contentStart = t + T.blockTitle;
      const end = placeLines(scene, sceneLines(src), scene.contentStart + 0.4);
      scene.end = end + T.blockPost;
      scene.parts = src.parts.map((p) => {
        const own = scene.lines.filter((l) => l.part === p.part);
        return { part: p.part, start: own[0].start - 0.25, end: own[own.length - 1].end };
      });
    } else if (src.type === 'outro') {
      const end = placeLines(scene, sceneLines(src), t + T.outroPre);
      scene.end = end + T.outroPost;
    } else {
      scene.end = t + (src.duration || 6);
    }
    scenes.push(scene);
    t = scene.end;
  }

  // A visual with "hold: n" stays on screen for the n lines that follow it.
  for (let i = 0; i < lines.length; i++) {
    const v = lines[i].visual;
    if (!v) continue;
    const last = lines[Math.min(lines.length - 1, i + (v.hold || 0))];
    lines[i].visualEnd = last.end;
    if (v.hold) lines[i].pickAt = lines[i + 1].start;
  }

  return { duration: t, scenes, lines, fps: story.fps, width: story.width, height: story.height };
}
