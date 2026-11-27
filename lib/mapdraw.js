// 地圖畫布的繪製（沒有 React）。MapCanvas.js 與預覽頁都用這一份，所以主題只要改 lib/theme.js。
import { need, isCap } from './game.js';

export const CS = 8; // 每格在畫布上的像素

function rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function shade(h, f) { const [r, g, b] = rgb(h); return `rgb(${(r * f) | 0},${(g * f) | 0},${(b * f) | 0})`; }
const lerp = (a, b, t) => a + (b - a) * t;
// 固定結果的雜湊亂數：同一個 i 永遠得到同一個值，所以每次重畫的紋理都一樣
function hash(i) {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const h = (i, j) => hash(((i & 1023) << 10) | (j & 1023));
  const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}
function blurField(F, W, H, passes) {
  let cur = F;
  for (let p = 0; p < passes; p++) {
    const nv = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let a = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        a += cur[yy * W + xx]; c++;
      }
      nv[y * W + x] = a / c;
    }
    cur = nv;
  }
  return cur;
}
// 雙線性取樣；u、v 以「格」為單位
function sampler(F, W, H) {
  const g = (x, y) => F[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  return (u, v) => {
    const x = u - 0.5, y = v - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
  };
}
// 把一個顏色疊到另一個上（非預乘）
function over(d, sr, sg, sb, sa) {
  const oa = sa + d[3] * (1 - sa);
  if (oa <= 0) return;
  d[0] = (sr * sa + d[0] * d[3] * (1 - sa)) / oa; d[1] = (sg * sa + d[1] * d[3] * (1 - sa)) / oa;
  d[2] = (sb * sa + d[2] * d[3] * (1 - sa)) / oa; d[3] = oa;
}
const INK_S = 4; // 水墨圖層每格的像素數（越大邊緣越細）
// 海岸線的位置要和水墨底圖、領土渲染完全一致，所以都從這裡算
function coastField(map) {
  const { W, H } = map;
  const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = map.land[i] ? 1 : 0;
  const sm = sampler(blurField(L, W, H, 3), W, H);
  return (u, v) => sm(u, v) + (vnoise(u * 1.1, v * 1.1) - 0.5) * 0.2 + (vnoise(u * 4, v * 4) - 0.5) * 0.06;
}

function segPath(list) {
  const p = new Path2D();
  for (const s of list) { p.moveTo(s[0] * CS, s[1] * CS); p.lineTo(s[2] * CS, s[3] * CS); }
  return p;
}

// 土地表面的紋路（th.tex 可多選，用空白分隔）：cun 短皴（原本）、pima 披麻皴、fupi 斧劈皴、yudian 雨點皴、midian 米點皴、
// quan 卷雲皴、contour 等高線、fiber 紙纖維、hatch 斜線點陣。只畫在陸地內部（field ≥ 0.66）。
function landTexture(b, th, field, MW, MH) {
  const modes = (th.tex || 'cun').split(/\s+/);
  if (modes[0] === 'none') return;
  const I = th.ink, ink = (a) => `rgba(${I[0]},${I[1]},${I[2]},${a})`;
  const land = (x, y, lim = 0.66) => field(x / CS, y / CS) >= lim;
  b.save(); b.lineCap = 'round'; b.lineJoin = 'round';
  if (modes.includes('cun')) {
    for (let k = 0; k < 520; k++) {
      const x = hash(k * 7 + 21) * MW, y = hash(k * 7 + 22) * MH;
      if (!land(x, y)) continue;
      const len = 6 + hash(k * 7 + 23) * 16, ang = -Math.PI / 2 + (hash(k * 7 + 24) - 0.5) * 0.9;
      b.strokeStyle = th.cun; b.lineWidth = 0.7 + hash(k * 7 + 25) * 1.6;
      b.beginPath(); b.moveTo(x, y);
      b.quadraticCurveTo(x + Math.cos(ang + 0.4) * len * 0.5, y + Math.sin(ang + 0.4) * len * 0.5, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      b.stroke();
    }
  }
  if (modes.includes('pima')) {   // 披麻皴：一束束細長的流線，像麻的纖維
    for (let k = 0; k < 190; k++) {
      const x = hash(k * 9 + 31) * MW, y = hash(k * 9 + 32) * MH, len = 38 + hash(k * 9 + 33) * 60, ang = -Math.PI / 2 + (hash(k * 9 + 34) - 0.5) * 0.8;
      const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
      if (!land(x, y) || !land(ex, ey) || !land((x + ex) / 2, (y + ey) / 2)) continue;
      const bend = (hash(k * 9 + 35) - 0.5) * 22;
      for (let s = 0; s < 3; s++) {
        const o = (s - 1) * 3.2;
        b.strokeStyle = ink(0.13 + 0.05 * hash(k * 9 + 36 + s)); b.lineWidth = 0.6 + 0.4 * hash(k * 9 + 40 + s);
        b.beginPath(); b.moveTo(x + o, y); b.quadraticCurveTo((x + ex) / 2 + bend + o, (y + ey) / 2, ex + o * 0.6, ey); b.stroke();
      }
    }
  }
  if (modes.includes('fupi')) {   // 斧劈皴：斜向、一頭粗一頭尖的刀劈狀筆觸
    for (let k = 0; k < 280; k++) {
      const x = hash(k * 9 + 51) * MW, y = hash(k * 9 + 52) * MH, len = 12 + hash(k * 9 + 53) * 22, w = 2 + hash(k * 9 + 54) * 3, ang = Math.PI * 0.62 + (hash(k * 9 + 55) - 0.5) * 0.35;
      if (!land(x, y) || !land(x + Math.cos(ang) * len, y + Math.sin(ang) * len)) continue;
      const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
      b.fillStyle = ink(0.12 + 0.14 * hash(k * 9 + 56));
      b.beginPath(); b.moveTo(x + nx * w, y + ny * w); b.lineTo(x + dx * len, y + dy * len); b.lineTo(x - nx * w * 0.3, y - ny * w * 0.3); b.closePath(); b.fill();
    }
  }
  if (modes.includes('yudian')) {   // 雨點皴：細碎的點
    for (let k = 0; k < 900; k++) {
      const x = hash(k * 9 + 61) * MW, y = hash(k * 9 + 62) * MH; if (!land(x, y)) continue;
      b.fillStyle = ink(0.12 + 0.2 * hash(k * 9 + 63)); b.beginPath();
      b.ellipse(x, y, 0.8 + hash(k * 9 + 64) * 1.7, 0.5 + hash(k * 9 + 65) * 0.9, hash(k * 9 + 66) * 3.14, 0, 7); b.fill();
    }
  }
  if (modes.includes('midian')) {   // 米點皴：橫向的扁點，成片聚集
    for (let c = 0; c < 70; c++) {
      const cx = hash(c * 9 + 71) * MW, cy = hash(c * 9 + 72) * MH; if (!land(cx, cy)) continue;
      for (let k = 0; k < 9; k++) {
        const x = cx + (hash(c * 99 + k * 3 + 73) - 0.5) * 70, y = cy + (hash(c * 99 + k * 3 + 74) - 0.5) * 26; if (!land(x, y)) continue;
        b.fillStyle = ink(0.12 + 0.16 * hash(c * 99 + k * 3 + 75)); b.beginPath(); b.ellipse(x, y, 3 + hash(c * 99 + k + 76) * 4, 1.1 + hash(c * 99 + k + 77) * 0.8, (hash(c * 99 + k + 78) - 0.5) * 0.2, 0, 7); b.fill();
      }
    }
  }
  if (modes.includes('quan')) {   // 卷雲皴：一個個小小的捲曲
    for (let k = 0; k < 120; k++) {
      const x = hash(k * 9 + 81) * MW, y = hash(k * 9 + 82) * MH, r0 = 5 + hash(k * 9 + 83) * 9, rot = hash(k * 9 + 84) * 6.28;
      if (!land(x, y, 0.7)) continue;
      b.strokeStyle = ink(0.16 + 0.08 * hash(k * 9 + 85)); b.lineWidth = 0.7 + hash(k * 9 + 86) * 0.5; b.beginPath();
      for (let a = 0; a < Math.PI * 3.2; a += 0.15) { const rr = r0 * (1 - a / (Math.PI * 3.6)), px = x + Math.cos(a + rot) * rr * 1.35, py = y + Math.sin(a + rot) * rr; a ? b.lineTo(px, py) : b.moveTo(px, py); }
      b.stroke();
    }
  }
  if (modes.includes('contour')) {   // 等高線：順著海岸一圈圈往內，像地形圖
    for (const L of [0.62, 0.72, 0.84, 0.96]) {
      b.fillStyle = ink(0.34);
      for (let y = 16; y < MH - 16; y += 2) for (let x = 16; x < MW - 16; x += 2) {
        if (Math.abs(field(x / CS, y / CS) - L) < 0.007) { b.beginPath(); b.arc(x, y, 0.7, 0, 7); b.fill(); }
      }
    }
  }
  if (modes.includes('fiber')) {   // 紙纖維：各個方向的極細短線
    for (let k = 0; k < 1100; k++) {
      const x = hash(k * 9 + 91) * MW, y = hash(k * 9 + 92) * MH; if (!land(x, y)) continue;
      const a = hash(k * 9 + 93) * 6.28, l = 5 + hash(k * 9 + 94) * 15;
      b.strokeStyle = ink(0.08 + 0.1 * hash(k * 9 + 95)); b.lineWidth = 0.5; b.beginPath(); b.moveTo(x, y);
      b.quadraticCurveTo(x + Math.cos(a + 0.5) * l * 0.5, y + Math.sin(a + 0.5) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); b.stroke();
    }
  }
  if (modes.includes('hatch')) {   // 斜線點陣：整齊的短斜線，像版畫的網點
    for (let y = 10; y < MH - 10; y += 9) for (let x = ((y / 9) % 2 ? 4 : 0) + 8; x < MW - 10; x += 9) {
      if (!land(x, y)) continue;
      b.strokeStyle = ink(0.16); b.lineWidth = 0.8; b.beginPath(); b.moveTo(x - 2, y + 2); b.lineTo(x + 2, y - 2); b.stroke();
    }
  }
  // —— 第二批紋路 ——
  const contour = (L, w, alpha) => {   // 連續等高線（marching squares），順著 field 的等值線畫
    const st = 4, gx = Math.ceil(MW / st) + 1, gy = Math.ceil(MH / st) + 1, g = new Float32Array(gx * gy);
    for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) g[j * gx + i] = field(i * st / CS, j * st / CS);
    b.strokeStyle = ink(alpha); b.lineWidth = w; b.beginPath();
    const ip = (a0, a1) => (L - a0) / (a1 - a0);
    for (let j = 0; j < gy - 1; j++) for (let i = 0; i < gx - 1; i++) {
      const v0 = g[j * gx + i], v1 = g[j * gx + i + 1], v2 = g[(j + 1) * gx + i + 1], v3 = g[(j + 1) * gx + i];
      const c = (v0 >= L ? 1 : 0) | (v1 >= L ? 2 : 0) | (v2 >= L ? 4 : 0) | (v3 >= L ? 8 : 0);
      if (c === 0 || c === 15) continue;
      const x = i * st, y = j * st;
      const T = [x + ip(v0, v1) * st, y], R = [x + st, y + ip(v1, v2) * st], B = [x + ip(v3, v2) * st, y + st], Lf = [x, y + ip(v0, v3) * st];
      const segs = { 1: [[Lf, T]], 2: [[T, R]], 3: [[Lf, R]], 4: [[R, B]], 5: [[Lf, T], [R, B]], 6: [[T, B]], 7: [[Lf, B]], 8: [[Lf, B]], 9: [[T, B]], 10: [[T, R], [Lf, B]], 11: [[R, B]], 12: [[Lf, R]], 13: [[T, R]], 14: [[Lf, T]] }[c];
      for (const [p0, p1] of segs) { if (field(p0[0] / CS, p0[1] / CS) < 0.3) continue; b.moveTo(p0[0], p0[1]); b.lineTo(p1[0], p1[1]); }
    }
    b.stroke();
  };
  if (modes.includes('topo')) for (let L = 0.68; L <= 1.0; L += 0.04) contour(L, 0.8, 0.3);
  if (modes.includes('coast')) { contour(0.68, 1.4, 0.38); contour(0.76, 1.1, 0.28); contour(0.85, 0.8, 0.2); }
  if (modes.includes('grid')) {   // 軍用方格網：只畫在陸地內
    const S = 44; b.strokeStyle = ink(0.22); b.lineWidth = 0.7;
    for (let x = S; x < MW; x += S) for (let y = 0; y < MH; y += 3) if (land(x, y) && land(x, y + 3)) { b.beginPath(); b.moveTo(x, y); b.lineTo(x, y + 3.2); b.stroke(); }
    for (let y = S; y < MH; y += S) for (let x = 0; x < MW; x += 3) if (land(x, y) && land(x + 3, y)) { b.beginPath(); b.moveTo(x, y); b.lineTo(x + 3.2, y); b.stroke(); }
    b.fillStyle = ink(0.5);
    for (let x = S; x < MW; x += S) for (let y = S; y < MH; y += S) if (land(x, y)) { b.fillRect(x - 3, y - 0.5, 6, 1); b.fillRect(x - 0.5, y - 3, 1, 6); }
  }
  if (modes.includes('halftone')) {   // 半色調網點：越靠海岸點越大，像版畫的陰影
    for (let y = 8; y < MH - 8; y += 7) for (let x = ((y / 7) % 2 ? 3.5 : 0) + 8; x < MW - 8; x += 7) {
      const f = field(x / CS, y / CS); if (f < 0.66) continue;
      const r = 0.35 + (1 - Math.min(1, (f - 0.66) / 0.3)) * 1.7;
      b.fillStyle = ink(0.34); b.beginPath(); b.arc(x, y, r, 0, 7); b.fill();
    }
  }
  if (modes.includes('peaks')) {   // 山形符號
    for (let y = 20; y < MH - 20; y += 36) for (let x = 20; x < MW - 20; x += 36) {
      const k = (x * 13 + y * 7) | 0, px = x + (hash(k) - 0.5) * 22, py = y + (hash(k + 1) - 0.5) * 22; if (!land(px, py, 0.72)) continue;
      const s = 4 + hash(k + 2) * 4; b.strokeStyle = ink(0.42); b.lineWidth = 1; b.beginPath();
      b.moveTo(px - s, py + s * 0.6); b.lineTo(px - s * 0.2, py - s); b.lineTo(px + s * 0.4, py + s * 0.1); b.lineTo(px + s * 0.8, py - s * 0.4); b.lineTo(px + s * 1.4, py + s * 0.6); b.stroke();
    }
  }
  if (modes.includes('tufts')) {   // 草叢小記號：三筆小扇形
    for (let y = 16; y < MH - 16; y += 24) for (let x = 16; x < MW - 16; x += 24) {
      const k = (x * 11 + y * 5) | 0, px = x + (hash(k) - 0.5) * 16, py = y + (hash(k + 1) - 0.5) * 16; if (!land(px, py, 0.7)) continue;
      b.strokeStyle = ink(0.4); b.lineWidth = 0.9; b.beginPath();
      for (const a of [-0.55, 0, 0.55]) { b.moveTo(px, py); b.lineTo(px + Math.sin(a) * 5, py - Math.cos(a) * 6); }
      b.stroke();
    }
  }
  if (modes.includes('bloom')) {   // 墨暈：大片淡淡的濕墨暈染
    for (let k = 0; k < 46; k++) {
      const x = hash(k * 5 + 201) * MW, y = hash(k * 5 + 202) * MH, r = 26 + hash(k * 5 + 203) * 40;
      if (!land(x, y, 0.85)) continue;
      const gr = b.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, ink(0.1 + 0.07 * hash(k * 5 + 204))); gr.addColorStop(1, ink(0));
      b.fillStyle = gr; b.beginPath(); b.arc(x, y, r, 0, 7); b.fill();
    }
  }
  b.restore();
}

export function buildGeo(map, dpr, th, doc = document) {
  const { W, H } = map, MW = W * CS, MH = H * CS;
  const tp = map.T.map((t) => { const p = new Path2D(); for (const c of t.cells) p.rect((c % W) * CS, ((c / W) | 0) * CS, CS, CS); return p; });
  const ep = map.segs.map((ss) => segPath(ss));
  const coast = segPath(map.coast), border = segPath(map.border);
  const cell = (c) => [((c % W) + 0.5) * CS, (((c / W) | 0) + 0.5) * CS];
  const lanes = map.lanes.map(([c1, c2, a, b]) => [...cell(c1), ...cell(c2), a, b]);

  const base = doc.createElement('canvas');
  base.width = MW * dpr; base.height = MH * dpr;
  const b = base.getContext('2d');
  // 海：低解析度深淺圖放大，得到平滑漸層
  const sm = doc.createElement('canvas'); sm.width = W; sm.height = H;
  const sc = sm.getContext('2d'); const img = sc.createImageData(W, H);
  const { near, far, pow, dist } = th.sea;
  let tv = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) tv[i] = Math.pow(Math.min(1, (map.land[i] ? 0 : map.seaDist[i]) / dist), pow);
  // 水墨主題把深淺圖多模糊幾次，去掉格子狀的稜角，讓墨色像是自然暈開
  for (let pass = 0; pass < (th.sea.blur || 0); pass++) {
    const nv = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let a = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        a += tv[yy * W + xx]; c++;
      }
      nv[y * W + x] = a / c;
    }
    tv = nv;
  }
  for (let i = 0; i < W * H; i++) {
    const t = tv[i];
    img.data[i * 4] = lerp(near[0], far[0], t); img.data[i * 4 + 1] = lerp(near[1], far[1], t);
    img.data[i * 4 + 2] = lerp(near[2], far[2], t); img.data[i * 4 + 3] = 255;
  }
  sc.putImageData(img, 0, 0);
  b.imageSmoothingEnabled = true; b.imageSmoothingQuality = 'high';
  b.drawImage(sm, 0, 0, base.width, base.height);
  b.setTransform(dpr, 0, 0, dpr, 0, 0);
  // 墨暈：海面上幾團深淺不一的柔邊色塊，像墨在水裡暈開
  for (let k = 0; k < th.wash; k++) {
    const x = hash(k * 4 + 1) * MW, y = hash(k * 4 + 2) * MH, r = 40 + hash(k * 4 + 3) * 110;
    const dark = hash(k * 4 + 4) < 0.55;
    const gr = b.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, dark ? 'rgba(18,22,24,.13)' : 'rgba(255,255,255,.16)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = gr; b.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 經緯線
  b.strokeStyle = th.grid; b.lineWidth = 1;
  for (let x = 80; x < MW; x += 80) { b.beginPath(); b.moveTo(x, 0); b.lineTo(x, MH); b.stroke(); }
  for (let y = 80; y < MH; y += 80) { b.beginPath(); b.moveTo(0, y); b.lineTo(MW, y); b.stroke(); }
  let field = null;
  if (th.brush) {
    field = coastField(map);
    // 水面的筆觸：短短的弧線
    b.lineCap = 'round';
    for (let k = 0; k < 340; k++) {
      const x = hash(k * 5 + 11) * MW, y = hash(k * 5 + 12) * MH;
      const c = Math.min(W - 1, (x / CS) | 0) + Math.min(H - 1, (y / CS) | 0) * W;
      if (map.land[c] || field(x / CS, y / CS) > 0.3) continue;
      const len = 14 + hash(k * 5 + 13) * 26;
      b.strokeStyle = th.waves; b.lineWidth = 0.6 + hash(k * 5 + 14) * 0.9;
      b.beginPath(); b.moveTo(x, y); b.quadraticCurveTo(x + len * 0.5, y - 3 - hash(k * 5 + 15) * 3, x + len, y); b.stroke();
    }
    // 陸地：不規則的暈染邊緣、岸邊的濃墨線與水面上的留白
    const PW = W * INK_S, PH = H * INK_S;
    const lay = doc.createElement('canvas'); lay.width = PW; lay.height = PH;
    const lc = lay.getContext('2d'), img2 = lc.createImageData(PW, PH);
    const li = th.land.light, la = th.land.dark, ink = th.ink, sh = th.shoalRGB;
    const px = [0, 0, 0, 0];
    for (let py = 0; py < PH; py++) for (let qx = 0; qx < PW; qx++) {
      const u = (qx + 0.5) / INK_S, v = (py + 0.5) / INK_S;
      const e = field(u, v);
      const landA = smooth(0.47, 0.53, e);
      px[0] = 0; px[1] = 0; px[2] = 0; px[3] = 0;
      const halo = (1 - landA) * smooth(0.12, 0.48, e) * th.haloA;
      if (halo > 0) over(px, sh[0], sh[1], sh[2], halo);
      if (landA > 0) {
        const rim = smooth(0.5, 0.78, e);
        const t = Math.min(1, Math.max(0, vnoise(u * 0.35 + 7, v * 0.35 + 3) * 0.7 + (1 - rim) * 0.4 + (vnoise(u * 6, v * 6) - 0.5) * 0.12));
        over(px, lerp(li[0], la[0], t), lerp(li[1], la[1], t), lerp(li[2], la[2], t), landA);
      }
      const line = Math.exp(-(((e - 0.5) / 0.05) ** 2)) * (0.5 + 0.5 * vnoise(u * 2.2 + 11, v * 2.2)) * th.coastInk;
      if (line > 0.01) over(px, ink[0], ink[1], ink[2], Math.min(1, line));
      const o = (py * PW + qx) * 4;
      img2.data[o] = px[0]; img2.data[o + 1] = px[1]; img2.data[o + 2] = px[2]; img2.data[o + 3] = px[3] * 255;
    }
    lc.putImageData(img2, 0, 0);
    b.imageSmoothingEnabled = true; b.imageSmoothingQuality = 'high';
    b.drawImage(lay, 0, 0, MW, MH);
    landTexture(b, th, field, MW, MH);
    // 海面上潑濺的墨點
    for (let k = 0; k < 90; k++) {
      const x = hash(k * 3 + 31) * MW, y = hash(k * 3 + 32) * MH, f = field(x / CS, y / CS);
      if (f > 0.42 || f < 0.04) continue;
      b.fillStyle = th.splat; b.beginPath(); b.arc(x, y, 0.5 + hash(k * 3 + 33) * 1.7, 0, Math.PI * 2); b.fill();
    }
  } else {
    // 淺灘光暈
    b.strokeStyle = th.shoal; b.lineWidth = 6; b.stroke(coast);
    // 陸地
    const { light, dark } = th.land;
    for (let i = 0; i < W * H; i++) {
      if (!map.land[i]) continue;
      const v = map.tex[i];
      b.fillStyle = `rgb(${lerp(light[0], dark[0], v) | 0},${lerp(light[1], dark[1], v) | 0},${lerp(light[2], dark[2], v) | 0})`;
      b.fillRect((i % W) * CS, ((i / W) | 0) * CS, CS + 0.6, CS + 0.6);
    }
  }
  // 紙面細顆粒
  if (th.grain) {
    const n = (MW * MH) / 36;
    for (let k = 0; k < n; k++) {
      b.fillStyle = hash(k * 3 + 7) < 0.5 ? 'rgba(30,26,20,.05)' : 'rgba(255,255,255,.07)';
      b.fillRect(hash(k * 3 + 8) * MW, hash(k * 3 + 9) * MH, 1, 1);
    }
  }
  // 軍用地圖框線：粗細雙框、四角直角標記、指北箭頭
  if (th.brush) {
    const ink = `rgb(${th.ink[0]},${th.ink[1]},${th.ink[2]})`;
    b.save(); b.strokeStyle = ink; b.fillStyle = ink; b.lineCap = 'square';
    b.globalAlpha = 0.55; b.lineWidth = 3; b.strokeRect(14, 14, MW - 28, MH - 28);
    b.lineWidth = 1; b.strokeRect(22, 22, MW - 44, MH - 44);
    b.globalAlpha = 0.85; b.lineWidth = 6;
    for (const [cx, cy, dx, dy] of [[14, 14, 1, 1], [MW - 14, 14, -1, 1], [14, MH - 14, 1, -1], [MW - 14, MH - 14, -1, -1]]) {
      b.beginPath(); b.moveTo(cx + dx * 46, cy); b.lineTo(cx, cy); b.lineTo(cx, cy + dy * 46); b.stroke();
    }
    b.globalAlpha = 0.8; const nx = 70, ny = 112;
    b.beginPath(); b.moveTo(nx, ny - 40); b.lineTo(nx + 11, ny + 12); b.lineTo(nx, ny + 4); b.lineTo(nx - 11, ny + 12); b.closePath(); b.fill();
    b.font = '900 18px "Noto Serif TC","Songti TC",serif'; b.textAlign = 'center'; b.textBaseline = 'middle'; b.fillText('北', nx, ny - 52);
    b.restore();
  }
  // 比例尺
  b.fillStyle = th.scale; b.font = '500 10px "IBM Plex Mono", monospace';
  b.fillRect(18, MH - 22, 80, 2); b.fillRect(18, MH - 26, 1.5, 8); b.fillRect(58, MH - 25, 1.5, 6); b.fillRect(97, MH - 26, 1.5, 8);
  b.fillText('0', 15, MH - 30); b.fillText('100 里', 84, MH - 30);

  const pat = (draw) => { const c = doc.createElement('canvas'); c.width = 8; c.height = 8; draw(c.getContext('2d')); return c; };
  const hatch = pat((g) => { g.strokeStyle = th.hatch; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-1, 9); g.lineTo(9, -1); g.stroke(); });
  const burn = pat((g) => { g.fillStyle = th.burn[0]; g.fillRect(0, 0, 8, 8); g.fillStyle = th.burn[1]; g.fillRect(1, 1, 2, 2); g.fillRect(5, 5, 2, 2); });
  return { tp, ep, coast, border, lanes, base, MW, MH, hatch, burn, hatchP: null, burnP: null, field };
}

// 領土：像水彩一樣從格子中心暈開的色塊，邊界處加深一圈墨色；標記用斜線、焦土用焦墨斑
function paintOwnership(map, st, th, ncol, field, doc, logos) {
  const { W, H } = map, PW = W * INK_S, PH = H * INK_S, P = st.players.length;
  const masks = Array.from({ length: P }, () => new Float32Array(W * H));
  const M = new Float32Array(W * H), B = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (!map.land[i]) continue;
    const x = st.t[map.tid[i]];
    if (x.o >= 0) { masks[x.o][i] = 1; if (x.m > 0) M[i] = 1; }
    if (x.sc >= st.round) B[i] = 1;
  }
  const own = masks.map((m) => sampler(blurField(m, W, H, 2), W, H));
  const sM = sampler(blurField(M, W, H, 1), W, H), sB = sampler(blurField(B, W, H, 1), W, H);
  const rgbs = st.players.map((p) => rgb(ncol[p.nation]));
  const cv = doc.createElement('canvas'); cv.width = PW; cv.height = PH;
  const c = cv.getContext('2d'), img = c.createImageData(PW, PH), px = [0, 0, 0, 0], ink = th.ink;
  // 標記（斜線、焦土）另放一層，才能蓋在國徽圖上面
  const cv2 = doc.createElement('canvas'); cv2.width = PW; cv2.height = PH;
  const c2 = cv2.getContext('2d'), img2 = c2.createImageData(PW, PH), px2 = [0, 0, 0, 0];
  const mAlpha = Array.from({ length: P }, () => new Uint8ClampedArray(PW * PH));
  for (let py = 0; py < PH; py++) for (let qx = 0; qx < PW; qx++) {
    const u = (qx + 0.5) / INK_S, v = (py + 0.5) / INK_S;
    const la = smooth(0.47, 0.53, field(u, v));
    if (la <= 0) continue;
    px[0] = 0; px[1] = 0; px[2] = 0; px[3] = 0; px2[0] = 0; px2[1] = 0; px2[2] = 0; px2[3] = 0;
    for (let o = 0; o < P; o++) {
      const fo = own[o](u, v) + (vnoise(u * 3 + o * 5, v * 3 + 1) - 0.5) * 0.2;
      const ma = smooth(0.38, 0.62, fo) * la;
      mAlpha[o][py * PW + qx] = ma * 255;
      const a = ma * th.natAlpha;
      if (a > 0.002) over(px, rgbs[o][0], rgbs[o][1], rgbs[o][2], a);
      const band = Math.exp(-(((fo - 0.5) / 0.09) ** 2)) * la;
      if (band > 0.02) over(px, rgbs[o][0] * 0.5, rgbs[o][1] * 0.5, rgbs[o][2] * 0.5, band * 0.55);
    }
    const m = sM(u, v) + (vnoise(u * 3, v * 3 + 9) - 0.5) * 0.2;
    if (m > 0.5 && ((qx + py) / INK_S) % 1 < 0.34) over(px2, ink[0], ink[1], ink[2], 0.55 * smooth(0.5, 0.62, m) * la);
    const b = sB(u, v) + (vnoise(u * 3 + 4, v * 3) - 0.5) * 0.2;
    if (b > 0.5) over(px2, 40, 24, 14, 0.6 * smooth(0.5, 0.62, b) * smooth(0.35, 0.8, vnoise(u * 5, v * 5)) * la);
    const o4 = (py * PW + qx) * 4;
    img.data[o4] = px[0]; img.data[o4 + 1] = px[1]; img.data[o4 + 2] = px[2]; img.data[o4 + 3] = px[3] * 255;
    img2.data[o4] = px2[0]; img2.data[o4 + 1] = px2[1]; img2.data[o4 + 2] = px2[2]; img2.data[o4 + 3] = px2[3] * 255;
  }
  c.putImageData(img, 0, 0); c2.putImageData(img2, 0, 0);
  // 國徽層：每個被佔領的區域蓋一枚圓形小印章（該國的水墨圖），邊緣像墨水暈開
  let lg = null;
  if (logos) {
    lg = doc.createElement('canvas'); lg.width = PW; lg.height = PH;
    const lc = lg.getContext('2d');
    for (const T of map.T) {
      const o = st.t[T.id].o;
      if (o < 0) continue;
      const im = logos[st.players[o].nation];
      if (!im || !im.complete || !im.naturalWidth) continue;
      const n = T.cells.length;
      const rc = Math.max(2.4, Math.min(5.2, Math.sqrt(n) * 0.5));          // 半徑（格）
      const r = rc * INK_S, cx = T.lx * INK_S, cy = T.ly * INK_S - 0.9 * INK_S;   // 稍微上移，讓出區名
      const sz = Math.ceil(r * 2 + 8), x0 = Math.floor(cx - sz / 2), y0 = Math.floor(cy - sz / 2);
      const t = doc.createElement('canvas'); t.width = sz; t.height = sz;
      const tc = t.getContext('2d');
      tc.imageSmoothingEnabled = true; tc.imageSmoothingQuality = 'high';
      const side = r * 2.15; tc.drawImage(im, sz / 2 - side / 2, sz / 2 - side / 2, side, side);
      const id = tc.getImageData(0, 0, sz, sz), d = id.data;
      for (let py = 0; py < sz; py++) for (let qx = 0; qx < sz; qx++) {
        const dx = qx + 0.5 - sz / 2, dy = py + 0.5 - sz / 2, q = Math.hypot(dx, dy) / r;
        const wob = (vnoise((x0 + qx) / INK_S * 2.2 + T.id * 7, (y0 + py) / INK_S * 2.2) - 0.5) * 0.3;
        const f = q + wob;
        const a = 1 - smooth(0.8, 1.02, f);                                    // 邊緣暈開
        const ring = Math.exp(-(((f - 0.9) / 0.055) ** 2)) * 0.4;             // 淡淡的墨圈
        const i = (py * sz + qx) * 4;
        const ink0 = th.ink;
        const ra = Math.min(1, ring);
        d[i] = d[i] * (1 - ra) + ink0[0] * ra; d[i + 1] = d[i + 1] * (1 - ra) + ink0[1] * ra; d[i + 2] = d[i + 2] * (1 - ra) + ink0[2] * ra;
        d[i + 3] = Math.min(255, (d[i + 3] / 255) * a * 255 + ring * 255 * (1 - smooth(0.98, 1.12, f)));
      }
      tc.putImageData(id, 0, 0);
      lc.drawImage(t, x0, y0);
    }
  }
  return { a: cv, b: cv2, lg };
}

// 單一區域的柔邊外框（＋淡淡的內部色），用來取代階梯狀的硬線；依顏色與粗細快取
function territoryMark(map, t, rgbc, thick, fillA, doc) {
  const { W, H } = map, cells = map.T[t].cells;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (const c of cells) { const x = c % W, y = (c / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  x0 = Math.max(0, x0 - 3); y0 = Math.max(0, y0 - 3); x1 = Math.min(W - 1, x1 + 3); y1 = Math.min(H - 1, y1 + 3);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, F = new Float32Array(bw * bh);
  for (const c of cells) F[((c / W | 0) - y0) * bw + ((c % W) - x0)] = 1;
  const sm = sampler(blurField(F, bw, bh, 2), bw, bh);
  const PW = bw * INK_S, PH = bh * INK_S, cv = doc.createElement('canvas'); cv.width = PW; cv.height = PH;
  const c2 = cv.getContext('2d'), img = c2.createImageData(PW, PH);
  for (let py = 0; py < PH; py++) for (let qx = 0; qx < PW; qx++) {
    const u = (qx + 0.5) / INK_S, v = (py + 0.5) / INK_S;
    const f = sm(u, v) + (vnoise((u + x0) * 3, (v + y0) * 3) - 0.5) * 0.18;
    const a = Math.max(Math.exp(-(((f - 0.5) / thick) ** 2)), fillA * smooth(0.4, 0.6, f));
    const o = (py * PW + qx) * 4;
    img.data[o] = rgbc[0]; img.data[o + 1] = rgbc[1]; img.data[o + 2] = rgbc[2]; img.data[o + 3] = a * 255;
  }
  c2.putImageData(img, 0, 0);
  return { cv, x: x0 * CS, y: y0 * CS, w: bw * CS, h: bh * CS };
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

// 畫一幀。env = { th, ncol（國家色 {JP:'#..'}）, dpr, reduce, edge（快取物件）, cssW }
export function drawScene(ctx, g, map, st, ui, ts, env) {
  const { th, ncol, dpr, reduce, edge, cssW } = env;
  const has = st && st.t && st.t.length === map.n;
  const k = Math.max(1, Math.min(2.6, g.MW / (cssW || g.MW)));
  const showNames = (cssW || g.MW) >= 560;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(g.base, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const ownerEdges = () => {
    const key = st.code + ':' + st.ver + ':' + st.seed;
    if (edge.key === key) return edge.paths;
    const P = map.segs.map((ss, t) => {
      const o = st.t[t].o;
      if (o < 0) return null;
      return segPath(ss.filter((s) => (s[4] < 0 ? -2 : st.t[s[4]].o) !== o));
    });
    edge.key = key; edge.paths = P;
    return P;
  };

  if (has && th.brush) {
    const key = st.code + ':' + st.ver + ':' + st.seed + ':' + st.round + ':' + (env.logoN || 0);
    if (env.own.key !== key) { env.own.canvas = paintOwnership(map, st, th, ncol, g.field, document, env.logos); env.own.key = key; }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.globalCompositeOperation = th.mul ? 'multiply' : 'source-over';
    ctx.drawImage(env.own.canvas.a, 0, 0, g.MW, g.MH);
    if (env.own.canvas.lg) { ctx.globalAlpha = 0.58; ctx.drawImage(env.own.canvas.lg, 0, 0, g.MW, g.MH); ctx.globalAlpha = 1; }
    ctx.globalCompositeOperation = th.mul ? 'multiply' : 'source-over';
    ctx.drawImage(env.own.canvas.b, 0, 0, g.MW, g.MH);
    ctx.globalCompositeOperation = 'source-over';
  } else if (has) {
    ctx.globalAlpha = th.natAlpha;
    for (let t = 0; t < map.n; t++) {
      const o = st.t[t].o;
      if (o < 0) continue;
      ctx.fillStyle = ncol[st.players[o].nation];
      ctx.fill(g.tp[t]);
    }
    ctx.globalAlpha = 1;
    for (let t = 0; t < map.n; t++) {
      const x = st.t[t];
      if (x.m > 0) { ctx.fillStyle = g.hatchP; ctx.fill(g.tp[t]); }
      if (x.sc >= st.round) { ctx.fillStyle = g.burnP; ctx.fill(g.tp[t]); }
    }
  }
  if (th.brush) {
    // 區域分界：每個區域各畫一圈很淡、不規則的墨線（不用格子邊，所以不會有階梯）
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = th.borderA;
    for (let t = 0; t < map.n; t++) {
      const id = t + '|border';
      let m = env.rings.get(id);
      if (!m) { m = territoryMark(map, t, th.ink, 0.045, 0, document); env.rings.set(id, m); }
      ctx.drawImage(m.cv, m.x, m.y, m.w, m.h);
    }
    ctx.globalAlpha = 1;
  } else {
    ctx.lineWidth = 1; ctx.strokeStyle = th.border; ctx.stroke(g.border);
    ctx.lineWidth = th.coastW; ctx.strokeStyle = th.coast; ctx.stroke(g.coast);
  }

  // 海路
  ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeStyle = th.lane;
  ctx.beginPath();
  for (const l of g.lanes) { ctx.moveTo(l[0], l[1]); ctx.lineTo(l[2], l[3]); }
  ctx.stroke(); ctx.setLineDash([]);

  if (has && !th.brush) {
    const oe = ownerEdges();
    for (let t = 0; t < map.n; t++) {
      if (!oe[t]) continue;
      ctx.save(); ctx.clip(g.tp[t]);
      ctx.strokeStyle = shade(ncol[st.players[st.t[t].o].nation], th.edgeShade);
      ctx.lineWidth = 4.5; ctx.stroke(oe[t]);
      ctx.restore();
    }
  }

  // 可選目標與出兵地
  const pulse = reduce ? 0.6 : 0.5 + 0.5 * Math.sin(ts / 260);
  if (ui && th.brush) {
    const mark = (t, key, thick, fillA, alpha) => {
      const id = t + '|' + key + '|' + thick + '|' + fillA;
      let m = env.rings.get(id);
      if (!m) { m = territoryMark(map, t, th.hl[key], thick, fillA, document); env.rings.set(id, m); }
      ctx.globalAlpha = alpha; ctx.drawImage(m.cv, m.x, m.y, m.w, m.h); ctx.globalAlpha = 1;
    };
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    for (const t of ui.targets) mark(t, 'target', 0.1, 0.13, 0.6 + 0.4 * pulse);
    for (const t of ui.srcs) if (t !== ui.src) mark(t, 'src', 0.07, 0, 0.8);
    if (ui.src >= 0) mark(ui.src, 'sel', 0.11, 0, 0.9);
    if (ui.line && ui.line[0] >= 0 && ui.line[1] >= 0) {
      const [a, b2] = ui.line;
      const lane = g.lanes.find((l) => (l[4] === a && l[5] === b2) || (l[4] === b2 && l[5] === a));
      const A = map.T[a], B = map.T[b2];
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowColor = th.glow; ctx.shadowBlur = 4;
      ctx.strokeStyle = th.route; ctx.lineWidth = 2.8; ctx.setLineDash(lane ? [6, 5] : []);
      ctx.beginPath(); ctx.moveTo(A.lx * CS, A.ly * CS);
      if (lane) { ctx.lineTo(lane[0], lane[1]); ctx.lineTo(lane[2], lane[3]); }
      ctx.lineTo(B.lx * CS, B.ly * CS); ctx.stroke(); ctx.restore();
    }
    if (ui.focus >= 0) mark(ui.focus, 'focus', 0.11, 0, 0.85);
    if (ui.hover >= 0 && ui.hover !== ui.focus) mark(ui.hover, 'hover', 0.09, 0, 0.7);
  } else if (ui) {
    for (const t of ui.targets) {
      ctx.fillStyle = `rgba(${th.target},${0.16 + 0.24 * pulse})`; ctx.fill(g.tp[t]);
      ctx.strokeStyle = th.targetEdge; ctx.lineWidth = 2; ctx.stroke(g.ep[t]);
    }
    ctx.setLineDash([4, 3]);
    for (const t of ui.srcs) {
      if (t === ui.src) continue;
      ctx.strokeStyle = th.src; ctx.lineWidth = 2; ctx.stroke(g.ep[t]);
    }
    ctx.setLineDash([]);
    if (ui.src >= 0) { ctx.strokeStyle = th.srcSel; ctx.lineWidth = 3.5; ctx.stroke(g.ep[ui.src]); }
    // 目前進攻路線
    if (ui.line && ui.line[0] >= 0 && ui.line[1] >= 0) {
      const [a, b2] = ui.line;
      const lane = g.lanes.find((l) => (l[4] === a && l[5] === b2) || (l[4] === b2 && l[5] === a));
      const A = map.T[a], B = map.T[b2];
      ctx.strokeStyle = th.route; ctx.lineWidth = 2.5; ctx.setLineDash(lane ? [6, 4] : []);
      ctx.beginPath();
      ctx.moveTo(A.lx * CS, A.ly * CS);
      if (lane) { ctx.lineTo(lane[0], lane[1]); ctx.lineTo(lane[2], lane[3]); }
      ctx.lineTo(B.lx * CS, B.ly * CS);
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (ui.focus >= 0) { ctx.strokeStyle = th.focus; ctx.lineWidth = 2.5; ctx.stroke(g.ep[ui.focus]); }
    if (ui.hover >= 0 && ui.hover !== ui.focus) { ctx.strokeStyle = th.hover; ctx.lineWidth = 2; ctx.stroke(g.ep[ui.hover]); }
  }

  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';

  // 標籤
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const T of map.T) {
    const x = T.lx * CS, y = T.ly * CS;
    const cap = has && isCap(st, T.id);
    const s = has ? st.t[T.id] : null;
    if (showNames) {
      ctx.font = th.brush ? '700 10.5px "Noto Serif TC","Songti TC","PMingLiU",serif' : '500 10.5px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = th.halo;
      const ny = cap ? y + 9 : y;
      ctx.strokeText(T.name, x, ny); ctx.fillStyle = th.label; ctx.fillText(T.name, x, ny);
    }
    if (cap) {
      const col = ncol[st.players[s.o].nation];
      const sy = showNames ? y - 4 : y;
      star(ctx, x, sy, 7.5 * k);
      ctx.fillStyle = col; ctx.fill();
      ctx.lineWidth = 1.6 * k; ctx.strokeStyle = th.capLine; ctx.stroke();
    }
    if (s && s.o >= 0 && s.m > 0) {
      const n = need(st, T.id), r = 2.8 * k, gap = 7.5 * k;
      const py = y + (showNames ? (cap ? 19 : 10) : 9 * k);
      for (let i = 0; i < n; i++) {
        const px = x + (i - (n - 1) / 2) * gap;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = i < s.m ? th.dotHit : th.dotMiss; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = th.dotLine; ctx.stroke();
      }
    }
    if (s && s.sc >= st.round) {
      const bx = x + 11 * k, by = y - 9 * k;
      ctx.beginPath(); ctx.arc(bx, by, 6.5 * k, 0, Math.PI * 2);
      ctx.fillStyle = th.badge; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = th.badgeLine; ctx.stroke();
      ctx.fillStyle = th.badgeText; ctx.font = `700 ${8 * k}px "Noto Sans TC",sans-serif`; ctx.fillText('焦', bx, by + 0.5);
    }
  }
}
