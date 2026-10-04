# StandRise REWORK Backend

Node.js + Express + SQLite backend for the Telegram Mini App.

Required environment variables:
- `BOT_TOKEN`
- `FRONTEND_ORIGIN=https://standrisereworkvrsofficial.netlify.app`
- `PORT=3000`
- `DB_PATH=./standrise.sqlite`

Start:
`npm start`

Endpoints:
- `GET /api/health`
- `GET /api/bootstrap`
- `POST /api/register`
- `PUT /api/state`

Telegram `initData` is verified server-side with the bot token.
