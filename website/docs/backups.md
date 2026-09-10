---
sidebar_position: 9
---

# Backups

## Automatic snapshots

A snapshot is written **before every change**, into `backups/` inside the data directory. The
newest 30 are kept.

In-app **Restore** lists them and restores any one. Restoring snapshots the current state first, so
a restore is itself undoable — including an accidental trip deletion.

## Manual export and import

- **Save** downloads a JSON backup of the whole store
- **Load** restores one

An exported `holiday-data.json` contains your entire travel history — dates, destinations, party
size, going back years. Treat it the way you'd treat a bank statement.

## Backing up the host

The whole data directory is the backup unit. It is plain JSON, not SQLite, so it needs no staging
or VACUUM step — copy the directory and you have everything, including the snapshot history.
