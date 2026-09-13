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
// Checked independently of the uiCats regex above rather than folded into it:
// requiring `icon` there would mean one missing icon silently empties uiCats and
// turns every category check into a vacuous pass over an empty array.
const catsBlock = html.match(/const CATS = \[([\s\S]*?)\n\];/)[1];
const catIcons = [...catsBlock.matchAll(/icon:"([^"]+)"/g)].map((m) => m[1]);
ok("every category has an icon", catIcons.length === uiCats.length,
   catIcons.length + " icons for " + uiCats.length + " categories");
ok("category icons are distinct", new Set(catIcons).size === catIcons.length,
   "a shared emoji would defeat the point of having one");

// Trip purposes used to live in two places — a hand-typed <select> and the
// PURPOSE map — and the check here compared them. Now the select is GENERATED
// from PURPOSE, so the invariant is stronger and simpler: the markup carries no
// options at all, and the form builds them from the map. Re-adding a typed
// <option> is how a second list comes back.
const purposeKeys = [...(js.match(/const PURPOSE = \{([\s\S]*?)\n\};/)[1]
  .matchAll(/"([^"]+)":/g))].map((m) => m[1]);
ok("purpose dropdown is generated, not typed",
   /<select id="tfPurpose"><\/select>/.test(html) &&
   /g\("tfPurpose"\)\.innerHTML = Object\.entries\(PURPOSE\)/.test(js),
   purposeKeys.length + " purposes, one source");
ok("every purpose has a colour token", purposeKeys.length > 0 &&
   [...js.match(/const PURPOSE = \{([\s\S]*?)\n\};/)[1].matchAll(/v:"(--tp-[a-z]+)"/g)]
     .every((m) => new RegExp(m[1] + ":#[0-9A-Fa-f]{6}").test(html)),
   "every v: points at a declared --tp-* variable");
const purposeBlock = js.match(/const PURPOSE = \{([\s\S]*?)\n\};/)[1];
const purposeIcons = [...purposeBlock.matchAll(/icon:"([^"]+)"/g)].map((m) => m[1]);
ok("every trip purpose has an icon", purposeIcons.length === purposeKeys.length,
   purposeIcons.length + " icons for " + purposeKeys.length + " purposes");
ok("purpose icons are distinct", new Set(purposeIcons).size === purposeIcons.length);
const declared = new Set([...html.matchAll(/(--[a-z]+):#/g)].map((m) => m[1]));
ok("every category has a declared colour", uiCats.every((u) => declared.has(u.css)));

// Adjacent colours must stay distinguishable in a stacked bar — in BOTH
// themes. The dark palette lifts every hue, and lifting them all by eye is
// exactly how two neighbours quietly end up the same colour at night.
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const dist = (a, b) => Math.round(Math.sqrt(rgb(a).reduce((s, v, i) => s + (v - rgb(b)[i]) ** 2, 0)));
// The light values live in the bare :root, the dark ones behind
// [data-theme="dark"]. Split the source so one cannot read the other.
const purposeTokens = [...purposeBlock.matchAll(/v:"(--tp-[a-z]+)"/g)].map((m) => m[1]);
const DARK_SEL = ':root[data-theme="dark"]{';
const darkBlock = (/:root\[data-theme="dark"\]\{[\s\S]*?\n {2}\}/.exec(html) || [""])[0];
const lightBlock = html.slice(0, html.indexOf(DARK_SEL));
ok("a dark palette is defined", darkBlock.length > 0);

[["light", lightBlock], ["dark", darkBlock]].forEach(([theme, block]) => {
  const hex = (v) => (new RegExp(v + ":\\s*(#[0-9A-Fa-f]{6})").exec(block) || [])[1];
  const missing = uiCats.filter((u) => !hex(u.css)).map((u) => u.label);
  ok(`every category has a ${theme} colour`, missing.length === 0, missing.join(", ") || uiCats.length + " hues");
  if (missing.length) return;
  let minD = Infinity, worst = "";
  uiCats.forEach((u, i) => {
    if (i === uiCats.length - 1) return;
    const d = dist(hex(u.css), hex(uiCats[i + 1].css));
    if (d < minD) { minD = d; worst = u.label + " / " + uiCats[i + 1].label; }
  });
  ok(`adjacent ${theme} colours are distinguishable`, minD >= 55, "closest pair " + worst + " at " + minD);
  // Every purpose needs its own token in each theme too, or a strip renders
  // with an empty custom property and the card loses its colour entirely.
  const noPurpose = purposeTokens.filter((t) => !hex(t));
  ok(`every purpose has a ${theme} colour`, noPurpose.length === 0,
     noPurpose.join(", ") || purposeTokens.length + " purposes");
});

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
// setMenuBtn opens the sheet rather than doing anything; themeBtn is the one
// header control the sheet does NOT delegate to, because a phone shows all
// three appearance modes at once instead of cycling through them — the check
// below proves that control exists rather than letting it go missing.
const headerActions = [...header.matchAll(/<(?:a|button)[^>]*\bid="(\w+)"/g)].map((m) => m[1])
  .filter((x) => !["setMenuBtn", "ratesLbl", "baseLabel", "themeBtn"].includes(x));
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
["manifest.json", "icon-180.png", "icon-192.png", "icon-512.png", "icon-512-maskable.png",
 "sw.js"].forEach((f) =>
  ok("ships " + f, fs.existsSync(path.join(DIR, "public", f))));

// --- offline shell -------------------------------------------------------
// The worker names the files it pre-caches. addAll() is atomic: one missing
// path and the install rejects, leaving the app with no offline mode at all
// and nothing on screen to say so. Cheap to check here, invisible until a
// phone is on a plane otherwise.
const sw = fs.readFileSync(path.join(DIR, "public", "sw.js"), "utf8");
const precached = [...sw.matchAll(/"(\/[^"]*)"/g)].map((m) => m[1])
  .filter((u) => u !== "/" && !u.startsWith("/api/"));
ok("every pre-cached asset exists",
   precached.every((u) => fs.existsSync(path.join(DIR, "public", u))),
   precached.length + " assets listed in sw.js");
ok("the worker is registered", /serviceWorker\.register\("\/sw\.js"\)/.test(html));
ok("the worker is not cached", /rel === "\/sw\.js".*no-cache/s.test(srvSrc),
   "a stale worker pins an old app on the device");
ok("writes are never served from cache", /req\.method !== "GET"/.test(sw),
   "a queued write would report money as saved that was not");
// "/" used to be pre-cached AND handled by the cache-first branch, so every
// fetch of it returned the copy stored on the first visit — for good. The page
// checks itself by fetching "/", so it could never see it had gone stale.
ok("the document is always network-first",
   /req\.mode === "navigate" \|\| url\.pathname === "\/" \|\| url\.pathname === "\/index\.html"/.test(sw)
     && !/^\s*"\/",\s*$/m.test(sw),
   "and \"/\" is not pre-cached, or it can never go stale");
// On a first visit the worker takes control only after the page has fetched the
// store, so that request never reaches it: without warming, the first offline
// launch shows the app completely empty.
ok("the store is warmed on install", /fetch\("\/api\/data"\)/.test(sw),
   "or offline works only from the second visit onwards");

// --- knowing which build this is ----------------------------------------
// The version is stamped into the page as it is served, so a cached copy keeps
// the value it was served with and can tell it has gone stale. Every piece of
// this chain is load-bearing and none of it is visible in a browser that has
// never cached anything.
ok("the page is stamped with its version",
   /name="app-version" content="__APP_VERSION__"/.test(html)
     && /__APP_VERSION__/.test(srvSrc) && /ext === "\.html"/.test(srvSrc),
   "placeholder in the page, substitution in the server");
ok("the version comes from the image, not a file",
   /ARG APP_VERSION/.test(fs.readFileSync(path.join(DIR, "Dockerfile"), "utf8")) &&
   /process\.env\.APP_VERSION/.test(srvSrc),
   "package.json said 1.0.0 for three releases");
ok("the version probe is never cached", /"\/api\/version"[\s\S]{0,200}no-store/.test(srvSrc),
   "a cached answer about staleness is worthless");
ok("there is a way out of a stale cache",
   /getRegistrations\(\)[\s\S]{0,200}unregister\(\)/.test(js) && /caches\.delete/.test(js)
     && (html.match(/<button class="btn" data-checkupd>/g) || []).length === 2,
   "unregister and clear, offered in both shells");

// --- launch colours ------------------------------------------------------
// iOS paints background_color before the app draws and tints the status bar
// area with theme_color. Anything but the app's own paper flashes on launch.
const paper = (/--paper:\s*(#[0-9A-Fa-f]{6})/.exec(html) || [])[1];
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "public", "manifest.json"), "utf8"));
const themeMeta = (/name="theme-color" content="(#[0-9A-Fa-f]{6})"/.exec(html) || [])[1];
ok("launch colours are the app's paper",
   !!paper && [themeMeta, manifest.theme_color, manifest.background_color]
     .every((c) => (c || "").toLowerCase() === paper.toLowerCase()),
   "theme-color, theme_color and background_color all " + paper);
ok("the status bar is readable", /apple-mobile-web-app-status-bar-style" content="default"/.test(html),
   "black-translucent draws white glyphs over a near-white app");

// --- appearance -----------------------------------------------------------
// The theme is resolved in the head, before anything paints. Lose this and the
// app still works — it just flashes the wrong theme on every launch, which is
// invisible in a light browser and glaring on a dark phone.
ok("the theme is resolved before first paint",
   /localStorage\.getItem\("hl-theme"\)[\s\S]*?dataset\.theme/.test(html.slice(0, html.indexOf("<style>"))),
   "no flash of the wrong theme on launch");
// Two shells, two shapes, one source: the header cycles through THEME_MODES,
// the phone sheet lays the same list out in full. Either going missing leaves
// a theme that can be set on one device and not the other.
ok("the theme control is in both shells",
   /id="themeBtn"/.test(header) && /data-seg="theme" role="group"/.test(html)
     && /onclick = cycleTheme/.test(js),
   "header button cycles, phone sheet lists all three");
ok("every theme mode is offered", /THEME_MODES = \[\["light"[\s\S]*?\["dark"[\s\S]*?\["auto"/.test(js),
   "light, dark and follow-the-device");
ok("the browser chrome follows the palette", /meta\.content = c\("--paper"\)/.test(js),
   "theme-color is read back from the stylesheet, not repeated as a hex");
ok("png is serveable", /"\.png": "image\/png"/.test(srvSrc), "without this the icons 404");
ok("index.html is not cached", /Cache-Control.*no-cache/.test(srvSrc), "so a redeploy cannot leave a stale UI");
ok("inputs are 16px on touch", /@media\(max-width:700px\)\{input,select,textarea\{font-size:16px/.test(flat),
   "under 16px iOS force-zooms on focus and never zooms back");

// --- dialogs on a phone ---------------------------------------------------
// iOS moves the VISUAL viewport to reveal a focused field and leaves the
// layout viewport behind, so a dialog fixed to inset:0 slides off-screen and
// clips its own labels. These three together are what hold it still; each is
// invisible in a desktop browser and obvious on a phone.
ok("dialogs follow the visual viewport",
   /\.modal-bg\{[^}]*top:var\(--vvtop/.test(flat) && /--vvtop", vv\.offsetTop/.test(js),
   "offset as well as height, or the dialog drifts sideways");
ok("the page cannot scroll behind a dialog",
   /body\.locked\{overflow:hidden\}/.test(flat) && /classList\.toggle\("locked"/.test(js),
   "otherwise iOS drags the page around under the form");
ok("form columns can shrink", /\.fgrid > div\{min-width:0\}/.test(flat),
   "a native date input has an intrinsic width and would widen the dialog");

// The header label that normally reports a rates refresh is not on screen on a
// phone, so the sheet row carries it — and must not close the sheet first.
ok("the rates row reports in place",
   /data-do="ratesBtn" data-keepopen/.test(html) && /ratesLblM"\)/.test(js) &&
   /hasAttribute\("data-keepopen"\)/.test(js),
   "sheet stays open and the row shows the result");
ok("safe areas handled", /env\(safe-area-inset-bottom\)/.test(html) && /viewport-fit=cover/.test(html),
   "viewport-fit is what makes env() resolve at all");
ok("tables reflow rather than truncate", (html.match(/class="reflow"/g) || []).length === 2 && /grid-template-areas/.test(html));
// The overview heat grid (.heat, cells .lab/.hc) is not a reflow table: it
// scrolls sideways by design, so its cells carry no data-l and are skipped.
const labelled = [...html.matchAll(/<td(?![^>]*(?:data-l|class="(?:lab|hc)"))[^>]*>/g)].length;
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
