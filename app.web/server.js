// =============================================================
//  Holiday Tracker — tiny backend
//  Serves the SPA and persists all data to JSON files on disk.
//  No external runtime deps: uses only Node's built-in http/fs.
//  Data lives in ./data/data.json (mount this dir as a volume).
//
//  Same shape as the rental_tracker backend on purpose — atomic
//  writes, a rolling snapshot before every change, strict number
//  parsing, and no auth of its own (Authelia sits in front).
// =============================================================

const http = require("http"); // built-in HTTP server (no Express needed)
const fs = require("fs"); // file system for JSON persistence
const path = require("path"); // safe path joining
const crypto = require("crypto"); // for generating record ids

// --- Paths & config ---
const PORT = process.env.PORT || 8100; // app port (override via env)
const ROOT = __dirname; // project root
const PUBLIC_DIR = path.join(ROOT, "public"); // static assets (SPA)
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data"); // persistent data dir
const DATA_FILE = path.join(DATA_DIR, "data.json"); // main data store
const BACKUP_DIR = path.join(DATA_DIR, "backups"); // timestamped backups

// --- Default empty store ---
// Starts empty: no sample trips ship to the host. `settings.currencies` is the
// only seeded content, because the app is useless without at least one currency.
//
// FX convention (used everywhere, including the UI):
//   rate = how many BASE units one unit of this currency is worth.
//   GBP is base, so its rate is pinned at 1 and cannot be edited.
//   EUR 0.85 means €1 = £0.85;  RON 0.171 means 1 RON = £0.171.
//
// These are DEFAULTS only — they pre-fill the entry form. The rate that matters
// is the one frozen onto each line item at entry time (see item.fx below), so
// changing a default here never rewrites history.
const DEFAULT_DATA = {
  settings: {
    baseCurrency: "GBP", // everything is reported in this
    // Pre-fills the travellers field on a new trip and the estimator's party
    // size. Only a default — every trip stores its own count, so changing this
    // never alters a trip already recorded.
    defaultTravellers: 2,
    currencies: [
      { code: "GBP", symbol: "£", rate: 1 }, // base — rate always 1
      { code: "EUR", symbol: "€", rate: 0.85 }, // editable default
      { code: "RON", symbol: "lei", rate: 0.171 }, // editable default
    ],
  },
  // trips[] holds everything else. A trip owns its line items, so deleting a
  // trip cannot leave orphaned spend behind.
  // trip:  { id, name, country, start:"YYYY-MM-DD", end, travellers, purpose,
  //          rating(1-5|null), budget, defaultCurrency, note, items[] }
  // item:  { id, date:"YYYY-MM-DD", category, amount, currency, fx, amountBase,
  //          note, prepaid, estimated }
  trips: [],
};

// Spend categories the server will accept. Kept in sync with CATS in
// public/index.html — the UI generates its dropdown from its own copy, this
// list is the server-side guard so a hand-crafted POST can't invent a category
// that no chart knows how to colour.
const CATEGORIES = [
  "flights",
  "accommodation",
  "restaurants",
  "activities",
  "ski", // pass, instructor and hire together — see the note in the role README
  "transport",
  "carrental",
  "shopping",
  "insurance",
  "medical",
  "misc",
];

// Categories that are, by their nature, paid up front rather than on the trip.
// Used to default the `prepaid` flag; the client may still override it.
//
// carrental is here because hire is normally booked and paid online weeks ahead
// — it behaves like a flight, not like a metro ticket. ski is NOT, because
// passes, lessons and hire are usually paid at the resort; if yours came
// bundled with the chalet, untick the box on that line.
//
// Keep in sync with the `pre:` flags in CATS in public/index.html — the UI uses
// its copy to pre-tick the checkbox, this one is the fallback when the client
// sends no explicit flag.
const PREPAID_BY_DEFAULT = new Set(["flights", "accommodation", "insurance", "carrental"]);

// --- Ensure data dir + file exist on boot ---
function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); // create data dir
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true }); // create backups dir
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2)); // seed empty store
  }
}

// --- Read whole store ---
function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8"); // read file
    const parsed = JSON.parse(raw); // parse JSON
    // Backfill missing top-level keys (forward-compat with older files)
    const out = { ...DEFAULT_DATA, ...parsed };
    out.settings = { ...DEFAULT_DATA.settings, ...(parsed.settings || {}) }; // nested backfill
    if (!Array.isArray(out.trips)) out.trips = []; // never hand back a broken shape
    return out;
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_DATA)); // fall back to empty
  }
}

// --- Write whole store (atomic + keep a rolling backup) ---
function writeData(data) {
  const tmp = DATA_FILE + ".tmp"; // temp file for atomic replace
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2)); // write temp
  // Keep a timestamped backup BEFORE overwriting, so we can roll back
  if (fs.existsSync(DATA_FILE)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-"); // filesystem-safe stamp
    fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `data-${stamp}.json`)); // snapshot
    pruneBackups(30); // keep only the 30 most recent snapshots
  }
  fs.renameSync(tmp, DATA_FILE); // atomic swap into place
}

// --- Keep backups bounded ---
function pruneBackups(keep) {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("data-") && f.endsWith(".json"))
    .sort(); // lexical sort == chronological (ISO stamps)
  while (files.length > keep) {
    const old = files.shift(); // oldest first
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, old)); // delete it
    } catch (_) {}
  }
}

// =============================================================
//  Validation helpers
//  Same philosophy as rental_tracker: junk in a money field is a
//  400, never a silent 0. A holiday ledger you can't trust is
//  worse than no ledger, because you'd still act on the numbers.
// =============================================================

const id = () => crypto.randomBytes(6).toString("hex"); // short random id

// Strict number parsing. `Number(x) || 0` would turn "1,200" into 0 and lose
// £1,200 without a word — so junk returns null and the caller answers 400.
//   required=true  : blank is an error (amounts — a blank amount is meaningless)
//   required=false : blank means 0
function parseNum(v, required) {
  if (v === null || v === undefined || String(v).trim() === "") {
    return required ? null : 0; // blank: reject for amounts, 0 otherwise
  }
  const n = Number(v); // strict — no comma stripping, no partial parses
  return Number.isFinite(n) ? n : null; // NaN/Infinity -> null (rejected by caller)
}

// "YYYY-MM-DD" validation — the exact shape <input type="date"> submits.
const validDate = (d) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(d || ""));

// Round to 2dp without float dust (0.1+0.2 problems compound over 300 items).
const money = (n) => Math.round(n * 100) / 100;

// Clamp a string field to a sane length so one paste can't bloat the store.
const str = (v, max, fallback = "") => (v === undefined || v === null ? fallback : String(v).slice(0, max));

// Look up a currency in the store's own list. Unknown codes are rejected rather
// than auto-added: an item in a currency with no rate can never be converted,
// and a silently unconvertible item is an invisible hole in every total.
function findCurrency(data, code) {
  return (data.settings.currencies || []).find((x) => x.code === code);
}

// Build a validated line item from a request body.
// Returns { rec } on success or { error } on failure.
//
// FX is FROZEN onto the item at entry time. This is the whole point of storing
// `fx` and `amountBase` per item rather than converting at render time: the €80
// dinner you paid for in 2022 cost what it cost, and next year's rate move must
// not silently restate it.
function buildItem(data, b, existing) {
  const category = str(b.category, 40, existing ? existing.category : "misc");
  if (!CATEGORIES.includes(category)) return { error: "unknown category" };

  const date = b.date !== undefined ? b.date : existing && existing.date;
  if (!validDate(date)) return { error: "date must be YYYY-MM-DD" };

  // On create there is no `existing` to fall back to, so an omitted amount must
  // surface as a clean validation error rather than dereferencing null.
  const amount = b.amount !== undefined ? parseNum(b.amount, true) : existing ? existing.amount : null;
  if (amount === null) return { error: "amount is not a number" };
  if (amount < 0) return { error: "amount must not be negative" };

  const code = str(b.currency, 8, existing ? existing.currency : data.settings.baseCurrency);
  const cur = findCurrency(data, code);
  if (!cur) return { error: `unknown currency '${code}' — add it in settings first` };

  // fx: explicit value wins, else the item's old rate, else today's default for
  // that currency. Base currency is pinned to 1 — an editable base rate would
  // let the ledger disagree with itself.
  let fx;
  if (code === data.settings.baseCurrency) {
    fx = 1;
  } else if (b.fx !== undefined) {
    fx = parseNum(b.fx, true);
    if (fx === null) return { error: "fx rate is not a number" };
    if (fx <= 0) return { error: "fx rate must be greater than zero" };
  } else {
    fx = existing ? existing.fx : cur.rate;
  }

  // prepaid: explicit flag wins, else keep the existing one, else infer from
  // the category (flights/hotels/insurance are booked ahead by nature).
  const prepaid =
    b.prepaid !== undefined ? !!b.prepaid : existing ? existing.prepaid : PREPAID_BY_DEFAULT.has(category);

  // estimated: a planned figure rather than money that has actually moved.
  // Orthogonal to `prepaid` — "flights, prepaid, estimated" is a sensible line
  // meaning "I'll pay this before we go, and £400 is still a guess". The UI
  // reads actual-only for every historical aggregate, so a guess cannot become
  // spend by accident. Correcting a guess is just: fix the amount, clear the flag.
  const estimated =
    b.estimated !== undefined ? !!b.estimated : existing ? !!existing.estimated : false;

  return {
    rec: {
      id: existing ? existing.id : id(),
      date,
      category,
      amount: money(amount), // as spent (or as planned, when estimated)
      currency: code, // GBP | EUR | RON | anything in settings
      fx: fx, // base units per 1 unit of `currency`, frozen at entry
      amountBase: money(amount * fx), // denormalised so every chart sums one field
      note: str(b.note, 200, existing ? existing.note : ""),
      prepaid,
      estimated,
    },
  };
}

// Build a validated trip (without touching its items).
function buildTrip(data, b, existing) {
  const name = str(b.name, 80, existing && existing.name).trim();
  if (!name) return { error: "trip needs a name" };

  const start = b.start !== undefined ? b.start : existing && existing.start;
  const end = b.end !== undefined ? b.end : existing && existing.end;
  if (!validDate(start)) return { error: "start must be YYYY-MM-DD" };
  if (!validDate(end)) return { error: "end must be YYYY-MM-DD" };
  // A backwards trip silently produces negative nights, which then divides into
  // every per-day metric and quietly poisons the year's averages.
  if (end < start) return { error: "end date is before start date" };

  // Same guard as buildItem: `existing` is null on create, so every fall-back
  // has to cope with that rather than assuming an old record to copy from.
  const travellers = b.travellers !== undefined ? parseNum(b.travellers, true) : existing ? existing.travellers : null;
  if (travellers === null || travellers < 1) return { error: "travellers must be 1 or more" };

  const budget = b.budget !== undefined ? parseNum(b.budget, false) : existing ? existing.budget : 0;
  if (budget === null) return { error: "budget is not a number" };

  // rating is optional by design: a trip you haven't taken yet has no rating,
  // and forcing one would make future/booked trips unrepresentable.
  let rating = b.rating !== undefined ? b.rating : existing && existing.rating;
  if (rating === "" || rating === null || rating === undefined) {
    rating = null;
  } else {
    rating = parseNum(rating, true);
    if (rating === null || rating < 1 || rating > 5) return { error: "rating must be 1-5 or empty" };
  }

  const defaultCurrency = str(b.defaultCurrency, 8, existing ? existing.defaultCurrency : data.settings.baseCurrency);
  if (!findCurrency(data, defaultCurrency)) return { error: `unknown currency '${defaultCurrency}'` };

  return {
    rec: {
      id: existing ? existing.id : id(),
      name,
      country: str(b.country, 60, existing ? existing.country : ""),
      start,
      end,
      travellers: Math.round(travellers),
      purpose: str(b.purpose, 40, existing ? existing.purpose : "leisure"),
      rating,
      budget: money(budget),
      defaultCurrency, // pre-selects the currency on this trip's entry form
      note: str(b.note, 400, existing ? existing.note : ""),
      items: existing ? existing.items : [],
    },
  };
}

// Read & parse a JSON request body, with a sane size cap.
function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = ""; // accumulator
    req.on("data", (c) => {
      buf += c; // append chunk
      if (buf.length > 1e6) req.destroy(); // 1MB guard against abuse
    });
    req.on("end", () => {
      try {
        resolve(buf ? JSON.parse(buf) : {}); // parse or empty object
      } catch (e) {
        reject(e); // bad JSON
      }
    });
  });
}

// Standard JSON response helper.
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj); // serialize
  res.writeHead(code, { "Content-Type": "application/json" }); // headers
  res.end(body); // send
}

// Basic content-type map for static files.
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png", // PWA home-screen icons — without this they 404 and iOS falls back to a screenshot
  ".webmanifest": "application/manifest+json",
};

// --- Static file serving (the SPA + vendored Chart.js) ---
function serveStatic(req, res) {
  let rel = req.url.split("?")[0]; // strip query string
  if (rel === "/") rel = "/index.html"; // default document
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel)); // resolve safely
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJSON(res, 403, { error: "forbidden" }); // path traversal guard
  fs.readFile(filePath, (err, data) => {
    if (err) return sendJSON(res, 404, { error: "not found" }); // 404
    const ext = path.extname(filePath); // pick mime
    const headers = { "Content-Type": MIME[ext] || "application/octet-stream" };
    // index.html carries the entire app (markup, styles and every line of JS),
    // so a browser-cached copy after a redeploy means the UI and the API can
    // disagree about what fields exist. Revalidate it every time; the vendored
    // Chart.js is genuinely static and stays cacheable.
    if (ext === ".html") headers["Cache-Control"] = "no-cache";
    res.writeHead(200, headers);
    res.end(data); // send file
  });
}

// =============================================================
//  HTTP server / router
//  Routes are matched by hand (no framework). Paths that carry
//  ids are split rather than regexed, keeping the shape obvious:
//    /api/trips/<tripId>/items/<itemId>
//       0    1     2       3      4
// =============================================================
const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0]; // path without query

  // ---- API routes ----
  if (url.startsWith("/api/")) {
    try {
      const parts = url.split("/"); // ["", "api", "trips", ...]

      // GET /api/data  -> whole store
      if (url === "/api/data" && req.method === "GET") {
        return sendJSON(res, 200, readData());
      }

      // POST /api/settings -> update base currency + rate defaults
      if (url === "/api/settings" && req.method === "POST") {
        const b = await readBody(req); // { baseCurrency, currencies:[{code,symbol,rate}] }
        const data = readData();
        if (Array.isArray(b.currencies)) {
          const clean = [];
          for (const cur of b.currencies) {
            const code = str(cur.code, 8).toUpperCase().trim();
            if (!/^[A-Z]{2,8}$/.test(code)) return sendJSON(res, 400, { error: `bad currency code '${code}'` });
            const rate = parseNum(cur.rate, true);
            if (rate === null || rate <= 0) return sendJSON(res, 400, { error: `bad rate for ${code}` });
            clean.push({ code, symbol: str(cur.symbol, 4, code), rate });
          }
          const base = str(b.baseCurrency, 8, data.settings.baseCurrency);
          if (!clean.find((x) => x.code === base)) {
            return sendJSON(res, 400, { error: "base currency must be in the currency list" });
          }
          // The base currency's own rate is meaningless as anything but 1.
          clean.forEach((x) => {
            if (x.code === base) x.rate = 1;
          });
          data.settings.currencies = clean;
          data.settings.baseCurrency = base;
        }
        // Handled independently of the currency list so a settings POST can
        // carry either, or both.
        if (b.defaultTravellers !== undefined) {
          const n = parseNum(b.defaultTravellers, true);
          if (n === null || n < 1) return sendJSON(res, 400, { error: "default travellers must be 1 or more" });
          data.settings.defaultTravellers = Math.round(n);
        }
        writeData(data);
        return sendJSON(res, 200, data.settings);
      }

      // POST /api/rates/refresh -> pull today's rates from the ECB
      //
      // THE ONLY OUTBOUND REQUEST THIS APP EVER MAKES, and only when you press
      // the button — never on a timer, never on boot. It writes nothing but
      // settings.currencies[].rate, i.e. the DEFAULTS that pre-fill the entry
      // form. Every line item keeps the fx frozen onto it at entry time, so a
      // refresh can never restate a past trip.
      //
      // Frankfurter serves the European Central Bank's daily reference rates:
      // no API key, no account, no tracking, and it publishes one figure per
      // currency per day rather than anything tied to you.
      if (url === "/api/rates/refresh" && req.method === "POST") {
        const data = readData();
        const base = data.settings.baseCurrency;
        const want = (data.settings.currencies || []).map((c) => c.code).filter((c) => c !== base);
        if (!want.length) return sendJSON(res, 200, { ok: true, updated: [], skipped: [], note: "nothing to update" });

        let feed;
        try {
          // 10s ceiling: a hung request must not hold the button in "updating" forever.
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), 10000);
          const r = await fetch(
            `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}&to=${want.map(encodeURIComponent).join(",")}`,
            { signal: ctl.signal }
          );
          clearTimeout(timer);
          if (!r.ok) return sendJSON(res, 502, { error: `rate service returned ${r.status}` });
          feed = await r.json();
        } catch (e) {
          // Offline, DNS down, blocked egress — say so plainly. Stale rates that
          // look fresh are worse than an error, so nothing is written here.
          return sendJSON(res, 502, { error: "could not reach the rate service (" + (e.name === "AbortError" ? "timed out" : e.message) + ")" });
        }
        if (!feed || !feed.rates) return sendJSON(res, 502, { error: "rate service sent an unexpected response" });

        // Frankfurter gives "how many X per 1 base". This app stores the inverse
        // — base per 1 X — so every rate is flipped on the way in.
        const updated = [], skipped = [];
        for (const cur of data.settings.currencies) {
          if (cur.code === base) { cur.rate = 1; continue; } // base is always pinned
          const perBase = Number(feed.rates[cur.code]);
          if (!Number.isFinite(perBase) || perBase <= 0) { skipped.push(cur.code); continue; }
          const before = cur.rate;
          const raw = 1 / perBase;
          // Rounded to 2dp, so a refreshed rate reads like 0.85 rather than
          // 0.849979. Cheap for currencies near parity; for a currency whose
          // unit is worth little it throws away real precision (1 RON is
          // 0.170999 -> 0.17, about 0.6% light on every line entered after).
          let rounded = Math.round(raw * 100) / 100;
          // Guard: for a low-value currency 2dp rounds to ZERO — 1 HUF is worth
          // about 0.0021, which would become 0.00 and silently convert every
          // future line to nothing. Fall back to significant figures rather
          // than let a rate of zero reach the store.
          if (rounded <= 0) rounded = Number(raw.toPrecision(3));
          cur.rate = rounded;
          updated.push({ code: cur.code, from: before, to: cur.rate });
        }
        if (updated.length) writeData(data); // no snapshot burned when nothing changed
        return sendJSON(res, 200, { ok: true, base, date: feed.date, updated, skipped });
      }

      // POST /api/trips -> create a trip
      if (url === "/api/trips" && req.method === "POST") {
        const b = await readBody(req);
        const data = readData();
        const built = buildTrip(data, b, null);
        if (built.error) return sendJSON(res, 400, { error: built.error });
        data.trips.push(built.rec);
        writeData(data);
        return sendJSON(res, 200, built.rec);
      }

      // PUT /api/trips/:id  -> edit trip fields (items untouched)
      // DELETE /api/trips/:id -> delete trip AND its items
      if (parts[2] === "trips" && parts[3] && parts.length === 4) {
        const data = readData();
        const idx = data.trips.findIndex((t) => t.id === parts[3]);
        if (idx === -1) return sendJSON(res, 404, { error: "trip not found" });

        if (req.method === "PUT") {
          const b = await readBody(req);
          const built = buildTrip(data, b, data.trips[idx]);
          if (built.error) return sendJSON(res, 400, { error: built.error });
          data.trips[idx] = built.rec;
          writeData(data);
          return sendJSON(res, 200, built.rec);
        }
        if (req.method === "DELETE") {
          const gone = data.trips.splice(idx, 1)[0]; // items go with it — no orphans
          writeData(data);
          return sendJSON(res, 200, { removed: gone.id, items: gone.items.length });
        }
      }

      // POST /api/trips/:id/items -> add a line item
      if (parts[2] === "trips" && parts[4] === "items" && parts.length === 5 && req.method === "POST") {
        const b = await readBody(req);
        const data = readData();
        const trip = data.trips.find((t) => t.id === parts[3]);
        if (!trip) return sendJSON(res, 404, { error: "trip not found" });
        const built = buildItem(data, b, null);
        if (built.error) return sendJSON(res, 400, { error: built.error });
        trip.items.push(built.rec);
        trip.items.sort((a, z) => a.date.localeCompare(z.date)); // keep the ledger readable on disk
        writeData(data);
        return sendJSON(res, 200, built.rec);
      }

      // PUT/DELETE /api/trips/:id/items/:itemId
      if (parts[2] === "trips" && parts[4] === "items" && parts[5] && parts.length === 6) {
        const data = readData();
        const trip = data.trips.find((t) => t.id === parts[3]);
        if (!trip) return sendJSON(res, 404, { error: "trip not found" });
        const idx = trip.items.findIndex((i) => i.id === parts[5]);
        if (idx === -1) return sendJSON(res, 404, { error: "item not found" });

        if (req.method === "PUT") {
          const b = await readBody(req);
          const built = buildItem(data, b, trip.items[idx]); // same rules as create
          if (built.error) return sendJSON(res, 400, { error: built.error });
          trip.items[idx] = built.rec;
          trip.items.sort((a, z) => a.date.localeCompare(z.date));
          writeData(data);
          return sendJSON(res, 200, built.rec);
        }
        if (req.method === "DELETE") {
          trip.items.splice(idx, 1);
          writeData(data);
          return sendJSON(res, 200, { removed: parts[5] });
        }
      }

      // GET /api/backups -> newest-first list of the server-side rolling snapshots
      if (url === "/api/backups" && req.method === "GET") {
        const files = fs
          .readdirSync(BACKUP_DIR)
          .filter((f) => /^data-[0-9TZ-]+\.json$/.test(f)) // only our snapshot files
          .sort()
          .reverse(); // ISO stamps: lexical descending == newest first
        const out = files.map((f) => {
          const st = fs.statSync(path.join(BACKUP_DIR, f)); // size + mtime for the UI list
          return { name: f, size: st.size, mtime: st.mtime.toISOString() };
        });
        return sendJSON(res, 200, out);
      }

      // POST /api/restore { name } -> replace the store with one snapshot.
      // writeData() snapshots the CURRENT store first, so a restore is undoable.
      if (url === "/api/restore" && req.method === "POST") {
        const b = await readBody(req); // { name: "data-<stamp>.json" }
        const name = String(b.name || "");
        // Whitelist the exact snapshot filename shape — this is the path-traversal
        // guard: only digits/T/Z/hyphens may appear, so "../../data.json" can't match.
        if (!/^data-[0-9TZ-]+\.json$/.test(name)) return sendJSON(res, 400, { error: "bad snapshot name" });
        const file = path.join(BACKUP_DIR, name);
        if (!fs.existsSync(file)) return sendJSON(res, 404, { error: "snapshot not found" });
        let snap;
        try {
          snap = JSON.parse(fs.readFileSync(file, "utf8"));
        } catch (e) {
          return sendJSON(res, 400, { error: "snapshot file is not valid JSON" });
        }
        if (!validStore(snap)) return sendJSON(res, 400, { error: "not a valid snapshot" });
        writeData(normaliseStore(snap));
        return sendJSON(res, 200, { ok: true, restored: name });
      }

      // GET /api/export -> raw store (download/backup convenience)
      if (url === "/api/export" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Disposition": "attachment; filename=holiday-data.json",
        });
        return res.end(JSON.stringify(readData(), null, 2));
      }

      // POST /api/import -> replace the whole store from an uploaded JSON
      // (a snapshot of the previous store is kept automatically by writeData)
      if (url === "/api/import" && req.method === "POST") {
        const b = await readBody(req);
        if (!validStore(b)) return sendJSON(res, 400, { error: "not a valid holiday-tracker export" });
        const clean = normaliseStore(b);
        writeData(clean);
        return sendJSON(res, 200, {
          ok: true,
          trips: clean.trips.length,
          items: clean.trips.reduce((a, t) => a + t.items.length, 0),
        });
      }

      return sendJSON(res, 404, { error: "unknown endpoint" }); // unmatched API path
    } catch (e) {
      return sendJSON(res, 400, { error: e.message }); // bad request / JSON
    }
  }

  // ---- Static SPA ----
  return serveStatic(req, res);
});

// --- Shape validation for import/restore ---
// Deliberately shallow: enough to refuse a wrong file, not so strict that a
// hand-edited export with an extra field gets rejected.
function validStore(o) {
  return o && typeof o === "object" && Array.isArray(o.trips);
}

// Re-derive anything that could be stale or missing in an imported file, so a
// hand-edited export can't introduce items whose amountBase disagrees with
// amount × fx. The stored fx is trusted; the product is recomputed.
function normaliseStore(o) {
  const settings = { ...DEFAULT_DATA.settings, ...(o.settings || {}) };
  const trips = (o.trips || []).map((t) => ({
    ...t,
    items: (t.items || []).map((i) => {
      const fx = Number.isFinite(Number(i.fx)) && Number(i.fx) > 0 ? Number(i.fx) : 1;
      const amount = Number.isFinite(Number(i.amount)) ? Number(i.amount) : 0;
      // Coerce the flags: a hand-edited export carrying the string "false"
      // would otherwise be truthy and quietly turn a real payment into a guess.
      return {
        ...i, fx, amount: money(amount), amountBase: money(amount * fx),
        prepaid: i.prepaid === true || i.prepaid === "true",
        estimated: i.estimated === true || i.estimated === "true",
      };
    }),
  }));
  return { settings, trips };
}

ensureStore(); // make sure data files exist
server.listen(PORT, () => {
  console.log(`Holiday Tracker listening on http://0.0.0.0:${PORT}`); // boot log
  console.log(`Data dir: ${DATA_DIR}`); // where backups land
});
