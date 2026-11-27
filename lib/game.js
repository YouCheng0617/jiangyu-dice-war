// 規則引擎：伺服器用它結算行動，瀏覽器用同一份函式算出可點的目標與勝率。
import { getMap } from './mapgen.js';

export const NATIONS = {
  JP: { name: '日本', color: 'var(--n-JP)', skill: '天皇', desc: '每 2 回合可免費（不算行動）把首都遷到任意自有領土；目的地原有標記清空，但舊首都身上的標記會跟著帶過去。' },
  UK: { name: '英國', color: 'var(--n-UK)', skill: '日不落', desc: '跨海戰鬥修正 +2（抵銷跨海 −1 後淨 +1，成功率略高於失敗率）。第一回合可連續開墾兩塊地。' },
  US: { name: '美國', color: 'var(--n-US)', skill: '軍火商', desc: '進攻修正 +1；被進攻時，敵方修正 −1。' },
  IT: { name: '義大利', color: 'var(--n-IT)', skill: '美食家', desc: '進攻修正 −2；領土需 3 層標記才失守（首都 4 層）；每 3 回合可免費清除一塊領土 1 層標記。' },
  FR: { name: '法國', color: 'var(--n-FR)', skill: '馬奇諾防線', desc: '敵人從陸路進攻首都、或與首都相鄰的領土時，敵方修正 −2；跨海進攻不受影響。' },
  DE: { name: '德國', color: 'var(--n-DE)', skill: '閃電戰', desc: '出兵領土沒有任何標記、且進攻成功（含大成功）時，本回合可再佔領 1 次；這第二次進攻失敗不進入冷卻。' },
  SU: { name: '蘇聯', color: 'var(--n-SU)', skill: '冬將軍', desc: '敵人奪下蘇聯領土時，該地附帶焦土：佔領方 2 回合內不能從該地出兵或開墾。' },
};
export const NATION_KEYS = Object.keys(NATIONS);
export const RES_LABEL = { CS: '大成功', S: '成功', F: '失敗', CF: '大失敗' };
export const MAP_TYPES = { continent: '大陸', islands: '群島', mixed: '混合' };
export const MAP_SIZES = { small: '小', medium: '中', large: '大' };
export const MAX_ROUNDS = 40; // 超過這個回合數就結算：領土多者勝，同數平局
export const MAX_PLAYERS = 2;
export const CAP_LIVES = 2; // 首都被攻陷幾次才滅國

const roll = (n) => 1 + Math.floor(Math.random() * n);
const randSeed = () => Math.floor(Math.random() * 2147483647);

export function newRoom(code) {
  return {
    code, phase: 'lobby', mapType: 'mixed', mapSize: 'medium', seed: randSeed(), why: null,
    players: [], round: 0, cur: 0, capPicks: 0,
    t: [], cd: {}, chain: null, devLeft: 0, usedExtra: false,
    log: [], ev: null, evId: 0, winner: -1, ver: 0,
  };
}
export function newPlayer(name) {
  return { name: (name || '玩家').slice(0, 12), nation: null, online: true, alive: true, cap: -1, capLost: 0, last: -99, first: true };
}

export const mapOf = (st) => getMap(st.mapType, st.seed, st.mapSize);
export const natOf = (st, s) => NATIONS[st.players[s]?.nation] || { name: '？', color: '#888888' };
const tn = (st, t) => mapOf(st).T[t].name;

// ── 查詢 ─────────────────────────────────────────
export function cnt(st, s) { let c = 0; for (const x of st.t) if (x.o === s) c++; return c; }
export function isCap(st, t) { const o = st.t[t].o; return o >= 0 && st.players[o].cap === t; }
export function need(st, t) {
  const o = st.t[t].o;
  let n = isCap(st, t) ? 3 : 2;
  if (o >= 0 && st.players[o].nation === 'IT') n++;
  return n;
}
export function scorched(st, t) { return st.t[t].sc >= st.round; }
export function usable(st, t, s) { const x = st.t[t]; return x.o === s && x.m === 0 && x.sc < st.round; }
export function cooldown(st, s, t) {
  if (isCap(st, t)) return 0;
  const v = st.cd[s + '_' + t];
  return v !== undefined && v >= st.round ? v : 0;
}
export function skillEvery(nation) { return nation === 'JP' ? 2 : nation === 'IT' ? 3 : 0; }
export function skillReady(st, s) {
  const p = st.players[s]; const k = skillEvery(p.nation);
  return k > 0 && st.round - p.last >= k;
}

// d12：1 = 大失敗、12 = 大成功（各 1/12）。2–11 加修正值 ≥ 7 為成功。
// 修正值：國力差 (敵方領土 − 我方領土) ÷ 3（上限 ±2）、跨海 −1、國家技能；總和限制在 ±4。
export function odds(st, s, src, t) {
  const M = mapOf(st);
  const a = st.players[s], di = st.t[t].o, d = st.players[di];
  let mod = 0; const notes = [];
  const diff = cnt(st, di) - cnt(st, s);
  const sm = Math.max(-2, Math.min(2, Math.trunc(diff / 3)));
  if (sm) { mod += sm; notes.push(['國力差', sm]); }
  const sea = !M.landAdj[src].has(t);
  if (sea) {
    mod -= 1; notes.push(['跨海', -1]);
    if (a.nation === 'UK') { mod += 2; notes.push(['日不落', 2]); }
  }
  if (a.nation === 'US') { mod += 1; notes.push(['軍火商', 1]); }
  if (d.nation === 'US') { mod -= 1; notes.push(['敵方軍火商', -1]); }
  if (M.T[t].mtn) { mod -= 1; notes.push(['山脈防守', -1]); }
  if (M.T[src].mtn) { mod -= 1; notes.push(['山脈出兵', -1]); }
  if (a.nation === 'IT') { mod -= 2; notes.push(['美食家', -2]); }
  if (d.nation === 'FR' && !sea && d.cap >= 0 && (t === d.cap || M.landAdj[t].has(d.cap))) { mod -= 2; notes.push(['馬奇諾防線', -2]); }
  mod = Math.max(-4, Math.min(4, mod));
  const tCap = t === d.cap, sCap = src === a.cap;
  const strip = [];
  for (let r = 1; r <= 12; r++) strip.push(rollRes(r, mod, tCap, sCap));
  const c = { CS: 0, S: 0, F: 0, CF: 0 };
  for (const x of strip) c[x]++;
  return { mod, notes, strip, c, sea, tCap, sCap, src };
}
function rollRes(r, mod, tCap, sCap) {
  if (r === 12) return tCap ? 'S' : 'CS'; // 首都沒有大成功
  if (r === 1) return sCap ? 'F' : 'CF'; // 從首都出兵沒有大失敗
  return r + mod >= 7 ? 'S' : 'F';
}

export function devOptions(st, s) {
  const M = mapOf(st), out = new Map();
  for (let t = 0; t < M.n; t++) {
    if (st.t[t].o !== -1) continue;
    let land = false, sea = false;
    for (const n of M.landAdj[t]) if (usable(st, n, s)) { land = true; break; }
    if (!land) for (const n of M.seaAdj[t]) if (usable(st, n, s)) { sea = true; break; }
    if (!land && !sea) continue;
    const mtn = !!M.T[t].mtn;
    // 需擲 d6 的次數：跨海一次、山脈一次，疊加上限 3
    const dice = Math.min(3, (!land ? 1 : 0) + (mtn ? 1 : 0));
    out.set(t, { sea: !land, mtn, dice });
  }
  return out;
}
export function atkOptions(st, s) {
  const M = mapOf(st), out = [];
  for (let src = 0; src < M.n; src++) {
    if (!usable(st, src, s)) continue;
    for (const t of M.adj[src]) {
      const o = st.t[t].o;
      if (o < 0 || o === s || !st.players[o].alive) continue;
      if (cooldown(st, s, t)) continue;
      out.push({ src, t });
    }
  }
  return out;
}
export function bestSrc(st, s, t) {
  const M = mapOf(st); let b = -1, bv = -1e9;
  for (const src of M.adj[t]) {
    if (!usable(st, src, s)) continue;
    const o = odds(st, s, src, t);
    const v = o.c.CS * 1.2 + o.c.S - o.c.CF * 0.5;
    if (v > bv) { bv = v; b = src; }
  }
  return b;
}
export function moveOptions(st, s) {
  const M = mapOf(st), p = st.players[s], out = [];
  if (p.cap < 0) return out;
  for (const t of M.landAdj[p.cap]) if (st.t[t].o === s && st.t[t].m === 0) out.push(t);
  return out;
}
// 日本「天皇」：免費遷都到任意自有領土
export function emperorOptions(st, s) {
  const p = st.players[s], out = [];
  if (p.nation !== 'JP' || p.cap < 0 || !skillReady(st, s)) return out;
  for (let t = 0; t < st.t.length; t++) if (st.t[t].o === s && t !== p.cap) out.push(t);
  return out;
}
// 首都被攻陷後，要重新選的首都
export function needsCapital(st, s) { const p = st.players[s]; return !!p && p.alive && p.cap < 0; }
export function recapOptions(st, s) {
  const out = [];
  for (let t = 0; t < st.t.length; t++) if (st.t[t].o === s) out.push(t);
  return out;
}
export function clearOptions(st, s) {
  const p = st.players[s];
  if (p.nation !== 'IT' || !skillReady(st, s)) return [];
  const out = [];
  for (let t = 0; t < st.t.length; t++) if (st.t[t].o === s && st.t[t].m > 0) out.push(t);
  return out;
}
export function capOptions(st) {
  const M = mapOf(st), out = [];
  const caps = st.players.map((p) => p.cap).filter((c) => c >= 0);
  for (let t = 0; t < M.n; t++) {
    if (st.t[t].o !== -1) continue;
    if (caps.some((c) => M.adj[c].includes(t))) continue;
    out.push(t);
  }
  return out;
}

// ── 結算 ─────────────────────────────────────────
function log(st, s, text) {
  st.log.push({ r: st.round, s, text });
  if (st.log.length > 80) st.log.splice(0, st.log.length - 80);
}
function setEv(st, ev) { st.evId++; st.ev = { id: st.evId, ...ev }; }

export const RECOVER = 3; // 連續幾回合沒被加標記，就自動消除 1 層
function startTurn(st) {
  const p = st.players[st.cur];
  st.chain = null; st.usedExtra = false;
  const healed = [];
  for (let t = 0; t < st.t.length; t++) {
    const x = st.t[t];
    if (x.o === st.cur && x.m > 0 && st.round - x.mt >= RECOVER) {
      x.m--; x.mt = st.round; if (x.m === 0) x.mb = -1;
      healed.push(tn(st, t));
    }
  }
  if (healed.length) log(st, st.cur, `駐軍整頓：${healed.join('、')} 標記 −1`);
  st.devLeft = p.first && p.nation === 'UK' ? 2 : 1;
}
function endTurn(st) {
  if (st.phase !== 'play') return;
  st.players[st.cur].first = false;
  const n = st.players.length; let i = st.cur;
  for (let k = 0; k < n; k++) {
    i = (i + 1) % n;
    if (i === 0) st.round++;
    if (st.players[i].alive) break;
  }
  if (st.round > MAX_ROUNDS) { endByTime(st); return; }
  st.cur = i;
  startTurn(st);
}
function checkWin(st) {
  const alive = st.players.map((p, i) => (p.alive ? i : -1)).filter((i) => i >= 0);
  if (alive.length === 1) {
    st.phase = 'over'; st.winner = alive[0]; st.chain = null; st.why = 'war';
    log(st, alive[0], `${natOf(st, alive[0]).name} 統一了這片土地！`);
  }
}
// 時間到：比領土數，多者勝；同數為平局（winner = -1）
function endByTime(st) {
  const cs = st.players.map((_, i) => cnt(st, i));
  const best = Math.max(...cs);
  const top = cs.map((c, i) => (c === best ? i : -1)).filter((i) => i >= 0);
  st.phase = 'over'; st.chain = null; st.why = 'time';
  if (top.length === 1) {
    st.winner = top[0];
    log(st, top[0], `第 ${MAX_ROUNDS} 回合結束，${natOf(st, top[0]).name} 領土最多（${best} 塊）`);
  } else {
    st.winner = -1;
    log(st, -1, `第 ${MAX_ROUNDS} 回合結束，雙方領土同為 ${best} 塊，平局`);
  }
}
function capture(st, t, by) {
  const prev = st.t[t].o, P = st.players[prev], nameT = tn(st, t);
  if (P.cap === t && P.capLost + 1 < CAP_LIVES) {
    P.capLost++; P.cap = -1;
    st.t[t].o = by; st.t[t].m = 0; st.t[t].mb = -1;
    if (cnt(st, prev) === 0) {
      P.alive = false;
      log(st, by, `攻陷首都 ${nameT}！${NATIONS[P.nation].name} 已無領土，滅亡`);
    } else {
      log(st, by, `攻陷首都 ${nameT}！${NATIONS[P.nation].name} 必須另立首都（再失守一次就滅國）`);
    }
  } else if (P.cap === t) {
    P.capLost++;
    for (let i = 0; i < st.t.length; i++) {
      const x = st.t[i];
      if (x.o === prev) { x.o = by; x.m = 0; x.mb = -1; }
      else if (x.mb === prev) { x.m = 0; x.mb = -1; }
    }
    P.alive = false; P.cap = -1;
    log(st, by, `再次攻陷首都 ${nameT}！${NATIONS[P.nation].name} 滅亡，全部領土歸 ${natOf(st, by).name}`);
  } else {
    st.t[t].o = by; st.t[t].m = 0; st.t[t].mb = -1;
    log(st, by, `拿下 ${nameT}`);
  }
  if (P.nation === 'SU') {
    st.t[t].sc = st.round + 2;
    log(st, prev, `冬將軍：${nameT} 成為焦土，${natOf(st, by).name} 2 回合內無法從此出兵`);
  }
  checkWin(st);
}
function checkCapture(st, t) {
  const x = st.t[t];
  if (x.o >= 0 && x.mb >= 0 && x.mb !== x.o && x.m >= need(st, t)) capture(st, t, x.mb);
}

function doDevelop(st, s, t) {
  const opt = devOptions(st, s).get(t);
  if (!opt) return '這塊地無法開墾';
  const nm = natOf(st, s).name;
  const why = [opt.sea && '跨海', opt.mtn && '山脈'].filter(Boolean).join('・');
  const kind = why ? `${why}開墾` : '開墾';
  let ok = true; const rolls = [];
  for (let k = 0; k < opt.dice; k++) {
    const r = roll(6); rolls.push(r);
    if (r === 1 || r === 6) ok = false;
  }
  if (opt.dice) {
    setEv(st, {
      seat: s, sides: 6, r: rolls.find((r) => r === 1 || r === 6) ?? rolls[0], res: ok ? 'S' : 'F',
      strip: [1, 2, 3, 4, 5, 6].map((v) => (v === 1 || v === 6 ? 'F' : 'S')),
      title: `${nm} ${kind} ${tn(st, t)}`,
      sub: `擲 d6 ×${opt.dice}：${rolls.join('、')}，出 1 或 6 失敗`,
    });
  }
  if (ok) { st.t[t].o = s; log(st, s, `${kind} ${tn(st, t)}`); }
  else log(st, s, `${kind} ${tn(st, t)} 失敗`);
  st.devLeft--;
  if (st.devLeft > 0 && devOptions(st, s).size > 0) { st.chain = 'dev'; return null; }
  endTurn(st);
  return null;
}

function doAttack(st, s, src, t) {
  const M = mapOf(st);
  if (src === undefined || src < 0) src = bestSrc(st, s, t);
  if (src < 0 || !usable(st, src, s)) return '這塊領土目前不能出兵';
  if (!M.adj[src].includes(t)) return '出兵地與目標不相鄰';
  const di = st.t[t].o;
  if (di < 0 || di === s) return '只能進攻敵方領土';
  if (cooldown(st, s, t)) return '上次進攻失敗，這塊地還在冷卻';
  const a = st.players[s], o = odds(st, s, src, t);
  const r = roll(12), res = o.strip[r - 1];
  const srcClean = st.t[src].m === 0;
  const blitz = st.chain === 'atk'; // 德國閃電戰的第二次進攻
  setEv(st, {
    seat: s, sides: 12, r, res, strip: o.strip,
    title: `${natOf(st, s).name} 進攻 ${tn(st, t)}${o.tCap ? '（首都）' : ''}`,
    sub: `從 ${tn(st, src)} 出兵${o.sea ? '・跨海' : ''}・修正 ${o.mod >= 0 ? '+' : ''}${o.mod}`,
  });
  if (res === 'CS' || res === 'S') {
    const add = res === 'CS' ? 2 : 1;
    st.t[t].m += add; st.t[t].mb = s; st.t[t].mt = st.round;
    log(st, s, `${RES_LABEL[res]}！${tn(st, t)} 標記 ${Math.min(st.t[t].m, need(st, t))}/${need(st, t)}`);
    checkCapture(st, t);
  } else if (res === 'F') {
    // 閃電戰的第二次進攻失敗不進入冷卻
    const cool = !o.tCap && !blitz;
    if (cool) st.cd[s + '_' + t] = st.round + 1;
    log(st, s, `進攻 ${tn(st, t)} 失敗${cool ? '，下回合不能再打這塊地' : ''}`);
  } else {
    if (!o.tCap) st.cd[s + '_' + t] = st.round + 1;
    st.t[src].m += 1; st.t[src].mb = di; st.t[src].mt = st.round;
    log(st, s, `大失敗！進攻 ${tn(st, t)} 潰敗，${tn(st, src)} 被反標記`);
    checkCapture(st, src);
  }
  if (st.phase !== 'play') return null;
  if ((res === 'CS' || res === 'S') && a.nation === 'DE' && srcClean && !st.usedExtra && atkOptions(st, s).length) {
    st.usedExtra = true; st.chain = 'atk';
    log(st, s, '閃電戰：本回合可再佔領一次');
    return null;
  }
  endTurn(st);
  return null;
}

function doMove(st, s, t) {
  if (!moveOptions(st, s).includes(t)) return '無法遷都到這裡';
  const p = st.players[s], old = p.cap;
  p.cap = t;
  log(st, s, `首都遷往 ${tn(st, t)}`);
  checkCapture(st, old);
  if (st.phase === 'play') endTurn(st);
  return null;
}

function doEmperor(st, s, t) {
  if (!emperorOptions(st, s).includes(t)) return '目前無法用天皇遷都到這裡';
  const p = st.players[s], old = p.cap;
  p.cap = t; p.last = st.round;
  st.t[t].m = st.t[old].m; st.t[t].mb = st.t[old].mb; st.t[t].mt = st.t[old].mt; st.t[t].sc = -99;
  st.t[old].m = 0; st.t[old].mb = -1;
  log(st, s, `天皇：首都遷往 ${tn(st, t)}（不耗行動）`);
  checkCapture(st, old);
  return null;
}

function doRecap(st, s, t) {
  if (!needsCapital(st, s)) return '你的首都還在';
  if (!recapOptions(st, s).includes(t)) return '新首都必須是自己的領土';
  st.players[s].cap = t;
  log(st, s, `另立首都於 ${tn(st, t)}`);
  checkCapture(st, t);
  return null;
}

function doClear(st, s, t) {
  if (!clearOptions(st, s).includes(t)) return '目前無法清除這塊地的標記';
  st.t[t].m--; if (st.t[t].m === 0) st.t[t].mb = -1;
  st.players[s].last = st.round;
  log(st, s, `美食家：${tn(st, t)} 清除 1 層標記`);
  return null;
}

// ── 對外入口 ─────────────────────────────────────
export function applyAction(st, s, a) {
  const err = dispatch(st, s, a);
  if (!err) st.ver++;
  return err;
}
function dispatch(st, s, a) {
  const P = st.players[s];
  if (!P) return '你是觀戰者，無法行動';
  const host = s === 0;
  if (st.phase === 'lobby') {
    if (a.type === 'mapType') {
      if (!host) return '只有房主能改地圖';
      if (!MAP_TYPES[a.mapType]) return '未知的地形';
      st.mapType = a.mapType; st.seed = randSeed(); return null;
    }
    if (a.type === 'mapSize') {
      if (!host) return '只有房主能改地圖';
      if (!MAP_SIZES[a.mapSize]) return '未知的地圖大小';
      st.mapSize = a.mapSize; st.seed = randSeed(); return null;
    }
    if (a.type === 'reroll') { if (!host) return '只有房主能改地圖'; st.seed = randSeed(); return null; }
    if (a.type === 'nation') {
      if (!NATIONS[a.nation]) return '未知的國家';
      if (st.players.some((p, i) => i !== s && p.nation === a.nation)) return '對手已選了這個國家';
      P.nation = a.nation; return null;
    }
    if (a.type === 'start') {
      if (!host) return '只有房主能開始';
      if (st.players.length < 2) return '還在等對手加入';
      if (st.players.some((p) => !p.nation)) return '每位玩家都要先選國家';
      const M = mapOf(st);
      st.t = M.T.map(() => ({ o: -1, m: 0, mb: -1, mt: 0, sc: -99 }));
      st.players.forEach((p) => Object.assign(p, { alive: true, cap: -1, capLost: 0, last: -99, first: true }));
      st.cd = {}; st.log = []; st.ev = null; st.winner = -1; st.why = null; st.chain = null;
      st.round = 0; st.capPicks = 0;
      st.cur = Math.floor(Math.random() * st.players.length);
      st.phase = 'capital';
      log(st, -1, `開戰！由 ${natOf(st, st.cur).name} 先選首都`);
      return null;
    }
    return '大廳中無法進行這個動作';
  }
  if (st.phase === 'capital') {
    if (a.type !== 'capital') return '請先選擇首都';
    if (s !== st.cur) return '還沒輪到你選首都';
    if (!capOptions(st).includes(a.t)) return '首都不能選在已有人的土地或對手首都旁';
    st.t[a.t].o = s; P.cap = a.t;
    log(st, s, `定都於 ${tn(st, a.t)}`);
    st.capPicks++;
    const first = st.cur;
    st.cur = (st.cur + 1) % st.players.length;
    if (st.capPicks >= st.players.length) {
      // 後選首都的一方先行動
      st.phase = 'play'; st.round = 1; st.cur = first;
      startTurn(st);
      log(st, -1, `第 1 回合開始，${natOf(st, st.cur).name} 先手`);
    }
    return null;
  }
  if (st.phase === 'play') {
    if (s !== st.cur) return '還沒輪到你';
    if (!P.alive) return '你已經滅亡了';
    if (a.type === 'recap') return doRecap(st, s, a.t);
    if (needsCapital(st, s)) return '首都已失守，請先選一塊領土當新首都';
    switch (a.type) {
      case 'develop': if (st.chain && st.chain !== 'dev') return '現在只能進攻或結束回合'; return doDevelop(st, s, a.t);
      case 'attack': if (st.chain && st.chain !== 'atk') return '現在只能開墾或結束回合'; return doAttack(st, s, a.src, a.t);
      case 'move': if (st.chain) return '現在不能遷都'; return doMove(st, s, a.t);
      case 'clear': return doClear(st, s, a.t);
      case 'emperor': return doEmperor(st, s, a.t);
      case 'end':
        log(st, s, st.chain ? '結束回合' : '按兵不動');
        endTurn(st); return null;
      default: return '未知的行動';
    }
  }
  if (st.phase === 'over') {
    if (a.type === 'rematch') {
      if (!host) return '只有房主能開新局';
      st.phase = 'lobby'; st.seed = randSeed(); st.t = []; st.log = []; st.ev = null; st.winner = -1; st.why = null;
      return null;
    }
  }
  return '現在無法這麼做';
}
