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
`Cache-Control: no-cache` and fetched network-first the phone picks up changes on its next launch
— with a visible way out if it ever does not. No App Store, no review, no developer account.

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

## Signed out is not offline

The app sits behind an auth gate (Caddy forward-auth to Authelia). When that session expires the
server is perfectly healthy — it just answers every request with a redirect to a login page on
another origin, which a `fetch` is not allowed to read. It fails in exactly the way a pulled cable
does, so the app announced **Offline** with the container up, and the worker served the cached shell
for the navigation too: no reload, no address bar, no way back in. The app became a room with no
door.

One request tells the two apart. `redirect: "manual"` turns that redirect into an *answer* — an
opaque one, `type === "opaqueredirect"` — instead of an error, so a gate in front of the app is
visible where a dead network still throws. It is asked once, only when the store came out of the
cache or a write has already failed, and it decides between two strips that give opposite
instructions:

> **Signed out** — your session expired, so these are the trips as they were at Mon 09:42. Reading
> still works; adding or changing a line needs you signed in. **[Sign in]**

**Sign in** is a top-level navigation and can be nothing else: a fetch cannot follow the gate's
redirect, which is the whole reason the app could not say this in the first place. For that to
arrive anywhere, the worker had to stop swallowing the redirect — a navigation is fetched with
`redirect: "manual"`, so the gate's answer reaches the worker as an opaque redirect, and it is now
handed straight back to the browser instead of being replaced with the cached page.

A failed **write** says the same thing in its own words: *"Your session has expired — sign in again.
Nothing was saved."* rather than blaming the connection.

## Which version is running, and how to get out of a stale one

Settings names the build you are looking at — **Version 1.3.1**, in the desktop menu and in the
phone action sheet — next to a **Check for updates** button.

The number is not typed anywhere. The release tag becomes a Docker build argument
(`--build-arg APP_VERSION=${{ github.ref_name }}`), the image carries it as an environment variable,
and the server substitutes it into `__APP_VERSION__` in the page as it is served. So the version on
screen is the version of the image that answered, and it cannot drift from it the way a hand-edited
`package.json` can — that one said `1.0.0` through three releases.

The app asks `/api/version` (served `no-store`, because a cached answer about staleness is worthless)
on load and on every foreground re-read. If the server reports a newer build than the page was
stamped with, a bar appears across the top:

> Version 1.4.0 is ready. You are looking at 1.3.1, kept from an earlier visit. **Update now**

**Update now** is the escape hatch, and it is deliberately heavy-handed: it unregisters every service
worker, deletes every cache, and reloads with a cache-busting query. There is no reload button in an
installed PWA and no pull-to-refresh, so "clear it and start again" has to exist inside the app or it
does not exist at all.

Two bugs made that necessary, both only visible once the worker was actually tested rather than read:

- **`/` was pre-cached *and* served cache-first.** A first visit stored that copy of the page and
  every launch afterwards got it back, forever — the version check could never see a new build, and
  an update button would have reloaded straight into the same stale copy while hiding the banner,
  which is worse than no button. `/` is gone from `ASSETS`, and the document is network-first
  whether the request arrives as a navigation, `/`, or `/index.html`.
- **The first offline launch was empty.** The worker takes control only after the page has already
  fetched `/api/data`, so on a first visit nothing was ever written to the data cache. The install
  step now warms it.

## Launch screen

`theme-color`, and the manifest's `theme_color` and `background_color`, are all the app's own paper
(`#F7F5F2`) — iOS paints `background_color` before the first frame and tints the status bar area
with the theme colour, so anything else flashes on every launch. The self check asserts all three
still equal `--paper`.

The status bar style is `default`, not `black-translucent`: translucent draws the clock, battery
and signal in **white** and lets the page run underneath, which over a near-white app makes the
whole bar unreadable.

**The icon's file name carries a version** (`icon-180-v2.png`). Safari keeps home-screen icons in
its own store, keyed by URL and never revalidated, so a changed icon needs a changed file name to be
seen at all. The self check asserts the name still matches `icon-<size>-v<n>.png`.

That is worth having, but it was **not** why the phone showed a letter monogram instead of the app's
icon. The icon the rename was meant to dislodge had been a paper plane since the first release — so
iOS was never showing a stale icon, it had never managed to fetch one. **Everything on the domain is
behind the auth gate**, including `/manifest.json` and the icons, and the fetches that go looking for
them do not carry the browser's session: the manifest link needs `crossorigin="use-credentials"`
(fixed here), and the icon fetch made when you add to the Home Screen needs the reverse proxy to
serve `/icon-*.png` without the gate. **A gate in front of a PWA has to make an exception for the
handful of files that are read by something other than the signed-in page** — which is an argument
for the app owning its own front door, since a gate you do not own cannot make that exception
without editing someone else's config.

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
| **One thumb-sized row control** | Edit and delete on a ledger row were 21×24px against Apple's 44 minimum — two small targets side by side, one of them destructive, on the screen used most while away. Delete has moved into the edit dialog, so edit is now alone at the full 44×44 and the note column no longer pays for the second target. |
| **Dialogs hold still** | iOS moves the *visual* viewport to reveal a focused field and leaves the layout viewport where it was, so a dialog fixed to `inset:0` slides off to one side — labels clipped, form apparently drifting as you type. The dialog is pinned to `--vvtop` / `--vvleft` / `--vvw` / `--vvh`, all published from `visualViewport`, and the page behind is locked with `body.locked` so there is nothing for iOS to scroll. |
| **Form columns can shrink** | `.fgrid > div{min-width:0}`. A native date input has an intrinsic width, and a grid item defaults to `min-width:auto` — together they pushed the New trip dialog wider than the screen instead of fitting the column, which is what forced the sideways shift. The guard is **not** inside the phone media query: it was, and the browser had the same bug with more room to hide it. A self check brace-matches the media block to prove it stayed out. |
| **Date fields obey their column** | Safari gives `input[type=date]` an intrinsic width and a UA minimum and honours neither `width:100%` nor `min-width:0` until `appearance` is reset — so the field ran past the edge of the dialog, and a dialog wider than the screen is one you can drag sideways under your thumb while you type. Chrome measures the same markup at exactly its column width, so this one cannot be caught by looking at it in the wrong browser. `.modal` also scrolls on one axis only (`overflow-x:hidden`): too wide should be clipped and obvious, never draggable. |
| **The dates fence each other in** | Choosing a start sets `min` on the end picker and choosing an end sets `max` on the start picker — bound to `input` as well as `change`, because `change` on a typed date fires when the field is committed, too late to narrow the picker you are about to open. An end a new start has just invalidated is cleared rather than left for the server to refuse. Note that **iOS greys nothing out** in its wheel picker — the limit still holds, it simply is not drawn. |
| **An empty date field keeps its height** | With `appearance` reset and no value, there is no text to give the box a line and nothing else holding it open — on iOS it collapses to a thin slot beside full-height fields, which is what New trip looked like before a date was picked. A `min-height` floor on the field and on `::-webkit-date-and-time-value` holds it at the same height as every other input, filled or not. |
| **Dialogs clear the keyboard** | iOS does not shrink the layout viewport when the keyboard opens, so a centred dialog keeps its height and hides its own Save button. `--vvh` is published from `visualViewport` and the dialog is anchored to the top on phones, so it grows downwards and clamps to whatever is still visible — on a small phone it becomes scrollable rather than unreachable. |
| **Resumed sessions re-read** | An installed app has no address bar, no reload and no pull-to-refresh, so a session resumed from the app switcher would show whatever it loaded days ago — and, with the worker caching the store, possibly a copy of it. `visibilitychange` and `online` both trigger a re-read. |
| **`touch-action: manipulation`** | Removes double-tap-to-zoom and the 300ms tap delay that comes with it, without touching scrolling. |
| **`overscroll-behavior-y: none`** | Kills the rubber-band bounce past the top of the page. |
| **The action sheet rises from the bottom** | Settings opens as a sheet anchored to the bottom edge, Cancel nearest the thumb, and it scrolls itself rather than running off the top on a short phone. That needs `.modal-bg.sheetbg` — **two** classes: dialogs are re-anchored to the top on phones so the keyboard cannot bury their Save button, and with one class that rule won on line order alone and opened the sheet at the top of the screen with a third of the display empty beneath it. |
| **The tab bar survives the sheet** | The sheet stops above the bar rather than covering it, and the bar paints over the scrim (`body:has(#menuSheet.open) #viewNav`), so Settings reads as a drawer opened from the bar rather than a screen you left — and the other three tabs stay one press away. Scoped to the sheet on purpose: a **dialog** is modal and must not leave a live tab bar behind it. A tab press closes the sheet on its way, because a bar that is visible has to mean what it says. Where `:has()` is unsupported the bar simply dims as before. |
| **Filters live at the bottom too** | The year pills and the trip status chips sat at the top of the page — the one place a thumb cannot reach — and cost a row of height each before a single figure appeared. Below 700px they move into a capsule directly above the tab bar. They are the **same two elements**, moved, not copies: same markup, same handlers, same idea of what is selected. They share one slot because they are never both on screen (`#tabs` shows only on By year; `#tabs2` lives inside the trips view). The strip scrolls rather than wraps, so a decade of years stays one row. |
| **Two trips to a row** | A phone showed one card and a sliver of the next, which makes twelve trips a scroll rather than a glance. The grid is two columns below 700px and **nothing is dropped to fit**: status, purpose, country, dates, nights, total and the estimate note are all still on the card, set smaller. Five cards are fully visible where two were. The page title went with it — it repeated the tab you just pressed, and the count it carried is on the "All 12" chip — and so did its **+ New trip**, which was a second button for what the action sheet already offers. |
| **Actions in a fourth tab** | Save, Load, Restore, Currencies and New trip wrapped onto two rows and ate about a quarter of the screen before a single figure appeared. Below 700px the header row is hidden entirely and those five actions become a **Settings** tab in the bottom bar, opening an action sheet. Header height drops from roughly 152px to 56px. |

The desktop header is **untouched** — all five buttons render exactly as before above 700px.

The Settings tab is an **action, not a destination**. It deliberately carries no view id, so it can
never be selected as a view or shown as the active tab.

The action sheet is a **remote control, not a copy**: each row calls `.click()` on the real header
button, so every action still has exactly one implementation. A row marked `data-keepopen` does not
close the sheet — **Update rates online** is the one, because its result is reported back into the
row's own label and the header button that normally carries that feedback is not on screen at all. Adding a header action means adding
one row — never a second handler. The self check asserts that every header button appears in the
sheet, so forgetting a row fails the check rather than silently going missing on the phone.

Icons are inline SVG — no icon font, no CDN, so the app still renders with the internet down.
Adding a view means adding its icon too, or the tab renders as a bare label.

## Narrow screens reflow, they do not truncate

Ledger rows are two lines on every screen — name over category, amount over the as-paid figure —
grouped under a header that names the day, so no row repeats its own date. The row is the same
shape on a phone; only the edit target grows. Both tables (budget-vs-actual,
destinations) turn each row into a labelled block. **Nothing is hidden and nothing scrolls
sideways** — every field the desktop shows is present, only the arrangement changes. Table cells carry a `data-l` heading for exactly this reason; adding a column to either
table means adding its `data-l` too, or that cell renders as a bare number on a phone.
