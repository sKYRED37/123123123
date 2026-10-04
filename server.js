
'use strict';
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = String(process.env.BOT_TOKEN || '8431475320:AAHT586y06JWaIKyUWkvtxDEqXjo8glBlG8').trim();
const FRONTEND_ORIGIN = String(process.env.FRONTEND_ORIGIN || 'https://standrisereworkvrsofficial.netlify.app').replace(/\/$/, '');
const DB_PATH = process.env.DB_PATH || './topoff.sqlite';
if (!BOT_TOKEN) console.warn('BOT_TOKEN is not set. Telegram auth will reject requests.');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.exec(`
CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, state_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS telegram_users (telegram_id TEXT PRIMARY KEY, username TEXT, first_name TEXT, last_name TEXT, player_id TEXT UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
`);
const emptyState = {teams:[],players:[],matches:[],invites:[],events:[],praks:[]};
const existing = db.prepare('SELECT id FROM app_state WHERE id=1').get();
if (!existing) db.prepare('INSERT INTO app_state(id,version,state_json,updated_at) VALUES(1,0,?,?)').run(JSON.stringify(emptyState), new Date().toISOString());
function readState(){ const r=db.prepare('SELECT version,state_json FROM app_state WHERE id=1').get(); return {version:r.version,state:JSON.parse(r.state_json)}; }
function writeState(version,state){ db.prepare('UPDATE app_state SET version=?,state_json=?,updated_at=? WHERE id=1').run(version,JSON.stringify(state),new Date().toISOString()); }
function safeJson(s){ try{return JSON.parse(s)}catch{return null} }
function verifyInitData(initData){
  if(!BOT_TOKEN || !initData) return null;
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash'); if(!receivedHash) return null;
  params.delete('hash');
  const check = [...params.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>`${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256','WebAppData').update(BOT_TOKEN).digest();
  const expected = crypto.createHmac('sha256',secret).update(check).digest('hex');
  if (receivedHash.length!==expected.length) return null;
  if(!crypto.timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(receivedHash,'hex'))) return null;
  const authDate = Number(params.get('auth_date')||0);
  if(!authDate || Math.abs(Date.now()/1000-authDate)>86400) return null;
  const user=safeJson(params.get('user')||'null');
  return user && user.id ? {telegramId:String(user.id),username:user.username||'',firstName:user.first_name||'',lastName:user.last_name||''}:null;
}
function auth(req,res,next){ const u=verifyInitData(req.get('X-Telegram-Init-Data')||''); if(!u)return res.status(401).json({error:'Неверная или отсутствующая Telegram-сессия'}); req.tg=u; next(); }
function publicUser(tg){
  const u=db.prepare('SELECT telegram_id,username,first_name,last_name,player_id FROM telegram_users WHERE telegram_id=?').get(tg.telegramId);
  return {telegramId:tg.telegramId,username:tg.username,firstName:tg.firstName,lastName:tg.lastName,playerId:u?.player_id||null};
}
function clone(x){return JSON.parse(JSON.stringify(x));}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function mergeArray(cur,base,inc){
  const c=Array.isArray(cur)?cur:[], b=Array.isArray(base)?base:[], i=Array.isArray(inc)?inc:[];
  const ids=new Set([...c,...b,...i].map(x=>x&&x.id).filter(Boolean)); const out=[];
  for(const id of ids){
    const C=c.find(x=>x&&x.id===id), B=b.find(x=>x&&x.id===id), I=i.find(x=>x&&x.id===id);
    if(!B){ if(I!==undefined) out.push(I); else if(C!==undefined) out.push(C); continue; }
    if(I===undefined){ if(C!==undefined && same(C,B)) continue; if(C!==undefined) out.push(C); continue; }
    if(C===undefined){ if(!same(I,B)) out.push(I); continue; }
    if(same(C,B)) out.push(I); else if(same(I,B)) out.push(C); else out.push(I);
  }
  return out;
}
function mergeState(current,base,incoming){
  const out={}; for(const k of ['teams','players','matches','invites','events','praks']) out[k]=mergeArray(current?.[k],base?.[k],incoming?.[k]);
  return out;
}
function protectState(next,current,tg){
  const owner = current.players.find(p=>p && String(p.tg)===tg.telegramId);
  const isOwner = owner && owner.plat==='OWNER';
  const isAdmin = owner && (owner.plat==='ADMIN'||owner.plat==='OWNER');
  const curById=new Map(current.players.filter(Boolean).map(p=>[p.id,p]));
  for(const p of (next.players||[])){
    const old=curById.get(p.id); if(old?.tg && String(old.tg)!==String(p.tg)) p.tg=old.tg;
    if(old && !isOwner) p.plat=old.plat||'';
    if(old && String(old.tg)===tg.telegramId) p.tg=tg.telegramId;
  }
  if(!isAdmin){
    next.players=current.players.map(old=>{
      const n=(next.players||[]).find(p=>p.id===old.id); return n?{...n,tg:old.tg,plat:old.plat||''}:old;
    });
  }
  if(!isOwner){
    const owners=current.players.filter(p=>p.plat==='OWNER').map(p=>p.id);
    const incomingOwners=(next.players||[]).filter(p=>p.plat==='OWNER').map(p=>p.id);
    if(JSON.stringify(owners)!==JSON.stringify(incomingOwners)) next.players=current.players.map(old=>{const n=(next.players||[]).find(p=>p.id===old.id);return n?{...n,plat:old.plat||''}:old;});
  }
  return next;
}
const app=express();
const allowedOrigins = new Set([FRONTEND_ORIGIN, 'https://standrisereworkvrsofficial.netlify.app']);
app.use(cors({origin:(origin,cb)=>{if(!origin||allowedOrigins.has(origin))return cb(null,true);return cb(null,false)},methods:['GET','POST','PUT','OPTIONS'],allowedHeaders:['Content-Type','X-Telegram-Init-Data']}));
app.use(express.json({limit:'20mb'}));
app.get('/',(req,res)=>res.json({ok:true,service:'topoff-ranked',api:'/api/health'}));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'topoff-ranked',db:true,version:readState().version}));
app.get('/api/bootstrap',auth,(req,res)=>{const x=readState();res.json({version:x.version,state:x.state,user:publicUser(req.tg)});});
app.post('/api/register',auth,(req,res)=>{
  const nick=String(req.body?.nick||'').trim(), gid=String(req.body?.gid||'').trim();
  if(!/^[\p{L}\p{N} ._-]{2,16}$/u.test(nick))return res.status(400).json({error:'Ник: 2–16 символов'});
  if(!/^[\p{L}\p{N}]{3,20}$/u.test(gid))return res.status(400).json({error:'Game ID: 3–20 символов, только буквы и цифры'});
  const state=readState(); const users=db.prepare('SELECT * FROM telegram_users WHERE telegram_id=?').get(req.tg.telegramId);
  if(users?.player_id){const p=state.state.players.find(p=>p.id===users.player_id);return res.json({player:p,version:state.version,state:state.state});}
  if(state.state.players.some(p=>String(p.gid).toLowerCase()===gid.toLowerCase()))return res.status(409).json({error:'Этот Game ID уже занят'});
  const id=crypto.randomUUID(); const first=state.state.players.length===0;
  const player={id,tg:req.tg.telegramId,nick,gid,k:0,d:0,a:0,w:0,l:0,adr:0,photo:'',memberships:[],team:null,role:null,plat:first?'OWNER':''};
  state.state.players.push(player); const now=new Date().toISOString();
  db.prepare(`INSERT INTO telegram_users(telegram_id,username,first_name,last_name,player_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name,last_name=excluded.last_name,player_id=excluded.player_id,updated_at=excluded.updated_at`).run(req.tg.telegramId,req.tg.username,req.tg.firstName,req.tg.lastName,id,now,now);
  writeState(state.version+1,state.state); res.json({player,version:state.version+1,state:state.state});
});
app.put('/api/state',auth,(req,res)=>{
  const incoming=req.body?.state; if(!incoming||typeof incoming!=='object')return res.status(400).json({error:'Некорректное состояние'});
  const cur=readState(); const base=Number(req.body?.version||0); let next;
  if(base===cur.version) next=clone(incoming); else next=mergeState(cur.state,req.body?.baseState||{},incoming);
  next=protectState(next,cur.state,req.tg);
  const linked=db.prepare('SELECT player_id FROM telegram_users WHERE telegram_id=?').get(req.tg.telegramId);
  if(!linked?.player_id || !next.players.some(p=>p.id===linked.player_id))return res.status(403).json({error:'Сначала зарегистрируйте профиль'});
  const cp=cur.state.players.find(p=>p.id===linked.player_id), np=next.players.find(p=>p.id===linked.player_id); if(cp&&np)np.tg=req.tg.telegramId;
  const version=cur.version+1; writeState(version,next); res.json({ok:true,version,state:next,user:publicUser(req.tg)});
});
app.listen(PORT,()=>console.log(`Topoff Ranked backend listening on :${PORT}`));
