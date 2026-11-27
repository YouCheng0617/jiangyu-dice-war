// 背景的水紋：畫面底部幾處水面，一圈圈漣漪慢慢擴散、淡去，輪流出現（水墨主題才顯示）。
// 純 canvas、不依賴 React：startSeaBg(canvas) 開始動畫並回傳停止函式；預覽頁與 components/SeaBg.js 共用。
// 顏色讀目前主題的 --deco（淺色主題是墨色、墨夜是淡灰白），所以每個主題都會自動換色。
function hash(i) {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const mod = (a, n) => ((a % n) + n) % n;

export function drawRipples(ctx, w, h, t, rgb = [31, 29, 26], padR = 0) {   // padR：右側留白（寬螢幕避開側欄）
  const INK = (a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  ctx.clearRect(0, 0, w, h);
  ctx.save(); ctx.lineCap = 'round';
  const N = 6, T = 7, s = h / 270;           // s：依畫布高度縮放，矮螢幕上漣漪也跟著小
  for (let i = 0; i < N; i++) {
    const cx = (w - padR) * (0.08 + 0.84 * hash(i * 7 + 3)), cy = h * (0.42 + 0.46 * hash(i * 7 + 5)), u = mod(t + i * 1.25, T) / T;
    for (let k = 0; k < 3; k++) {
      const uk = u - k * 0.13; if (uk < 0) continue;
      const rx = (14 + uk * 170) * Math.max(0.6, s), ry = rx * 0.27;
      ctx.strokeStyle = INK(0.42 * (1 - uk)); ctx.lineWidth = 1.5 - k * 0.3;
      ctx.setLineDash([rx * 1.1, rx * 0.45]); ctx.lineDashOffset = -(i * 40 + t * 8);
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.restore();
  // 上緣漸隱，讓水紋自然融進紙面
  ctx.save(); ctx.globalCompositeOperation = 'destination-in';
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.4, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore();
}

function themeInk() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--deco').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)] : [31, 29, 26];
}

export function startSeaBg(cv) {
  const ctx = cv.getContext('2d');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, last = 0, ink = themeInk();
  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  };
  const frame = (now) => {
    raf = 0;
    if (!document.hidden && cv.clientHeight > 0 && (now - last > 33 || reduce)) {   // 約 30fps；分頁隱藏時不畫
      last = now; size(); drawRipples(ctx, cv.width, cv.height, reduce ? 2.5 : now / 1000, ink, cv.clientWidth > 900 ? 400 * (cv.width / cv.clientWidth) : 0);
    }
    if (!reduce) raf = requestAnimationFrame(frame);
  };
  const restart = () => { ink = themeInk(); if (!raf) raf = requestAnimationFrame(frame); };
  window.addEventListener('resize', restart); window.addEventListener('jy-theme', restart);
  restart();
  return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', restart); window.removeEventListener('jy-theme', restart); };
}
