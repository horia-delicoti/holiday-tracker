---
sidebar_position: 2
---

# Installation

## Requirements

Node 18+ to run from source, or Docker. There are **no runtime dependencies** — the server uses
Node built-ins only, and Chart.js is vendored rather than loaded from a CDN, so the app renders
with the internet down.

## Docker

```bash
docker run -d --name holiday-tracker \
  -p 127.0.0.1:8100:8100 \
  -v /path/to/data:/data \
  -e TZ=Europe/London \
  ghcr.io/horia-delicoti/holiday-tracker:1
```

With compose:

```yaml
services:
  holiday-tracker:
    image: ghcr.io/horia-delicoti/holiday-tracker:1
    container_name: holiday-tracker
    ports:
      - "127.0.0.1:8100:8100"
    volumes:
      - ./data:/data
    environment:
      - PORT=8100
      - DATA_DIR=/data
      - TZ=Europe/London
    restart: unless-stopped
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8100` | port the server listens on |
| `DATA_DIR` | `/data` | where the JSON store and its snapshots are written |
| `TZ` | system | keeps date pickers and backup timestamps local |

Everything else — base currency, exchange rates, default party size — is configured in the UI and
stored in the data directory, not in the environment. See [Settings](./settings).

## Security

**The app has no authentication of its own.** It is designed to run bound to loopback behind a
reverse proxy that provides auth, and that is the only supported way to expose it.

This matters more than it does for most self-hosted apps. The store is a precise record of when
your home was empty and where you were — dates, country, party size, going back years. That is more
sensitive than the spend figures. Treat an exported `holiday-data.json` the way you'd treat a bank
statement.

## Data

Everything lives in `DATA_DIR`: `data.json` plus a `backups/` directory of snapshots. Mount it as a
volume so it survives container rebuilds, and include it in whatever backs up the host — it is not
SQLite, so it is backed up as a plain directory with no staging step. See [Backups](./backups).

## Updating

Images are published per release. Pin an exact version rather than tracking a moving tag, so an
update is a deliberate act and a rollback is the same act in reverse.
