'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as E from '../lib/game.js';
import { getMap } from '../lib/mapgen.js';
import { Net, isHostOf, CODE_LEN } from '../lib/net.js';
import MapCanvas from '../components/MapCanvas.js';
import Dice from '../components/Dice.js';

const { NATIONS, NATION_KEYS, MAP_TYPES, RES_LABEL } = E;
// 已完成水墨國徽的國家（public/ink/logo/XX.webp）；其餘國家暫時沒有圖
const LOGO = new Set(['JP', 'UK', 'US', 'IT', 'FR', 'DE', 'SU']);
const Logo = ({ k }) => (LOGO.has(k) ? <img className="nlogo" src={`/ink/logo/${k}.webp`} alt="" width="400" height="400" loading="lazy" /> : null);

function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return null; }
function getToken() {
  let t = store('jy_token');
  if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); store('jy_token', t); }
  return t;
}
const pct = (n) => Math.round((n / 12) * 100) + '%';
const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);

export default function Home() {
  const net = useRef(null);
  const [conn, setConn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hostOn, setHostOn] = useState(true);
  const [view, setView] = useState(null); // { st, you }
  const [dice, setDice] = useState(null);
  const [toast, setToast] = useState('');
  const [name, setName] = useState('');
  const queue = useRef([]);
  const animating = useRef(false);
  const seen = useRef(-1);
  const diceMsg = useRef(null);
  const toastT = useRef(0);

  const flash = useCallback((m) => { setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(''), 2800); }, []);

  const pump = useCallback(() => {
    if (animating.current) return;
    const m = queue.current.shift();
    if (!m) return;
    const ev = m.st.ev;
    if (seen.current >= 0 && ev && ev.id === m.st.evId && ev.id > seen.current) {
      seen.current = ev.id; animating.current = true;
      diceMsg.current = m;
      setDice({ ev, msg: m });
      return;
    }
    seen.current = Math.max(seen.current, m.st.evId);
    setView(m);
    pump();
  }, []);

  const reset = () => { queue.current = []; seen.current = -1; animating.current = false; diceMsg.current = null; setDice(null); setView(null); };

  const enter = useCallback(async (code, asHost) => {
    setBusy(true);
    const nm = store('jy_name') || '玩家';
    let r;
    try { r = asHost ? await net.current.host(nm, code) : await net.current.join(code, nm); }
    catch { r = { error: '連不上中繼伺服器，請檢查網路' }; }
    if (r.aborted) return;
    setBusy(false);
    if (r.error) { flash(r.error); history.replaceState(null, '', location.pathname); reset(); return; }
    history.replaceState(null, '', '?room=' + r.code);
  }, [flash]);

  useEffect(() => {
    setName(store('jy_name') || '');
    const n = new Net({
      token: getToken(),
      onState: (m) => { queue.current.push(m); pump(); },
      onStatus: setConn,
      onHost: setHostOn,
    });
    net.current = n;
    const code = new URLSearchParams(location.search).get('room');
    if (code) enter(code.toUpperCase(), isHostOf(code));
    return () => n.close();
  }, [pump, enter]);

  const diceDone = useCallback(() => {
    if (diceMsg.current) setView(diceMsg.current);
    diceMsg.current = null;
    setDice(null);
    animating.current = false;
    setTimeout(pump, 0);
  }, [pump]);

  const saveName = (v) => { setName(v); store('jy_name', v); };
  const create = () => { reset(); enter(null, true); };
  const joinCode = (code) => { reset(); enter(code, isHostOf(code)); };
  const leave = () => {
    net.current.close(); setConn(false); setBusy(false);
    history.replaceState(null, '', location.pathname);
    reset();
  };
  const act = useCallback((a) => {
    net.current.act(a).then((r) => { if (r?.error) flash(r.error); });
  }, [flash]);

  const st = view?.st;
  const guest = st && view.you !== 0;
  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true">疆</span>
          <div>
            <h1>疆域骰戰</h1>
            <p className="tag">兩人連線 · 擲骰定疆界</p>
          </div>
        </div>
        <div className="topr">
          {(st || busy) && <span className={'net ' + (conn ? 'ok' : 'down')}>{conn ? (guest && !hostOn ? '房主離線' : '已連線') : '連線中…'}</span>}
          {st && <button className="btn ghost sm" onClick={leave}>離開房間</button>}
        </div>
      </header>

      {st && guest && !hostOn && <p className="hostoff">房主暫時離線。房主重新打開遊戲頁面後就能繼續，進度不會不見。</p>}
      {!st && <Entry name={name} setName={saveName} onCreate={create} onJoin={joinCode} busy={busy} />}
      {st && st.phase === 'lobby' && <Lobby st={st} you={view.you} act={act} flash={flash} />}
      {st && st.phase !== 'lobby' && <Game st={st} you={view.you} act={act} />}

      {dice && (
        <Dice
          ev={dice.ev}
          color={E.natOf(dice.msg.st, dice.ev.seat).color}
          mine={dice.ev.seat === dice.msg.you}
          onDone={diceDone}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

// ── 入口 ──────────────────────────────────────────
function Entry({ name, setName, onCreate, onJoin, busy }) {
  const [code, setCode] = useState('');
  return (
    <main className="entry">
      <section className="hero">
        <h2>畫下國界，擲出天下</h2>
        <p>選一個國家、定下首都，向四周開墾空地。遇到對手就擲 d12：大成功直接拿地，大失敗則賠上自己的出兵地。攻陷對方首都兩次的一方獲勝。</p>
        <ul className="nlist">
          {NATION_KEYS.map((k) => (
            <li key={k} data-n={k} style={{ '--pc': NATIONS[k].color }}>
              <Logo k={k} />
              <b>{NATIONS[k].name}</b><span>{NATIONS[k].skill}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="card join">
        <label className="lbl" htmlFor="pname">你的名字</label>
        <input id="pname" className="input" maxLength={12} placeholder="例如：小明" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" disabled={busy} onClick={onCreate}>{busy ? '連線中…' : '建立房間'}</button>
        <div className="or"><span>或輸入朋友給你的房號</span></div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (code.trim()) onJoin(code.trim().toUpperCase()); }}>
          <input id="rcode" className="input code" maxLength={CODE_LEN} placeholder="ABCDE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label="房號" />
          <button className="btn" disabled={busy || code.trim().length < CODE_LEN} type="submit">加入</button>
        </form>
        <p className="muted small">開房的人就是房主，遊戲在房主的瀏覽器上運算。房主要開著這個頁面，對局才能進行。</p>
      </section>
    </main>
  );
}

// ── 大廳 ──────────────────────────────────────────
function Lobby({ st, you, act, flash }) {
  const map = getMap(st.mapType, st.seed);
  const host = you === 0;
  const link = typeof window !== 'undefined' ? `${location.origin}${location.pathname}?room=${st.code}` : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); flash('邀請連結已複製'); }
    catch { flash('請手動複製網址列的連結'); }
  };
  const ready = st.players.length === 2 && st.players.every((p) => p.nation);
  return (
    <main className="game">
      <section className="board">
        <MapCanvas map={map} st={null} ui={null} />
        <div className="legend">{MAP_TYPES[st.mapType]}・{map.n} 個區域・{map.lanes.length} 條海路</div>
      </section>
      <aside className="side">
        <section className="card">
          <div className="lbl">房號</div>
          <div className="roomcode">{st.code}</div>
          <p className="muted small">把房號或連結傳給對手，對方打開就會加入。</p>
          <div className="link"><code>{link}</code><button className="btn sm" onClick={copy}>複製</button></div>
        </section>
        <section className="card">
          <div className="lbl">地形</div>
          <div className="seg" role="group" aria-label="地形">
            {Object.entries(MAP_TYPES).map(([k, v]) => (
              <button key={k} className={st.mapType === k ? 'on' : ''} disabled={!host} onClick={() => act({ type: 'mapType', mapType: k })}>{v}</button>
            ))}
          </div>
          {host ? <button className="btn ghost sm wide" onClick={() => act({ type: 'reroll' })}>換一張地圖</button>
            : <p className="muted small">由房主決定地圖。</p>}
        </section>
        <section className="card">
          <div className="lbl">參戰國</div>
          {[0, 1].map((i) => {
            const p = st.players[i];
            return (
              <div key={i} className="seat">
                <div className="seathead">
                  <span className="dot" style={{ background: p?.nation ? NATIONS[p.nation].color : 'var(--line)' }} />
                  <b>{p ? p.name : '等待對手加入…'}</b>
                  {i === 0 && p && <span className="chip">房主</span>}
                  {i === you && <span className="chip you">你</span>}
                  {p && !p.online && <span className="chip off">離線</span>}
                </div>
                {p && i === you && (
                  <div className="ngrid">
                    {NATION_KEYS.map((k) => {
                      const taken = st.players.some((q, j) => j !== i && q.nation === k);
                      return (
                        <button key={k} data-n={k} className={'nbtn' + (p.nation === k ? ' on' : '')} style={{ '--pc': NATIONS[k].color }} disabled={taken} onClick={() => act({ type: 'nation', nation: k })}>
                          <Logo k={k} />
                          <b>{NATIONS[k].name}</b><small>{taken ? '對手已選' : NATIONS[k].skill}</small>
                        </button>
                      );
                    })}
                  </div>
                )}
                {p?.nation && (
                  <p className="skill"><b>{NATIONS[p.nation].name}「{NATIONS[p.nation].skill}」</b>{NATIONS[p.nation].desc}</p>
                )}
                {p && i !== you && !p.nation && <p className="muted small">對手正在選國家…</p>}
              </div>
            );
          })}
          {host ? (
            <button className="btn primary wide" disabled={!ready} onClick={() => act({ type: 'start' })}>
              {st.players.length < 2 ? '等待對手加入' : ready ? '開戰' : '雙方都要選好國家'}
            </button>
          ) : <p className="muted small center">等待房主按下開戰</p>}
        </section>
        <Rules />
      </aside>
    </main>
  );
}

// ── 對局 ──────────────────────────────────────────
function Game({ st, you, act }) {
  const map = getMap(st.mapType, st.seed);
  const [mode, setMode] = useState(null);
  const [src, setSrc] = useState(-1);
  const [focus, setFocus] = useState(-1);
  const [hover, setHover] = useState(-1);
  const [confirmT, setConfirmT] = useState(-1);
  const myTurn = (st.phase === 'play' || st.phase === 'capital') && st.cur === you;

  useEffect(() => {
    setMode(st.chain || null); setSrc(-1); setConfirmT(-1);
  }, [st.ver, st.chain]);

  const opts = useMemo(() => {
    if (st.phase !== 'play' || you < 0) return null;
    return {
      dev: E.devOptions(st, you),
      atk: E.atkOptions(st, you),
      move: E.moveOptions(st, you),
      clear: E.clearOptions(st, you),
      emperor: E.emperorOptions(st, you),
      recap: E.needsCapital(st, you),
    };
  }, [st, you]);

  const sel = useMemo(() => {
    const r = { targets: new Set(), srcs: new Set() };
    if (!myTurn) return r;
    if (st.phase === 'capital') { E.capOptions(st).forEach((t) => r.targets.add(t)); return r; }
    if (!opts) return r;
    if (opts.recap) { E.recapOptions(st, you).forEach((t) => r.targets.add(t)); return r; }
    if (mode === 'dev') for (const t of opts.dev.keys()) r.targets.add(t);
    if (mode === 'atk') for (const a of opts.atk) { r.srcs.add(a.src); if (src < 0 || a.src === src) r.targets.add(a.t); }
    if (mode === 'move') opts.move.forEach((t) => r.targets.add(t));
    if (mode === 'clear') opts.clear.forEach((t) => r.targets.add(t));
    if (mode === 'emperor') opts.emperor.forEach((t) => r.targets.add(t));
    return r;
  }, [st, myTurn, mode, src, opts]);

  // 進攻時要用的出兵地：自己選的，否則自動挑最好的
  const atkSrcFor = (t) => (src >= 0 && map.adj[src].includes(t) ? src : E.bestSrc(st, you, t));
  const info = hover >= 0 ? hover : focus;
  const infoOdds = mode === 'atk' && sel.targets.has(info) ? (() => { const s = atkSrcFor(info); return s >= 0 ? E.odds(st, you, s, info) : null; })() : null;

  const doIt = (t, pointerType, fn) => {
    if (pointerType !== 'mouse' && confirmT !== t) { setConfirmT(t); return; }
    setConfirmT(-1); fn();
  };
  const onTap = (t, pointerType) => {
    setFocus(t);
    if (t < 0 || !myTurn) { setConfirmT(-1); return; }
    if (st.phase === 'capital') {
      if (sel.targets.has(t)) doIt(t, pointerType, () => act({ type: 'capital', t }));
      return;
    }
    if (opts?.recap) {
      if (sel.targets.has(t)) doIt(t, pointerType, () => act({ type: 'recap', t }));
      return;
    }
    if (mode === 'atk' && sel.srcs.has(t) && !sel.targets.has(t)) { setSrc(src === t ? -1 : t); setConfirmT(-1); return; }
    if (!sel.targets.has(t)) { setConfirmT(-1); return; }
    if (mode === 'dev') doIt(t, pointerType, () => act({ type: 'develop', t }));
    else if (mode === 'atk') doIt(t, pointerType, () => act({ type: 'attack', src: atkSrcFor(t), t }));
    else if (mode === 'move') doIt(t, pointerType, () => act({ type: 'move', t }));
    else if (mode === 'clear') doIt(t, pointerType, () => act({ type: 'clear', t }));
    else if (mode === 'emperor') doIt(t, pointerType, () => act({ type: 'emperor', t }));
  };

  const pickMode = (m) => { setMode(mode === m ? (st.chain || null) : m); setSrc(-1); setConfirmT(-1); };
  const line = mode === 'atk' && sel.targets.has(info) ? [atkSrcFor(info), info] : null;
  const ui = { targets: sel.targets, srcs: sel.srcs, src, focus, hover, line };

  const me = st.players[you];
  const curP = st.players[st.cur];
  const curN = E.natOf(st, st.cur);

  let hint = '';
  if (st.phase === 'capital') hint = myTurn ? '點一塊亮起的土地當首都（不能貼著對手首都）。' : `等待 ${curP.name}（${curN.name}）選首都…`;
  else if (st.phase === 'play') {
    if (!myTurn) hint = E.needsCapital(st, st.cur) ? `${curN.name} 首都失守，正在另立首都…` : `${curP.name}（${curN.name}）正在思考…`;
    else if (opts?.recap) hint = '首都失守！點一塊自己的領土當新首都（不耗行動）。再失守一次就滅國。';
    else if (st.chain === 'dev') hint = '日不落：第一回合可再開墾一塊地。';
    else if (st.chain === 'atk') hint = '閃電戰：可以再進攻一次，或結束回合。';
    else if (mode === 'dev') hint = '點亮起的空地。陸路相連必定成功；只隔海相連要擲 d6。';
    else if (mode === 'atk') hint = src >= 0 ? '點目標進攻；再點一次出兵地可取消選擇。' : '點敵方領土進攻（自動挑勝率最高的出兵地），或先點虛線框的自有領土指定出兵地。';
    else if (mode === 'move') hint = '首都只能遷到相鄰、沒有標記的自有領土（耗用本回合行動）。';
    else if (mode === 'emperor') hint = '天皇：免費遷到任意自有領土。目的地原有標記清空，但舊首都的標記會跟著帶過去。';
    else if (mode === 'clear') hint = '美食家：選一塊有標記的自有領土，清掉 1 層（不耗行動）。';
    else hint = '這回合選一件事做：開墾、佔領或遷都。';
  }
  const touchConfirm = confirmT >= 0 && confirmT === focus;

  return (
    <main className="game">
      <section className="board">
        <div className="banner" style={{ '--pc': curN.color }}>
          <span className="bdot" />
          {st.phase === 'over' ? '戰爭結束' : st.phase === 'capital' ? '定都階段' : `第 ${st.round} 回合`}
          <span className="bsep">·</span>
          {st.phase !== 'over' && <b>{st.cur === you ? '輪到你' : `輪到 ${curN.name}`}</b>}
        </div>
        <MapCanvas map={map} st={st} ui={ui} onTap={onTap} onHover={setHover} />
        {st.phase === 'over' && (
          <div className="over">
            <div className="obox" style={{ '--pc': E.natOf(st, st.winner).color }}>
              <div className="lbl">{st.winner === you ? '勝利' : '敗北'}</div>
              <h2>{E.natOf(st, st.winner).name} 統一天下</h2>
              <p>{st.players[st.winner].name} 在第 {st.round} 回合攻陷敵方首都。</p>
              {you === 0 ? <button className="btn primary" onClick={() => act({ type: 'rematch' })}>回大廳再來一局</button>
                : <p className="muted small">等待房主開新局</p>}
            </div>
          </div>
        )}
      </section>

      <aside className="side">
        <TurnCard st={st} you={you} />

        {st.phase === 'play' && myTurn && opts && !opts.recap && (
          <section className="actions" aria-label="行動">
            <ActBtn k="dev" label="開墾" n={opts.dev.size} mode={mode} pick={pickMode} off={st.chain === 'atk'} />
            <ActBtn k="atk" label="佔領" n={opts.atk.length ? new Set(opts.atk.map((a) => a.t)).size : 0} mode={mode} pick={pickMode} off={st.chain === 'dev'} />
            <ActBtn k="move" label="遷都" n={opts.move.length} mode={mode} pick={pickMode} off={!!st.chain} />
            {me?.nation === 'JP' && <ActBtn k="emperor" label="天皇遷都" n={opts.emperor.length} mode={mode} pick={pickMode} off={false} free />}
            {me?.nation === 'IT' && <ActBtn k="clear" label="清除標記" n={opts.clear.length} mode={mode} pick={pickMode} off={false} free />}
            <button className="btn end" onClick={() => act({ type: 'end' })}>{st.chain ? '結束回合' : '跳過'}</button>
          </section>
        )}
        {hint && <p className={'hint' + (myTurn ? ' mine' : '')}>{hint}</p>}

        <InfoCard st={st} you={you} map={map} t={info} odds={infoOdds} mode={mode} sel={sel} opts={opts} confirm={touchConfirm} />
        <Roster st={st} you={you} />
        <Log st={st} />
        <Rules />
      </aside>
    </main>
  );
}

function ActBtn({ k, label, n, mode, pick, off, free }) {
  return (
    <button className={'btn act' + (mode === k ? ' on' : '')} disabled={off || n === 0} onClick={() => pick(k)} aria-pressed={mode === k}>
      <span>{label}</span>
      <small>{free ? '免費・' : ''}{n} 處</small>
    </button>
  );
}

function TurnCard({ st, you }) {
  const me = st.players[you];
  if (!me) return <section className="card"><p className="muted">你正在觀戰。</p></section>;
  const n = NATIONS[me.nation];
  const every = E.skillEvery(me.nation);
  let ready = null;
  if (every && st.phase === 'play') {
    const left = every - (st.round - me.last);
    ready = left <= 0 ? '技能可用' : `技能冷卻：再 ${left} 回合`;
  }
  return (
    <section className="turn" data-n={me.nation} style={{ '--pc': n.color }}>
      <div className="flag">
        <b>{n.name}</b>
        <span>{me.name}{!me.alive && '・已滅亡'}</span>
      </div>
      <p className="skill"><b>「{n.skill}」</b>{n.desc}</p>
      {ready && <p className={'ready' + (ready === '技能可用' ? ' ok' : '')}>{ready}</p>}
      {st.phase === 'play' && me.first && me.nation === 'UK' && st.cur === you && <p className="ready ok">第一回合：可開墾兩塊地</p>}
    </section>
  );
}

function InfoCard({ st, you, map, t, odds, mode, sel, opts, confirm }) {
  if (t < 0) return <section className="card info"><p className="muted small">點地圖上的區域可查看詳情。手機上點亮起的區域兩次即可確認行動。</p></section>;
  const T = map.T[t], x = st.t[t];
  const owner = x.o >= 0 ? st.players[x.o] : null;
  const n = owner ? NATIONS[owner.nation] : null;
  const cap = E.isCap(st, t);
  const cd = you >= 0 ? E.cooldown(st, you, t) : 0;
  const dev = mode === 'dev' && opts?.dev.get(t);
  return (
    <section className="card info" style={n ? { '--pc': n.color } : undefined}>
      <div className="ihead">
        <span className="dot" style={{ background: n ? n.color : 'var(--parch)' }} />
        <b>{T.name}</b>
        {T.island && <span className="chip">島</span>}
        {cap && <span className="chip cap">★ 首都</span>}
      </div>
      <dl className="facts">
        <dt>歸屬</dt><dd>{owner ? `${n.name}（${owner.name}）` : '無主之地'}</dd>
        <dt>面積</dt><dd>{T.size} 格</dd>
        <dt>鄰接</dt><dd>陸路 {map.landAdj[t].size}・海路 {map.seaAdj[t].size}</dd>
        {owner && <><dt>佔領標記</dt><dd className={x.m ? 'warn' : ''}>{x.m} / {E.need(st, t)}{x.m ? `（${E.RECOVER} 回合無新標記會 −1）` : ''}</dd></>}
        {x.sc >= st.round && <><dt>焦土</dt><dd className="warn">到第 {x.sc} 回合為止無法出兵</dd></>}
        {cd > 0 && <><dt>冷卻</dt><dd className="warn">你在第 {cd} 回合結束前不能再打這裡</dd></>}
      </dl>
      {dev && (
        <p className="devnote">{dev.sea ? '只隔海相連：擲 d6，出 1 或 6 失敗（成功率 67%）。' : '陸路相連：開墾必定成功。'}</p>
      )}
      {odds && <OddsView o={odds} map={map} />}
      {confirm && sel.targets.has(t) && <p className="confirm">再點一次確認</p>}
    </section>
  );
}

function OddsView({ o, map }) {
  return (
    <div className="odds">
      <div className="ohead">從 <b>{map.T[o.src].name}</b> 出兵{o.sea ? '・跨海' : '・陸路'}<span className="mod">修正 {sign(o.mod)}</span></div>
      <div className="strip" aria-hidden="true">
        {o.strip.map((r, i) => <i key={i} className={r.toLowerCase()}>{i + 1}</i>)}
      </div>
      <div className="pcts">
        {['CS', 'S', 'F', 'CF'].map((k) => (
          <span key={k} className={k.toLowerCase()}><em>{RES_LABEL[k]}</em>{pct(o.c[k])}</span>
        ))}
      </div>
      {o.notes.length > 0 && <div className="notes">{o.notes.map(([k, v]) => <span key={k}>{k} {sign(v)}</span>)}</div>}
      {o.tCap && <div className="notes"><span>目標是首都：需 3 層標記，沒有大成功，失敗無冷卻</span></div>}
      {o.sCap && <div className="notes"><span>從首都出兵：不會大失敗</span></div>}
    </div>
  );
}

function Roster({ st, you }) {
  const M = getMap(st.mapType, st.seed);
  const total = M.n;
  return (
    <section className="card roster">
      {st.players.map((p, i) => {
        const n = NATIONS[p.nation]; const c = E.cnt(st, i);
        const capM = p.cap >= 0 ? st.t[p.cap].m : 0;
        return (
          <div key={i} data-n={p.nation} className={'rrow' + (st.cur === i && st.phase === 'play' ? ' cur' : '')} style={{ '--pc': n.color }}>
            <div className="rtop">
              <span className="dot" />
              <b>{n.name}</b>
              <span className="muted">{p.name}</span>
              {i === you && <span className="chip you">你</span>}
              {!p.online && <span className="chip off">離線</span>}
              {!p.alive && <span className="chip off">滅亡</span>}
              <span className="num">{c}<small>/{total}</small></span>
            </div>
            <div className="bar"><i style={{ width: (c / total) * 100 + '%' }} /></div>
            {p.alive && p.cap >= 0 && <div className="small muted">首都 {M.T[p.cap].name}・標記 {capM}/{E.need(st, p.cap)}・命 {E.CAP_LIVES - p.capLost}/{E.CAP_LIVES}</div>}
            {p.alive && p.cap < 0 && <div className="small warn-t">首都失守，等待另立首都・命 {E.CAP_LIVES - p.capLost}/{E.CAP_LIVES}</div>}
          </div>
        );
      })}
    </section>
  );
}

function Log({ st }) {
  const items = [...st.log].reverse().slice(0, 30);
  return (
    <section className="card">
      <div className="lbl">戰報</div>
      <ol className="log">
        {items.map((l, i) => (
          <li key={st.log.length - i}>
            <span className="r">{l.r > 0 ? `R${l.r}` : '—'}</span>
            {l.s >= 0 && <span className="dot" style={{ background: E.natOf(st, l.s).color }} />}
            <span>{l.s >= 0 ? <b>{E.natOf(st, l.s).name}</b> : null} {l.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Rules() {
  return (
    <details className="card rules">
      <summary>規則與判定表</summary>
      <ul>
        <li>每回合只能做一件事：<b>開墾</b>、<b>佔領</b>或<b>遷都</b>。</li>
        <li><b>開墾</b>：與自己可用領土陸路相連的空地必定成功；只隔海相連時擲 d6，出 1 或 6 失敗。</li>
        <li><b>佔領</b>擲 d12：擲 1 為大失敗、擲 12 為大成功（各 8%）；2–11 加修正值 ≥ 7 為成功，否則失敗。</li>
        <li>修正值：國力差（敵方領土數 − 我方領土數）÷ 3，上限 ±2，打大國比較容易；跨海 −1；再加國家技能。總和限 ±4。</li>
        <li><b>成功</b>：目標 +1 層標記。<b>大成功</b>：+2 層。一般領土 2 層即被拿下。</li>
        <li><b>失敗</b>：下一回合不能再打同一塊地。<b>大失敗</b>：同樣冷卻，而且自己的出兵地被加 1 層標記。</li>
        <li>有標記的領土不能出兵、也不能從那裡開墾。連續 {E.RECOVER} 回合沒有新標記，會自動消除 1 層。</li>
        <li><b>首都</b>需 3 層標記；打首都沒有大成功、失敗也不冷卻。從首都出兵不會大失敗。第一次失守：那塊地歸攻方，失守方免費另選一塊自己的領土當新首都；<b>第二次失守即滅國</b>，全部領土歸攻方。</li>
        <li><b>遷都</b>：搬到與首都陸路相鄰、沒有標記的自有領土。</li>
      </ul>
    </details>
  );
}
