(function () {
"use strict";
var ICH = document.currentScript && document.currentScript.src;
if (!ICH) return;
function pfad(datei) { return new URL(datei, ICH).href; }
function stil() {
if (document.getElementById("ev-sprache-stil")) return;
var s = document.createElement("style");
s.id = "ev-sprache-stil";
s.textContent = [
".sp-wahl { position: relative; flex: none; display: inline-flex; }",
".bt-sprache-kopf { width: 36px; height: 36px; padding: 0; border-radius: 50%; cursor: pointer;",
"  display: inline-flex; align-items: center; justify-content: center; flex: none;",
"  background: var(--btn-bg); border: 1px solid var(--btn-border); }",
".bt-sprache-kopf:hover { border-color: var(--text); }",
".bt-sprache-kopf:active { transform: translateY(1px); }",
".bt-sprache-kopf img { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; display: block;",
"  box-shadow: 0 0 0 1px rgba(0,0,0,.12); }",
".sp-menue { position: absolute; top: calc(100% + 8px); right: 0; z-index: 9999; min-width: 180px;",
"  margin: 0; padding: 6px; list-style: none; box-sizing: border-box; border-radius: 14px;",
"  background: var(--bg); border: 1.5px solid var(--btn-border); box-shadow: 0 6px 18px rgba(0,0,0,.18);",
"  overflow-y: auto; overscroll-behavior: contain; }",
".sp-menue[hidden] { display: none; }",
".sp-menue button { width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px 10px;",
"  border: 0; border-radius: 10px; background: none; cursor: pointer; text-align: left;",
"  font: inherit; font-size: 15px; font-weight: 700; color: var(--text); }",
".sp-menue button:hover, .sp-menue button:focus-visible { background: var(--btn-bg); outline: none; }",
".sp-menue img { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex: none;",
"  box-shadow: 0 0 0 1px rgba(0,0,0,.12); }",
".sp-menue .sp-name { flex: 1; }",
".sp-menue .sp-haken { width: 1em; color: var(--text); }",
"@media (max-width: 480px) { .bt-sprache-kopf { width: 32px; height: 32px; } .bt-sprache-kopf img { width: 23px; height: 23px; } }",
"@media (max-width: 360px) { .bt-sprache-kopf { width: 30px; height: 30px; } .bt-sprache-kopf img { width: 21px; height: 21px; } }"
].join("\n");
document.head.appendChild(s);
}
function waehlen(id) {
try { localStorage.setItem("ev_mutter", id); } catch (e) { }
var u = new URL(location.href);
if (u.searchParams.has("native")) u.searchParams.set("native", id);
location.replace(u.href);
}
function bauen() {
var kopf = document.querySelector("header.kopf");
if (!kopf || document.getElementById("sprache-kopf")) return;
if (typeof MUTTERSPRACHEN === "undefined") return;
var vor = kopf.querySelector("#konto-knopf") || kopf.querySelector("#hell-dunkel");
if (vor && vor.parentNode === kopf) {
var gruppe = document.createElement("div");
gruppe.className = "kopf-rechts";
gruppe.style.cssText = "display:flex;align-items:center;gap:10px;";
kopf.replaceChild(gruppe, vor);
gruppe.appendChild(vor);
}
stil();
var jetzt = mutterSprache();
var liste = MUTTERSPRACHEN.filter(mutterWaehlbar);
var aktuell = liste.filter(function (s) { return s.id === jetzt; })[0] || liste[0];
var wahl = document.createElement("span");
wahl.className = "sp-wahl";
var knopf = document.createElement("button");
knopf.type = "button";
knopf.className = "bt-sprache-kopf";
knopf.id = "sprache-kopf";
knopf.setAttribute("aria-haspopup", "true");
knopf.setAttribute("aria-expanded", "false");
knopf.setAttribute("aria-label", "My language: " + aktuell.name + ". Change language");
knopf.title = aktuell.name;
knopf.innerHTML = '<img src="' + pfad(aktuell.flagge || "flag-us.svg") + '" alt="" width="26" height="26">';
var menue = document.createElement("ul");
menue.className = "sp-menue";
menue.id = "sprache-menue";
menue.hidden = true;
menue.setAttribute("role", "menu");
liste.forEach(function (s) {
var li = document.createElement("li");
var b = document.createElement("button");
b.type = "button";
b.setAttribute("role", "menuitemradio");
b.setAttribute("aria-checked", s.id === aktuell.id ? "true" : "false");
b.setAttribute("lang", s.id);
b.innerHTML = (s.flagge ? '<img data-src="' + pfad(s.flagge) + '" alt="" width="26" height="26">' : "") +
'<span class="sp-name"></span><span class="sp-haken" aria-hidden="true">' + (s.id === aktuell.id ? "✓" : "") + "</span>";
b.querySelector(".sp-name").textContent = s.name;
b.addEventListener("click", function () {
if (s.id === aktuell.id) { zu(); return; }
waehlen(s.id);
});
li.appendChild(b);
menue.appendChild(li);
});
function auf() {
menue.hidden = false;
var spaet = menue.querySelectorAll("img[data-src]");
for (var i = 0; i < spaet.length; i++) { spaet[i].src = spaet[i].getAttribute("data-src"); spaet[i].removeAttribute("data-src"); }
knopf.setAttribute("aria-expanded", "true");
var b = knopf.getBoundingClientRect(), breit = menue.offsetWidth;
var rand = document.documentElement.clientWidth;
var links = Math.max(8, Math.min(b.right - breit, rand - 8 - breit));
menue.style.position = "fixed";
menue.style.top = Math.round(b.bottom + 8) + "px";
menue.style.left = Math.round(links) + "px";
menue.style.right = "auto";
var r = menue.getBoundingClientRect();
menue.style.left = Math.round(links - (r.left - links)) + "px";
menue.style.top = Math.round(b.bottom + 8 - (r.top - (b.bottom + 8))) + "px";
var oben = menue.getBoundingClientRect().top;
menue.style.maxHeight = Math.max(160, Math.floor(window.innerHeight - oben - 12)) + "px";
var an = menue.querySelector('[aria-checked="true"]');
if (an) {
var mr = menue.getBoundingClientRect(), ar = an.getBoundingClientRect();
if (ar.bottom > mr.bottom) menue.scrollTop += ar.bottom - mr.bottom + 6;
}
}
function zu() { menue.hidden = true; knopf.setAttribute("aria-expanded", "false"); }
knopf.addEventListener("click", function (e) { e.stopPropagation(); if (menue.hidden) auf(); else zu(); });
document.addEventListener("click", function (e) { if (!wahl.contains(e.target)) zu(); });
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menue.hidden) { zu(); knopf.focus(); } });
window.addEventListener("resize", zu);
window.addEventListener("scroll", zu, { passive: true });
wahl.appendChild(knopf);
wahl.appendChild(menue);
if (vor) vor.parentNode.insertBefore(wahl, vor);
else kopf.appendChild(wahl);
}
function start() {
if (typeof MUTTERSPRACHEN !== "undefined") { bauen(); return; }
var s = document.createElement("script");
s.src = pfad("mutter.js");
s.onload = bauen;
document.head.appendChild(s);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
})();
