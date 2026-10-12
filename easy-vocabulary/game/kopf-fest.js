(function () {
"use strict";
var html = document.documentElement;
function messen() {
var probe = document.createElement("div");
probe.style.cssText = "position:absolute;top:-9999px;left:0;width:100px;height:50px;" +
"overflow:scroll;visibility:hidden";
(document.body || html).appendChild(probe);
var rinne = Math.max(0, probe.offsetWidth - probe.clientWidth);
probe.parentNode.removeChild(probe);
html.style.setProperty("--rinne", rinne + "px");
}
if (!document.getElementById("ev-kopf-fest")) {
var s = document.createElement("style");
s.id = "ev-kopf-fest";
s.textContent = [
":root { scrollbar-gutter: stable both-edges; --kopf-pad: clamp(16px, 4vw, 40px); }",
"header.kopf {",
"  margin-left: calc(-1 * var(--rinne, 0px));",
"  padding-left: var(--kopf-pad);",
"  padding-right: max(0px, calc(var(--kopf-pad) - var(--rinne, 0px)));",
"}",
"footer.fusszeile { margin-top: auto; }",
"@media (max-width: 1099.98px) { html.ev-unten-an footer.fusszeile { display: none; } }" 
].join("\n");
(document.head || html).appendChild(s);
}
messen();
window.addEventListener("resize", messen);
})();
window.evAktualisieren = function () {
var warten = [];
try {
if ("serviceWorker" in navigator) warten.push(navigator.serviceWorker.getRegistration().then(function (r) { return r && r.update(); }).catch(function () { }));
if (window.caches) warten.push(caches.delete("ev-static").catch(function () { }));
} catch (e) { }
Promise.all(warten).then(function () { location.reload(); }, function () { location.reload(); });
setTimeout(function () { location.reload(); }, 3000); 
};
(function () {
if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
navigator.serviceWorker.addEventListener("controllerchange", function () {
if (document.getElementById("ev-neu-version") || document.querySelector(".ev-neu-hinter")) return;
var b = document.createElement("div");
b.id = "ev-neu-version";
b.style.cssText = "position:fixed;inset:0;z-index:2147483001;display:flex;align-items:center;justify-content:center;"
+ "padding:16px;background:rgba(10,14,22,.5)";
var knopf = "flex:1 1 140px;min-height:48px;padding:12px 16px;border-radius:14px;cursor:pointer;font:inherit;font-size:16px;font-weight:800;";
b.innerHTML = '<div role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="ev-neu-version-titel" style="outline:none;width:min(420px,100%);box-sizing:border-box;'
+ 'padding:24px 22px 20px;border-radius:22px;background:var(--card,#fff);color:var(--text,#181818);box-shadow:0 20px 60px rgba(0,0,0,.3);'
+ 'text-align:center;font:inherit">'
+ '<div aria-hidden="true" style="font-size:40px;line-height:1;margin-bottom:8px">✨</div>'
+ '<h2 id="ev-neu-version-titel" style="margin:0 0 8px;font-size:22px;font-weight:800">A new version is here</h2>'
+ '<p style="margin:0 0 18px;font-size:15px;line-height:1.45;color:var(--muted,#6b6b6b)">We updated Easy Vocabulary. '
+ 'Tap “Update” to load the newest version of the whole site.</p>'
+ '<div style="display:flex">'
+ '<button type="button" data-ev="jetzt" style="' + knopf + 'border:0;background:var(--marke,#066ef3);color:var(--accent-text,#fff)">Update</button>'
+ '</div></div>';
document.addEventListener("keydown", function (ev) {
if (!b.parentNode) return;
var aufKnopf = ev.target && ev.target.getAttribute && ev.target.getAttribute("data-ev") === "jetzt";
if (ev.key === "Tab") { ev.preventDefault(); b.querySelector('[data-ev="jetzt"]').focus(); return; }
if (!aufKnopf) { ev.preventDefault(); ev.stopPropagation(); }
}, true);
b.querySelector('[data-ev="jetzt"]').addEventListener("click", function () { window.evAktualisieren(); });
(document.body || document.documentElement).appendChild(b);
try { b.firstChild.focus(); } catch (e) { }
});
})();
(function () {
try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) { }
function farbe() {
var dunkel = document.documentElement.getAttribute("data-theme") === "dark";
var metas = document.querySelectorAll('meta[name="theme-color"]');
for (var i = 0; i < metas.length; i++) {
metas[i].removeAttribute("media");
metas[i].setAttribute("content", dunkel ? "#0d1627" : "#fffefb");
}
}
if (document.documentElement.hasAttribute("data-theme")) farbe();
if (window.MutationObserver) {
new MutationObserver(farbe).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}
var vv = window.visualViewport;
if (vv) {
var hoch = window.innerHeight;
var messen = function () {
if (window.innerHeight > hoch) hoch = window.innerHeight;
var offen = vv.height < hoch * 0.75 && document.activeElement &&
/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
document.documentElement.classList.toggle("tastatur-offen", !!offen);
};
vv.addEventListener("resize", messen);
document.addEventListener("focusout", function () { setTimeout(messen, 80); });
}
})();
(function () {
var eigen = null;
function gezeigt(el) { return !!el && el.getClientRects().length > 0; }
function platz() {
var haupt = document.querySelectorAll("main");
for (var k = 0; k < haupt.length; k++) if (gezeigt(haupt[k])) return haupt[k];
return document.body;
}
function pruefen() {
var alle = document.querySelectorAll("h1"), andere = false;
for (var i = 0; i < alle.length; i++) if (alle[i] !== eigen && gezeigt(alle[i])) { andere = true; break; }
if (andere) { if (eigen) eigen.style.display = "none"; return; }
if (!eigen) {
eigen = document.createElement("h1");
eigen.className = "ev-sr-titel";
eigen.style.cssText = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;";
}
var text = document.title.replace(/\s*[\u2013-]\s*Easy Vocabulary\s*$/, "") || "Easy Vocabulary";
if (eigen.textContent !== text) eigen.textContent = text;
eigen.style.display = "";
if (!gezeigt(eigen)) { var ziel = platz(); if (ziel) ziel.insertBefore(eigen, ziel.firstChild); } 
}
function bald() { setTimeout(pruefen, 350); }
if (document.readyState === "complete") bald(); else window.addEventListener("load", bald);
document.addEventListener("click", bald, true);
document.addEventListener("keydown", function (e) { if (e.key === "Enter") bald(); }, true);
})();
(function () {
"use strict";
var grob = window.matchMedia ? window.matchMedia("(pointer: coarse)") : null;
function handy() { return !!(grob && grob.matches) && Math.min(screen.width || 0, screen.height || 0) > 0 && Math.min(screen.width, screen.height) < 500; }
function quer() {
var o = screen.orientation && screen.orientation.type;
if (o) return o.indexOf("landscape") === 0;
if (typeof window.orientation === "number") return Math.abs(window.orientation) === 90;
return false;
}
if (handy()) {
try { var v = screen.orientation && screen.orientation.lock && screen.orientation.lock("portrait"); if (v && v.catch) v.catch(function () { }); } catch (e) { }
}
var el = null;
function bauen() {
var st = document.createElement("style");
st.textContent = "#ev-hochformat{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;"
+ "justify-content:center;gap:12px;padding:24px;box-sizing:border-box;text-align:center;background:var(--bg,#fffefb);color:var(--text,#1f1f1f);"
+ "font-family:inherit}#ev-hochformat[hidden]{display:none}#ev-hochformat .ev-hf-zeichen{font-size:56px;line-height:1;"
+ "display:inline-block;transform:rotate(-90deg);animation:ev-hf-drehen 1.6s ease-in-out infinite}"
+ "#ev-hochformat b{font-size:22px}#ev-hochformat small{font-size:15px;color:var(--muted,#6b6b6b)}"
+ "@keyframes ev-hf-drehen{0%,25%{transform:rotate(-90deg)}60%,100%{transform:rotate(0)}}"
+ "html.ev-ruhig #ev-hochformat .ev-hf-zeichen{animation:none;transform:none}";
document.head.appendChild(st);
el = document.createElement("div");
el.id = "ev-hochformat";
el.setAttribute("role", "alert");
el.innerHTML = '<span class="ev-hf-zeichen" aria-hidden="true">📱</span><b>Please turn your phone upright</b>'
+ '<small>Easy Vocabulary works in portrait mode.</small>';
document.body.appendChild(el);
}
function pruefen() {
if (!document.body) return;
var an = handy() && quer();
if (an && !el) bauen();
if (el) el.hidden = !an;
document.documentElement.classList.toggle("ev-quer", an);
}
if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener("change", pruefen);
window.addEventListener("orientationchange", function () { setTimeout(pruefen, 50); });
window.addEventListener("resize", pruefen);
if (document.body) pruefen(); else document.addEventListener("DOMContentLoaded", pruefen);
})();
(function () {
if (location.pathname.indexOf("/game/") < 0) return;
var NAMEN = { en: "English", de: "German", it: "Italian", es: "Spanish", pl: "Polish", fr: "French", bs: "Bosnian",
tr: "Turkish", ru: "Russian", ar: "Arabic", pt: "Portuguese", no: "Norwegian", da: "Danish" };
var lang = (new URLSearchParams(location.search).get("lang") || "en").toLowerCase();
var SOLL = lang === "ru" ? "kyr" : lang === "ar" ? "arab" : "lat";
var SCHRIFT = { kyr: "Russian", arab: "Arabic", griech: "Greek", lat: "English" };
function schrift(c) {
if (/[\u0400-\u04FF]/.test(c)) return "kyr";
if (/[\u0600-\u06FF]/.test(c)) return "arab";
if (/[\u0370-\u03FF]/.test(c)) return "griech";
if (/[A-Za-z\u00C0-\u024F]/.test(c)) return "lat";
return ""; 
}
var zuletzt = 0;
function pruefen(text, ziel) {
if (!text || (ziel && ziel.type && /^(email|password|url|tel)$/i.test(ziel.type))) return;
var c = String(text).slice(-1), s = schrift(c);
if (!s || s === SOLL) return;
var jetzt = Date.now();
if (jetzt - zuletzt < 30000 || document.getElementById("ev-tastatur")) return;
zuletzt = jetzt;
var handy = window.matchMedia && matchMedia("(pointer: coarse)").matches;
var b = document.createElement("div");
b.id = "ev-tastatur"; b.setAttribute("role", "status"); b.setAttribute("aria-live", "polite");
b.style.cssText = "position:fixed;left:50%;top:calc(10px + env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483002;"
+ "width:min(440px,calc(100% - 24px));box-sizing:border-box;padding:12px 14px;border-radius:14px;"
+ "background:var(--card,#fff);color:var(--text,#181818);border:2px solid #f59e0b;box-shadow:0 10px 30px rgba(0,0,0,.22);"
+ "font:inherit;font-size:14.5px;line-height:1.4;text-align:center";
b.innerHTML = "<b>⌨️ Your keyboard is typing " + SCHRIFT[s] + " letters.</b><br>"
+ "Please switch it to " + (NAMEN[lang] || "English") + ": "
+ (handy ? "tap the 🌐 key on your keyboard." : "press Win + Space (Mac: Ctrl + Space).");
(document.body || document.documentElement).appendChild(b);
setTimeout(function () { if (b.parentNode) b.remove(); }, 8000);
b.addEventListener("click", function () { b.remove(); });
}
document.addEventListener("keydown", function (e) {
if (e.ctrlKey || e.metaKey || e.altKey || !e.key || e.key.length !== 1) return;
pruefen(e.key, e.target);
}, true);
document.addEventListener("beforeinput", function (e) { if (e.data) pruefen(e.data, e.target); }, true);
})();
var EV_APP_VERSION = "2.0"; 
(function () {
function zeigen() {
var f = document.querySelector(".fusszeile");
if (!f || f.querySelector(".ev-version")) return;
var v = document.createElement("span");
v.className = "ev-version";
v.textContent = "Version " + EV_APP_VERSION;
v.style.cssText = "display:block;margin:0 0 2px";
f.insertBefore(v, f.firstChild);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", zeigen); else zeigen();
})();
