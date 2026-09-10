---
sidebar_position: 5
---

# Currencies

Everything is **reported** in the base currency but **entered** in whatever you actually paid.

```
entry form                     stored on the item                   charts
──────────                     ──────────────────                   ──────
amount   120.00                amount     120.00
currency EUR          ──────►  currency   "EUR"          ──────►    amountBase only
fx       0.85                  fx         0.85                      (£102.00)
                               amountBase 102.00
```

## The rate is frozen at entry time

`fx` is stored **on the line item**, not applied at render time. The rates in Settings are defaults
that pre-fill the form — changing them later never restates a past trip.

That is the whole point: the €80 dinner in 2022 cost what it cost, and a rate move three years
later must not silently rewrite it.

The base currency's own rate is pinned to `1` and cannot be edited; an editable base rate would let
the ledger disagree with itself. Unknown currency codes are rejected on save rather than
auto-created — an item in a currency with no rate could never be converted, and would be an
invisible hole in every total.

## Viewing in another currency

The ledger is stored in the base currency **permanently**. The currency dropdown in the header
changes only what is *rendered* — no stored figure is ever rewritten, which is what makes switching
non-destructive and reversible.

Conversion happens in exactly one place, so every KPI, chart, table and total follows
automatically. Two rules:

- **As-paid wins.** A line you actually paid €120 for shows as exactly €120 in the EUR view. Round-
  tripping it back through the base currency at a different rate would turn a fact you know into
  €118.42.
- **Each trip converts at its own rate**, derived from that trip's own spending: if the trip has
  lines paid in the display currency, their frozen `fx` *is* the rate that was in force. Only when
  a trip has no such line does it fall back to today's default — and that is flagged and called out
  in the banner when it happens.

Whenever display ≠ base, a banner says so plainly. That is not decoration: a converted figure that
gets screenshotted or half-remembered six months later is how this kind of feature starts lying.

## Base currency is locked once any trip exists

Every stored figure is denominated in it, and changing it would relabel all of them without
converting one — £100 silently becoming €100. The picker stays editable only while the ledger is
empty.

## Refreshing rates

**Rates update** in the header fetches today's rates from [Frankfurter](https://frankfurter.app)
(European Central Bank reference rates — no API key, no account, no tracking).

This is the **only** outbound request the app makes, and it happens **only when you press the
button** — never on a timer, never on boot, never in the background. It writes nothing but the rate
defaults that pre-fill the entry form. Every existing line keeps its frozen `fx`, so a refresh can
never restate a past trip.

The feed publishes one figure per currency per day and is asked only "what are today's rates" —
nothing about you or your travel is sent. On failure it reports the error and writes nothing; stale
rates that look fresh are worse than an error. The rest of the app works fine offline.

### Rounding

Refreshed rates are rounded to 2 decimals, so they read like `0.85` rather than `0.849979`. That is
free for a currency near parity and lossy for one whose unit is worth little:

| | exact | stored | error |
| --- | --- | --- | --- |
| EUR | 0.849979 | `0.85` | 0.00% |
| RON | 0.170999 | `0.17` | 0.58% — about £3.40 on a 3,400 lei bill |

Two decimals would round a low-value currency (1 HUF ≈ 0.0021) straight to `0.00`, converting every
future line in it to nothing. The refresh therefore falls back to 3 significant figures whenever
2dp would produce zero.

Hand-typed rates are not rounded — type `0.171` if you want the precision back. Hand-typed rates
always take precedence for lines already saved.
