'use client';
import { useEffect, useRef, useState } from 'react';
import { RES_LABEL } from '../lib/game.js';

export default function Dice({ ev, color, mine, onDone }) {
  const [face, setFace] = useState(1);
  const [final, setFinal] = useState(false);
  const done = useRef(false);
  const finish = () => { if (!done.current) { done.current = true; onDone(); } };

  useEffect(() => {
    let n = 0, to;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const spins = reduce ? 0 : 14;
    const tick = () => {
      if (n < spins) {
        setFace(1 + Math.floor(Math.random() * ev.sides));
        n++; to = setTimeout(tick, 45 + n * 8);
      } else {
        setFace(ev.r); setFinal(true);
        to = setTimeout(finish, 1900);
      }
    };
    tick();
    return () => clearTimeout(to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.id]);

  const cls = final ? ev.res.toLowerCase() : '';
  return (
    <div className="dice" onClick={() => final && finish()} role="dialog" aria-live="polite">
      <div className="dbox" style={{ '--pc': color }}>
        <div className="dwho">{mine ? '你的行動' : '對手行動'}</div>
        <div className="dtitle">{ev.title}</div>
        <div className="dsub">{ev.sub}</div>
        <div className={'die ' + cls}>
          <span>{face}</span>
          <small>d{ev.sides}</small>
        </div>
        <div className="strip big" aria-hidden="true">
          {ev.strip.map((x, i) => (
            <i key={i} className={x.toLowerCase() + (final && i + 1 === ev.r ? ' on' : '')}>{i + 1}</i>
          ))}
        </div>
        <div className={'dres ' + cls}>{final ? RES_LABEL[ev.res] : '擲骰中…'}</div>
        <div className="dhint">{final ? '點一下繼續' : ' '}</div>
      </div>
    </div>
  );
}
