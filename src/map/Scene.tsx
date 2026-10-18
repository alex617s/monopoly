import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { PLOTS, ROADS, regionById } from '../data/map';
import type { GameState } from '../game/types';
import { Avatar, Icon } from '../ui/common';
import type { Display } from '../ui/useEventPlayer';
import { WORLD_H, WORLD_W, toScreen } from './iso';
import { dynamicSvg, staticSvg } from './sceneSvg';

interface Props {
  state: GameState;
  display: Display;
  overview: boolean;
  forkOptions: number[] | null;
  onFork: (to: number) => void;
  onPlot: (plot: number) => void;
}

const OFFSETS = [
  [0, 0],
  [-30, 10],
  [30, 10],
  [0, 22],
  [-30, -12],
  [30, -12],
];

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
  const colors = useMemo(() => Object.fromEntries(state.players.map((p) => [p.id, p.color])), [state.players]);
  const dynamicMarkup = useMemo(() => dynamicSvg(state, colors), [state, colors]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Camera: follow whoever is moving, or show the whole of Australia.
  const focusPlayer = state.players.find((p) => p.id === display.focus) ?? state.players[state.current];
  const focusRoad = forkOptions?.length ? ROADS[display.pos[focusPlayer.id] ?? focusPlayer.pos] : ROADS[display.pos[focusPlayer.id] ?? focusPlayer.pos];
  let z: number;
  let tx: number;
  let ty: number;
  if (overview) {
    z = Math.min(size.w / (WORLD_W * 0.78), size.h / (WORLD_H * 0.8));
    tx = (size.w - WORLD_W * z) / 2;
    ty = (size.h - WORLD_H * z) / 2;
  } else {
    z = Math.max(0.55, Math.min(0.95, size.w / 1300));
    const c = toScreen(focusRoad.i, focusRoad.j);
    tx = size.w / 2 - c.x * z;
    ty = size.h * 0.55 - c.y * z;
  }

  const counts: Record<number, number> = {};
  const pieces = state.players
    .filter((p) => !p.out)
    .map((p) => {
      const road = ROADS[display.pos[p.id] ?? p.pos];
      const k = (counts[road.id] = (counts[road.id] ?? 0) + 1) - 1;
      const c = toScreen(road.i, road.j);
      const [ox, oy] = OFFSETS[k % OFFSETS.length];
      return { p, x: c.x + ox, y: c.y + oy };
    })
    .sort((a, b) => a.y - b.y);

  return (
    <div className="scene" ref={ref}>
      <div className="world" style={{ width: WORLD_W, height: WORLD_H, transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
        <svg className="world__svg" width={WORLD_W} height={WORLD_H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: staticMarkup }} />
        <svg className="world__svg" width={WORLD_W} height={WORLD_H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: dynamicMarkup }} />
        {PLOTS.map((pl) => {
          const c = toScreen(pl.i, pl.j);
          return (
            <button
              key={pl.id}
              type="button"
              className="plot-hit"
              style={{ left: c.x - 70, top: c.y - 50 }}
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
                <Avatar character={p.character} size={84} ring={p.color} className="piece__avatar" />
                <div className="piece__tag">{p.name}</div>
                {p.god && <span className="piece__god" style={{ background: GOD_COLORS[p.god.id] }} aria-label="God following">{GOD_GLYPH[p.god.id]}</span>}
                {p.vehicle && <span className="piece__vehicle"><Icon name={p.vehicle.kind} size={22} /></span>}
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
        {forkOptions?.map((to) => {
          // Put the sign between the first and second space of that way so the two signs sit apart.
          const r = ROADS[to];
          const r2 = ROADS[r.next[0]];
          const c = toScreen((r.i + r2.i) / 2, (r.j + r2.j) / 2);
          return (
            <button key={to} type="button" className="fork" style={{ left: c.x, top: c.y - 40 }} onClick={() => onFork(to)}>
              To {regionAhead(to).toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase())}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const GOD_COLORS: Record<string, string> = {
  wealth: '#e0a800',
  fortune: '#e0457b',
  land: '#8a5a33',
  angel: '#3aa6df',
  badLuck: '#5a4a8c',
  poverty: '#7a6a55',
  devil: '#c62f3a',
};
const GOD_GLYPH: Record<string, string> = { wealth: '$', fortune: '★', land: '⌂', angel: '✦', badLuck: '☁', poverty: '¢', devil: '⚡' };
export { GOD_COLORS, GOD_GLYPH };
