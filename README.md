# StandRise REWORK — Bothost

1. Upload this folder to Bothost as a Node.js app.
2. Install dependencies (`npm install`).
3. Set environment variables:
   - `BOT_TOKEN` = token of the Telegram bot that owns the Mini App.
   - `FRONTEND_ORIGIN` = `https://standrisereworkvrs.netlify.app`
   - `DB_PATH` = `./standrise.sqlite` (or a persistent disk path on Bothost).
4. Start command: `npm start`.
5. Open `https://bot-1791109324-4239-skyred123.bothost.tech/api/health` and check `{ "ok": true }`.

SQLite is created automatically. Keep the SQLite file on persistent storage; otherwise a container restart can erase the shared data.
