(function () {
"use strict";
function $(id) { return document.getElementById(id); }
var html = document.documentElement;
function dunkel() { return html.getAttribute("data-theme") === "dark"; }
function themaZeigen() { $("hell-dunkel").textContent = dunkel() ? "☀️" : "🌙"; } 
themaZeigen();
$("hell-dunkel").addEventListener("click", function () {
var neu = dunkel() ? "light" : "dark";
html.setAttribute("data-theme", neu);
try { localStorage.setItem("ev_theme", neu); } catch (e) { }
themaZeigen();
});
(function () {
var zahlen = document.querySelectorAll(".zahl b[data-zahl]");
var ruhig = false;
try { ruhig = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { }
if (ruhig || !zahlen.length || !("IntersectionObserver" in window)) return;
function schreib(el, n) { el.textContent = Math.round(n).toLocaleString("en-US"); }
Array.prototype.forEach.call(zahlen, function (el) { schreib(el, 0); });
var io = new IntersectionObserver(function (eintraege, o) {
if (!eintraege.some(function (e) { return e.isIntersecting; })) return;
o.disconnect();
Array.prototype.forEach.call(zahlen, function (el, i) {
var ziel = +el.getAttribute("data-zahl"), start = null, dauer = 1400,
warten = Math.max(0, 1000 - (window.performance ? performance.now() : 0)) + i * 100;
setTimeout(function () {
start = Date.now();
var uhr = setInterval(function () {
var x = Math.min(1, (Date.now() - start) / dauer);
schreib(el, ziel * (1 - Math.pow(1 - x, 3))); 
if (x >= 1) clearInterval(uhr);
}, 30);
setTimeout(function () { clearInterval(uhr); schreib(el, ziel); }, dauer + 120);
}, warten);
});
}, { threshold: .3 });
io.observe(document.querySelector(".zahlen"));
})();
var SPIELE = [
["spaced", "Spaced Repetition", "Words come back at the right time"],
["shadowing", "Shadowing", "Listen, read, say it out loud"],
["pick", "Pick the Picture", "See the word, pick the picture"],
["match", "Match the Pairs", "Match pictures and words"],
["type", "Type the Word", "See the picture, type the word"],
["sentence", "Finish the Sentence", "Type the missing word"],
["recall", "Recall & Type", "See it. Hear it. Type it."],
["dictation", "Dictation", "Hear the sentence, type it"],
["search", "Word Search", "Find the word in the letters"],
["build", "Build the Sentence", "Grow the sentence step by step"],
["tenses", "English Tenses", "Type the right verb form"],
["mistake", "Mistake Words", "Practice the words you got wrong"]
];
$("spiele").innerHTML = SPIELE.map(function (s, i) {
return '<li><div class="karte spiel" style="--i:' + i + '"><img src="bilder/buttons/game-' + s[0] + '.png" alt="" width="68" height="68" loading="lazy">'
+ '<b>' + s[1].replace("&", "&amp;") + '</b><span>' + s[2] + '</span></div></li>';
}).join("");
try {
new IntersectionObserver(function (e, o) {
if (!e[0].isIntersecting) return;
$("spiele").classList.add("da"); document.querySelector(".leicht").classList.add("da"); o.disconnect();
}, { threshold: .15 }).observe($("spiele"));
} catch (e) { $("spiele").classList.add("da"); document.querySelector(".leicht").classList.add("da"); }
var SPRACHEN = "English|us;Deutsch|de;Español|es;Italiano|it;Русский|ru;Português|br;Français|fr;Polski|pl;Türkçe|tr;Oʻzbekcha|uz;Bosanski|ba;Magyar|hu;Norsk|no;Dansk|dk;Nederlands|nl;Tiếng Việt|vn;Bahasa Indonesia|id;Filipino|ph;Ελληνικά|gr;Українська|uk;فارسی|ir;العربية|arab-league;اردو|pk;हिन्दी|in;ไทย|th;中文|cn;日本語|jp;한국어|kr";
var SEITEN = [["-160px", "0", "-20deg"], ["160px", "0", "20deg"], ["0", "90px", "12deg"], ["0", "-90px", "-12deg"]];
$("fahnen").innerHTML = SPRACHEN.split(";").map(function (s, i) {
var t = s.split("|"), w = SEITEN[i % 4];
return '<li style="--i:' + i + ';--dx:' + w[0] + ';--dy:' + w[1] + ';--dr:' + w[2] + '"><img src="game/flag-' + t[1] + '.svg" alt="" width="26" height="26" loading="lazy"><span dir="auto">' + t[0] + '</span></li>';
}).join("");
try {
new IntersectionObserver(function (e, o) { if (e[0].isIntersecting) { $("fahnen").classList.add("da"); o.disconnect(); } }, { threshold: .2 }).observe($("fahnen"));
} catch (e) { $("fahnen").classList.add("da"); }
var WOERTER = [
{ id: "w0308", wort: "cat", bild: "bilder/w0308-katze.png", satz: "The cat is gray." },
{ id: "w0232", wort: "apple", bild: "bilder/w0232-apfel.png", satz: "I eat an apple." },
{ id: "w0307", wort: "dog", bild: "bilder/w0307-hund.png", satz: "I have a dog." }
];
var probe = $("probe"), eingabe = $("probe-eingabe"), zellen = $("zellen"), text = $("probe-text");
var nr = 0, stelle = 0, geloest = false, ton = new Audio(), sichtbar = true;
ton.preload = "none";
function spiele(pfad, danach) {
try {
ton.pause(); ton.onended = danach || null; ton.src = pfad;
var v = ton.play(); if (v && v.catch) v.catch(function () { });
} catch (e) { }
}
function wortTon() { spiele("ton/en/wort/wort-" + WOERTER[nr].id + ".mp3"); }
var srUhr = null;
function sagen(t) {
var el = $("probe-sr");
if (!el) return;
clearTimeout(srUhr);
el.textContent = "";
srUhr = setTimeout(function () { el.textContent = t; }, 30); 
}
function standText(id, wort, n, hilfe) {
var el = $(id);
if (!el) return;
var t = n ? "Typed so far: " + wort.slice(0, n).split("").join(" ") + " (" + n + " of " + wort.length + " letters)."
: "Nothing typed yet. The word has " + wort.length + " letters.";
if (hilfe) t += " The word is " + wort + ".";
el.textContent = t;
}
function punkte() {
$("punkte").innerHTML = WOERTER.map(function (w, i) { return '<i class="' + (i < nr || (i === nr && geloest) ? "an" : i === nr ? "jetzt" : "") + '"></i>'; }).join("");
}
function zeichnen() {
var w = WOERTER[nr].wort;
zellen.innerHTML = w.split("").map(function (b, i) {
return '<span class="zelle' + (i < stelle ? " getippt" : "") + (i === stelle && !geloest ? " jetzt" : "") + '"><span>' + b + '</span></span>';
}).join("");
punkte();
}
function neuesWort() {
clearTimeout(srUhr); srUhr = null; $("probe-sr").textContent = "";
geloest = false; stelle = 0;
probe.classList.remove("geloest", "hilfe");
$("probe-zeigen").setAttribute("aria-pressed", "false");
$("probe-bild").src = WOERTER[nr].bild;
text.innerHTML = '<p class="probe-hinweis">What is this? Type the English word.</p>';
eingabe.value = "";
zeichnen();
standText("probe-stand", WOERTER[nr].wort, 0, false);
}
function fertig() {
clearTimeout(srUhr); srUhr = null; $("probe-sr").textContent = "";
geloest = true;
probe.classList.add("geloest"); probe.classList.remove("hilfe");
zeichnen();
var letztes = nr === WOERTER.length - 1;
text.innerHTML = '<p class="probe-gut">✓ Correct!</p><p class="probe-satz" lang="en">' + WOERTER[nr].satz + '</p>'
+ '<button type="button" class="knopf klein" id="probe-weiter">' + (letztes ? "Finish" : "Next word →") + '</button>';
$("probe-weiter").addEventListener("click", weiter);
var id = WOERTER[nr].id;
spiele("ton/en/wort/wort-" + id + ".mp3", function () { if (geloest && WOERTER[nr].id === id) spiele("ton/en/satz-a/satz-a-" + id + ".mp3"); });
}
function weiter() {
if (!geloest) return;
try { ton.pause(); } catch (e) { }
if (nr === WOERTER.length - 1) {
$("probe-spiel").hidden = true; $("probe-ende").hidden = false; geloest = false;
var titel = $("probe-ende-titel");
if (titel) titel.focus({ preventScroll: true });
return;
}
nr++; neuesWort();
eingabe.focus({ preventScroll: true });
}
function buchstabe(b) {
if (geloest || !$("probe-ende").hidden) return;
var w = WOERTER[nr].wort;
if (b.toLowerCase() === w.charAt(stelle)) {
stelle++; zeichnen();
standText("probe-stand", w, stelle, probe.classList.contains("hilfe"));
if (stelle >= w.length) fertig(); else sagen(b.toLowerCase());
} else {
var z = zellen.children[stelle];
if (z) { z.classList.add("falsch"); setTimeout(function () { z.classList.remove("falsch"); }, 320); }
sagen("Not that letter. Try again.");
}
}
document.addEventListener("keydown", function (e) {
if (e.ctrlKey || e.altKey || e.metaKey || !$("probe-ende").hidden) return;
var t = e.target, fremd = t && t !== eingabe && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
if (fremd) return;
if (t && t.closest && t.closest("a, button, summary") && (e.key === " " || e.key === "Enter")) return;
if (e.key === "Enter" && geloest && (sichtbar || t === eingabe)) { e.preventDefault(); weiter(); return; }
if (!sichtbar && t !== eingabe) return;
if (e.key === " " && !geloest) { e.preventDefault(); return; }
if (e.key && e.key.length === 1 && /[a-z]/i.test(e.key)) { e.preventDefault(); probe.classList.add("tippt"); buchstabe(e.key); }
});
eingabe.addEventListener("input", function () {
var v = eingabe.value; eingabe.value = "";
for (var i = 0; i < v.length; i++) if (/[a-z]/i.test(v.charAt(i))) buchstabe(v.charAt(i));
});
try {
new IntersectionObserver(function (e) { sichtbar = e[0].isIntersecting; }, { threshold: .35 }).observe(probe);
} catch (e) { }
$("probe-hoeren").addEventListener("click", function () { wortTon(); if (!geloest) eingabe.focus({ preventScroll: true }); });
$("probe-zeigen").addEventListener("click", function () {
if (geloest) return;
var an = !probe.classList.contains("hilfe");
probe.classList.toggle("hilfe", an);
this.setAttribute("aria-pressed", an ? "true" : "false");
standText("probe-stand", WOERTER[nr].wort, stelle, an);
sagen(an ? "The word is " + WOERTER[nr].wort + "." : "The word is hidden again.");
eingabe.focus({ preventScroll: true });
});
$("probe-nochmal").addEventListener("click", function () {
nr = 0; $("probe-ende").hidden = true; $("probe-spiel").hidden = false; neuesWort();
eingabe.focus({ preventScroll: true });
});
$("zur-probe").addEventListener("click", function () { setTimeout(function () { eingabe.focus({ preventScroll: true }); }, 50); });
neuesWort();
var apfelTon = new Audio(); apfelTon.preload = "none";
var hoerKnopf = $("schritt-hoeren");
function apfelHoeren() {
try {
apfelTon.pause(); apfelTon.src = "ton/en/wort/wort-w0232.mp3";
hoerKnopf.classList.add("spielt");
var v = apfelTon.play(); if (v && v.catch) v.catch(function () { hoerKnopf.classList.remove("spielt"); });
} catch (e) { hoerKnopf.classList.remove("spielt"); }
}
apfelTon.addEventListener("ended", function () { hoerKnopf.classList.remove("spielt"); });
apfelTon.addEventListener("pause", function () { hoerKnopf.classList.remove("spielt"); });
hoerKnopf.addEventListener("click", apfelHoeren);
var MINI = "apple", miniStelle = 0, miniKarte = $("schritt-tippen");
function miniZeichnen() {
$("mini-zellen").innerHTML = MINI.split("").map(function (b, i) {
return '<span class="zelle' + (i < miniStelle ? " getippt" : "") + (i === miniStelle && miniStelle < MINI.length ? " jetzt" : "") + '"><span>' + b + '</span></span>';
}).join("");
}
function miniBuchstabe(b) {
if (miniStelle >= MINI.length) return;
if (b.toLowerCase() === MINI.charAt(miniStelle)) {
miniStelle++; miniZeichnen();
standText("mini-stand", MINI, miniStelle, true);
if (miniStelle < MINI.length) sagen(b.toLowerCase());
if (miniStelle >= MINI.length) {
miniKarte.classList.add("geloest"); $("mini-hinweis").textContent = "✓ Great!";
apfelHoeren();
setTimeout(function () { miniStelle = 0; miniKarte.classList.remove("geloest"); miniZeichnen();
$("mini-hinweis").textContent = document.activeElement === $("mini-eingabe") ? "Type: apple" : "Tap here and type"; }, 4000);
}
} else {
var z = $("mini-zellen").children[miniStelle];
if (z) { z.classList.add("falsch"); setTimeout(function () { z.classList.remove("falsch"); }, 320); }
sagen("Not that letter. Try again.");
}
}
standText("mini-stand", MINI, 0, true);
$("mini-eingabe").addEventListener("input", function () {
var v = this.value; this.value = "";
for (var i = 0; i < v.length; i++) if (/[a-z]/i.test(v.charAt(i))) miniBuchstabe(v.charAt(i));
});
$("mini-eingabe").addEventListener("focus", function () { miniKarte.classList.add("tippt"); $("mini-hinweis").textContent = miniStelle ? "" : "Type: apple"; });
$("mini-eingabe").addEventListener("blur", function () { miniKarte.classList.remove("tippt"); if (!miniKarte.classList.contains("geloest")) $("mini-hinweis").textContent = "Tap here and type"; });
miniZeichnen();
function lookZeigen() {
var stil = html.classList.contains("ev-schlicht") ? "einfach" : "bild", th = dunkel() ? "dark" : "light";
Array.prototype.forEach.call(document.querySelectorAll(".look"), function (b) {
b.setAttribute("aria-pressed", b.getAttribute("data-stil") === stil && b.getAttribute("data-thema") === th ? "true" : "false");
});
}
Array.prototype.forEach.call(document.querySelectorAll(".look"), function (b) {
b.addEventListener("click", function () {
var einfach = b.getAttribute("data-stil") === "einfach", th = b.getAttribute("data-thema");
html.classList.toggle("ev-schlicht", einfach);
html.setAttribute("data-theme", th);
try {
if (einfach) localStorage.setItem("ev_stil", "einfach"); else localStorage.removeItem("ev_stil");
localStorage.setItem("ev_theme", th);
} catch (e) { }
themaZeigen(); lookZeigen();
});
});
$("hell-dunkel").addEventListener("click", lookZeigen);
lookZeigen();
var SATZ = "I eat an apple.", satzStelle = 0, satzKarte = $("satz-karte"), satzKnopf = $("satz-hoeren");
var satzTon = new Audio(); satzTon.preload = "none";
function istBuchstabe(c) { return /[a-z]/i.test(c); }
function satzWeiter() { while (satzStelle < SATZ.length && !istBuchstabe(SATZ.charAt(satzStelle))) satzStelle++; }
function satzHoeren() {
try {
satzTon.pause(); satzTon.src = "ton/en/satz-a/satz-a-w0232.mp3"; satzKnopf.classList.add("spielt");
var v = satzTon.play(); if (v && v.catch) v.catch(function () { satzKnopf.classList.remove("spielt"); });
} catch (e) { satzKnopf.classList.remove("spielt"); }
}
satzTon.addEventListener("ended", function () { satzKnopf.classList.remove("spielt"); });
satzTon.addEventListener("pause", function () { satzKnopf.classList.remove("spielt"); });
satzKnopf.addEventListener("click", satzHoeren);
function satzZeichnen() {
var h = "", i = 0;
SATZ.split(" ").forEach(function (wort) {
h += '<span class="satz-wort">';
for (var k = 0; k < wort.length; k++, i++) {
var c = wort.charAt(k), fest = !istBuchstabe(c);
h += '<span class="zelle' + (fest ? " fest" : "") + (!fest && i < satzStelle ? " getippt" : "") + (i === satzStelle && satzStelle < SATZ.length ? " jetzt" : "") + '"><span>' + c + '</span></span>';
}
h += '</span>'; i++; 
});
$("satz-zellen").innerHTML = h;
}
function satzZelle(n) { 
var i = 0, alle = $("satz-zellen").querySelectorAll(".zelle");
for (var k = 0, z = 0; k < SATZ.length; k++) { if (SATZ.charAt(k) === " ") continue; if (k === n) return alle[z]; z++; }
return null;
}
function satzBuchstabe(b) {
if (satzStelle >= SATZ.length) return;
if (b.toLowerCase() === SATZ.charAt(satzStelle).toLowerCase()) {
satzStelle++; satzWeiter(); satzZeichnen();
satzStand();
if (satzStelle < SATZ.length) sagen(b.toLowerCase());
if (satzStelle >= SATZ.length) {
satzKarte.classList.add("geloest"); $("satz-hinweis").textContent = "✓ Great! You typed the whole sentence.";
satzHoeren();
setTimeout(function () { satzStelle = 0; satzKarte.classList.remove("geloest"); satzZeichnen();
$("satz-hinweis").textContent = document.activeElement === $("satz-eingabe") ? "Type: I eat an apple." : "Tap here and type the sentence"; }, 5000);
}
} else {
var z = satzZelle(satzStelle);
if (z) { z.classList.add("falsch"); setTimeout(function () { z.classList.remove("falsch"); }, 320); }
sagen("Not that letter. Try again.");
}
}
function satzStand() {
var el = $("satz-stand");
if (!el) return;
el.textContent = (satzStelle ? "Typed so far: " + SATZ.slice(0, satzStelle) : "Nothing typed yet.")
+ " The sentence is: I eat an apple. Only the letters are typed; spaces and the full stop come by themselves.";
}
satzStand();
$("satz-eingabe").addEventListener("input", function () {
var v = this.value; this.value = "";
for (var i = 0; i < v.length; i++) if (istBuchstabe(v.charAt(i))) satzBuchstabe(v.charAt(i));
});
$("satz-eingabe").addEventListener("focus", function () { if (!satzKarte.classList.contains("geloest")) $("satz-hinweis").textContent = "Type: I eat an apple."; });
$("satz-eingabe").addEventListener("blur", function () { if (!satzKarte.classList.contains("geloest")) $("satz-hinweis").textContent = "Tap here and type the sentence"; });
satzZeichnen();
})();
