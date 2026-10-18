// The Australia map: one source of truth for the road, the land beside it and
// the regions. Positions are pixels in the world picture (see geo.ts).
//
// The outer loop runs from START near Sydney up the east coast, across the
// top, down the west and back along the south. A shortcut leaves the loop
// near the Gold Coast and crosses the desert past Uluru to the south coast,
// so there is one fork and one merge.

import { LOOP, MAINLAND_PLANE, Pt, SHORTCUT_VIA, inside, lengths, plane, pointAt, sampleCurve, toWorld } from './geo';

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
  /** Where the region's sign stands. */
  label: { x: number; y: number };
}

export interface Plot {
  id: number;
  name: string;
  region: string;
  price: number;
  /** The road space you stand on to buy or build here. */
  road: number;
  x: number;
  y: number;
}

export interface Road {
  id: number;
  x: number;
  y: number;
  disc?: DiscKind;
  plot?: number;
  next: number[];
  prev: number[];
}

const REGION_DEFS: Omit<Region, 'label'>[] = [
  { id: 'sydney', name: 'SYDNEY', color: '#e8772e' },
  { id: 'goldcoast', name: 'GOLD COAST', color: '#f4b400' },
  { id: 'reef', name: 'CAIRNS', color: '#1b9aaa' },
  { id: 'darwin', name: 'DARWIN', color: '#2d9a55' },
  { id: 'perth', name: 'PERTH', color: '#7b4fc0' },
  { id: 'adelaide', name: 'ADELAIDE', color: '#d6342c' },
  { id: 'melbourne', name: 'MELBOURNE', color: '#2a6db5' },
  { id: 'uluru', name: 'ULURU', color: '#c2512c' },
];

type Slot = { disc: DiscKind } | { plot: string; region: string; price: number };
const D = (disc: DiscKind): Slot => ({ disc });
const P = (region: string, plot: string, price: number): Slot => ({ plot, region, price });

// From START near Sydney, up the east coast and around Australia.
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
  D('hospital'),
  P('perth', 'Rottnest Island', 120),
  P('perth', 'Fremantle', 130),
  P('perth', 'Kings Park', 150),
  D('chance'), // the merge
  D('lucky'),
  P('adelaide', 'Glenelg Beach', 90),
  P('adelaide', 'Barossa Valley', 100),
  P('adelaide', 'Botanic Garden', 120),
  D('cardShop'),
  P('melbourne', 'Phillip Island', 150),
  P('melbourne', 'St Kilda', 170),
  P('melbourne', 'Great Ocean Road', 200),
];
const FORK = 5;
const MERGE = 25;

const SHORTCUT: Slot[] = [
  P('uluru', 'Alice Springs', 140),
  D('card'),
  P('uluru', 'Kata Tjuta', 150),
  D('park'),
  P('uluru', 'Uluru', 170),
  D('points'),
];

const PLOT_OFFSET = 118;
const CENTRE = plane([134, -25]);

/** Space positions along the loop: pinned spaces sit on their points, the rest spread evenly between. */
function outerSpaces() {
  const PER = 24;
  const curve = sampleCurve(LOOP.map(([lon, lat]) => plane([lon, lat])), true, PER);
  const L = lengths(curve, true);
  const pins = LOOP.flatMap(([, , k], i) => (k === null ? [] : [{ k, d: L[i * PER] }]));
  pins.push({ k: OUTER.length, d: L[L.length - 1] });
  const out: { p: Pt; dir: Pt }[] = [];
  for (let n = 0; n + 1 < pins.length; n++) {
    const a = pins[n];
    const b = pins[n + 1];
    for (let k = a.k; k < b.k; k++) out.push(pointAt(curve, L, a.d + ((b.d - a.d) * (k - a.k)) / (b.k - a.k)));
  }
  return { out, curve };
}

function build() {
  const roads: Road[] = [];
  const plots: Plot[] = [];
  const planePos: Pt[] = [];
  const outer = outerSpaces();
  const fork = outer.out[FORK].p;
  const merge = outer.out[MERGE].p;
  const shortCurve = sampleCurve([fork, ...SHORTCUT_VIA.map(plane), merge], false, 24);
  const SL = lengths(shortCurve, false);
  const short = SHORTCUT.map((_, k) => pointAt(shortCurve, SL, (SL[SL.length - 1] * (k + 1)) / (SHORTCUT.length + 1)));
  const roadPoints = [...outer.curve, ...shortCurve];

  const placePlot = (p: Pt, dir: Pt, preferLeft: boolean | null): Pt => {
    const n: Pt = [-dir[1], dir[0]];
    const a: Pt = [p[0] + n[0] * PLOT_OFFSET, p[1] + n[1] * PLOT_OFFSET];
    const b: Pt = [p[0] - n[0] * PLOT_OFFSET, p[1] - n[1] * PLOT_OFFSET];
    const score = (c: Pt) => {
      let v = inside(c, MAINLAND_PLANE) ? 0 : 1000;
      const nearRoad = Math.min(...roadPoints.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1])));
      if (nearRoad < PLOT_OFFSET * 0.8) v += 500;
      const nearPlot = Math.min(Infinity, ...planePos.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1])));
      if (nearPlot < 150) v += 300;
      return v + Math.hypot(c[0] - CENTRE[0], c[1] - CENTRE[1]) / 1000;
    };
    let sa = score(a);
    let sb = score(b);
    if (preferLeft !== null) (preferLeft ? (sa -= 0.5) : (sb -= 0.5));
    const c = sa <= sb ? a : b;
    planePos.push(c);
    return c;
  };

  const add = (slot: Slot, at: { p: Pt; dir: Pt }, preferLeft: boolean | null) => {
    const [x, y] = toWorld(at.p);
    const road: Road = { id: roads.length, x, y, next: [], prev: [] };
    if ('disc' in slot) road.disc = slot.disc;
    else {
      const [px, py] = toWorld(placePlot(at.p, at.dir, preferLeft));
      const plot: Plot = { id: plots.length, name: slot.plot, region: slot.region, price: slot.price, road: road.id, x: px, y: py };
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

  const outerIds = OUTER.map((slot, k) => add(slot, outer.out[k], null));
  outerIds.forEach((id, k) => link(id, outerIds[(k + 1) % outerIds.length]));
  const shortIds = SHORTCUT.map((slot, k) => add(slot, short[k], k % 2 === 0));
  link(outerIds[FORK], shortIds[0]);
  shortIds.forEach((id, k) => link(id, k + 1 < shortIds.length ? shortIds[k + 1] : outerIds[MERGE]));

  // Each region's sign stands beyond one of its places, clear of the others.
  const regions: Region[] = REGION_DEFS.map((r) => {
    const mine = plots.filter((p) => p.region === r.id);
    const free = (x: number, y: number) =>
      plots.every((p) => Math.hypot(p.x - x, p.y - y) > 200) && roads.every((q) => Math.hypot(q.x - x, q.y - y) > 150);
    for (const f of [1.3, 1.7, 2.1, 2.6]) {
      for (const pl of [mine[1], mine[0], mine[2]]) {
        const rd = roads[pl.road];
        const x = pl.x + (pl.x - rd.x) * f;
        const y = pl.y + (pl.y - rd.y) * f + 50;
        if (free(x, y)) return { ...r, label: { x, y } };
      }
    }
    return { ...r, label: { x: mine[1].x, y: mine[1].y + 90 } };
  });
  return { roads, plots, regions, outerCurve: outer.curve.map(toWorld), shortCurve: shortCurve.map(toWorld) };
}

export const { roads: ROADS, plots: PLOTS, regions: REGIONS, outerCurve: OUTER_CURVE, shortCurve: SHORT_CURVE } = build();
export const regionById = (id: string) => REGIONS.find((r) => r.id === id)!;
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
