---
sidebar_position: 6
title: On your phone
---

# On your phone

The app ships a web manifest, so iOS and Android can install it. In Safari: **Share → Add to Home
Screen**. You get its own icon, a full-screen launch with no browser chrome, its own app-switcher
card, and its own cookie jar — so your session survives between launches instead of asking you to
log in each time.

It is the **same app**, not a second one. One codebase, one deployment, one data store. Updating
the deployment updates the phone and the desktop together, and because the page is served
`Cache-Control: no-cache` the phone picks up changes on its next launch. No App Store, no review,
no developer account.

## Offline

A service worker (`public/sw.js`) caches the app shell on install and keeps a copy of the last
store it loaded, so the icon opens into a working app with no network: your trips, charts and
ledger are all there to read. A strip at the top says so and names the time the figures are from,
because showing a cached store without saying so would make stale numbers look live.

**Reading works offline. Writing does not, and is never faked.** A line added with no connection
fails with *"No connection to the server — nothing was saved"*, rather than being queued. A ledger
that silently accepted money it had not stored would be worse than one that refused it.

Three things are worth knowing:

- **It needs HTTPS.** Service workers only register on a secure origin (`localhost` excepted), so
  reaching the app over plain `http://<ip>:8100` gets you no offline mode at all, silently. Behind
  a TLS reverse proxy it works.
- **The app is fetched network-first** with a 2.5 second deadline, so a redeploy is picked up as
  long as the server answers, and a dead server falls back to the cached copy immediately. Only
  Chart.js and the icons are served cache-first — they cannot change within a version.
- **`VERSION` in `sw.js` is the cache key.** Bump it when the shell changes; old caches are dropped
  on activate. The self check verifies that every file the worker pre-caches actually exists, since
  `addAll()` is atomic — one wrong path and the install rejects, leaving no offline mode and nothing
  on screen to say so.

## Launch screen

`theme-color`, and the manifest's `theme_color` and `background_color`, are all the app's own paper
(`#F7F5F2`) — iOS paints `background_color` before the first frame and tints the status bar area
with the theme colour, so anything else flashes on every launch. The self check asserts all three
still equal `--paper`.

The status bar style is `default`, not `black-translucent`: translucent draws the clock, battery
and signal in **white** and lets the page run underneath, which over a near-white app makes the
whole bar unreadable.

The apple-touch-icon is a **full-bleed, fully opaque** square. iOS applies its own rounded mask and
composites any transparency against black, so a pre-rounded source with transparent corners shows
dark fringes inside the mask.

## Appearance: light, dark, or follow the device

Three modes — **Light**, **Dark** and **Auto** — reachable two ways, both built from one list so
they cannot drift apart. On desktop a single button beside the settings cog shows the mode you are
in and cycles to the next on each press (`Light → Dark → Auto → Light`), naming its destination in
the tooltip. On a phone the action sheet lays all three out as a segmented control on its own row:
there is space for it, the targets are bigger, and it saves cycling twice to reach the one you want.

The choice is stored **per device**, not in the trip file: wanting the phone dark at night and the
laptop light in the morning is the normal case, and a synced theme would fight that.

Only ever `light` or `dark` lands on the `<html>` element — **auto** is resolved to one of them in a
short script in the `<head>`, before anything paints. That buys two things: the stylesheet carries a
**single** dark block rather than restating forty tokens once for a media query and again for an
attribute selector, and a manual choice beats the system setting in *both* directions rather than
only one. It also means no flash of the wrong theme on launch, which is invisible in a light browser
and glaring on a dark phone — so the self check asserts that script is still there.

## Dark mode is Dracula

The ground (`#282A36`) and the ten category hues are Dracula's own — cyan, green, orange, yellow,
blue, purple, coral, pink. Chosen over a dimmed copy of the paper palette because after dark the app
is allowed to be its own thing.

Only tokens are restated. Not one component rule is repeated, which is what stops the two themes
drifting apart, and it is only possible because every hard-coded colour was first promoted to a
semantic token — `--on-ink` and `--on-accent` among them. Those two exist because **anything sitting
on a colour has to flip**: `--ink` is nearly white in dark mode, so "white on ink" would have been
white on white, and Dracula's green is bright enough that a white label on it falls to 1.4:1 against
11.5:1 for a dark one.

Adjacent category hues stay **75** apart (the light set manages 81; the floor is 55) and every one
clears 3:1 against a card. The self check runs that distance test on **both** palettes, plus every
purpose token in each — lifting ten hues by eye is exactly how two neighbours quietly become one
colour at night.

**The charts need no dark branch at all.** Every one reads these same variables through `c()` when
it is built, so a theme change only has to re-render — which is all the listener does.

`color-scheme` is pinned per theme, or a dark app still opens a blinding white date picker. The
`theme-color` meta is read back from `--paper` rather than repeated as a hex, so the browser chrome
follows the palette automatically if it is ever retuned.

One deliberate gap: the **launch screen stays light**, because a web manifest has only one
`background_color` and no way to vary it by scheme. A dark-mode launch shows one pale frame before
the app draws.

## What makes it feel native rather than like a web page

| | |
| --- | --- |
| **Bottom tab bar** | Below 700px the view switcher leaves the top of the page and becomes a fixed bar with icons — the top of a phone screen is the furthest point from your thumb. Desktop keeps the top tabs. |
| **Safe areas** | The bar clears the home indicator and the page clears the notch, via `env(safe-area-inset-*)`. Those only resolve because the viewport meta carries `viewport-fit=cover` — remove it and the insets silently become 0. |
| **No zoom** | `maximum-scale=1, user-scalable=no`. iOS honours this in an installed PWA and deliberately ignores it in Safari, which is the right outcome either way. |
| **16px inputs on touch** | The real fix. iOS force-zooms the page whenever you focus a field whose text is under 16px, and never zooms back out — that, not pinching, is what made the app feel like a web page. Fixed at source so it holds even where `user-scalable=no` is ignored. |
| **The right keyboard** | `inputmode="decimal"` on money fields and `numeric` on counts. `type="number"` alone gets you the punctuation keyboard; inputmode is what asks for the big keypad you want when logging a bill. |
| **Thumb-sized row controls** | Edit and delete on a ledger row were 21×24px against Apple's 44 minimum — two small targets side by side, one of them destructive, on the screen used most while away. They are 36×44 on touch: the glyphs are unchanged, only the box around them grew, and the note column keeps enough width to stay readable. |
| **Dialogs clear the keyboard** | iOS does not shrink the layout viewport when the keyboard opens, so a centred dialog keeps its height and hides its own Save button. `--vvh` is published from `visualViewport` and the dialog is anchored to the top on phones, so it grows downwards and clamps to whatever is still visible — on a small phone it becomes scrollable rather than unreachable. |
| **Resumed sessions re-read** | An installed app has no address bar, no reload and no pull-to-refresh, so a session resumed from the app switcher would show whatever it loaded days ago — and, with the worker caching the store, possibly a copy of it. `visibilitychange` and `online` both trigger a re-read. |
| **`touch-action: manipulation`** | Removes double-tap-to-zoom and the 300ms tap delay that comes with it, without touching scrolling. |
| **`overscroll-behavior-y: none`** | Kills the rubber-band bounce past the top of the page. |
| **Actions in a fourth tab** | Save, Load, Restore, Currencies and New trip wrapped onto two rows and ate about a quarter of the screen before a single figure appeared. Below 700px the header row is hidden entirely and those five actions become a **Settings** tab in the bottom bar, opening an action sheet. Header height drops from roughly 152px to 56px. |

The desktop header is **untouched** — all five buttons render exactly as before above 700px.

The Settings tab is an **action, not a destination**. It deliberately carries no view id, so it can
never be selected as a view or shown as the active tab.

The action sheet is a **remote control, not a copy**: each row calls `.click()` on the real header
button, so every action still has exactly one implementation. Adding a header action means adding
one row — never a second handler. The self check asserts that every header button appears in the
sheet, so forgetting a row fails the check rather than silently going missing on the phone.

Icons are inline SVG — no icon font, no CDN, so the app still renders with the internet down.
Adding a view means adding its icon too, or the tab renders as a bare label.

## Narrow screens reflow, they do not truncate

Ledger rows are two lines on every screen — name over category, amount over the as-paid figure —
grouped under a header that names the day, so no row repeats its own date. The row is the same
shape on a phone; only the edit and delete targets grow. Both tables (budget-vs-actual,
destinations) turn each row into a labelled block. **Nothing is hidden and nothing scrolls
sideways** — every field the desktop shows is present, only the arrangement changes. Table cells carry a `data-l` heading for exactly this reason; adding a column to either
table means adding its `data-l` too, or that cell renders as a bare number on a phone.
