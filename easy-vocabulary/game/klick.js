(function () {
"use strict";
var WARTEN_MS = 150;
function tonAn() {
try { return localStorage.getItem("ddd_sound_enabled_v1") !== "0"; }
catch (e) { return true; }
}
var ctx = null;
function kontext() {
if (!ctx || ctx.state === "closed") {
var K = window.AudioContext || window.webkitAudioContext;
if (!K) return null;
try { ctx = new K(); } catch (e) { return null; }
}
return ctx;
}
function plopp(c) {
var t0 = c.currentTime + 0.005;
var o = c.createOscillator(), g = c.createGain();
o.type = "sine";
o.frequency.setValueAtTime(1000, t0);
o.frequency.exponentialRampToValueAtTime(560, t0 + 0.06);
g.gain.setValueAtTime(0.0001, t0);
g.gain.exponentialRampToValueAtTime(0.018, t0 + 0.008); 
g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.075);
o.connect(g); g.connect(c.destination);
o.start(t0); o.stop(t0 + 0.09);
}
function spielen() {
if (!tonAn()) return false;
var c = kontext();
if (!c) return false;
try {
if (c.state !== "running") { var p = c.resume(); if (p && p.catch) p.catch(function () { }); }
plopp(c);
return true;
} catch (e) { return false; }
}
var klickMitTon = null; 
var unterwegs = false; 
document.addEventListener("click", function (e) {
klickMitTon = null;
var el = e.target.closest && e.target.closest("button, a[href]");
if (!el || el.disabled || el.closest("[data-ohne-klick]")) return;
if (spielen()) klickMitTon = e;
}, true);
window.addEventListener("click", function (e) {
if (klickMitTon !== e || e.defaultPrevented) return;
var a = e.target.closest("a[href]");
if (!a) return;
if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
var href = a.getAttribute("href");
if (href.charAt(0) === "#" || /^(javascript|mailto|tel):/i.test(href)) return;
e.preventDefault();
if (unterwegs) return; 
unterwegs = true;
setTimeout(function () { location.href = a.href; }, WARTEN_MS);
});
window.addEventListener("pageshow", function () { unterwegs = false; });
document.addEventListener("visibilitychange", function () {
if (document.visibilityState === "visible") return;
if (ctx && ctx.state !== "closed") { try { ctx.close(); } catch (e) { } }
ctx = null;
});
})();
document.addEventListener("keydown", function (e) {
if (e.key !== "+" || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
var t = e.target;
if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
var weiter = document.getElementById("naechstes"), ende = document.getElementById("ende");
if (!weiter || weiter.hidden || (ende && ende.hidden) || !weiter.offsetParent) return;
e.preventDefault();
weiter.click();
});
