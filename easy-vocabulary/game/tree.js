var BAUM = (function () {
"use strict";
var STUFEN = [
{ name: "Seed", xp: 0, zeichen: "🌰" },
{ name: "Sprout", xp: 100, zeichen: "🌱" },
{ name: "Small Plant", xp: 400, zeichen: "🌿" },
{ name: "Young Tree", xp: 1200, zeichen: "🌳" },
{ name: "Bigger Tree", xp: 3000, zeichen: "🌳" },
{ name: "Full Tree", xp: 6000, zeichen: "🌳" },
{ name: "Tree with Flowers", xp: 11000, zeichen: "🌸" },
{ name: "Tree with Fruit", xp: 18000, zeichen: "🍎" }
];
var MAX_RICHTIG = 300, MAX_MINUTEN = 90;
function zwei(n) { return (n < 10 ? "0" : "") + n; }
function tagId(d) { return d.getFullYear() + "-" + zwei(d.getMonth() + 1) + "-" + zwei(d.getDate()); }
function zahl(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function xp(tage, kapitel, woerter) {
var t = { antworten: 0, minuten: 0, tage: 0, serie: 0, kapitel: 0, woerter: 0 };
var heute = tagId(new Date());
var liste = Object.keys(tage || {}).filter(function (k) {
var x = tage[k];
return /^\d{4}-\d{2}-\d{2}$/.test(k) && k <= heute && x && (x.s > 0 || x.r > 0 || x.f > 0);
}).sort();
var lauf = 0, vorher = null;
liste.forEach(function (k) {
var x = tage[k];
t.antworten += Math.min(+x.r || 0, MAX_RICHTIG);
t.minuten += Math.min(Math.floor((+x.s || 0) / 60), MAX_MINUTEN);
t.tage += 10;
var d = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
var gestern = vorher ? tagId(new Date(vorher.getFullYear(), vorher.getMonth(), vorher.getDate() + 1)) : "";
lauf = (gestern === k) ? lauf + 1 : 1;
t.serie += lauf >= 7 ? 10 : lauf >= 3 ? 5 : 0;
vorher = d;
});
t.kapitel = 15 * (kapitel || 0);
t.woerter = 2 * (woerter || 0);
t.summe = t.antworten + t.minuten + t.tage + t.serie + t.kapitel + t.woerter;
return t;
}
function stufe(punkte) {
var i = 0;
while (i < STUFEN.length - 1 && punkte >= STUFEN[i + 1].xp) i++;
var von = STUFEN[i].xp, bis = i < STUFEN.length - 1 ? STUFEN[i + 1].xp : null;
return { i: i, name: STUFEN[i].name, zeichen: STUFEN[i].zeichen, von: von, bis: bis,
anteil: bis ? (punkte - von) / (bis - von) : 1 };
}
function lernstand(LANG) {
var KAPITEL, WOERTER;
KAPITEL = 0; WOERTER = 0;
var vorne = "ev_kapitel:" + LANG + ":", einmal = {}, ids = {}, kapitelDa = {}, LISTE = {};
(typeof CHAPTERS !== "undefined" ? CHAPTERS : []).forEach(function (c) { if (c && Array.isArray(c.woerter)) LISTE[c.id] = c.woerter; });
var EASIEST = (typeof EASIEST_200 !== "undefined" ? EASIEST_200 : [])
.concat(typeof EASIEST_NEXT_200 !== "undefined" ? EASIEST_NEXT_200 : [])
.concat(typeof EASIEST_THIRD_200 !== "undefined" ? EASIEST_THIRD_200 : [])
.concat(typeof EASIEST_MORE !== "undefined" ? EASIEST_MORE : []) ;
try {
for (var i = 0; i < localStorage.length; i++) {
var k = localStorage.key(i);
if (!k || k.indexOf(vorne) !== 0) continue;
var rest = k.slice(vorne.length);
if (rest.indexOf("stat:") === 0 || rest === "baum") continue; 
var g; try { g = JSON.parse(localStorage.getItem(k)); } catch (e) { continue; }
if (!g) continue;
var name = rest.replace(/^a:/, ""), doppel = name.indexOf(":");
var spiel = doppel > -1 ? name.slice(0, doppel) : "pick", kap = doppel > -1 ? name.slice(doppel + 1) : name;
if (name === "easiest:easiest200") { 
var st = g.stand, runden = (st && Array.isArray(st.fertigRunden)) ? st.fertigRunden : [];
if (st && !Array.isArray(st.fertigRunden) && typeof st.runde === "number") 
for (var fr = 0; fr < st.runde && fr < 100; fr++) runden.push(fr);
runden.forEach(function (r) {
if (typeof r !== "number" || r < 0 || r % 1 || kapitelDa["easiest:" + r]) return;
kapitelDa["easiest:" + r] = true;
var ws = EASIEST.slice(r * 10, (r + 1) * 10);
if (ws.length) ws.forEach(function (w) { ids[w.id] = true; });
else einmal["easiest:" + r] = 10;
});
continue;
}
if (g.fertig !== true) continue;
kapitelDa[name] = true; 
if (/^tenses/.test(spiel)) continue; 
if (LISTE[kap]) { LISTE[kap].forEach(function (id) { ids[id] = true; }); continue; }
var von = typeof g.woerter === "number" ? g.woerter : spiel === "recall" ? Math.min(+g.von || 0, 10) : +g.von || 0;
if (von > (einmal[kap] || 0)) einmal[kap] = von;
}
} catch (e) { }
KAPITEL = Object.keys(kapitelDa).length;
WOERTER = Object.keys(ids).length;
Object.keys(einmal).forEach(function (k) { WOERTER += einmal[k]; });
return { kapitel: KAPITEL, woerter: WOERTER };
}
function blatt(x, y, len, winkel, farbe) {
var a = len * 0.3, b = len * 0.75, h = len * 0.36;
return '<g class="baum-blatt" style="transform-origin:' + x + 'px ' + y + 'px;animation-delay:-' + (((x * 7 + y * 3) % 32) / 10) + 's">'
+ '<path d="M0 0 C' + a + ' ' + (-h) + ' ' + b + ' ' + (-h) + ' ' + len + ' 0 C' + b + ' ' + h + ' ' + a + ' ' + h + ' 0 0Z" fill="'
+ farbe + '" transform="translate(' + x + ' ' + y + ') rotate(' + winkel + ')"/></g>';
}
function kreise(liste, farbe) {
return liste.map(function (c) { return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '" fill="' + farbe + '"/>'; }).join("");
}
function bluete(x, y) {
var s = "";
for (var i = 0; i < 5; i++) {
var w = i * 72 * Math.PI / 180;
s += '<circle cx="' + (x + Math.cos(w) * 3.2).toFixed(1) + '" cy="' + (y + Math.sin(w) * 3.2).toFixed(1) + '" r="2.8" fill="#f9a8d4"/>';
}
return '<g class="baum-bluete">' + s + '<circle cx="' + x + '" cy="' + y + '" r="1.9" fill="#fde047"/></g>';
}
function apfel(x, y) {
return '<g class="baum-apfel"><path d="M' + x + ' ' + (y - 5) + ' q1 -3 3 -4" stroke="#78350f" stroke-width="1.3" fill="none" stroke-linecap="round"/>'
+ '<circle cx="' + x + '" cy="' + y + '" r="5.6" fill="#ef4444"/><circle cx="' + (x - 1.8) + '" cy="' + (y - 1.8) + '" r="1.5" fill="#fecaca" opacity=".8"/></g>';
}
var GRUEN_D = "#15803d", GRUEN = "#22c55e", GRUEN_H = "#4ade80", GRUEN_L = "#86efac", STAMM = "#92400e", STAMM_D = "#78350f";
var KRONE_GROSS = {
hinten: [[120, 88, 56], [68, 106, 32], [174, 102, 34], [90, 62, 32], [152, 58, 34]],
vorne: [[98, 80, 31], [144, 76, 31], [120, 52, 29], [76, 98, 23], [166, 94, 23], [120, 100, 26]],
licht: [[106, 62, 6], [140, 58, 5], [88, 86, 4.5], [152, 82, 4.5]]
};
function krone(k, oy, dazu) {
return '<g class="baum-krone" style="transform-origin:120px ' + oy + 'px">' + kreise(k.hinten, GRUEN_D) + kreise(k.vorne, GRUEN)
+ '<g opacity=".45">' + kreise(k.licht, GRUEN_L) + '</g>' + (dazu || "") + '</g>';
}
function boden(i) {
return i === 0 ? '<path d="M86 209 Q120 186 154 209Z" fill="#8b5e3c"/>'
: i <= 2 ? '<path d="M92 209 Q120 194 148 209Z" fill="#8b5e3c"/>' : "";
}
function pflanze(i) {
var s = "";
if (i === 0) { 
s += '<g class="baum-samen" style="transform-origin:120px 196px">'
+ '<ellipse cx="120" cy="196" rx="8" ry="5.6" fill="#b45309" transform="rotate(-18 120 196)"/>'
+ '<ellipse cx="117.5" cy="194.5" rx="2.6" ry="1.5" fill="#fcd34d" opacity=".55" transform="rotate(-18 117.5 194.5)"/></g>';
} else if (i === 1) { 
s += '<path d="M120 206 C118 196 122 188 120 178" stroke="' + GRUEN_D + '" stroke-width="3.4" fill="none" stroke-linecap="round"/>'
+ blatt(120, 180, 17, -155, GRUEN) + blatt(120, 180, 17, -25, GRUEN_H);
} else if (i === 2) { 
s += '<path d="M120 206 C116 186 124 170 120 146" stroke="' + GRUEN_D + '" stroke-width="3.8" fill="none" stroke-linecap="round"/>'
+ blatt(119, 190, 16, -165, GRUEN) + blatt(121, 184, 16, -15, GRUEN_H)
+ blatt(121, 170, 20, -150, GRUEN_H) + blatt(121, 164, 20, -30, GRUEN)
+ blatt(120, 150, 16, -125, GRUEN) + blatt(120, 148, 16, -55, GRUEN_H);
} else if (i === 3) { 
s += '<path d="M114 208 C117 182 118 152 118.5 124 L121.5 124 C122 152 123 182 126 208Z" fill="' + STAMM + '"/>'
+ '<path d="M119.5 160 C112 152 106 148 100 146" stroke="' + STAMM + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>'
+ blatt(100, 146, 13, -160, GRUEN)
+ krone({ hinten: [[120, 112, 30], [98, 122, 19], [142, 120, 20]],
vorne: [[108, 106, 18], [134, 104, 18], [120, 92, 19]],
licht: [[112, 96, 5], [132, 98, 4]] }, 108);
} else if (i === 4) { 
s += '<path d="M109 209 C114 180 116 140 116.5 104 L123.5 104 C124 140 126 180 131 209Z" fill="' + STAMM + '"/>'
+ '<path d="M118 146 C106 132 96 124 86 118 M122 136 C134 124 144 116 154 110" stroke="' + STAMM + '" stroke-width="4" fill="none" stroke-linecap="round"/>'
+ krone({ hinten: [[120, 92, 40], [84, 110, 25], [158, 106, 27]],
vorne: [[102, 86, 25], [140, 82, 25], [120, 66, 24], [120, 108, 20]],
licht: [[108, 72, 6], [136, 70, 6], [92, 98, 5]] }, 90);
} else { 
s += '<path d="M104 210 C112 178 114 140 115 98 L125 98 C126 140 128 178 136 210Z" fill="' + STAMM + '"/>'
+ '<path d="M104 210 C98 206 94 208 90 210 M136 210 C142 206 146 208 150 210" stroke="' + STAMM + '" stroke-width="4" fill="none" stroke-linecap="round"/>'
+ '<path d="M117 150 C100 134 86 124 70 114 M123 140 C140 124 156 114 172 106 M120 120 C118 100 120 84 120 70" stroke="' + STAMM + '" stroke-width="5.5" fill="none" stroke-linecap="round"/>'
+ '<path d="M118 190 C119 170 119 160 119 150" stroke="' + STAMM_D + '" stroke-width="1.6" fill="none" opacity=".45"/>';
var dazu = "";
if (i === 6) [[92, 70], [128, 46], [150, 70], [70, 100], [110, 96], [172, 96], [100, 50], [140, 96], [82, 84], [160, 50], [120, 72], [58, 112]]
.forEach(function (p) { dazu += bluete(p[0], p[1]); });
if (i === 7) {
[[100, 46], [160, 60], [66, 96], [176, 108]].forEach(function (p) { dazu += bluete(p[0], p[1]); });
[[94, 76], [140, 64], [116, 96], [158, 90], [78, 104], [128, 44], [104, 110], [170, 84], [84, 58]]
.forEach(function (p) { dazu += apfel(p[0], p[1]); });
}
s += krone(KRONE_GROSS, 84, dazu);
}
return s;
}
function wolke(cls, y, sc) {
return '<g class="baum-wolke ' + cls + '"><g transform="translate(0 ' + y + ') scale(' + sc + ')">'
+ '<ellipse cx="0" cy="0" rx="24" ry="8"/><circle cx="-9" cy="-5" r="9"/><circle cx="7" cy="-8" r="11"/><circle cx="16" cy="-3" r="7"/></g></g>';
}
function himmel() {
var sterne = [[40, 30, 1.3, 0], [74, 52, 1, 0.9], [160, 22, 1.2, 1.7], [26, 74, 1, 0.4], [182, 62, 1, 1.3], [110, 40, 0.9, 2.1]];
var gras = [[40, 208, 7], [58, 212, 6], [76, 211, 6], [166, 211, 6], [184, 209, 7], [200, 212, 5]];
return '<g class="baum-licht"><circle class="baum-schein" cx="206" cy="30" r="20"/><circle class="baum-sonne" cx="206" cy="30" r="13"/><circle class="baum-mond" cx="212" cy="25" r="11"/></g>'
+ '<g class="baum-wolken">' + wolke("w1", 34, 1) + wolke("w2", 64, 0.62) + '</g>'
+ '<g class="baum-sterne">' + sterne.map(function (p) {
return '<circle class="baum-stern" cx="' + p[0] + '" cy="' + p[1] + '" r="' + p[2] + '" style="animation-delay:-' + p[3] + 's"/>'; }).join("") + '</g>'
+ '<ellipse cx="120" cy="211" rx="98" ry="11" class="baum-wiese"/>'
+ gras.map(function (g, i) {
return '<path class="baum-gras" style="transform-origin:' + (g[0] + 2.5) + 'px ' + g[1] + 'px;animation-delay:-' + (i * 0.45) + 's" d="M' + g[0] + ' ' + g[1] + ' l3 -' + g[2] + ' l2 ' + g[2] + '"/>'; }).join("");
}
function funkeln() {
return '<g class="baum-funkeln">' + [[72, 186, 0], [164, 176, 1.5], [104, 160, 3], [146, 192, 4.5]].map(function (p) {
return '<circle class="baum-funkel" cx="' + p[0] + '" cy="' + p[1] + '" r="1.7" style="animation-delay:' + p[2] + 's"/>'; }).join("") + '</g>';
}
function fallend() {
return '<g class="baum-fallend">' + [[96, 72, 0], [142, 62, -2.6], [120, 84, -5.1]].map(function (p) {
return '<circle class="baum-fall" cx="' + p[0] + '" cy="' + p[1] + '" r="2.6" style="transform-origin:' + p[0] + 'px ' + p[1] + 'px;animation-delay:' + p[2] + 's"/>'; }).join("") + '</g>';
}
function svg(i, anteil) {
var g = (0.88 + 0.12 * Math.max(0, Math.min(1, anteil || 0))).toFixed(3);
return '<svg class="baum-bild" viewBox="0 0 240 228" aria-hidden="true" focusable="false">'
+ himmel() + boden(i)
+ '<g class="baum-wachsen"><g class="baum-wiegen"><g transform="translate(120 210) scale(' + g + ') translate(-120 -210)">'
+ pflanze(i) + '</g></g></g>'
+ funkeln() + (i === 6 ? fallend() : "") + '</svg>';
}
var CSS = ''
+ '.baum-karte{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px;box-sizing:border-box;min-width:0;text-align:left;position:relative;overflow:hidden}'
+ '.baum-kopf{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:0 0 6px}'
+ '.baum-kopf h2{margin:0;font-size:16px;font-weight:800}'
+ '.baum-stufe{font-size:12.5px;font-weight:700;color:var(--muted)}'
+ '.baum-himmel{position:relative;border-radius:14px;background:linear-gradient(#e8f6ff,#f4fbf5 70%);aspect-ratio:240/228;max-height:280px;margin:0 auto;width:100%}'
+ ':root[data-theme="dark"] .baum-himmel{background:linear-gradient(#0f2440,#132a2a 75%)}'
+ '.baum-bild{display:block;width:100%;height:100%}'
+ '.baum-sonne{fill:#fde68a}:root[data-theme="dark"] .baum-sonne{fill:#e2e8f0}'
+ '.baum-schein{fill:#fde68a;opacity:.3}:root[data-theme="dark"] .baum-schein{display:none}'
+ '.baum-mond,.baum-sterne{display:none}:root[data-theme="dark"] .baum-mond{display:inline;fill:#0f2440}'
+ ':root[data-theme="dark"] .baum-sterne{display:inline;fill:#cbd5e1;opacity:.75}'
+ '.baum-wolke{fill:#fff;opacity:.85}:root[data-theme="dark"] .baum-wolken{display:none}'
+ '.baum-funkel{fill:#fbbf24;opacity:0}:root[data-theme="dark"] .baum-funkel{fill:#d9f99d}'
+ '.baum-fall{fill:#f9a8d4;opacity:0}'
+ '.baum-wiese{fill:#bbf7d0}:root[data-theme="dark"] .baum-wiese{fill:#14532d}'
+ '.baum-gras{stroke:#22c55e;stroke-width:1.6;fill:none;stroke-linecap:round;stroke-linejoin:round}'
+ '.baum-wachsen,.baum-wiegen,.baum-blatt,.baum-krone,.baum-samen,.baum-gras,.baum-sonne,.baum-schein,.baum-licht,.baum-wolke,.baum-funkel,.baum-fall{transform-box:view-box}'
+ '.baum-wachsen,.baum-wiegen{transform-origin:120px 210px}'
+ '.baum-sonne,.baum-schein,.baum-licht{transform-origin:206px 30px}'
+ '.baum-stern{transform-box:fill-box;transform-origin:center}'
+ '.baum-name{margin:10px 0 2px;font-size:19px;font-weight:800;display:flex;align-items:center;gap:6px;flex-wrap:wrap}'
+ '.baum-sprache{font-weight:600;color:var(--muted);font-size:16px}'
+ '.baum-balken{height:12px;border-radius:99px;background:var(--btn-bg);border:1px solid var(--btn-border);overflow:hidden;margin:8px 0 6px}'
+ '.baum-balken i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#22c55e,#4ade80);width:0;transition:width 1.2s cubic-bezier(.2,.8,.2,1)}'
+ '.baum-zahl{display:flex;flex-wrap:wrap;justify-content:space-between;gap:2px 10px;font-size:13px;color:var(--muted);font-weight:600}'
+ '.baum-zahl span{white-space:nowrap}'
+ '.baum-zahl b{color:var(--text)}'
+ '.baum-wie{margin-top:10px;font-size:13px;color:var(--muted)}'
+ '.baum-wie summary{cursor:pointer;font-weight:700;color:var(--text);list-style:none;display:inline-flex;align-items:center;gap:6px;min-height:32px}'
+ '.baum-wie summary::-webkit-details-marker{display:none}'
+ '.baum-wie summary::after{content:"\\25BE";font-size:11px;color:var(--muted)}'
+ '.baum-wie[open] summary::after{content:"\\25B4"}'
+ '.baum-wie ul{margin:4px 0 0;padding:0;list-style:none;display:grid;gap:4px}'
+ '.baum-wie li{display:flex;justify-content:space-between;gap:10px}'
+ '.baum-wie li b{color:var(--text);white-space:nowrap}'
+ '.baum-meldung{position:absolute;left:50%;top:52px;translate:-50% 0;z-index:3;white-space:nowrap;padding:9px 16px;border-radius:99px;font-weight:800;font-size:14.5px;color:#14532d;background:#dcfce7;border:1.5px solid #86efac;box-shadow:0 8px 24px rgba(21,128,61,.25);opacity:0;pointer-events:none}'
+ ':root[data-theme="dark"] .baum-meldung{color:#dcfce7;background:#14532d;border-color:#22c55e}'
+ '.baum-funke{position:absolute;z-index:2;font-size:16px;pointer-events:none;opacity:0}'
+ '@media (prefers-reduced-motion:no-preference){'
+ '.baum-wiegen{animation:baum-wiegen 6s ease-in-out infinite}'
+ '.baum-blatt{animation:baum-blatt 3.4s ease-in-out infinite alternate}'
+ '.baum-krone{animation:baum-atmen 5s ease-in-out infinite alternate}'
+ '.baum-samen{animation:baum-atmen 2.4s ease-in-out infinite alternate}'
+ '.baum-gras{animation:baum-gras 2.6s ease-in-out infinite alternate}'
+ '.baum-sonne{animation:baum-atmen 4s ease-in-out infinite alternate}'
+ '.baum-schein{animation:baum-schein 4s ease-in-out infinite alternate}'
+ ':root[data-theme="dark"] .baum-sonne{animation:none}'
+ ':root[data-theme="dark"] .baum-licht{animation:baum-mond 5s ease-in-out infinite alternate}'
+ '.baum-stern{animation:baum-stern 2.6s ease-in-out infinite alternate}'
+ '.baum-wolke{animation:baum-wolke 50s linear infinite}'
+ '.baum-wolke.w2{animation-duration:75s;animation-delay:-35s}'
+ '.baum-funkel{animation:baum-funkel 6s ease-in-out infinite}'
+ '.baum-fall{animation:baum-fall 7s ease-in infinite}'
+ '.baum-karte.baum-still .baum-bild *{animation-play-state:paused}'
+ '.baum-karte.waechst .baum-wachsen{animation:baum-wachsen 1.3s cubic-bezier(.3,1.5,.5,1)}'
+ '.baum-karte.waechst .baum-meldung{animation:baum-meldung 4.6s ease .5s both}'
+ '.baum-karte.waechst .baum-funke{animation:baum-funke 1.8s ease-out both}'
+ '.baum-karte.waechst .baum-name{animation:baum-name .8s ease .9s both}'
+ '}'
+ '@media (prefers-reduced-motion:reduce){.baum-karte.waechst .baum-meldung{opacity:1}.baum-wolken,.baum-funkeln,.baum-fallend{display:none}}'
+ '@keyframes baum-wiegen{0%,100%{transform:rotate(-1.6deg)}50%{transform:rotate(1.6deg)}}'
+ '@keyframes baum-blatt{from{transform:rotate(-4deg)}to{transform:rotate(4deg)}}'
+ '@keyframes baum-atmen{from{transform:scale(1)}to{transform:scale(1.03)}}'
+ '@keyframes baum-gras{from{transform:rotate(-8deg)}to{transform:rotate(8deg)}}'
+ '@keyframes baum-schein{from{transform:scale(1);opacity:.35}to{transform:scale(1.35);opacity:.1}}'
+ '@keyframes baum-mond{from{transform:translateY(0)}to{transform:translateY(-3px)}}'
+ '@keyframes baum-stern{from{opacity:.2;transform:scale(.7)}to{opacity:1;transform:scale(1.3)}}'
+ '@keyframes baum-wolke{from{transform:translateX(-80px)}to{transform:translateX(300px)}}'
+ '@keyframes baum-funkel{0%{opacity:0;transform:translate(0,0)}15%{opacity:1}50%{opacity:.5;transform:translate(6px,-16px)}85%{opacity:1;transform:translate(-4px,-32px)}100%{opacity:0;transform:translate(2px,-44px)}}'
+ '@keyframes baum-fall{0%{opacity:0;transform:translate(0,0) rotate(0)}10%{opacity:1}100%{opacity:0;transform:translate(-16px,120px) rotate(220deg)}}'
+ '@keyframes baum-wachsen{0%{transform:scale(.55);opacity:.3}60%{transform:scale(1.07);opacity:1}100%{transform:scale(1)}}'
+ '@keyframes baum-meldung{0%{opacity:0;transform:translateY(8px) scale(.9)}12%{opacity:1;transform:none}82%{opacity:1}100%{opacity:0;transform:translateY(-6px)}}'
+ '@keyframes baum-funke{0%{opacity:0;transform:translate(0,0) scale(.4)}25%{opacity:1}100%{opacity:0;transform:translate(var(--dx),-70px) scale(1.1)}}'
+ '@keyframes baum-name{0%{transform:scale(1)}40%{transform:scale(1.12);color:#16a34a}100%{transform:scale(1)}}';
function cssRein() {
if (document.getElementById("baum-css")) return;
var st = document.createElement("style"); st.id = "baum-css"; st.textContent = CSS;
document.head.appendChild(st);
}
function lies(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function setze(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
function zeigen(el, d) {
cssRein();
var t = d.teile || xp(d.tage, d.kapitel, d.woerter);
var punkte = d.punkte != null ? d.punkte : t.summe;
var st = stufe(punkte);
var prozent = Math.floor(st.anteil * 100);
var zeichen = st.i + "|" + punkte + "|" + JSON.stringify(t) + "|" + (d.sprache || "");
if (el._baumZeichen === zeichen) return st;
var vorher = el._baumProzent;
el._baumZeichen = zeichen; el._baumProzent = prozent;
var zahlZeile = st.bis
? '<span>Tree growth: <b>' + prozent + ' %</b></span><span><b>' + zahl(punkte - st.von) + '</b> / ' + zahl(st.bis - st.von) + ' XP to <b>' + STUFEN[st.i + 1].name + '</b></span>'
: '<span><b>Fully grown!</b> 🍎</span><span><b>' + zahl(punkte) + '</b> XP</span>';
function z(text, wert) { return '<li><span>' + text + '</span><b>' + wert + '</b></li>'; }
el.innerHTML = '<div class="baum-kopf"><h2>Your tree</h2><span class="baum-stufe">Stage ' + (st.i + 1) + ' of ' + STUFEN.length + '</span></div>'
+ '<div class="baum-himmel" role="img" aria-label="Your learning tree: ' + st.name + ', ' + prozent + ' percent to the next stage">' + svg(st.i, st.anteil) + '</div>'
+ '<p class="baum-name"><span aria-hidden="true">' + st.zeichen + '</span>' + st.name
+ (d.sprache ? '<span class="baum-sprache">· ' + d.sprache + '</span>' : '') + '</p>' 
+ '<div class="baum-balken" aria-hidden="true"><i></i></div>'
+ '<div class="baum-zahl">' + zahlZeile + '</div>'
+ (t ? '<details class="baum-wie"><summary>How your tree grows</summary><ul>'
+ z("✅ Correct answers (max 300 a day)", "+" + zahl(t.antworten))
+ z("⏱️ Minutes of practice (max 90 a day)", "+" + zahl(t.minuten))
+ z("📅 Days of practice", "+" + zahl(t.tage))
+ z("🔥 Streak bonus", "+" + zahl(t.serie))
+ z("📘 Chapters finished", "+" + zahl(t.kapitel))
+ z("🧠 Words learned", "+" + zahl(t.woerter))
+ '</ul></details>' : '')
+ '<div class="baum-meldung" role="status" aria-live="polite"></div>';
if (!el._baumBeob && "IntersectionObserver" in window) { 
el._baumBeob = new IntersectionObserver(function (es) { el.classList.toggle("baum-still", !es[0].isIntersecting); });
el._baumBeob.observe(el);
}
var balken = el.querySelector(".baum-balken i");
if (vorher != null) balken.style.width = Math.max(vorher, 2) + "%"; 
setTimeout(function () { balken.style.width = Math.max(prozent, 2) + "%"; }, 60); 
if (d.merken) {
var alt = NaN;
try { var g = JSON.parse(lies(d.merken)); if (g && typeof g === "object") alt = parseInt(g.stufe, 10); } catch (e) { }
if (!isNaN(alt) && st.i > alt) feiern(el, st);
if (isNaN(alt) || st.i > alt) setze(d.merken, JSON.stringify({ stufe: st.i }));
}
return st;
}
function feiern(el, st) {
var m = el.querySelector(".baum-meldung");
m.textContent = "Your tree has grown! " + st.zeichen;
var himmel = el.querySelector(".baum-himmel");
["✨", "🍃", "✨", "🌱", "✨", "🍃"].forEach(function (z, i) {
var f = document.createElement("span");
f.className = "baum-funke"; f.textContent = z; f.setAttribute("aria-hidden", "true");
f.style.left = (28 + i * 9) + "%"; f.style.top = (55 + (i % 2) * 12) + "%";
f.style.setProperty("--dx", ((i % 2 ? 1 : -1) * (8 + i * 3)) + "px");
f.style.animationDelay = (0.3 + i * 0.12) + "s";
himmel.appendChild(f);
});
el.classList.remove("waechst"); void el.offsetWidth; el.classList.add("waechst");
setTimeout(function () { el.classList.remove("waechst"); el.querySelectorAll(".baum-funke").forEach(function (f) { f.remove(); }); }, 5600);
}
return { STUFEN: STUFEN, xp: xp, stufe: stufe, svg: svg, zeigen: zeigen, feiern: feiern, lernstand: lernstand, cssRein: cssRein };
})();
