# Desam Tech WhatsApp Bot v3.0

## Overview
A multi-device WhatsApp bot built with Node.js and Baileys v7. Supports 520+ commands across categories like AI, games, downloads, group management, and more. Includes a web pairing dashboard accessible via the preview pane.

## Architecture
- **Runtime**: Node.js 20 (CommonJS)
- **WhatsApp Library**: @whiskeysockets/baileys v7
- **Database**: SQLite via better-sqlite3 (stored at `./data/bot.db`)
- **Auth**: Persistent local auth state — pairing code flow via `sock.requestPairingCode()`
- **Web UI**: Express server on port 5000 with WhatsApp-themed pairing dashboard

## Project Structure
- `index.js` — Entry point; starts web server then bot
- `config.js` — Configuration loaded from `.env`
- `lib/bot.js` — Core Baileys socket logic, pairing, reconnection
- `lib/botState.js` — Shared state (status, pairing code, jid, commandCount)
- `lib/server.js` — Express web server, `/api/status` endpoint, serves `public/`
- `lib/handler.js` — 520-command dispatcher with plugin Map
- `lib/serialize.js` — Message serialization helpers
- `lib/database.js` — SQLite helper functions
- `plugins/` — Command plugins (ai, games, download, group, etc.)
- `public/index.html` — WhatsApp-themed pairing/status dashboard
- `auth_state/` — Persistent WhatsApp auth (do not delete unless re-pairing)
- `data/bot.db` — SQLite database (auto-created)

## Web Dashboard (port 5000)
The preview pane shows a live dashboard with states:
- **Loading** — bot is starting up
- **Show Code** — displays 8-digit pairing code with countdown timer
- **Connected** — shows bot name, prefix, number, command count
- **Disconnected** — shows reconnection status
Auto-refreshes every 3 seconds via `/api/status`.

## Auth Flow
1. If `auth_state/creds.json` exists → reuse (persistent across restarts)
2. If not → call `sock.requestPairingCode(BOT_PHONE_NUMBER)` → display code in UI
3. User enters code in WhatsApp → bot connects and saves creds for future use

## Configuration (`.env`)
| Variable | Default | Description |
|---|---|---|
| `SESSION_ID` | (optional) | Legacy: base64 JSON WhatsApp auth payload for first import |
| `BOT_NAME` | Desam Tech Bot | Display name |
| `PREFIX` | `.` | Command prefix |
| `MODE` | public | public or private |
| `OWNER_NUMBER` | (empty) | Owner's WhatsApp number |
| `TIMEZONE` | Africa/Accra | Timezone for date/time commands |
| `AUTO_READ` | off | Auto-read messages |
| `ANTI_CALL` | on | Auto-reject calls |
| `CHATBOT` | off | Chatbot mode |
| `BOT_PHONE_NUMBER` | 233557703453 | Phone number for pairing code request |

## Running
```bash
npm start
```
- **Start application** workflow runs `npm start`
- Web UI visible at the Replit preview pane (port 5000)
- Bot phone number: 233557703453

## Key Fixes Applied
- `commands` is a `Map` → use `.size` for count (not `Object.keys`)
- Express 5 wildcard route uses `app.use()` fallback (not `app.get('*', ...)`)
- Auth state persisted across restarts; only imported from SESSION_ID on first run
- `emitOwnEventsUnfiltered`, `receiveAllMessages`, `fireInitQueries` enabled
- Server runs on port 5000 to match Replit preview proxy
