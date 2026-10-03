# StandRise REWORK — online version

This package connects the existing StandRise Mini App to a Node.js + SQLite backend.

## What is changed
- Telegram Mini App `initData` is validated on the server.
- Registration creates a real user in SQLite.
- Players, teams, matches, events, invites and practices are persisted on the server.
- The existing StandRise UI is kept.
- The frontend can live on Netlify while the API lives on Bothost.
- CORS is enabled so the Netlify frontend can call the Bothost API.

## Bothost settings
Use **Node.js** and preferably **node:20 Debian Slim** because `better-sqlite3` is a native module.
Set the Git branch to `main` and the entry/start command to `npm start` (or `node server.js`).

Environment variables on Bothost:
```text
BOT_TOKEN=YOUR_NEW_BOT_TOKEN
INITIAL_OWNER_TELEGRAM_ID=YOUR_NUMERIC_TELEGRAM_ID
FRONTEND_ORIGIN=https://standrisereworkvrs.netlify.app
```

Do NOT put BOT_TOKEN in the Netlify frontend.

## Netlify frontend
Edit `public/config.js` and replace:
```js
window.STANDRISE_API_BASE = 'https://YOUR-BOTHOST-URL';
```
with the public HTTPS URL of your Bothost application. Then upload/deploy the `public` folder as the Netlify site.

## Start locally
```bash
npm install
npm start
```

## Telegram
The Mini App URL in BotFather should remain the Netlify URL. The frontend sends Telegram `initData` to the Bothost API, where it is validated before registration/data access.

Telegram's documentation says `initData` must be validated on the backend; `initDataUnsafe` must not be trusted.

## Important
The current first online version synchronizes the application's state through `/api/state`. It is enough to make users see the same shared data, but before opening the platform widely, team/admin permission checks should be moved fully into dedicated server-side endpoints.
