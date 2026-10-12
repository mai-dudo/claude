function vorlesenAnschliessen(teile) {
"use strict";
var knopf = teile.knopf;
var absaetze = [].concat(teile.absatz).filter(function (a) { return !!a; });
if (!knopf || !absaetze.length) return;
var ton = new Audio(teile.datei);
ton.preload = "none"; 
var woerter = [], spans = [];
absaetze.forEach(function (absatz) {
var hier = absatz.textContent.trim().split(/\s+/);
absatz.textContent = "";
hier.forEach(function (w, i) {
var s = document.createElement("span");
s.className = "w";
s.textContent = w;
absatz.appendChild(s);
if (i < hier.length - 1) absatz.appendChild(document.createTextNode(" "));
woerter.push(w);
spans.push(s);
});
});
var gewichte = woerter.map(function (w) {
var g = w.replace(/[^A-Za-z']/g, "").length + 1;
if (/[.!?]$/.test(w)) g += 4;
else if (/,$/.test(w)) g += 2;
return g;
});
var summe = gewichte.reduce(function (a, b) { return a + b; }, 0);
var starts = [];
(function () {
var bisher = 0;
gewichte.forEach(function (g) { starts.push(bisher / summe); bisher += g; });
})();
var bild = null;
function zeichne() {
var dauer = ton.duration;
if (!dauer || !isFinite(dauer)) return;
var anteil = ton.currentTime / dauer;
spans.forEach(function (s, i) {
if (anteil >= starts[i]) s.classList.add("an");
else s.classList.remove("an");
});
}
function malen() {
zeichne();
if (!ton.paused) bild = requestAnimationFrame(malen);
}
ton.addEventListener("timeupdate", zeichne);
document.addEventListener("visibilitychange", function () {
if (document.visibilityState === "visible" && !ton.paused && !bild) malen();
});
function aus() {
knopf.classList.remove("laeuft");
absaetze.forEach(function (a) { a.classList.remove("liest"); });
spans.forEach(function (s) { s.classList.remove("an"); });
if (bild) { cancelAnimationFrame(bild); bild = null; }
}
ton.addEventListener("ended", aus);
ton.addEventListener("pause", aus);
ton.addEventListener("error", aus);
knopf.addEventListener("click", function () {
if (!ton.paused) { ton.pause(); ton.currentTime = 0; return; }
knopf.classList.add("laeuft");
absaetze.forEach(function (a) { a.classList.add("liest"); });
ton.currentTime = 0;
var p = ton.play();
if (p && p.then) p.then(function () { malen(); }, aus);
else malen();
});
}
