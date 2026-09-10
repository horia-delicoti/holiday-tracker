---
sidebar_position: 8
---

# API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/data` | whole store |
| `POST` | `/api/settings` | base currency + rate defaults |
| `POST` | `/api/trips` | create trip |
| `PUT` `DELETE` | `/api/trips/:id` | edit / delete trip (delete takes its items) |
| `POST` | `/api/trips/:id/items` | add line item |
| `PUT` `DELETE` | `/api/trips/:id/items/:itemId` | edit / delete line item |
| `GET` | `/api/backups` | list rolling snapshots |
| `POST` | `/api/restore` | restore a snapshot |
| `GET` | `/api/export` | download the store |
| `POST` | `/api/import` | replace the store |

## Strict parsing

Money fields are parsed strictly: `"1,200"` is a **400**, never a silent `0`. A ledger you can't
trust is worse than no ledger, because you'd still act on the numbers.

Unknown currency codes are rejected on save rather than auto-created, and categories outside the
whitelist are a 400.

## Authentication

There is none. The API is unauthenticated by design and expects to sit behind a reverse proxy that
provides auth — see [Installation](./install).
