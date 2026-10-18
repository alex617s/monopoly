import { useEffect, useState } from 'react';
import { characterById } from '../data/content';
import { landValue } from '../game/engine';
import type { GameState } from '../game/types';
import { Avatar, art, money } from './common';
import type { Overlay } from './useEventPlayer';

const SEGMENTS = [
  { n: 1, color: '#ff5a5f', d: 'M200 200 L200 20 A180 180 0 0 1 355.88 110 Z' },
  { n: 2, color: '#ffc93c', d: 'M200 200 L355.88 110 A180 180 0 0 1 355.88 290 Z' },
  { n: 3, color: '#22a45d', d: 'M200 200 L355.88 290 A180 180 0 0 1 200 380 Z' },
  { n: 4, color: '#3a86ff', d: 'M200 200 L200 380 A180 180 0 0 1 44.12 290 Z' },
  { n: 5, color: '#8f5cf7', d: 'M200 200 L44.12 290 A180 180 0 0 1 44.12 110 Z' },
  { n: 6, color: '#ff8a1f', d: 'M200 200 L44.12 110 A180 180 0 0 1 200 20 Z' },
];

function Wheel({ value, delay, size }: { value: number; delay: number; size: number }) {
  const [angle, setAngle] = useState(0);
  useEffect(() => {
    // Segment n is centred at 60n - 120 degrees from the top; bring it under the pointer.
    const target = 360 * 5 - (60 * value - 30);
    const t = setTimeout(() => setAngle(target), 30);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div className="wheel" style={{ width: size, height: size + 30 }}>
      <svg className="wheel__pointer" width="40" height="46" viewBox="0 0 40 46" aria-hidden="true">
        <path d="M4 4h32L20 42z" fill="#fff" stroke="#14213d" strokeWidth="4" strokeLinejoin="round" />
      </svg>
      <div className="wheel__rim" style={{ width: size, height: size }}>
        <svg
          width={size - 20}
          height={size - 20}
          viewBox="0 0 400 400"
          style={{ transform: `rotate(${angle}deg)`, transitionDelay: `${delay}ms` }}
          className="wheel__disc"
          aria-hidden="true"
        >
          {SEGMENTS.map((s) => (
            <path key={s.n} d={s.d} fill={s.color} stroke="#fff" strokeWidth="4" />
          ))}
          <g className="wheel__nums">
            {/* Each number faces outwards, so the one that stops under the pointer is upright. */}
            {SEGMENTS.map((s) => (
              <text key={s.n} x="200" y="92" textAnchor="middle" transform={`rotate(${60 * s.n - 30} 200 200)`}>
                {s.n}
              </text>
            ))}
          </g>
          <circle cx="200" cy="200" r="54" fill="#fff" stroke="#14213d" strokeWidth="6" />
          <circle cx="200" cy="200" r="38" fill="#ffc93c" />
        </svg>
      </div>
    </div>
  );
}

export function OverlayView({ overlay, state, onSkip }: { overlay: Overlay; state: GameState; onSkip: () => void }) {
  const player = (id: string) => state.players.find((p) => p.id === id);
  if (overlay.kind === 'spin') {
    const p = player(overlay.playerId)!;
    const total = overlay.wheels.reduce((a, b) => a + b, 0);
    const size = overlay.wheels.length === 1 ? 340 : overlay.wheels.length === 2 ? 290 : 230;
    return (
      <div className="overlay overlay--dim" onClick={onSkip}>
        <div className="spin-head">
          <Avatar character={p.character} size={48} ring={p.color} />
          <span>{overlay.remote ? `${p.name} uses Remote Dice!` : overlay.wheels.length > 1 ? `${p.name} spins ${overlay.wheels.length} wheels!` : `${p.name} spins!`}</span>
        </div>
        <div className="wheels" role="img" aria-label={`Wheel result ${overlay.wheels.join(' + ')} = ${total}`}>
          {overlay.wheels.map((w, k) => (
            <Wheel key={k} value={w} delay={k * 250} size={size} />
          ))}
        </div>
        <div className="spin-result">
          <span>MOVE</span>
          <strong>{total}</strong>
        </div>
      </div>
    );
  }
  if (overlay.kind === 'news') {
    return (
      <div className="overlay overlay--dim" onClick={onSkip}>
        <div className="news">
          <div className="news__bar">
            <span className="news__tag">BREAKING NEWS</span>
            <span className="news__day">AUSSIE TV · DAY {overlay.day}</span>
          </div>
          <div className="news__body">
            <h2>{overlay.headline}</h2>
            <p>{overlay.text}</p>
          </div>
        </div>
      </div>
    );
  }
  if (overlay.kind === 'notice') {
    const p = overlay.playerId ? player(overlay.playerId) : null;
    return (
      <div className="overlay overlay--dim" onClick={onSkip}>
        <div className={`notice notice--${overlay.tone}`}>
          <div className="notice__pic">
            {overlay.art ? <img src={art(overlay.art)} alt="" /> : p ? <Avatar character={p.character} size={96} ring={p.color} /> : null}
            {overlay.days !== null && (
              <span className="notice__days">
                <b>{overlay.days}</b>
                <small>{overlay.days === 1 ? 'day' : 'days'}</small>
              </span>
            )}
          </div>
          <h2>{overlay.title}</h2>
          <p>{overlay.text}</p>
          <span className="notice__tap">Tap to close</span>
        </div>
      </div>
    );
  }
  if (overlay.kind === 'chance') {
    const p = player(overlay.playerId)!;
    return (
      <div className="overlay overlay--dim" onClick={onSkip}>
        <div className="chance">
          <div className="chance__head">? CHANCE</div>
          <Avatar character={p.character} size={72} ring={p.color} />
          <p>{overlay.text}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="overlay overlay--dim" onClick={onSkip}>
      <div className="last-round">
        <strong>LAST ROUND!</strong>
        <span>Everyone gets one more turn.</span>
      </div>
    </div>
  );
}

export function Podium({ state, onHome, onAgain }: { state: GameState; onHome: () => void; onAgain?: () => void }) {
  const rows = state.ranking ?? [];
  const byId = (id: string) => state.players.find((p) => p.id === id)!;
  const top = rows.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return (
    <div className="overlay overlay--podium">
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 40 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 10) * 0.2}s` }} />
        ))}
      </div>
      <h1 className="podium__title">{byId(rows[0].id).name} wins the Australian Adventure!</h1>
      <div className="podium">
        {order.map((r) => {
          const place = rows.indexOf(r) + 1;
          const p = byId(r.id);
          return (
            <div key={r.id} className={`podium__step podium__step--${place}`}>
              <Avatar character={p.character} size={place === 1 ? 110 : 84} ring={p.color} />
              <strong>{p.name}</strong>
              <span>{money(r.total)}</span>
              <div className="podium__block">{place}</div>
            </div>
          );
        })}
      </div>
      <table className="score-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Cash</th>
            <th>Savings</th>
            <th>Land &amp; buildings</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const p = byId(r.id);
            return (
              <tr key={r.id}>
                <td>{i + 1}</td>
                <td>
                  {p.name} <small>({characterById(p.character).animal})</small>
                </td>
                <td>{p.out ? 'Out' : money(p.cash)}</td>
                <td>{p.out ? '' : money(p.savings)}</td>
                <td>{p.out ? '' : money(landValue(state, p.id))}</td>
                <td>
                  <strong>{p.out ? 'Out' : money(r.total)}</strong>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="row-center">
        {onAgain && (
          <button type="button" className="btn btn--go btn--big" onClick={onAgain}>
            Play Again
          </button>
        )}
        <button type="button" className="btn btn--big" onClick={onHome}>
          Home
        </button>
      </div>
    </div>
  );
}
