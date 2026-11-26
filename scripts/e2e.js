// 連線測試：兩個 socket 客戶端建立/加入房間並打完一局。用法：node scripts/e2e.js [port]
import { io } from 'socket.io-client';
import * as E from '../lib/game.js';
const url = 'http://localhost:' + (process.argv[2] || 3000);
const mk = () => io(url, { transports: ['websocket'] });
const A = mk(), B = mk();
const st = { A: null, B: null };
const call = (s, ev, d) => new Promise((r) => s.emit(ev, d, r));
A.on('state', (m) => (st.A = m)); B.on('state', (m) => (st.B = m));
await new Promise((r) => A.on('connect', r));
const { code } = await call(A, 'create', { token: 'tA', name: '甲' });
await new Promise((r) => (B.connected ? r() : B.on('connect', r)));
console.log('room', code, 'join', JSON.stringify(await call(B, 'join', { code, token: 'tB', name: '乙' })));
console.log('dup nation ->', (await call(A, 'act', { type: 'nation', nation: 'DE' })).error ?? 'ok', (await call(B, 'act', { type: 'nation', nation: 'DE' })).error);
await call(B, 'act', { type: 'nation', nation: 'SU' });
console.log('guest start ->', (await call(B, 'act', { type: 'start' })).error);
await call(A, 'act', { type: 'start' });
const wait = () => new Promise((r) => setTimeout(r, 15));
const socks = [A, B];
let n = 0;
while (n++ < 4000) {
  await wait();
  const s = st.A.st;
  if (s.phase === 'over') break;
  const me = s.cur, so = socks[me];
  if (n === 5) console.log('wrong turn ->', (await call(socks[1 - me], 'act', { type: 'end' })).error);
  let a;
  if (s.phase === 'capital') a = { type: 'capital', t: E.capOptions(s)[0] };
  else if (E.needsCapital(s, me)) { a = { type: 'recap', t: E.recapOptions(s, me)[0] }; console.log('recap by', me, 'round', s.round); }
  else {
    const dev = [...E.devOptions(s, me).keys()], atk = E.atkOptions(s, me);
    a = s.chain === 'atk' ? (atk[0] ? { type: 'attack', ...atk[0] } : { type: 'end' })
      : dev.length ? { type: 'develop', t: dev[0] } : atk.length ? { type: 'attack', src: atk[0].src, t: atk[0].t } : { type: 'end' };
  }
  const r = await call(so, 'act', a);
  if (r.error) { console.log('ERR', r.error, a); break; }
}
const s = st.B.st;
console.log('phase', s.phase, 'round', s.round, 'winner', s.winner, 'B sees same ver', st.A.st.ver === s.ver, 'B you', st.B.you);
// 重新連線保留座位
B.disconnect();
const B2 = mk(); await new Promise((r) => B2.on('connect', r));
console.log('rejoin', JSON.stringify(await call(B2, 'join', { code, token: 'tB', name: '乙' })));
const C = mk(); await new Promise((r) => C.on('connect', r));
console.log('spectator', JSON.stringify(await call(C, 'join', { code, token: 'tC' })));
process.exit(0);
