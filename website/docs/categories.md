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

Each category carries an emoji as well as a colour. That is not decoration: the
palette is at its practical limit — adjacent bands in the stacked chart sit at a
minimum distance of ~61 — so colour alone was carrying the whole load of telling
one category from another. The icon is a second, independent channel, and the
self check enforces that every category has one and that no two share it.

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
limit: adjacent colours in the stack sit at a minimum distance of ~61, and the remaining unused
hues all read as one of the eleven already in use.

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
