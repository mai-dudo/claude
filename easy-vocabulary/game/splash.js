(function () {
"use strict";
try {
if (sessionStorage.getItem("ev_splash")) return; 
sessionStorage.setItem("ev_splash", "1");
} catch (e) {  }
var html = document.documentElement;
var skript = document.currentScript;
var ordner = (skript && skript.getAttribute("data-bilder")) || "bilder/logo/";
var ruhig = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
var MIN_MS = ruhig ? 600 : 1100, MAX_MS = 3000;
var start = Date.now();
var css =
"html.ev-splash-an{background:#fffefb}" +
"html.ev-splash-an[data-theme=dark]{background:#0d1627}" +
"html.ev-splash-an body{visibility:hidden;overflow:hidden}" +
"#ev-splash{visibility:visible;position:fixed;inset:0;z-index:2147483000;display:flex;" +
"flex-direction:column;align-items:center;justify-content:center;gap:0;" +
"background:#fffefb;color:#181818;transition:opacity .35s ease}" +
"html[data-theme=dark] #ev-splash{background:#0d1627;color:#eceef0}" +
"#ev-splash.weg{opacity:0}" +
"#ev-splash *{transition:none}" + 
".evs-logo{position:relative;width:118px;height:118px}" +
".evs-logo img{position:absolute;left:0;width:100%;height:auto;display:block}" +
".evs-strahl{top:0}" +
".evs-buch{bottom:0}" +
".evs-s1{clip-path:inset(0 56% 0 0)}" +
".evs-s2{clip-path:inset(0 44% 0 44%)}" +
".evs-s3{clip-path:inset(0 0 0 56%)}" +
".evs-name{margin:18px 0 0;font:800 22px/1.2 Inter,ui-rounded,\"Arial Rounded MT Bold\",\"Trebuchet MS\"," +
"-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Arial,sans-serif;letter-spacing:.2px}" +
".evs-ring{margin-top:26px;width:30px;height:30px;box-sizing:border-box;border-radius:50%;" +
"border:3.5px solid rgba(128,128,128,.22);border-top-color:#0a6ef5;border-right-color:#0bb080}" +
"@media (prefers-reduced-motion:no-preference){" +
".evs-buch{transform-origin:50% 90%;animation:evs-pop .55s cubic-bezier(.3,1.5,.5,1) both," +
"evs-atmen 1.8s ease-in-out .7s infinite}" +
".evs-strahl{transform-origin:50% 100%;opacity:0;animation:evs-strahl .4s ease-out both," +
"evs-leuchten 1.2s ease-in-out infinite}" +
".evs-s1{animation-delay:.45s,.95s}" +
".evs-s2{animation-delay:.55s,1.15s}" +
".evs-s3{animation-delay:.65s,1.35s}" +
".evs-name{animation:evs-hoch .5s ease-out .3s both}" +
".evs-ring{animation:evs-da .3s ease-out .5s both,evs-drehen .8s linear infinite}" +
"@keyframes evs-pop{0%{opacity:0;transform:scale(.4)}70%{opacity:1;transform:scale(1.1)}100%{opacity:1;transform:scale(1)}}" +
"@keyframes evs-atmen{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}" +
"@keyframes evs-strahl{0%{opacity:0;transform:translateY(14px) scale(.4)}100%{opacity:1;transform:none}}" +
"@keyframes evs-leuchten{0%,100%{opacity:1}50%{opacity:.3}}" +
"@keyframes evs-hoch{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:none}}" +
"@keyframes evs-da{0%{opacity:0}100%{opacity:1}}" +
"@keyframes evs-drehen{to{transform:rotate(360deg)}}" +
"}";
var stil = document.createElement("style");
stil.textContent = css;
(document.head || html).appendChild(stil);
html.classList.add("ev-splash-an");
var box = document.createElement("div");
box.id = "ev-splash";
box.setAttribute("role", "status");
box.setAttribute("aria-label", "Easy Vocabulary is loading");
box.innerHTML =
'<div class="evs-logo" aria-hidden="true">' +
'<img class="evs-strahl evs-s1" src="' + ordner + 'logo-rays.png" alt="">' +
'<img class="evs-strahl evs-s2" src="' + ordner + 'logo-rays.png" alt="">' +
'<img class="evs-strahl evs-s3" src="' + ordner + 'logo-rays.png" alt="">' +
'<img class="evs-buch" src="' + ordner + 'logo-book.png" alt="">' +
'</div>' +
'<p class="evs-name">Easy Vocabulary</p>' +
'<div class="evs-ring" aria-hidden="true"></div>';
function einsetzen() {
if (!document.body) return false;
document.body.insertBefore(box, document.body.firstChild);
return true;
}
if (!einsetzen()) {
var beob = new MutationObserver(function () { if (einsetzen()) beob.disconnect(); });
beob.observe(html, { childList: true });
}
var fertig = false;
function weg() {
if (fertig) return;
fertig = true;
box.classList.add("weg");
html.classList.remove("ev-splash-an"); 
setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 400);
}
function geladen() { setTimeout(weg, Math.max(0, MIN_MS - (Date.now() - start))); }
if (document.readyState !== "loading") geladen();
else document.addEventListener("DOMContentLoaded", geladen);
setTimeout(weg, MAX_MS); 
})();
