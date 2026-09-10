---
sidebar_position: 10
---

# Development

## Running locally

```bash
cd app.web
node server.js        # → http://localhost:8100   (Ctrl+C to stop)
```

Needs Node 18+. There is no build step, no bundler and no install — the server uses Node built-ins
only, and Chart.js is vendored in `public/`.

Running here creates a local `data/` store, which is git-ignored. **Never commit it** — it is a
real personal ledger.

Edit `server.js` or `public/index.html`, restart or refresh, and the same files are what gets built
into the image.

## Self check

```bash
cd app.web && node selfcheck.js
```

Reads the two source files and exercises the pure functions out of the page. It touches neither the
network nor your data. It is not deployed — the image excludes it.

Run it after editing `server.js` or `public/index.html`. It guards the invariants that fail
*silently*, by producing a wrong number rather than an error:

- the category list and prepaid defaults agreeing across both files
- adjacent category colours staying distinguishable in a stacked bar
- the stored base amount never being read outside the stats function, which would bypass display
  conversion
- no per-line loop summing raw items, which would count estimates as spend
- every header action being reachable from the phone action sheet
- as-paid winning over a round-trip conversion, and conversion never mutating stored data

This is the test suite. There is no framework.

## Conventions

- **No npm runtime dependencies.** Do not introduce a bundler, a framework, or a package that ships
  to production.
- **No CDN.** Assets are vendored so the app renders with the internet down.
- **One outbound request exists** — the rates refresh, on button press only. Do not add background
  network calls.
- When behaviour changes, update the matching docs page in the same commit.
