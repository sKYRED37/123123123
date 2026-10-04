# TOPOFF RANKED — ONE SERVER

This version serves BOTH the web app and the API from the same Bothost server. This removes the Netlify -> Bothost browser CORS/proxy dependency.

## Deploy
1. Put the entire repository in GitHub.
2. Connect GitHub repository to Bothost.
3. Start command: `npm start`
4. Set environment variables:
   - `BOT_TOKEN` = Telegram bot token (never commit it)
   - `FRONTEND_ORIGIN=https://standrisereworkvrsofficial.netlify.app`
   - `PORT=3000`
   - `DB_PATH=./topoff.sqlite`
5. Open `https://bot-1791109324-4239-skyred123.bothost.tech/api/health`.
   Expected: `{"ok":true,"service":"topoff-ranked","db":true,"version":0}`
6. For the most reliable Telegram Mini App setup, set the Telegram Web App URL directly to:
   `https://bot-1791109324-4239-skyred123.bothost.tech`

The frontend is in `public/` and the API is `/api/*` on the same origin.
