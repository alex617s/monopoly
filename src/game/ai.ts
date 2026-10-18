// The computer's choices for Auto Play and for answering when the 30 second
// timer runs out. It never uses mean cards or items.

import { CARDS, ITEMS, ItemId } from '../data/content';
import { PLOTS, ROADS, roadsAhead } from '../data/map';
import { buildCost, cur } from './engine';
import type { Action, GameState } from './types';

const SHOP_WISH: ItemId[] = ['scooter', 'robot', 'remoteDice'];

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
        if (robot >= 0 && ahead.some((r) => s.roadblocks[r] !== undefined || s.bananas[r] !== undefined)) {
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
      return { type: 'spin' };
    }
    case 'fork':
      return { type: 'fork', to: pend.options[Math.floor(rng() * pend.options.length)] };
    case 'buy':
      return { type: 'buy', yes: p.cash - PLOTS[pend.plot].price >= 150 };
    case 'build': {
      const cost = buildCost(pend.plot);
      let n = 0;
      while (n < pend.max && p.cash - cost * (n + 1) >= 200) n++;
      return { type: 'build', levels: n };
    }
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
        for (const id of ['freePass', 'getOutFree', 'godCall'] as const) {
          if (!p.cards.includes(id) && p.points >= CARDS[id].price && p.cards.length < 8) return { type: 'shopBuy', id };
        }
      }
      return { type: 'shopLeave' };
    }
  }
}
