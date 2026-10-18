import { MAINLAND_PLANE, Pt, TASMANIA_PLANE, WORLD_H, WORLD_W, smoothPath, toWorld } from '../data/geo';
import { OUTER_CURVE, PLOTS, ROADS, SHORT_CURVE } from '../data/map';
import type { GameState } from '../game/types';
import type { Display } from '../ui/useEventPlayer';

const LAND = [MAINLAND_PLANE, TASMANIA_PLANE].map((pts) => smoothPath(pts.map(toWorld), true, 1));
const line = (pts: Pt[], closed: boolean) => 'M' + pts.filter((_, i) => i % 4 === 0).map((p) => `${p[0].toFixed(0)} ${p[1].toFixed(0)}`).join(' L') + (closed ? 'Z' : '');
const ROAD_D = [line(OUTER_CURVE, true), line(SHORT_CURVE, false)];

/** A small overview: the road, owned places and every player. */
export function MiniMap({ state, display, onOpen }: { state: GameState; display: Display; onOpen: () => void }) {
  const colors = Object.fromEntries(state.players.map((p) => [p.id, p.color]));
  return (
    <button type="button" className="minimap" onClick={onOpen} aria-label="Show the whole map">
      <svg viewBox={`120 120 ${WORLD_W - 240} ${WORLD_H - 240}`} width="100%" height="100%" aria-hidden="true">
        <rect x="0" y="0" width={WORLD_W} height={WORLD_H} fill="#1e6fb8" />
        {LAND.map((d, i) => (
          <path key={i} d={d} fill="#7cc051" stroke="#f1d79a" strokeWidth="26" />
        ))}
        {ROAD_D.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#3b3f4a" strokeWidth="34" strokeLinejoin="round" />
        ))}
        {PLOTS.map((p) => {
          const owner = state.plots[p.id].owner;
          return <rect key={p.id} x={p.x - 30} y={p.y - 30} width="60" height="60" rx="12" fill={owner ? colors[owner] : '#ffffff'} opacity={owner ? 1 : 0.7} />;
        })}
        {state.players
          .filter((p) => !p.out)
          .map((p, k) => {
            const r = ROADS[display.pos[p.id] ?? p.pos];
            return <circle key={p.id} cx={r.x + (k % 3) * 24 - 24} cy={r.y + Math.floor(k / 3) * 24} r="40" fill={p.color} stroke="#fff" strokeWidth="12" />;
          })}
      </svg>
    </button>
  );
}
