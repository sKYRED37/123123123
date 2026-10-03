# StandRise REWORK — online version

This version adds:
- real Telegram Mini App authentication on the server;
- server-side user registration;
- SQLite database (`data/standrise.sqlite`);
- persistent storage for players, teams, matches, events, invites and practices;
- the existing StandRise interface kept as the frontend.

## 1. Install

Node.js 20+ is recommended.

```bash
npm install
```

## 2. Configure

Copy `.env.example` to `.env` and set `BOT_TOKEN` to the token of your Telegram bot from @BotFather.

If you want a specific Telegram account to become platform OWNER on its first registration, set `INITIAL_OWNER_TELEGRAM_ID` to that numeric Telegram ID.

Never put the bot token into `index.html`.

## 3. Start

```bash
npm start
```

Open the HTTPS address of this server in your Telegram Mini App settings.

## Important

The SQLite file is persistent only if the hosting provider gives the app persistent disk/storage. If the host is ephemeral, use a managed PostgreSQL database later.

The frontend currently syncs the complete application state through `/api/state`. This is suitable for the first online version, but for a production esports platform, move every admin/team/match permission check into server-side endpoints before opening it widely.
