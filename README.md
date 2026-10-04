# StandRise Bothost backend

Node.js + Express + better-sqlite3.

## Environment

```env
BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
FRONTEND_ORIGIN=https://standrisereworkvrs.netlify.app
PORT=3000
DB_PATH=./standrise.sqlite
```

## Start

```bash
npm install
npm start
```

Health check:

`https://bot-1791109324-4239-skyred123.bothost.tech/api/health`

Backend endpoints:

- `GET /api/health`
- `GET /api/bootstrap`
- `POST /api/register`
- `PUT /api/state`

All app endpoints except health require a valid Telegram `initData` sent in `X-Telegram-Init-Data`.
