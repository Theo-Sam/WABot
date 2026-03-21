# Desam WABot

A multi-device WhatsApp bot built with Node.js and Baileys v7, featuring 200+ commands. Includes a web-based pairing dashboard served via Express.

## Architecture

- **Runtime**: Node.js 20 (CommonJS)
- **WhatsApp**: `@whiskeysockets/baileys` v7 for multi-device WA connection
- **Database**: SQLite via `better-sqlite3` (stored at `./data/bot.db`)
- **Web UI**: Express server serving a static pairing dashboard (`public/index.html`)
- **Port**: 5000 on `0.0.0.0`

## Project Structure

- `index.js` — Entry point; initializes DB, starts Express server, starts bot, runs health watchdog
- `config.js` — Reads and resolves all config from `.env`
- `lib/` — Core modules:
  - `server.js` — Express web server (pairing UI + `/api/status`)
  - `bot.js` — Bot lifecycle (start/stop)
  - `botState.js` — Shared bot state (status, pairing code, etc.)
  - `database.js` — SQLite setup and helpers
  - `connection.js` / `connection-handler.js` — Baileys socket and event handling
  - `message-handler.js` — Incoming message routing
  - `handler.js` — Plugin command dispatch
  - `serialize.js` — Message serialization
  - `helpers.js`, `jid-utils.js`, `env-util.js`, `ai.js`, `endpoints.js` — Utilities
- `plugins/` — Command plugins (anime, converter, download, education, fun, games, group, main, media, misc, notes, owner, privacy, reactions, religious, search, sports, status, sticker)
- `public/` — Static web UI assets
- `scripts/` — Utility scripts (doctor, backup/restore state, verify status cache)
- `data/` — SQLite database directory (created at runtime)
- `auth_state/` — Baileys multi-device auth state (created at runtime)

## Configuration

Configured via `.env`:
- `SESSION_ID` — Base64 WhatsApp session payload (leave blank for QR/pairing code mode)
- `SQLITE_PATH` — SQLite database path (default: `./data/bot.db`)
- `BOT_NAME`, `PREFIX`, `MODE`, `OWNER_NUMBER`, `TIMEZONE`
- Various feature flags: `AUTO_READ`, `AUTO_STATUS_VIEW`, `CHATBOT`, `ANTI_CALL`, etc.

## Running

```
node index.js
```

The web dashboard is available at http://localhost:5000 — it shows the pairing code and bot connection status.

## Deployment

Configured for **VM** deployment (always-running, stateful process needed for WhatsApp session persistence).
Run command: `node index.js`
