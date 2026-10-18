// Pure game rules. Local games and the online host run the same reducer, so
// every change to the game goes through reduce().

import {
  CARDS,
  CARD_IDS,
  CHANCES,
  CardId,
  GODS,
  GOD_IDS,
  GodId,
  ITEMS,
  ITEM_IDS,
  ItemId,
  NEWS,
  characterById,
} from '../data/content';
import { HOSPITAL_ROAD, JAIL_ROAD, PLOTS, REGIONS, ROADS, START_ROAD, plotsInRegion, roadsAhead } from '../data/map';
import { RULES, SPECIALS } from '../data/rules';
import type { Action, GameState, NewEvent, NewPlayer, Pending, PlayerState } from './types';

export class RuleError extends Error {}

export type Rng = () => number;
const roll = (rng: Rng) => 1 + Math.floor(rng() * 6);
const pickOne = <T,>(rng: Rng, list: readonly T[]) => list[Math.floor(rng() * list.length)];

export const buildCost = (plot: number) => Math.round(PLOTS[plot].price * RULES.buildCostRate);

export function createGame(players: NewPlayer[], rng: Rng = Math.random): GameState {
  const s: GameState = {
    version: 2,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      character: p.character,
      color: characterById(p.character).color,
      cash: RULES.startCash,
      savings: 0,
      points: 0,
      pos: START_ROAD,
      dir: 1,
      cards: [],
      items: [],
      god: null,
      godShield: false,
      vehicle: null,
      skip: 0,
      turtle: 0,
      freePass: false,
      teamUp: null,
      balloon: null,
      rescues: 0,
      out: false,
      auto: !!p.auto,
      usedCard: false,
      usedItem: false,
      remote: null,
    })),
    plots: PLOTS.map(() => ({ owner: null, level: 0, special: null })),
    current: 0,
    day: 1,
    turnSeq: 0,
    pending: null,
    move: null,
    roadblocks: {},
    bananas: {},
    mapGods: {},
    priceUp: {},
    boomRegion: null,
    interestBoost: false,
    lastRound: null,
    over: false,
    ranking: null,
    events: [],
    eventSeq: 0,
    log: [],
  };
  spawnGod(s, rng);
  spawnGod(s, rng);
  startTurn(s, rng);
  return s;
}

// ------------------------------------------------------------------ helpers

function emit(s: GameState, e: NewEvent) {
  s.eventSeq += 1;
  s.events.push({ ...e, seq: s.eventSeq } as GameState['events'][number]);
  if (s.events.length > 80) s.events.splice(0, s.events.length - 80);
}

function log(s: GameState, text: string, tone: 'good' | 'bad' | 'info' = 'info') {
  s.log.push(text);
  if (s.log.length > 40) s.log.splice(0, s.log.length - 40);
  emit(s, { type: 'toast', text, tone });
}

export const cur = (s: GameState) => s.players[s.current];
const byId = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;
const alive = (s: GameState) => s.players.filter((p) => !p.out);

function say(s: GameState, p: PlayerState, kind: 'buy' | 'toll' | 'build' | 'ouch', rng: Rng) {
  emit(s, { type: 'say', playerId: p.id, text: pickOne(rng, characterById(p.character).lines[kind]) });
}

function gain(s: GameState, p: PlayerState, amount: number) {
  if (!amount) return;
  p.cash += amount;
  emit(s, { type: 'money', playerId: p.id, amount });
}

export function landValue(s: GameState, playerId: string) {
  return s.plots.reduce((sum, ps, i) => (ps.owner === playerId ? sum + PLOTS[i].price + ps.level * buildCost(i) : sum), 0);
}

export function totalAssets(s: GameState, p: PlayerState) {
  return p.cash + p.savings + landValue(s, p.id);
}

/** Uses a Get Out Free card or the God of Fortune's protection, if any. */
function protect(s: GameState, p: PlayerState, what: string) {
  const k = p.cards.indexOf('getOutFree');
  if (k >= 0) {
    p.cards.splice(k, 1);
    log(s, `${p.name}'s Get Out Free card kept them safe from ${what}.`, 'good');
    return true;
  }
  if (p.god?.id === 'fortune' && p.godShield) {
    p.godShield = false;
    log(s, `The God of Fortune saved ${p.name} from ${what}!`, 'good');
    return true;
  }
  return false;
}

function sendTo(s: GameState, p: PlayerState, place: 'hospital' | 'jail', turns: number, rng: Rng) {
  if (protect(s, p, place === 'hospital' ? 'the Hospital' : 'Jail')) return;
  p.pos = place === 'hospital' ? HOSPITAL_ROAD : JAIL_ROAD;
  p.skip = Math.max(p.skip, turns);
  emit(s, { type: 'jump', playerId: p.id, to: p.pos });
  say(s, p, 'ouch', rng);
  log(s, `${p.name} goes to ${place === 'hospital' ? 'Hospital' : 'Jail'} for ${turns} turn${turns > 1 ? 's' : ''}.`, 'bad');
  if (s.move && cur(s).id === p.id) s.move.left = 0;
}

function releasePlots(s: GameState, p: PlayerState) {
  s.plots.forEach((ps) => {
    if (ps.owner === p.id) {
      ps.owner = null;
      ps.level = 0;
      ps.special = null;
    }
  });
}

/**
 * Takes money from cash, then savings, then sells land to the bank. If that is
 * still not enough the player goes bankrupt: rescued once, out the second time.
 * Returns the amount actually paid.
 */
function charge(s: GameState, p: PlayerState, amount: number, to: PlayerState | null, rng: Rng): number {
  if (amount <= 0) return 0;
  let paid = Math.min(p.cash, amount);
  p.cash -= paid;
  if (paid < amount) {
    const fromSavings = Math.min(p.savings, amount - paid);
    p.savings -= fromSavings;
    paid += fromSavings;
  }
  if (paid < amount) {
    const mine = s.plots
      .map((ps, i) => ({ ps, i }))
      .filter(({ ps }) => ps.owner === p.id)
      .sort((a, b) => PLOTS[a.i].price - PLOTS[b.i].price);
    for (const { ps, i } of mine) {
      if (paid >= amount) break;
      const value = Math.round((PLOTS[i].price + ps.level * buildCost(i)) * RULES.sellRate);
      ps.owner = null;
      ps.level = 0;
      ps.special = null;
      p.cash += value;
      log(s, `${p.name} sold ${PLOTS[i].name} to the bank for $${value}.`, 'bad');
      const more = Math.min(p.cash, amount - paid);
      p.cash -= more;
      paid += more;
    }
  }
  if (to && paid) gain(s, to, paid);
  if (paid < amount) bankrupt(s, p, rng);
  if (paid) emit(s, { type: 'money', playerId: p.id, amount: -paid });
  return paid;
}

function bankrupt(s: GameState, p: PlayerState, rng: Rng) {
  releasePlots(s, p);
  p.cash = 0;
  p.savings = 0;
  if (p.rescues < RULES.rescues) {
    p.rescues += 1;
    p.cash = RULES.rescueCash;
    say(s, p, 'ouch', rng);
    log(s, `${p.name} ran out of money! The bank rescues them with $${RULES.rescueCash}. Next time they are out.`, 'bad');
    return;
  }
  p.out = true;
  p.god = null;
  p.vehicle = null;
  p.balloon = null;
  log(s, `${p.name} ran out of money again and is out of the game.`, 'bad');
  if (alive(s).length <= 1) finish(s);
}

function attachGod(s: GameState, p: PlayerState, id: GodId, rng: Rng) {
  const g = GODS[id];
  if (!g.good && protect(s, p, `the ${g.name}`)) return;
  p.god = { id, days: RULES.godDays };
  p.godShield = id === 'fortune';
  emit(s, { type: 'god', playerId: p.id, god: id, joined: true });
  log(s, `${g.name} joins ${p.name}!`, g.good ? 'good' : 'bad');
  if (id === 'wealth') gain(s, p, 200);
  if (id === 'fortune' && p.cards.length < RULES.maxCards) p.cards.push(pickOne(rng, CARD_IDS));
}

function spawnGod(s: GameState, rng: Rng) {
  const taken = new Set(s.players.map((p) => p.pos));
  const free = ROADS.filter((r) => r.id !== START_ROAD && !s.mapGods[r.id] && !taken.has(r.id) && !r.disc);
  if (!free.length) return;
  const road = pickOne(rng, free);
  s.mapGods[road.id] = { id: pickOne(rng, GOD_IDS), days: RULES.mapGodDays };
}

export function tollFor(s: GameState, plot: number, payer: PlayerState | null): number {
  const ps = s.plots[plot];
  if (!ps.owner) return 0;
  const info = PLOTS[plot];
  let t: number;
  if (ps.special === 'theme') t = info.price * RULES.tollRate[5] * 1.5;
  else if (ps.special === 'mall') return 0;
  else if (ps.special) t = info.price * RULES.tollRate[3];
  else t = info.price * RULES.tollRate[ps.level];
  const neighbours = plotsInRegion(info.region).filter((p) => p.id !== plot && s.plots[p.id].owner === ps.owner).length;
  t *= 1 + RULES.neighbourTollBonus * neighbours;
  const up = s.priceUp[info.region];
  if (up && up.by === ps.owner) t *= 2;
  if (s.boomRegion === info.region) t *= 1.5;
  if (payer?.god?.id === 'badLuck') t *= 2;
  return Math.round(t / 5) * 5;
}

// ------------------------------------------------------------------ turn flow

function startTurn(s: GameState, rng: Rng) {
  if (s.over) return;
  const p = cur(s);
  s.turnSeq += 1;
  p.usedCard = false;
  p.usedItem = false;
  p.remote = null;
  emit(s, { type: 'turn', playerId: p.id });
  if (p.skip > 0 && p.pos !== JAIL_ROAD && p.pos !== HOSPITAL_ROAD) {
    // Sleeping or lost in the bush: nothing to pay, just miss the turn.
    p.skip -= 1;
    log(s, `${p.name} misses this turn.`);
    endTurn(s, rng);
    return;
  }
  if (p.skip > 0) {
    const place = p.pos === JAIL_ROAD ? 'jail' : 'hospital';
    const fee = place === 'jail' ? RULES.bailFee : RULES.hospitalFee;
    s.pending = { kind: 'release', fee, place };
    return;
  }
  s.pending = { kind: 'pre' };
}

function endTurn(s: GameState, rng: Rng) {
  s.pending = null;
  s.move = null;
  if (s.over) return;
  if (s.lastRound) {
    s.lastRound.remaining -= 1;
    if (s.lastRound.remaining <= 0) {
      finish(s);
      return;
    }
  }
  const before = s.current;
  for (let k = 0; k < s.players.length; k++) {
    s.current = (s.current + 1) % s.players.length;
    if (!s.players[s.current].out) break;
  }
  if (s.current <= before) newDay(s, rng);
  if (s.over) return;
  startTurn(s, rng);
}

function newDay(s: GameState, rng: Rng) {
  s.day += 1;
  s.boomRegion = null;
  s.interestBoost = false;
  const news = pickOne(rng, NEWS);
  applyNews(s, news, rng);
  for (const p of alive(s)) {
    const rate = RULES.interestRate * (s.interestBoost ? 2 : 1);
    const interest = Math.floor(p.savings * rate);
    if (interest) p.savings += interest;
    if (p.god) {
      if (p.god.id === 'poverty') {
        const loss = Math.floor(p.cash * 0.1);
        if (loss) {
          p.cash -= loss;
          emit(s, { type: 'money', playerId: p.id, amount: -loss });
          log(s, `The God of Poverty took $${loss} from ${p.name}.`, 'bad');
        }
      }
      p.god.days -= 1;
      if (p.god.days <= 0) {
        emit(s, { type: 'god', playerId: p.id, god: p.god.id, joined: false });
        log(s, `${GODS[p.god.id].name} leaves ${p.name}.`);
        p.god = null;
        p.godShield = false;
      }
    }
    if (p.vehicle && --p.vehicle.days <= 0) {
      log(s, `${p.name}'s ${p.vehicle.kind} broke down. Time to walk!`, 'bad');
      p.vehicle = null;
    }
    if (p.teamUp && --p.teamUp.days <= 0) p.teamUp = null;
    if (p.balloon !== null && --p.balloon <= 0) {
      p.balloon = null;
      log(s, `SPLASH! The water balloon burst on ${p.name}!`, 'bad');
      sendTo(s, p, 'hospital', 2, rng);
    }
  }
  for (const [k, v] of Object.entries(s.priceUp)) if (--v.days <= 0) delete s.priceUp[k];
  for (const [k, g] of Object.entries(s.mapGods)) if (--g.days <= 0) delete s.mapGods[+k];
  spawnGod(s, rng);
}

function applyNews(s: GameState, news: (typeof NEWS)[number], rng: Rng) {
  let text = news.text;
  const e = news.effect;
  switch (e.kind) {
    case 'everyone':
      alive(s).forEach((p) => gain(s, p, e.amount));
      break;
    case 'petrol':
      alive(s).filter((p) => p.vehicle).forEach((p) => charge(s, p, e.amount, null, rng));
      break;
    case 'boom': {
      const r = pickOne(rng, REGIONS);
      s.boomRegion = r.id;
      text = `Tolls in ${titleCase(r.name)} are 50% higher today.`;
      break;
    }
    case 'cyclone': {
      const north = new Set(['reef', 'darwin', 'goldcoast']);
      const hit = s.plots.map((ps, i) => ({ ps, i })).filter(({ ps, i }) => ps.level > 0 && !ps.special && north.has(PLOTS[i].region));
      for (let k = 0; k < 3 && hit.length; k++) hit.splice(Math.floor(rng() * hit.length), 1)[0].ps.level -= 1;
      break;
    }
    case 'topLandowner': {
      const counts = alive(s).map((p) => ({ p, n: s.plots.filter((ps) => ps.owner === p.id).length }));
      const best = counts.sort((a, b) => b.n - a.n)[0];
      if (best && best.n > 0) {
        gain(s, best.p, e.amount);
        text = `${best.p.name} owns the most places and gets $${e.amount}!`;
      }
      break;
    }
    case 'luckyDraw': {
      const poorest = [...alive(s)].sort((a, b) => a.cash - b.cash)[0];
      gain(s, poorest, e.amount);
      text = `${poorest.name} has the least cash and gets $${e.amount}.`;
      break;
    }
    case 'bankBonus':
      s.interestBoost = true;
      break;
    case 'moreGods':
      spawnGod(s, rng);
      spawnGod(s, rng);
      break;
  }
  emit(s, { type: 'news', headline: news.headline, text, day: s.day });
  s.log.push(`Day ${s.day} news: ${news.headline} ${text}`);
}

const titleCase = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

function finish(s: GameState) {
  s.over = true;
  s.pending = null;
  s.move = null;
  s.ranking = s.players
    .map((p) => ({ id: p.id, total: p.out ? 0 : totalAssets(s, p), cash: p.cash, savings: p.savings, land: landValue(s, p.id) }))
    .sort((a, b) => b.total - a.total);
  emit(s, { type: 'over' });
}

// ------------------------------------------------------------------ movement

function spin(s: GameState, rng: Rng) {
  const p = cur(s);
  let wheels: number[];
  const remote = p.remote !== null;
  if (remote) wheels = [p.remote!];
  else wheels = Array.from({ length: p.vehicle ? (p.vehicle.kind === 'car' ? 3 : 2) : 1 }, () => roll(rng));
  emit(s, { type: 'spin', playerId: p.id, wheels, remote });
  let steps = wheels.reduce((a, b) => a + b, 0);
  if (p.turtle > 0) {
    p.turtle -= 1;
    steps = 1;
    log(s, `${p.name} is a turtle and moves just 1 step.`, 'bad');
  }
  p.remote = null;
  s.move = { left: steps };
  s.pending = null;
  continueMove(s, rng);
}

function continueMove(s: GameState, rng: Rng) {
  const p = cur(s);
  while (s.move && s.move.left > 0) {
    const here = ROADS[p.pos];
    const opts = p.dir === 1 ? here.next : here.prev;
    if (opts.length > 1) {
      s.pending = { kind: 'fork', options: [...opts] };
      return;
    }
    const r = stepTo(s, opts[0], rng);
    if (r === 'pause') return;
    if (r === 'stop') {
      s.move = null;
      endTurn(s, rng);
      return;
    }
  }
  s.move = null;
  land(s, rng);
  if (!s.pending && !s.over) endTurn(s, rng);
}

function stepTo(s: GameState, to: number, rng: Rng): 'ok' | 'pause' | 'stop' {
  const p = cur(s);
  p.pos = to;
  s.move!.left -= 1;
  const passing = s.move!.left > 0;
  emit(s, { type: 'step', playerId: p.id, to });
  const road = ROADS[to];

  if (road.disc === 'start') {
    gain(s, p, RULES.startBonus);
    p.points += RULES.startBonusPoints;
    log(s, `${p.name} passed START: +$${RULES.startBonus}!`, 'good');
  }

  if (s.bananas[to] !== undefined) {
    delete s.bananas[to];
    log(s, `${p.name} slipped on a banana!`, 'bad');
    if (!protect(s, p, 'the banana')) {
      sendTo(s, p, 'hospital', 2, rng);
      return 'stop';
    }
  }

  // Walking past other players hands on bad gods and water balloons.
  const others = alive(s).filter((o) => o.id !== p.id && o.pos === to);
  if (others.length) {
    const o = others[0];
    if (p.god && !GODS[p.god.id].good && !(o.god && o.god.id === p.god.id)) {
      const g = p.god;
      p.god = null;
      if (!protect(s, o, `the ${GODS[g.id].name}`)) {
        o.god = g;
        emit(s, { type: 'god', playerId: o.id, god: g.id, joined: true });
      }
      log(s, `${p.name} passed the ${GODS[g.id].name} to ${o.name}! Ha ha!`, 'info');
    }
    if (p.balloon !== null && o.balloon === null) {
      o.balloon = p.balloon;
      p.balloon = null;
      log(s, `${p.name} passed the water balloon to ${o.name}!`, 'info');
    }
  }

  if (s.mapGods[to]) {
    const g = s.mapGods[to];
    delete s.mapGods[to];
    attachGod(s, p, g.id, rng);
  }

  if (road.plot !== undefined) {
    const ps = s.plots[road.plot];
    const info = PLOTS[road.plot];
    if (p.god?.id === 'land' && !ps.owner) {
      ps.owner = p.id;
      log(s, `The Land God gave ${p.name} ${info.name}!`, 'good');
    } else if (p.god?.id === 'angel' && ps.owner && !ps.special && ps.level < RULES.maxLevel) {
      ps.level += 1;
      log(s, `The Angel built on ${info.name}!`, 'good');
    } else if (p.god?.id === 'devil' && ps.level > 0 && !ps.special) {
      ps.level -= 1;
      log(s, `The Devil knocked a level off ${info.name}!`, 'bad');
    }
    // Passing your own land builds automatically while you can spare the money.
    if (passing && ps.owner === p.id && !ps.special && ps.level < RULES.maxLevel) {
      const levels = Math.min(RULES.passBuildLevels + (p.god?.id === 'fortune' ? 1 : 0), RULES.maxLevel - ps.level);
      const cost = buildCost(road.plot) * levels;
      if (p.cash - cost >= 200) {
        p.cash -= cost;
        ps.level += levels;
        p.points += RULES.buildPoints;
        emit(s, { type: 'money', playerId: p.id, amount: -cost });
        log(s, `${p.name} built on ${info.name} while passing.`, 'good');
      }
    }
  }

  // Parks pay their owner when the owner walks through the park's region.
  if (road.plot !== undefined) {
    const region = PLOTS[road.plot].region;
    const park = plotsInRegion(region).find((pl) => s.plots[pl.id].special === 'park' && s.plots[pl.id].owner === p.id);
    if (park && ROADS[to].plot === plotsInRegion(region)[0].id) gain(s, p, 50);
  }

  if (road.disc === 'bank' && passing) {
    s.pending = { kind: 'bank', passing: true };
    return 'pause';
  }

  if (s.roadblocks[to] !== undefined) {
    delete s.roadblocks[to];
    log(s, `Roadblock! ${p.name} has to stop.`, 'bad');
    s.move!.left = 0;
  }
  return 'ok';
}

function land(s: GameState, rng: Rng) {
  const p = cur(s);
  const road = ROADS[p.pos];
  if (road.plot !== undefined) return landOnPlot(s, p, road.plot, rng);
  switch (road.disc) {
    case 'card':
      if (p.cards.length < RULES.maxCards) {
        const c = pickOne(rng, CARD_IDS);
        p.cards.push(c);
        log(s, `${p.name} got a ${CARDS[c].name} card!`, 'good');
      } else log(s, `${p.name}'s hand of cards is full.`);
      break;
    case 'chance':
      chance(s, p, rng);
      break;
    case 'news':
      applyNews(s, pickOne(rng, NEWS), rng);
      break;
    case 'itemShop':
      s.pending = { kind: 'shop', shop: 'item' };
      break;
    case 'cardShop':
      s.pending = { kind: 'shop', shop: 'card' };
      break;
    case 'bank':
      s.pending = { kind: 'bank', passing: false };
      break;
    case 'points': {
      const pts = 10 + Math.floor(rng() * 3) * 10;
      p.points += pts;
      log(s, `${p.name} collected ${pts} points!`, 'good');
      break;
    }
    case 'lucky': {
      const n = roll(rng);
      emit(s, { type: 'spin', playerId: p.id, wheels: [n], remote: false });
      const prize = n === 6 ? 200 : n * 10;
      gain(s, p, prize);
      log(s, `Lucky Wheel stopped on ${n}: ${p.name} wins $${prize}!`, 'good');
      break;
    }
    case 'jail':
      sendTo(s, p, 'jail', 2, rng);
      break;
    case 'hospital':
      log(s, `${p.name} is just visiting the Hospital.`);
      break;
    case 'park':
      log(s, `${p.name} has a rest in the park.`);
      break;
    default:
      break;
  }
}

function landOnPlot(s: GameState, p: PlayerState, plot: number, rng: Rng) {
  const ps = s.plots[plot];
  const info = PLOTS[plot];
  if (!ps.owner) {
    if (p.cash >= info.price) s.pending = { kind: 'buy', plot };
    else log(s, `${p.name} can't afford ${info.name} ($${info.price}).`);
    return;
  }
  if (ps.owner === p.id) {
    if (ps.special || ps.level >= RULES.maxLevel) return;
    const want = Math.min(RULES.stopBuildLevels + (p.god?.id === 'fortune' ? 1 : 0), RULES.maxLevel - ps.level);
    const afford = Math.floor(p.cash / buildCost(plot));
    const max = Math.min(want, afford);
    if (max > 0) s.pending = { kind: 'build', plot, max };
    return;
  }
  const owner = byId(s, ps.owner);
  if (owner.out) return;
  if (ps.special === 'mall') {
    const n = roll(rng);
    emit(s, { type: 'spin', playerId: p.id, wheels: [n], remote: false });
    const amount = n * 50;
    log(s, `${p.name} went shopping at ${owner.name}'s mall and spent $${amount}.`, 'bad');
    charge(s, p, amount, owner, rng);
    return;
  }
  if (p.god?.id === 'wealth') return log(s, `The God of Wealth paid ${p.name}'s toll!`, 'good');
  if (p.teamUp?.with === owner.id) return log(s, `${p.name} and ${owner.name} are a team: no toll!`, 'good');
  if (p.freePass) {
    p.freePass = false;
    return log(s, `${p.name} used a Free Pass at ${info.name}!`, 'good');
  }
  let toll = tollFor(s, plot, p);
  if (ps.special === 'petrol' && p.vehicle) toll += 100;
  const paid = charge(s, p, toll, owner, rng);
  say(s, owner, 'toll', rng);
  log(s, `${p.name} paid ${owner.name} $${paid} at ${info.name}.`, 'bad');
}

function chance(s: GameState, p: PlayerState, rng: Rng) {
  const c = pickOne(rng, CHANCES);
  emit(s, { type: 'chance', playerId: p.id, text: c.text });
  s.log.push(`${p.name}: ${c.text}`);
  const e = c.effect;
  switch (e.kind) {
    case 'cash':
      if (e.amount > 0) gain(s, p, e.amount);
      else charge(s, p, -e.amount, null, rng);
      break;
    case 'speeding':
      if (p.vehicle) charge(s, p, 50, null, rng);
      break;
    case 'loseVehicle':
      p.vehicle = null;
      break;
    case 'nextRegion': {
      const here = ROADS[p.pos];
      const startRegion = here.plot !== undefined ? PLOTS[here.plot].region : null;
      let at = p.pos;
      for (let k = 0; k < ROADS.length; k++) {
        at = ROADS[at].next[0];
        if (at === START_ROAD) gain(s, p, RULES.startBonus);
        const r = ROADS[at];
        if (r.plot !== undefined && PLOTS[r.plot].region !== startRegion) break;
      }
      p.pos = at;
      emit(s, { type: 'jump', playerId: p.id, to: at });
      landOnPlot(s, p, ROADS[at].plot!, rng);
      break;
    }
    case 'skip':
      p.skip += e.turns;
      break;
    case 'card':
      if (p.cards.length < RULES.maxCards) p.cards.push(pickOne(rng, CARD_IDS));
      break;
    case 'birthday':
      alive(s)
        .filter((o) => o.id !== p.id)
        .forEach((o) => charge(s, o, e.amount, p, rng));
      break;
    case 'hospital':
      sendTo(s, p, 'hospital', e.turns, rng);
      break;
  }
}

// ------------------------------------------------------------------ cards & items

function useCard(s: GameState, a: Extract<Action, { type: 'useCard' }>, rng: Rng) {
  const p = cur(s);
  if (p.usedCard) throw new RuleError('You already used a card this turn.');
  const id = p.cards[a.index];
  if (!id) throw new RuleError('No such card.');
  if (id === 'getOutFree') throw new RuleError('This card works by itself when you need it.');
  const target = a.target ? s.players.find((x) => x.id === a.target && !x.out && x.id !== p.id) : undefined;
  const need = CARDS[id].target;
  if (need === 'player' && !target) throw new RuleError('Pick a player.');

  switch (id) {
    case 'freePass':
      p.freePass = true;
      break;
    case 'tax': {
      const t = target!;
      const amount = Math.floor(t.cash * 0.2);
      t.cash -= amount;
      emit(s, { type: 'money', playerId: t.id, amount: -amount });
      log(s, `${t.name} paid $${amount} tax!`, 'bad');
      break;
    }
    case 'fairShare': {
      const live = alive(s);
      const each = Math.floor(live.reduce((sum, x) => sum + x.cash, 0) / live.length);
      live.forEach((x) => {
        emit(s, { type: 'money', playerId: x.id, amount: each - x.cash });
        x.cash = each;
      });
      break;
    }
    case 'swapHouse': {
      const mine = a.plot !== undefined ? s.plots[a.plot] : undefined;
      const theirs = a.plot2 !== undefined ? s.plots[a.plot2] : undefined;
      if (!mine || mine.owner !== p.id || !theirs || !theirs.owner || theirs.owner === p.id) throw new RuleError('Pick one of your places and one of a friend’s.');
      const other = theirs.owner;
      mine.owner = other;
      theirs.owner = p.id;
      log(s, `${p.name} swapped ${PLOTS[a.plot!].name} for ${PLOTS[a.plot2!].name}!`);
      break;
    }
    case 'priceUp': {
      const region = a.region;
      if (!region || !plotsInRegion(region).some((pl) => s.plots[pl.id].owner === p.id)) throw new RuleError('Pick a region where you own a place.');
      s.priceUp[region] = { by: p.id, days: RULES.priceUpDays };
      break;
    }
    case 'teamUp': {
      const t = target!;
      p.teamUp = { with: t.id, days: RULES.teamUpDays };
      t.teamUp = { with: p.id, days: RULES.teamUpDays };
      break;
    }
    case 'turtle':
      target!.turtle = RULES.turtleTurns;
      break;
    case 'sleep':
      target!.skip += 1;
      break;
    case 'boomerang':
      p.dir = p.dir === 1 ? -1 : 1;
      break;
    case 'rebuild': {
      const ps = a.plot !== undefined ? s.plots[a.plot] : undefined;
      if (!ps || ps.owner !== p.id || ps.level < 3 || ps.special) throw new RuleError('Pick one of your buildings at level 3 or higher.');
      if (!a.special || !(a.special in SPECIALS)) throw new RuleError('Pick what to build.');
      ps.special = a.special;
      ps.level = RULES.maxLevel;
      log(s, `${p.name} turned ${PLOTS[a.plot!].name} into a ${SPECIALS[a.special].name}!`, 'good');
      break;
    }
    case 'godCall':
      if (p.god) {
        emit(s, { type: 'god', playerId: p.id, god: p.god.id, joined: false });
        log(s, `${p.name} sent the ${GODS[p.god.id].name} away.`);
        p.god = null;
        p.godShield = false;
      } else {
        attachGod(s, p, pickOne(rng, GOD_IDS.filter((g) => GODS[g].good)), rng);
      }
      break;
  }
  p.cards.splice(a.index, 1);
  p.usedCard = true;
  log(s, `${p.name} used ${CARDS[id].name}${target ? ` on ${target.name}` : ''}.`, CARDS[id].mean ? 'bad' : 'good');
}

function useItem(s: GameState, a: Extract<Action, { type: 'useItem' }>, rng: Rng) {
  const p = cur(s);
  if (p.usedItem) throw new RuleError('You already used an item this turn.');
  const id = p.items[a.index];
  if (!id) throw new RuleError('No such item.');
  const target = a.target ? s.players.find((x) => x.id === a.target && !x.out && x.id !== p.id) : undefined;
  switch (id) {
    case 'remoteDice': {
      const v = a.value ?? 0;
      if (!(v >= 1 && v <= 6)) throw new RuleError('Pick a number from 1 to 6.');
      p.remote = v;
      break;
    }
    case 'roadblock':
    case 'banana': {
      const d = a.distance ?? 0;
      if (!(d >= 1 && d <= 6)) throw new RuleError('Pick 1 to 6 spaces ahead.');
      const road = roadsAhead(p.pos, p.dir, d)[d - 1];
      if (id === 'roadblock') s.roadblocks[road] = p.id;
      else s.bananas[road] = p.id;
      break;
    }
    case 'waterBalloon':
      if (!target) throw new RuleError('Pick a player.');
      if (target.balloon === null) target.balloon = RULES.waterBalloonDays;
      break;
    case 'robot':
      roadsAhead(p.pos, p.dir, 10).forEach((r) => {
        delete s.roadblocks[r];
        delete s.bananas[r];
      });
      break;
    case 'rocket': {
      if (a.plot === undefined || !s.plots[a.plot]) throw new RuleError('Pick a place to aim at.');
      const ps = s.plots[a.plot];
      if (ps.level > 0 && !ps.special) ps.level -= 1;
      else if (ps.special) {
        ps.special = null;
        ps.level = 4;
      }
      log(s, `BOOM! A firework hit ${PLOTS[a.plot].name}!`, 'bad');
      alive(s)
        .filter((x) => x.pos === PLOTS[a.plot!].road)
        .forEach((x) => sendTo(s, x, 'hospital', 1, rng));
      break;
    }
    case 'scooter':
    case 'car':
      p.vehicle = { kind: id, days: RULES.vehicleDays };
      break;
  }
  p.items.splice(a.index, 1);
  p.usedItem = true;
  log(s, `${p.name} used ${ITEMS[id].name}${target ? ` on ${target.name}` : ''}.`, ITEMS[id].mean ? 'bad' : 'good');
}

function shopBuy(s: GameState, shop: 'card' | 'item', id: string) {
  const p = cur(s);
  if (shop === 'card') {
    const c = CARDS[id as CardId];
    if (!c) throw new RuleError('No such card.');
    if (p.points < c.price) throw new RuleError('Not enough points.');
    if (p.cards.length >= RULES.maxCards) throw new RuleError('Your hand is full.');
    p.points -= c.price;
    p.cards.push(id as CardId);
    log(s, `${p.name} bought a ${c.name} card.`, 'good');
  } else {
    const it = ITEMS[id as ItemId];
    if (!it) throw new RuleError('No such item.');
    if (p.points < it.price) throw new RuleError('Not enough points.');
    p.points -= it.price;
    if (id === 'scooter' || id === 'car') {
      p.vehicle = { kind: id, days: RULES.vehicleDays };
      log(s, `${p.name} bought a ${it.name}! Zoom!`, 'good');
      return;
    }
    if (p.items.length >= RULES.maxItems) throw new RuleError('Your bag is full.');
    p.items.push(id as ItemId);
    log(s, `${p.name} bought a ${it.name}.`, 'good');
  }
}

// ------------------------------------------------------------------ reducer

export function reduce(state: GameState, action: Action, rng: Rng = Math.random): GameState {
  const s: GameState = structuredClone(state);
  if (action.type === 'setAuto') {
    const p = s.players.find((x) => x.id === action.playerId);
    if (p) p.auto = action.on;
    return s;
  }
  if (s.over) throw new RuleError('The game is over.');
  if (action.type === 'endGame') {
    if (!s.lastRound) {
      s.lastRound = { remaining: alive(s).length };
      emit(s, { type: 'lastRound' });
      s.log.push('LAST ROUND! Everyone gets one more turn.');
    }
    return s;
  }

  const p = cur(s);
  const pend = s.pending;
  if (!pend) throw new RuleError('Please wait.');

  switch (action.type) {
    case 'release': {
      if (pend.kind !== 'release') throw new RuleError('Not now.');
      if (action.pay && p.cash >= pend.fee) {
        p.cash -= pend.fee;
        emit(s, { type: 'money', playerId: p.id, amount: -pend.fee });
        p.skip = 0;
        log(s, `${p.name} paid $${pend.fee} to leave the ${pend.place === 'jail' ? 'Jail' : 'Hospital'}.`);
        s.pending = { kind: 'pre' };
      } else {
        p.skip -= 1;
        log(s, `${p.name} stays in the ${pend.place === 'jail' ? 'Jail' : 'Hospital'} this turn.`);
        endTurn(s, rng);
      }
      return s;
    }
    case 'useCard':
      if (pend.kind !== 'pre') throw new RuleError('Use cards before you spin.');
      useCard(s, action, rng);
      return s;
    case 'useItem':
      if (pend.kind !== 'pre') throw new RuleError('Use items before you spin.');
      useItem(s, action, rng);
      return s;
    case 'spin':
      if (pend.kind !== 'pre') throw new RuleError('You cannot spin right now.');
      spin(s, rng);
      return s;
    case 'fork':
      if (pend.kind !== 'fork' || !pend.options.includes(action.to)) throw new RuleError('Pick one of the roads.');
      s.pending = null;
      {
        const r = stepTo(s, action.to, rng);
        if (r === 'pause') return s;
        if (r === 'stop') {
          endTurn(s, rng);
          return s;
        }
      }
      continueMove(s, rng);
      return s;
    case 'bank': {
      if (pend.kind !== 'bank') throw new RuleError('You are not at the bank.');
      const amt = Math.trunc(action.amount);
      if (amt > 0) {
        const d = Math.min(amt, p.cash);
        p.cash -= d;
        p.savings += d;
        if (d) log(s, `${p.name} saved $${d} in the bank.`);
      } else if (amt < 0) {
        const w = Math.min(-amt, p.savings);
        p.savings -= w;
        p.cash += w;
        if (w) log(s, `${p.name} took $${w} out of the bank.`);
      }
      s.pending = null;
      if (pend.passing) continueMove(s, rng);
      else endTurn(s, rng);
      return s;
    }
    case 'buy': {
      if (pend.kind !== 'buy') throw new RuleError('Nothing to buy.');
      const info = PLOTS[pend.plot];
      if (action.yes) {
        if (p.cash < info.price) throw new RuleError('Not enough cash.');
        p.cash -= info.price;
        emit(s, { type: 'money', playerId: p.id, amount: -info.price });
        s.plots[pend.plot].owner = p.id;
        p.points += RULES.buildPoints;
        say(s, p, 'buy', rng);
        log(s, `${p.name} bought ${info.name} for $${info.price}.`, 'good');
      }
      endTurn(s, rng);
      return s;
    }
    case 'build': {
      if (pend.kind !== 'build') throw new RuleError('Nothing to build.');
      const n = Math.max(0, Math.min(pend.max, Math.trunc(action.levels)));
      if (n > 0) {
        const cost = buildCost(pend.plot) * n;
        if (p.cash < cost) throw new RuleError('Not enough cash.');
        p.cash -= cost;
        emit(s, { type: 'money', playerId: p.id, amount: -cost });
        s.plots[pend.plot].level += n;
        p.points += RULES.buildPoints;
        say(s, p, 'build', rng);
        log(s, `${p.name} built up ${PLOTS[pend.plot].name} to a ${['', 'Tent', 'Cabin', 'Holiday House', 'Hotel', 'Skyscraper'][s.plots[pend.plot].level]}!`, 'good');
      }
      endTurn(s, rng);
      return s;
    }
    case 'shopBuy':
      if (pend.kind !== 'shop') throw new RuleError('You are not in a shop.');
      shopBuy(s, pend.shop, action.id);
      return s;
    case 'shopLeave':
      if (pend.kind !== 'shop') throw new RuleError('You are not in a shop.');
      endTurn(s, rng);
      return s;
  }
  return s;
}

/** True when the given pending decision is waiting for this player. */
export const waitingFor = (s: GameState): PlayerState | null => (s.over || !s.pending ? null : cur(s));
export type { Pending };
export { ITEM_IDS };
