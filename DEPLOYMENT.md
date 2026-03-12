# Deployment Guide

This bot runs as a background worker and uses local SQLite only.

## Requirements

- Node.js 20 to 24
- A valid `SESSION_ID` or `SESSION_FILE`
- Writable local disk for `auth_state` and the SQLite file

## Environment

Provider-specific starter templates are available in `deploy/env/`:

- `deploy/env/vps.env.example`
- `deploy/env/render.env.example`
- `deploy/env/koyeb.env.example`
- `deploy/env/heroku.env.example`
- `deploy/env/do-worker.env.example`

Required:

```env
SESSION_ID=your_session_payload
```

Recommended:

```env
SQLITE_PATH=./data/bot.db
BOT_NAME=Desam Tech Bot
PREFIX=.
MODE=public
TIMEZONE=Africa/Accra
AUTO_READ=off
AUTO_STATUS_VIEW=off
ANTI_CALL=on
CHATBOT=off
DEVICE_MODE=Android
LOG_LEVEL=info
DEBUG_LOGS=off
```

## Preflight Check

Run this before deployment:

```bash
npm ci
npm run doctor
```

## Backup and Restore

Before upgrades or provider migrations, create a state backup:

```bash
npm run backup:state
```

Restore from a specific snapshot:

```bash
npm run restore:state -- --from backups/state-YYYY-MM-DDTHH-MM-SS-sssZ
```

If `--from` is omitted, the latest backup in `backups/` is used.

What is included:

- SQLite database (`SQLITE_PATH`, default `./data/bot.db`)
- `auth_state/`
- `data/` (full copy for safety)

## VPS Deployment

Use this when you control the machine and want the most reliable SQLite persistence.

```bash
git clone https://github.com/Theo-Sam/WABot.git
cd WABot
cp .env.example .env
npm ci
npm run doctor
npm run start:24x7
npm run save:24x7
```

Notes:

- Put the real `SESSION_ID` in `.env` before starting.
- Keep `data/` and `auth_state/` on persistent disk.
- Use `npm run logs:24x7` to inspect runtime logs.
- Run `npm run backup:state` before major updates.

## Docker Deployment

Build and run:

```bash
docker build -t desam-wabot .
docker run -d \
  --name desam-wabot \
  --restart unless-stopped \
  --env-file .env \
  -v wabot-data:/app/data \
  -v wabot-auth:/app/auth_state \
  desam-wabot
```

Notes:

- The volume mounts are important for SQLite and auth persistence.
- If you use a bind mount instead of named volumes, keep the directories writable.

## Render Deployment

Create a Worker service, not a Web service.

Build command:

```bash
npm ci --omit=dev
```

Start command:

```bash
npm start
```

Required environment variable:

```env
SESSION_ID=your_session_payload
```

Recommended variables:

- `SQLITE_PATH=./data/bot.db`
- `LOG_LEVEL=info`

Notes:

- `render.yaml` is already included.
- Render disks can be ephemeral depending on plan/setup. If you need SQLite persistence, attach persistent disk storage or use a VPS instead.

## Koyeb Deployment

Deploy as a worker service or from the included Dockerfile.

Suggested settings:

- Build command: `npm ci --omit=dev`
- Run command: `npm start`
- Instance type: persistent worker
- Environment: set `SESSION_ID` and `SQLITE_PATH`

Notes:

- SQLite persistence depends on the storage attached to the service.
- If no persistent volume is attached, expect resets after redeployments.

## Heroku Deployment

This app is configured as a worker using `Procfile` and `app.json`.

Commands:

```bash
heroku create your-app-name
heroku config:set SESSION_ID=your_session_payload
heroku config:set SQLITE_PATH=./data/bot.db
heroku ps:scale worker=1
```

Notes:

- Heroku dyno filesystem is ephemeral.
- SQLite may reset on dyno restart or redeploy, so Heroku is acceptable only if you accept that limitation.

## DigitalOcean App Platform

Deploy as a Worker component.

Settings:

- Source: this repository
- Build command: `npm ci --omit=dev`
- Run command: `npm start`
- Environment variables: `SESSION_ID`, `SQLITE_PATH`

Notes:

- App Platform may not preserve local SQLite between rebuilds.
- For reliable persistence, use a Droplet instead.

## DigitalOcean Droplet

This is equivalent to a VPS deployment and is a good SQLite target.

Suggested setup:

```bash
sudo apt update
sudo apt install -y git build-essential ffmpeg
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g pm2
```

Then deploy the app using the VPS steps above.

## Recommended Hosting Choice

Best fit for SQLite:

- VPS
- DigitalOcean Droplet
- Your own Docker host

Acceptable with persistence caveats:

- Render worker
- Koyeb worker
- Heroku worker
- DigitalOcean App Platform worker

## Troubleshooting

Bot exits immediately:

- Check `SESSION_ID`
- Run `npm run doctor`
- Inspect `npm run logs:24x7`

SQLite errors:

- Ensure the configured `SQLITE_PATH` directory is writable
- Ensure the host has enough disk space
- On Docker, ensure `/app/data` is mounted persistently

Repeated PM2 restarts:

- Usually means `SESSION_ID` is missing or invalid
- Confirm the environment loaded by PM2 matches your `.env`
