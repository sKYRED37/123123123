# Topoff Ranked — Bothost backend

GitHub repository must contain these files at the repository root:
- server.js
- package.json
- .env.example (template only; do NOT put BOT_TOKEN into GitHub)
- README.md

Bothost environment variables:
BOT_TOKEN=<your Telegram bot token>
FRONTEND_ORIGIN=https://standrisereworkvrsofficial.netlify.app
PORT=3000
DB_PATH=./topoff.sqlite

Start command:
npm start

Backend health check:
https://bot-1791109324-4239-skyred123.bothost.tech/api/health

The Netlify frontend proxies /api/* to this backend, so the browser does not need a cross-origin API request.
