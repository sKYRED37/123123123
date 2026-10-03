import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env. || '8712212446:AAHfv4VRpM47WpJ2sy2gRo57lQJmbnPGi44';
const OWNER_TELEGRAM_ID = String(process.env.INITIAL_OWNER_TELEGRAM_ID || '1766395031');

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

function loadSeed() {
  const p = path.join(dataDir, 'seed-state.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
if (!db.prepare('SELECT 1 FROM app_state WHERE id=1').get()) {
  db.prepare('INSERT INTO app_state(id,state_json) VALUES(1,?)').run(JSON.stringify(loadSeed()));
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
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req,res) => res.json({ok:true}));

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
