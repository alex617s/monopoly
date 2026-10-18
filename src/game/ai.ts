// The computer's choices for Auto Play and for answering when the 30 second
// timer runs out. Like a real player it sometimes plays a mean card, usually
// on whoever is winning, but it never picks on the same player twice in a row.

import { CARDS, ITEMS, ItemId } from '../data/content';
import { PLOTS, ROADS, roadsAhead } from '../data/map';
import { buildCost, cur, landValue, totalAssets } from './engine';
import type { Action, GameState, PlayerState } from './types';

const SHOP_WISH: ItemId[] = ['scooter', 'robot', 'remoteDice', 'banana', 'bomb'];

// Who each computer player last picked on, so it spreads the trouble around.
const lastVictim = new Map<string, string>();

function victim(s: GameState, p: PlayerState, rng: () => number): PlayerState | null {
  const others = s.players.filter((o) => !o.out && o.id !== p.id);
  if (!others.length) return null;
  const ranked = [...others].sort((a, b) => totalAssets(s, b) - totalAssets(s, a));
  const pool = ranked.filter((o) => o.id !== lastVictim.get(p.id));
  const pick = (pool.length ? pool : ranked)[rng() < 0.7 ? 0 : Math.floor(rng() * (pool.length || ranked.length))] ?? ranked[0];
  return pick;
}

function meanMove(s: GameState, p: PlayerState, rng: () => number): Action | null {
  if (rng() > 0.55) return null;
  const t = victim(s, p, rng);
  if (!t) return null;
  if (!p.usedCard) {
    for (let k = 0; k < p.cards.length; k++) {
      const id = p.cards[k];
      if (!CARDS[id].mean) continue;
      if ((id === 'tax' || id === 'turtle' || id === 'sleep') && t) return remember(p, t, { type: 'useCard', index: k, target: t.id });
      if (id === 'steal' && t.cards.length) return remember(p, t, { type: 'useCard', index: k, target: t.id });
      if (id === 'fairShare') {
        const live = s.players.filter((o) => !o.out);
        const avg = live.reduce((a, o) => a + o.cash, 0) / live.length;
        if (p.cash < avg * 0.7) return { type: 'useCard', index: k };
      }
      if (id === 'swapHouse') {
        const mine = PLOTS.filter((pl) => s.plots[pl.id].owner === p.id).sort((a, b) => worth(s, a.id) - worth(s, b.id))[0];
        const theirs = PLOTS.filter((pl) => s.plots[pl.id].owner === t.id).sort((a, b) => worth(s, b.id) - worth(s, a.id))[0];
        if (mine && theirs && worth(s, theirs.id) > worth(s, mine.id) * 1.5) return remember(p, t, { type: 'useCard', index: k, plot: mine.id, plot2: theirs.id });
      }
    }
  }
  if (!p.usedItem) {
    for (let k = 0; k < p.items.length; k++) {
      const id = p.items[k];
      if (id === 'banana' || id === 'bomb' || id === 'roadblock') return { type: 'useItem', index: k, distance: 2 + Math.floor(rng() * 4) };
      if (id === 'waterBalloon' && t.balloon === null) return remember(p, t, { type: 'useItem', index: k, target: t.id });
      if (id === 'rocket') {
        const best = PLOTS.filter((pl) => s.plots[pl.id].owner === t.id && s.plots[pl.id].level > 0).sort((a, b) => worth(s, b.id) - worth(s, a.id))[0];
        if (best) return remember(p, t, { type: 'useItem', index: k, plot: best.id });
      }
      if (id === 'monsterTruck') {
        const hits = roadsAhead(p.pos, p.dir, 10).filter((r) => {
          const pl = ROADS[r].plot;
          return pl !== undefined && s.plots[pl].owner && s.plots[pl].owner !== p.id && s.plots[pl].level > 0;
        });
        if (hits.length >= 2) return { type: 'useItem', index: k };
      }
    }
  }
  return null;
}

const worth = (s: GameState, plot: number) => PLOTS[plot].price + s.plots[plot].level * buildCost(plot);

function remember(p: PlayerState, t: PlayerState, a: Action): Action {
  lastVictim.set(p.id, t.id);
  return a;
}

export function aiAction(s: GameState, rng: () => number = Math.random): Action {
  const p = cur(s);
  const pend = s.pending!;
  switch (pend.kind) {
    case 'release':
      return { type: 'release', pay: p.cash >= pend.fee + 300 };
    case 'pre': {
      if (!p.usedCard && p.god && p.god.days > 0) {
        const k = p.cards.indexOf('godCall');
        const bad = ['badLuck', 'poverty', 'devil'].includes(p.god.id);
        if (k >= 0 && bad) return { type: 'useCard', index: k };
      }
      if (!p.usedItem) {
        const robot = p.items.indexOf('robot');
        const ahead = roadsAhead(p.pos, p.dir, 10);
        if (robot >= 0 && ahead.some((r) => s.roadblocks[r] !== undefined || s.bananas[r] !== undefined || s.bombs[r] !== undefined)) {
          return { type: 'useItem', index: robot };
        }
        const remote = p.items.indexOf('remoteDice');
        if (remote >= 0) {
          const roads = roadsAhead(p.pos, p.dir, 6);
          for (let d = 1; d <= 6; d++) {
            const r = ROADS[roads[d - 1]];
            if (r.plot === undefined) continue;
            const ps = s.plots[r.plot];
            const good = (!ps.owner && p.cash - PLOTS[r.plot].price >= 150) || (ps.owner === p.id && ps.level < 5 && !ps.special);
            if (good) return { type: 'useItem', index: remote, value: d };
          }
        }
        const vehicle = p.items.findIndex((i) => i === 'scooter' || i === 'car');
        if (vehicle >= 0 && !p.vehicle) return { type: 'useItem', index: vehicle };
      }
      const mean = meanMove(s, p, rng);
      if (mean) return mean;
      return { type: 'spin' };
    }
    case 'fork':
      return { type: 'fork', to: pend.options[Math.floor(rng() * pend.options.length)] };
    case 'buy':
      return { type: 'buy', yes: p.cash - PLOTS[pend.plot].price >= 150 };
    case 'build':
      return { type: 'build', levels: p.cash - buildCost(pend.plot) >= 200 ? 1 : 0 };
    case 'flight':
      // fly when rich enough and owning little nearby
      return { type: 'fly', yes: p.cash >= 600 && landValue(s, p.id) < 1500 && rng() < 0.5 };
    case 'bank':
      if (p.cash > 1500) return { type: 'bank', amount: p.cash - 900 };
      if (p.cash < 150 && p.savings > 0) return { type: 'bank', amount: -Math.min(p.savings, 300) };
      return { type: 'bank', amount: 0 };
    case 'shop': {
      if (pend.shop === 'item') {
        for (const id of SHOP_WISH) {
          if (id === 'scooter' && p.vehicle) continue;
          if (id !== 'scooter' && p.items.includes(id)) continue;
          if (p.points >= ITEMS[id].price && (id === 'scooter' || p.items.length < 6)) return { type: 'shopBuy', id };
        }
      } else {
        for (const id of ['freePass', 'getOutFree', 'godCall', 'tax', 'steal'] as const) {
          if (!p.cards.includes(id) && p.points >= CARDS[id].price && p.cards.length < 8) return { type: 'shopBuy', id };
        }
      }
      return { type: 'shopLeave' };
    }
  }
}
