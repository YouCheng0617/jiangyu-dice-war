'use client';
import { useEffect, useState } from 'react';
import { THEME_LIST } from '../lib/theme.js';

// 切換外觀主題。選擇會存在這個瀏覽器（localStorage），也可以用網址 ?theme=xuan 直接指定。
export default function ThemePicker() {
  const [cur, setCur] = useState('classic');
  useEffect(() => { setCur(document.documentElement.dataset.theme || 'classic'); }, []);
  const change = (e) => {
    const v = e.target.value;
    setCur(v);
    if (v === 'classic') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = v;
    try { localStorage.setItem('jy-theme', v); } catch {}
    window.dispatchEvent(new Event('jy-theme'));
  };
  return (
    <label className="themepick">
      <span className="lbl">外觀</span>
      <select value={cur} onChange={change} aria-label="外觀主題">
        {THEME_LIST.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
      </select>
    </label>
  );
}
