---
sidebar_position: 3
---

# Categories

Every line item carries exactly one category. The list is fixed — it is a **global dimension**, so
every category appears in every year's stacked bar and in the dropdown on every line you ever
enter.

| Category | Prepaid by default | Note |
| --- | --- | --- |
| Flights | yes | |
| Accommodation | yes | |
| Restaurants | no | |
| Activities | no | |
| Ski | no | lift pass, instructor **and** hire — untick prepaid only if bundled with the chalet |
| Transport | no | metro, taxis, fuel, trains — car hire has its own category |
| Car rental | yes | normally booked and paid online weeks ahead |
| Shopping | no | |
| Medical | no | pharmacy, clinic; pre-travel vaccines should be ticked prepaid |
| Insurance/fees | yes | |
| Misc | no | |

## What "prepaid" means

Prepaid means the money left your account **before** the trip. It drives the committed-vs-on-the-
ground chart and the daily-burn chart.

It is only a default. The checkbox on the entry and edit rows always wins — a chalet-bundled lift
pass is prepaid even though Ski defaults to no, and a flight bought at the airport isn't.

## Why "Ski" is one category, not three

Lift pass, instructor and equipment hire all go in `ski`, with the specifics in each line's note
("6-day lift pass ×2", "Instructor, 3 half-days", "Boot + ski hire").

Ski costs are trip-type-specific — zero on every beach holiday and city break. Splitting them three
ways would add bands that are empty in most years, and the palette is already at its practical
limit: adjacent colours in the stack sit at a minimum distance of ~61, and the remaining unused
hues all read as one of the eleven already in use.

Per-trip detail is already covered by the ledger, line by line. Whole-trip comparison is already
covered by the trip's `purpose` field, so "what does a ski week cost versus a beach week" is
answerable without touching categories at all.

If you later want to trend *lessons vs pass vs hire across years*, that is a **second dimension**,
not more values on the first — an optional `subcategory` field on the item. It stays additive, and
it works for golf or diving without costing a colour.

## Adding a category

A category is defined in **two places that must agree**: the whitelist in the server (anything else
is a 400 on save) and the label/colour/prepaid-default table in the frontend. Adding one to the UI
alone means every save of it is rejected. The self check enforces that they match.
