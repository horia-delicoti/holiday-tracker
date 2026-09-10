---
sidebar_position: 4
---

# Estimates

Any line can be flagged **estimate** — a planned figure rather than money that has moved. Tick the
box, add your guesses, and correct each one as you book it: open ✎, type the real amount, untick.

`estimated` and `prepaid` are orthogonal. *"Flights, £400, prepaid, estimated"* is a sensible line
meaning "I'll pay this before we go, and £400 is still a guess".

## The rule that keeps the history honest

**A guess never counts as spend.** Every trip is split three ways, and each view reads exactly one
of them:

| Figure | Meaning | Read by |
| --- | --- | --- |
| `actual` | real money that has moved | lifetime spend, year totals, cost per person per day, category share, destinations, value map, the estimator, currency mix, prepaid vs on-the-ground, daily burn |
| `planned` | estimated lines only | the planning callouts |
| `projected` | `actual + planned` | trip KPIs, budget variance, the burn bar in the year table |

There is no fourth option and nothing sums "whatever is there". That is what stops a number
invented in a hotel lobby from becoming part of your yearly spend.

The trip page therefore reports **projected** while the year page reports **actual**, so the same
trip can show different category totals in the two places. That is deliberate — the trip page
answers *"what will this cost"*, the year page answers *"what have I spent"* — and both label it.

## Correcting a guess is not optional

A trip whose end date has passed while it still holds estimated lines is **stale**, and the app
says so in a strip above the nav, on every view, naming each trip and linking straight to it.

Because estimates are excluded from every total, a trip left with guesses on it is silently
*under*-reporting your spend. The strip is the only thing standing between you and a quietly wrong
yearly figure, so it is deliberately hard to miss.

To correct a line: open the trip, hit ✎, type the real amount, untick **estimate**, save.

## Estimates are overwritten, not archived

Correcting a line loses the original guess by design. If you later want estimate-accuracy analysis
("you underestimate restaurants by 34%"), adding an archive field then still works — you would just
start accumulating from that point.
