// The Australia map: one source of truth for the roads, the land beside them
// and the regions. Positions are pixels in the world picture (see geo.ts).
//
// The coast road runs from START near Sydney up the east coast, across the
// top, down the west and back along the south. Inland roads cross the
// desert (past Uluru and down the Stuart Highway), and a ferry runs to
// Tasmania, so there are several forks and merges. Two airports let you fly
// between Sydney and Perth.

import { LonLat, MAINLAND_PLANE, Pt, TASMANIA_PLANE, fromWorld, inside, lengths, plane, pointAt, sampleCurve, toWorld } from './geo';

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
  | 'jail'
  | 'airport'
  | 'ferry';

export interface Region {
  id: string;
  name: string;
  color: string;
  /** A capital city gets a star on its sign. */
  capital: boolean;
  /** Where the region's sign stands: at its real city. */
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

/** Regions, with the real place their sign stands at. A star marks a capital city. */
const REGION_DEFS: (Omit<Region, 'label'> & { city: LonLat })[] = [
  { id: 'sydney', name: 'SYDNEY', color: '#e8772e', city: [151.2, -33.9], capital: true },
  { id: 'goldcoast', name: 'BRISBANE', color: '#f4b400', city: [153.0, -27.5], capital: true },
  { id: 'reef', name: 'CAIRNS', color: '#1b9aaa', city: [145.8, -16.9], capital: false },
  { id: 'darwin', name: 'DARWIN', color: '#2d9a55', city: [130.8, -12.5], capital: true },
  { id: 'perth', name: 'PERTH', color: '#7b4fc0', city: [115.9, -31.95], capital: true },
  { id: 'adelaide', name: 'ADELAIDE', color: '#d6342c', city: [138.6, -34.9], capital: true },
  { id: 'melbourne', name: 'MELBOURNE', color: '#2a6db5', city: [144.96, -37.8], capital: true },
  { id: 'uluru', name: 'ULURU', color: '#c2512c', city: [131.0, -25.3], capital: false },
  { id: 'outback', name: 'OUTBACK', color: '#a0662f', city: [139.0, -22.4], capital: false },
  { id: 'tasmania', name: 'HOBART', color: '#2e8b57', city: [147.3, -42.9], capital: true },
  { id: 'canberra', name: 'CANBERRA', color: '#6a4c93', city: [149.1, -35.3], capital: true },
];

type Slot = ({ disc: DiscKind } | { plot: string; region: string; price: number }) & { name?: string };
const D = (disc: DiscKind, name?: string): Slot => ({ disc, name });
const P = (region: string, plot: string, price: number): Slot => ({ plot, region, price });

/** A road: the points it passes (a number pins that space to the point) and its spaces. */
interface Route {
  from?: string;
  to?: string;
  via: [number, number, number | null][];
  slots: Slot[];
}

// The coast road, from START near Sydney, up the east coast and around Australia.
const COAST: Route = {
  via: [
    [151.2, -33.9, 0], [151.8, -32.8, null], [152.6, -31.2, null], [153.3, -29.4, null], [153.0, -27.5, 5], [152.6, -25.8, null],
    [150.8, -23.6, null], [148.6, -21.0, null], [146.6, -19.2, null], [145.8, -17.0, 13], [143.0, -18.6, null], [139.8, -18.2, null],
    [136.4, -15.6, null], [133.4, -13.6, null], [130.9, -12.7, 22], [128.4, -16.0, null], [124.8, -18.2, null], [121.0, -20.6, null],
    [117.6, -22.2, null], [115.4, -25.4, null], [115.4, -28.6, null], [115.9, -32.0, 33], [118.4, -33.4, null], [122.0, -32.8, null],
    [126.0, -32.0, null], [130.0, -31.4, null], [134.0, -32.2, null], [136.2, -32.6, null], [137.7, -32.6, 41], [138.2, -33.8, null], [138.6, -34.9, null], [141.0, -36.6, null],
    [143.4, -37.7, null], [145.0, -37.9, 49], [147.6, -37.4, null], [149.6, -36.6, null], [150.6, -35.0, null],
  ],
  slots: [
    D('start', 'start'),
    P('sydney', 'Harbour Bridge', 270),
    P('sydney', 'Opera House', 300),
    D('airport', 'sydney-air'),
    P('goldcoast', 'Surfers Paradise', 240),
    P('goldcoast', 'Brisbane River', 200),
    D('points', 'uluru-road'),
    P('goldcoast', 'Noosa', 210),
    D('chance'),
    D('bank'),
    P('reef', 'Whitsunday Islands', 190),
    D('card'),
    P('reef', 'Great Barrier Reef', 210),
    P('reef', 'Cairns Esplanade', 190),
    P('reef', 'Daintree Rainforest', 180),
    D('news', 'isa-road'),
    D('itemShop'),
    D('chance'),
    D('points'),
    P('darwin', 'Kakadu', 150),
    D('jail'),
    P('darwin', 'Litchfield Falls', 120),
    P('darwin', 'Mindil Beach', 130),
    D('card', 'stuart-north'),
    P('darwin', 'Crocodile Park', 140),
    D('chance'),
    D('hospital'),
    P('perth', 'Ningaloo Reef', 120),
    D('lucky'),
    D('points'),
    P('perth', 'Rottnest Island', 120),
    D('airport', 'perth-air'),
    P('perth', 'Fremantle', 130),
    P('perth', 'Kings Park', 150),
    D('card'),
    P('perth', 'Margaret River', 110),
    D('chance'),
    D('news'),
    D('points', 'uluru-end'),
    D('bank'),
    D('chance', 'stuart-end'),
    P('adelaide', 'Flinders Ranges', 100),
    P('adelaide', 'Glenelg Beach', 90),
    D('cardShop'),
    P('adelaide', 'Barossa Valley', 100),
    P('adelaide', 'Botanic Garden', 120),
    D('card'),
    P('melbourne', 'Great Ocean Road', 200),
    P('melbourne', 'St Kilda', 170),
    P('melbourne', 'Federation Square', 180),
    D('points', 'hume'),
    D('card'),
    D('chance', 'ferry-out'),
    P('sydney', 'Bondi Beach', 230),
    D('park', 'ferry-in'),
  ],
};

const BRANCHES: Route[] = [
  {
    // across the desert from the Gold Coast, past Alice Springs and Uluru, to the south coast
    from: 'uluru-road',
    to: 'uluru-end',
    via: [[148.0, -25.6, null], [143.0, -24.8, null], [138.0, -23.8, null], [133.9, -23.7, 5], [131.8, -24.4, null], [130.9, -25.6, null], [130.2, -28.2, null], [129.8, -30.6, null]],
    slots: [
      P('outback', 'Longreach', 110),
      D('chance'),
      P('outback', 'Birdsville', 100),
      D('points'),
      P('uluru', 'Alice Springs', 150),
      D('park', 'alice'),
      P('uluru', 'Kings Canyon', 150),
      D('card'),
      P('uluru', 'Uluru', 180),
      P('uluru', 'Kata Tjuta', 160),
      D('news'),
    ],
  },
  {
    // the Stuart Highway from Darwin down to Alice Springs
    from: 'stuart-north',
    to: 'alice',
    via: [[131.8, -14.6, null], [132.6, -16.8, null], [134.2, -19.6, 2], [134.0, -21.8, null]],
    slots: [P('outback', 'Katherine Gorge', 120), D('card'), D('points', 'tennant'), P('outback', 'Devils Marbles', 110), D('chance')],
  },
  {
    // and on from Alice Springs to the south coast
    from: 'alice',
    to: 'stuart-end',
    via: [[134.4, -26.4, null], [134.8, -29.2, null], [135.2, -31.6, null]],
    slots: [D('chance'), P('outback', 'Coober Pedy', 130), D('card')],
  },
  {
    // a link from the Gulf country to the Stuart Highway
    from: 'isa-road',
    to: 'tennant',
    via: [[141.4, -19.9, null], [139.2, -20.7, null], [136.6, -20.2, null]],
    slots: [D('lucky'), D('chance')],
  },
  {
    // the ferry to Tasmania and back
    from: 'ferry-out',
    to: 'ferry-in',
    via: [[146.6, -39.6, null], [146.6, -41.2, null], [147.1, -41.6, 1], [147.2, -42.3, 2], [147.4, -42.9, 3], [148.3, -41.9, null], [149.8, -38.8, null]],
    slots: [D('ferry'), P('tasmania', 'Launceston', 160), D('card'), P('tasmania', 'Hobart', 200), D('ferry')],
  },
];

BRANCHES.push({
  // the Hume Highway inland from Melbourne, through Canberra, to Sydney
  from: 'hume',
  to: 'start',
  via: [[146.4, -36.6, null], [148.0, -35.8, null], [149.1, -35.3, null], [150.3, -34.0, null]],
  slots: [D('card'), P('canberra', 'Parliament House', 220), P('canberra', 'War Memorial', 190)],
});

const PLOT_OFFSET = 118;
/** Size of a city sign on the map (drawn in sceneSvg), for keeping it clear of places. */
export const SIGN_SCALE = 0.82;
export const SIGN_H = 104 * SIGN_SCALE;
export const signWidth = (text: string) => (text.length * 19 + 40) * SIGN_SCALE;
const CENTRE = plane([134, -25]);
const TAS_CENTRE = plane([146.6, -42.0]);
const PER = 24;

/** Space positions along a route: pinned spaces sit on their points, the rest spread evenly between. */
function routeSpaces(points: Pt[], pins: { k: number; wp: number }[], count: number, closed: boolean) {
  const curve = sampleCurve(points, closed, PER);
  const L = lengths(curve, closed);
  const at = pins.map((p) => ({ k: p.k, d: p.wp === -2 ? L[L.length - 1] : L[p.wp * PER] }));
  const out: { p: Pt; dir: Pt }[] = [];
  for (let n = 0; n + 1 < at.length; n++) {
    const a = at[n];
    const b = at[n + 1];
    for (let k = Math.max(a.k, 0); k < Math.min(b.k, count); k++) out.push(pointAt(curve, L, a.d + ((b.d - a.d) * (k - a.k)) / (b.k - a.k)));
  }
  return { out, curve };
}

const onLand = (p: Pt) => inside(p, MAINLAND_PLANE) || inside(p, TASMANIA_PLANE);

function build() {
  const roads: Road[] = [];
  const plots: Plot[] = [];
  const planePos: Pt[] = [];
  const named: Record<string, number> = {};
  const curves: { pts: Pt[]; land: boolean[]; closed: boolean }[] = [];
  const roadPoints: Pt[] = [];

  const placePlot = (p: Pt, dir: Pt, preferLeft: boolean | null): Pt => {
    const n: Pt = [-dir[1], dir[0]];
    // Clearances are checked on screen, where a place is a wide oval with its sign or building above.
    const roadWorld = roadPoints.map(toWorld);
    const clear = (c: Pt, pts: Pt[], rx: number, ry: number) => {
      const [x, y] = toWorld(c);
      return Math.min(Infinity, ...pts.map((q) => Math.hypot((q[0] - x) / rx, (q[1] - y) / ry)));
    };
    const score = (c: Pt, side: number) => {
      let v = onLand(c) ? 0 : 1000;
      const road = clear(c, roadWorld, 112, 92);
      if (road < 1) v += 500 + (1 - road) * 500;
      const plot = clear(c, planePos.map(toWorld), 165, 130);
      if (plot < 1) v += 700 + (1 - plot) * 700;
      // stay close to the space it belongs to
      v += Math.hypot(c[0] - p[0], c[1] - p[1]) / 4;
      if (preferLeft !== null && (side === 1) === preferLeft) v -= 0.5;
      // inland on the mainland; towards the coast on little Tasmania, where the road loops round
      const pull = inside(c, TASMANIA_PLANE) ? -Math.hypot(c[0] - TAS_CENTRE[0], c[1] - TAS_CENTRE[1]) / 200 : Math.hypot(c[0] - CENTRE[0], c[1] - CENTRE[1]) / 1000;
      return v + pull;
    };
    let best: { c: Pt; v: number } | null = null;
    for (const off of [1, 1.25, 1.5, 1.8, 2.2, 2.6].map((f) => f * PLOT_OFFSET)) {
      for (const along of [0, 50, -50, 100, -100, 150, -150]) {
        for (const side of [1, -1]) {
          const c: Pt = [p[0] + n[0] * off * side + dir[0] * along, p[1] + n[1] * off * side + dir[1] * along];
          const v = score(c, side);
          if (!best || v < best.v) best = { c, v };
        }
      }
    }
    planePos.push(best!.c);
    return best!.c;
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
    if (slot.name) named[slot.name] = road.id;
    roads.push(road);
    return road.id;
  };
  const link = (a: number, b: number) => {
    roads[a].next.push(b);
    roads[b].prev.push(a);
  };
  const keepCurve = (pts: Pt[], closed: boolean) => {
    curves.push({ pts: pts.map(toWorld), land: pts.map(onLand), closed });
  };

  // Work out every route's curve and spaces first, so places can keep clear of every road.
  const where: Record<string, Pt> = {};
  const coastPins = COAST.via.flatMap(([, , k], i) => (k === null ? [] : [{ k, wp: i }]));
  const coast = routeSpaces(COAST.via.map(([lon, lat]) => plane([lon, lat])), [...coastPins, { k: COAST.slots.length, wp: -2 }], COAST.slots.length, true);
  COAST.slots.forEach((slot, k) => slot.name && (where[slot.name] = coast.out[k].p));
  roadPoints.push(...coast.curve);
  const branchSpaces = BRANCHES.map((br) => {
    const points: Pt[] = [where[br.from!], ...br.via.map(([lon, lat]) => plane([lon, lat] as LonLat)), where[br.to!]];
    const pins = [{ k: -1, wp: 0 }, ...br.via.flatMap(([, , k], i) => (k === null ? [] : [{ k, wp: i + 1 }])), { k: br.slots.length, wp: -2 }];
    const route = routeSpaces(points, pins, br.slots.length, false);
    br.slots.forEach((slot, k) => slot.name && (where[slot.name] = route.out[k].p));
    roadPoints.push(...route.curve);
    return route;
  });

  keepCurve(coast.curve, true);
  const coastIds = COAST.slots.map((slot, k) => add(slot, coast.out[k], null));
  coastIds.forEach((id, k) => link(id, coastIds[(k + 1) % coastIds.length]));
  BRANCHES.forEach((br, n) => {
    const route = branchSpaces[n];
    keepCurve(route.curve, false);
    const ids = br.slots.map((slot, k) => add(slot, route.out[k], k % 2 === 0));
    link(named[br.from!], ids[0]);
    ids.forEach((id, k) => link(id, k + 1 < ids.length ? ids[k + 1] : named[br.to!]));
  });


  // Each region's sign stands at its real city, or as near to it as there is room,
  // clear of the road and of every place with its price sign or building.
  const signs: { x: number; y: number; half: number }[] = [];
  const regions: Region[] = REGION_DEFS.map(({ city, ...r }) => {
    const [cx, cy] = toWorld(plane(city));
    const half = signWidth(r.capital ? `★ ${r.name}` : r.name) / 2 + 12;
    const free = (x: number, y: number, seaOk: boolean) =>
      (seaOk || onLand(fromWorld([x, y]))) &&
      // the whole board, not just the post, keeps off the road (roads are 66 wide)
      curves.every((c) => c.pts.every(([qx, qy]) => Math.abs(qx - x) > half + 40 || qy < y - SIGN_H - 45 || qy > y + 45)) &&
      plots.every((pl) => x + half < pl.x - 80 || x - half > pl.x + 80 || y + 10 < pl.y - 130 || y - SIGN_H - 10 > pl.y + 46) &&
      signs.every((o) => Math.abs(o.x - x) > o.half + half || Math.abs(o.y - y) > SIGN_H + 30);
    const find = (seaOk: boolean, reach: number) => {
      for (let dist = 0; dist <= reach; dist += 20) {
        for (let a = 0; a < (dist ? 36 : 1); a++) {
          const x = cx + Math.cos((a * Math.PI) / 18) * dist;
          const y = cy + Math.sin((a * Math.PI) / 18) * dist * 0.7;
          if (free(x, y, seaOk)) return { x, y };
        }
      }
      return null;
    };
    // a coastal city may have its sign just offshore when the land is full
    const inland = ['canberra', 'uluru', 'outback'].includes(r.id);
    const label = (inland ? find(false, 520) : find(false, 220) ?? find(true, 420)) ?? { x: cx, y: cy };
    signs.push({ ...label, half });
    return { ...r, label };
  });
  const flights = [[named['sydney-air'], named['perth-air']]] as [number, number][];
  return { roads, plots, regions, curves, flights };
}

export const { roads: ROADS, plots: PLOTS, regions: REGIONS, curves: ROAD_CURVES, flights: FLIGHTS } = build();
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
  start: { label: 'START', name: 'START', color: '#e8772e', desc: 'Collect $200 and 10 gems every time you pass.' },
  card: { label: 'CARD', name: 'Card', color: '#1b6fc2', desc: 'Get a free card.' },
  chance: { label: '?', name: 'Chance', color: '#7b4fc0', desc: 'Something good or bad happens.' },
  news: { label: 'NEWS', name: 'News', color: '#d6342c', desc: 'Breaking news for everyone.' },
  itemShop: { label: 'ITEM', name: 'Item Shop', color: '#f08a1c', desc: 'Buy items with gems.' },
  cardShop: { label: 'SHOP', name: 'Card Shop', color: '#c2276b', desc: 'Buy cards with gems.' },
  bank: { label: 'BANK', name: 'Bank', color: '#1a7d47', desc: 'Save or take out money. You can use it when you pass, too.' },
  points: { label: '💎', name: 'Gems', color: '#0f8a8a', desc: 'Collect 10 to 30 gems.' },
  park: { label: 'PARK', name: 'Park', color: '#3c9a4f', desc: 'Have a rest. Nothing happens.' },
  lucky: { label: 'SPIN', name: 'Lucky Wheel', color: '#e0a800', desc: 'Free spin: 1–5 wins $10 × the number, 6 wins $200.' },
  hospital: { label: '+', name: 'Hospital', color: '#ffffff', desc: 'Players who get hurt rest here.' },
  airport: { label: 'FLY', name: 'Airport', color: '#3a86ff', desc: 'Pay $100 to fly to the other airport, across Australia.' },
  ferry: { label: 'BOAT', name: 'Ferry', color: '#0f6fa8', desc: 'Enjoy the ferry ride: collect 10 gems.' },
  jail: { label: 'JAIL', name: 'Jail', color: '#566079', desc: 'Stop here and you stay in Jail for 2 turns.' },
};
