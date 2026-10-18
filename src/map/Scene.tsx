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
  if (overview) {
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
          return (
            <div
              key={p.id}
              className={`piece ${active ? 'piece--active' : ''} ${display.hopping === p.id ? 'piece--hop' : ''}`}
              style={{ left: x, top: y, '--c': p.color } as CSSProperties}
            >
              <div className="piece__shadow" />
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
