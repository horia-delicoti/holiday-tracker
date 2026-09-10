---
sidebar_position: 7
---

# Settings

Everything under ⚙ **Currencies** is stored in the data file and edited in the UI, not in the
source or the environment.

| Setting | Default | Used by |
| --- | --- | --- |
| `baseCurrency` | `GBP` | every reported figure |
| `currencies[]` | GBP / EUR / RON | the entry form's rate pre-fill |
| `defaultTravellers` | `2` | pre-fills a new trip's travellers field and the overview estimator's party size |

`defaultTravellers` is **only** a pre-fill. Every trip stores its own count, so changing it never
alters a trip already recorded.

Missing keys are backfilled on read, so a store written before a setting existed picks up the
default automatically.

`baseCurrency` is locked once any trip exists — see [Currencies](./currencies).
