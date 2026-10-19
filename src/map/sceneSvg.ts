// Draws the map as SVG markup. The static layer (sea, land, road, scenery) is
// built once; the dynamic layer (places, buildings, gods, traps) is rebuilt as
// the game changes. Pictures come from public/art.

import { GODS } from '../data/content';
import { LonLat, MAINLAND_PLANE, Pt, TASMANIA_PLANE, WORLD_H, WORLD_W, fromWorld, inside, lonLatToWorld, plane, smoothPath, toWorld } from '../data/geo';
import { DISC_INFO, FLIGHTS, PLOTS, REGIONS, ROADS, ROAD_CURVES, SIGN_SCALE, regionById } from '../data/map';
import type { SpecialId } from '../data/rules';
import type { GameState } from '../game/types';
import { art } from '../ui/common';

let seed = 11;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const r1 = (v: number) => v.toFixed(1);

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)))));
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** A picture standing on the point x, y (its bottom edge `sink` pixels below it). */
export function sprite(name: string, x: number, y: number, w: number, sink = 0, extra = '') {
  return `<image href="${art(name)}" x="${r1(x - w / 2)}" y="${r1(y + sink - w)}" width="${w}" height="${w}" preserveAspectRatio="xMidYMax meet"${extra}/>`;
}

const polyline = (pts: Pt[], closed: boolean) => 'M' + pts.map((p) => `${r1(p[0])} ${r1(p[1])}`).join(' L') + (closed ? 'Z' : '');

// ------------------------------------------------------------------ static layer

const LAND = [MAINLAND_PLANE.map(toWorld), TASMANIA_PLANE.map(toWorld)].map((pts) => smoothPath(pts, true, 1));
const ULURU = lonLatToWorld([131.0, -24.8]);

/** One landmark for each place, standing near its real spot. `sea` ones may sit in the water. */
const LANDMARK_SPOTS: { name: string; at: LonLat; w: number; sea?: boolean }[] = [
  { name: 'landmark-opera', at: [152.0, -33.7], w: 220, sea: true },
  { name: 'landmark-bridge', at: [152.2, -34.5], w: 230, sea: true },
  { name: 'landmark-parliament', at: [148.6, -35.5], w: 220 },
  { name: 'landmark-flinders', at: [143.6, -36.6], w: 210 },
  { name: 'landmark-brisbane', sea: true, at: [152.2, -27.2], w: 230 },
  { name: 'landmark-goldcoast', at: [154.2, -28.4], w: 220, sea: true },
  { name: 'landmark-reef', at: [148.4, -17.6], w: 230, sea: true },
  { name: 'landmark-croc', at: [131.4, -13.6], w: 210 },
  { name: 'landmark-uluru', at: [131.0, -24.9], w: 280 },
  { name: 'landmark-outback', at: [139.6, -23.0], w: 230 },
  { name: 'landmark-perth', sea: true, at: [114.4, -31.9], w: 210 },
  { name: 'landmark-adelaide', sea: true, at: [137.6, -35.3], w: 210 },
  { name: 'landmark-hobart', at: [148.9, -42.6], w: 190, sea: true },
];

/** Finds the nearest spot to each landmark's home where it covers no road or place. */
const LANDMARKS: { name: string; x: number; y: number; w: number }[] = (() => {
  const roadPts = ROAD_CURVES.flatMap((c) => c.pts.filter((_, i) => i % 2 === 0));
  const placed: { x: number; y: number; r: number }[] = [];
  return LANDMARK_SPOTS.map((lm) => {
    const [hx, hy] = lonLatToWorld(lm.at);
    // Try full size close to home first, then a little smaller, then further away.
    for (const [scale, reach] of [[1, 330], [0.8, 330], [0.65, 360], [0.55, 300], [0.65, 900]]) {
      const w = lm.w * scale;
      const r = w * 0.42;
      const clear = (x: number, y: number) => {
        const cy = y - w * 0.25; // the middle of the picture, above its base
        if (!lm.sea && !inside(fromWorld([x, y]), MAINLAND_PLANE) && !inside(fromWorld([x, y]), TASMANIA_PLANE)) return false;
        if (roadPts.some((q) => Math.hypot(q[0] - x, q[1] - cy) < r + 40 || Math.hypot(q[0] - x, q[1] - y) < 50)) return false;
        if (PLOTS.some((pl) => Math.hypot(pl.x - x, pl.y - 40 - cy) < r + 70)) return false;
        if (REGIONS.some((rg) => Math.hypot(rg.label.x - x, rg.label.y - 70 - cy) < r + 60)) return false;
        return placed.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + r);
      };
      for (let d = 0; d <= reach; d += 30) {
        for (let k = 0; k < (d ? 24 : 1); k++) {
          const x = hx + Math.cos((k * Math.PI) / 12) * d;
          const y = hy + Math.sin((k * Math.PI) / 12) * d * 0.75;
          if (clear(x, y)) {
            placed.push({ x, y, r });
            return { name: lm.name, x, y, w };
          }
        }
      }
    }
    return { name: lm.name, x: hx, y: hy, w: lm.w * 0.65 };
  });
})();

/** Positions to keep scenery away from. */
function busySpots(): { p: Pt; r: number }[] {
  const out: { p: Pt; r: number }[] = [];
  for (const c of ROAD_CURVES) for (const q of c.pts.filter((_, i) => i % 3 === 0)) out.push({ p: q, r: 70 });
  for (const pl of PLOTS) out.push({ p: [pl.x, pl.y], r: 120 });
  for (const rd of ROADS) out.push({ p: [rd.x, rd.y], r: 80 });
  for (const rg of REGIONS) out.push({ p: [rg.label.x, rg.label.y], r: 110 });
  for (const lm of LANDMARKS) out.push({ p: [lm.x, lm.y - lm.w * 0.25], r: lm.w * 0.55 });
  return out;
}

function scenery(): [number, string][] {
  seed = 11;
  const items: [number, string][] = [];
  const busy = busySpots();
  const placed: Pt[] = [];
  for (let k = 0; k < 2600 && placed.length < 75; k++) {
    const lon = 113.5 + rand() * 40.5;
    const lat = -11.5 - rand() * 27;
    if (!inside(plane([lon, lat]), MAINLAND_PLANE)) continue;
    const p = lonLatToWorld([lon, lat]);
    if (busy.some((b) => Math.hypot(b.p[0] - p[0], b.p[1] - p[1]) < b.r)) continue;
    if (placed.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 95)) continue;
    // keep a little sand beach clear along the coast
    const nearCoast = [[0, 30], [30, 0], [0, -30], [-30, 0]].some(([dx, dy]) => !inside(plane([lon + dx / 62, lat - dy / 62]), MAINLAND_PLANE));
    if (nearCoast) continue;
    placed.push(p);
    const desert = Math.hypot((lon - 131.5) / 10, (lat + 25) / 7) < 1;
    const north = lat > -20;
    const t = rand();
    const name = desert ? (t < 0.5 ? 'prop-rock' : t < 0.85 ? 'prop-bush' : 'prop-gumtree') : north ? (t < 0.55 ? 'prop-palm' : t < 0.85 ? 'prop-gumtree' : 'prop-bush') : t < 0.5 ? 'prop-gumtree' : t < 0.75 ? 'prop-bush' : t < 0.92 ? 'prop-flowers' : 'prop-palm';
    const w = name === 'prop-rock' ? 92 : name === 'prop-flowers' ? 80 : 110 + rand() * 20;
    items.push([p[1], sprite(name, p[0], p[1], w, w * 0.12)]);
  }
  // farms in the country
  const free = (p: Pt, r: number) => busy.every((b) => Math.hypot(b.p[0] - p[0], b.p[1] - p[1]) > Math.min(b.r, r)) && placed.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 90);
  for (let k = 0, farms = 0; k < 600 && farms < 6; k++) {
    const lon = 114 + rand() * 40;
    const lat = -29 - rand() * 9;
    if (lon > 120 && lon < 139) continue;
    if (!inside(plane([lon, lat]), MAINLAND_PLANE)) continue;
    const p = lonLatToWorld([lon, lat]);
    if (!free(p, 120)) continue;
    placed.push(p);
    items.push([p[1], sprite('build-2', p[0], p[1], 120, 28)]);
    farms++;
  }
  // kangaroo crossing signs by the road
  for (const k of [3, 21, 30]) {
    const rd = ROADS[k];
    items.push([rd.y - 70, sprite('prop-sign', rd.x + 70, rd.y - 70, 70, 6)]);
  }
  for (const lm of LANDMARKS) items.push([lm.y, sprite(lm.name, lm.x, lm.y, lm.w, lm.w * 0.15)]);
  return items;
}

function flightPath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const mx = (a.x + b.x) / 2;
  const my = Math.min(a.y, b.y) - 520;
  const d = `M${r1(a.x)} ${r1(a.y - 20)} Q${r1(mx)} ${r1(my)} ${r1(b.x)} ${r1(b.y - 20)}`;
  // a little plane halfway along the curve
  const px = (a.x + 2 * mx + b.x) / 4;
  const py = (a.y + 2 * my + b.y) / 4 - 20;
  return `<path d="${d}" fill="none" stroke="#fff" stroke-width="8" stroke-dasharray="2 26" stroke-linecap="round" opacity=".9"/>
<g transform="translate(${r1(px)},${r1(py)}) rotate(${a.x > b.x ? 180 : 0}) scale(1.6)"><path d="M-30 0 L30 -4 Q40 0 30 4 Z" fill="#fff" stroke="#1b6fc2" stroke-width="3"/><path d="M-2 -2 L-14 -26 L-4 -26 L12 -2Z M-2 2 L-14 26 L-4 26 L12 2Z M-26 -1 L-34 -12 L-28 -12 L-20 -1Z" fill="#e5383b" stroke="#fff" stroke-width="2"/></g>`;
}

function regionSign(x: number, y: number, text: string, color: string) {
  const w = text.length * 19 + 40;
  return `<g transform="translate(${r1(x)},${r1(y)}) scale(${SIGN_SCALE})"><ellipse cx="4" cy="2" rx="${w / 2.6}" ry="10" fill="#000" opacity=".18"/><rect x="-12" y="-46" width="8" height="48" rx="3" fill="#8a5a33"/><rect x="4" y="-46" width="8" height="48" rx="3" fill="#7a4b25"/>
<rect x="${-w / 2}" y="-98" width="${w}" height="56" rx="16" fill="${shade(color, -0.3)}"/><rect x="${-w / 2}" y="-104" width="${w}" height="56" rx="16" fill="${color}" stroke="#fff" stroke-width="4"/>
<text x="0" y="-66" text-anchor="middle" class="sign-name">${text}</text></g>`;
}

function disc(x: number, y: number, kind: keyof typeof DISC_INFO) {
  const info = DISC_INFO[kind];
  const c = info.color;
  const light = kind === 'hospital';
  const label = info.label;
  const fs = label.length > 2 ? 22 : 34;
  return `<g><ellipse cx="${r1(x)}" cy="${r1(y + 9)}" rx="46" ry="28" fill="#000" opacity=".22"/><ellipse cx="${r1(x)}" cy="${r1(y + 7)}" rx="44" ry="27" fill="${shade(c, light ? -0.25 : -0.35)}"/>
<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="44" ry="27" fill="${c}" stroke="#fff" stroke-width="4"/><ellipse cx="${r1(x - 8)}" cy="${r1(y - 9)}" rx="24" ry="8" fill="#fff" opacity=".35"/>
${kind === 'points' ? gem(x, y - 2) : `<text x="${r1(x)}" y="${r1(y + fs * 0.34)}" text-anchor="middle" class="disc-label" font-size="${fs}" fill="${light ? '#e5383b' : '#fff'}">${label}</text>`}</g>`;
}

/** A sparkling blue gem, like the one on the player card. */
function gem(x: number, y: number, s = 1) {
  return `<g transform="translate(${r1(x)},${r1(y)}) scale(${s})"><path d="M-14 -11 h28 l9 11 -23 18 -23 -18z" fill="#5ed3ff" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M-23 0 h46 M-6 -11 l6 29 6 -29" stroke="#fff" stroke-width="2" fill="none" opacity=".85"/></g>`;
}

export function staticSvg(): string {
  const out: string[] = [];
  const tex = (id: string, name: string, size: number) =>
    `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${size}" height="${Math.round(size * 0.66)}"><image href="${art(name)}" width="${size}" height="${Math.round(size * 0.66)}" preserveAspectRatio="none"/></pattern>`;
  out.push(`<defs>${tex('t-water', 'tex-water', 420)}${tex('t-grass', 'tex-grass', 360)}${tex('t-sand', 'tex-sand', 300)}${tex('t-dirt', 'tex-dirt', 360)}
<linearGradient id="g-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fe3ff" stop-opacity=".35"/><stop offset="1" stop-color="#0b4f9c" stop-opacity=".35"/></linearGradient>
<radialGradient id="g-desert"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
<radialGradient id="g-north"><stop offset="0" stop-color="#1e6b1e" stop-opacity=".35"/><stop offset="1" stop-color="#1e6b1e" stop-opacity="0"/></radialGradient>
<filter id="f-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16"/></filter>
<clipPath id="c-land"><path d="${LAND[0]}"/><path d="${LAND[1]}"/></clipPath>
<mask id="m-desert"><rect width="${WORLD_W}" height="${WORLD_H}" fill="#000"/><ellipse cx="${r1(ULURU[0])}" cy="${r1(ULURU[1] + 60)}" rx="900" ry="430" fill="url(#g-desert)"/></mask></defs>`);
  out.push(`<rect width="${WORLD_W}" height="${WORLD_H}" fill="#1f86d6"/><rect width="${WORLD_W}" height="${WORLD_H}" fill="url(#t-water)"/><rect width="${WORLD_W}" height="${WORLD_H}" fill="url(#g-sea)"/>`);
  seed = 3;
  for (let k = 0; k < 160; k++) {
    const x = rand() * WORLD_W;
    const y = rand() * WORLD_H;
    out.push(`<path d="M${r1(x)} ${r1(y)} q10 -7 20 0 q10 7 20 0" stroke="#fff" stroke-width="3.5" fill="none" opacity="${(0.25 + rand() * 0.3).toFixed(2)}" stroke-linecap="round"/>`);
  }
  for (const d of LAND) {
    out.push(`<path d="${d}" fill="#a7f1ff" stroke="#a7f1ff" stroke-width="130" opacity=".55" filter="url(#f-blur)"/>`);
    out.push(`<path d="${d}" fill="none" stroke="#e9fcff" stroke-width="34" opacity=".75" stroke-linejoin="round"/>`);
    out.push(`<path d="${d}" transform="translate(0,30)" fill="#8f5a2f"/><path d="${d}" transform="translate(0,16)" fill="#b97a44"/>`);
    out.push(`<path d="${d}" fill="url(#t-sand)"/>`);
  }
  out.push(`<g clip-path="url(#c-land)"><rect width="${WORLD_W}" height="${WORLD_H}" fill="url(#t-grass)"/>`);
  const north = lonLatToWorld([140, -15]);
  out.push(`<ellipse cx="${r1(north[0])}" cy="${r1(north[1])}" rx="1300" ry="420" fill="url(#g-north)"/>`);
  out.push(`<rect width="${WORLD_W}" height="${WORLD_H}" fill="url(#t-dirt)" mask="url(#m-desert)"/>`);
  for (const d of LAND) out.push(`<path d="${d}" fill="none" stroke="url(#t-sand)" stroke-width="56"/>`);
  out.push('</g>');
  for (const d of LAND) out.push(`<path d="${d}" fill="none" stroke="#d8a85c" stroke-width="3" opacity=".7"/>`);
  // Lake Eyre and the Murray River
  const lake = lonLatToWorld([137.4, -28.6]);
  out.push(`<ellipse cx="${r1(lake[0])}" cy="${r1(lake[1])}" rx="80" ry="30" fill="#f4f1e6" stroke="#8fd8ee" stroke-width="6"/>`);
  out.push(`<path d="${smoothPath(([[148.6, -36.3], [146.2, -35.8], [143.6, -34.7], [141.4, -34.2], [139.6, -34.6], [139.3, -35.6]] as LonLat[]).map(lonLatToWorld), false)}" stroke="#4fb3ec" stroke-width="13" fill="none" stroke-linecap="round"/>`);

  // state borders and names, so you can learn where everything is
  const BORDERS: LonLat[][] = [
    [[129, -14.9], [129, -31.7]],
    [[129, -26], [141, -26]],
    [[138, -16.6], [138, -26]],
    [[141, -26], [141, -29], [149, -29], [151.2, -28.6], [153.5, -28.2]],
    [[141, -29], [141, -38.05]],
    [[141, -34.1], [143.5, -35.3], [146, -35.95], [148.2, -36.8], [149.98, -37.5]],
  ];
  for (const line of BORDERS) {
    const pts = line.flatMap((p, i) => (i === 0 ? [p] : Array.from({ length: 12 }, (_, k): LonLat => [line[i - 1][0] + ((p[0] - line[i - 1][0]) * (k + 1)) / 12, line[i - 1][1] + ((p[1] - line[i - 1][1]) * (k + 1)) / 12])));
    out.push(`<path d="${polyline(pts.map(lonLatToWorld), false)}" fill="none" stroke="#fff" stroke-width="6" stroke-dasharray="18 14" opacity=".55" stroke-linecap="round"/>`);
  }
  const act = lonLatToWorld([149.0, -35.45]);
  out.push(`<ellipse cx="${r1(act[0])}" cy="${r1(act[1])}" rx="70" ry="44" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="12 10" opacity=".6"/>`);
  // the road
  // Roads on land; where a route crosses the sea it is a ferry lane instead.
  const runs: { pts: Pt[]; closed: boolean; land: boolean }[] = [];
  for (const c of ROAD_CURVES) {
    if (c.land.every(Boolean)) {
      runs.push({ pts: c.pts, closed: c.closed, land: true });
      continue;
    }
    let cur: Pt[] = [c.pts[0]];
    let land = c.land[0];
    for (let i = 1; i < c.pts.length; i++) {
      cur.push(c.pts[i]);
      if (c.land[i] !== land) {
        runs.push({ pts: cur, closed: false, land });
        cur = [c.pts[i]];
        land = c.land[i];
      }
    }
    runs.push({ pts: cur, closed: false, land });
  }
  const roadRuns = runs.filter((r) => r.land);
  for (const r of runs.filter((x) => !x.land)) {
    out.push(`<path d="${polyline(r.pts, false)}" fill="none" stroke="#bff3ff" stroke-width="40" opacity=".55" stroke-linecap="round"/>`);
    out.push(`<path d="${polyline(r.pts, false)}" fill="none" stroke="#fff" stroke-width="7" stroke-dasharray="4 22" stroke-linecap="round"/>`);
  }
  for (const r of roadRuns) out.push(`<path d="${polyline(r.pts, r.closed)}" fill="none" stroke="#000" stroke-width="72" opacity=".2" transform="translate(0,9)" stroke-linejoin="round" stroke-linecap="round"/>`);
  for (const r of roadRuns) out.push(`<path d="${polyline(r.pts, r.closed)}" fill="none" stroke="#f3f1e7" stroke-width="66" stroke-linejoin="round" stroke-linecap="round"/>`);
  for (const r of roadRuns) out.push(`<path d="${polyline(r.pts, r.closed)}" fill="none" stroke="#5c6177" stroke-width="54" stroke-linejoin="round" stroke-linecap="round"/>`);
  for (const r of roadRuns) out.push(`<path d="${polyline(r.pts, r.closed)}" fill="none" stroke="#ffd23f" stroke-width="5" stroke-dasharray="22 20"/>`);

  // spaces on the road
  for (const rd of ROADS) {
    if (rd.disc) out.push(disc(rd.x, rd.y, rd.disc));
    else {
      const c = regionById(PLOTS[rd.plot!].region).color;
      out.push(`<ellipse cx="${r1(rd.x)}" cy="${r1(rd.y + 5)}" rx="31" ry="19" fill="${shade(c, -0.35)}"/><ellipse cx="${r1(rd.x)}" cy="${r1(rd.y)}" rx="31" ry="19" fill="#fff" stroke="${c}" stroke-width="7"/>`);
    }
  }
  const items = scenery().sort((a, b) => a[0] - b[0]);
  out.push(...items.map((i) => i[1]));
  // boats and whales out at sea
  const SEA: [string, LonLat, number][] = [
    ['prop-boat', [156.2, -31.0], 120],
    ['prop-boat', [111.6, -27.0], 110],
    ['prop-boat', [126.4, -13.0], 100],
    ['prop-boat', [141.6, -40.6], 100],
    ['prop-whale', [157.0, -36.5], 150],
    ['prop-whale', [112.0, -35.2], 140],
    ['prop-whale', [131.0, -35.6], 130],
  ];
  for (const [name, at, w] of SEA) {
    const [x, y] = lonLatToWorld(at);
    out.push(sprite(name, x, y, w, w * 0.1));
  }
  for (const [a, b] of FLIGHTS) out.push(flightPath(ROADS[a], ROADS[b]));
  const STATES: [string, LonLat][] = [['WESTERN AUSTRALIA', [121.5, -25.5]], ['NORTHERN TERRITORY', [133.5, -19.5]], ['SOUTH AUSTRALIA', [134.5, -29.6]], ['QUEENSLAND', [144.5, -22.5]], ['NEW SOUTH WALES', [146.2, -30.9]], ['VICTORIA', [143.6, -37.0]], ['TASMANIA', [150.6, -43.6]], ['ACT', [149.3, -35.9]]];
  for (const [name, at] of STATES) {
    const [x, y] = lonLatToWorld(at);
    out.push(`<text x="${r1(x)}" y="${r1(y)}" text-anchor="middle" class="state-name${name === 'ACT' ? ' state-name--small' : ''}">${name}</text>`);
  }

  return out.join('\n');
}

/** City signs and state names, drawn above everything on the map. */
export function labelSvg(): string {
  return REGIONS.map((rg) => regionSign(rg.label.x, rg.label.y, rg.capital ? `★ ${rg.name}` : rg.name, rg.color)).join('');
}

// ------------------------------------------------------------------ dynamic layer

const SPECIAL_ART: Record<SpecialId, string> = { park: 'special-park', mall: 'special-mall', petrol: 'special-petrol', theme: 'special-themepark' };
const GOD_ART: Record<string, string> = { wealth: 'god-wealth', fortune: 'god-fortune', land: 'god-land', angel: 'god-angel', badLuck: 'god-badluck', poverty: 'god-poverty', devil: 'god-devil' };
export const godArt = (id: string) => GOD_ART[id];

export function dynamicSvg(s: GameState, colors: Record<string, string>, hidePlot: number | null = null): string {
  const items: [number, string][] = [];
  for (const pl of PLOTS) {
    const ps = s.plots[pl.id];
    const region = regionById(pl.region);
    const owner = ps.owner ? colors[ps.owner] : null;
    const { x, y } = pl;
    let g = owner
      ? `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="74" ry="46" fill="${owner}" opacity=".35"/><ellipse cx="${r1(x)}" cy="${r1(y)}" rx="74" ry="46" fill="none" stroke="${owner}" stroke-width="6"/>`
      : `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="70" ry="43" fill="#d6f0b4" opacity=".75" stroke="${region.color}" stroke-width="5" stroke-dasharray="14 10"/>`;
    if (!owner) {
      g += `<g transform="translate(${r1(x)},${r1(y - 4)})"><rect x="-4" y="-34" width="8" height="36" rx="3" fill="#8a5a33"/><rect x="-46" y="-72" width="92" height="42" rx="12" fill="#fff" stroke="${region.color}" stroke-width="5"/><text x="0" y="-42" text-anchor="middle" class="sign">$${PLOTS[pl.id].price}</text></g>`;
    } else if (pl.id === hidePlot) {
      // this building is going up right now; the map animates it
    } else if (ps.special) {
      g += sprite(SPECIAL_ART[ps.special], x, y, 190, 44);
    } else if (ps.level === 0) {
      g += `<g transform="translate(${r1(x)},${r1(y)})"><path d="M0 0 v-70" stroke="#5b3a1e" stroke-width="6" stroke-linecap="round"/><path d="M3 -70 l46 14 l-46 14z" fill="${owner}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></g>`;
    } else {
      g += sprite(`build-${ps.level}`, x, y, ps.level >= 4 ? 176 : 170, 44);
    }
    items.push([y, g]);
  }
  for (const [road, by] of Object.entries(s.roadblocks)) {
    const rd = ROADS[Number(road)];
    const c = colors[by] ?? '#e5383b';
    items.push([rd.y + 1, `<g transform="translate(${r1(rd.x)},${r1(rd.y)})"><rect x="-6" y="-40" width="6" height="40" fill="#555"/><rect x="34" y="-40" width="6" height="40" fill="#555"/><rect x="-40" y="-52" width="80" height="22" rx="5" fill="#fff" stroke="${c}" stroke-width="4"/><path d="M-30 -32 l12 -20 M-6 -32 l12 -20 M18 -32 l12 -20" stroke="#e5383b" stroke-width="8"/></g>`]);
  }
  for (const [road] of Object.entries(s.bananas)) {
    const rd = ROADS[Number(road)];
    items.push([rd.y + 1, `<g transform="translate(${r1(rd.x + 24)},${r1(rd.y - 4)})"><path d="M-22 0 q22 22 44 -10 q-22 6 -44 10z" fill="#ffd23f" stroke="#a87900" stroke-width="3" stroke-linejoin="round"/><path d="M-22 0 l-8 -4" stroke="#6b4b00" stroke-width="4" stroke-linecap="round"/></g>`]);
  }
  for (const [road] of Object.entries(s.bombs)) {
    const rd = ROADS[Number(road)];
    items.push([rd.y + 1, `<g transform="translate(${r1(rd.x - 26)},${r1(rd.y - 10)})"><circle r="17" fill="#2b2d42" stroke="#fff" stroke-width="3"/><path d="M8 -14 q8 -10 16 -6" stroke="#8a5a33" stroke-width="4" fill="none"/><circle cx="25" cy="-20" r="5" fill="#ff8a1f"/><circle cx="-6" cy="-6" r="5" fill="#fff" opacity=".5"/></g>`]);
  }
  for (const [road, pk] of Object.entries(s.pickups)) {
    const rd = ROADS[Number(road)];
    const g =
      pk.kind === 'cash'
        ? `<path d="M-20 4 q-4 -26 12 -30 l-6 -8 h28 l-6 8 q16 4 12 30z" fill="#e0a800" stroke="#7a5200" stroke-width="3" stroke-linejoin="round"/><text x="0" y="-4" text-anchor="middle" class="pickup-mark">$</text>`
        : pk.kind === 'points'
          ? gem(0, -12, 1.3)
          : `<rect x="-22" y="-34" width="44" height="38" rx="5" fill="#b9783f" stroke="#5b3a1e" stroke-width="3"/><path d="M-22 -22 h44 M0 -34 v38" stroke="#5b3a1e" stroke-width="3"/><text x="0" y="-6" text-anchor="middle" class="pickup-mark">?</text>`;
    items.push([rd.y + 2, `<g class="pickup" transform="translate(${r1(rd.x)},${r1(rd.y - 18)})"><ellipse cx="0" cy="22" rx="24" ry="8" fill="#000" opacity=".2"/>${g}</g>`]);
  }
  for (const [road, god] of Object.entries(s.mapGods)) {
    const rd = ROADS[Number(road)];
    const c = GODS[god.id].color;
    items.push([
      rd.y + 2,
      `<g class="map-god"><ellipse cx="${r1(rd.x)}" cy="${r1(rd.y + 4)}" rx="40" ry="14" fill="${c}" opacity=".35"/>${sprite(GOD_ART[god.id], rd.x, rd.y - 18, 96, 0)}</g>`,
    ]);
  }
  items.sort((a, b) => a[0] - b[0]);
  return items.map((i) => i[1]).join('');
}
