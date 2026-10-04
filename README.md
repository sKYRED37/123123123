# TOPOFF RANKED — GitHub → Netlify + Bothost

Один GitHub-репозиторий для двух сервисов:

- **Bothost** запускает Node/Express API и может одновременно отдавать `public/`.
- **Netlify** публикует `public/` как фронтенд.
- `netlify.toml` проксирует `/api/*` с Netlify на Bothost.
- `public/config.js` всегда использует относительный `/api`, поэтому один и тот же фронтенд работает и на Netlify, и на Bothost.

## 1. GitHub

Загрузите **содержимое этой папки** в корень GitHub-репозитория:

```text
package.json
server.js
netlify.toml
public/
  index.html
  config.js
...
```

Не загружайте сам `.zip` как единственный файл репозитория.

## 2. Bothost

Подключите тот же GitHub-репозиторий.

Start command:

```bash
npm start
```

Environment variables:

```text
BOT_TOKEN=8431475320:AAHT586y06JWaIKyUWkvtxDEqXjo8glBlG8
FRONTEND_ORIGIN=https://standrisereworkvrsofficial.netlify.app
PORT=3000
HOST=0.0.0.0
DB_PATH=./topoff.sqlite
```

`PORT` лучше не задавать вручную, если Bothost сам выдаёт порт. Тогда приложение автоматически использует `process.env.PORT`.

После запуска проверьте:

```text
https://bot-1791109324-4239-skyred123.bothost.tech/api/health
```

Ожидается HTTP 200:

```json
{"ok":true,"service":"topoff-ranked","db":true,"version":0}
```

## 3. Netlify

Подключите **тот же GitHub-репозиторий**.

Build command: оставить пустым.

Publish directory:

```text
public
```

Netlify автоматически прочитает `netlify.toml`.

После деплоя:

```text
https://standrisereworkvrsofficial.netlify.app
```

Запросы фронтенда на:

```text
/api/health
/api/bootstrap
/api/register
/api/state
```

будут проксироваться на Bothost.

## 4. Telegram Mini App

Для Telegram можно использовать Netlify URL:

```text
https://standrisereworkvrsofficial.netlify.app
```

Либо, если хочешь полностью обойти Netlify, использовать Bothost URL:

```text
https://bot-1791109324-4239-skyred123.bothost.tech
```

## Важно

Не коммитьте `.env` и настоящий `BOT_TOKEN`. Он уже исключён через `.gitignore`.


## Token
The configured BOT_TOKEN is embedded as a fallback in `server.js` so the app can start even if Bothost does not provide the environment variable. For security, rotate this token in BotFather after testing because it has been shared in chat.
