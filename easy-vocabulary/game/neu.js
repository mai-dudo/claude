(function () {
"use strict";
return;
var W = (typeof WHATS_NEW === "object" && WHATS_NEW && WHATS_NEW.version) ? WHATS_NEW : null;
var VERSION = W ? W.version : "2026-09-28";
var KEY = "ev_neu_gesehen";
var immer = /[?&]whatsnew=1(&|$)/.test(location.search);
try { if (!immer && localStorage.getItem(KEY) === VERSION) return; } catch (e) { if (!immer) return; }
if (window.WHATS_NEW_NUR_BEKANNTE && !immer) {
try { if (!localStorage.getItem(KEY) && !localStorage.getItem("ev_theme") && !localStorage.getItem("ev_lern")) return; } catch (e) { return; }
}
function neuHier() {
try {
if (localStorage.getItem("ev_konto_sitzung")) return false;
for (var i = 0; i < localStorage.length; i++) {
var k = localStorage.key(i);
if (k && k.indexOf("ev_kapitel:") === 0) return false;
}
return true;
} catch (e) { return false; }
}
if (!window.WHATS_NEW_NUR_BEKANNTE && !immer && neuHier()) { try { localStorage.setItem(KEY, VERSION); } catch (e) { } return; }
var suche = new URLSearchParams(location.search);
var TEIL = "lang=" + encodeURIComponent(suche.get("lang") || "en") + "&native=" + encodeURIComponent(suche.get("native") || "en");
var NEU = [
{ bild: "../bilder/buttons/game-spaced.png", name: "Spaced Repetition",
text: "Your words come back at the right time, so you remember them better." }, 
{ bild: "../bilder/buttons/game-shadowing.png", name: "Shadowing",
text: "Listen, read and say it out loud. Swipe like short videos." },
{ bild: "../bilder/buttons/game-mistake.png", name: "Mistake Words",
text: "Every word you got wrong in any game waits here for practice." },
{ zeichen: "📊", name: "Statistics",
text: "See your study days, your time and how much you remember." }
];
var CSS = [
".ev-neu-hinter { position: fixed; inset: 0; z-index: 2147483000; background: rgba(10, 14, 22, .5); display: flex; align-items: center; justify-content: center; padding: 16px; }",
".ev-neu-karte { position: relative; width: min(520px, 100%); max-height: calc(100dvh - 32px); overflow: auto; box-sizing: border-box; background: var(--card, #fff); color: var(--text, #181818);",
"  border-radius: 24px; padding: 26px 22px 20px; box-shadow: 0 20px 60px rgba(0,0,0,.3); font-family: inherit; animation: ev-neu-rein .28s ease-out; }",
"@keyframes ev-neu-rein { from { opacity: 0; transform: translateY(14px) scale(.98); } to { opacity: 1; transform: none; } }",
".ev-neu-karte h2 { margin: 0 0 4px; font-size: 26px; font-weight: 800; text-align: center; }",
".ev-neu-karte .ev-neu-unter { margin: 0 0 18px; text-align: center; color: var(--muted, #6b6b6b); font-size: 15px; }",
".ev-neu-liste { list-style: none; margin: 0 0 18px; padding: 0; display: grid; gap: 12px; }",
".ev-neu-liste li { display: flex; gap: 14px; align-items: center; }",
".ev-neu-bild { flex: none; width: 56px; height: 56px; border-radius: 16px; display: grid; place-items: center; font-size: 30px; background: var(--btn-bg, #fafaf8); border: 1px solid var(--btn-border, #e4e1db); }",
".ev-neu-bild img { width: 46px; height: 46px; object-fit: contain; }",
".ev-neu-liste b { display: block; font-size: 16px; }",
".ev-neu-liste small { display: block; color: var(--muted, #6b6b6b); font-size: 14px; line-height: 1.35; margin-top: 2px; }",
".ev-neu-knoepfe { display: flex; gap: 10px; flex-wrap: wrap; }",
".ev-neu-knoepfe a, .ev-neu-knoepfe button { flex: 1 1 180px; text-align: center; padding: 13px 16px; border-radius: 14px; font: inherit; font-size: 16px; font-weight: 800; cursor: pointer; text-decoration: none; }",
".ev-neu-los { background: #15803d; color: #fff; border: 0; }", 
".ev-neu-ok { background: var(--btn-bg, #fafaf8); color: var(--text, #181818); border: 1px solid var(--btn-border, #e4e1db); }",
".ev-neu-zu { position: absolute; top: 10px; right: 12px; width: 36px; height: 36px; border-radius: 50%; border: 0; background: none; color: var(--muted, #6b6b6b); font-size: 26px; line-height: 1; cursor: pointer; }"
].join("\n");
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function zeigen() {
var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
var hinter = document.createElement("div");
hinter.className = "ev-neu-hinter";
hinter.innerHTML = '<div class="ev-neu-karte" role="dialog" aria-modal="true" aria-labelledby="ev-neu-titel">'
+ '<button type="button" class="ev-neu-zu" aria-label="Close">×</button>'
+ '<h2 id="ev-neu-titel">' + esc(W ? W.titel : "✨ New in Easy Vocabulary") + '</h2>'
+ '<p class="ev-neu-unter">' + esc(W ? W.unter : "Four new ways to learn your words:") + '</p>'
+ '<ul class="ev-neu-liste">' + (W ? W.punkte : NEU).map(function (n) {
return '<li><span class="ev-neu-bild" aria-hidden="true">' + (n.bild ? '<img src="' + n.bild + '" alt="">' : n.zeichen) + '</span>'
+ '<span><b>' + esc(n.name) + '</b><small>' + esc(n.text) + '</small></span></li>';
}).join("") + '</ul>'
+ '<div class="ev-neu-knoepfe">' + (W ? '<button type="button" class="ev-neu-los" id="ev-neu-laden">🔄 Refresh now</button>' 
: '<a class="ev-neu-los" href="spaced.html?' + TEIL + '">Try Spaced Repetition</a>')
+ '<button type="button" class="ev-neu-ok">Got it</button></div></div>';
document.body.appendChild(hinter);
var laden = hinter.querySelector("#ev-neu-laden");
if (laden) laden.addEventListener("click", function () { if (window.evAktualisieren) window.evAktualisieren(); else location.reload(); });
try { localStorage.setItem(KEY, VERSION); } catch (e) { } 
var vorher = document.activeElement;
var dahinter = Array.prototype.filter.call(document.body.children, function (k) { return k !== hinter && !k.inert; });
dahinter.forEach(function (k) { k.inert = true; });
function zu() {
hinter.remove(); document.removeEventListener("keydown", taste, true);
dahinter.forEach(function (k) { k.inert = false; });
try { if (vorher && vorher.focus && document.body.contains(vorher)) vorher.focus(); } catch (e) { }
}
function taste(e) {
if (e.key === "Escape") { zu(); return; }
if (e.key !== "Tab") return;
var f = hinter.querySelectorAll("a[href], button:not([disabled])");
if (!f.length) return;
var erstes = f[0], letztes = f[f.length - 1], jetzt = document.activeElement;
if (!hinter.contains(jetzt)) { e.preventDefault(); erstes.focus(); }
else if (e.shiftKey && jetzt === erstes) { e.preventDefault(); letztes.focus(); }
else if (!e.shiftKey && jetzt === letztes) { e.preventDefault(); erstes.focus(); }
}
hinter.addEventListener("click", function (e) { if (e.target === hinter || e.target.closest(".ev-neu-zu, .ev-neu-ok")) zu(); });
document.addEventListener("keydown", taste, true);
var ok = hinter.querySelector(".ev-neu-ok"); if (ok) ok.focus();
}
function spaeter() { setTimeout(zeigen, 700); }
if (document.readyState === "complete") spaeter(); else window.addEventListener("load", spaeter);
})();
