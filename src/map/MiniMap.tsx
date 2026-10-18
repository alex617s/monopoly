import { PLOTS, ROADS } from '../data/map';
import type { GameState } from '../game/types';
import type { Display } from '../ui/useEventPlayer';

/** A flat top-down overview: the road loop, owned places and every player. */
export function MiniMap({ state, display, onOpen }: { state: GameState; display: Display; onOpen: () => void }) {
  const S = 16;
  const X = (i: number) => (i + 2) * S;
  const Y = (j: number) => (j + 2) * S;
  const colors = Object.fromEntries(state.players.map((p) => [p.id, p.color]));
  return (
    <button type="button" className="minimap" onClick={onOpen} aria-label="Show the whole map">
      <svg viewBox={`0 0 ${15 * S} ${12 * S}`} width="100%" height="100%" aria-hidden="true">
        <rect width={15 * S} height={12 * S} rx="12" fill="#1e5a8f" />
        <rect x={X(-1.6)} y={Y(-1.6)} width={13.2 * S} height={10.2 * S} rx="22" fill="#6fb34e" stroke="#f1d79a" strokeWidth="5" />
        {ROADS.flatMap((r) =>
          r.next.map((n) => <line key={`${r.id}-${n}`} x1={X(r.i)} y1={Y(r.j)} x2={X(ROADS[n].i)} y2={Y(ROADS[n].j)} stroke="#3b3f4a" strokeWidth="6" strokeLinecap="round" />),
        )}
        {PLOTS.map((p) => {
          const owner = state.plots[p.id].owner;
          return <rect key={p.id} x={X(p.i) - 5} y={Y(p.j) - 5} width="10" height="10" rx="2" fill={owner ? colors[owner] : '#ffffff'} opacity={owner ? 1 : 0.6} />;
        })}
        {state.players
          .filter((p) => !p.out)
          .map((p, k) => {
            const r = ROADS[display.pos[p.id] ?? p.pos];
            return <circle key={p.id} cx={X(r.i) + (k % 3) * 3 - 3} cy={Y(r.j) + Math.floor(k / 3) * 3} r="6" fill={p.color} stroke="#fff" strokeWidth="2" />;
          })}
      </svg>
    </button>
  );
}
