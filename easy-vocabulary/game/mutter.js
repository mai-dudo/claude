var MUTTERSPRACHEN = [
{ id: "en", name: "English", aktiv: true, flagge: "flag-us.svg" },
{ id: "de", name: "Deutsch", aktiv: true, flagge: "flag-de.svg", 
englisch: "German", woerter: "woerter-de.js", liste: "WOERTER_DE",
saetzeA: "saetze-de-a.js", saetzeListe: "SAETZE_DE_A", 
saetzeB: "saetze-de-b.js", saetzeListeB: "SAETZE_DE_B" }, 
{ id: "es", name: "Español", aktiv: true, flagge: "flag-es.svg", 
englisch: "Spanish", woerter: "woerter-es.js", liste: "WOERTER_ES",
saetzeA: "saetze-es-a.js", saetzeListe: "SAETZE_ES_A" }, 
{ id: "it", name: "Italiano", aktiv: true, flagge: "flag-it.svg", 
englisch: "Italian", woerter: "woerter-it.js", liste: "WOERTER_IT",
saetzeA: "saetze-it-a.js", saetzeListe: "SAETZE_IT_A" }, 
{ id: "ru", name: "Русский", aktiv: true, flagge: "flag-ru.svg", 
englisch: "Russian", woerter: "woerter-ru.js", liste: "WOERTER_RU",
saetzeA: "saetze-ru-a.js", saetzeListe: "SAETZE_RU_A" }, 
{ id: "pt", name: "Português", aktiv: true, flagge: "flag-br.svg", 
englisch: "Portuguese", woerter: "woerter-pt.js", liste: "WOERTER_PT",
saetzeA: "saetze-pt-a.js", saetzeListe: "SAETZE_PT_A" }, 
{ id: "fr", name: "Français", aktiv: true, flagge: "flag-fr.svg", 
englisch: "French", woerter: "woerter-fr.js", liste: "WOERTER_FR",
saetzeA: "saetze-fr-a.js", saetzeListe: "SAETZE_FR_A" }, 
{ id: "pl", name: "Polski", aktiv: true, flagge: "flag-pl.svg", 
englisch: "Polish", woerter: "woerter-pl.js", liste: "WOERTER_PL",
saetzeA: "saetze-pl-a.js", saetzeListe: "SAETZE_PL_A" }, 
{ id: "tr", name: "Türkçe", aktiv: true, flagge: "flag-tr.svg", 
englisch: "Turkish", woerter: "woerter-tr.js", liste: "WOERTER_TR",
saetzeA: "saetze-tr-a.js", saetzeListe: "SAETZE_TR_A" }, 
{ id: "uz", name: "Oʻzbekcha", aktiv: true, flagge: "flag-uz.svg", 
englisch: "Uzbek", woerter: "woerter-uz.js", liste: "WOERTER_UZ",
saetzeA: "saetze-uz-a.js", saetzeListe: "SAETZE_UZ_A" },
{ id: "bs", name: "Bosanski", aktiv: true, flagge: "flag-ba.svg", 
englisch: "Bosnian", woerter: "woerter-bs.js", liste: "WOERTER_BS",
saetzeA: "saetze-bs-a.js", saetzeListe: "SAETZE_BS_A", 
saetzeB: "saetze-bs-b.js", saetzeListeB: "SAETZE_BS_B" }, 
{ id: "hu", name: "Magyar", aktiv: true, flagge: "flag-hu.svg", 
englisch: "Hungarian", woerter: "woerter-hu.js", liste: "WOERTER_HU",
saetzeA: "saetze-hu-a.js", saetzeListe: "SAETZE_HU_A" },
{ id: "no", name: "Norsk", aktiv: true, flagge: "flag-no.svg", 
englisch: "Norwegian", woerter: "woerter-no.js", liste: "WOERTER_NO",
saetzeA: "saetze-no-a.js", saetzeListe: "SAETZE_NO_A" },
{ id: "da", name: "Dansk", aktiv: true, flagge: "flag-dk.svg", 
englisch: "Danish", woerter: "woerter-da.js", liste: "WOERTER_DA",
saetzeA: "saetze-da-a.js", saetzeListe: "SAETZE_DA_A" },
{ id: "nl", name: "Nederlands", aktiv: true, flagge: "flag-nl.svg", 
englisch: "Dutch", woerter: "woerter-nl.js", liste: "WOERTER_NL",
saetzeA: "saetze-nl-a.js", saetzeListe: "SAETZE_NL_A" },
{ id: "vi", name: "Tiếng Việt", aktiv: true, flagge: "flag-vn.svg", 
englisch: "Vietnamese", woerter: "woerter-vi.js", liste: "WOERTER_VI",
saetzeA: "saetze-vi-a.js", saetzeListe: "SAETZE_VI_A" },
{ id: "id", name: "Bahasa Indonesia", aktiv: true, flagge: "flag-id.svg", 
englisch: "Indonesian", woerter: "woerter-id.js", liste: "WOERTER_ID",
saetzeA: "saetze-id-a.js", saetzeListe: "SAETZE_ID_A" },
{ id: "tl", name: "Filipino", aktiv: true, flagge: "flag-ph.svg", 
englisch: "Filipino", woerter: "woerter-tl.js", liste: "WOERTER_TL",
saetzeA: "saetze-tl-a.js", saetzeListe: "SAETZE_TL_A" },
{ id: "el", name: "Ελληνικά", aktiv: true, flagge: "flag-gr.svg", 
englisch: "Greek", woerter: "woerter-el.js", liste: "WOERTER_EL",
saetzeA: "saetze-el-a.js", saetzeListe: "SAETZE_EL_A" },
{ id: "uk", name: "Українська", aktiv: true, flagge: "flag-uk.svg", 
englisch: "Ukrainian", woerter: "woerter-uk.js", liste: "WOERTER_UK",
saetzeA: "saetze-uk-a.js", saetzeListe: "SAETZE_UK_A" },
{ id: "fa", name: "فارسی", aktiv: true, flagge: "flag-ir.svg", 
englisch: "Persian", woerter: "woerter-fa.js", liste: "WOERTER_FA",
saetzeA: "saetze-fa-a.js", saetzeListe: "SAETZE_FA_A" }, 
{ id: "ar", name: "العربية", aktiv: true, flagge: "flag-arab-league.svg", 
englisch: "Arabic", woerter: "woerter-ar.js", liste: "WOERTER_AR",
saetzeA: "saetze-ar-a.js", saetzeListe: "SAETZE_AR_A" }, 
{ id: "ur", name: "اردو", aktiv: true, flagge: "flag-pk.svg", 
englisch: "Urdu", woerter: "woerter-ur.js", liste: "WOERTER_UR",
saetzeA: "saetze-ur-a.js", saetzeListe: "SAETZE_UR_A" },
{ id: "hi", name: "हिन्दी", aktiv: true, flagge: "flag-in.svg", 
englisch: "Hindi", woerter: "woerter-hi.js", liste: "WOERTER_HI",
saetzeA: "saetze-hi-a.js", saetzeListe: "SAETZE_HI_A" },
{ id: "th", name: "ไทย", aktiv: true, flagge: "flag-th.svg", 
englisch: "Thai", woerter: "woerter-th.js", liste: "WOERTER_TH",
saetzeA: "saetze-th-a.js", saetzeListe: "SAETZE_TH_A" },
{ id: "zh", name: "中文", aktiv: true, flagge: "flag-cn.svg", 
englisch: "Chinese", woerter: "woerter-zh.js", liste: "WOERTER_ZH",
saetzeA: "saetze-zh-a.js", saetzeListe: "SAETZE_ZH_A" },
{ id: "ja", name: "日本語", aktiv: true, flagge: "flag-jp.svg", 
englisch: "Japanese", woerter: "woerter-ja.js", liste: "WOERTER_JA",
saetzeA: "saetze-ja-a.js", saetzeListe: "SAETZE_JA_A" },
{ id: "ko", name: "한국어", aktiv: true, flagge: "flag-kr.svg", 
englisch: "Korean", woerter: "woerter-ko.js", liste: "WOERTER_KO",
saetzeA: "saetze-ko-a.js", saetzeListe: "SAETZE_KO_A" }
];
function testAn(id) {
try {
var t = new URLSearchParams(location.search).get("test" + id);
if (t === "1") localStorage.setItem("ev_test" + id, "1");
if (t === "0") {
localStorage.removeItem("ev_test" + id);
if (localStorage.getItem("ev_mutter") === id) localStorage.removeItem("ev_mutter");
}
return localStorage.getItem("ev_test" + id) === "1";
} catch (e) { return false; }
}
function testDeAn() { return testAn("de"); } 
function mutterWaehlbar(s) { return s.aktiv || (!!s.woerter && testAn(s.id)); }
function mutterEintrag(id) { return MUTTERSPRACHEN.filter(function (s) { return s.id === id; })[0] || null; }
var DE_EIGEN_SPRACHEN = ["en", "ru", "es", "it", "pt", "fr", "pl", "tr", "uz", "hu", "no", "da", "nl", "tl", "el", "id", "uk", "vi", "ar", "zh", "hi", "ja", "ko", "fa", "th", "ur", "bs"];
var ES_EIGEN_SPRACHEN = ["en", "ru", "de", "it", "pt", "fr", "pl", "tr", "uz", "bs", "hu", "no", "da", "nl", "vi", "id", "tl", "el", "uk", "fa", "ar", "ur", "hi", "th", "zh", "ja", "ko"];
var IT_EIGEN_SPRACHEN = ["en"];
var PL_EIGEN_SPRACHEN = ["en", "ru", "de", "es", "it", "pt", "fr", "tr", "bs", "hu", "da", "nl", "vi", "no", "uz", "id", "uk", "ar", "zh", "tl", "hi", "el", "fa", "th", "ja", "ur", "ko"];
var FR_EIGEN_SPRACHEN = ["en"];
var PT_EIGEN_SPRACHEN = ["en"];
var TR_EIGEN_SPRACHEN = ["en", "it", "es", "fr", "ar", "ru", "de", "zh", "pt", "ja", "bs", "pl", "id", "da", "no", "uk", "hi", "hu", "tl", "vi", "el", "nl", "fa", "uz", "ko", "th", "ur"];
var RU_EIGEN_SPRACHEN = ["en", "de", "es", "fr", "it", "pt", "pl", "ar", "uk", "tr", "fa", "ur", "hi", "zh", "ja", "ko", "vi", "id", "th", "tl", "el", "nl", "no", "da", "hu", "uz", "bs"];
var BS_EIGEN_SPRACHEN = ["en", "ru", "fr", "es", "pt", "it", "de", "id", "pl", "nl", "ja", "uk", "da", "tr", "vi", "no", "ar", "hu", "ko", "hi", "fa", "th", "zh", "ur", "tl", "uz", "el"];
var NO_EIGEN_SPRACHEN = ["en"];
var DA_EIGEN_SPRACHEN = ["en"];
var AR_EIGEN_SPRACHEN = ["en", "ru", "zh", "fr", "it", "pt", "ja", "pl", "es", "fa", "de", "uk", "tr", "hi", "id", "nl", "vi", "ko", "hu", "da", "bs", "el", "no", "uz", "ur", "th", "tl"];
function kursSatzInfo() {
var lang = new URLSearchParams(location.search).get("lang");
if (lang === "de") return { lang: "de", gleich: "DE_SATZ_GLEICH", eigen: DE_EIGEN_SPRACHEN };
if (lang === "es") return { lang: "es", gleich: "ES_SATZ_GLEICH", eigen: ES_EIGEN_SPRACHEN };
if (lang === "it") return { lang: "it", gleich: "IT_SATZ_GLEICH", eigen: IT_EIGEN_SPRACHEN };
if (lang === "pl") return { lang: "pl", gleich: "PL_SATZ_GLEICH", eigen: PL_EIGEN_SPRACHEN };
if (lang === "fr") return { lang: "fr", gleich: "FR_SATZ_GLEICH", eigen: FR_EIGEN_SPRACHEN };
if (lang === "pt") return { lang: "pt", gleich: "PT_SATZ_GLEICH", eigen: PT_EIGEN_SPRACHEN };
if (lang === "tr") return { lang: "tr", gleich: "TR_SATZ_GLEICH", eigen: TR_EIGEN_SPRACHEN };
if (lang === "ru") return { lang: "ru", gleich: "RU_SATZ_GLEICH", eigen: RU_EIGEN_SPRACHEN };
if (lang === "bs") return { lang: "bs", gleich: "BS_SATZ_GLEICH", eigen: BS_EIGEN_SPRACHEN };
if (lang === "no") return { lang: "no", gleich: "NO_SATZ_GLEICH", eigen: NO_EIGEN_SPRACHEN };
if (lang === "da") return { lang: "da", gleich: "DA_SATZ_GLEICH", eigen: DA_EIGEN_SPRACHEN };
if (lang === "ar") return { lang: "ar", gleich: "AR_SATZ_GLEICH", eigen: AR_EIGEN_SPRACHEN };
return null;
}
(function () {
if (document.readyState !== "loading") return;
var spielSeite = /\/(play|type|sentence|match|search|recall|easiest|build|dictation|spaced|shadowing|artikel|monster|vocab)(\.html)?$/.test(location.pathname);  
if (!spielSeite) return;
var s = mutterEintrag(mutterSprache());
if (s && s.woerter && typeof window[s.liste] === "undefined")
document.write('<script src="../daten/' + s.woerter + '"><\/script>');
if (s && s.saetzeA && /\/(sentence|play|type|build|dictation|spaced|shadowing|artikel|vocab)(\.html)?$/.test(location.pathname) && typeof window[s.saetzeListe] === "undefined") 
document.write('<script src="../daten/' + s.saetzeA + '"><\/script>');
if (s && s.saetzeB && /\/(sentence|play|type|build|dictation|spaced|shadowing|vocab)(\.html)?$/.test(location.pathname) && typeof window[s.saetzeListeB] === "undefined")
document.write('<script src="../daten/' + s.saetzeB + '"><\/script>');
var kursWahl = new URLSearchParams(location.search).get("lang");
if (s && s.id && s.id !== "en" && /\/(type|vocab|shadowing)(\.html)?$/.test(location.pathname) && (!kursWahl || kursWahl === "en")) {
var oben = String(s.id).toUpperCase();
if (typeof window["SAETZE_" + oben + "_ZWEI"] === "undefined") document.write('<script src="../daten/saetze-' + s.id + '-zwei.js"><\/script>');
if (typeof window["SAETZE_" + oben + "_DREI"] === "undefined") document.write('<script src="../daten/saetze-' + s.id + '-drei.js"><\/script>');
}
var ks = kursSatzInfo();
if (ks && /\/(sentence|play|type|dictation|spaced|shadowing|artikel)(\.html)?$/.test(location.pathname)) {
if (typeof window[ks.gleich] === "undefined")
document.write('<script src="../daten/' + ks.lang + '-satz-gleich.js"><\/script>');
var bs = bedeutungSprache();
if (ks.eigen.indexOf(bs) > -1 && typeof window[ks.lang.toUpperCase() + "_SAETZE_" + bs.toUpperCase()] === "undefined")
document.write('<script src="../daten/' + ks.lang + '-saetze-' + bs + '.js"><\/script>');
}
})();
function satzUebersetzung(id, sprache) {
var s = mutterEintrag(sprache || mutterSprache());
if (!s || !s.saetzeListe || typeof window[s.saetzeListe] === "undefined") return "";
return window[s.saetzeListe][id] || "";
}
function satzUebersetzungHard(id, sprache) {
var s = mutterEintrag(sprache || mutterSprache());
if (!s || !s.saetzeListeB || typeof window[s.saetzeListeB] === "undefined") return "";
return window[s.saetzeListeB][id] || "";
}
function satzUebersetzungFuer(id, englisch) {
if (!englisch) return "";
if (typeof SAETZE_EN_A !== "undefined" && SAETZE_EN_A[id] === englisch) return satzUebersetzung(id);
if (typeof SAETZE_EN !== "undefined" && SAETZE_EN[id] === englisch) return satzUebersetzungHard(id);
return "";
}
function uebersetzungFuer(w, sprache) {
var id = sprache || mutterSprache();
if (id === "en") return { wort: "", art: "" };
var s = mutterEintrag(id);
var liste = (s && s.liste && typeof window[s.liste] !== "undefined") ? window[s.liste] : null;
var e = liste ? liste[w.id] : null;
if (e) return { wort: e.word, art: e.article || "" };
if (id === "de") return { wort: w.de || "", art: w.art || "" };
return { wort: w[id] || "", art: "" };
}
function deutschFuer(w) { return uebersetzungFuer(w, "de"); } 
function mitArtikel(art, wort) {
if (!art) return wort;
return /['’]$/.test(art) ? art + wort : art + " " + wort;
}
function uebersetzungText(w, sprache) {
var u = uebersetzungFuer(w, sprache);
return mitArtikel(u.art, u.wort);
}
function uebersetzungHtml(w, sprache) {
var id = sprache || mutterSprache();
var u = uebersetzungFuer(w, id);
function esc(t) {
return String(t).replace(/[&<>"]/g, function (c) {
return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
});
}
var wort = esc(u.wort);
var t = (id === "de" && typeof TRENNSTELLEN_DE !== "undefined") ? TRENNSTELLEN_DE[w.id] : null;
if (t && t.split("|").join("") === u.wort) wort = t.split("|").map(esc).join("&shy;");
return u.art ? mitArtikel(esc(u.art), wort) : wort;
}
function bedeutungSprache() {
var m = mutterSprache();
var kurs = kursSatzInfo();
return (m === "en" || m === (kurs ? kurs.lang : "de")) ? "en" : m;
}
function bedeutungFuer(w) {
var m = bedeutungSprache();
if (m !== "en") {
var t = uebersetzungText(w, m);
if (t) return { text: t, html: uebersetzungHtml(w, m), lang: m };
}
var en = (w.type === "verb" ? "to " : "") + (w.en || "");
return { text: en, html: en.replace(/[&<>"]/g, function (c) {
return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }), lang: "en" };
}
function satzBedeutung(id, deutsch) {
if (!deutsch) return "";
var ks = kursSatzInfo() || { lang: "de", gleich: "DE_SATZ_GLEICH" }; 
var eigen = window[ks.lang.toUpperCase() + "_SAETZE_" + bedeutungSprache().toUpperCase()];
if (eigen && eigen[id]) return eigen[id];
var gleich = window[ks.gleich];
if (!gleich || !gleich[id]) return "";
var m = bedeutungSprache();
if (m === "en") return (typeof SAETZE_EN_A !== "undefined" && SAETZE_EN_A[id]) || "";
return satzUebersetzung(id, m);
}
function mutterEnglisch(id) {
var s = mutterEintrag(id || mutterSprache());
return (s && s.englisch) || "Your language";
}
function mutterSprache() {
var aktiv = MUTTERSPRACHEN.filter(mutterWaehlbar);
var wunsch = new URLSearchParams(location.search).get("native");
var treffer = aktiv.filter(function (s) { return s.id === wunsch; })[0];
if (treffer) return treffer.id;
try {
var gespeichert = aktiv.filter(function (s) { return s.id === localStorage.getItem("ev_mutter"); })[0];
if (gespeichert) return gespeichert.id;
} catch (e) { }
return aktiv[0].id;
}
