// 主題：網站配色在 app/globals.css（預設）與 app/themes.css（各主題）；
// 這裡是「地圖畫布」用的設定，因為 canvas 讀不到 CSS。
// 主題名稱由 <html data-theme="..."> 決定，沒有設定時就是 classic（原本的暗色作戰室）。

export const THEME_LIST = [
  ['classic', '作戰室（原版）'],
  ['xuan', '宣紙'],
  ['modai', '墨夜'],
  ['qingshan', '青山'],
  ['zhuyin', '朱印'],
];

const CLASSIC = {
  sea: { near: [126, 176, 194], far: [30, 62, 92], pow: 0.8, dist: 14 },
  grid: 'rgba(255,255,255,.07)',
  shoal: 'rgba(214,236,238,.45)',
  land: { light: [238, 227, 192], dark: [206, 190, 146] },
  wash: 0, grain: 0, brush: false, mul: false,
  ink: [28, 26, 24], shoalRGB: [214, 236, 238], haloA: 0, coastInk: 0, waves: 'rgba(0,0,0,0)', cun: 'rgba(0,0,0,0)', splat: 'rgba(0,0,0,0)', glow: 'rgba(255,255,255,0)', hl: null, borderA: 0.3, cloud: 'rgba(0,0,0,0)', seal: '#b8322a',
  scale: 'rgba(232,238,236,.8)',
  border: 'rgba(74,54,30,.4)', coast: 'rgba(38,32,24,.9)', coastW: 1.4,
  lane: 'rgba(226,238,240,.32)',
  hatch: 'rgba(180,28,24,.55)', dotHit: '#c8302a', dotMiss: 'rgba(255,248,232,.85)', dotLine: '#4a1612',
  burn: ['rgba(70,40,20,.28)', 'rgba(40,20,8,.5)'],
  label: '#2c2216', halo: 'rgba(246,238,216,.85)', capLine: '#1d1710',
  natAlpha: 0.6, edgeShade: 0.6,
  target: '255,250,228', targetEdge: 'rgba(255,251,236,.95)',
  src: 'rgba(244,201,92,.95)', srcSel: '#f4c95c', route: '#f4c95c', focus: '#ffffff', hover: 'rgba(255,255,255,.8)',
  badge: '#d8722a', badgeLine: '#3a1a08', badgeText: '#fff6e8',
};

export const MAP_THEMES = {
  classic: CLASSIC,

  // 宣紙：米白宣紙上的淡墨山水，海是由淺到深的墨暈
  xuan: {
    ...CLASSIC,
    sea: { near: [228, 229, 220], far: [128, 140, 142], pow: 0.9, dist: 14, blur: 6 },
    grid: 'rgba(0,0,0,0)', shoal: 'rgba(250,248,240,.8)',
    land: { light: [246, 246, 243], dark: [226, 226, 222] }, tex: "coast",
    wash: 14, grain: 1,
    hl: { target: [184, 50, 42], src: [30, 28, 25], sel: [30, 28, 25], focus: [30, 28, 25], hover: [30, 28, 25] },
    cloud: 'rgba(50,56,56,.30)', seal: '#b8322a',
    brush: true, mul: true, ink: [30, 28, 25], shoalRGB: [252, 250, 244], haloA: 0.85, coastInk: 0.8,
    waves: 'rgba(50,56,56,.16)', cun: 'rgba(40,36,30,.10)', splat: 'rgba(30,28,25,.45)', glow: 'rgba(30,28,25,.35)',
    scale: 'rgba(40,36,30,.75)',
    border: 'rgba(60,52,40,.28)', coast: 'rgba(28,26,24,.85)', coastW: 1.5,
    lane: 'rgba(250,248,240,.6)',
    hatch: 'rgba(28,26,24,.55)', dotHit: '#1f1d1a', dotMiss: 'rgba(250,248,240,.95)', dotLine: '#1f1d1a',
    burn: ['rgba(60,48,36,.3)', 'rgba(24,20,16,.55)'],
    label: '#1f1d1a', halo: 'rgba(250,247,238,.85)', capLine: '#1f1d1a',
    natAlpha: 0.62, edgeShade: 0.62,
    target: '255,255,255', targetEdge: 'rgba(255,255,255,.95)',
    src: 'rgba(160,40,30,.95)', srcSel: '#b8322a', route: '#b8322a', focus: '#1f1d1a', hover: 'rgba(31,29,26,.7)',
    badge: '#2a2723', badgeLine: '#0e0d0c', badgeText: '#f6f1e4',
  },

  // 墨夜：濃墨的夜海與骨白的陸地，像黑底的水墨
  modai: {
    ...CLASSIC,
    sea: { near: [62, 70, 72], far: [8, 10, 12], pow: 0.8, dist: 14, blur: 6 },
    grid: 'rgba(0,0,0,0)', shoal: 'rgba(200,208,206,.28)',
    land: { light: [232, 226, 208], dark: [190, 182, 160] },
    wash: 20, grain: 1,
    hl: { target: [255, 96, 72], src: [18, 16, 14], sel: [18, 16, 14], focus: [18, 16, 14], hover: [18, 16, 14] },
    cloud: 'rgba(214,222,220,.22)', seal: '#c93a28',
    brush: true, mul: false, ink: [16, 14, 12], shoalRGB: [210, 216, 214], haloA: 0.7, coastInk: 0.9,
    waves: 'rgba(214,222,220,.10)', cun: 'rgba(30,26,20,.14)', splat: 'rgba(220,226,224,.4)', glow: 'rgba(255,255,255,.7)',
    scale: 'rgba(232,228,214,.8)',
    border: 'rgba(60,54,44,.35)', coast: 'rgba(14,14,14,.9)', coastW: 1.5,
    lane: 'rgba(226,230,226,.38)',
    hatch: 'rgba(20,18,16,.6)', dotHit: '#16140f', dotMiss: 'rgba(250,246,234,.95)', dotLine: '#16140f',
    burn: ['rgba(60,48,36,.3)', 'rgba(24,20,16,.55)'],
    label: '#1b1915', halo: 'rgba(240,234,216,.85)', capLine: '#16140f',
    natAlpha: 0.66, edgeShade: 0.55,
    target: '255,252,240', targetEdge: 'rgba(255,253,244,.95)',
    src: 'rgba(240,92,66,.95)', srcSel: '#f0553d', route: '#f0553d', focus: '#ffffff', hover: 'rgba(255,255,255,.8)',
    badge: '#e8e2d0', badgeLine: '#16140f', badgeText: '#16140f',
  },

  // 青山：霧氣般的青灰墨色，水是淡青墨
  qingshan: {
    ...CLASSIC,
    sea: { near: [208, 224, 222], far: [96, 128, 134], pow: 0.85, dist: 14, blur: 6 },
    grid: 'rgba(0,0,0,0)', shoal: 'rgba(240,248,246,.7)',
    land: { light: [244, 242, 230], dark: [214, 214, 196] },
    wash: 16, grain: 1,
    hl: { target: [31, 110, 120], src: [22, 40, 44], sel: [22, 40, 44], focus: [22, 40, 44], hover: [22, 40, 44] },
    cloud: 'rgba(30,60,66,.30)', seal: '#b8453d',
    brush: true, mul: true, ink: [22, 40, 44], shoalRGB: [244, 250, 248], haloA: 0.85, coastInk: 0.75,
    waves: 'rgba(30,60,66,.15)', cun: 'rgba(24,44,50,.11)', splat: 'rgba(22,40,44,.45)', glow: 'rgba(20,50,56,.4)',
    scale: 'rgba(24,44,50,.75)',
    border: 'rgba(40,62,62,.28)', coast: 'rgba(22,40,44,.85)', coastW: 1.5,
    lane: 'rgba(246,250,248,.6)',
    hatch: 'rgba(24,36,40,.55)', dotHit: '#1b2a2e', dotMiss: 'rgba(246,250,246,.95)', dotLine: '#1b2a2e',
    burn: ['rgba(50,50,40,.3)', 'rgba(20,24,22,.55)'],
    label: '#1b2a2e', halo: 'rgba(246,248,240,.85)', capLine: '#1b2a2e',
    natAlpha: 0.62, edgeShade: 0.6,
    target: '255,255,255', targetEdge: 'rgba(255,255,255,.95)',
    src: 'rgba(30,100,110,.95)', srcSel: '#1f6e78', route: '#1f6e78', focus: '#1b2a2e', hover: 'rgba(27,42,46,.7)',
    badge: '#27363a', badgeLine: '#0c1416', badgeText: '#f2f6f0',
  },

  // 朱印：黑白木刻加一點朱砂，平塗、無漸層、線條粗
  zhuyin: {
    ...CLASSIC,
    sea: { near: [238, 236, 230], far: [168, 168, 162], pow: 1.1, dist: 10, blur: 3 },
    grid: 'rgba(0,0,0,0)', shoal: 'rgba(255,255,255,.9)',
    land: { light: [252, 250, 244], dark: [236, 232, 220] },
    wash: 0, grain: 1,
    hl: { target: [196, 40, 28], src: [14, 13, 12], sel: [14, 13, 12], focus: [14, 13, 12], hover: [14, 13, 12] },
    cloud: 'rgba(14,13,12,.28)', seal: '#c4281c',
    brush: true, mul: true, ink: [14, 13, 12], shoalRGB: [255, 255, 255], haloA: 0.9, coastInk: 1,
    waves: 'rgba(14,13,12,.14)', cun: 'rgba(14,13,12,.16)', splat: 'rgba(14,13,12,.6)', glow: 'rgba(14,13,12,.4)',
    scale: 'rgba(20,18,16,.85)',
    border: 'rgba(20,18,16,.35)', coast: 'rgba(14,13,12,.95)', coastW: 2.2,
    lane: 'rgba(14,13,12,.55)',
    hatch: 'rgba(14,13,12,.6)', dotHit: '#0e0d0c', dotMiss: 'rgba(255,255,255,1)', dotLine: '#0e0d0c',
    burn: ['rgba(40,34,28,.3)', 'rgba(14,13,12,.6)'],
    label: '#0e0d0c', halo: 'rgba(255,255,255,.9)', capLine: '#0e0d0c',
    natAlpha: 0.7, edgeShade: 0.55,
    target: '255,255,255', targetEdge: 'rgba(14,13,12,.95)',
    src: 'rgba(196,40,28,.95)', srcSel: '#c4281c', route: '#c4281c', focus: '#0e0d0c', hover: 'rgba(14,13,12,.7)',
    badge: '#0e0d0c', badgeLine: '#0e0d0c', badgeText: '#ffffff',
  },
};

export function themeKey() {
  if (typeof document === 'undefined') return 'classic';
  const k = document.documentElement.dataset.theme;
  return MAP_THEMES[k] ? k : 'classic';
}
export const mapTheme = () => MAP_THEMES[themeKey()];

// canvas 讀不到 var(--n-XX)，這裡把目前主題的國家色解析成 #rrggbb
export function nationColors(keys) {
  const out = {};
  const cs = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  for (const k of keys) {
    const v = cs ? cs.getPropertyValue('--n-' + k).trim() : '';
    out[k] = /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#888888';
  }
  return out;
}
