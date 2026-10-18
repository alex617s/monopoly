// Draws the map as SVG markup. The static layer (sea, land, road, scenery) is
// built once; the dynamic layer (places, buildings, gods, traps) is rebuilt as
// the game changes. Pictures come from public/art.

import { GODS } from '../data/content';
import { LonLat, MAINLAND_PLANE, Pt, TASMANIA_PLANE, WORLD_H, WORLD_W, inside, lonLatToWorld, plane, smoothPath, toWorld } from '../data/geo';
import { DISC_INFO, OUTER_CURVE, PLOTS, REGIONS, ROADS, SHORT_CURVE, regionById } from '../data/map';
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
const ULURU = lonLatToWorld([131.4, -24.9]);

const LANDMARKS: { name: string; at: LonLat; w: number }[] = [
  { name: 'landmark-opera', at: [152.5, -34.4], w: 230 },
  { name: 'landmark-bridge', at: [152.1, -35.9], w: 250 },
];

/** Positions to keep scenery away from. */
function busySpots(): { p: Pt; r: number }[] {
  const out: { p: Pt; r: number }[] = [];
  for (const q of OUTER_CURVE.filter((_, i) => i % 3 === 0)) out.push({ p: q, r: 70 });
  for (const q of SHORT_CURVE.filter((_, i) => i % 3 === 0)) out.push({ p: q, r: 70 });
  for (const pl of PLOTS) out.push({ p: [pl.x, pl.y], r: 120 });
  for (const rd of ROADS) out.push({ p: [rd.x, rd.y], r: 80 });
  for (const rg of REGIONS) out.push({ p: [rg.label.x, rg.label.y], r: 110 });
  for (const lm of LANDMARKS) out.push({ p: lonLatToWorld(lm.at), r: 150 });
  out.push({ p: ULURU, r: 190 });
  return out;
}

function scenery(): [number, string][] {
  seed = 11;
  const items: [number, string][] = [];
  const busy = busySpots();
  const placed: Pt[] = [];
  for (let k = 0; k < 2600 && placed.length < 150; k++) {
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
  // kangaroo crossing signs by the road
  for (const k of [3, 21, 30]) {
    const rd = ROADS[k];
    items.push([rd.y - 70, sprite('prop-sign', rd.x + 70, rd.y - 70, 70, 6)]);
  }
  // Uluru: a big red rock with smaller ones around it
  items.push([ULURU[1], sprite('prop-rock', ULURU[0], ULURU[1], 280, 30)]);
  items.push([ULURU[1] + 30, sprite('prop-rock', ULURU[0] - 150, ULURU[1] + 30, 120, 14)]);
  items.push([ULURU[1] + 10, sprite('prop-rock', ULURU[0] + 160, ULURU[1] + 10, 110, 14)]);
  for (const lm of LANDMARKS) {
    const [x, y] = lonLatToWorld(lm.at);
    items.push([y, sprite(lm.name, x, y, lm.w, lm.w * 0.2)]);
  }
  for (const rg of REGIONS) items.push([rg.label.y, regionSign(rg.label.x, rg.label.y, rg.name, rg.color)]);
  return items;
}

function regionSign(x: number, y: number, text: string, color: string) {
  const w = text.length * 19 + 40;
  return `<g transform="translate(${r1(x)},${r1(y)})"><ellipse cx="4" cy="2" rx="${w / 2.6}" ry="10" fill="#000" opacity=".18"/><rect x="-12" y="-46" width="8" height="48" rx="3" fill="#8a5a33"/><rect x="4" y="-46" width="8" height="48" rx="3" fill="#7a4b25"/>
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
<text x="${r1(x)}" y="${r1(y + fs * 0.34)}" text-anchor="middle" class="disc-label" font-size="${fs}" fill="${light ? '#e5383b' : '#fff'}">${label}</text></g>`;
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

  // the road
  const roads: [Pt[], boolean][] = [
    [OUTER_CURVE, true],
    [SHORT_CURVE, false],
  ];
  for (const [p, c] of roads) out.push(`<path d="${polyline(p, c)}" fill="none" stroke="#000" stroke-width="72" opacity=".2" transform="translate(0,9)" stroke-linejoin="round" stroke-linecap="round"/>`);
  for (const [p, c] of roads) out.push(`<path d="${polyline(p, c)}" fill="none" stroke="#f3f1e7" stroke-width="66" stroke-linejoin="round" stroke-linecap="round"/>`);
  for (const [p, c] of roads) out.push(`<path d="${polyline(p, c)}" fill="none" stroke="#5c6177" stroke-width="54" stroke-linejoin="round" stroke-linecap="round"/>`);
  for (const [p, c] of roads) out.push(`<path d="${polyline(p, c)}" fill="none" stroke="#ffd23f" stroke-width="5" stroke-dasharray="22 20"/>`);

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
  return out.join('\n');
}

// ------------------------------------------------------------------ dynamic layer

const SPECIAL_ART: Record<SpecialId, string> = { park: 'special-park', mall: 'special-mall', petrol: 'special-petrol', theme: 'special-themepark' };
const GOD_ART: Record<string, string> = { wealth: 'god-wealth', fortune: 'god-fortune', land: 'god-land', angel: 'god-angel', badLuck: 'god-badluck', poverty: 'god-poverty', devil: 'god-devil' };
export const godArt = (id: string) => GOD_ART[id];

export function dynamicSvg(s: GameState, colors: Record<string, string>): string {
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
