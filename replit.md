# Desam WABot

## Overview
A multi-device WhatsApp bot built with Node.js using the Baileys v7 library. Features 520+ commands across AI, media downloading, group management, and more.

## Tech Stack
- **Runtime:** Node.js 20 (CommonJS)
- **WhatsApp:** @whiskeysockets/baileys v7
- **Database:** SQLite via better-sqlite3 (stored at `./data/bot.db`)
- **Web Server:** Express (pairing/status UI on port 5000)
- **Media:** fluent-ffmpeg, sharp, tesseract.js
- **AI:** OpenAI, Replicate

## Project Structure
- `index.js` — Main entry point
- `config.js` — Configuration loaded from `.env`
- `lib/` — Core modules (bot, connection, handler, database, server, etc.)
- `plugins/` — Command plugins organized by category
- `scripts/` — Maintenance/utility scripts
- `public/` — Static assets for the pairing web UI
- `data/` — SQLite database directory (created at runtime)

## Configuration
All settings in `.env`:
- `SESSION_ID` — WhatsApp auth payload (base64 JSON). Leave empty to use QR linking mode.
- `OWNER_NUMBER` — Bot owner's WhatsApp number
- `BOT_NAME`, `PREFIX`, `MODE`, `TIMEZONE` — Basic bot settings
- `SQLITE_PATH` — SQLite database path (default: `./data/bot.db`)

## Running
- `npm start` — Start the bot
- Web UI available at port 5000 (pairing dashboard + status API)

## Workflow
- **Start application** — `npm start`, port 5000 (webview)

## Deployment
- Target: VM (always-running process)
- Run: `node index.js`
