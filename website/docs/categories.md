---
sidebar_position: 3
---

# Categories

Every line item carries exactly one category. The list is fixed — it is a **global dimension**, so
every category appears in every year's stacked bar and in the dropdown on every line you ever
enter.

| | Category | Prepaid by default | Note |
| --- | --- | --- | --- |
| ✈️ | Flights | yes | |
| 🏨 | Stay | yes | |
| 🍽️ | Food | no | |
| 🎟️ | Activities | no | |
| 🏂 | Snowboard | no | lift pass, instructor **and** hire — untick prepaid only if bundled with the chalet |
| 🚆 | Transport | no | metro, taxis, fuel, trains, and car hire |
| 🛍️ | Shopping | no | |
| ❤️ | Health | no | pharmacy, clinic; pre-travel vaccines should be ticked prepaid |
| 🛡️ | Insurance | yes | |
| 📦 | Misc | no | |

Each category carries an emoji as well as a colour. That is not decoration: ten categories is past
what colour alone can reliably carry, so the icon is a second, independent channel. The self check
enforces that every category has one and that no two share it.

## How the colours are chosen

Not by eye. The ten hues are stepped in OKLCH at even intervals with alternating lightness, then
**measured**: what matters is not whether a colour is pleasant on its own but whether NEIGHBOURS IN
THE STACK stay apart, under normal vision and under each kind of colour-blindness.

Against the white card every adjacent pair clears the normal-vision floor (ΔE 15) and the closest
colour-blind pair is 6.7 (deuteranopia). The set these replaced had Snowboard sitting directly
beside Transport at 12.5 normal and 3.8 deutan — below both floors, which is exactly why those two
bands blurred into one.

Five of the ten sit under 3:1 contrast against white. That is allowed only because every chart
carries a legend and sits beside the breakdown list that names each category with its value —
remove either and the colours are doing work they cannot do alone.

The dark theme keeps the same hue identities (Flights is the same blue in both) stepped for the
`#323446` card instead. The self check runs the adjacency test on **both** palettes, because
lifting ten hues by eye is how two neighbours quietly become one colour at night.

## What "prepaid" means

Prepaid means the money left your account **before** the trip. It drives the committed-vs-on-the-
ground chart on the By year page.

It is only a default. The checkbox in the line dialog always wins — a chalet-bundled lift
pass is prepaid even though Snowboard defaults to no, and a flight bought at the airport isn't.

## Why "Snowboard" is one category, not three

Lift pass, instructor and equipment hire all go in Snowboard, with the specifics in each line's
note ("6-day lift pass ×2", "Instructor, 3 half-days", "Board + boot hire"). Its stored id is
still `ski` — renaming that would be a data migration for a word, so only the label changed.

Snow costs are trip-type-specific — zero on every beach holiday and city break. Splitting them three
ways would add bands that are empty in most years, and the palette is already at its practical
limit: thirteen categories could not be kept apart in a stacked bar at all.

Per-trip detail is already covered by the ledger, line by line. Whole-trip comparison is already
covered by the trip's `purpose` field, so "what does a snowboarding week cost versus a beach week" is
answerable without touching categories at all.

If you later want to trend *lessons vs pass vs hire across years*, that is a **second dimension**,
not more values on the first — an optional `subcategory` field on the item. It stays additive, and
it works for golf or diving without costing a colour.

## Adding a category

A category is defined in **two places that must agree**: the whitelist in the server (anything else
is a 400 on save) and the label/colour/prepaid-default table in the frontend. Adding one to the UI
alone means every save of it is rejected. The self check enforces that they match.
