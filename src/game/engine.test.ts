import { describe, expect, it } from 'vitest';
import { HOSPITAL_ROAD, JAIL_ROAD, PLOTS, ROADS, START_ROAD } from '../data/map';
import { RULES } from '../data/rules';
import { aiAction } from './ai';
import { RuleError, buildCost, createGame, reduce, tollFor, totalAssets } from './engine';
import type { Action, GameState } from './types';

/** Deterministic random numbers so tests repeat exactly. */
function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}
/** A random source that makes every wheel land on n. */
const wheel = (n: number) => () => (n - 1) / 6 + 0.01;

function game(players = 2): GameState {
  const s = createGame(
    Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `P${i}`, character: 'kangaroo' })),
    seeded(1),
  );
  s.mapGods = {};
  return s;
}

const roadOfPlot = (name: string) => PLOTS.find((p) => p.name === name)!.road;

describe('map', () => {
  it('has 40 road spaces, 24 places in 8 regions and one fork', () => {
    expect(ROADS.length).toBe(40);
    expect(PLOTS.length).toBe(24);
    expect(new Set(PLOTS.map((p) => p.region)).size).toBe(8);
    expect(ROADS.filter((r) => r.next.length > 1).length).toBe(1);
    expect(ROADS.filter((r) => r.prev.length > 1).length).toBe(1);
    expect(ROADS.every((r) => r.next.length >= 1 && r.prev.length >= 1)).toBe(true);
    // Spaces and places keep clear of each other on the picture.
    const spots = [...ROADS, ...PLOTS];
    for (const a of spots) for (const b of spots) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(70);
  });
});

describe('engine', () => {
  it('spins, walks and offers to buy', () => {
    let s = game();
    s = reduce(s, { type: 'spin' }, wheel(1)); // START -> Bondi Beach
    expect(s.players[0].pos).toBe(roadOfPlot('Bondi Beach'));
    expect(s.pending).toEqual({ kind: 'buy', plot: PLOTS.find((p) => p.name === 'Bondi Beach')!.id });
    s = reduce(s, { type: 'buy', yes: true }, wheel(1));
    expect(s.plots[0].owner).toBe('p0');
    expect(s.players[0].cash).toBe(RULES.startCash - 230);
    expect(s.current).toBe(1);
  });

  it('charges tolls by level and pays the owner', () => {
    let s = game();
    s.plots[0].owner = 'p1';
    s.plots[0].level = 2;
    const toll = tollFor(s, 0, s.players[0]);
    expect(toll).toBe(Math.round((230 * RULES.tollRate[2]) / 5) * 5);
    s = reduce(s, { type: 'spin' }, wheel(1));
    expect(s.players[0].cash).toBe(RULES.startCash - toll);
    expect(s.players[1].cash).toBe(RULES.startCash + toll);
  });

  it('stopping on your own land builds up to 2 levels, passing builds 1', () => {
    let s = game();
    s.plots[0].owner = 'p0';
    s = reduce(s, { type: 'spin' }, wheel(1));
    expect(s.pending).toEqual({ kind: 'build', plot: 0, max: 2 });
    s = reduce(s, { type: 'build', levels: 2 }, wheel(1));
    expect(s.plots[0].level).toBe(2);
    expect(s.players[0].cash).toBe(RULES.startCash - 2 * buildCost(0));

    let t = game();
    t.plots[0].owner = 'p0';
    t = reduce(t, { type: 'spin' }, wheel(3)); // passes Bondi Beach
    expect(t.plots[0].level).toBe(1);
  });

  it('pays the START bonus when passing', () => {
    let s = game();
    s.players[0].pos = ROADS.find((r) => r.next.includes(START_ROAD) && r.next.length === 1)!.id;
    s = reduce(s, { type: 'spin' }, wheel(2));
    expect(s.players[0].cash).toBeGreaterThanOrEqual(RULES.startCash + RULES.startBonus - 300);
    expect(s.players[0].points).toBeGreaterThanOrEqual(RULES.startBonusPoints);
  });

  it('asks which way to go at the fork', () => {
    let s = game();
    s = reduce(s, { type: 'spin' }, wheel(6)); // passes the fork at step 5
    expect(s.pending?.kind).toBe('fork');
    const opts = (s.pending as { options: number[] }).options;
    expect(opts.length).toBe(2);
    s = reduce(s, { type: 'fork', to: opts[1] }, wheel(6));
    expect(s.players[0].pos).toBe(opts[1]);
  });

  it('jail keeps you for 2 turns unless you pay bail', () => {
    let s = game();
    s.players[0].pos = ROADS[JAIL_ROAD].prev[0];
    s = reduce(s, { type: 'spin' }, wheel(1));
    expect(s.players[0].pos).toBe(JAIL_ROAD);
    expect(s.players[0].skip).toBe(2);
    s.current = 0;
    s.pending = { kind: 'release', fee: RULES.bailFee, place: 'jail' };
    s = reduce(s, { type: 'release', pay: true });
    expect(s.players[0].skip).toBe(0);
    expect(s.pending?.kind).toBe('pre');
  });

  it('bananas send you to hospital', () => {
    let s = game();
    s.bananas[ROADS[START_ROAD].next[0]] = 'p1';
    s = reduce(s, { type: 'spin' }, wheel(4));
    expect(s.players[0].pos).toBe(HOSPITAL_ROAD);
    expect(s.players[0].skip).toBe(2);
  });

  it('roadblocks stop you', () => {
    let s = game();
    const block = ROADS[ROADS[START_ROAD].next[0]].next[0];
    s.roadblocks[block] = 'p1';
    s = reduce(s, { type: 'spin' }, wheel(5));
    expect(s.players[0].pos).toBe(block);
  });

  it('bad gods jump to players you walk past', () => {
    let s = game();
    s.players[0].god = { id: 'badLuck', days: 3 };
    s.players[1].pos = ROADS[START_ROAD].next[0];
    s = reduce(s, { type: 'spin' }, wheel(3));
    expect(s.players[0].god).toBeNull();
    expect(s.players[1].god?.id).toBe('badLuck');
  });

  it('the bank rescues you once, then you are out', () => {
    let s = game();
    s.plots[0].owner = 'p1';
    s.plots[0].level = 5;
    s.players[0].cash = 10;
    s = reduce(s, { type: 'spin' }, wheel(1));
    expect(s.players[0].rescues).toBe(1);
    expect(s.players[0].cash).toBe(RULES.rescueCash);
    expect(s.players[0].out).toBe(false);

    let t = game();
    t.plots[0].owner = 'p1';
    t.plots[0].level = 5;
    t.players[0].cash = 10;
    t.players[0].rescues = 1;
    t = reduce(t, { type: 'spin' }, wheel(1));
    expect(t.players[0].out).toBe(true);
    expect(t.over).toBe(true);
    expect(t.ranking![0].id).toBe('p1');
  });

  it('End Game gives everyone one more turn, then ranks by total assets', () => {
    let s = game(3);
    s = reduce(s, { type: 'endGame' });
    expect(s.lastRound?.remaining).toBe(3);
    for (let k = 0; k < 3; k++) {
      while (!s.over && s.pending?.kind !== 'pre') s = reduce(s, aiAction(s), wheel(2));
      if (s.over) break;
      s = reduce(s, { type: 'spin' }, wheel(2));
      while (!s.over && s.current === k && s.pending) s = reduce(s, aiAction(s), wheel(2));
    }
    expect(s.over).toBe(true);
    expect(s.ranking!.length).toBe(3);
    expect(s.ranking![0].total).toBe(totalAssets(s, s.players.find((p) => p.id === s.ranking![0].id)!));
  });

  it('cards: only before spinning, one per turn', () => {
    let s = game();
    s.players[0].cards = ['boomerang', 'freePass'];
    s = reduce(s, { type: 'useCard', index: 0 });
    expect(s.players[0].dir).toBe(-1);
    expect(() => reduce(s, { type: 'useCard', index: 0 })).toThrow(RuleError);
  });

  it('remote dice picks the exact steps', () => {
    let s = game();
    s.players[0].items = ['remoteDice'];
    s = reduce(s, { type: 'useItem', index: 0, value: 4 });
    s = reduce(s, { type: 'spin' }, wheel(1));
    expect(s.players[0].pos).toBe(roadOfPlot('Opera House'));
  });

  it('a car spins three wheels', () => {
    let s = game();
    s.players[0].vehicle = { kind: 'car', days: 10 };
    s = reduce(s, { type: 'spin' }, wheel(1));
    const spin = s.events.find((e) => e.type === 'spin');
    expect(spin && spin.type === 'spin' && spin.wheels.length).toBe(3);
  });
});

describe('whole games with the computer playing', () => {
  it('always finish without errors when the host ends the game', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = seeded(seed);
      let s = createGame(
        Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, character: 'koala' })),
        rng,
      );
      let guard = 0;
      while (!s.over && guard++ < 20000) {
        if (s.day >= 40 && !s.lastRound) s = reduce(s, { type: 'endGame' }, rng);
        const a: Action = aiAction(s, rng);
        s = reduce(s, a, rng);
      }
      expect(s.over).toBe(true);
      const total = s.players.reduce((sum, p) => sum + p.cash, 0);
      expect(Number.isFinite(total)).toBe(true);
      expect(s.players.every((p) => p.cash >= 0 && p.savings >= 0)).toBe(true);
    }
  });
});
