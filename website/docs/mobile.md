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

It still needs a network path to wherever you're running it. There is no service worker, so no
offline entry.

## What makes it feel native rather than like a web page

| | |
| --- | --- |
| **Bottom tab bar** | Below 700px the view switcher leaves the top of the page and becomes a fixed bar with icons — the top of a phone screen is the furthest point from your thumb. Desktop keeps the top tabs. |
| **Safe areas** | The bar clears the home indicator and the page clears the notch, via `env(safe-area-inset-*)`. Those only resolve because the viewport meta carries `viewport-fit=cover` — remove it and the insets silently become 0. |
| **No zoom** | `maximum-scale=1, user-scalable=no`. iOS honours this in an installed PWA and deliberately ignores it in Safari, which is the right outcome either way. |
| **16px inputs on touch** | The real fix. iOS force-zooms the page whenever you focus a field whose text is under 16px, and never zooms back out — that, not pinching, is what made the app feel like a web page. Fixed at source so it holds even where `user-scalable=no` is ignored. |
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

Below 700px the ledger row folds from eight columns into two lines, and both tables
(budget-vs-actual, destinations) turn each row into a labelled block. **Nothing is hidden and
nothing scrolls sideways** — every field the desktop shows is present, only the arrangement
changes. Table cells carry a `data-l` heading for exactly this reason; adding a column to either
table means adding its `data-l` too, or that cell renders as a bare number on a phone.
