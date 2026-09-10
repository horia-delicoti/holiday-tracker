// =============================================================
//  Holiday Tracker — smoke tests
//
//  Boots the real server against a throwaway data directory and drives it over
//  HTTP. Zero dependencies: node:test, node:assert and global fetch.
//
//      node --test app.web/test/
//
//  This covers the gap selfcheck.js cannot: selfcheck reads the source files
//  and checks invariants, but never starts the app. These tests catch "it
//  builds, it lints, and it does not boot" — and they exercise the validation
//  rules the ledger's integrity actually rests on.
// =============================================================

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PORT = 8199; // deliberately not 8100, so a dev server can stay running
const BASE = `http://127.0.0.1:${PORT}`;

let child;
let dataDir;

const api = (p, opts) => fetch(BASE + p, opts);
const post = (p, body) =>
  api(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "holiday-tracker-test-"));
  child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir },
    stdio: "ignore",
  });

  const deadline = Date.now() + 15000;
  for (;;) {
    try {
      const r = await fetch(`${BASE}/api/data`);
      if (r.ok) return;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) throw new Error("server did not start within 15s");
    await new Promise((r) => setTimeout(r, 100));
  }
});

after(() => {
  if (child) child.kill();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

// ------------------------------------------------------------------ it boots
test("serves the store", async () => {
  const r = await api("/api/data");
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.ok(Array.isArray(d.trips), "trips is an array");
  assert.ok(d.settings.baseCurrency, "a base currency is set");
});

test("serves the app shell", async () => {
  const r = await api("/");
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<html/i);
  // A stale UI after a redeploy is invisible until a number looks wrong.
  assert.match(r.headers.get("cache-control") || "", /no-cache/);
});

// ------------------------------------------------------------------- trips
test("creates a trip", async () => {
  const r = await post("/api/trips", { name: "Test trip", start: "2026-05-02", end: "2026-05-12", travellers: 2 });
  assert.equal(r.status, 200);
  const trip = await r.json();
  assert.ok(trip.id);
  assert.equal(trip.travellers, 2);
});

test("rejects a trip that ends before it starts", async () => {
  // Negative nights divide into every per-day metric and poison the averages.
  const r = await post("/api/trips", { name: "Backwards", start: "2026-05-12", end: "2026-05-02", travellers: 2 });
  assert.equal(r.status, 400);
});

test("rejects a nameless trip", async () => {
  const r = await post("/api/trips", { name: "", start: "2026-05-02", end: "2026-05-12", travellers: 2 });
  assert.equal(r.status, 400);
});

// ------------------------------------------------------------- line items
test("line item validation", async (t) => {
  const trip = await (await post("/api/trips", {
    name: "Items", start: "2026-05-02", end: "2026-05-12", travellers: 2,
  })).json();
  const items = `/api/trips/${trip.id}/items`;

  await t.test("accepts a valid line", async () => {
    const r = await post(items, { category: "restaurants", date: "2026-05-04", amount: 42.5 });
    assert.equal(r.status, 200);
    const item = await r.json();
    assert.equal(item.amount, 42.5);
    assert.equal(item.amountBase, 42.5); // base currency, fx pinned to 1
  });

  await t.test("REJECTS a thousands separator rather than silently reading 0", async () => {
    // The single most important parsing rule in the app: a ledger you cannot
    // trust is worse than no ledger, because you would still act on it.
    const r = await post(items, { category: "restaurants", date: "2026-05-04", amount: "1,200" });
    assert.equal(r.status, 400);
  });

  await t.test("rejects an unknown category", async () => {
    const r = await post(items, { category: "not-a-category", date: "2026-05-04", amount: 10 });
    assert.equal(r.status, 400);
  });

  await t.test("rejects an unknown currency rather than auto-creating it", async () => {
    // An item in a currency with no rate can never be converted — it would be
    // an invisible hole in every total.
    const r = await post(items, { category: "misc", date: "2026-05-04", amount: 10, currency: "ZZZ" });
    assert.equal(r.status, 400);
  });

  await t.test("rejects a negative amount", async () => {
    const r = await post(items, { category: "misc", date: "2026-05-04", amount: -5 });
    assert.equal(r.status, 400);
  });

  await t.test("rejects a malformed date", async () => {
    const r = await post(items, { category: "misc", date: "04/05/2026", amount: 10 });
    assert.equal(r.status, 400);
  });

  await t.test("defaults prepaid from the category", async () => {
    const r = await post(items, { category: "flights", date: "2026-05-02", amount: 200 });
    const item = await r.json();
    assert.equal(item.prepaid, true, "flights are prepaid by default");
  });
});

// ----------------------------------------------------------------- backups
test("snapshots before a change, so a mistake is undoable", async () => {
  const before = await (await api("/api/backups")).json();
  await post("/api/trips", { name: "Snapshot me", start: "2026-06-01", end: "2026-06-08", travellers: 1 });
  const after = await (await api("/api/backups")).json();
  assert.ok(after.length > before.length, "a snapshot was written");
});

test("exports the whole store", async () => {
  const r = await api("/api/export");
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.ok(Array.isArray(d.trips));
});

// -------------------------------------------------------------------- 404s
test("unknown api routes 404", async () => {
  const r = await api("/api/nope");
  assert.equal(r.status, 404);
});
