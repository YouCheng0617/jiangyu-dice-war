// Next.js + Socket.IO 自訂伺服器。所有骰子都在這裡擲，客戶端只送出「想做什麼」。
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import next from 'next';
import { Server } from 'socket.io';
import { newRoom, newPlayer, applyAction, MAX_PLAYERS } from './lib/game.js';

const prod = process.argv.includes('--prod');
if (prod) process.env.NODE_ENV = 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev: !prod });
const handle = app.getRequestHandler();
await app.prepare();

const httpServer = createServer((req, res) => handle(req, res));
const io = new Server(httpServer, { cors: { origin: false } });

/** code -> { st, tokens: string[], members: Map<socketId, seat>, idleSince } */
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode() {
  let c;
  do c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  while (rooms.has(c));
  return c;
}
function broadcast(room) {
  for (const [sid, seat] of room.members) io.to(sid).emit('state', { st: room.st, you: seat });
}
function leave(socket) {
  const info = socket.data.room;
  if (!info) return;
  const room = rooms.get(info.code);
  socket.data.room = null;
  socket.leave(info.code);
  if (!room) return;
  room.members.delete(socket.id);
  if (info.seat >= 0 && ![...room.members.values()].includes(info.seat)) {
    const p = room.st.players[info.seat];
    if (p) p.online = false;
  }
  if (room.members.size === 0) room.idleSince = Date.now();
  broadcast(room);
}
function join(socket, room, token, name) {
  leave(socket);
  const st = room.st;
  let seat = room.tokens.indexOf(token);
  if (seat < 0 && st.phase === 'lobby' && room.tokens.length < MAX_PLAYERS) {
    seat = room.tokens.length;
    room.tokens.push(token);
    st.players.push(newPlayer(name));
  }
  if (seat >= 0) {
    st.players[seat].online = true;
    if (name) st.players[seat].name = String(name).slice(0, 12);
  }
  room.members.set(socket.id, seat);
  room.idleSince = 0;
  socket.join(st.code);
  socket.data.room = { code: st.code, seat };
  broadcast(room);
  return seat;
}

io.on('connection', (socket) => {
  socket.data.room = null;
  socket.on('create', ({ token, name } = {}, ack) => {
    if (typeof token !== 'string' || !token) return ack?.({ error: '缺少玩家識別碼' });
    const code = makeCode();
    const room = { st: newRoom(code), tokens: [], members: new Map(), idleSince: 0 };
    rooms.set(code, room);
    join(socket, room, token, name);
    ack?.({ code });
  });
  socket.on('join', ({ code, token, name } = {}, ack) => {
    const room = rooms.get(String(code || '').toUpperCase().trim());
    if (!room) return ack?.({ error: '找不到這個房間，請確認房號' });
    if (typeof token !== 'string' || !token) return ack?.({ error: '缺少玩家識別碼' });
    const seat = join(socket, room, token, name);
    ack?.({ code: room.st.code, seat });
  });
  socket.on('act', (a, ack) => {
    const info = socket.data.room;
    const room = info && rooms.get(info.code);
    if (!room) return ack?.({ error: '你不在任何房間' });
    if (info.seat < 0) return ack?.({ error: '觀戰中無法行動' });
    if (!a || typeof a !== 'object' || typeof a.type !== 'string') return ack?.({ error: '格式錯誤' });
    const err = applyAction(room.st, info.seat, a);
    if (err) return ack?.({ error: err });
    broadcast(room);
    ack?.({});
  });
  socket.on('leave', () => leave(socket));
  socket.on('disconnect', () => leave(socket));
});

// 沒人的房間 3 小時後清掉
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) if (r.idleSince && now - r.idleSince > 3 * 3600 * 1000) rooms.delete(code);
}, 10 * 60 * 1000).unref();

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`\n  疆域骰戰 已啟動 (${prod ? 'production' : 'dev'})`);
  console.log(`  本機：   http://localhost:${port}`);
  for (const list of Object.values(networkInterfaces()))
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) console.log(`  區域網路：http://${n.address}:${port}  ← 手機/平板連同一個 Wi-Fi 開這個`);
  console.log('');
});
