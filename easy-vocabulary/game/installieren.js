(function () {
try {
var kap = new URLSearchParams(location.search).get("chapter");
if (kap && /^[a-z0-9-]+$/.test(kap) && ["marked", "daily", "random", "all"].indexOf(kap) < 0
&& /\/game\/(type|play|build|sentence|recall|match|search|dictation|shadowing|vocab)\.html$/.test(location.pathname)) {
var l = document.createElement("link");
l.rel = "preload"; l.as = "script"; l.href = "../daten/kapitel/" + kap + ".js";
document.head.appendChild(l);
}
} catch (e) { }
})();
(function () {
"use strict";
if (!window.__evZuhoerer) {
window.__evZuhoerer = true;
window.addEventListener("beforeinstallprompt", function (e) {
e.preventDefault(); 
window.__installEreignis = e;
document.dispatchEvent(new Event("ev-installierbar"));
});
window.addEventListener("appinstalled", function () {
window.__installEreignis = null;
window.__installiert = true;
document.dispatchEvent(new Event("ev-installiert"));
});
}
var ua = navigator.userAgent || "";
var IST_IOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
var IST_IOS_FREMD = IST_IOS && /CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(ua);
var IST_ANDROID = /Android/.test(ua);
var GERAET = IST_IOS ? "apple" : (IST_ANDROID ? "android" : "computer");
var IST_FIREFOX = /Firefox\//.test(ua);
var IST_SAFARI_MAC = !IST_IOS && /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua);
function laeuftAlsApp() {
try {
if (window.matchMedia("(display-mode: standalone)").matches) return true;
if (window.matchMedia("(display-mode: window-controls-overlay)").matches) return true;
} catch (e) { }
return window.navigator.standalone === true || window.__installiert === true;
}
function stilEinbauen() {
if (document.getElementById("ev-download-stil")) return;
var s = document.createElement("style");
s.id = "ev-download-stil";
s.textContent = [
".bt-download { display: inline-flex; align-items: center; justify-content: center; gap: 7px;",
"  height: 36px; box-sizing: border-box; padding: 0 15px 0 12px; border-radius: 999px; cursor: pointer;",
"  font: inherit; font-size: 14px; font-weight: 800; color: var(--text);",
"  background: var(--btn-bg); border: 1px solid var(--btn-border); white-space: nowrap; flex: none; }",
".bt-download:hover { border-color: var(--text); }",
".bt-download:active { transform: translateY(1px); }",
".bt-download .horn { font-size: 16px; line-height: 1; }",
".bt-download[hidden] { display: none; }",
"@media (max-width: 640px) {",
"  .bt-download { width: 36px; height: 36px; padding: 0; gap: 0; }",
"  .bt-download .wort { display: none; }",
"}",
"@media (max-width: 480px) { .bt-download { width: 32px; height: 32px; } .bt-download .horn { font-size: 15px; } }",
"@media (max-width: 360px) { .bt-download { width: 30px; height: 30px; } .bt-download .horn { font-size: 14px; } }",
".inst-blase { position: fixed; z-index: 9998; box-sizing: border-box; width: 290px; max-width: calc(100% - 24px);",
"  padding: 12px 14px; border-radius: 14px; text-align: left;",
"  font-size: 14px; line-height: 1.45; color: var(--text);",
"  background: var(--bg); border: 1.5px solid var(--btn-border);",
"  box-shadow: 0 6px 18px rgba(0, 0, 0, .18); }",
".inst-blase[hidden] { display: none; }",
".inst-blase::before { content: \"\"; position: absolute; top: -8px; right: var(--pfeil, 24px);",
"  width: 12px; height: 12px; background: var(--bg);",
"  border-left: 1.5px solid var(--btn-border); border-top: 1.5px solid var(--btn-border);",
"  transform: rotate(45deg); }",
".inst-blase b { color: var(--text); }",
".inst-blase.inst-blase-mitte { left: 50% !important; right: auto !important; top: 84px !important; transform: translateX(-50%); }",
".inst-blase.inst-blase-mitte::before { display: none; }"
].join("\n");
document.head.appendChild(s);
}
function start() {
var kopf = document.querySelector("header.kopf");
if (!kopf) return; 
var kopfKnopf = document.getElementById("inst-kopf");
var blase = document.getElementById("inst-blase");
var bereich = document.getElementById("installieren"); 
if (bereich) bereich.hidden = true;
if (laeuftAlsApp()) { 
if (kopfKnopf) kopfKnopf.hidden = true;
return;
}
stilEinbauen();
if (!kopfKnopf) {
var box = kopf.querySelector(".kopf-rechts");
if (!box) { 
box = document.createElement("div");
box.className = "kopf-rechts";
box.style.cssText = "display:flex;align-items:center;gap:10px;";
var mond = document.getElementById("hell-dunkel");
if (mond && mond.parentNode === kopf) kopf.replaceChild(box, mond), box.appendChild(mond);
else kopf.appendChild(box);
}
kopfKnopf = document.createElement("button");
kopfKnopf.type = "button";
kopfKnopf.className = "bt-download";
kopfKnopf.id = "inst-kopf";
kopfKnopf.setAttribute("aria-label", "Download Easy Vocabulary");
kopfKnopf.innerHTML = '<span class="horn" aria-hidden="true">📥</span><span class="wort">Download</span>';
box.insertBefore(kopfKnopf, box.firstChild);
}
if (!blase) {
blase = document.createElement("div");
blase.className = "inst-blase";
blase.id = "inst-blase";
blase.setAttribute("role", "status");
blase.setAttribute("aria-live", "polite");
blase.hidden = true;
kopf.parentNode.insertBefore(blase, kopf.nextSibling);
}
var blaseTimer = null;
function blaseZu() {
clearTimeout(blaseTimer);
blase.hidden = true;
blase.innerHTML = "";
}
function blaseZeigen(html, dauer) {
if (!html) { blaseZu(); return; }
blase.innerHTML = html;
blase.hidden = false;
var sichtbar = kopfKnopf.offsetParent !== null && kopfKnopf.getBoundingClientRect().width > 0;
blase.classList.toggle("inst-blase-mitte", !sichtbar);
if (!sichtbar) { clearTimeout(blaseTimer); blaseTimer = setTimeout(blaseZu, dauer || 14000); return; }
var r = kopfKnopf.getBoundingClientRect();
var mitte = r.left + r.width / 2;
var breite = blase.offsetWidth;
var bw = document.documentElement.clientWidth || window.innerWidth; 
var rechts = Math.round(bw - Math.min(bw - 12, mitte + 30));
rechts = Math.min(rechts, Math.round(bw - breite - 12));
rechts = Math.max(12, rechts);
blase.style.top = Math.round(r.bottom + 12) + "px";
blase.style.right = rechts + "px";
var pfeil = Math.round(bw - rechts - mitte - 6);
blase.style.setProperty("--pfeil", Math.max(8, Math.min(breite - 20, pfeil)) + "px");
clearTimeout(blaseTimer);
blaseTimer = setTimeout(blaseZu, dauer || 14000);
}
document.addEventListener("pointerdown", function (e) {
if (blase.hidden) return;
if (e.target === kopfKnopf || kopfKnopf.contains(e.target)) return;
blaseZu();
}, true);
window.addEventListener("resize", blaseZu);
document.addEventListener("keydown", function (e) { if (e.key === "Escape") blaseZu(); });
function fertigZeigen() {
if (kopfKnopf.hidden) return;
blaseZeigen("✅ Easy Vocabulary is installed on this device.", 6000);
kopfKnopf.hidden = true; 
}
document.addEventListener("ev-installiert", fertigZeigen);
function anleitungApple() {
if (IST_IOS_FREMD) {
blaseZeigen("On iPhone the app must be added from <b>Safari</b> (from this browser it only " +
"becomes a bookmark, and the keyboard does not work). Open " +
"<b>easy-vocabulary.com</b> in <b>Safari</b>, tap <b>Share</b> (the square with " +
"the arrow up), then <b>Add to Home Screen</b>.");
} else if (IST_IOS) {
blaseZeigen("In <b>Safari</b>: tap <b>Share</b> (the square with the arrow up) " +
"at the bottom, then <b>Add to Home Screen</b>.");
} else {
blaseZeigen("Open <b>easy-vocabulary.com</b> in <b>Safari</b> on your iPhone or iPad. " +
"Then tap <b>Share</b> and <b>Add to Home Screen</b>.");
}
}
function installieren() {
if (GERAET === "apple") { anleitungApple(); return; }
var ereignis = window.__installEreignis;
if (ereignis && ereignis.prompt) {
blaseZu();
ereignis.prompt();
if (ereignis.userChoice && ereignis.userChoice.then) {
ereignis.userChoice.then(function (wahl) {
if (wahl && wahl.outcome === "accepted") { window.__installEreignis = null; fertigZeigen(); }
else blaseZeigen("No problem – you can install it later with this button.");
}, function () { });
}
return;
}
if (IST_FIREFOX || IST_SAFARI_MAC) {
blaseZeigen("This browser cannot install apps. Please open this page in <b>Chrome</b> or <b>Edge</b>.");
} else if (GERAET === "android") {
blaseZeigen("Tap the menu <b>⋮</b> at the top right, then <b>Add to Home screen</b> or <b>Install app</b>.");
} else {
blaseZeigen("Click the <b>install icon</b> at the right end of the address bar, " +
"or open the menu <b>⋮</b> and choose <b>Install Easy Vocabulary</b>.");
}
}
kopfKnopf.hidden = false;
kopfKnopf.addEventListener("click", installieren);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
})();
