'use client';
import { useEffect, useRef } from 'react';
import { startSeaBg } from '../lib/seabg.js';

// 背景的水紋（只在水墨主題顯示，CSS 控制；系統設為「減少動態效果」時只畫靜止的一格）
export default function SeaBg() {
  const ref = useRef(null);
  useEffect(() => (ref.current ? startSeaBg(ref.current) : undefined), []);
  return <canvas ref={ref} className="seabg" aria-hidden="true" />;
}
