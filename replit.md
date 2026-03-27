# Desam WABot

A comprehensive multi-device WhatsApp bot built with Node.js and the Baileys library, featuring 500+ commands across 19+ categories.

## Project Structure

- `index.js` — Main entry point, starts the bot, health watchdog, and web server
- `config.js` — Configuration loader from environment variables
- `lib/` — Core logic modules:
  - `bot.js` — WhatsApp connection management
  - `handler.js` — Message processing and plugin loader
  - `database.js` — SQLite interface
  - `server.js` — Express web server (pairing UI on port 5000)
  - `botState.js` — Shared bot state
  - `serialize.js` — Message normalizer
- `plugins/` — Feature-specific command modules (ai, download, group, etc.)
- `public/` — Static frontend for the pairing UI
- `auth_state/` — WhatsApp session credentials (auto-generated on first run)
- `data/` — SQLite database (`bot.db`)
- `bin/` — Local binaries (yt-dlp)
- `scripts/` — Maintenance utilities

## Technologies

- **Runtime:** Node.js 20+
- **WhatsApp:** @whiskeysockets/baileys v7
- **Database:** better-sqlite3 (SQLite)
- **Web Server:** Express on port 5000
- **Media:** fluent-ffmpeg, sharp, yt-dlp
- **AI:** OpenAI, Google Gemini, Claude, DeepSeek integrations

## Running the Bot

```
node index.js
```

The bot starts an Express server on port 5000 with a pairing UI. On first run (no session), it prints a QR code and opens the pairing UI so you can link your WhatsApp account.

## Environment Variables

All configuration is done via environment variables (stored in Replit Secrets/Env):

| Variable | Description | Default |
|---|---|---|
| `SESSION_ID` | WhatsApp auth payload for session restore | empty (QR mode) |
| `OWNER_NUMBER` | Bot owner's phone number (full intl format) | empty |
| `BOT_NAME` | Display name of the bot | Desam WABot |
| `PREFIX` | Command prefix character | `.` |
| `MODE` | `public` or `private` | public |
| `TIMEZONE` | Bot timezone | Africa/Accra |
| `SQLITE_PATH` | Path to SQLite database | ./data/bot.db |

Optional API keys (for extended commands): `TENOR_API_KEY`, `GIPHY_API_KEY`, `REMOVEBG_API_KEY`, `OMDB_API_KEY`, etc.

## Key Notes

- The `auth_state/` directory persists WhatsApp credentials across restarts.
- The health watchdog in `index.js` auto-attempts reconnection if the bot disconnects.
- `YOUTUBE_DL_SKIP_PYTHON_CHECK=1` is set as an env var to allow youtube-dl-exec installation without Python.
- The workflow uses `node index.js` with port 5000 (webview output).
