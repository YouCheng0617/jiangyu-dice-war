'use client';
import { useEffect, useRef } from 'react';
import { NATIONS, need, isCap } from '../lib/game.js';

const CS = 8; // 每格在畫布上的像素

function rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function shade(h, f) { const [r, g, b] = rgb(h); return `rgb(${(r * f) | 0},${(g * f) | 0},${(b * f) | 0})`; }
const lerp = (a, b, t) => a + (b - a) * t;

function segPath(list) {
  const p = new Path2D();
  for (const s of list) { p.moveTo(s[0] * CS, s[1] * CS); p.lineTo(s[2] * CS, s[3] * CS); }
  return p;
}

function buildGeo(map, dpr) {
  const { W, H } = map, MW = W * CS, MH = H * CS;
  const tp = map.T.map((t) => { const p = new Path2D(); for (const c of t.cells) p.rect((c % W) * CS, ((c / W) | 0) * CS, CS, CS); return p; });
  const ep = map.segs.map((ss) => segPath(ss));
  const coast = segPath(map.coast), border = segPath(map.border);
  const cell = (c) => [((c % W) + 0.5) * CS, (((c / W) | 0) + 0.5) * CS];
  const lanes = map.lanes.map(([c1, c2, a, b]) => [...cell(c1), ...cell(c2), a, b]);

  const base = document.createElement('canvas');
  base.width = MW * dpr; base.height = MH * dpr;
  const b = base.getContext('2d');
  // 海：低解析度深淺圖放大，得到平滑漸層
  const sm = document.createElement('canvas'); sm.width = W; sm.height = H;
  const sc = sm.getContext('2d'); const img = sc.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const d = map.land[i] ? 0 : map.seaDist[i];
    const t = Math.pow(Math.min(1, d / 14), 0.8);
    img.data[i * 4] = lerp(126, 30, t); img.data[i * 4 + 1] = lerp(176, 62, t);
    img.data[i * 4 + 2] = lerp(194, 92, t); img.data[i * 4 + 3] = 255;
  }
  sc.putImageData(img, 0, 0);
  b.imageSmoothingEnabled = true; b.imageSmoothingQuality = 'high';
  b.drawImage(sm, 0, 0, base.width, base.height);
  b.setTransform(dpr, 0, 0, dpr, 0, 0);
  // 經緯線
  b.strokeStyle = 'rgba(255,255,255,.07)'; b.lineWidth = 1;
  for (let x = 80; x < MW; x += 80) { b.beginPath(); b.moveTo(x, 0); b.lineTo(x, MH); b.stroke(); }
  for (let y = 80; y < MH; y += 80) { b.beginPath(); b.moveTo(0, y); b.lineTo(MW, y); b.stroke(); }
  // 淺灘光暈
  b.strokeStyle = 'rgba(214,236,238,.45)'; b.lineWidth = 6; b.stroke(coast);
  // 陸地（羊皮紙色）
  for (let i = 0; i < W * H; i++) {
    if (!map.land[i]) continue;
    const v = map.tex[i];
    b.fillStyle = `rgb(${lerp(238, 206, v) | 0},${lerp(227, 190, v) | 0},${lerp(192, 146, v) | 0})`;
    b.fillRect((i % W) * CS, ((i / W) | 0) * CS, CS + 0.6, CS + 0.6);
  }
  // 比例尺
  b.fillStyle = 'rgba(232,238,236,.8)'; b.font = '500 10px "IBM Plex Mono", monospace';
  b.fillRect(18, MH - 22, 80, 2); b.fillRect(18, MH - 26, 1.5, 8); b.fillRect(58, MH - 25, 1.5, 6); b.fillRect(97, MH - 26, 1.5, 8);
  b.fillText('0', 15, MH - 30); b.fillText('100 里', 84, MH - 30);

  const pat = (draw) => { const c = document.createElement('canvas'); c.width = 8; c.height = 8; draw(c.getContext('2d')); return c; };
  const hatch = pat((g) => { g.strokeStyle = 'rgba(180,28,24,.55)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-1, 9); g.lineTo(9, -1); g.stroke(); });
  const burn = pat((g) => { g.fillStyle = 'rgba(70,40,20,.28)'; g.fillRect(0, 0, 8, 8); g.fillStyle = 'rgba(40,20,8,.5)'; g.fillRect(1, 1, 2, 2); g.fillRect(5, 5, 2, 2); });
  return { tp, ep, coast, border, lanes, base, MW, MH, hatch, burn, hatchP: null, burnP: null };
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

export default function MapCanvas({ map, st, ui, onTap, onHover }) {
  const ref = useRef(null);
  const live = useRef({});
  live.current = { map, st, ui, onTap, onHover };
  const edgeCache = useRef({ key: '', paths: [] });
  const lastType = useRef('mouse');
  const lastHover = useRef(-1);

  useEffect(() => {
    if (!map) return;
    const cv = ref.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = map.W * CS * dpr; cv.height = map.H * CS * dpr;
    const ctx = cv.getContext('2d');
    const g = buildGeo(map, dpr);
    g.hatchP = ctx.createPattern(g.hatch, 'repeat');
    g.burnP = ctx.createPattern(g.burn, 'repeat');
    edgeCache.current = { key: '', paths: [] };
    let raf;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ownerEdges = (st) => {
      const key = st.code + ':' + st.ver + ':' + st.seed;
      if (edgeCache.current.key === key) return edgeCache.current.paths;
      const P = map.segs.map((ss, t) => {
        const o = st.t[t].o;
        if (o < 0) return null;
        return segPath(ss.filter((s) => (s[4] < 0 ? -2 : st.t[s[4]].o) !== o));
      });
      edgeCache.current = { key, paths: P };
      return P;
    };

    const draw = (ts) => {
      const { st, ui } = live.current;
      const has = st && st.t && st.t.length === map.n;
      const cssW = cv.clientWidth || g.MW;
      const k = Math.max(1, Math.min(2.6, g.MW / cssW));
      const showNames = cssW >= 560;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(g.base, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (has) {
        ctx.globalAlpha = 0.6;
        for (let t = 0; t < map.n; t++) {
          const o = st.t[t].o;
          if (o < 0) continue;
          ctx.fillStyle = NATIONS[st.players[o].nation].color;
          ctx.fill(g.tp[t]);
        }
        ctx.globalAlpha = 1;
        for (let t = 0; t < map.n; t++) {
          const x = st.t[t];
          if (x.m > 0) { ctx.fillStyle = g.hatchP; ctx.fill(g.tp[t]); }
          if (x.sc >= st.round) { ctx.fillStyle = g.burnP; ctx.fill(g.tp[t]); }
        }
      }
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(74,54,30,.4)'; ctx.stroke(g.border);
      ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(38,32,24,.9)'; ctx.stroke(g.coast);

      // 海路
      ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(226,238,240,.32)';
      ctx.beginPath();
      for (const l of g.lanes) { ctx.moveTo(l[0], l[1]); ctx.lineTo(l[2], l[3]); }
      ctx.stroke(); ctx.setLineDash([]);

      if (has) {
        const oe = ownerEdges(st);
        for (let t = 0; t < map.n; t++) {
          if (!oe[t]) continue;
          ctx.save(); ctx.clip(g.tp[t]);
          ctx.strokeStyle = shade(NATIONS[st.players[st.t[t].o].nation].color, 0.6);
          ctx.lineWidth = 4.5; ctx.stroke(oe[t]);
          ctx.restore();
        }
      }

      // 可選目標與出兵地
      const pulse = reduce ? 0.6 : 0.5 + 0.5 * Math.sin(ts / 260);
      if (ui) {
        for (const t of ui.targets) {
          ctx.fillStyle = `rgba(255,250,228,${0.16 + 0.24 * pulse})`; ctx.fill(g.tp[t]);
          ctx.strokeStyle = 'rgba(255,251,236,.95)'; ctx.lineWidth = 2; ctx.stroke(g.ep[t]);
        }
        ctx.setLineDash([4, 3]);
        for (const t of ui.srcs) {
          if (t === ui.src) continue;
          ctx.strokeStyle = 'rgba(244,201,92,.95)'; ctx.lineWidth = 2; ctx.stroke(g.ep[t]);
        }
        ctx.setLineDash([]);
        if (ui.src >= 0) { ctx.strokeStyle = '#f4c95c'; ctx.lineWidth = 3.5; ctx.stroke(g.ep[ui.src]); }
        // 目前進攻路線
        if (ui.line && ui.line[0] >= 0 && ui.line[1] >= 0) {
          const [a, b2] = ui.line;
          const lane = g.lanes.find((l) => (l[4] === a && l[5] === b2) || (l[4] === b2 && l[5] === a));
          const A = map.T[a], B = map.T[b2];
          ctx.strokeStyle = '#f4c95c'; ctx.lineWidth = 2.5; ctx.setLineDash(lane ? [6, 4] : []);
          ctx.beginPath();
          ctx.moveTo(A.lx * CS, A.ly * CS);
          if (lane) { ctx.lineTo(lane[0], lane[1]); ctx.lineTo(lane[2], lane[3]); }
          ctx.lineTo(B.lx * CS, B.ly * CS);
          ctx.stroke(); ctx.setLineDash([]);
        }
        if (ui.focus >= 0) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke(g.ep[ui.focus]); }
        if (ui.hover >= 0 && ui.hover !== ui.focus) { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.stroke(g.ep[ui.hover]); }
      }

      // 標籤
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const T of map.T) {
        const x = T.lx * CS, y = T.ly * CS;
        const cap = has && isCap(st, T.id);
        const s = has ? st.t[T.id] : null;
        if (showNames) {
          ctx.font = '500 10.5px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(246,238,216,.85)';
          const ny = cap ? y + 9 : y;
          ctx.strokeText(T.name, x, ny); ctx.fillStyle = '#2c2216'; ctx.fillText(T.name, x, ny);
        }
        if (cap) {
          const col = NATIONS[st.players[s.o].nation].color;
          const sy = showNames ? y - 4 : y;
          star(ctx, x, sy, 7.5 * k);
          ctx.fillStyle = col; ctx.fill();
          ctx.lineWidth = 1.6 * k; ctx.strokeStyle = '#1d1710'; ctx.stroke();
        }
        if (s && s.o >= 0 && s.m > 0) {
          const n = need(st, T.id), r = 2.8 * k, gap = 7.5 * k;
          const py = y + (showNames ? (cap ? 19 : 10) : 9 * k);
          for (let i = 0; i < n; i++) {
            const px = x + (i - (n - 1) / 2) * gap;
            ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fillStyle = i < s.m ? '#c8302a' : 'rgba(255,248,232,.85)'; ctx.fill();
            ctx.lineWidth = 1; ctx.strokeStyle = '#4a1612'; ctx.stroke();
          }
        }
        if (s && s.sc >= st.round) {
          const bx = x + 11 * k, by = y - 9 * k;
          ctx.beginPath(); ctx.arc(bx, by, 6.5 * k, 0, Math.PI * 2);
          ctx.fillStyle = '#d8722a'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#3a1a08'; ctx.stroke();
          ctx.fillStyle = '#fff6e8'; ctx.font = `700 ${8 * k}px "Noto Sans TC",sans-serif`; ctx.fillText('焦', bx, by + 0.5);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [map]);

  const pick = (e) => {
    const cv = ref.current, m = live.current.map;
    const r = cv.getBoundingClientRect();
    const cx = Math.floor(((e.clientX - r.left) / r.width) * m.W);
    const cy = Math.floor(((e.clientY - r.top) / r.height) * m.H);
    // 手指點在海岸附近也算數：往外找最近的陸地
    for (let rad = 0; rad <= 2; rad++) {
      let best = -1, bd = 1e9;
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= m.W || y >= m.H) continue;
        const i = y * m.W + x;
        if (m.land[i] && dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = m.tid[i]; }
      }
      if (best >= 0) return best;
    }
    return -1;
  };

  return (
    <canvas
      ref={ref}
      className="map"
      aria-label="戰場地圖"
      onPointerDown={(e) => { lastType.current = e.pointerType; }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return;
        const t = pick(e);
        if (t !== lastHover.current) { lastHover.current = t; live.current.onHover?.(t); }
      }}
      onPointerLeave={() => { lastHover.current = -1; live.current.onHover?.(-1); }}
      onClick={(e) => live.current.onTap?.(pick(e), lastType.current)}
    />
  );
}
