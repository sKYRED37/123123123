import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const OWNER_TELEGRAM_ID = String(process.env.INITIAL_OWNER_TELEGRAM_ID || '');
const FRONTEND_ORIGIN = String(process.env.FRONTEND_ORIGIN || 'https://standrisereworkvrs.netlify.app');

if (!BOT_TOKEN) console.warn('BOT_TOKEN is not set. Telegram authentication will be unavailable until it is configured.');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'standrise.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  telegram_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  player_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

// The initial state is embedded in the server so deployment does not depend on
// a seed-state.json file being copied into the container. SQLite remains the
// source of truth after the first start, so existing data is not reset.
const INITIAL_STATE = {"teams":[{"id":"t1","tag":"PHX","name":"Phoenix Rising","logo":"🔥","desc":"Основной состав StandRise."},{"id":"t2","tag":"NWF","name":"Night Wolves","logo":"🐺","desc":"Играем ночью, побеждаем днём."},{"id":"t3","tag":"NST","name":"Neon Storm","logo":"⚡","desc":"Быстро. Агрессивно. Точно."}],"players":[{"id":"p1","nick":"Kaizen","plat":"OWNER","team":"t1","role":"OWNER","k":1840,"d":1320,"adr":84.2,"w":41,"l":19},{"id":"p2","nick":"Vortex","plat":"ADMIN","team":"t1","role":"LEADER","k":1602,"d":1390,"adr":78.5,"w":38,"l":22},{"id":"p3","nick":"Sniper_X","team":"t1","role":"PLAYER","k":1410,"d":1260,"adr":74.9,"w":36,"l":24},{"id":"p4","nick":"Ghost","plat":"ORGANIZER","team":"t2","role":"OWNER","k":1730,"d":1500,"adr":80.1,"w":33,"l":27},{"id":"p5","nick":"Blaze","team":"t2","role":"LEADER","k":1288,"d":1310,"adr":70.3,"w":28,"l":32},{"id":"p6","nick":"Raven","team":"t2","role":"PLAYER","k":1190,"d":1260,"adr":68.8,"w":26,"l":30},{"id":"p7","nick":"Storm","team":"t3","role":"OWNER","k":1510,"d":1210,"adr":79.7,"w":30,"l":20},{"id":"p8","nick":"Zero","team":"t3","role":"PLAYER","k":1105,"d":1180,"adr":66.2,"w":22,"l":28},{"id":"p9","nick":"Nova","team":null,"role":null,"k":620,"d":640,"adr":65.1,"w":12,"l":14},{"id":"p10","nick":"Drift","team":null,"role":null,"k":410,"d":480,"adr":58.4,"w":8,"l":13},{"id":"p11","nick":"Frost","team":"t1","role":"PLAYER","k":980,"d":1010,"adr":64.5,"w":20,"l":25},{"id":"p12","nick":"Echo","team":"t1","role":"PLAYER","k":870,"d":940,"adr":62.1,"w":18,"l":22},{"id":"p13","nick":"Viper","team":"t2","role":"PLAYER","k":940,"d":990,"adr":63,"w":19,"l":24},{"id":"p14","nick":"Hawk","team":"t2","role":"PLAYER","k":820,"d":900,"adr":60.2,"w":17,"l":23}],"matches":[{"id":"m1","ev":"e1","stage":"group","grp":"A","date":"2026-10-02","t1":"t1","t2":"t2","maps":[{"map":"Sandstone","a":13,"b":9},{"map":"Province","a":11,"b":13},{"map":"Rust","a":13,"b":7}]},{"id":"m2","ev":"e1","stage":"group","grp":"A","date":"2026-09-29","t1":"t3","t2":"t1","maps":[{"map":"Zone 9","a":8,"b":13},{"map":"Dune","a":10,"b":13}]},{"id":"m3","ev":"e1","stage":"group","grp":"A","date":"2026-09-25","t1":"t2","t2":"t3","maps":[{"map":"Hanami","a":13,"b":11},{"map":"Breeze","a":9,"b":13},{"map":"Sandstone","a":13,"b":10}]}],"invites":[],"events":[{"id":"e1","stages":{"group":"Bo3","playoff":"Bo3","final":"Bo5","third":"Bo3"},"groups":[{"name":"A","teams":["t1","t2","t3"]}],"by":"p4","name":"StandRise Open Cup #1","status":"live","date":"2026-10-03","prize":"50 000 ₽","max":8,"teams":["t1","t2","t3"],"fmt":"Bo3 · Single Elimination","desc":"Первый открытый кубок StandRise REWORK. Плей-офф идёт прямо сейчас."},{"id":"e2","stages":{"group":"Bo2","playoff":"Bo3","final":"Bo5","third":"Bo3"},"by":"p4","name":"Autumn Rise Cup","status":"reg","date":"2026-10-12","prize":"100 000 ₽","max":16,"teams":["t1"],"fmt":"Bo3 · Double Elimination","desc":"Осенний турнир. Открыта регистрация команд."},{"id":"e3","by":"p4","name":"Pre-Season Showdown","status":"reg","date":"2026-10-20","prize":"25 000 ₽","max":8,"teams":[],"fmt":"Bo1 · Групповой этап + плей-офф","desc":"Разминочный турнир перед сезоном."},{"id":"e4","places":{"t1":{"lo":1,"hi":1},"t2":{"lo":2,"hi":2},"t3":{"lo":3,"hi":3}},"roster":{"t1":["p1","p2","p3"],"t2":["p4","p5","p6"],"t3":["p7","p8"]},"by":"p4","name":"Summer Kickoff","status":"done","date":"2026-08-15","prize":"30 000 ₽","max":8,"teams":["t1","t2","t3"],"fmt":"Bo3 · Single Elimination","desc":"Завершённый летний турнир."},{"id":"e5","by":"p4","name":"Swiss Masters","status":"live","date":"2026-10-04","prize":"75 000 ₽","max":8,"teams":["t1","t2","t3"],"stages":{"s1":"swiss","group":"Bo1","rounds":3,"adv":2,"playoff":"Bo3","final":"Bo5","third":"Bo3"},"groups":[],"desc":"Швейцарская система, затем плей-офф с матчем за 3 место."}],"praks":[{"id":"k1","t1":"t2","t2":"t1","date":"2026-10-06","time":"21:00","fmt":"Bo3","note":"Готовимся к кубку, сыграем?","status":"pending","maps":[]},{"id":"k2","t1":"t1","t2":"t3","date":"2026-10-05","time":"20:00","fmt":"Bo2","note":"","status":"accepted","maps":[]},{"id":"k3","t1":"t1","t2":"t2","date":"2026-10-01","time":"19:00","fmt":"Bo3","note":"","status":"done","maps":[{"map":"Rust","a":13,"b":6},{"map":"Dune","a":9,"b":13},{"map":"Zone 9","a":13,"b":11}]}]};

if (!db.prepare('SELECT 1 FROM app_state WHERE id=1').get()) {
  db.prepare('INSERT INTO app_state(id,state_json) VALUES(1,?)').run(JSON.stringify(INITIAL_STATE));
}

function getState() { return JSON.parse(db.prepare('SELECT state_json FROM app_state WHERE id=1').get().state_json); }
function putState(state) {
  db.prepare('UPDATE app_state SET state_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=1').run(JSON.stringify(state));
}
function userFromState(telegramId) {
  const row = db.prepare('SELECT * FROM users WHERE telegram_id=?').get(String(telegramId));
  return row || null;
}
function safeUser(row, tg) {
  return {
    telegramId: String(tg.id),
    username: tg.username || row?.username || '',
    firstName: tg.first_name || row?.first_name || '',
    lastName: tg.last_name || row?.last_name || '',
    playerId: row?.player_id || null
  };
}

function validateInitData(initData) {
  if (!BOT_TOKEN || !initData) throw new Error('Telegram authentication is not configured');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new Error('Missing Telegram hash');
  params.delete('hash');
  const pairs = [...params.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`);
  const dataCheckString = pairs.join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const calculated = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  const a = Buffer.from(calculated, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Invalid Telegram initData');
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Math.abs(Date.now()/1000 - authDate) > 86400) throw new Error('Telegram session expired');
  const rawUser = params.get('user');
  if (!rawUser) throw new Error('Telegram user is missing');
  return JSON.parse(rawUser);
}

function auth(req, res, next) {
  try {
    const initData = req.get('X-Telegram-Init-Data') || '';
    const tg = validateInitData(initData);
    req.tgUser = tg;
    req.dbUser = userFromState(tg.id);
    next();
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
}

const app = express();
app.use(cors({ origin: FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN.split(',').map(x => x.trim()).filter(Boolean), methods: ['GET','POST','PUT','OPTIONS'], allowedHeaders: ['Content-Type','X-Telegram-Init-Data'] }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req,res) => res.json({ok:true, service:'standrise-api'}));

app.get('/api/bootstrap', auth, (req,res) => {
  const state = getState();
  res.json({
    user: safeUser(req.dbUser, req.tgUser),
    registered: !!req.dbUser,
    state,
  });
});

app.post('/api/register', auth, (req,res) => {
  if (req.dbUser) return res.status(409).json({error:'Этот Telegram-аккаунт уже зарегистрирован'});
  const nick = String(req.body?.nick || '').trim();
  const gid = String(req.body?.gid || '').trim();
  if (nick.length < 2 || nick.length > 16) return res.status(400).json({error:'Ник: 2–16 символов'});
  if (!/^[\p{L}\p{N}]{3,20}$/u.test(gid)) return res.status(400).json({error:'Game ID: 3–20 символов, только буквы и цифры'});
  const state = getState();
  if (state.players.some(p => String(p.nick).toLowerCase() === nick.toLowerCase())) return res.status(409).json({error:'Этот ник уже занят'});
  if (state.players.some(p => String(p.gid).toLowerCase() === gid.toLowerCase())) return res.status(409).json({error:'Этот Game ID уже зарегистрирован'});
  const id = 'p_' + crypto.randomBytes(8).toString('hex');
  const isOwner = OWNER_TELEGRAM_ID && String(req.tgUser.id) === OWNER_TELEGRAM_ID;
  const player = {id, nick, gid, team:null, role:null, k:0, d:0, adr:0, w:0, l:0, tg:String(req.tgUser.id)};
  if (isOwner) player.plat = 'OWNER';
  state.players.push(player);
  putState(state);
  db.prepare('INSERT INTO users(telegram_id,username,first_name,last_name,player_id) VALUES(?,?,?,?,?)')
    .run(String(req.tgUser.id), req.tgUser.username || '', req.tgUser.first_name || '', req.tgUser.last_name || '', id);
  res.json({player});
});

app.put('/api/state', auth, (req,res) => {
  if (!req.dbUser) return res.status(403).json({error:'Сначала зарегистрируйтесь'});
  const incoming = req.body;
  if (!incoming || !Array.isArray(incoming.players) || !Array.isArray(incoming.teams)) return res.status(400).json({error:'Некорректные данные'});
  const current = getState();
  // Не позволяем клиенту перепривязать Telegram ID существующих игроков.
  const tgById = new Map(current.players.map(p => [String(p.id), p.tg ? String(p.tg) : '']));
  for (const p of incoming.players) {
    const oldTg = tgById.get(String(p.id));
    if (oldTg && String(p.tg || '') !== oldTg) return res.status(403).json({error:'Нельзя менять Telegram-привязку игрока'});
  }
  putState({
    teams: incoming.teams,
    players: incoming.players,
    matches: Array.isArray(incoming.matches)?incoming.matches:[],
    invites: Array.isArray(incoming.invites)?incoming.invites:[],
    events: Array.isArray(incoming.events)?incoming.events:[],
    praks: Array.isArray(incoming.praks)?incoming.praks:[]
  });
  res.json({ok:true});
});

app.use((req,res,next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname,'public','index.html'));
});

app.listen(PORT, () => console.log(`StandRise listening on :${PORT}`));
