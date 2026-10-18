// The Australia map: one source of truth for the road, the land beside it and
// the regions. Positions are isometric grid cells (i to the lower right,
// j to the lower left on screen).
//
// The outer loop is a 10 × 7 rectangle walked clockwise from START. A
// shortcut runs from the top side (i = 5) down to the bottom side through
// Uluru, so there is one fork and one merge.

export type DiscKind =
  | 'start'
  | 'card'
  | 'chance'
  | 'news'
  | 'itemShop'
  | 'cardShop'
  | 'bank'
  | 'points'
  | 'park'
  | 'lucky'
  | 'hospital'
  | 'jail';

export interface Region {
  id: string;
  name: string;
  color: string;
  /** Where the big name is painted on the grass, and which grid axis it runs along. */
  label: { i: number; j: number; axis: 'i' | 'j' };
}

export interface Plot {
  id: number;
  name: string;
  region: string;
  price: number;
  /** The road space you stand on to buy or build here. */
  road: number;
  i: number;
  j: number;
}

export interface Road {
  id: number;
  i: number;
  j: number;
  disc?: DiscKind;
  plot?: number;
  next: number[];
  prev: number[];
}

export const REGIONS: Region[] = [
  { id: 'sydney', name: 'SYDNEY', color: '#e8772e', label: { i: 0.2, j: -2.3, axis: 'i' } },
  { id: 'goldcoast', name: 'GOLD COAST', color: '#f4b400', label: { i: 5.6, j: -2.3, axis: 'i' } },
  { id: 'reef', name: 'CAIRNS', color: '#1b9aaa', label: { i: 12.1, j: 0.4, axis: 'j' } },
  { id: 'darwin', name: 'DARWIN', color: '#2d9a55', label: { i: 12.1, j: 4.1, axis: 'j' } },
  { id: 'perth', name: 'PERTH', color: '#7b4fc0', label: { i: 5.8, j: 9.3, axis: 'i' } },
  { id: 'adelaide', name: 'ADELAIDE', color: '#d6342c', label: { i: 0.2, j: 9.3, axis: 'i' } },
  { id: 'melbourne', name: 'MELBOURNE', color: '#2a6db5', label: { i: -2.2, j: 0.4, axis: 'j' } },
  { id: 'uluru', name: 'ULURU', color: '#c2512c', label: { i: 2.2, j: 1.4, axis: 'j' } },
];

export const regionById = (id: string) => REGIONS.find((r) => r.id === id)!;

type Slot = { disc: DiscKind } | { plot: string; region: string; price: number };
const D = (disc: DiscKind): Slot => ({ disc });
const P = (region: string, plot: string, price: number): Slot => ({ plot, region, price });

// Clockwise from START at the top corner.
const OUTER: Slot[] = [
  D('start'),
  P('sydney', 'Bondi Beach', 230),
  P('sydney', 'Harbour Bridge', 270),
  D('card'),
  P('sydney', 'Opera House', 300),
  D('points'), // the fork
  P('goldcoast', 'Brisbane River', 200),
  D('chance'),
  P('goldcoast', 'Theme Park Strip', 220),
  P('goldcoast', 'Surfers Paradise', 240),
  D('bank'),
  P('reef', 'Daintree Rainforest', 180),
  D('card'),
  P('reef', 'Cairns Esplanade', 190),
  P('reef', 'Great Barrier Reef', 210),
  D('news'),
  P('darwin', 'Litchfield Falls', 120),
  D('jail'),
  P('darwin', 'Mindil Beach', 130),
  P('darwin', 'Kakadu', 150),
  D('itemShop'),
  P('perth', 'Rottnest Island', 120),
  D('chance'), // the merge
  P('perth', 'Fremantle', 130),
  P('perth', 'Kings Park', 150),
  D('hospital'),
  P('adelaide', 'Glenelg Beach', 90),
  D('lucky'),
  P('adelaide', 'Barossa Valley', 100),
  P('adelaide', 'Botanic Garden', 120),
  D('cardShop'),
  P('melbourne', 'Phillip Island', 150),
  P('melbourne', 'St Kilda', 170),
  P('melbourne', 'Great Ocean Road', 200),
];

const SHORTCUT: Slot[] = [
  P('uluru', 'Alice Springs', 140),
  D('card'),
  P('uluru', 'Kata Tjuta', 150),
  D('park'),
  P('uluru', 'Uluru', 170),
  D('points'),
];

const W = 10;
const H = 7;
const FORK_I = 5;

function outerCell(k: number): { i: number; j: number; side: 'top' | 'right' | 'bottom' | 'left' } {
  if (k <= W) return { i: k, j: 0, side: 'top' };
  if (k <= W + H) return { i: W, j: k - W, side: 'right' };
  if (k <= 2 * W + H) return { i: W - (k - W - H), j: H, side: 'bottom' };
  return { i: 0, j: H - (k - 2 * W - H), side: 'left' };
}

function build() {
  const roads: Road[] = [];
  const plots: Plot[] = [];
  const add = (slot: Slot, i: number, j: number, pi: number, pj: number) => {
    const road: Road = { id: roads.length, i, j, next: [], prev: [] };
    if ('disc' in slot) road.disc = slot.disc;
    else {
      const plot: Plot = { id: plots.length, name: slot.plot, region: slot.region, price: slot.price, road: road.id, i: pi, j: pj };
      plots.push(plot);
      road.plot = plot.id;
    }
    roads.push(road);
    return road.id;
  };
  const link = (a: number, b: number) => {
    roads[a].next.push(b);
    roads[b].prev.push(a);
  };

  const outerIds = OUTER.map((slot, k) => {
    const c = outerCell(k);
    const out = { top: [c.i, c.j - 1], right: [c.i + 1, c.j], bottom: [c.i, c.j + 1], left: [c.i - 1, c.j] }[c.side];
    return add(slot, c.i, c.j, out[0], out[1]);
  });
  outerIds.forEach((id, k) => link(id, outerIds[(k + 1) % outerIds.length]));

  const forkId = outerIds[FORK_I];
  const mergeId = outerIds.find((id) => roads[id].i === FORK_I && roads[id].j === H)!;
  const shortIds = SHORTCUT.map((slot, k) => {
    const j = k + 1;
    const side = k % 4 === 0 ? 1 : -1;
    return add(slot, FORK_I, j, FORK_I + side, j);
  });
  link(forkId, shortIds[0]);
  shortIds.forEach((id, k) => link(id, k + 1 < shortIds.length ? shortIds[k + 1] : mergeId));
  return { roads, plots };
}

export const { roads: ROADS, plots: PLOTS } = build();
export const START_ROAD = ROADS.find((r) => r.disc === 'start')!.id;
export const HOSPITAL_ROAD = ROADS.find((r) => r.disc === 'hospital')!.id;
export const JAIL_ROAD = ROADS.find((r) => r.disc === 'jail')!.id;

export const plotsInRegion = (region: string) => PLOTS.filter((p) => p.region === region);

/** Roads ahead following the first branch, used for placing traps and AI lookahead. */
export function roadsAhead(from: number, dir: 1 | -1, count: number): number[] {
  const out: number[] = [];
  let at = from;
  for (let k = 0; k < count; k++) {
    const opts = dir === 1 ? ROADS[at].next : ROADS[at].prev;
    at = opts[0];
    out.push(at);
  }
  return out;
}

export const DISC_INFO: Record<DiscKind, { label: string; name: string; color: string; desc: string }> = {
  start: { label: 'START', name: 'START', color: '#e8772e', desc: 'Collect $200 and 10 points every time you pass.' },
  card: { label: 'CARD', name: 'Card', color: '#1b6fc2', desc: 'Get a free card.' },
  chance: { label: '?', name: 'Chance', color: '#7b4fc0', desc: 'Something good or bad happens.' },
  news: { label: 'NEWS', name: 'News', color: '#d6342c', desc: 'Breaking news for everyone.' },
  itemShop: { label: 'ITEM', name: 'Item Shop', color: '#f08a1c', desc: 'Buy items with points.' },
  cardShop: { label: 'SHOP', name: 'Card Shop', color: '#c2276b', desc: 'Buy cards with points.' },
  bank: { label: 'BANK', name: 'Bank', color: '#1a7d47', desc: 'Save or take out money. You can use it when you pass, too.' },
  points: { label: '★', name: 'Points', color: '#0f8a8a', desc: 'Collect 10 to 30 points.' },
  park: { label: 'PARK', name: 'Park', color: '#3c9a4f', desc: 'Have a rest. Nothing happens.' },
  lucky: { label: 'SPIN', name: 'Lucky Wheel', color: '#e0a800', desc: 'Free spin: 1–5 wins $10 × the number, 6 wins $200.' },
  hospital: { label: '+', name: 'Hospital', color: '#ffffff', desc: 'Players who get hurt rest here.' },
  jail: { label: 'JAIL', name: 'Jail', color: '#566079', desc: 'Stop here and you stay in Jail for 2 turns.' },
};
