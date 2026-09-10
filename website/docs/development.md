---
sidebar_position: 10
---

# Development

## Setup

```bash
npm install       # development tooling only
npm run hooks     # enable the pre-commit gate (once per clone)
```

The app itself has no runtime dependencies. Everything installed here is a
`devDependency` — a linter and nothing else — and none of it reaches the image.

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

## The checks

`npm run verify` runs all four in about a second and a half, and is what the
pre-commit hook runs:

| | |
| --- | --- |
| `npm run syntax` | `node --check` — catches a typo before anything slower runs |
| `npm run lint` | ESLint, including the inline `<script>` blocks in `index.html` |
| `npm run selfcheck` | the invariants below |
| `npm test` | boots the server and drives the API |

The last two cover different failures and neither replaces the other. The self
check reads the *source* and never starts the app; the tests start the app and
know nothing about the source. A change that quietly corrupts a total should
fail the first; a change that stops the app booting should fail the second.

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

## Smoke tests

```bash
node --test app.web/test/*.test.js
```

Boots the real server against a throwaway temp directory and drives it over
HTTP. Zero dependencies — `node:test`, `node:assert` and global `fetch`.

It covers what the self check structurally cannot: that the app **starts**, and
that the validation rules the ledger rests on actually hold at the HTTP layer —
that `"1,200"` is a 400 rather than a silent zero, that an unknown category or
currency is refused, that a snapshot is written before every change.

## A note on formatters

The self check works by pattern-matching the source, so it is coupled to how
that source is *formatted*. Running a formatter such as Prettier over
`index.html` can break those patterns — or worse, make a check pass vacuously by
matching nothing. If you ever introduce one, re-run the self check immediately
and read its output rather than its exit code.

## Conventions

- **No npm runtime dependencies.** Do not introduce a bundler, a framework, or a package that ships
  to production.
- **No CDN.** Assets are vendored so the app renders with the internet down.
- **One outbound request exists** — the rates refresh, on button press only. Do not add background
  network calls.
- When behaviour changes, update the matching docs page in the same commit.
