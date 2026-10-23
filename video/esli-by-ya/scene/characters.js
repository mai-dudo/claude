// Flat, Material-style busts of the four characters. Each returns an SVG string;
// the page animates .c-body (breathing), .c-head (tilt), .c-eyes (blink) and
// .c-mouth (lip flap, see mouthPath).

let uid = 0;

const NECK = 'M262 380 L262 476 Q300 500 338 476 L338 380 Z';
const SHOULDERS = 'M64 720 C70 588 160 520 300 514 C440 520 530 588 536 720 Z';

export function mouthPath(open, cy = 374) {
  const w = 25 - open * 4;
  const top = cy + 3 - open * 3;
  const bottom = cy + 12 + open * 30;
  return `M${300 - w} ${cy} Q300 ${top} ${300 + w} ${cy} Q300 ${bottom} ${300 - w} ${cy} Z`;
}

function face({ skin, shade, blush, hair, eyeRy = 13, browW = 8, browLift = 0, mouthY = 374 }) {
  return `
    <ellipse cx="190" cy="298" rx="18" ry="28" fill="${skin}"/>
    <ellipse cx="410" cy="298" rx="18" ry="28" fill="${skin}"/>
    <path d="M188 272 C188 172 240 150 300 150 C360 150 412 172 412 272 C412 352 372 426 300 430 C228 426 188 352 188 272 Z" fill="${skin}"/>
    <circle cx="236" cy="344" r="17" fill="${blush}" opacity=".32"/>
    <circle cx="364" cy="344" r="17" fill="${blush}" opacity=".32"/>
    <path d="M236 ${262 - browLift} Q258 ${251 - browLift} 279 ${259 - browLift}" stroke="${hair}" stroke-width="${browW}" stroke-linecap="round" fill="none"/>
    <path d="M321 ${259 - browLift} Q342 ${251 - browLift} 364 ${262 - browLift}" stroke="${hair}" stroke-width="${browW}" stroke-linecap="round" fill="none"/>
    <g class="c-eyes" style="transform-origin:300px 300px">
      <ellipse cx="258" cy="300" rx="10.5" ry="${eyeRy}" fill="#2B2220"/>
      <ellipse cx="342" cy="300" rx="10.5" ry="${eyeRy}" fill="#2B2220"/>
      <circle cx="261.5" cy="295" r="3.6" fill="#fff"/>
      <circle cx="345.5" cy="295" r="3.6" fill="#fff"/>
    </g>
    <path d="M300 304 Q291 334 300 340 Q306 343 311 338" stroke="${shade}" stroke-width="5" stroke-linecap="round" fill="none"/>
    <path class="c-mouth" data-cy="${mouthY}" d="${mouthPath(0, mouthY)}" fill="#6B2626"/>`;
}

function wrap(inner, { back = '', viewBox = '0 0 600 720', cls = '' } = {}) {
  return `<svg class="char ${cls}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g class="c-body">
      <g class="c-head" style="transform-origin:300px 470px">${back}</g>
      ${inner.body}
      <g class="c-head" style="transform-origin:300px 470px">
        ${inner.head}
      </g>
    </g>
  </svg>`;
}

// Гутко — лидер молодёжи махалли: худи, бейдж на шнурке.
function gutko() {
  const skin = '#E2A77F', shade = '#C4865E', hair = '#1E1A19';
  return {
    body: `
      <path d="${NECK}" fill="${shade}"/>
      <path d="${SHOULDERS}" fill="#4355B9"/>
      <path d="M196 528 C206 462 252 452 300 474 C348 452 394 462 404 528 C368 556 232 556 196 528 Z" fill="#33439E"/>
      <path d="M258 486 Q300 470 342 486 L300 540 Z" fill="#26348A"/>
      <path d="M282 536 L276 622" stroke="#E8EAF6" stroke-width="7" stroke-linecap="round"/>
      <path d="M318 536 L324 622" stroke="#E8EAF6" stroke-width="7" stroke-linecap="round"/>
      <circle cx="276" cy="626" r="6" fill="#E8EAF6"/><circle cx="324" cy="626" r="6" fill="#E8EAF6"/>
      <path d="M268 544 L352 630 M332 544 L378 630" stroke="#FFB74D" stroke-width="5" fill="none"/>
      <rect x="326" y="628" width="78" height="92" rx="12" fill="#fff"/>
      <rect x="326" y="628" width="78" height="26" rx="12" fill="#FFB74D"/>
      <rect x="326" y="642" width="78" height="12" fill="#FFB74D"/>
      <circle cx="365" cy="680" r="13" fill="#C5CAE9"/>
      <rect x="342" y="700" width="46" height="7" rx="3.5" fill="#C5CAE9"/>`,
    head: `${face({ skin, shade, blush: '#E8806A', hair, eyeRy: 14 })}
      <path d="M186 284 C172 196 220 138 302 136 C376 134 426 184 416 276 C410 244 398 226 380 216 C356 236 306 240 266 226 C244 238 214 250 198 296 Z" fill="${hair}"/>
      <path d="M230 168 L246 128 L262 160 L284 120 L300 156 L326 122 L336 160 L366 140 L360 178 Z" fill="${hair}"/>`,
  };
}

// Бурханов — председатель махалли: тюбетейка-дуппи, зелёный пиджак, платок из адраса в кармане.
function burkhanov() {
  const skin = '#DDA27A', shade = '#BF845C', hair = '#1F1A18';
  const id = `ikat${++uid}`;
  const pepper = (x, y, r) => `<path transform="translate(${x} ${y}) rotate(${r})" d="M0 12 C-11 2 -7 -14 6 -14 C1 -7 4 2 0 12 Z" fill="#fff"/>`;
  return {
    body: `
      <defs>
        <pattern id="${id}" width="22" height="15" patternUnits="userSpaceOnUse">
          <rect width="22" height="15" fill="#C2185B"/>
          <path d="M0 7.5 L5.5 2 L11 7.5 L16.5 2 L22 7.5 L22 15 L16.5 9.5 L11 15 L5.5 9.5 L0 15 Z" fill="#FBC02D"/>
          <path d="M0 7.5 L5.5 4.5 L11 7.5 L16.5 4.5 L22 7.5 L16.5 10.5 L11 7.5 L5.5 10.5 Z" fill="#1565C0"/>
        </pattern>
      </defs>
      <path d="${NECK}" fill="${shade}"/>
      <path d="${SHOULDERS}" fill="#386A20"/>
      <path d="M250 512 L300 604 L350 512 Z" fill="#FFFFFF"/>
      <path d="M262 506 L300 530 L338 506 L344 520 L300 548 L256 520 Z" fill="#E8F5E9"/>
      <path d="M246 516 L300 612 L262 720 L200 720 L174 560 Z" fill="#2B5317"/>
      <path d="M354 516 L300 612 L338 720 L400 720 L426 560 Z" fill="#2B5317"/>
      <path d="M362 610 L404 602 L410 632 L366 640 Z" fill="url(#${id})"/>
      <path d="M358 638 L414 628 L416 640 L360 650 Z" fill="#244A13"/>`,
    head: `${face({ skin, shade, blush: '#D98670', hair, eyeRy: 12, browW: 9 })}
      <path d="M190 290 C186 246 194 226 206 214 L214 266 Z" fill="${hair}"/>
      <path d="M410 290 C414 246 406 226 394 214 L386 266 Z" fill="${hair}"/>
      <path d="M202 226 L212 158 C252 136 348 136 388 158 L398 226 C342 206 258 206 202 226 Z" fill="#1A1A1A"/>
      <path d="M206 218 C262 200 338 200 394 218" stroke="#fff" stroke-width="5" fill="none"/>
      ${pepper(250, 182, -20)}${pepper(300, 176, 0)}${pepper(350, 182, 20)}`,
  };
}

// Усманов — хоким: костюм, галстук, значок с флагом, усы.
function usmanov() {
  const skin = '#D49A6E', shade = '#B57B52', hair = '#2A2522';
  return {
    body: `
      <path d="${NECK}" fill="${shade}"/>
      <path d="${SHOULDERS}" fill="#2E3B4E"/>
      <path d="M248 512 L300 600 L352 512 Z" fill="#FFFFFF"/>
      <path d="M286 528 L314 528 L320 548 L300 562 L280 548 Z" fill="#C25700"/>
      <path d="M282 556 L300 562 L318 556 L330 690 L300 720 L270 690 Z" fill="#E65100"/>
      <path d="M244 514 L298 612 L258 720 L196 720 L172 562 Z" fill="#243041"/>
      <path d="M356 514 L302 612 L342 720 L404 720 L428 562 Z" fill="#243041"/>
      <g transform="translate(364 598)">
        <rect width="34" height="24" rx="4" fill="#fff"/>
        <rect width="34" height="8" rx="3" fill="#0099B5"/>
        <rect y="16" width="34" height="8" rx="3" fill="#1EB53A"/>
        <rect y="8" width="34" height="1.6" fill="#CE1126"/><rect y="14.4" width="34" height="1.6" fill="#CE1126"/>
      </g>`,
    head: `${face({ skin, shade, blush: '#C97A62', hair, eyeRy: 11, browW: 11, browLift: 2, mouthY: 380 })}
      <path d="M262 362 C280 348 296 352 300 358 C304 352 320 348 338 362 C324 372 306 368 300 364 C294 368 276 372 262 362 Z" fill="${hair}"/>
      <path d="M188 262 C180 190 226 144 302 140 C374 138 422 186 412 262 C406 236 396 220 380 212 C346 222 300 214 266 196 C238 214 206 228 188 262 Z" fill="${hair}"/>
      <path d="M266 196 C290 170 330 160 372 170" stroke="#4A433F" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M190 268 C188 248 192 232 200 220 L206 262 Z" fill="#9E9A96"/>
      <path d="M410 268 C412 248 408 232 400 220 L394 262 Z" fill="#9E9A96"/>`,
  };
}

// Тропачев — министр водного хозяйства: очки, костюм цвета воды, значок-капля.
function tropachev() {
  const skin = '#F0C8A8', shade = '#D8A886', hair = '#6B4A33';
  return {
    body: `
      <path d="${NECK}" fill="${shade}"/>
      <path d="${SHOULDERS}" fill="#006A6A"/>
      <path d="M248 512 L300 600 L352 512 Z" fill="#FFFFFF"/>
      <path d="M286 528 L314 528 L320 548 L300 562 L280 548 Z" fill="#01579B"/>
      <path d="M282 556 L300 562 L318 556 L330 690 L300 720 L270 690 Z" fill="#0288D1"/>
      <path d="M288 600 L312 590 M284 640 L318 626 M280 680 L322 664" stroke="#4FC3F7" stroke-width="5" stroke-linecap="round"/>
      <path d="M244 514 L298 612 L258 720 L196 720 L172 562 Z" fill="#004F4F"/>
      <path d="M356 514 L302 612 L342 720 L404 720 L428 562 Z" fill="#004F4F"/>
      <path d="M380 596 C380 596 368 612 368 620 A12 12 0 0 0 392 620 C392 612 380 596 380 596 Z" fill="#4DD0E1"/>`,
    head: `${face({ skin, shade, blush: '#E8907C', hair, eyeRy: 13 })}
      <rect x="226" y="278" width="64" height="46" rx="18" fill="none" stroke="#3A2E2A" stroke-width="5"/>
      <rect x="310" y="278" width="64" height="46" rx="18" fill="none" stroke="#3A2E2A" stroke-width="5"/>
      <path d="M290 298 Q300 290 310 298" stroke="#3A2E2A" stroke-width="5" fill="none"/>
      <path d="M186 282 C176 190 228 138 304 136 C380 136 428 188 414 282 C408 238 392 214 368 204 C330 216 270 212 238 194 C216 214 198 240 186 282 Z" fill="${hair}"/>
      <path d="M238 194 C262 156 336 146 384 176 C346 168 290 174 238 194 Z" fill="#8A6446"/>`,
  };
}

const BUILDERS = { A: gutko, M: burkhanov, T: usmanov, N: tropachev };

export function characterSVG(who, opts = {}) {
  const parts = BUILDERS[who]();
  return wrap(parts, { back: parts.back || '', ...opts });
}

// Head-only crop for avatars in the app bar.
export function avatarSVG(who) {
  return characterSVG(who, { viewBox: '150 110 300 300', cls: 'char--avatar' });
}
