// The four students as pixel-art portraits. tools/sprites.js draws them (tools/portraits.js),
// pixelates them and writes scene/sprites/<who>.png: 8 frames in a row, frame = mouth * 2 + blink,
// mouth 0 (closed) … 3 (wide open).

export const FRAMES = 8;

export function frameIndex(mouth, blink) {
  return mouth * 2 + (blink ? 1 : 0);
}

// avatar: head-only crop for the app bar, subtitles and title cards.
export function characterHTML(who, avatar = false) {
  return `<div class="char${avatar ? ' char--avatar' : ''}"><div class="sheet" style="background-image:url(sprites/${who}.png)"></div></div>`;
}
