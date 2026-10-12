(function () {
"use strict";
var skript = document.currentScript;
var WURZEL = "https://easy-vocabulary.com/"; 
var suche = new URLSearchParams(location.search);
var LERN_ID, TEIL, SEITE, STAT_SEITE;
function adressenLesen() {
LERN_ID = (typeof schauSprache === "function") ? schauSprache()
: (suche.get("lang") || (function () { try { return localStorage.getItem("ev_lern"); } catch (e) { return null; } })() || "en");
if (!/^[a-z]{2}$/.test(LERN_ID)) LERN_ID = "en";
TEIL = "lang=" + encodeURIComponent(LERN_ID) + "&native="
+ encodeURIComponent(suche.get("native") || ((typeof mutterSprache === "function") ? mutterSprache()
: String((function () { try { return localStorage.getItem("ev_mutter"); } catch (e) { return null; } })() || "en").replace(/"/g, "")));
SEITE = WURZEL + "game/settings.html?" + TEIL;
STAT_SEITE = WURZEL + "game/statistics.html?" + TEIL;
}
adressenLesen();
function lies(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function setze(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } }
var html = document.documentElement;
function anwenden() {
html.classList.toggle("ev-ruhig", lies("ev_ruhig") === "1");
html.classList.toggle("ev-ohne-download", lies("ev_ohne_download") === "1");
html.classList.toggle("ev-schlicht", lies("ev_stil") === "einfach");
}
anwenden();
window.addEventListener("pageshow", anwenden);
window.addEventListener("storage", function (e) { if (!e.key || /^ev_(stil|ruhig|ohne_download)$/.test(e.key)) anwenden(); });
window.evWiederholen = function () { return lies("ev_wiederholen") === "1"; }; 
var CSS = [
"html.ev-ruhig *, html.ev-ruhig *::before, html.ev-ruhig *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }" +
" body::before { transition: opacity .35s ease; } html { transition: background-color .35s ease; }" +
" html.ev-schlicht body::before { opacity: 0 !important; }" +
" html.ev-schlicht .kp-karte, html.ev-schlicht .mp-karte, html.ev-schlicht .bt-karte { background: var(--card) !important; }" +
" html.ev-schlicht .bt-fuss { background: var(--bg) !important; }" +
" html.ev-schlicht .tp-kachel { box-shadow: 0 4px 0 var(--tp-kante) !important; }" +
" html.ev-schlicht .tp-stelle.fertig .tp-kachel { box-shadow: 0 4px 0 var(--tp-fertig-kante) !important; }",
".kopf-rechts > #inst-kopf, .kopf-rechts > #fun-knopf, .kopf-rechts > .sp-wahl, .kopf-rechts > #stat-knopf, .kopf-rechts > #einst-knopf, .kopf-rechts > #konto-knopf { display: none !important; }" +
" @media (max-width: 1099.98px) { .kopf-rechts > #stat-knopf { display: inline-flex !important; order: -1; } #stat-knopf svg { width: 19px; height: 19px; } }",
"#einst-knopf, #stat-knopf { font-size: 0; box-sizing: border-box; text-decoration: none; color: inherit; display: inline-flex; align-items: center; justify-content: center; }",
"#einst-knopf svg, #stat-knopf svg { width: 19px; height: 19px; }",
".einst-hinter { position: fixed; inset: 0; z-index: 2147482000; background: rgba(10, 14, 22, .42); display: flex; align-items: center; justify-content: center; padding: 16px; }",
".einst-hinter[hidden] { display: none; }",
".einst-karte { width: min(520px, 100%); max-height: min(88vh, 760px); overflow: auto; box-sizing: border-box; background: var(--card, #fff); color: var(--text, #181818);",
"  border: 1px solid var(--border, #e8e5df); border-radius: 22px; box-shadow: 0 24px 60px rgba(0, 0, 0, .22); padding: 20px 20px 16px; font-family: inherit; animation: einst-rein .22s ease-out; }",
"@keyframes einst-rein { from { opacity: 0; transform: translateY(12px) scale(.98); } to { opacity: 1; transform: none; } }",
".einst-kopf { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }",
".einst-kopf h2 { margin: 0; flex: 1; font-size: 22px; font-weight: 800; }",
".einst-zu { width: 36px; height: 36px; border-radius: 50%; border: 1.5px solid var(--border, #e8e5df); background: var(--btn-bg, #fafaf8); color: inherit; font-size: 20px; line-height: 1; cursor: pointer; }",
".einst-teil { margin-top: 16px; }",
".einst-teil h3 { margin: 0 0 6px; font-size: 12px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--muted, #6b6b6b); }",
".einst-liste { border: 1px solid var(--border, #e8e5df); border-radius: 16px; overflow: hidden; }",
".einst-zeile { display: flex; align-items: center; gap: 12px; width: 100%; box-sizing: border-box; padding: 12px 14px; background: none; border: 0; color: inherit; font: inherit; text-align: left; text-decoration: none; cursor: pointer; }",
".einst-zeile + .einst-zeile { border-top: 1px solid var(--border, #e8e5df); }",
"@media (hover: hover) { .einst-zeile:hover { background: var(--btn-hover, #f2f0ea); } }",
".einst-zeichen { flex: none; width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; font-size: 19px; background: var(--btn-bg, #f4f3ef); }",
".einst-text { flex: 1; min-width: 0; }",
".einst-text b { display: block; font-size: 15px; font-weight: 800; }",
".einst-text small { display: block; font-size: 13px; color: var(--muted, #6b6b6b); margin-top: 1px; }",
".einst-pfeil { flex: none; font-size: 22px; color: var(--muted, #6b6b6b); }",
".einst-schalter { flex: none; position: relative; width: 46px; height: 28px; border-radius: 99px; background: #c9ccd2; transition: background .15s; }",
".einst-schalter::after { content: ''; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .15s; }",
".einst-zeile[aria-checked='true'] .einst-schalter { background: #16a34a; }",
".einst-zeile[aria-checked='true'] .einst-schalter::after { transform: translateX(18px); }",
".einst-zeile:focus-visible { outline: 3px solid var(--blau, #1a5fb4); outline-offset: -3px; }",
".einst-wahl { flex: none; width: 22px; height: 22px; border-radius: 50%; border: 2px solid #c9ccd2; box-sizing: border-box; transition: border .15s; }",
".einst-zeile[aria-checked='true'] .einst-wahl { border: 7px solid #16a34a; }",
".einst-seite-innen .einst-teil { margin-top: 30px; }",
".einst-seite-innen .einst-teil h3 { margin: 0 0 10px; font-size: 17px; font-weight: 800; letter-spacing: 0; text-transform: none; color: var(--text, #181818); }",
".einst-seite-innen .einst-liste, .einst-seite-innen [role=radiogroup] { border: 0; border-radius: 0; overflow: visible; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 18px; }",
".einst-seite-innen [role=radiogroup] { display: contents; }",
"@media (max-width: 900px) { .einst-seite-innen .einst-liste, .einst-seite-innen [role=radiogroup] { grid-template-columns: repeat(2, minmax(0, 1fr)); } }",
"@media (max-width: 560px) { .einst-seite-innen .einst-liste, .einst-seite-innen [role=radiogroup] { grid-template-columns: 1fr; } }",
".einst-seite-innen .einst-zeile { align-items: flex-start; border: 0 !important; border-radius: 12px; padding: 12px; gap: 12px; }",
".einst-seite-innen .einst-zeile + .einst-zeile { border-top: 0; }",
".einst-seite-innen .einst-zeichen { width: 34px; height: 34px; border-radius: 9px; font-size: 17px; background: color-mix(in srgb, var(--blau, #1a5fb4) 9%, var(--card, #fff)); }",
".einst-seite-innen .einst-text b { color: var(--blau, #1a5fb4); font-size: 16px; }",
".einst-seite-innen .einst-text small { font-size: 14px; line-height: 1.45; margin-top: 3px; }",
".einst-seite-innen .einst-schalter, .einst-seite-innen .einst-wahl { margin-top: 4px; }",
".einst-seite-innen .einst-pfeil { display: none; }",
".einst-seite-innen .einst-fuss { text-align: left; margin-top: 26px; }",
".einst-fuss { margin: 14px 0 0; font-size: 12px; color: var(--muted, #6b6b6b); text-align: center; }",
"@media (max-width: 560px) {",
"  .einst-hinter { align-items: flex-end; padding: 0; }",
"  .einst-karte { width: 100%; max-height: 90vh; border-radius: 22px 22px 0 0; padding-bottom: calc(16px + env(safe-area-inset-bottom)); animation-name: einst-hoch; }",
"  @keyframes einst-hoch { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }",
"}"
].join("\n");
var BALKEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
+ '<path d="M4 20h16"/><rect x="5.5" y="12" width="3" height="6" rx="1"/><rect x="10.5" y="7" width="3" height="11" rx="1"/><rect x="15.5" y="10" width="3" height="8" rx="1"/></svg>';
var ZAHNRAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
'<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
function istDunkel() { return html.getAttribute("data-theme") === "dark"; }
var SCHALTER = [
{ teil: "Sound", id: "ton", zeichen: "🔊", name: "Game sounds", info: "Voices and sounds in the games",
an: function () { return lies("ddd_sound_enabled_v1") !== "0"; },
setzen: function (an) { setze("ddd_sound_enabled_v1", an ? "1" : "0"); neuLaden = true; } },
{ teil: "Sound", id: "wiederholen", zeichen: "🔁", name: "Repeat sounds", info: "Play the word or sentence again by itself while you type",
an: function () { return lies("ev_wiederholen") === "1"; },
setzen: function (an) { setze("ev_wiederholen", an ? "1" : null); } },
{ teil: "Sound", id: "fun", zeichen: "😄", name: "Funny sounds", info: "A funny sound now and then after a mistake",
an: function () { return lies("ddd_fun_sounds_v1") !== "0"; },
setzen: function (an) {
var k = document.getElementById("fun-knopf");
if (k) { if ((lies("ddd_fun_sounds_v1") !== "0") !== an) k.click(); }
else setze("ddd_fun_sounds_v1", an ? "1" : "0");
} },
{ teil: "Look", id: "blass", zeichen: "👁", name: "Pale letters", info: "Show the letters pale at the start (Easy and Hard)",
an: function () { return lies("ev_blass") !== "0"; },
setzen: function (an) { setze("ev_blass", an ? null : "0"); setze("demo_quotes:blass", an ? null : "0"); } },
{ teil: "Look", id: "dunkel", zeichen: "🌙", name: "Dark mode", info: "Dark colours, easier on the eyes at night",
an: istDunkel,
setzen: function (an) {
var k = document.getElementById("hell-dunkel");
if (k) { if (istDunkel() !== an) k.click(); }
else { setze("ev_theme", an ? "dark" : "light"); html.setAttribute("data-theme", an ? "dark" : "light"); }
} },
{ teil: "Look", id: "ruhig", zeichen: "✨", name: "Animations", info: "Moving buttons, pop-ups and effects",
an: function () { return lies("ev_ruhig") !== "1"; },
setzen: function (an) { setze("ev_ruhig", an ? null : "1"); anwenden(); } }
];
var neuLaden = false;
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function lernName() { 
var l = (typeof SPRACHEN !== "undefined") ? SPRACHEN.filter(function (x) { return x.id === LERN_ID; })[0] : null;
return l ? l.name : ({ en: "English", de: "German", bs: "Bosnian", it: "Italian", es: "Spanish", pl: "Polish",
fr: "French", pt: "Portuguese", tr: "Turkish", ru: "Russian", no: "Norwegian",
da: "Danish", ar: "Arabic" })[LERN_ID] || LERN_ID;
}
function mutterName() {
var id = (typeof mutterSprache === "function") ? mutterSprache() : (lies("ev_mutter") || "en");
try { id = JSON.parse(id); } catch (e) { }
var l = (typeof MUTTERSPRACHEN !== "undefined") ? MUTTERSPRACHEN.filter(function (x) { return x.id === id; })[0] : null;
return l ? l.name : (id === "en" ? "English" : String(id || "English"));
}
function installZeile() {
var k = document.getElementById("inst-kopf");
if (!k || k.hidden) return '<div class="einst-zeile" style="cursor:default"><span class="einst-zeichen" aria-hidden="true">✅</span>'
+ '<span class="einst-text"><b>App</b><small>Easy Vocabulary is installed, or this browser cannot install it.</small></span></div>';
return '<button type="button" class="einst-zeile" id="einst-install"><span class="einst-zeichen" aria-hidden="true">⬇️</span>'
+ '<span class="einst-text"><b>Install the app</b><small>Put Easy Vocabulary on your phone or computer</small></span>'
+ '<span class="einst-pfeil" aria-hidden="true">›</span></button>';
}
function stilZeilen() {
var einfach = lies("ev_stil") === "einfach";
function z(wert, zeichen, name, info, an) {
return '<button type="button" class="einst-zeile" role="radio" data-stil="' + wert + '" aria-checked="' + (an ? "true" : "false") + '" tabindex="' + (an ? "0" : "-1") + '">'
+ '<span class="einst-zeichen" aria-hidden="true">' + zeichen + '</span>'
+ '<span class="einst-text"><b>' + name + '</b><small>' + info + '</small></span>'
+ '<span class="einst-wahl" aria-hidden="true"></span></button>';
}
return '<div role="radiogroup" aria-label="Interface style">'
+ z("einfach", "🤍", "Easy Interface", "Simple and minimal", einfach)
+ z("bild", "🎨", "Picture Interface", "Colorful and visual", !einfach) + '</div>';
}
var hinter = null, vorherFokus = null;
function bauen() {
if (hinter) return;
var s = document.createElement("style"); s.id = "einst-css"; s.textContent = CSS;
document.head.appendChild(s);
hinter = document.createElement("div");
hinter.className = "einst-hinter"; hinter.hidden = true;
hinter.addEventListener("click", function (e) { if (e.target === hinter) zu(); });
document.body.appendChild(hinter);
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && hinter && !hinter.hidden) zu(); });
}
var neuLadenSeite = false;
function zeichnen(ziel) {
var root = ziel || hinter;
var teile = {};
SCHALTER.forEach(function (x) {
(teile[x.teil] = teile[x.teil] || []).push(
'<button type="button" class="einst-zeile" role="switch" data-id="' + x.id + '" aria-checked="' + (x.an() ? "true" : "false") + '">'
+ '<span class="einst-zeichen" aria-hidden="true">' + x.zeichen + '</span>'
+ '<span class="einst-text"><b>' + esc(x.name) + '</b><small>' + esc(x.info) + '</small></span>'
+ '<span class="einst-schalter" aria-hidden="true"></span></button>');
});
function link(href, zeichen, name, info) {
return '<a class="einst-zeile" href="' + esc(href) + '"><span class="einst-zeichen" aria-hidden="true">' + zeichen + '</span>'
+ '<span class="einst-text"><b>' + esc(name) + '</b><small>' + esc(info) + '</small></span>'
+ '<span class="einst-pfeil" aria-hidden="true">›</span></a>';
}
function neuLadenZeile() {
return '<button type="button" class="einst-zeile" id="einst-neu-laden"><span class="einst-zeichen" aria-hidden="true">🔄</span>'
+ '<span class="einst-text"><b>Refresh site</b><small>Load the newest version of Easy Vocabulary</small></span>'
+ '<span class="einst-pfeil" aria-hidden="true">›</span></button>';
}
var FUSS = '<p class="einst-fuss">Your settings are saved on this device.<br>© 2026 Easy Vocabulary</p>';
function teil(titel, inhalt) { return '<section class="einst-teil"><h3>' + titel + '</h3><div class="einst-liste">' + inhalt + '</div></section>'; }
var abschnitte = teil("Sound", teile.Sound.join(""))
+ teil("Look", teile.Look.join(""))
+ teil("Interface style", stilZeilen())
+ teil("App", installZeile() + neuLadenZeile())
+ teil("Language", link(WURZEL + "game/native.html?change=1&" + TEIL, "🗣️", "I speak: " + mutterName(), "The language of the translations")
+ link(WURZEL + "game/language.html?" + TEIL, "📘", "I learn: " + lernName(), "The language you learn"))
+ teil("Account", link(WURZEL + "account.html", "👤", "Account", "Sign in, Full access, reset progress")
+ link(WURZEL + "legal.html", "📄", "Legal & privacy", "Imprint, privacy and terms"))
+ FUSS;
if (ziel) {
var seiteHtml = teil("Sound &amp; look", teile.Sound.join("") + teile.Look.join("") + stilZeilen())
+ teil("Language &amp; account",
link(WURZEL + "game/language.html?" + TEIL, "📘", "I learn: " + lernName(), "The language you learn")
+ link(WURZEL + "game/native.html?change=1&" + TEIL, "🗣️", "I speak: " + mutterName(), "The language of the translations")
+ installZeile()
+ neuLadenZeile()
+ link(WURZEL + "account.html", "👤", "Account", "Sign in, Full access, your key")
+ link(WURZEL + "account.html#neustart-karte", "↺", "Reset progress", "Start all games again from the beginning")
+ link(WURZEL + "legal.html", "📄", "Legal & privacy", "Imprint, privacy and terms"))
+ FUSS;
root.innerHTML = '<div class="einst-seite-innen">' + seiteHtml + '</div>';
}
else {
root.innerHTML = '<div class="einst-karte" role="dialog" aria-modal="true" aria-labelledby="einst-titel">'
+ '<div class="einst-kopf"><h2 id="einst-titel">Settings</h2><button type="button" class="einst-zu" aria-label="Close">×</button></div>'
+ abschnitte + '</div>';
root.querySelector(".einst-zu").addEventListener("click", zu);
}
var nl = root.querySelector("#einst-neu-laden");
if (nl) nl.addEventListener("click", function () {
nl.querySelector("small").textContent = "Loading the newest version ...";
if (window.evAktualisieren) window.evAktualisieren(); else location.reload();
});
function stilWaehlen(b) {
setze("ev_stil", b.getAttribute("data-stil") === "einfach" ? "einfach" : null);
anwenden();
Array.prototype.forEach.call(root.querySelectorAll("[data-stil]"), function (x) {
x.setAttribute("aria-checked", x === b ? "true" : "false");
x.setAttribute("tabindex", x === b ? "0" : "-1");
});
}
Array.prototype.forEach.call(root.querySelectorAll("[data-stil]"), function (b) {
b.addEventListener("click", function () { stilWaehlen(b); });
});
Array.prototype.forEach.call(root.querySelectorAll("[role=radiogroup]"), function (g) {
g.addEventListener("keydown", function stilTasten(e) {
var alle = Array.prototype.slice.call(g.querySelectorAll("[data-stil]"));
var i = alle.indexOf(document.activeElement);
if (i < 0 || !alle.length) return;
var z = null;
if (e.key === "ArrowRight" || e.key === "ArrowDown") z = alle[(i + 1) % alle.length];
else if (e.key === "ArrowLeft" || e.key === "ArrowUp") z = alle[(i - 1 + alle.length) % alle.length];
else if (e.key === "Home") z = alle[0];
else if (e.key === "End") z = alle[alle.length - 1];
if (!z) return;
e.preventDefault();
stilWaehlen(z);
z.focus();
});
});
var inst = root.querySelector("#einst-install");
if (inst) inst.addEventListener("click", function () {
if (!ziel) zu();
var k = document.getElementById("inst-kopf");
if (k) setTimeout(function () { k.click(); }, 50);
});
Array.prototype.forEach.call(root.querySelectorAll("[role=switch]"), function (b) {
b.addEventListener("click", function () {
var x = SCHALTER.filter(function (y) { return y.id === b.getAttribute("data-id"); })[0];
var an = b.getAttribute("aria-checked") !== "true";
x.setzen(an);
b.setAttribute("aria-checked", x.an() ? "true" : "false");
});
});
}
function auf() {
bauen(); zeichnen();
vorherFokus = document.activeElement;
hinter.hidden = false;
document.body.style.overflow = "hidden";
var z = hinter.querySelector(".einst-zu"); if (z) z.focus();
}
function zu() {
if (!hinter) return;
hinter.hidden = true;
document.body.style.overflow = "";
if (neuLaden) { neuLaden = false; location.reload(); return; } 
if (vorherFokus && vorherFokus.focus) vorherFokus.focus();
}
function knopf() {
var box = document.querySelector("header.kopf .kopf-rechts") || document.querySelector(".kopf-rechts");
if (!box || document.getElementById("einst-knopf")) return;
var k = document.createElement("button");
k.type = "button"; k.id = "einst-knopf"; k.className = "bt-hell-dunkel";
k.setAttribute("aria-label", "Settings"); k.title = "Settings";
k.style.animation = "none";
k.innerHTML = ZAHNRAD;
k.addEventListener("click", function () { location.href = SEITE; });
var konto = box.querySelector("#konto-knopf");
box.insertBefore(k, konto || null); 
if (!document.getElementById("hell-dunkel")) {
var m = document.createElement("button");
m.type = "button"; m.id = "hell-dunkel"; m.className = "bt-hell-dunkel";
m.setAttribute("aria-label", "Switch light/dark"); m.title = "Light / dark";
var mZeigen = function () { m.textContent = html.getAttribute("data-theme") === "dark" ? "☀️" : "🌙"; };
mZeigen();
m.addEventListener("click", function () {
var neu = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
html.setAttribute("data-theme", neu); setze("ev_theme", neu); mZeigen();
});
box.appendChild(m);
}
if (!document.getElementById("stat-knopf")) {
var st = document.createElement("a");
st.id = "stat-knopf"; st.className = "bt-hell-dunkel"; st.href = STAT_SEITE;
st.setAttribute("aria-label", "Statistics"); st.title = "Statistics";
st.style.animation = "none";
st.innerHTML = BALKEN;
box.insertBefore(st, k);
}
}
var UNTEN_SEITEN = /^(games|chapters|language|level|native|statistics|settings|account)\.html$/;
var MOND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
var SONNE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/></svg>';
var SPIELE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>';
var MENU_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
var PERSON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.6-3.9 3.7-6.3 7.5-6.3s6.9 2.4 7.5 6.3"/></svg>';
var UNTEN_CSS = [
"#ev-unten { display: none; }",
"@media (max-width: 1099.98px) {",
"  html.ev-unten-an #ev-unten { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147480000; box-sizing: border-box;",
"    padding: 2px 6px env(safe-area-inset-bottom); background: var(--card, #fff); border-top: 1px solid var(--border, #e8e5df);",
"    box-shadow: 0 -4px 18px rgba(0, 0, 0, .06); font-family: inherit; }",
"  html.ev-unten-an body { padding-bottom: calc(66px + env(safe-area-inset-bottom)) !important; }",
"  html.ev-unten-an .kopf-rechts > #stat-knopf, html.ev-unten-an .kopf-rechts > #hell-dunkel { display: none !important; }",
"  html.ev-unten-an #sl-knopf { display: none !important; }", 
"  html.ev-unten-an .nach-oben { bottom: calc(76px + env(safe-area-inset-bottom)) !important; }",
"}",
"#ev-unten a, #ev-unten button { flex: 1 1 0; min-width: 0; height: 56px !important; min-height: 0 !important; box-sizing: border-box; margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;",
"  padding: 6px 2px; border: 0; background: none; color: var(--muted, #6b6b6b); font: inherit; font-size: 11px; font-weight: 700; line-height: 1.1;",
"  text-decoration: none; cursor: pointer; -webkit-tap-highlight-color: transparent; }",
"#ev-unten svg { width: 25px; height: 25px; flex: none; }",
"#ev-unten .an { color: var(--text, #181818); }",
"#ev-unten .an svg { stroke-width: 2.6; }",
"#ev-unten a:active, #ev-unten button:active { transform: scale(.94); }",
"#ev-unten a:focus-visible, #ev-unten button:focus-visible { outline: 2px solid #16a34a; outline-offset: -4px; border-radius: 12px; }"
].join("\n");
function untenGewuenscht(hier) {
var q = location.search;
if (UNTEN_SEITEN.test(hier)) return true;
if (/^(shadowing|spaced|easiest)\.html$/.test(hier)) return !/[?&]round=/.test(q);
if (hier === "tenses.html") return !/[?&]chapter=/.test(q);
return !!window.EV_UNTEN;
}
function unten() {
var hier = (location.pathname.split("/").pop() || "").toLowerCase();
if (!untenGewuenscht(hier) || !document.body || document.getElementById("ev-unten")) return;
if (!document.getElementById("ev-unten-css")) { var c = document.createElement("style"); c.id = "ev-unten-css"; c.textContent = UNTEN_CSS; document.head.appendChild(c); }
function punkt(href, svg, name, an) {
return '<a href="' + href + '"' + (an ? ' class="an" aria-current="page"' : '') + '>' + svg + '<span>' + name + '</span></a>';
}
var nav = document.createElement("nav");
nav.id = "ev-unten"; nav.setAttribute("aria-label", "Quick menu");
nav.innerHTML = '<button type="button" class="ev-unten-menu">' + MENU_ICON + '<span>Menu</span></button>'
+ punkt(SEITE, ZAHNRAD, "Settings", hier === "settings.html")
+ punkt(STAT_SEITE, BALKEN, "Statistics", hier === "statistics.html")
+ '<button type="button" class="ev-unten-thema"></button>'
+ punkt(WURZEL + "game/games.html?" + TEIL, SPIELE, "Games", hier === "games.html");
nav.querySelector(".ev-unten-menu").addEventListener("click", function () {
var b = document.getElementById("sl-knopf"); if (b) b.click();
});
var th = nav.querySelector(".ev-unten-thema");
function thZeigen() { var d = istDunkel(); th.innerHTML = (d ? SONNE : MOND) + '<span>' + (d ? "Light" : "Dark") + '</span>'; th.setAttribute("aria-label", d ? "Switch to light mode" : "Switch to dark mode"); }
thZeigen();
th.addEventListener("click", function () {
var m = document.getElementById("hell-dunkel"); 
if (m) m.click();
else { var neu = istDunkel() ? "light" : "dark"; html.setAttribute("data-theme", neu); setze("ev_theme", neu); }
thZeigen();
});
try { new MutationObserver(thZeigen).observe(html, { attributes: true, attributeFilter: ["data-theme"] }); } catch (e) { }
document.body.appendChild(nav);
html.classList.add("ev-unten-an");
}
function start() {
adressenLesen(); 
if (!document.getElementById("einst-css-klein")) {
var s = document.createElement("style"); s.id = "einst-css-klein";
s.textContent = CSS.split("\n").slice(0, 4).join("\n"); 
if (lies("ddd_fun_tipp_v1") !== "1") setze("ddd_fun_tipp_v1", "1");
document.head.appendChild(s);
}
knopf();
setTimeout(knopf, 300); setTimeout(knopf, 1500);
unten();
var seite = document.getElementById("einst-seite");
if (seite) {
if (!document.getElementById("einst-css")) { var c = document.createElement("style"); c.id = "einst-css"; c.textContent = CSS; document.head.appendChild(c); }
zeichnen(seite);
} 
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
window.EINSTELLUNGEN = { auf: function () { location.href = SEITE; }, seite: SEITE, unten: unten };
})();
