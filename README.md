# Holiday Tracker

[![App](https://github.com/horia-delicoti/holiday-tracker/actions/workflows/app.yml/badge.svg)](https://github.com/horia-delicoti/holiday-tracker/actions/workflows/app.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

✈️ **A self-hosted tracker for holiday spend** — trips, categorised line items, multi-currency
entry and per-year analytics. One Node process, no runtime dependencies, data as plain JSON.

## Why?

Holiday spend is scattered across bookings made months apart, cash in three currencies and a card
statement you read in January. This keeps one honest ledger per trip, and answers the two questions
that actually matter: *what will this trip cost*, and *what have I spent this year*.

It is built for one household, self-hosted, with no account, no signup and no third-party service
holding the data.

## Features

- **Trips and line items** — categorised spend with notes, per-trip travellers and budget
- **Multi-currency** — enter in what you actually paid, report in your base currency; the exchange
  rate is frozen onto each line at entry time so a later rate move can never restate a past trip
- **Estimates that never lie** — planned figures are tracked separately and excluded from every
  spend total, and a trip left with guesses after it ends is flagged until you correct it
- **Per-year analytics** — category share, cost per person per day, a trip timeline, spend so far
  against budget, destinations, budget variance
- **Installable on a phone** — ships a web manifest, so Add to Home Screen gives it its own icon,
  full-screen launch and persistent session
- **Opens offline** — a service worker caches the app and the last store it loaded, so the icon
  opens into a readable ledger with no network; writes still need the server and say so
- **Light, dark or auto** — a Dracula dark theme, picked in Settings and stored per device; the
  palette restates only colour tokens and the charts re-render from the same ones
- **Backups built in** — a rolling snapshot before every change, plus in-app export and restore

## Tech stack

Deliberately small. No framework, no build step, no runtime dependencies.

- **Backend** — Node 22, built-in modules only (`node:http`, `node:fs`). One file, `server.js`.
- **Frontend** — one `index.html`: vanilla JS, no bundler. Chart.js is vendored, not loaded from a
  CDN, so the app renders with the internet down.
- **Storage** — plain JSON files on a mounted volume. No database.
- **Packaging** — a `node:22-alpine` image published to GHCR.

## Quick start

```bash
cd app.web
node server.js        # → http://localhost:8100
```

Needs Node 18+. Creates a local `data/` store, which is git-ignored.

With Docker:

```bash
docker run -d --name holiday-tracker \
  -p 127.0.0.1:8100:8100 \
  -v /path/to/data:/data \
  -e TZ=Europe/London \
  ghcr.io/horia-delicoti/holiday-tracker:1
```

The app has **no authentication of its own**. It is designed to sit behind a reverse proxy and an
auth layer, bound to loopback. See the documentation before exposing it.

## Development

```bash
npm install          # dev tooling only — the app ships zero runtime dependencies
npm run hooks        # enable the pre-commit gate (once per clone)
npm run verify       # syntax + lint + self check + tests, about 1.5s
```

| Command | What it does |
| --- | --- |
| `npm run syntax` | `node --check` on the server and the self check |
| `npm run lint` | ESLint, including the inline `<script>` blocks inside `index.html` |
| `npm run selfcheck` | the invariant checks — the ones that guard against a wrong *number* |
| `npm test` | boots the real server on a throwaway data dir and drives it over HTTP |

`npm run hooks` points git at `.githooks/`, so `npm run verify` runs before every
commit. Bypass it deliberately with `git commit --no-verify` on a WIP branch.

See [`website/docs/development.md`](website/docs/development.md) for what each
check actually protects.

## Builds and releases

| | |
| --- | --- |
| Build status | [App workflow](https://github.com/horia-delicoti/holiday-tracker/actions/workflows/app.yml) |
| All runs | [Actions](https://github.com/horia-delicoti/holiday-tracker/actions) |
| Published images | [ghcr.io/horia-delicoti/holiday-tracker](https://github.com/horia-delicoti/holiday-tracker/pkgs/container/holiday-tracker) |
| Releases | [Tags](https://github.com/horia-delicoti/holiday-tracker/tags) |

Every push runs the checks and builds the image without publishing it. Pushing a
`v*` tag publishes a multi-arch image (`linux/amd64`, `linux/arm64`) to GHCR,
tagged `1.2.3`, `1.2` and `1`. There is deliberately no `latest`: deployments pin
an exact version, so an update is a decision and a rollback is the same decision
in reverse.

## Documentation

Full docs live in [`website/docs/`](website/docs/) — categories, the currency model, how estimates
work, the API, backups and how to install it on a phone.

## Repo layout

| | |
| --- | --- |
| `app.web/` | the application — this is what becomes the container image |
| `website/` | documentation and project site |
| `assets/` | screenshots |

## Privacy

This store is a precise record of **when your house was empty and where you were** — dates,
country, party size, going back years. That is more sensitive than the spend figures. Keep it
behind an auth layer, keep the data directory out of any public repo, and treat an exported
`holiday-data.json` the way you'd treat a bank statement.

## License

MIT — see [LICENSE](LICENSE).
