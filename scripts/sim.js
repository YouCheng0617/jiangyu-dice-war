// 引擎自我測試：兩個隨機策略玩家打到分出勝負，檢查地圖與規則不會卡死或出錯。
import * as E from '../lib/game.js';
import { getMap } from '../lib/mapgen.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
let totalRounds = 0, recaps = 0;
const games = 60;
for (let g = 0; g < games; g++) {
  const type = ['continent', 'islands', 'mixed'][g % 3];
  const st = E.newRoom('TEST');
  st.players.push(E.newPlayer('A'), E.newPlayer('B'));
  E.applyAction(st, 0, { type: 'mapType', mapType: type });
  const [n1, n2] = [...E.NATION_KEYS].sort(() => Math.random() - 0.5);
  E.applyAction(st, 0, { type: 'nation', nation: n1 });
  E.applyAction(st, 1, { type: 'nation', nation: n2 });
  if (E.applyAction(st, 0, { type: 'start' })) throw new Error('start failed');
  const M = getMap(st.mapType, st.seed);
  while (st.phase === 'capital') {
    const err = E.applyAction(st, st.cur, { type: 'capital', t: pick(E.capOptions(st)) });
    if (err) throw new Error(err);
  }
  let steps = 0;
  while (st.phase === 'play' && steps < 20000) {
    steps++;
    const s = st.cur;
    if (E.needsCapital(st, s)) {
      const e = E.applyAction(st, s, { type: 'recap', t: pick(E.recapOptions(st, s)) });
      if (e) throw new Error(e);
      recaps++;
    }
    const em = E.emperorOptions(st, s);
    if (em.length && Math.random() < 0.3) E.applyAction(st, s, { type: 'emperor', t: pick(em) });
    const dev = [...E.devOptions(st, s).keys()];
    const atk = E.atkOptions(st, s);
    const mv = E.moveOptions(st, s);
    const cl = E.clearOptions(st, s);
    if (cl.length && Math.random() < 0.5) E.applyAction(st, s, { type: 'clear', t: pick(cl) });
    let a;
    if (st.chain === 'dev') a = dev.length ? { type: 'develop', t: pick(dev) } : { type: 'end' };
    else if (st.chain === 'atk') a = atk.length ? { type: 'attack', ...pick(atk) } : { type: 'end' };
    else if (dev.length && Math.random() < 0.75) a = { type: 'develop', t: pick(dev) };
    else if (atk.length) a = { type: 'attack', ...pick(atk) };
    else if (mv.length && Math.random() < 0.2) a = { type: 'move', t: pick(mv) };
    else a = { type: 'end' };
    const err = E.applyAction(st, s, a);
    if (err) throw new Error(`${err} ${JSON.stringify(a)}`);
  }
  totalRounds += st.round;
  console.log(`${type.padEnd(9)} 區域${String(M.n).padStart(3)} 海路${String(M.lanes.length).padStart(3)}  ${n1} vs ${n2}  ${st.phase === 'over' ? '勝者 ' + st.players[st.winner].nation : '未分勝負'}  回合 ${st.round}`);
}
console.log('平均回合', (totalRounds / games).toFixed(1), '另立首都次數', recaps);
