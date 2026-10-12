(function () {
"use strict";
var DATEIEN = ["bruh.mp3", "nope.mp3", "huh.mp3"]; 
var LAUT = 0.08; 
var CHANCE = 0.9; 
var SCHALTER = "ddd_fun_sounds_v1";
var TIPP = "ddd_fun_tipp_v1";
var toene = null;
var BASIS = (function () {
try {
var s = document.currentScript && document.currentScript.src;
if (s) return s.replace(/game\/bruh\.js(\?.*)?$/, "ton/effekte/");
} catch (e) { }
return "../ton/effekte/";
})();
function lies(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function funAn() { return lies(SCHALTER) !== "0"; }
function tonAn() { return lies("ddd_sound_enabled_v1") !== "0"; }
function bauen() {
if (toene) return;
toene = DATEIEN.map(function (d) {
var a = new Audio(BASIS + d);
a.volume = LAUT; a.preload = "auto";
return a;
});
}
window.SPASSTON = {
falsch: function (kapitelId) {
if (!funAn() || !tonAn()) return false;
if (Math.random() >= CHANCE) return false; 
try {
bauen();
var a = toene[Math.floor(Math.random() * toene.length)];
a.currentTime = 0;
var p = a.play(); if (p && p.catch) p.catch(function () { });
} catch (e) { return false; }
return true;
}
};
function knopf() {
var box = document.querySelector(".kopf-rechts");
if (!box || document.getElementById("fun-knopf")) return;
var k = document.createElement("button");
k.type = "button"; k.id = "fun-knopf"; k.className = "bt-hell-dunkel";
k.style.animationDelay = "1.4s";
if (!document.getElementById("fun-knopf-css")) {
var st = document.createElement("style"); st.id = "fun-knopf-css";
st.textContent = "@keyframes fun-huepf { 0% { transform: scale(1) rotate(0); } 25% { transform: scale(1.3) rotate(-18deg); }" +
" 55% { transform: scale(0.9) rotate(14deg); } 80% { transform: scale(1.1) rotate(-6deg); } 100% { transform: scale(1) rotate(0); } }" +
" #fun-knopf.huepft { animation: fun-huepf .55s ease-out !important; }";
document.head.appendChild(st);
}
var moon = document.getElementById("hell-dunkel");
function zeigen() {
var an = funAn();
k.textContent = "😄";
k.style.opacity = an ? "1" : "0.45";
k.style.filter = an ? "none" : "grayscale(1)";
k.style.boxShadow = an ? "0 0 0 2px var(--blau, #1a5fb4)" : "none";
k.setAttribute("aria-label", "Fun sounds: " + (an ? "on" : "off"));
k.title = "Fun sounds: " + (an ? "on" : "off");
}
k.addEventListener("click", function () {
k.classList.remove("huepft"); void k.offsetWidth; k.classList.add("huepft");
setTimeout(function () { k.classList.remove("huepft"); }, 600);
try { localStorage.setItem(SCHALTER, funAn() ? "0" : "1"); } catch (e) { }
zeigen();
if (funAn() && tonAn()) { 
try { bauen(); var a = toene[0]; a.currentTime = 0; var p = a.play(); if (p && p.catch) p.catch(function () { }); } catch (e) { }
}
});
zeigen();
box.insertBefore(k, moon || null); 
if (moon) box.insertBefore(moon, k); 
tippZeigen(k);
}
function tippZeigen(k) {
if (lies(TIPP) === "1") return;
setTimeout(function () {
if (!document.body.contains(k)) return;
var r = k.getBoundingClientRect();
if (!r.width) return;
var z = document.createElement("div");
z.id = "fun-tipp"; z.setAttribute("role", "status");
var breite = Math.min(240, window.innerWidth - 24);
var rechts = Math.max(12, Math.round(window.innerWidth - r.right));
z.style.cssText = "position:fixed;z-index:9999;top:" + Math.round(r.bottom + 12) + "px;right:" + rechts +
"px;width:" + breite + "px;box-sizing:border-box;background:var(--karte,#fff);color:var(--text,#222);" +
"border:2px solid var(--blau,#1a5fb4);border-radius:14px;padding:12px 14px;font:inherit;font-size:14px;" +
"line-height:1.35;box-shadow:0 6px 18px rgba(0,0,0,.18);cursor:pointer;";
var pfeil = document.createElement("span");
pfeil.style.cssText = "position:absolute;top:-9px;right:" + Math.max(8, Math.round(r.width / 2 - 8) + (rechts > 12 ? 0 : 0)) +
"px;width:14px;height:14px;background:inherit;border-left:2px solid var(--blau,#1a5fb4);" +
"border-top:2px solid var(--blau,#1a5fb4);transform:rotate(45deg);";
var text = document.createElement("div");
text.innerHTML = "<b>😄 New: Fun sounds!</b><br>Tap this button to turn the funny mistake sounds on or off.";
var ok = document.createElement("button");
ok.type = "button";
ok.textContent = "Got it";
ok.style.cssText = "display:block;margin:8px 0 0 auto;padding:4px 2px;background:none;border:0;cursor:pointer;" +
"font:inherit;font-size:14px;font-weight:800;color:var(--blau,#1a5fb4);";
z.appendChild(pfeil); z.appendChild(text); z.appendChild(ok);
function zu() {
try { localStorage.setItem(TIPP, "1"); } catch (e) { }
if (z.parentNode) z.parentNode.removeChild(z);
document.removeEventListener("pointerdown", zu, true);
}
z.addEventListener("click", zu);
document.addEventListener("pointerdown", zu, true);
setTimeout(zu, 9000);
document.body.appendChild(z);
try { localStorage.setItem(TIPP, "1"); } catch (e) { }
}, 1200);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", knopf);
else knopf();
})();
