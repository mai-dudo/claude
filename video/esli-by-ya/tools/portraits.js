// Semi-realistic head-and-shoulders portraits of the four students (600×720 SVG).
// tools/sprites.js renders them and tools/pixelate.py turns them into pixel art.
// mouth: 0 closed … 3 wide open; blink: eyes closed.

// Anatomy shared by everyone: skull top ~140, eyes 290 (half of skull–chin), nose 346,
// mouth 380, chin 434. Neck ~130 wide (≈60 % of the jaw), shoulders ≈2.5 head widths.
const FACE = 'M300 140 C362 140 404 172 408 240 L410 296 C410 338 402 364 390 384 C370 414 338 432 300 434 C262 432 230 414 210 384 C198 364 190 338 190 296 L192 240 C196 172 238 140 300 140 Z';
const NECK = 'M238 372 L236 482 C262 506 338 506 364 482 L362 372 Z';
const TORSO = 'M16 740 L26 606 C36 562 92 540 164 522 C212 510 238 496 250 482 L350 482 C362 496 388 510 436 522 C508 540 564 562 574 606 L584 740 Z';

export const CAST = {
  A: { // Гутко — лидер молодёжи: тёмно-синий пиджак, бейдж на шнурке, кроп с чёлкой
    skin: '#E9BE9C', shade: '#C38C6C', lip: '#C9867A', lipDark: '#A0605A', iris: '#4B3324',
    hair: '#4A3428', hairDark: '#2E1F17', hairLight: '#6E5040', style: 'crop',
    outfit: 'blazer', cloth: '#26324F', clothDark: '#19223A', badge: true,
  },
  M: { // Бурханов — председатель махалли: тёмно-зелёный жилет на белой рубашке, полубокс
    skin: '#D6A07A', shade: '#AE7652', lip: '#B97163', lipDark: '#8E4C43', iris: '#2E1D14',
    hair: '#17120F', hairDark: '#0B0807', hairLight: '#352A24', style: 'short',
    outfit: 'vest', cloth: '#2F4A36', clothDark: '#213527',
  },
  T: { // Усманов — хоким: чёрный пиджак, галстук, значок с флагом, квиф
    skin: '#CB936A', shade: '#A26C48', lip: '#B06A5C', lipDark: '#87493F', iris: '#2A1B12',
    hair: '#1A1412', hairDark: '#0C0908', hairLight: '#3A302B', style: 'quiff',
    outfit: 'blazer', cloth: '#24272E', clothDark: '#17191E', tie: '#B4421C', tieDark: '#86300F', flag: true,
  },
  N: { // Тропачев — министр водного хозяйства: очки, бирюзово-серый свитер, косая чёлка
    skin: '#F1CFB3', shade: '#D2A486', lip: '#D08E84', lipDark: '#A86A62', iris: '#5E7C8E',
    hair: '#7B5A41', hairDark: '#563D2B', hairLight: '#9C7A5C', style: 'side',
    outfit: 'sweater', cloth: '#3E6E73', clothDark: '#2C5357', glasses: true, drop: true,
  },
};

const HAIR = {
  crop: (c) => `
    <path d="M186 268 C174 172 228 110 304 110 C382 110 430 168 416 268 C412 238 404 214 392 200
      L380 214 L364 206 L346 222 L326 210 L306 226 L286 212 L266 228 L248 212 L230 226 L214 210 L204 232 L194 268 Z" fill="${c.hair}"/>
    <path d="M214 150 C250 124 330 118 382 150" stroke="${c.hairLight}" stroke-width="7" fill="none" stroke-linecap="round" opacity=".7"/>
    <path d="M240 140 C270 128 312 126 350 136 M226 176 C262 160 330 156 386 176" stroke="${c.hairDark}" stroke-width="5" fill="none" stroke-linecap="round" opacity=".6"/>`,
  short: (c) => `
    <path d="M190 254 C186 168 234 124 300 122 C366 124 414 168 410 254 C404 224 396 206 384 196 C350 186 250 186 216 196 C204 206 196 224 190 254 Z" fill="${c.hair}"/>
    <path d="M222 150 C262 132 338 132 378 150" stroke="${c.hairLight}" stroke-width="6" fill="none" stroke-linecap="round" opacity=".8"/>`,
  quiff: (c) => `
    <path d="M196 238 C190 160 240 104 312 100 C382 98 422 150 408 238 C402 212 392 196 378 188 C350 178 262 180 226 192 C212 204 202 220 196 238 Z" fill="${c.hair}"/>
    <path d="M226 194 C232 136 300 96 368 116 C330 126 302 148 294 190 Z" fill="${c.hairLight}" opacity=".85"/>
    <path d="M250 182 C262 140 310 116 352 120 M276 186 C288 152 322 132 360 134" stroke="${c.hairDark}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".7"/>`,
  side: (c) => `
    <path d="M186 262 C176 168 232 112 306 112 C382 112 430 166 414 262 C410 232 400 212 386 202 C344 216 282 216 240 198 C222 216 202 234 186 262 Z" fill="${c.hair}"/>
    <path d="M238 198 C264 154 344 142 392 182 C350 172 292 180 238 198 Z" fill="${c.hairLight}"/>
    <path d="M262 170 C300 150 344 150 378 168" stroke="${c.hairDark}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".6"/>`,
};

// Short hair over the ears (fade) — a darker tint on the skin.
const SIDES = (c) => `
  <path d="M190 226 C188 258 190 284 194 300 L204 296 C202 274 203 252 210 230 Z" fill="${c.hair}" opacity=".85"/>
  <path d="M410 226 C412 258 410 284 406 300 L396 296 C398 274 397 252 390 230 Z" fill="${c.hair}" opacity=".85"/>`;

function eye(cx, c, blink) {
  if (blink) {
    return `<path d="M${cx - 24} 290 C${cx - 12} 298 ${cx + 12} 298 ${cx + 24} 290" stroke="#2A1E18" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M${cx - 20} 282 C${cx - 8} 276 ${cx + 10} 276 ${cx + 20} 282" stroke="${c.shade}" stroke-width="3" fill="none" opacity=".7"/>`;
  }
  return `
    <path d="M${cx - 22} 290 C${cx - 14} 278 ${cx + 14} 278 ${cx + 22} 290 C${cx + 14} 300 ${cx - 14} 300 ${cx - 22} 290 Z" fill="#F3ECE6"/>
    <circle cx="${cx + 1}" cy="290" r="9.5" fill="${c.iris}"/>
    <circle cx="${cx + 1}" cy="290" r="4.6" fill="#120C0A"/>
    <circle cx="${cx + 4}" cy="286.5" r="2.6" fill="#fff"/>
    <path d="M${cx - 24} 290 C${cx - 14} 276 ${cx + 14} 276 ${cx + 24} 289" stroke="#2A1E18" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M${cx - 20} 281 C${cx - 8} 271 ${cx + 10} 271 ${cx + 20} 280" stroke="${c.shade}" stroke-width="2.6" fill="none" opacity=".8"/>
    <path d="M${cx - 18} 298 C${cx - 6} 302 ${cx + 8} 302 ${cx + 18} 297" stroke="${c.shade}" stroke-width="2" fill="none" opacity=".6"/>`;
}

function mouth(c, open) {
  const h = [0, 7, 13, 19][open];
  const upper = `<path d="M270 378 C282 371 294 370 300 374 C306 370 318 371 330 378 C318 382 282 382 270 378 Z" fill="${c.lipDark}"/>`;
  if (!h) {
    return `${upper}
      <path d="M274 381 C288 396 312 396 326 381 C312 385 288 385 274 381 Z" fill="${c.lip}"/>
      <path d="M268 377 C284 384 316 384 332 377" stroke="#5E302C" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <path d="M266 374 L269 378 M334 374 L331 378" stroke="${c.shade}" stroke-width="3" stroke-linecap="round"/>
      <path d="M290 388 C296 390 304 390 310 388" stroke="#fff" stroke-width="2" opacity=".25" fill="none"/>`;
  }
  const b = 380 + h;
  return `
    <path d="M275 380 C286 376 314 376 325 380 C319 ${b + 2} 281 ${b + 2} 275 380 Z" fill="#3A1512"/>
    <clipPath id="mclip${open}"><path d="M275 380 C286 376 314 376 325 380 C319 ${b + 2} 281 ${b + 2} 275 380 Z"/></clipPath>
    <rect x="282" y="377" width="36" height="${Math.min(6, h * 0.45)}" rx="2" fill="#EFE8DF" clip-path="url(#mclip${open})"/>
    <ellipse cx="300" cy="${b + 1}" rx="12" ry="${h * 0.3}" fill="#8E3B36" clip-path="url(#mclip${open})"/>
    ${upper}
    <path d="M278 ${b} C290 ${b + 11} 310 ${b + 11} 322 ${b} C312 ${b + 3} 288 ${b + 3} 278 ${b} Z" fill="${c.lip}"/>`;
}

function clothes(c) {
  const shirtCollar = `
    <path d="M232 468 C250 498 350 498 368 468 L374 492 C352 520 248 520 226 492 Z" fill="#F4F4F2"/>
    <path d="M236 482 L300 548 L270 574 L212 506 Z" fill="#FFFFFF"/>
    <path d="M364 482 L300 548 L330 574 L388 506 Z" fill="#FFFFFF"/>
    <path d="M300 548 L270 574 L212 506" stroke="#C9CCD0" stroke-width="3" fill="none"/>
    <path d="M300 548 L330 574 L388 506" stroke="#C9CCD0" stroke-width="3" fill="none"/>`;
  const shade = `<path d="${TORSO}" fill="url(#clothShade)"/>`;
  if (c.outfit === 'blazer') {
    return `
      <path d="${TORSO}" fill="${c.cloth}"/>
      <path d="M244 500 L300 640 L356 500 Z" fill="#FFFFFF"/>
      <path d="M300 520 L300 640" stroke="#D6D8DB" stroke-width="3"/>
      ${c.tie ? `<path d="M290 552 L310 552 L314 570 L300 578 L286 570 Z" fill="${c.tieDark}"/>
        <path d="M287 574 L300 580 L313 574 L320 628 L300 646 L280 628 Z" fill="${c.tie}"/>
        <path d="M296 586 L304 600 M294 606 L306 622" stroke="${c.tieDark}" stroke-width="3" opacity=".6"/>` : ''}
      <path d="M240 500 L300 646 L268 740 L150 740 L158 600 L186 540 L214 506 Z" fill="${c.clothDark}"/>
      <path d="M360 500 L300 646 L332 740 L450 740 L442 600 L414 540 L386 506 Z" fill="${c.clothDark}"/>
      <path d="M186 540 L206 560 L214 506 M414 540 L394 560 L386 506" stroke="${c.cloth}" stroke-width="4" fill="none"/>
      ${shade}
      ${shirtCollar}
      <circle cx="300" cy="676" r="7" fill="${c.clothDark}"/>
      ${c.flag ? `<g transform="translate(372 592) rotate(-8)"><rect width="30" height="20" rx="3" fill="#fff"/><rect width="30" height="7" rx="2" fill="#0099B5"/><rect y="13" width="30" height="7" rx="2" fill="#1EB53A"/><rect y="7" width="30" height="1.4" fill="#CE1126"/><rect y="11.6" width="30" height="1.4" fill="#CE1126"/></g>` : ''}
      ${c.badge ? `<path d="M262 520 L338 640 M338 520 L366 640" stroke="#F5A623" stroke-width="6" fill="none"/>
        <rect x="320" y="636" width="70" height="84" rx="8" fill="#FFFFFF"/><rect x="320" y="636" width="70" height="22" rx="8" fill="#F5A623"/>
        <rect x="320" y="648" width="70" height="10" fill="#F5A623"/><circle cx="355" cy="682" r="12" fill="#9FA8DA"/><rect x="334" y="700" width="42" height="6" rx="3" fill="#9FA8DA"/>` : ''}`;
  }
  if (c.outfit === 'vest') {
    return `
      <path d="${TORSO}" fill="#F2F2EF"/>
      <path d="M60 640 C70 600 96 580 130 570 M540 640 C530 600 504 580 470 570" stroke="#CFD2D4" stroke-width="5" fill="none"/>
      <path d="M64 740 C74 640 104 584 146 558 C188 536 214 518 228 502 L300 626 L372 502 C386 518 412 536 454 558 C496 584 526 640 536 740 Z" fill="${c.cloth}"/>
      <path d="M228 502 L300 626 L372 502" stroke="${c.clothDark}" stroke-width="16" fill="none" stroke-linejoin="round"/>
      <path d="M64 740 C74 640 104 584 146 558 M536 740 C526 640 496 584 454 558" stroke="${c.clothDark}" stroke-width="10" fill="none"/>
      ${shade}
      ${shirtCollar}
      <circle cx="300" cy="590" r="5" fill="#E5E5E1"/>`;
  }
  return `
    <path d="${TORSO}" fill="${c.cloth}"/>
    <path d="M226 494 L300 600 L374 494" stroke="${c.clothDark}" stroke-width="18" fill="none" stroke-linejoin="round"/>
    <path d="M238 492 L300 584 L362 492 Z" fill="#FFFFFF"/>
    <path d="M110 700 L130 620 M490 700 L470 620 M250 660 C280 676 320 676 350 660" stroke="${c.clothDark}" stroke-width="5" fill="none" opacity=".7"/>
    ${shade}
    ${shirtCollar}
    ${c.drop ? `<path d="M384 600 C384 600 372 616 372 624 A12 12 0 0 0 396 624 C396 616 384 600 384 600 Z" fill="#4DD0E1"/>` : ''}`;
}

export function portraitSVG(who, { mouth: open = 0, blink = false } = {}) {
  const c = CAST[who];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 720" width="600" height="720">
  <defs>
    <clipPath id="faceClip"><path d="${FACE}"/></clipPath>
    <linearGradient id="faceSide" x1="0" x2="1">
      <stop offset="0" stop-color="${c.shade}" stop-opacity=".75"/><stop offset=".22" stop-color="${c.shade}" stop-opacity="0"/>
      <stop offset=".78" stop-color="${c.shade}" stop-opacity="0"/><stop offset="1" stop-color="${c.shade}" stop-opacity=".75"/>
    </linearGradient>
    <radialGradient id="faceLight" cx="290" cy="250" r="170" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="neckShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset=".45" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".05"/>
    </linearGradient>
    <linearGradient id="clothShade" x1="0" x2="1">
      <stop offset="0" stop-color="#000" stop-opacity=".32"/><stop offset=".3" stop-color="#000" stop-opacity="0"/>
      <stop offset=".7" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".28"/>
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
  </defs>
  <path d="${NECK}" fill="${c.skin}"/>
  <path d="${NECK}" fill="url(#neckShade)"/>
  <path d="M238 380 C262 404 338 404 362 380" stroke="#000" stroke-opacity=".12" stroke-width="16" fill="none" filter="url(#soft)"/>
  <path d="M262 420 C268 450 266 470 262 486 M338 420 C332 450 334 470 338 486" stroke="${c.shade}" stroke-width="5" fill="none" opacity=".5"/>
  <g transform="translate(0 -14)">${clothes(c)}</g>
  <path d="M194 276 C170 268 160 292 164 314 C168 340 182 352 200 350 Z" fill="${c.skin}"/>
  <path d="M406 276 C430 268 440 292 436 314 C432 340 418 352 400 350 Z" fill="${c.skin}"/>
  <path d="M190 292 C180 292 176 304 180 318 C184 330 190 336 196 336" stroke="${c.shade}" stroke-width="4" fill="none"/>
  <path d="M410 292 C420 292 424 304 420 318 C416 330 410 336 404 336" stroke="${c.shade}" stroke-width="4" fill="none"/>
  <path d="${FACE}" fill="${c.skin}"/>
  <g clip-path="url(#faceClip)">
    <path d="${FACE}" fill="url(#faceSide)"/>
    <path d="${FACE}" fill="url(#faceLight)"/>
    <ellipse cx="300" cy="440" rx="110" ry="34" fill="${c.shade}" opacity=".45" filter="url(#soft)"/>
    <ellipse cx="240" cy="336" rx="28" ry="16" fill="#E07A6A" opacity=".13"/>
    <ellipse cx="360" cy="336" rx="28" ry="16" fill="#E07A6A" opacity=".13"/>
    <g transform="translate(0 10)" filter="url(#soft)" opacity=".35">${HAIR[c.style]({ ...c, hair: '#000', hairLight: '#000', hairDark: '#000' })}</g>
    <ellipse cx="252" cy="286" rx="34" ry="18" fill="${c.shade}" opacity=".22" filter="url(#soft)"/>
    <ellipse cx="348" cy="286" rx="34" ry="18" fill="${c.shade}" opacity=".22" filter="url(#soft)"/>
  </g>
  ${SIDES(c)}
  <path d="M226 266 C240 255 262 252 282 258 L282 264 C262 260 242 263 228 272 Z" fill="${c.hairDark}"/>
  <path d="M374 266 C360 255 338 252 318 258 L318 264 C338 260 358 263 372 272 Z" fill="${c.hairDark}"/>
  ${eye(252, c, blink)}${eye(348, c, blink)}
  <path d="M300 288 L300 330" stroke="#fff" stroke-opacity=".2" stroke-width="7" stroke-linecap="round"/>
  <path d="M291 290 C287 314 281 330 278 340 C285 347 293 347 297 344 C294 326 295 308 297 292 Z" fill="${c.shade}" opacity=".6"/>
  <path d="M280 338 C286 354 314 354 320 338" stroke="${c.lipDark}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".75"/>
  <ellipse cx="303" cy="334" rx="9" ry="6" fill="#fff" opacity=".16"/>
  <ellipse cx="290" cy="346" rx="6.5" ry="3.5" fill="#4A2A24" opacity=".75"/>
  <ellipse cx="310" cy="346" rx="6.5" ry="3.5" fill="#4A2A24" opacity=".75"/>
  <path d="M286 362 C292 366 308 366 314 362" stroke="${c.shade}" stroke-width="2.4" fill="none" opacity=".5"/>
  ${mouth(c, open)}
  <ellipse cx="300" cy="${402 + [0, 7, 13, 19][open]}" rx="17" ry="4" fill="${c.shade}" opacity=".35"/>
  ${HAIR[c.style](c)}
  ${c.glasses ? `
    <rect x="218" y="268" width="70" height="46" rx="14" fill="#fff" fill-opacity=".08" stroke="#2F2A28" stroke-width="5"/>
    <rect x="312" y="268" width="70" height="46" rx="14" fill="#fff" fill-opacity=".08" stroke="#2F2A28" stroke-width="5"/>
    <path d="M288 286 Q300 278 312 286 M218 280 L194 276 M382 280 L406 276" stroke="#2F2A28" stroke-width="5" fill="none"/>
    <path d="M228 276 L244 300 M322 276 L338 300" stroke="#fff" stroke-opacity=".35" stroke-width="4"/>` : ''}
</svg>`;
}
