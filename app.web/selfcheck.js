#!/usr/bin/env node
// =============================================================
//  Holiday Tracker — self check
//
//  Run after editing server.js or public/index.html:
//      cd app.web && node selfcheck.js
//
//  Not deployed: .dockerignore keeps it out of the image. Nothing here
//  touches the network or your data — it reads the two source
//  files and exercises the pure functions lifted out of the page.
//
//  It guards the invariants that are easy to break silently, i.e. the ones
//  that produce a wrong NUMBER rather than an error:
//    * the category list and prepaid defaults agreeing across both files
//    * estimates never being summed as spend
//    * amounts never being read raw, bypassing the display conversion
//    * as-paid winning over a round-trip conversion
//    * switching display currency never mutating stored data
// =============================================================

const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const srvSrc = fs.readFileSync(path.join(DIR, "server.js"), "utf8");
const html = fs.readFileSync(path.join(DIR, "public/index.html"), "utf8");
const js = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
const flat = html.replace(/\n\s*/g, "");

let fails = 0;
const ok = (name, cond, detail) => {
  if (!cond) fails++;
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "\n          " + detail : ""));
};
const head = (t) => console.log("\n" + t);

// ---------------------------------------------------------------- parsing
head("Source parses");
try {
  new Function(js);
  ok("public/index.html script parses", true);
} catch (e) {
  ok("public/index.html script parses", false, e.message);
}

// ------------------------------------------------- server / UI agreement
head("server.js and index.html agree");
const srvCats = srvSrc
  .match(/const CATEGORIES = \[([\s\S]*?)\];/)[1]
  .split("\n")
  .map((l) => (l.match(/^\s*"([a-z]+)"/) || [])[1])
  .filter(Boolean);
const srvPre = new Set(
  srvSrc.match(/PREPAID_BY_DEFAULT = new Set\(\[([^\]]+)\]/)[1].match(/"[a-z]+"/g).map((x) => x.slice(1, -1))
);
const uiCats = [...html.matchAll(/\{ id:"([a-z]+)",\s*label:"([^"]+)",\s*css:"(--[a-z]+)",\s*pre:(true|false)/g)].map(
  (m) => ({ id: m[1], label: m[2], css: m[3], pre: m[4] === "true" })
);
ok("same categories, same order", JSON.stringify(srvCats) === JSON.stringify(uiCats.map((x) => x.id)),
   srvCats.length + " categories");
ok("prepaid defaults agree", uiCats.every((u) => srvPre.has(u.id) === u.pre));
const declared = new Set([...html.matchAll(/(--[a-z]+):#/g)].map((m) => m[1]));
ok("every category has a declared colour", uiCats.every((u) => declared.has(u.css)));

// adjacent colours must stay distinguishable in a stacked bar
const hex = (v) => html.match(new RegExp(v + ":(#[0-9A-Fa-f]{6})"))[1];
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const dist = (a, b) => Math.round(Math.sqrt(rgb(a).reduce((s, v, i) => s + (v - rgb(b)[i]) ** 2, 0)));
let minD = Infinity, worst = "";
uiCats.forEach((u, i) => {
  if (i === uiCats.length - 1) return;
  const d = dist(hex(u.css), hex(uiCats[i + 1].css));
  if (d < minD) { minD = d; worst = u.label + " / " + uiCats[i + 1].label; }
});
ok("adjacent category colours are distinguishable", minD >= 55, "closest pair " + worst + " at " + minD);

// -------------------------------------------------------- money integrity
head("Money can only be read through tripStats");
const iStats = js.indexOf("function tripStats"), jStats = js.indexOf("const stats = ()");
const outside = [];
js.split("\n").reduce((off, l) => {
  const isComment = /^\s*(\/\/|\*)/.test(l);
  if (!isComment && /amountBase/.test(l) && (off < iStats || off > jStats)) outside.push(l.trim().slice(0, 76));
  return off + l.length + 1;
}, 0);
ok("amountBase is never read outside tripStats", outside.length === 0,
   outside.length ? outside.join("\n          ") : "so the display conversion cannot be bypassed");

const rawItems = js.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l) && /\.items\b/.test(l) && /amountBase|\.amount\b/.test(l) && !/t\.conv/.test(l));
ok("no per-line loop sums raw t.items", rawItems.length === 0,
   rawItems.length ? rawItems.map((x) => x.trim().slice(0, 76)).join("\n          ") : "so estimates cannot leak into spend");

// ------------------------------------------------------- wiring integrity
head("Wiring");
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const used = [...new Set([...html.matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]))];
ok("every getElementById target exists", used.every((x) => ids.has(x)), used.length + " references");

const header = html.slice(html.indexOf("<header>"), html.indexOf("</header>"));
const headerActions = [...header.matchAll(/<(?:a|button)[^>]*\bid="(\w+)"/g)].map((m) => m[1])
  .filter((x) => !["setMenuBtn", "ratesLbl", "baseLabel"].includes(x));
const sheetRows = [...html.matchAll(/data-do="(\w+)"/g)].map((m) => m[1]);
const unreachable = headerActions.filter((b) => !sheetRows.includes(b));
ok("every header action is reachable on a phone", unreachable.length === 0,
   unreachable.length ? "missing from the action sheet: " + unreachable.join(", ") : sheetRows.join(", "));
ok("the sheet delegates rather than duplicating", /getElementById\(b\.dataset\.do\)\.click\(\)/.test(js));

const views = new Function(js.match(/const VIEWS = \[[\s\S]*?\];/)[0] + "\nreturn VIEWS;")();
ok("every view is routed", views.every(([id]) => js.includes('state.view==="' + id + '"')), views.map((v) => v[1]).join(", "));
const ICONS = new Function(js.match(/const ICONS = \{[\s\S]*?\n\};/)[0] + "\nreturn ICONS;")();
ok("every view has a bottom-bar icon", views.every(([id]) => ICONS[id]));

// ------------------------------------------------------------ phone shell
head("Phone shell");
ok("installable", /rel="manifest"/.test(html) && /apple-touch-icon/.test(html));
["manifest.json", "icon-180.png", "icon-512.png", "icon-512-maskable.png"].forEach((f) =>
  ok("ships " + f, fs.existsSync(path.join(DIR, "public", f))));
ok("png is serveable", /"\.png": "image\/png"/.test(srvSrc), "without this the icons 404");
ok("index.html is not cached", /Cache-Control.*no-cache/.test(srvSrc), "so a redeploy cannot leave a stale UI");
ok("inputs are 16px on touch", /@media\(max-width:700px\)\{input,select,textarea\{font-size:16px/.test(flat),
   "under 16px iOS force-zooms on focus and never zooms back");
ok("safe areas handled", /env\(safe-area-inset-bottom\)/.test(html) && /viewport-fit=cover/.test(html),
   "viewport-fit is what makes env() resolve at all");
ok("tables reflow rather than truncate", (html.match(/class="reflow"/g) || []).length === 2 && /grid-template-areas/.test(html));
const labelled = [...html.matchAll(/<td(?![^>]*data-l)[^>]*>/g)].length;
ok("every reflowed table cell carries a heading", labelled <= 2, "first columns aside, all cells have data-l");

// ------------------------------------------------- display currency maths
head("Display currency");
const slice = js.slice(js.indexOf("const BASE   ="), js.indexOf("const stats = ()"))
  .replace(/const today = .*$/m, 'const today=()=>"2026-08-05";');
const make = new Function("DATA", "state", slice + "\nreturn {tripStats,tripRate,money};");
const DATA = { settings: { baseCurrency: "GBP", currencies: [
  { code: "GBP", symbol: "£", rate: 1 }, { code: "EUR", symbol: "€", rate: 0.85 }] }, trips: [] };
const item = (o) => Object.assign(
  { id: "i", date: "2026-05-04", category: "misc", amount: 0, currency: "GBP", fx: 1,
    amountBase: 0, note: "", prepaid: false, estimated: false }, o);
const TRIP = { id: "t", name: "T", start: "2026-05-02", end: "2026-05-12", travellers: 2, budget: 1700,
  items: [
    item({ amount: 560, currency: "GBP", fx: 1, amountBase: 560 }),
    item({ amount: 120, currency: "EUR", fx: 0.9, amountBase: 108 }), // frozen at 0.9, default is 0.85
  ] };
const r2 = (n) => Math.round(n * 100) / 100;

let M = make(DATA, { display: null }), t = M.tripStats(TRIP);
ok("base view sums the stored figures", r2(t.actual) === 668, "£560 + £108");
M = make(DATA, { display: "EUR" }); t = M.tripStats(TRIP);
ok("trip converts at its own observed rate", t.dispRate === 0.9, "0.9 from its own EUR line, not today's 0.85");
ok("AS-PAID WINS", t.conv(TRIP.items[1]) === 120, "€120 exactly — not £108 ÷ 0.85 = €127.06");
ok("base-paid line converts at that rate", r2(t.conv(TRIP.items[0])) === 622.22, "£560 ÷ 0.9");
ok("budget converts too", r2(t.budget) === 1888.89, "£1,700 ÷ 0.9");

const snapshot = JSON.stringify(TRIP);
make(DATA, { display: "EUR" }).tripStats(TRIP);
make(DATA, { display: null }).tripStats(TRIP);
ok("conversion never mutates stored data", JSON.stringify(TRIP) === snapshot,
   "amount, fx and amountBase all unchanged after switching back and forth");

const noEur = { id: "t2", name: "T2", start: "2026-07-01", end: "2026-07-08", travellers: 2, budget: 0,
  items: [item({ amount: 900, currency: "GBP", fx: 1, amountBase: 900 })] };
const t2 = make(DATA, { display: "EUR" }).tripStats(noEur);
ok("a trip with no such currency falls back and admits it", t2.dispRate === 0.85 && t2.rateEstimated === true);

// ------------------------------------------------------------------ done
console.log("\n" + (fails ? fails + " FAILURE" + (fails > 1 ? "S" : "") : "All checks passed") + "\n");
process.exit(fails ? 1 : 0);
