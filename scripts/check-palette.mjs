// 檢查各主題的國家色：彼此要分得開、蘇聯紅不能像「大失敗」、德國灰不能像「失敗」。
// 用法：node scripts/check-palette.mjs        （色差用 CIE Lab 距離 ΔE76，越大越容易分辨）
import { readFileSync } from 'node:fs';
import { MAP_THEMES } from '../lib/theme.js';

const css = readFileSync(new URL('../app/themes.css', import.meta.url), 'utf8') + '\n' + readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function lab([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [f(r), f(g), f(b)];
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const t = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return [116 * t(Y) - 16, 500 * (t(X) - t(Y)), 200 * (t(Y) - t(Z))];
}
const dE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));
const mix = (a, b, t) => a.map((v, i) => v * t + b[i] * (1 - t));

function vars(block) {
  const o = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) o[m[1]] = m[2];
  return o;
}
function blockOf(sel) {
  // 同一個選擇器可能出現多次（含逗號群組），把每個以變數為主的區塊合併
  const re = new RegExp('(?:^|[\\s,}])' + sel.replace(/[[\]"]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g');
  let o = {};
  for (const m of css.matchAll(re)) o = { ...o, ...vars(m[1]) };
  return o;
}
const base = vars(css.match(/:root\s*\{([^}]*)\}/)[1]);
const themes = { classic: base, xuan: 'xuan', modai: 'modai', qingshan: 'qingshan', zhuyin: 'zhuyin' };
const KEYS = ['JP', 'UK', 'US', 'IT', 'FR', 'DE', 'SU'];
let bad = 0;
for (const [name, v0] of Object.entries(themes)) {
  const v = name === 'classic' ? base : { ...base, ...blockOf(`html[data-theme="${name}"]`) };
  const th = MAP_THEMES[name];
  const land = mix(th.land.light, th.land.dark, 0.5);
  const onMap = {}; const raw = {};
  for (const k of KEYS) { raw[k] = hex(v['n-' + k]); onMap[k] = mix(raw[k], land, th.natAlpha); }
  let min = 1e9, pair = '';
  for (let i = 0; i < KEYS.length; i++) for (let j = i + 1; j < KEYS.length; j++) {
    const d = dE(onMap[KEYS[i]], onMap[KEYS[j]]);
    if (d < min) { min = d; pair = KEYS[i] + '–' + KEYS[j]; }
  }
  const suBad = dE(raw.SU, hex(v.bad)), deFail = dE(raw.DE, hex(v.fail)), suOnMapBad = dE(onMap.SU, hex(v.bad));
  const minLand = Math.min(...KEYS.map((k) => dE(onMap[k], land)));
  const row = [name.padEnd(9), '地圖上最近的兩國', pair.padEnd(6), min.toFixed(0).padStart(3), '｜蘇聯vs大失敗', suBad.toFixed(0).padStart(3), '｜德國vs失敗', deFail.toFixed(0).padStart(3), '｜離陸地最近', minLand.toFixed(0).padStart(3)];
  const warn = [];
  if (min < 22) warn.push('國家色太近');
  if (suBad < 30) warn.push('蘇聯≈大失敗');
  if (deFail < 30) warn.push('德國≈失敗');
  if (minLand < 20) warn.push('有國家色融進陸地');
  console.log(row.join(' ') + (warn.length ? '  ⚠ ' + warn.join('、') : '  ✓'));
  if (warn.length && name !== 'classic') bad++;
}
process.exitCode = bad ? 1 : 0;
