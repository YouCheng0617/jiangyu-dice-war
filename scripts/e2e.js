// 連線測試：房主 + 客人透過公共 MQTT 中繼打完一局。用法：npm run test:net
import { Net } from '../lib/net.js';
import * as E from '../lib/game.js';

const views = {};
const mk = (who, token) => new Net({ token, onState: (m) => { views[who] = m; } });
const host = mk('A', 'tokA-' + Date.now()), guest = mk('B', 'tokB-' + Date.now());
const t0 = Date.now();
const { code } = await host.host('甲');
console.log('room', code, `(${Date.now() - t0}ms)`);
console.log('join', JSON.stringify(await guest.join(code, '乙')));
await new Promise((r) => setTimeout(r, 500));
console.log('guest sees players', views.B?.st.players.map((p) => p.name).join(','), 'you', views.B?.you);
console.log('dup nation ->', (await host.act({ type: 'nation', nation: 'DE' })).error ?? 'ok', '/', (await guest.act({ type: 'nation', nation: 'DE' })).error);
await guest.act({ type: 'nation', nation: 'SU' });
console.log('guest start ->', (await guest.act({ type: 'start' })).error);
await host.act({ type: 'start' });

const nets = [host, guest];
let n = 0, lat = 0, cnt = 0;
while (n++ < 80) {
  const s = views.A.st;
  if (s.phase === 'over') break;
  const me = s.cur;
  let a;
  if (s.phase === 'capital') a = { type: 'capital', t: E.capOptions(s)[0] };
  else if (E.needsCapital(s, me)) a = { type: 'recap', t: E.recapOptions(s, me)[0] };
  else {
    const dev = [...E.devOptions(s, me).keys()];
    const atk = E.atkOptions(s, me).map((o) => ({ ...o, k: E.need(s, o.t) - s.t[o.t].m + Math.random() })).sort((x, y) => x.k - y.k);
    a = s.chain === 'atk' ? (atk[0] ? { type: 'attack', src: atk[0].src, t: atk[0].t } : { type: 'end' })
      : dev.length ? { type: 'develop', t: dev[0] } : atk.length ? { type: 'attack', src: atk[0].src, t: atk[0].t } : { type: 'end' };
  }
  const t1 = Date.now();
  const r = await nets[me].act(a);
  if (me === 1) { lat += Date.now() - t1; cnt++; }
  if (r.error) { console.log('ERR', r.error, a); break; }
  if (me === 1) await new Promise((res) => setTimeout(res, 120)); // 等狀態廣播回來
}
await new Promise((r) => setTimeout(r, 800));
console.log('80 步後 phase', views.A.st.phase, 'round', views.A.st.round, 'synced', views.A.st.ver === views.B.st.ver, 'guest avg latency', Math.round(lat / Math.max(1, cnt)) + 'ms');

// 客人重新連線保留座位；第三人變觀戰
guest.close();
const g2 = mk('B2', guest.token);
console.log('rejoin', JSON.stringify(await g2.join(code, '乙')));
const spec = mk('C', 'tokC-' + Date.now());
console.log('spectator', JSON.stringify(await spec.join(code, '丙')));
console.log('bad code', JSON.stringify(await mk('D', 'x').join('ZZZZZ', 'x')));
for (const x of [host, g2, spec]) x.close();
setTimeout(() => process.exit(0), 500);
