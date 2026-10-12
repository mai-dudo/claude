var KONTO = (function () {
"use strict";
var E = (typeof KONTO_EINSTELLUNG !== "undefined") ? KONTO_EINSTELLUNG : null;
function istGeheim(k) {
if (typeof k !== "string") return false;
if (/^sb_secret_/.test(k)) return true;
var teile = k.split(".");
if (teile.length === 3) {
try { return /service_role/.test(atob(teile[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch (e) { }
}
return false;
}
if (E && istGeheim(E.schluessel)) {
console.error("KONTO: In konto-einstellung.js steht ein GEHEIMER Schluessel! Sofort entfernen und in Supabase neu erzeugen lassen.");
E = null;
}
var BEREIT = !!(E && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(E.url || "")
&& /^sb_publishable_[A-Za-z0-9_-]+$/.test(E.schluessel || ""));
var SITZUNG = "ev_konto_sitzung"; 
var ABGLEICH = "ev_konto_abgleich"; 
var WAISE = "ev_konto_waise";
var ERLAUBT = /^(ev_kapitel|ev_schwer|ev_schwer_tenses|ev_taeglich):[A-Za-z0-9:._-]{1,120}$|^(ev_level|ev_mutter)$/;
var HAPPEN = 500; 
var SEITE = 1000; 
var MAX_WERT = 100000;
function kontoFehler(text, status) {
var e = new Error("KONTO: " + text + (status ? " (" + status + ")" : ""));
e.status = status || 0;
return e;
}
function nurDieseZeile(e) {
return !!e && (e.zeile === true || (e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 403 && e.status !== 429));
}
function lesen(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
function schreiben(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
function weg(k) { try { localStorage.removeItem(k); } catch (e) { } }
function hat(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function json(s) { try { return JSON.parse(s); } catch (e) { return null; } }
function nichts() { }
function sitzung() {
var s = lesen(SITZUNG);
return (s && s.access_token && s.refresh_token && s.nutzer && s.nutzer.id) ? s : null;
}
function sitzungMerken(d) {
var alt = lesen(SITZUNG);
var stempel = (alt && alt.nutzer && alt.nutzer.id === d.user.id) ? alt.stempel
: Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
schreiben(SITZUNG, {
access_token: d.access_token,
refresh_token: d.refresh_token,
laeuft_ab: Math.floor(Date.now() / 1000) + ((typeof d.expires_in === "number" && d.expires_in > 0) ? d.expires_in : 3600),
geholt: Date.now(),
nutzer: { id: d.user.id, email: d.user.email },
stempel: stempel
});
}
function tokenVerbraucht(t) {
var s = lesen(SITZUNG);
if (!s || s.access_token !== t || (s.geholt && Date.now() - s.geholt < 60000 && Date.now() >= s.geholt)) return;
s.laeuft_ab = 0;
schreiben(SITZUNG, s);
}
function kennung() { var s = sitzung(); return s ? s.nutzer.id + "|" + (s.stempel || "") : null; }
function gilt(k0) { return k0 !== null && kennung() === k0; }
var seiteKennung = kennung();
function seiteGilt() { return kennung() === seiteKennung; }
var neuLadenGeplant = false;
function altesFensterNeuLaden() {
if (neuLadenGeplant) return;
neuLadenGeplant = true;
setTimeout(function () { try { location.reload(); } catch (e) { } }, 150);
}
(function wacheEinbauen() {
try {
var proto = Object.getPrototypeOf(localStorage);
if (!proto || proto === Object.prototype || typeof proto.setItem !== "function") return;
var setAlt = proto.setItem, wegAlt = proto.removeItem;
function gesperrt(ls, k) {
return ls === localStorage && typeof k === "string" && ERLAUBT.test(k) && !seiteGilt();
}
proto.setItem = function (k, v) {
if (gesperrt(this, k)) { altesFensterNeuLaden(); return; }
var r = setAlt.call(this, k, v);
if (this === localStorage && typeof k === "string" && ERLAUBT.test(k)) baldSchicken();
return r;
};
proto.removeItem = function (k) {
if (gesperrt(this, k)) { altesFensterNeuLaden(); return; }
var r = wegAlt.call(this, k);
if (this === localStorage && typeof k === "string" && ERLAUBT.test(k)) baldSchicken();
return r;
};
} catch (e) { }
})();
window.addEventListener("storage", function (e) {
if ((e.key === SITZUNG || e.key === null) && !seiteGilt()) altesFensterNeuLaden();
if (e.key === "ev_neustart" && e.newValue && !/account\.html$/.test(location.pathname)) altesFensterNeuLaden();
});
function anfrage(pfad, art, koerper, token, extra, zumSchluss) {
var h = { "apikey": E.schluessel };
if (koerper !== undefined) h["Content-Type"] = "application/json";
if (token) h["Authorization"] = "Bearer " + token;
if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
var abbruch = (typeof AbortController !== "undefined" && !zumSchluss) ? new AbortController() : null;
var uhr = abbruch ? setTimeout(function () { try { abbruch.abort(); } catch (e) { } }, ZEIT_AUS_MS) : null;
return fetch(E.url + pfad, {
method: art,
headers: h,
body: koerper === undefined ? undefined : JSON.stringify(koerper),
keepalive: !!zumSchluss,
cache: "no-store",
signal: abbruch ? abbruch.signal : undefined
}).then(function (r) {
if (uhr) clearTimeout(uhr);
if (r.status === 401 && token && pfad.indexOf("/rest/v1/") === 0) tokenVerbraucht(token); 
return r;
}, function (e) {
if (uhr) clearTimeout(uhr);
throw e;
});
}
var ZEIT_AUS_MS = 20000;
var erneuerung = null;
function token() {
var s = sitzung();
if (!s) return Promise.resolve(null);
if (s.laeuft_ab - 60 > Date.now() / 1000) return Promise.resolve(s.access_token);
if (!erneuerung) {
var k0 = kennung();
erneuerung = anfrage("/auth/v1/token?grant_type=refresh_token", "POST", { refresh_token: s.refresh_token })
.then(function (r) {
if (!gilt(k0)) return null;
if (r.ok) return r.json().then(function (d) { if (!gilt(k0)) return null; sitzungMerken(d); return d.access_token; });
if (r.status === 400 || r.status === 401 || r.status === 403) {
schreiben(WAISE, s.nutzer.id); 
weg(SITZUNG); seiteKennung = null; weg(ABGLEICH); knopfZeigen(); 
return null;
}
throw new Error("KONTO: Anmeldung erneuern ging nicht (" + r.status + ")");
});
erneuerung.then(frei, frei);
}
return erneuerung;
}
function frei() { erneuerung = null; }
function codeSenden(email) {
if (!BEREIT) return Promise.resolve({ ok: false, status: -1 });
return anfrage("/auth/v1/otp", "POST", { email: email, create_user: true })
.then(function (r) { return { ok: r.ok, status: r.status }; },
function () { return { ok: false, status: 0 }; });
}
function codePruefen(email, code) {
if (!BEREIT) return Promise.resolve({ ok: false, status: -1 });
return anfrage("/auth/v1/verify", "POST", { type: "email", email: email, token: code })
.then(function (r) {
if (!r.ok) return { ok: false, status: r.status };
return r.json().then(function (d) {
if (!d || !d.access_token || !d.user) return { ok: false, status: 500 };
sitzungMerken(d);
seiteKennung = kennung(); 
var waise = lesen(WAISE); 
if (typeof waise === "string" && waise !== d.user.id) { lokalLeeren(); weg("ev_zugang"); }
weg(WAISE);
weg(ABGLEICH); 
knopfZeigen();
starten();
return abgleichen().then(function () { return { ok: true }; },
function () { return { ok: true, abgleich: false }; });
});
}, function () { return { ok: false, status: 0 }; })
.then(null, function () { return { ok: false, status: 500 }; });
}
function allesSchicken() {
var warten = laufend ? laufend.then(nichts, nichts) : Promise.resolve();
return warten.then(function () {
var m = metaLesen();
return (m && m.erledigt) ? schickenWasNeu() : abgleichen();
}).then(function () {
var m = metaLesen();
return !!(m && m.erledigt && !offen(m).length);
}, function () { return false; });
}
function abmelden(trotzdem) {
if (!sitzung()) return Promise.resolve({ ok: true });
return allesSchicken()
.then(function (geschickt) {
if (!geschickt && !trotzdem) return { ok: false, offen: true };
return token().then(function (t) {
if (t) return anfrage("/auth/v1/logout?scope=local", "POST", undefined, t).then(nichts, nichts);
}, nichts).then(function () {
weg(SITZUNG); seiteKennung = null; weg(ABGLEICH); weg("ev_zugang"); weg(WAISE); lokalLeeren(); anhalten(); knopfZeigen();
return { ok: true };
});
});
}
function kontoLoeschen() {
return token().then(function (t) {
if (!t) return { ok: false, status: 401 };
return anfrage("/rest/v1/rpc/konto_loeschen", "POST", {}, t).then(function (r) {
if (!r.ok) {
return r.text().then(function (txt) {
return { ok: false, status: r.status, grund: /abo_aktiv/.test(txt) ? "abo_aktiv" : null };
}, function () { return { ok: false, status: r.status }; });
}
weg(SITZUNG); seiteKennung = null; weg(ABGLEICH); weg("ev_zugang"); weg(WAISE); lokalLeeren(); anhalten(); knopfZeigen();
return { ok: true };
});
}).then(null, function () { return { ok: false, status: 0 }; });
}
function emailAendern(neu) {
return token().then(function (t) {
if (!t) return { ok: false, status: 401 };
return anfrage("/auth/v1/user", "PUT", { email: neu }, t)
.then(function (r) { return { ok: r.ok, status: r.status }; });
}).then(null, function () { return { ok: false, status: 0 }; });
}
function emailPruefen(adresse, code, welche) {
var k0 = kennung(), s0 = sitzung();
if (welche === "alt" && s0 && String(s0.nutzer.email || "").toLowerCase() !== String(adresse || "").toLowerCase()) {
return Promise.resolve({ ok: false, status: 401, welche: welche });
}
return token().then(function (t) {
if (!t) return { ok: false, status: 401, welche: welche };
return anfrage("/auth/v1/verify", "POST", { type: "email_change", email: adresse, token: code }, t)
.then(function (r) {
if (!r.ok) return { ok: false, status: r.status, welche: welche };
return r.json().then(function (d) {
var s = sitzung();
if (!gilt(k0)) return { ok: false, status: 401, welche: welche }; 
if (d && d.user && d.user.id && s && d.user.id !== s.nutzer.id) return { ok: false, status: 401, welche: welche }; 
if (d && d.access_token && d.user) sitzungMerken(d);
else if (s && d && d.user && d.user.email) { s.nutzer.email = d.user.email; schreiben(SITZUNG, s); }
knopfZeigen();
return { ok: true, welche: welche, email: (sitzung() || {}).nutzer ? sitzung().nutzer.email : adresse };
}, function () { return { ok: false, status: 500, welche: welche }; });
});
}).then(null, function () { return { ok: false, status: 0 }; });
}
function lokalerStand() {
var s = {};
try {
for (var i = 0; i < localStorage.length; i++) {
var k = localStorage.key(i);
if (k && ERLAUBT.test(k)) s[k] = localStorage.getItem(k);
}
} catch (e) { }
return s;
}
function setzen(k, wert) {
try { if (wert === null) localStorage.removeItem(k); else localStorage.setItem(k, wert); } catch (e) { }
}
function lokalLeeren() {
Object.keys(lokalerStand()).forEach(function (k) { setzen(k, null); });
}
function metaLesen() {
var s = sitzung();
if (!s) return null;
var m = lesen(ABGLEICH);
return (m && m.nutzer === s.nutzer.id && m.stand) ? m : { nutzer: s.nutzer.id, erledigt: false, zuletzt: null, stand: {} };
}
function alleHolen(t, id, seit) {
var zeilen = [];
function seite(ab) {
var q = "/rest/v1/fortschritt?select=schluessel,wert,geaendert"
+ "&user_id=eq." + encodeURIComponent(id)
+ "&order=geaendert.asc,schluessel.asc&limit=" + SEITE + "&offset=" + ab;
if (seit) q += "&geaendert=gt." + encodeURIComponent(seit);
return anfrage(q, "GET", undefined, t).then(function (r) {
if (!r.ok) throw new Error("KONTO: holen ging nicht (" + r.status + ")");
return r.json();
}).then(function (d) {
zeilen = zeilen.concat(d);
return d.length === SEITE ? seite(ab + SEITE) : zeilen;
});
}
return seite(0);
}
function schicken(t, liste, zumSchluss) {
var s = sitzung();
if (!s) return Promise.reject(new Error("KONTO: nicht angemeldet"));
var zeilen = liste.map(function (a) { return { user_id: s.nutzer.id, schluessel: a.schluessel, wert: a.wert }; });
return anfrage("/rest/v1/fortschritt?on_conflict=user_id,schluessel", "POST", zeilen, t,
{ "Prefer": "resolution=merge-duplicates,return=minimal" }, zumSchluss)
.then(function (r) { if (!r.ok) throw kontoFehler("schicken ging nicht", r.status); });
}
function offen(meta) {
var jetzt = lokalerStand(), liste = [];
Object.keys(jetzt).forEach(function (k) {
if (jetzt[k].length > MAX_WERT) return; 
if (jetzt[k] !== (hat(meta.stand, k) ? meta.stand[k] : null)) liste.push({ schluessel: k, wert: jetzt[k] });
});
Object.keys(meta.stand).forEach(function (k) {
if (meta.stand[k] !== null && !hat(jetzt, k)) liste.push({ schluessel: k, wert: null });
});
return liste;
}
var MISCHEN_ALT = /^ev_kapitel:[a-z]{2}:(srs:(\d\d|xx|heute)|stat:[0-9-]+:[a-z0-9]+|shadow(:b)?|monster:(easy|medium|hard))$/; 
var MISCHEN = /^(ev_kapitel|ev_schwer|ev_schwer_tenses|ev_taeglich):/;
var MISCHEN_LANG = 8000;
function einzelnNoetig(a) {
if (a.wert === null) return false;
if (MISCHEN_ALT.test(a.schluessel)) return true;
return MISCHEN.test(a.schluessel) && String(a.wert).length <= MISCHEN_LANG;
}
function sicherSchicken(t, a) {
var s = sitzung();
if (!s) return Promise.reject(new Error("KONTO: nicht angemeldet"));
var id = s.nutzer.id, k = a.schluessel, k0 = kennung();
var wo = "/rest/v1/fortschritt?user_id=eq." + encodeURIComponent(id) + "&schluessel=eq." + encodeURIComponent(k);
function versuch(n) {
if (n > 6) { var zuViele = kontoFehler(k + " -- zu viele gleichzeitige Aenderungen, spaeter noch mal"); zuViele.zeile = true; return Promise.reject(zuViele); }
return anfrage(wo + "&select=wert,geaendert", "GET", undefined, t).then(function (r) {
if (!r.ok) throw kontoFehler("lesen ging nicht", r.status);
return r.json();
}).then(function (zeilen) {
if (!gilt(k0)) return { abgebrochen: true };
var m = metaLesen(), vorher = m && hat(m.stand, k) ? m.stand[k] : null;
var hier = null;
try { hier = localStorage.getItem(k); } catch (e) { }
var zeile = zeilen && zeilen[0];
if (!zeile) {
if (hier === null) return { wert: null, hier: null };
return anfrage("/rest/v1/fortschritt", "POST", [{ user_id: id, schluessel: k, wert: hier }], t, { "Prefer": "return=minimal" })
.then(function (r) {
if (r.status === 409) return versuch(n + 1); 
if (!r.ok) throw kontoFehler("anlegen ging nicht", r.status);
return { wert: hier, hier: hier };
});
}
var dort = zeile.wert;
if (dort === null && vorher !== null) { if (gilt(k0)) setzen(k, null); return { wert: null, hier: null, reset: true }; }
var neu = (dort === vorher || dort === hier) ? hier : zusammen(k, hier, dort, vorher);
if (neu === dort) return { wert: dort, hier: hier };
return anfrage(wo + "&geaendert=eq." + encodeURIComponent(zeile.geaendert), "PATCH", { wert: neu }, t,
{ "Prefer": "return=representation" })
.then(function (r) {
if (!r.ok) throw kontoFehler("aendern ging nicht", r.status);
return r.json();
}).then(function (d) {
if (!d || !d.length) return versuch(n + 1); 
return { wert: neu, hier: hier };
});
});
}
return versuch(1).then(function (e) {
if (e.abgebrochen || !gilt(k0)) return;
var jetzt = null;
try { jetzt = localStorage.getItem(k); } catch (x) { }
if (!e.reset && e.wert !== null && e.wert !== jetzt) {
if (jetzt === e.hier) setzen(k, e.wert); 
else if (jetzt === null) { } 
else setzen(k, zusammen(k, jetzt, e.wert)); 
}
var m = metaLesen();
if (m) { m.stand[k] = e.wert; schreiben(ABGLEICH, m); }
if (e.reset) neuLadenNachReset();
});
}
function neuLadenNachReset() {
var zuletzt = 0;
try { zuletzt = Number(sessionStorage.getItem("ev_konto_neu_geladen")) || 0; } catch (e) { }
if (Date.now() - zuletzt < 10000) return;
try { sessionStorage.setItem("ev_konto_neu_geladen", String(Date.now())); } catch (e) { }
altesFensterNeuLaden();
}
var PAUSE_MS = 5 * 60 * 1000, pause = {};
function inHappen(t, liste, fehlt) {
var p = Promise.resolve(), k0 = kennung(), erster = null;
function einzelnJetzt(a) { return einzelnNoetig(a) && !(fehlt && hat(fehlt, a.schluessel)); }
function gemerkt(teil) {
var m = gilt(k0) ? metaLesen() : null;
if (!m) return;
teil.forEach(function (a) { m.stand[a.schluessel] = a.wert; });
schreiben(ABGLEICH, m);
}
function abgelehnt(a) {
return function (e) {
if (!nurDieseZeile(e)) throw e; 
if (!erster) erster = e;
pause[a.schluessel] = Date.now() + PAUSE_MS;
console.warn((e && e.message ? e.message : e) + " -- " + a.schluessel);
};
}
var normal = liste.filter(function (a) { return !einzelnJetzt(a); });
var einzeln = liste.filter(einzelnJetzt);
for (var i = 0; i < normal.length; i += HAPPEN) {
(function (teil) {
p = p.then(function () {
if (!gilt(k0)) return; 
return schicken(t, teil).then(function () { gemerkt(teil); }, function (e) {
if (!nurDieseZeile(e)) throw e;
if (teil.length < 2) { abgelehnt(teil[0])(e); return; }
return teil.reduce(function (q, a) {
return q.then(function () {
if (!gilt(k0)) return;
return schicken(t, [a]).then(function () { gemerkt([a]); }, abgelehnt(a));
});
}, Promise.resolve());
});
});
})(normal.slice(i, i + HAPPEN));
}
einzeln.forEach(function (a) {
p = p.then(function () { if (!gilt(k0)) return; return sicherSchicken(t, a).then(null, abgelehnt(a)); });
});
return p.then(function () { if (erster) throw erster; });
}
function zeit(s) { return Date.parse(String(s).replace(/(\.\d{3})\d+/, "$1")); }
function geloestZahl(x) { return (x.stand && Array.isArray(x.stand.geloest)) ? x.stand.geloest.length : 0; }
function istObjekt(x) { return !!x && typeof x === "object" && !Array.isArray(x); }
function groesser(a, b) { return (+a || 0) >= (+b || 0) ? a : b; }
function zusammen(k, hier, dort, vorher) {
if (hier === null) return dort;
if (dort === null || hier === dort) return hier;
var a = json(hier), b = json(dort);
if (/^ev_kapitel:[a-z]{2}:srs:(\d\d|xx)$/.test(k) && istObjekt(a) && istObjekt(b)) {
var srs = {};
Object.keys(b).forEach(function (id) { srs[id] = b[id]; });
Object.keys(a).forEach(function (id) {
var x = a[id], y = srs[id];
if (!Array.isArray(y)) { srs[id] = x; return; }
if (!Array.isArray(x)) return;
var rx = +x[4] || 0, ry = +y[4] || 0;
srs[id] = (rx > ry || (rx === ry && String(x[2] || "") >= String(y[2] || ""))) ? x : y;
});
return JSON.stringify(srs);
}
if (/^ev_kapitel:[a-z]{2}:srs:heute$/.test(k) && istObjekt(a) && istObjekt(b)) {
if (String(a.tag || "") !== String(b.tag || "")) return String(a.tag || "") > String(b.tag || "") ? hier : dort;
return (+a.n || 0) >= (+b.n || 0) ? hier : dort;
}
if (/^ev_kapitel:[a-z]{2}:stat:/.test(k) && istObjekt(a) && istObjekt(b)) {
var tage = {};
[b, a].forEach(function (m) {
Object.keys(m).forEach(function (tag) {
if (!/^\d{4}-\d{2}-\d{2}$/.test(tag) || !istObjekt(m[tag])) return;
var t = tage[tag] || (tage[tag] = { s: 0, r: 0, f: 0 }), x = m[tag];
t.s = groesser(t.s, x.s); t.r = groesser(t.r, x.r); t.f = groesser(t.f, x.f);
});
});
return JSON.stringify(tage);
}
if (/^ev_kapitel:[a-z]{2}:shadow(:b)?$/.test(k) && istObjekt(a) && istObjekt(b)) { 
var r = {}, ra = istObjekt(a.r) ? a.r : {}, rb = istObjekt(b.r) ? b.r : {};
Object.keys(rb).forEach(function (n) { r[n] = rb[n]; });
Object.keys(ra).forEach(function (n) { r[n] = groesser(ra[n], r[n]); });
var s = {}; Object.keys(b).forEach(function (x) { s[x] = b[x]; }); Object.keys(a).forEach(function (x) { s[x] = a[x]; });
s.r = r;
if (istObjekt(a.m) || istObjekt(b.m)) {
var m = {}, ma = istObjekt(a.m) ? a.m : {}, mb = istObjekt(b.m) ? b.m : {};
Object.keys(mb).forEach(function (n) { m[n] = mb[n]; });
Object.keys(ma).forEach(function (n) { m[n] = groesser(ma[n], m[n]); });
s.m = m;
}
return JSON.stringify(s);
}
if (/^ev_kapitel:[a-z]{2}:monster:(easy|medium|hard)$/.test(k) && istObjekt(a) && istObjekt(b)) {
var ka = istObjekt(a.k) ? a.k : {}, kb = istObjekt(b.k) ? b.k : {}, mk = {}, vonDort = false, vonHier = false;
Object.keys(ka).forEach(function (id) { mk[id] = ka[id]; });
Object.keys(kb).forEach(function (id) {
var x = Array.isArray(mk[id]) ? mk[id] : null, y = Array.isArray(kb[id]) ? kb[id] : [0, 0];
if (!x) { mk[id] = y; vonDort = true; return; }
var s2 = Math.max(+x[0] || 0, +y[0] || 0), b2 = Math.max(+x[1] || 0, +y[1] || 0);
if (s2 !== (+x[0] || 0) || b2 !== (+x[1] || 0)) vonDort = true;
if (s2 !== (+y[0] || 0) || b2 !== (+y[1] || 0)) vonHier = true;
mk[id] = [s2, b2];
});
Object.keys(ka).forEach(function (id) { if (!hat(kb, id)) vonHier = true; });
if (!vonDort) return hier;
if (!vonHier) return dort;
return JSON.stringify({ k: mk });
}
if (/^ev_kapitel:[a-z]{2}:(a:)?easiest:easiest200$/.test(k) && istObjekt(a) && istObjekt(b) && !a.fertig && !b.fertig
&& istObjekt(a.stand) && istObjekt(b.stand) && Array.isArray(a.stand.fertigRunden) && Array.isArray(b.stand.fertigRunden)) {
var fa = a.stand.fertigRunden, fb = b.stand.fertigRunden;
var nurDort = fb.filter(function (r) { return fa.indexOf(r) < 0; }), nurHier = fa.filter(function (r) { return fb.indexOf(r) < 0; });
if (!nurDort.length) return hier;
if (!nurHier.length) return dort;
var basis = fa.length >= fb.length ? a : b;
basis.stand.fertigRunden = (basis === a ? fa.concat(nurDort) : fb.concat(nurHier)).sort(function (x, y) { return x - y; });
return JSON.stringify(basis);
}
if (/^ev_kapitel:[a-z]{2}:(upgrade|antonyms):mistakes$/.test(k) && istObjekt(a) && istObjekt(b)
&& Array.isArray(a.paare) && Array.isArray(b.paare)) {
var paare = b.paare.slice(), pv = (typeof vorher === "string") ? json(vorher) : null;
a.paare.forEach(function (x) { if (paare.indexOf(x) < 0) paare.push(x); });
if (istObjekt(pv) && Array.isArray(pv.paare)) {
paare = paare.filter(function (x) { return pv.paare.indexOf(x) < 0 || (a.paare.indexOf(x) > -1 && b.paare.indexOf(x) > -1); });
}
return JSON.stringify({ paare: paare });
}
if (/^ev_kapitel:[a-z]{2}:baum$/.test(k) && istObjekt(a) && istObjekt(b)) {
return (+a.stufe || 0) >= (+b.stufe || 0) ? hier : dort;
}
if (/^ev_kapitel:/.test(k) && a && b) {
if (!!a.fertig !== !!b.fertig) return a.fertig ? hier : dort;
if (a.fertig) return dort;
return geloestZahl(a) >= geloestZahl(b) ? hier : dort;
}
if (/^ev_schwer(_tenses)?:/.test(k) && Array.isArray(a) && Array.isArray(b)) {
var alle = b.slice();
a.forEach(function (x) { if (alle.indexOf(x) < 0) alle.push(x); });
var v = (typeof vorher === "string") ? json(vorher) : null;
if (Array.isArray(v)) {
alle = alle.filter(function (x) { return v.indexOf(x) < 0 || (a.indexOf(x) > -1 && b.indexOf(x) > -1); });
}
return JSON.stringify(alle);
}
if (/^ev_taeglich:/.test(k) && a && b && typeof a.zuletzt === "string" && typeof b.zuletzt === "string") {
return a.zuletzt >= b.zuletzt ? hier : dort;
}
return hier;
}
var laufend = null;
function abgleichen() {
if (!BEREIT || !sitzung()) return Promise.resolve(false);
if (laufend) return laufend;
var k0 = kennung();
laufend = token().then(function (t) {
if (!t) return false;
var meta = metaLesen(), erst = !meta.erledigt, hierNeu = false, resetKam = false, aufServer = {};
var seit = meta.zuletzt ? new Date(zeit(meta.zuletzt) - 5000).toISOString() : null;
return alleHolen(t, meta.nutzer, seit).then(function (zeilen) {
if (!gilt(k0)) return false; 
var lokal = lokalerStand();
zeilen.forEach(function (z) {
var k = z.schluessel;
if (!ERLAUBT.test(k)) return;
var hier = hat(lokal, k) ? lokal[k] : null;
var vorher = hat(meta.stand, k) ? meta.stand[k] : null;
var neu = erst ? zusammen(k, hier, z.wert)
: (z.wert === null ? (vorher === null ? hier : null)
: (hier !== vorher ? (z.wert !== vorher ? zusammen(k, hier, z.wert, vorher) : hier) : z.wert));
if (neu !== hier) { setzen(k, neu); hierNeu = true; if (neu === null) resetKam = true; }
aufServer[k] = true;
meta.stand[k] = z.wert;
if (!meta.zuletzt || zeit(z.geaendert) > zeit(meta.zuletzt)) meta.zuletzt = z.geaendert;
});
meta.erledigt = true;
schreiben(ABGLEICH, meta);
if (resetKam && gilt(k0)) neuLadenNachReset();
var fehlt = null, liste = offen(meta);
if (seit === null) {
fehlt = {};
liste.forEach(function (a) { if (!hat(aufServer, a.schluessel)) fehlt[a.schluessel] = true; });
}
return inHappen(t, liste, fehlt).then(function () { return hierNeu; }, function (e) {
if (e && typeof e === "object") e.hierNeu = hierNeu;
throw e;
});
});
});
laufend.then(losLaufend, losLaufend);
return laufend;
}
function losLaufend() { laufend = null; }
var schickt = null; 
var NACHHOLEN_ALLE = 15000, naechsterVersuch = 0;
function erstenAbgleichNachholen() {
if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve();
if (Date.now() < naechsterVersuch) return Promise.resolve();
naechsterVersuch = Date.now() + NACHHOLEN_ALLE;
return abgleichen().then(nichts, nichts);
}
function schickenWasNeu(zumSchluss) {
if (!BEREIT || !sitzung() || laufend) return Promise.resolve();
if (schickt && !zumSchluss) return schickt;
var meta = metaLesen();
if (!meta || !meta.erledigt) return zumSchluss ? Promise.resolve() : erstenAbgleichNachholen(); 
var jetztZeit = Date.now();
var liste = offen(meta).filter(function (a) { return !(pause[a.schluessel] > jetztZeit); }); 
if (!liste.length) return Promise.resolve();
if (zumSchluss) {
var s = sitzung();
var rest = liste.filter(einzelnNoetig);
if (rest.length && !schickt) {
schickt = token().then(function (t) { if (t) return inHappen(t, rest); });
schickt.then(frei2, frei2);
}
liste = liste.filter(function (a) { return !einzelnNoetig(a); });
if (!liste.length) return Promise.resolve();
if (s.laeuft_ab - 30 < Date.now() / 1000 || JSON.stringify(liste).length > 60000) return Promise.resolve();
return schicken(s.access_token, liste, true).then(nichts, nichts);
}
schickt = token().then(function (t) { if (t) return inHappen(t, liste); });
schickt.then(frei2, frei2);
return schickt;
}
function frei2() { schickt = null; }
function knopfZeigen() {
var k = document.getElementById("konto-knopf");
if (!k) return;
var s = sitzung();
k.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" ' +
'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/>' +
'<path d="M4.5 20.5c.6-3.9 3.7-6.3 7.5-6.3s6.9 2.4 7.5 6.3"/></svg>';
k.classList.toggle("angemeldet", !!s);
k.setAttribute("aria-label", s ? "Your account: " + s.nutzer.email : "Sign in to save your progress on all devices");
k.title = s ? "Account" : "Sign in";
}
(function kontoIcon() {
if (!document.head || document.getElementById("ev-konto-icon")) return;
var s = document.createElement("style");
s.id = "ev-konto-icon";
s.textContent = [
"header.kopf a.bt-konto { position: relative; width: 36px; height: 36px; padding: 0; gap: 0;",
"  border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;",
"  flex: none; font-size: 0; }",
"header.kopf a.bt-konto svg { width: 18px; height: 18px; display: block; }",
"header.kopf a.bt-konto.angemeldet::before { content: none; }",
"header.kopf a.bt-konto.angemeldet::after { content: \"\\2713\"; position: absolute; right: -3px; bottom: -3px;",
"  width: 15px; height: 15px; border-radius: 50%; background: #1a7c36; color: #fff;",
"  font-size: 10px; font-weight: 900; line-height: 15px; text-align: center; box-shadow: 0 0 0 2px var(--bg); }",
"@media (max-width: 480px) { header.kopf a.bt-konto { width: 32px; height: 32px; padding: 0; } header.kopf a.bt-konto svg { width: 16px; height: 16px; } }",
"@media (max-width: 360px) { header.kopf a.bt-konto { width: 30px; height: 30px; padding: 0; } }"
].join("\n");
document.head.appendChild(s);
})();
var uhr = null;
function starten() {
if (uhr || !BEREIT || !sitzung()) return;
uhr = setInterval(function () {
schickenWasNeu().then(nichts, nichts);
if (neuesWartet) neuLadenWennMenue();
if (Date.now() - zuletztNachgesehen >= NACHSEHEN_ALLE) nachsehen();
}, 3000);
}
function anhalten() { if (uhr) { clearInterval(uhr); uhr = null; } }
var baldUhr = null;
function baldSchicken() {
if (baldUhr || !uhr) return; 
baldUhr = setTimeout(function () { baldUhr = null; schickenWasNeu().then(nichts, nichts); }, 700);
}
var NACHSEHEN_MIN = 20000, NACHSEHEN_ALLE = 60000, zuletztNachgesehen = Date.now(), neuesWartet = false;
var POPUP_OFFEN = ".ns-hinter, #ev-neu-version, #ev-meilenstein, .ev-neu-hinter";
function istMenue() { return !!document.body && document.body.hasAttribute("data-konto-neu-laden"); }
function neuLadenWennMenue() {
if (!neuesWartet || !istMenue()) return;
try { if (document.querySelector(POPUP_OFFEN)) return; } catch (e) { } 
var zuletzt = 0;
try { zuletzt = Number(sessionStorage.getItem("ev_konto_neu_geladen")) || 0; } catch (e) { }
if (Date.now() - zuletzt < 10000) return; 
neuesWartet = false;
try { sessionStorage.setItem("ev_konto_neu_geladen", String(Date.now())); } catch (e) { }
location.reload();
}
function nachAbgleich(hierNeu) {
if (hierNeu) neuesWartet = true;
neuLadenWennMenue();
}
function nachAbgleichFehler(fehler) {
console.warn(fehler && fehler.message ? fehler.message : fehler);
if (fehler && fehler.hierNeu) nachAbgleich(true);
}
function nachsehen() {
if (!BEREIT || !sitzung() || laufend || schickt || !istMenue()) return;
if (document.visibilityState && document.visibilityState !== "visible") return;
if (typeof navigator !== "undefined" && navigator.onLine === false) return;
if (Date.now() - zuletztNachgesehen < NACHSEHEN_MIN) return;
zuletztNachgesehen = Date.now();
abgleichen().then(nachAbgleich, nachAbgleichFehler);
}
window.addEventListener("focus", nachsehen);
window.addEventListener("pageshow", function (e) { if (e && e.persisted) { zuletztNachgesehen = 0; nachsehen(); } });
window.addEventListener("pagehide", function () { schickenWasNeu(true); });
window.addEventListener("online", function () {
naechsterVersuch = 0;
if (BEREIT && sitzung()) abgleichen().then(nichts, nichts);
});
document.addEventListener("visibilitychange", function () {
if (document.visibilityState === "hidden") schickenWasNeu(true);
else nachsehen(); 
});
window.addEventListener("storage", function (e) { if (e.key === SITZUNG) knopfZeigen(); });
(function kopfHandy() {
if (!document.head || document.getElementById("ev-kopf-handy")) return;
var s = document.createElement("style");
s.id = "ev-kopf-handy";
s.textContent = [
"@media (max-width: 480px) {",
"  .kopf-name { font-size: 14px; gap: 6px; white-space: nowrap; }",
"  .kopf-name img { width: 22px; height: 22px; }",
"  .kopf-name { padding: 7px; margin: -7px; }",
"  .kopf-rechts { gap: 6px; }",
"  .bt-konto { height: 32px; padding: 0 11px; font-size: 13px; white-space: nowrap; }",
"  .bt-hell-dunkel { width: 32px; height: 32px; font-size: 15px; }",
"}",
"@media (max-width: 360px) {",
"  .kopf-name { font-size: 13px; }",
"  .bt-konto { padding: 0 9px; font-size: 12px; }",
"  .bt-hell-dunkel { width: 30px; height: 30px; font-size: 14px; }",
"}"
].join("\n");
document.head.appendChild(s);
})();
knopfZeigen();
if (BEREIT && sitzung()) {
starten();
abgleichen().then(nachAbgleich, nachAbgleichFehler); 
}
return {
bereit: function () { return BEREIT; },
angemeldet: function () { var s = sitzung(); return s ? { email: s.nutzer.email, id: s.nutzer.id } : null; },
token: token,
codeSenden: codeSenden,
codePruefen: codePruefen,
abmelden: abmelden,
kontoLoeschen: kontoLoeschen,
emailAendern: emailAendern,
emailPruefen: emailPruefen,
abgleichen: abgleichen
};
})();
