import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { WORLD_H, WORLD_W } from '../data/geo';
import { PLOTS, ROADS, regionById } from '../data/map';
import type { GameState } from '../game/types';
import { Icon, art } from '../ui/common';
import type { Display } from '../ui/useEventPlayer';
import { dynamicSvg, godArt, labelSvg, staticSvg } from './sceneSvg';

interface Props {
  state: GameState;
  display: Display;
  overview: boolean;
  forkOptions: number[] | null;
  onFork: (to: number) => void;
  onPlot: (plot: number) => void;
}

/** Where the k-th of n pieces stands on one space, so all of them can be seen. */
function spot(k: number, n: number): [number, number] {
  if (n === 1) return [0, 0];
  const row = n > 3 ? Math.floor(k / 3) : 0;
  const inRow = n > 3 ? (row === 0 ? 3 : n - 3) : n;
  const col = n > 3 ? k % 3 : k;
  return [(col - (inRow - 1) / 2) * 52, row * 22 - (n > 3 ? 10 : 0) + (col % 2) * 8];
}

/** A plane carrying a player from one airport to the other, along the dotted route. */
function Flight({ flight, player }: { flight: NonNullable<Display['flight']>; player: GameState['players'][number] }) {
  const a = ROADS[flight.from];
  const b = ROADS[flight.to];
  const mx = (a.x + b.x) / 2;
  const my = Math.min(a.y, b.y) - 520;
  const path = `path('M${a.x} ${a.y - 20} Q${mx} ${my} ${b.x} ${b.y - 20}')`;
  return (
    <div className="flight" style={{ offsetPath: path } as CSSProperties}>
      <div className={`flight__craft ${b.x < a.x ? 'flight__craft--west' : ''}`}>
        <svg viewBox="-60 -40 120 80" width="190" height="126" aria-hidden="true">
          <path d="M-50 0 L44 -6 Q60 0 44 6 Z" fill="#fff" stroke="#1b6fc2" strokeWidth="4" />
          <path d="M-4 -4 L-22 -36 L-8 -36 L18 -4Z M-4 4 L-22 36 L-8 36 L18 4Z M-42 -2 L-54 -18 L-44 -18 L-32 -2Z" fill="#e5383b" stroke="#fff" strokeWidth="3" />
          <circle cx="30" cy="-1" r="4" fill="#9fd8ff" />
        </svg>
        <img className="flight__rider" src={art(`char-${player.character}`)} alt="" draggable={false} />
      </div>
    </div>
  );
}

/** What a player rides on: the ferry, a scooter or a car. Uses the ChatGPT picture when there is one. */
function Ride({ kind }: { kind: 'boat' | 'scooter' | 'car' }) {
  const [failed, setFailed] = useState(false);
  const name = kind === 'boat' ? 'prop-boat' : `vehicle-${kind}`;
  if (!failed) return <img className={`ride ride--${kind}`} src={art(name)} alt="" draggable={false} onError={() => setFailed(true)} />;
  if (kind === 'boat')
    return (
      <svg className="ride ride--boat" viewBox="-70 -40 140 70" aria-hidden="true">
        <path d="M-60 0 h120 l-18 22 h-84z" fill="#e5383b" stroke="#fff" strokeWidth="4" />
        <path d="M-66 26 q16 -8 32 0 q16 8 32 0 q16 -8 32 0 q16 8 32 0" stroke="#fff" strokeWidth="5" fill="none" />
      </svg>
    );
  return (
    <svg className={`ride ride--${kind}`} viewBox="-60 -40 120 70" aria-hidden="true">
      <path d={kind === 'car' ? 'M-52 6 q0 -20 18 -22 l14 -16 h40 l16 16 q18 2 18 22 v8 h-106z' : 'M-40 8 l20 -22 h28 l10 -14 h10 l-6 20 l24 16 z'} fill={kind === 'car' ? '#3a86ff' : '#e5383b'} stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
      <circle cx="-30" cy="16" r="11" fill="#2b2d42" stroke="#fff" strokeWidth="3" />
      <circle cx="32" cy="16" r="11" fill="#2b2d42" stroke="#fff" strokeWidth="3" />
    </svg>
  );
}

/** The next few spaces along one way, for showing the choice at a fork. */
function pathAhead(to: number) {
  const out = [to];
  while (out.length < 4) out.push(ROADS[out[out.length - 1]].next[0]);
  return out;
}

/** A building rising out of the ground with a puff of dust. */
function Rising({ plot, level }: { plot: number; level: number }) {
  const pl = PLOTS[plot];
  const w = level >= 4 ? 176 : 170;
  return (
    <div className="rise" style={{ left: pl.x - w / 2, top: pl.y + 44 - w, width: w, height: w }}>
      <div className="rise__dust" />
      <img className="rise__img" src={art(`build-${Math.max(1, level)}`)} alt="" draggable={false} />
      <div className="rise__stars" aria-hidden="true">✦ ✦ ✦</div>
    </div>
  );
}

/** Name of the first region the road reaches, for fork buttons. */
function regionAhead(start: number) {
  let at = start;
  for (let k = 0; k < 20; k++) {
    const r = ROADS[at];
    if (r.plot !== undefined) return regionById(PLOTS[r.plot].region).name;
    at = r.next[0];
  }
  return 'this way';
}

export function Scene({ state, display, overview, forkOptions, onFork, onPlot }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1000, h: 700 });
  const staticMarkup = useMemo(() => staticSvg(), []);
  const labelMarkup = useMemo(() => labelSvg(), []);
  const colors = useMemo(() => Object.fromEntries(state.players.map((p) => [p.id, p.color])), [state.players]);
  const rising = display.building;
  const dynamicMarkup = useMemo(() => dynamicSvg(state, colors, rising?.plot ?? null), [state, colors, rising?.plot]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Camera: follow whoever is moving, or show the whole of Australia.
  const focusPlayer = state.players.find((p) => p.id === display.focus) ?? state.players[state.current];
  const focusRoad = rising ? PLOTS[rising.plot] : ROADS[display.pos[focusPlayer.id] ?? focusPlayer.pos];
  let z: number;
  let tx: number;
  let ty: number;
  if (overview || display.flight) {
    z = Math.min(size.w / WORLD_W, size.h / WORLD_H) * 1.05;
    tx = (size.w - WORLD_W * z) / 2;
    ty = (size.h - WORLD_H * z) / 2;
  } else {
    z = Math.max(0.55, Math.min(0.95, size.w / 1350));
    // follow the piece, but never past the edge of the sea
    tx = Math.min(0, Math.max(size.w - WORLD_W * z, size.w / 2 - focusRoad.x * z));
    ty = Math.min(0, Math.max(size.h - WORLD_H * z, size.h * 0.56 - focusRoad.y * z));
  }

  const live = state.players.filter((p) => !p.out);
  const roadOf = (id: string) => display.pos[id] ?? state.players.find((p) => p.id === id)!.pos;
  const pieces = live
    .filter((p) => p.id !== display.flight?.playerId)
    .map((p) => {
      const road = ROADS[roadOf(p.id)];
      const here = live.filter((o) => roadOf(o.id) === road.id);
      const [ox, oy] = spot(here.indexOf(p), here.length);
      return { p, x: road.x + ox, y: road.y + oy };
    })
    .sort((a, b) => a.y - b.y);

  // Each fork sign stands a little way along its own road, pointing the way.
  const forkSigns = (forkOptions ?? []).map((to) => {
    const here = ROADS[roadOf(state.players[state.current].id)];
    const ahead = ROADS[pathAhead(to)[1]];
    const dx = ahead.x - here.x;
    const dy = ahead.y - here.y;
    const len = Math.hypot(dx, dy) || 1;
    const reach = Math.min(len, 230);
    return { to, x: here.x + (dx / len) * reach, y: here.y + (dy / len) * reach - 20, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
  });
  // keep two signs from covering each other
  if (forkSigns.length === 2 && Math.hypot(forkSigns[0].x - forkSigns[1].x, forkSigns[0].y - forkSigns[1].y) < 120) {
    const [a, b] = forkSigns;
    const up = a.y < b.y ? a : b;
    up.y -= 70;
    (up === a ? b : a).y += 30;
  }

  return (
    <div className="scene" ref={ref}>
      <div className="world" style={{ width: WORLD_W, height: WORLD_H, transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
        <svg className="world__svg" width={WORLD_W} height={WORLD_H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: staticMarkup }} />
        <svg className="world__svg" width={WORLD_W} height={WORLD_H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: dynamicMarkup }} />
        <svg className="world__svg" width={WORLD_W} height={WORLD_H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: labelMarkup }} />
        {PLOTS.map((pl) => {
          return (
            <button
              key={pl.id}
              type="button"
              className="plot-hit"
              style={{ left: pl.x - 75, top: pl.y - 110 }}
              aria-label={`${pl.name}, $${pl.price}`}
              onClick={() => onPlot(pl.id)}
            />
          );
        })}
        {pieces.map(({ p, x, y }) => {
          const bubble = display.bubbles.find((b) => b.playerId === p.id);
          const pop = display.pops.filter((m) => m.playerId === p.id).slice(-1)[0];
          const active = p.id === state.players[state.current].id && !state.over;
          const onBoat = ROADS[roadOf(p.id)].disc === 'ferry';
          const ride = onBoat ? 'boat' : p.vehicle?.kind ?? null;
          return (
            <div
              key={p.id}
              className={`piece ${active ? 'piece--active' : ''} ${display.hopping === p.id ? 'piece--hop' : ''} ${ride ? 'piece--ride' : ''} ${display.slow === p.id ? 'piece--slow' : ''}`}
              style={{ left: x, top: y, '--c': p.color } as CSSProperties}
            >
              <div className="piece__shadow" />
              {ride && <Ride kind={ride} />}
              <div className="piece__body">
                <img className="piece__figure" src={art(`char-${p.character}`)} alt="" draggable={false} />
                <div className="piece__tag">{p.name}</div>
                {p.god && (
                  <span className="piece__god" title={`${p.god.days} days left`}>
                    <img src={art(godArt(p.god.id))} alt="God following" draggable={false} />
                    <b className="days-badge">{p.god.days}</b>
                  </span>
                )}
                {p.vehicle && (
                  <span className="piece__vehicle">
                    <Icon name={p.vehicle.kind} size={22} />
                    <b className="days-badge">{p.vehicle.days}</b>
                  </span>
                )}
                {p.balloon !== null && (
                  <span className="piece__balloon">
                    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 2c5 0 8 4 8 8 0 5-5 9-8 9s-8-4-8-9c0-4 3-8 8-8z" fill="#3a86ff" stroke="#fff" strokeWidth="1.5" /><path d="M12 19l-1 3h2z" fill="#3a86ff" /></svg>
                    <b className="days-badge">{p.balloon}</b>
                  </span>
                )}
                {p.auto && <span className="piece__auto">AUTO</span>}
              </div>
              {bubble && <div className="bubble" key={bubble.key}>{bubble.text}</div>}
              {pop && (
                <div key={pop.key} className={`pop ${pop.amount > 0 ? 'pop--up' : 'pop--down'}`}>
                  {pop.amount > 0 ? '+' : '-'}${Math.abs(pop.amount)}
                </div>
              )}
            </div>
          );
        })}
        {display.flight && <Flight key={display.flight.key} flight={display.flight} player={state.players.find((p) => p.id === display.flight!.playerId)!} />}
        {rising && <Rising key={rising.key} plot={rising.plot} level={rising.level} />}
        {forkOptions && forkOptions.length > 0 && (
          <svg className="world__svg fork-glow" width={WORLD_W} height={WORLD_H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} aria-hidden="true">
            {forkOptions.map((to) => (
              <polyline key={to} points={pathAhead(to).map((r) => `${ROADS[r].x},${ROADS[r].y}`).join(' ')} />
            ))}
          </svg>
        )}
        {forkSigns.map(({ to, x, y, angle }) => (
          <button key={to} type="button" className="fork" style={{ left: x, top: y }} onClick={() => onFork(to)}>
            <span className="fork__arrow" style={{ transform: `rotate(${angle}deg)` }} aria-hidden="true">
              ➜
            </span>
            To {regionAhead(to).toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase())}
          </button>
        ))}
      </div>
    </div>
  );
}
