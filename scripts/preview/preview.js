import * as E from '../../lib/game.js';
import { getMap } from '../../lib/mapgen.js';
import { buildGeo, drawScene, CS } from '../../lib/mapdraw.js';
import { mapTheme, nationColors } from '../../lib/theme.js';
import { startSeaBg } from '../../lib/seabg.js';

const q = new URLSearchParams(location.search);
const theme = q.get('theme') || 'classic';
const view = q.get('view') || 'play';
if (theme !== 'classic') document.documentElement.dataset.theme = theme;
const { NATIONS, NATION_KEYS, MAP_TYPES, RES_LABEL } = E;

// 固定亂數，每次得到同一局
(function seed() { let a = 20261127; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();

function makeState() {
  const st = E.newRoom('QX7KD');
  st.players = [E.newPlayer('宥成'), E.newPlayer('柚子')];
  st.players[0].nation = 'SU'; st.players[1].nation = 'DE';
  st.mapType = 'mixed'; st.seed = 4711;
  if (view === 'lobby') { st.players[1].nation = 'FR'; st.players[0].nation = 'JP'; return st; }
  E.applyAction(st, 0, { type: 'start' });
  for (let i = 0; i < 2; i++) { const o = E.capOptions(st); E.applyAction(st, st.cur, { type: 'capital', t: o[Math.floor(o.length / 3)] }); }
  for (let turn = 0; turn < 34 && st.phase === 'play'; turn++) {
    const s = st.cur;
    const atk = E.atkOptions(st, s), dev = [...E.devOptions(st, s).keys()];
    let err = null;
    if (atk.length && turn % 3 === 2) { const a = atk[0]; err = E.applyAction(st, s, { type: 'attack', src: a.src, t: a.t }); }
    else if (dev.length) err = E.applyAction(st, s, { type: 'develop', t: dev[Math.floor(Math.random() * dev.length)] });
    else err = E.applyAction(st, s, { type: 'end' });
    if (st.phase !== 'play') break;
    if (st.cur === s || st.chain) E.applyAction(st, st.cur, { type: 'end' });
    st.ev = null;
  }
  while (st.cur !== 0 && st.phase === 'play') E.applyAction(st, st.cur, { type: 'end' });
  // 為了讓預覽一次看到所有符號：直接改幾格的狀態
  const mine = st.t.map((x, i) => (x.o === 1 && !E.isCap(st, i) ? i : -1)).filter((i) => i >= 0);
  if (mine[0] !== undefined) { st.t[mine[0]].m = 1; st.t[mine[0]].mb = 0; }
  if (mine[1] !== undefined) { st.t[mine[1]].m = 2; st.t[mine[1]].mb = 0; }
  if (mine[2] !== undefined) st.t[mine[2]].sc = st.round + 1;
  if (view === 'over') { st.phase = 'over'; st.winner = 0; }
  return st;
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const sign = (n) => (n > 0 ? '+' + n : String(n));
const pct = (n) => Math.round((n / 12) * 100) + '%';

const header = (st) => `
<header class="top">
  <div class="brand"><span class="mark">疆</span><div><h1>疆域骰戰</h1><p class="tag">兩人連線 · 擲骰定疆界</p></div></div>
  <div class="topr"><label class="themepick"><span class="lbl">外觀</span><select><option>${esc(theme)}</option></select></label>
  ${st ? '<span class="net ok">已連線</span><button class="btn ghost sm">離開房間</button>' : ''}</div>
</header>`;

function entry() {
  return `<div class="shell">${header(null)}
<main class="entry">
  <section class="hero"><h2>畫下國界，擲出天下</h2>
    <p>選一個國家、定下首都，向四周開墾空地。遇到對手就擲 d12：大成功直接拿地，大失敗則賠上自己的出兵地。攻陷對方首都兩次的一方獲勝。</p>
    <ul class="nlist">${NATION_KEYS.map((k) => `<li data-n="${k}" style="--pc:${NATIONS[k].color}"><b>${NATIONS[k].name}</b><span>${NATIONS[k].skill}</span></li>`).join('')}</ul>
  </section>
  <section class="card join"><label class="lbl">你的名字</label><input class="input" placeholder="例如：小明" value="宥成">
    <button class="btn primary">建立房間</button><div class="or"><span>或輸入朋友給你的房號</span></div>
    <form class="row"><input class="input code" placeholder="ABCDE" value="QX7KD"><button class="btn">加入</button></form>
    <p class="muted small">開房的人就是房主，遊戲在房主的瀏覽器上運算。房主要開著這個頁面，對局才能進行。</p></section>
</main></div>`;
}

const rules = `<details class="card rules"><summary>規則與判定表</summary><ul><li>每回合只能做一件事：<b>開墾</b>、<b>佔領</b>或<b>遷都</b>。</li></ul></details>`;

function lobby(st) {
  const map = getMap(st.mapType, st.seed);
  return `<div class="shell">${header(st)}<main class="game">
<section class="board"><canvas class="map" id="map"></canvas><div class="legend">${MAP_TYPES[st.mapType]}・${map.n} 個區域・${map.lanes.length} 條海路</div></section>
<aside class="side">
<section class="card"><div class="lbl">房號</div><div class="roomcode">${st.code}</div><p class="muted small">把房號或連結傳給對手，對方打開就會加入。</p><div class="link"><code>https://jiangyu.vercel.app/?room=${st.code}</code><button class="btn sm">複製</button></div></section>
<section class="card"><div class="lbl">地形</div><div class="seg">${Object.entries(MAP_TYPES).map(([k, v]) => `<button class="${k === st.mapType ? 'on' : ''}">${v}</button>`).join('')}</div><button class="btn ghost sm wide">換一張地圖</button></section>
<section class="card"><div class="lbl">參戰國</div>
${[0, 1].map((i) => { const p = st.players[i]; return `<div class="seat"><div class="seathead"><span class="dot" style="background:${NATIONS[p.nation].color}"></span><b>${p.name}</b>${i === 0 ? '<span class="chip">房主</span><span class="chip you">你</span>' : ''}</div>
${i === 0 ? `<div class="ngrid">${NATION_KEYS.map((k) => { const taken = st.players[1].nation === k; return `<button data-n="${k}" class="nbtn${p.nation === k ? ' on' : ''}" style="--pc:${NATIONS[k].color}" ${taken ? 'disabled' : ''}><b>${NATIONS[k].name}</b><small>${taken ? '對手已選' : NATIONS[k].skill}</small></button>`; }).join('')}</div>` : ''}
<p class="skill"><b>${NATIONS[p.nation].name}「${NATIONS[p.nation].skill}」</b>${NATIONS[p.nation].desc}</p></div>`; }).join('')}
<button class="btn primary wide">開戰</button></section>${rules}</aside></main></div>`;
}

function play(st) {
  const map = getMap(st.mapType, st.seed);
  const me = st.players[0], n = NATIONS[me.nation];
  const curN = E.natOf(st, st.cur);
  // 選一個進攻示範
  const atk = E.atkOptions(st, 0);
  let line = null, odds = null, focus = -1, src = -1, targets = new Set(), srcs = new Set();
  if (atk.length) {
    const a = atk[atk.length - 1]; src = a.src; focus = a.t; line = [a.src, a.t];
    odds = E.odds(st, 0, a.src, a.t);
    atk.forEach((x) => { targets.add(x.t); srcs.add(x.src); });
  }
  st.__ui = { targets, srcs, src, focus, hover: -1, line };
  const T = focus >= 0 ? map.T[focus] : null, x = focus >= 0 ? st.t[focus] : null;
  const owner = x && x.o >= 0 ? st.players[x.o] : null, on = owner ? NATIONS[owner.nation] : null;
  const total = map.n;
  const roster = st.players.map((p, i) => { const nn = NATIONS[p.nation], c = E.cnt(st, i), capM = p.cap >= 0 ? st.t[p.cap].m : 0;
    return `<div data-n="${p.nation}" class="rrow${st.cur === i ? ' cur' : ''}" style="--pc:${nn.color}"><div class="rtop"><span class="dot"></span><b>${nn.name}</b><span class="muted">${p.name}</span>${i === 0 ? '<span class="chip you">你</span>' : ''}<span class="num">${c}<small>/${total}</small></span></div><div class="bar"><i style="width:${(c / total) * 100}%"></i></div><div class="small muted">首都 ${map.T[p.cap].name}・標記 ${capM}/${E.need(st, p.cap)}・命 ${E.CAP_LIVES - p.capLost}/${E.CAP_LIVES}</div></div>`; }).join('');
  const log = [...st.log].reverse().slice(0, 5).map((l) => `<li><span class="r">${l.r > 0 ? 'R' + l.r : '—'}</span>${l.s >= 0 ? `<span class="dot" style="background:${E.natOf(st, l.s).color}"></span>` : ''}<span>${l.s >= 0 ? `<b>${E.natOf(st, l.s).name}</b>` : ''} ${esc(l.text)}</span></li>`).join('');
  const oddsHtml = odds ? `<div class="odds"><div class="ohead">從 <b>${map.T[odds.src].name}</b> 出兵${odds.sea ? '・跨海' : '・陸路'}<span class="mod">修正 ${sign(odds.mod)}</span></div>
<div class="strip">${odds.strip.map((r, i) => `<i class="${r.toLowerCase()}">${i + 1}</i>`).join('')}</div>
<div class="pcts">${['CS', 'S', 'F', 'CF'].map((k) => `<span class="${k.toLowerCase()}"><em>${RES_LABEL[k]}</em>${pct(odds.c[k])}</span>`).join('')}</div>
${odds.notes.length ? `<div class="notes">${odds.notes.map(([k, v]) => `<span>${k} ${sign(v)}</span>`).join('')}</div>` : ''}</div>` : '';
  const over = st.phase === 'over' ? `<div class="over"><div class="obox" style="--pc:${E.natOf(st, st.winner).color}"><div class="lbl">勝利</div><h2>${E.natOf(st, st.winner).name} 統一天下</h2><p>${st.players[st.winner].name} 在第 ${st.round} 回合攻陷敵方首都。</p><button class="btn primary">回大廳再來一局</button></div></div>` : '';
  const dice = view === 'dice' ? diceOverlay(st, odds, map) : '';
  return `<div class="shell">${header(st)}<main class="game">
<section class="board"><div class="banner" style="--pc:${curN.color}"><span class="bdot"></span>第 ${st.round} 回合<span class="bsep">·</span><b>輪到你</b></div>
<canvas class="map" id="map"></canvas>${over}</section>
<aside class="side">
<section class="turn" data-n="${me.nation}" style="--pc:${n.color}"><div class="flag"><b>${n.name}</b><span>${me.name}</span></div><p class="skill"><b>「${n.skill}」</b>${n.desc}</p></section>
<section class="actions"><button class="btn act"><span>開墾</span><small>5 處</small></button><button class="btn act on"><span>佔領</span><small>${new Set(atk.map((a) => a.t)).size} 處</small></button><button class="btn act"><span>遷都</span><small>2 處</small></button><button class="btn end">跳過</button></section>
<p class="hint mine">點敵方領土進攻（自動挑勝率最高的出兵地），或先點虛線框的自有領土指定出兵地。</p>
${T ? `<section class="card info" style="${on ? `--pc:${on.color}` : ''}"><div class="ihead"><span class="dot" style="background:${on ? on.color : 'var(--parch)'}"></span><b>${T.name}</b>${E.isCap(st, focus) ? '<span class="chip cap">★ 首都</span>' : ''}</div>
<dl class="facts"><dt>歸屬</dt><dd>${owner ? `${on.name}（${owner.name}）` : '無主之地'}</dd><dt>面積</dt><dd>${T.size} 格</dd>${owner ? `<dt>佔領標記</dt><dd class="${x.m ? 'warn' : ''}">${x.m} / ${E.need(st, focus)}</dd>` : ''}</dl>${oddsHtml}</section>` : ''}
<section class="card roster">${roster}</section>
<section class="card"><div class="lbl">戰報</div><ol class="log">${log}</ol></section>${rules}</aside></main>${dice}</div>`;
}

function diceOverlay(st, odds, map) {
  const res = q.get('res') || 'CS';
  const r = { CS: 12, S: 9, F: 4, CF: 1 }[res];
  const strip = odds ? odds.strip : Array(12).fill('S');
  const me = NATIONS[st.players[0].nation];
  return `<div class="dice"><div class="dbox" style="--pc:${me.color}"><div class="dwho">你的行動</div><div class="dtitle">${me.name} 進攻 ${map.T[odds ? 0 : 0].name}</div><div class="dsub">擲 d12，修正 ${odds ? sign(odds.mod) : '+0'}</div>
<div class="die ${res.toLowerCase()}"><span>${r}</span><small>d12</small></div>
<div class="strip big">${strip.map((x, i) => `<i class="${x.toLowerCase()}${i + 1 === r ? ' on' : ''}">${i + 1}</i>`).join('')}</div>
<div class="dres ${res.toLowerCase()}">${RES_LABEL[res]}</div><div class="dhint">點一下繼續</div></div></div>`;
}

const st = makeState();
document.getElementById('app').innerHTML = view === 'entry' ? entry() : view === 'lobby' ? lobby(st) : play(st);

await document.fonts.ready;
const cv = document.getElementById('map');
if (cv) {
  const map = getMap(st.mapType, st.seed);
  const dpr = 2;
  cv.width = map.W * CS * dpr; cv.height = map.H * CS * dpr;
  const ctx = cv.getContext('2d');
  const th = mapTheme(), ncol = nationColors(NATION_KEYS);
  const g = buildGeo(map, dpr, th);
  g.hatchP = ctx.createPattern(g.hatch, 'repeat'); g.burnP = ctx.createPattern(g.burn, 'repeat');
  drawScene(ctx, g, map, view === 'lobby' ? null : st, view === 'lobby' ? null : st.__ui, 1000, { th, ncol, dpr, reduce: true, edge: { key: '', paths: [] }, own: { key: '', canvas: null }, rings: new Map(), cssW: cv.clientWidth });
}
// 背景水紋（和正式版同一份程式）
if (theme !== 'classic') startSeaBg(document.getElementById('seabg'));
document.body.dataset.ready = '1';
