// 地圖生成：同一組 (type, seed) 在伺服器與瀏覽器會產生完全相同的地圖。
export const W = 120;
export const H = 80;
const N = W * H;
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(rnd) {
  const S = 256, p = new Float32Array(S * S);
  for (let i = 0; i < p.length; i++) p[i] = rnd();
  const sm = (t) => t * t * (3 - 2 * t);
  const g = (i, j) => p[(j & 255) * S + (i & 255)];
  function v(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1);
    const u = sm(xf), w = sm(yf);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  }
  return (x, y, oct = 4) => {
    let t = 0, amp = 1, f = 1, sum = 0;
    for (let o = 0; o < oct; o++) { t += v(x * f + o * 17.3, y * f + o * 9.1) * amp; sum += amp; amp *= 0.5; f *= 2; }
    return t / sum;
  };
}

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(k, v) {
    const K = this.k, V = this.v; let i = K.length; K.push(k); V.push(v);
    while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= k) break; K[i] = K[p]; V[i] = V[p]; i = p; }
    K[i] = k; V[i] = v;
  }
  pop() {
    const K = this.k, V = this.v; const rk = K[0], rv = V[0];
    const lk = K.pop(), lv = V.pop(); const n = K.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i, mk = lk;
        if (l < n && K[l] < mk) { m = l; mk = K[l]; }
        if (r < n && K[r] < mk) { m = r; mk = K[r]; }
        if (m === i) break;
        K[i] = K[m]; V[i] = V[m]; i = m;
      }
      K[i] = lk; V[i] = lv;
    }
    this.lastKey = rk;
    return rv;
  }
}

function components(mask, val) {
  const seen = new Uint8Array(N), out = [];
  for (let i = 0; i < N; i++) {
    if (seen[i] || mask[i] !== val) continue;
    const comp = [i]; seen[i] = 1;
    for (let q = 0; q < comp.length; q++) {
      const c = comp[q], x = c % W, y = (c / W) | 0;
      for (const [dx, dy] of D4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (!seen[j] && mask[j] === val) { seen[j] = 1; comp.push(j); }
      }
    }
    out.push(comp);
  }
  return out;
}

const PRE = '北南東西新古白赤青黑金銀鐵石松楓鷹狼霧雪沙風星月雲川龍虎鹿鶴梅竹蘭菊碧翠紫丹玄蒼'.split('');
const SUF = ['原', '嶺', '州', '谷', '堡', '野', '林', '丘', '關', '郡', '城', '坡', '平', '峽'];
const SUF_ISLE = ['島', '嶼', '礁', '洲'];

const cache = new Map();
export function getMap(type, seed) {
  const key = type + ':' + seed;
  if (!cache.has(key)) {
    if (cache.size > 24) cache.clear();
    cache.set(key, genMap(type, seed));
  }
  return cache.get(key);
}

export function genMap(type, seed) {
  const rnd = mulberry32(seed);
  const nz = makeNoise(rnd), nz2 = makeNoise(rnd);
  const A = W / H;

  // 1. 陸地輪廓：幾個「陸塊」加上雜訊
  const B = [];
  if (type === 'continent') {
    B.push({ x: 0.5 + (rnd() - 0.5) * 0.1, y: 0.5 + (rnd() - 0.5) * 0.1, r: 0.5, w: 1 });
    for (let i = 0; i < 3; i++) B.push({ x: 0.25 + rnd() * 0.5, y: 0.25 + rnd() * 0.5, r: 0.18 + rnd() * 0.12, w: 0.8 });
  } else if (type === 'islands') {
    const k = 9 + Math.floor(rnd() * 4);
    for (let i = 0; i < k; i++) B.push({ x: 0.08 + rnd() * 0.84, y: 0.1 + rnd() * 0.8, r: 0.08 + rnd() * 0.09, w: 1 });
  } else {
    const left = rnd() < 0.5;
    B.push({ x: left ? 0.32 : 0.68, y: 0.5 + (rnd() - 0.5) * 0.15, r: 0.36, w: 1 });
    B.push({ x: left ? 0.3 : 0.7, y: 0.3 + rnd() * 0.4, r: 0.2, w: 0.8 });
    const k = 6 + Math.floor(rnd() * 3);
    for (let i = 0; i < k; i++) B.push({ x: left ? 0.62 + rnd() * 0.32 : 0.06 + rnd() * 0.32, y: 0.1 + rnd() * 0.8, r: 0.06 + rnd() * 0.07, w: 1 });
  }
  const val = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const px = x / H, py = y / H;
    let m = -1;
    for (const b of B) { const d = Math.hypot(px - b.x * A, py - b.y) / b.r; m = Math.max(m, (1 - d) * b.w); }
    let v = m + (nz(x / 18, y / 18, 5) - 0.5) * (type === 'islands' ? 0.8 : 1.0);
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (e < 4) v -= 5; else if (e < 10) v -= (10 - e) * 0.05;
    val[y * W + x] = v;
  }
  const frac = { continent: 0.47, islands: 0.3, mixed: 0.38 }[type] ?? 0.38;
  const sorted = Float32Array.from(val).sort();
  const thr = sorted[Math.floor((1 - frac) * N)];
  let land = new Uint8Array(N);
  for (let i = 0; i < N; i++) land[i] = val[i] > thr ? 1 : 0;
  for (let pass = 0; pass < 2; pass++) {
    const nl = new Uint8Array(land);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      let c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) c += land[(y + dy) * W + x + dx];
      const i = y * W + x;
      if (c >= 5) nl[i] = 1; else if (c <= 3) nl[i] = 0;
    }
    land = nl;
  }
  for (const comp of components(land, 1)) if (comp.length < 16) for (const i of comp) land[i] = 0;
  for (const comp of components(land, 0)) {
    const edge = comp.some((i) => { const x = i % W, y = (i / W) | 0; return x === 0 || y === 0 || x === W - 1 || y === H - 1; });
    if (!edge && comp.length < 60) for (const i of comp) land[i] = 1;
  }

  // 2. 區域：每塊陸地依面積放種子，再用帶雜訊成本的 Dijkstra 長出自然邊界
  const seeds = [];
  for (const comp of components(land, 1)) {
    const k = Math.max(1, Math.round(comp.length / 105));
    const md = new Float32Array(comp.length).fill(Infinity);
    let pick = comp[Math.floor(rnd() * comp.length)];
    for (let s = 0; s < k; s++) {
      seeds.push(pick);
      const px = pick % W, py = (pick / W) | 0;
      let best = -1, bi = 0;
      for (let j = 0; j < comp.length; j++) {
        const c = comp[j], dx = (c % W) - px, dy = ((c / W) | 0) - py, d = dx * dx + dy * dy;
        if (d < md[j]) md[j] = d;
        if (md[j] > best) { best = md[j]; bi = j; }
      }
      pick = comp[bi];
    }
  }
  const tid = new Int16Array(N).fill(-1);
  const dist = new Float64Array(N).fill(1e9);
  const hp = new Heap();
  seeds.forEach((s, k) => { dist[s] = 0; tid[s] = k; hp.push(0, s); });
  while (hp.size) {
    const i = hp.pop(), d = hp.lastKey;
    if (d > dist[i]) continue;
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (!land[j]) continue;
      const nd = d + 1 + nz2(nx / 7, ny / 7, 3) * 3.2;
      if (nd < dist[j]) { dist[j] = nd; tid[j] = tid[i]; hp.push(nd, j); }
    }
  }
  // 過小的區域併入鄰居
  const T0 = seeds.length, size = new Int32Array(T0);
  for (let i = 0; i < N; i++) if (tid[i] >= 0) size[tid[i]]++;
  for (let t = 0; t < T0; t++) {
    if (size[t] === 0 || size[t] >= 30) continue;
    const share = new Map();
    for (let i = 0; i < N; i++) {
      if (tid[i] !== t) continue;
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of D4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const u = tid[ny * W + nx];
        if (u >= 0 && u !== t) share.set(u, (share.get(u) || 0) + 1);
      }
    }
    if (!share.size) continue;
    let bt = -1, bv = -1;
    for (const [k, v] of share) if (v > bv) { bv = v; bt = k; }
    for (let i = 0; i < N; i++) if (tid[i] === t) tid[i] = bt;
    size[bt] += size[t]; size[t] = 0;
  }
  const remap = new Int16Array(T0).fill(-1);
  let n = 0;
  for (let t = 0; t < T0; t++) if (size[t] > 0) remap[t] = n++;
  for (let i = 0; i < N; i++) if (tid[i] >= 0) tid[i] = remap[tid[i]];
  const T = [];
  for (let t = 0; t < n; t++) T.push({ id: t, cells: [], size: 0, lx: 0, ly: 0, name: '', island: false });
  for (let i = 0; i < N; i++) if (tid[i] >= 0) T[tid[i]].cells.push(i);
  for (const comp of components(land, 1)) {
    const s = new Set(comp.map((i) => tid[i]));
    if (s.size === 1) T[[...s][0]].island = true;
  }

  // 3. 標籤位置：離區域邊界最遠的格子
  const din = new Int16Array(N).fill(-1), q = [];
  for (let i = 0; i < N; i++) {
    if (tid[i] < 0) continue;
    const x = i % W, y = (i / W) | 0;
    let edge = false;
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || tid[ny * W + nx] !== tid[i]) { edge = true; break; }
    }
    if (edge) { din[i] = 0; q.push(i); }
  }
  for (let h = 0; h < q.length; h++) {
    const c = q[h], x = c % W, y = (c / W) | 0;
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (tid[j] === tid[c] && din[j] < 0) { din[j] = din[c] + 1; q.push(j); }
    }
  }
  for (const t of T) {
    let sx = 0, sy = 0;
    for (const c of t.cells) { sx += c % W; sy += (c / W) | 0; }
    sx /= t.cells.length; sy /= t.cells.length;
    let best = -1e9, bc = t.cells[0];
    for (const c of t.cells) {
      const v = din[c] - 0.08 * Math.hypot((c % W) - sx, ((c / W) | 0) - sy);
      if (v > best) { best = v; bc = c; }
    }
    t.lx = (bc % W) + 0.5; t.ly = ((bc / W) | 0) + 0.5; t.size = t.cells.length;
  }

  // 4. 名稱
  const used = new Set();
  for (const t of T) {
    let nm;
    for (let tries = 0; tries < 50; tries++) {
      const suf = t.island ? SUF_ISLE : SUF;
      nm = PRE[Math.floor(rnd() * PRE.length)] + suf[Math.floor(rnd() * suf.length)];
      if (!used.has(nm)) break;
    }
    used.add(nm); t.name = nm;
  }

  // 5. 陸地相鄰與邊界線段（單位：格）
  const landAdj = T.map(() => new Set()), seaAdj = T.map(() => new Set()), lanes = [];
  const segs = T.map(() => []), coast = [], border = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!land[i]) continue;
    const t = tid[i];
    const chk = (nx, ny, seg) => {
      const j = nx < 0 || ny < 0 || nx >= W || ny >= H ? -1 : ny * W + nx;
      const u = j < 0 || !land[j] ? -1 : tid[j];
      if (u === t) return;
      segs[t].push([seg[0], seg[1], seg[2], seg[3], u]);
      if (u < 0) coast.push(seg);
      else { landAdj[t].add(u); if (t < u) border.push(seg); }
    };
    chk(x + 1, y, [x + 1, y, x + 1, y + 1]);
    chk(x - 1, y, [x, y, x, y + 1]);
    chk(x, y + 1, [x, y + 1, x + 1, y + 1]);
    chk(x, y - 1, [x, y, x + 1, y]);
  }

  // 6. 海路相鄰：從海岸往外搜尋一定距離內的其他陸地
  const stamp = new Int32Array(N).fill(-1), dep = new Int16Array(N), org = new Int32Array(N);
  let sid = 0;
  function seaSearch(group, maxD, onHit) {
    sid++;
    const gs = new Set(group), qq = [];
    for (const t of group) for (const c of T[t].cells) {
      const x = c % W, y = (c / W) | 0;
      for (const [dx, dy] of D4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (!land[j] && stamp[j] !== sid) { stamp[j] = sid; dep[j] = 1; org[j] = c; qq.push(j); }
      }
    }
    for (let h = 0; h < qq.length; h++) {
      const j = qq[h], x = j % W, y = (j / W) | 0;
      for (const [dx, dy] of D4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (land[k]) {
          const u = tid[k];
          if (!gs.has(u) && onHit(org[j], k, u)) return;
        } else if (stamp[k] !== sid && dep[j] < maxD) {
          stamp[k] = sid; dep[k] = dep[j] + 1; org[k] = org[j]; qq.push(k);
        }
      }
    }
  }
  const link = (a, b, c1, c2) => {
    if (a === b || landAdj[a].has(b) || seaAdj[a].has(b)) return;
    seaAdj[a].add(b); seaAdj[b].add(a); lanes.push([c1, c2, a, b]);
  };
  for (let t = 0; t < n; t++) seaSearch([t], 14, (o, k, u) => { link(t, u, o, k); return false; });
  // 保證整張圖連通
  for (let it = 0; it < 80; it++) {
    const g = new Int16Array(n).fill(-1), groups = [];
    for (let s = 0; s < n; s++) {
      if (g[s] >= 0) continue;
      const arr = [s]; g[s] = groups.length;
      for (let h = 0; h < arr.length; h++) for (const v of [...landAdj[arr[h]], ...seaAdj[arr[h]]]) if (g[v] < 0) { g[v] = groups.length; arr.push(v); }
      groups.push(arr);
    }
    if (groups.length <= 1) break;
    groups.sort((a, b) => a.length - b.length);
    seaSearch(groups[0], 9999, (o, k, u) => { link(tid[o], u, o, k); return true; });
  }

  // 7. 海洋深度（畫圖用）與陸地紋理
  const seaDist = new Int16Array(N).fill(-1), sq = [];
  for (let i = 0; i < N; i++) if (land[i]) { seaDist[i] = 0; sq.push(i); }
  for (let h = 0; h < sq.length; h++) {
    const c = sq[h], x = c % W, y = (c / W) | 0;
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (seaDist[j] < 0) { seaDist[j] = seaDist[c] + 1; sq.push(j); }
    }
  }
  const tex = new Float32Array(N);
  for (let i = 0; i < N; i++) tex[i] = nz(i % W / 5, ((i / W) | 0) / 5, 3);

  return {
    type, seed, W, H, land, tid, tex, seaDist, T, n,
    landAdj, seaAdj, adj: T.map((_, i) => [...landAdj[i], ...seaAdj[i]]),
    lanes, segs, coast, border,
  };
}
