# Desam Tech WhatsApp Bot

## Overview
A multi-device WhatsApp bot built with Node.js and Baileys v7. It supports 200+ commands across categories like AI, games, downloads, group management, and more.

## Architecture
- **Runtime**: Node.js 20 (CommonJS)
- **WhatsApp Library**: @whiskeysockets/baileys v7
- **Database**: SQLite via better-sqlite3 (stored at `./data/bot.db`)
- **Auth**: External SESSION_ID (base64 JSON or raw JSON) — QR login is disabled

## Project Structure
- `index.js` — Entry point, bootstraps the bot
- `config.js` — Configuration loaded from `.env`
- `lib/` — Core modules (bot, database, handlers, helpers)
- `plugins/` — Command plugins (ai, games, download, group, etc.)
- `scripts/` — Utility scripts (backup, restore, doctor)
- `auth_state/` — WhatsApp auth state (auto-generated, not committed)
- `data/bot.db` — SQLite database (auto-created)

## Configuration (`.env`)
| Variable | Default | Description |
|---|---|---|
| `SESSION_ID` | (required) | WhatsApp auth payload (base64 JSON) |
| `BOT_NAME` | Desam Tech Bot | Display name |
| `PREFIX` | `.` | Command prefix |
| `MODE` | public | public or private |
| `OWNER_NUMBER` | (empty) | Owner's WhatsApp number |
| `TIMEZONE` | Africa/Accra | Timezone for date/time commands |
| `AUTO_READ` | off | Auto-read messages |
| `ANTI_CALL` | on | Auto-reject calls |
| `CHATBOT` | off | Chatbot mode |

## Running
```bash
npm start
```

## Workflow
- **Start application** — `npm start` (console output)
- The bot will fail on startup if `SESSION_ID` is not set in `.env`

## Getting a SESSION_ID
You need to generate a WhatsApp session using an external Baileys session generator and paste the base64-encoded JSON into `SESSION_ID` in `.env`.
