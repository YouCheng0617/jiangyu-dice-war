'use client';
import { useEffect, useRef, useState } from 'react';
import { NATIONS } from '../lib/game.js';
import { buildGeo, drawScene, CS } from '../lib/mapdraw.js';
import { mapTheme, nationColors } from '../lib/theme.js';

export default function MapCanvas({ map, st, ui, onTap, onHover }) {
  const ref = useRef(null);
  const live = useRef({});
  live.current = { map, st, ui, onTap, onHover };
  const lastType = useRef('mouse');
  const lastHover = useRef(-1);
  const [themeTick, setThemeTick] = useState(0); // 換主題時重畫底圖

  useEffect(() => {
    const f = () => setThemeTick((n) => n + 1);
    window.addEventListener('jy-theme', f);
    return () => window.removeEventListener('jy-theme', f);
  }, []);

  useEffect(() => {
    if (!map) return;
    const cv = ref.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = map.W * CS * dpr; cv.height = map.H * CS * dpr;
    const ctx = cv.getContext('2d');
    const th = mapTheme();
    const ncol = nationColors(Object.keys(NATIONS));
    const g = buildGeo(map, dpr, th);
    g.hatchP = ctx.createPattern(g.hatch, 'repeat');
    g.burnP = ctx.createPattern(g.burn, 'repeat');
    const edge = { key: '', paths: [] }, own = { key: '', canvas: null }, rings = new Map();
    // 各國水墨國徽：載入完成後重畫領土層（領土會變成那張圖）
    const logos = {}, envx = { logoN: 0 };
    for (const k of Object.keys(NATIONS)) {
      const im = new Image(); im.src = `/ink/logo/${k}.webp`;
      im.onload = () => { logos[k] = im; envx.logoN++; };
    }
    try { document.fonts?.load('11px "Reggae One"'); } catch (e) { /* 字體載入失敗就用備用字體 */ }
    let raf;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = (ts) => {
      const { st, ui } = live.current;
      drawScene(ctx, g, map, st, ui, ts, { th, ncol, dpr, reduce, edge, own, rings, logos, cap: 'flag', capBig: true, get logoN() { return envx.logoN; }, cssW: cv.clientWidth });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [map, themeTick]);

  const pick = (e, touch) => {
    const cv = ref.current, m = live.current.map;
    const r = cv.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * m.W, fy = ((e.clientY - r.top) / r.height) * m.H;
    const cx = Math.floor(fx), cy = Math.floor(fy);
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
    // 手機上手指較粗：點不到任何土地時，選最近的領土（約 30px 內）
    if (touch) {
      const per = r.width / m.W; // 每格的 CSS 像素
      let best = -1, bd = Infinity;
      for (const T of m.T) {
        const d = Math.hypot(T.lx - fx, T.ly - fy);
        if (d < bd) { bd = d; best = T.id; }
      }
      if (best >= 0 && bd * per <= 30) return best;
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
      onClick={(e) => live.current.onTap?.(pick(e, lastType.current === 'touch'), lastType.current)}
    />
  );
}
