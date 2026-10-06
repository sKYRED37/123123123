'use strict';

const path = require('path');
const express = require('express');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = String(process.env.BOT_TOKEN || '').trim();
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'topoff.sqlite');

if (!BOT_TOKEN) {
  console.warn('BOT_TOKEN is not set. Telegram auth will reject requests.');
}

const app = express();
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  version INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS telegram_users (
  telegram_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  player_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

const emptyState = {
  teams: [],
  players: [],
  matches: [],
  invites: [],
  events: [],
  praks: []
};

if (!db.prepare('SELECT id FROM app_state WHERE id=1').get()) {
  db.prepare(
    'INSERT INTO app_state(id,version,state_json,updated_at) VALUES(1,0,?,?)'
  ).run(JSON.stringify(emptyState), new Date().toISOString());
}

function readState() {
  const row = db.prepare('SELECT version,state_json FROM app_state WHERE id=1').get();
  return { version: row.version, state: JSON.parse(row.state_json) };
}

function writeState(version, state) {
  db.prepare(
    'UPDATE app_state SET version=?, state_json=?, updated_at=? WHERE id=1'
  ).run(version, JSON.stringify(state), new Date().toISOString());
}

function safeJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function verifyInitData(initData) {
  if (!BOT_TOKEN || !initData) return null;

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash) return null;
  params.delete('hash');

  const checkString = [...params.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(BOT_TOKEN)
    .digest();

  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(checkString)
    .digest('hex');

  if (!/^[0-9a-f]{64}$/i.test(receivedHash)) return null;
  const expected = Buffer.from(expectedHash, 'hex');
  const received = Buffer.from(receivedHash, 'hex');
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Math.abs(Date.now() / 1000 - authDate) > 86400) return null;

  const user = safeJson(params.get('user') || 'null');
  if (!user || !user.id) return null;

  return {
    telegramId: String(user.id),
    username: user.username || '',
    firstName: user.first_name || '',
    lastName: user.last_name || ''
  };
}

function auth(req, res, next) {
  const user = verifyInitData(req.get('X-Telegram-Init-Data') || '');
  if (!user) {
    return res.status(401).json({ error: 'Неверная или отсутствующая Telegram-сессия' });
  }
  req.tg = user;
  next();
}

function publicUser(tg) {
  const row = db.prepare(
    'SELECT telegram_id,username,first_name,last_name,player_id FROM telegram_users WHERE telegram_id=?'
  ).get(tg.telegramId);
  return {
    telegramId: tg.telegramId,
    username: tg.username,
    firstName: tg.firstName,
    lastName: tg.lastName,
    playerId: row?.player_id || null
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeArray(current, base, incoming) {
  const c = Array.isArray(current) ? current : [];
  const b = Array.isArray(base) ? base : [];
  const i = Array.isArray(incoming) ? incoming : [];
  const ids = new Set([...c, ...b, ...i].map(x => x && x.id).filter(Boolean));
  const out = [];

  for (const id of ids) {
    const C = c.find(x => x && x.id === id);
    const B = b.find(x => x && x.id === id);
    const I = i.find(x => x && x.id === id);

    if (!B) {
      if (I !== undefined) out.push(I);
      else if (C !== undefined) out.push(C);
      continue;
    }

    if (I === undefined) {
      if (C !== undefined && same(C, B)) continue;
      if (C !== undefined) out.push(C);
      continue;
    }

    if (C === undefined) {
      if (!same(I, B)) out.push(I);
      continue;
    }

    if (same(C, B)) out.push(I);
    else if (same(I, B)) out.push(C);
    else out.push(I);
  }

  return out;
}

function mergeState(current, base, incoming) {
  const out = {};
  for (const key of ['teams', 'players', 'matches', 'invites', 'events', 'praks']) {
    out[key] = mergeArray(current?.[key], base?.[key], incoming?.[key]);
  }
  return out;
}

function protectState(next, current, tg) {
  const currentPlayers = Array.isArray(current.players) ? current.players : [];
  const nextPlayers = Array.isArray(next.players) ? next.players : [];
  const owner = currentPlayers.find(p => p && String(p.tg) === tg.telegramId);
  const isOwner = !!(owner && owner.plat === 'OWNER');
  const isAdmin = !!(owner && (owner.plat === 'ADMIN' || owner.plat === 'OWNER'));
  const currentById = new Map(currentPlayers.filter(Boolean).map(p => [p.id, p]));

  for (const player of nextPlayers) {
    const old = currentById.get(player.id);
    if (old?.tg && String(old.tg) !== String(player.tg)) player.tg = old.tg;
    if (old && !isOwner) player.plat = old.plat || '';
    if (old && String(old.tg) === tg.telegramId) player.tg = tg.telegramId;
  }

  if (!isAdmin) {
    next.players = currentPlayers.map(old => {
      const fresh = nextPlayers.find(p => p.id === old.id);
      return fresh ? { ...fresh, tg: old.tg, plat: old.plat || '' } : old;
    });
  }

  if (!isOwner) {
    const owners = currentPlayers.filter(p => p.plat === 'OWNER').map(p => p.id).sort();
    const incomingOwners = (next.players || []).filter(p => p.plat === 'OWNER').map(p => p.id).sort();
    if (!same(owners, incomingOwners)) {
      next.players = currentPlayers.map(old => {
        const fresh = (next.players || []).find(p => p.id === old.id);
        return fresh ? { ...fresh, plat: old.plat || '' } : old;
      });
    }
  }

  return next;
}

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'topoff-ranked', db: true, version: readState().version });
});

app.get('/api/bootstrap', auth, (req, res) => {
  const current = readState();
  res.json({ version: current.version, state: current.state, user: publicUser(req.tg) });
});

app.post('/api/register', auth, (req, res) => {
  const nick = String(req.body?.nick || '').trim();
  const gid = String(req.body?.gid || '').trim();

  if (!/^[-\p{L}\p{N} ._]{2,16}$/u.test(nick)) {
    return res.status(400).json({ error: 'Ник: 2–16 символов' });
  }
  if (!/^[\p{L}\p{N}]{3,20}$/u.test(gid)) {
    return res.status(400).json({ error: 'Game ID: 3–20 символов, только буквы и цифры' });
  }

  const current = readState();
  const linked = db.prepare('SELECT * FROM telegram_users WHERE telegram_id=?').get(req.tg.telegramId);

  if (linked?.player_id) {
    const existingPlayer = current.state.players.find(p => p.id === linked.player_id);
    if (existingPlayer) return res.json({ player: existingPlayer, version: current.version, state: current.state });
  }

  if (current.state.players.some(p => String(p.gid).toLowerCase() === gid.toLowerCase())) {
    return res.status(409).json({ error: 'Этот Game ID уже занят' });
  }

  const id = crypto.randomUUID();
  const isFirst = current.state.players.length === 0;
  const player = {
    id,
    tg: req.tg.telegramId,
    tgUsername: req.tg.username || '',
    nick,
    gid,
    k: 0,
    d: 0,
    a: 0,
    w: 0,
    l: 0,
    adr: 0,
    photo: '',
    memberships: [],
    team: null,
    role: null,
    plat: isFirst ? 'OWNER' : ''
  };

  current.state.players.push(player);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO telegram_users
      (telegram_id,username,first_name,last_name,player_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username=excluded.username,
      first_name=excluded.first_name,
      last_name=excluded.last_name,
      player_id=excluded.player_id,
      updated_at=excluded.updated_at
  `).run(
    req.tg.telegramId,
    req.tg.username,
    req.tg.firstName,
    req.tg.lastName,
    id,
    now,
    now
  );

  const version = current.version + 1;
  writeState(version, current.state);
  res.json({ player, version, state: current.state, user: publicUser(req.tg) });
});

app.put('/api/state', auth, (req, res) => {
  const incoming = req.body?.state;
  if (!incoming || typeof incoming !== 'object') {
    return res.status(400).json({ error: 'Некорректное состояние' });
  }

  const current = readState();
  const baseVersion = Number(req.body?.version ?? 0);
  let next = baseVersion === current.version
    ? clone(incoming)
    : mergeState(current.state, req.body?.baseState || {}, incoming);

  next = protectState(next, current.state, req.tg);

  const linked = db.prepare('SELECT player_id FROM telegram_users WHERE telegram_id=?').get(req.tg.telegramId);
  if (!linked?.player_id || !(next.players || []).some(p => p.id === linked.player_id)) {
    return res.status(403).json({ error: 'Сначала зарегистрируйте профиль' });
  }

  const currentPlayer = current.state.players.find(p => p.id === linked.player_id);
  const nextPlayer = next.players.find(p => p.id === linked.player_id);
  if (currentPlayer && nextPlayer) nextPlayer.tg = req.tg.telegramId;

  const version = current.version + 1;
  writeState(version, next);
  res.json({ ok: true, version, state: next, user: publicUser(req.tg) });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

app.listen(PORT, () => {
  console.log(`Topoff Ranked listening on :${PORT}`);
});
