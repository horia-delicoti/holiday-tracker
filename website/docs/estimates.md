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
| `actual` | real money that has moved | lifetime spend, year totals, cost per person per day, category share, destinations, value map, the estimator, currency mix, the trip timeline, spend so far this year |
| `planned` | estimated lines only | the planning callouts |
| `projected` | `actual + planned` | trip KPIs, budget variance, the burn bar in the year table |

There is no fourth option and nothing sums "whatever is there". That is what stops a number
invented in a hotel lobby from becoming part of your yearly spend.

The trip page therefore reports **projected** while the year page reports **actual**, so the same
trip can show different category totals in the two places. That is deliberate — the trip page
answers *"what will this cost"*, the year page answers *"what have I spent"* — and both label it.

## A night belongs to exactly one trip

The same principle applies to the *denominator*. Book a week in Thasos in the middle of six weeks
in Bucharest and both trips cover those days — so counting each trip's own span would report 49
nights away inside a 42-night window, and quietly understate every per-night figure by inflating
what it divides by.

Overlapping days go to the **shorter** trip, because that is where you actually were. The longer
stay keeps its real dates everywhere they are shown — the header, the trips card, the year table,
the trip timeline, where its bar simply breaks around the gap — and loses those nights only from
its counts, saying so in as many words: *"7 nights of this stay were spent in Thasos, and count
there instead."*

No money moves. Every line item stays on the trip it was logged against, so totals, breakdowns and
budget variance are untouched; only nights, person-days and the figures derived from them change.
Nothing is stored: the overlap is worked out at render time, so fixing a date on either trip
immediately corrects both.

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
