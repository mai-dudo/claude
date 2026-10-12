(function () {
"use strict";
var ORDNUNG = [
"#inst-kopf", 
"#hell-dunkel", 
"#fun-knopf", 
".sp-wahl", 
"#einst-knopf", 
"#konto-knopf" 
];
var PFEIL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
'<path d="M12 3.6v11.2"/><path d="M7.2 10.2L12 15l4.8-4.8"/><path d="M4.6 19.4h14.8"/></svg>';
function stil() {
if (document.getElementById("kopf-knoepfe-css")) return;
var s = document.createElement("style");
s.id = "kopf-knoepfe-css";
s.textContent = [
".bt-download.rund { width: 36px; height: 36px; padding: 0; gap: 0; border-radius: 50%; color: #16a34a; }",
".bt-download.rund .wort { display: none; }",
".bt-download.rund .horn { display: inline-flex; font-size: 0; line-height: 0; }",
"@media (max-width: 700px) { .bt-download.rund { width: 32px; height: 32px; } }",
"@media (max-width: 480px) { .bt-download.rund { width: 30px; height: 30px; } }",
":root:not([data-theme='light']) .bt-download.rund { color: #4ade80; }",
"@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) .bt-download.rund { color: #4ade80; } }",
":root[data-theme='dark'] .bt-download.rund { color: #4ade80; }"
].join("\n");
(document.head || document.documentElement).appendChild(s);
}
function downloadRund(k) {
if (!k || k.classList.contains("rund")) return;
k.classList.add("rund");
if (!k.getAttribute("title")) k.setAttribute("title", "Download");
var horn = k.querySelector(".horn");
if (horn && horn.innerHTML.indexOf("<svg") < 0) horn.innerHTML = PFEIL;
}
var amSortieren = false;
function sortieren() {
var box = document.querySelector("header.kopf .kopf-rechts") ||
document.querySelector(".kopf-rechts");
if (!box || amSortieren) return;
var da = [];
for (var i = 0; i < ORDNUNG.length; i++) {
var el = box.querySelector(ORDNUNG[i]);
if (el && el.parentNode === box) da.push(el);
}
if (!da.length) return;
downloadRund(box.querySelector("#inst-kopf"));
var jetzt = [];
for (var k = 0; k < box.children.length; k++) {
if (da.indexOf(box.children[k]) > -1) jetzt.push(box.children[k]);
}
var gleich = jetzt.length === da.length;
for (var j = 0; gleich && j < da.length; j++) if (jetzt[j] !== da[j]) gleich = false;
if (gleich) return;
amSortieren = true;
for (var m = 0; m < da.length; m++) box.appendChild(da[m]); 
amSortieren = false;
}
function start() {
stil();
sortieren();
var box = document.querySelector("header.kopf .kopf-rechts") || document.querySelector(".kopf-rechts");
if (box && window.MutationObserver) {
new MutationObserver(function () { sortieren(); }).observe(box, { childList: true });
}
setTimeout(sortieren, 200); setTimeout(sortieren, 800); setTimeout(sortieren, 2000);
window.addEventListener("load", sortieren);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
})();
