# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A self-hosted holiday spend tracker. One Node process, **no runtime dependencies**, data stored as
plain JSON. It is a personal financial ledger — correctness of the numbers matters more than
features, and a wrong number is worse than an error, because the user would act on it.

## Repo layout

| Path | What it is |
| --- | --- |
| `app.web/server.js` | the entire backend (~640 lines, Node built-ins only) |
| `app.web/public/index.html` | the entire frontend (~1800 lines, vanilla JS, no bundler) |
| `app.web/selfcheck.js` | invariant checks — **not** deployed, run before every commit |
| `app.web/Dockerfile` | the image; build context is `app.web/` |
| `website/docs/` | user documentation (Docusaurus later; plain markdown for now) |
| `assets/` | screenshots |
| `plans/` | migration and design plans — read before structural work |

Deployment lives in a **separate private Ansible repo**, not here. This repo publishes a versioned
image; the infra repo pins a version and runs it.

## Load these before working

- `plans/extract-app-from-ansible.md` — the migration this repo is the product of. Read it
  before changing the repo structure, the Dockerfile, or anything under `.github/workflows/`.
- `website/docs/` — the behaviour spec. If you change behaviour, the matching doc page changes in
  the same commit.

## Commands

```bash
cd app.web
node server.js        # run locally → http://localhost:8100 (Ctrl+C to stop)
node selfcheck.js     # invariant checks — no network, does not touch data
```

There is no build step, no test framework, no linter. `selfcheck.js` is the test suite.

## Invariants — do not break these

`selfcheck.js` guards the failures that are **silent**: they produce a wrong number rather than an
error. Run it after any edit to `server.js` or `index.html`.

1. **Categories are defined in two places that must agree** — `CATEGORIES` in `server.js` (the
   whitelist; anything else is a 400 on save) and `CATS` in `index.html` (label, colour, prepaid
   default). Adding one to the UI alone means every save of it is rejected.
2. **A guess never counts as spend.** `tripStats` splits every trip into `actual` (money that has
   moved), `planned` (estimates only) and `projected` (both). Every view reads exactly one of them.
   Never write a loop that sums raw `t.items` — that counts estimates as spend.
3. **`amountBase` is only read inside `tripStats`.** Reading it anywhere else bypasses display
   conversion and silently reports the wrong currency.
4. **As-paid wins.** A line paid €120 displays as exactly €120 in the EUR view. Never round-trip it
   through the base currency.
5. **Conversion never mutates stored data.** The ledger is stored in the base currency permanently;
   the currency dropdown changes only what is rendered.
6. **`fx` is frozen onto the line item at entry time.** Rates in Settings are defaults that pre-fill
   the form. Changing them must never restate a past trip.
7. **Every header action must be reachable from the phone action sheet.** Below 700px the header is
   hidden; each sheet row calls `.click()` on the real header button, so there is exactly one
   implementation. Adding a header action means adding one `<button data-do="theId">` row.
8. **Adjacent category colours must stay distinguishable** in a stacked bar. The palette is at its
   practical limit — adding a category is a design decision, not a one-liner.

## Conventions

- **No npm runtime dependencies.** `server.js` uses Node built-ins only. Chart.js is vendored in
  `public/` deliberately — no CDN, so the app renders with the internet down. Do not introduce a
  bundler, a framework, or a package that ships to production.
- **Strict money parsing.** `"1,200"` is a 400, never a silent `0`.
- **Unknown currency codes are rejected on save**, never auto-created.
- **Table cells carry a `data-l` heading** so narrow screens reflow into labelled blocks rather than
  scrolling sideways. Adding a column means adding its `data-l`.
- **Adding a view** means adding its icon to `ICONS` next to `VIEWS`, or the tab renders as a bare
  label.
- **One outbound request exists** — the rates refresh, on button press only, never on a timer or on
  boot. Do not add background network calls.

## Data

- Running `node server.js` locally creates `app.web/data/`. It is git-ignored. **Never commit it.**
- It is a real personal ledger: dates, destinations, party size, going back years.
- Screenshots for `assets/` or the docs must use a throwaway trip with invented figures.

## This is a public repo

- **No infrastructure details.** No hostnames, domains, ports, reverse-proxy or auth config, backup
  tooling, firewall posture or monitoring config. That belongs in the private infra repo. The app
  docs describe the app; they do not describe where it runs.
- **No real ledger data** in commits, docs, issues or screenshots.

## Releasing

1. edit in `app.web/`, test with `node server.js`
2. `node selfcheck.js`
3. commit and push — CI runs selfcheck
4. `git tag vX.Y.Z && git push --tags` → image published to
   `ghcr.io/horia-delicoti/holiday-tracker`
5. bump the version pin in the private infra repo and run the playbook

Deploying is a **deliberate version bump**, never a side effect of editing a file.

## Working style here

- Migrate before you improve. Do not mix a behaviour change and a structural change in one commit —
  if the totals move, it must be obvious which change did it.
- Prefer editing `server.js` / `index.html` in place over restructuring them. Their size is known
  and accepted; a refactor is a separate, deliberate decision.
- When behaviour changes, update `website/docs/` in the same commit.
