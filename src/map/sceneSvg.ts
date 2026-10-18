// Draws the map as SVG markup. The static layer (ground, road, scenery) is
// built once; the dynamic layer (buildings, gods, traps) is rebuilt as the
// game changes. Pictures from ChatGPT can later replace these vector shapes.

import { DISC_INFO, PLOTS, REGIONS, ROADS } from '../data/map';
import { GODS } from '../data/content';
import type { GameState } from '../game/types';
import { GRID, TH, TW, WORLD_H, WORLD_W, toScreen } from './iso';

let seed = 11;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const roadCells = new Set(ROADS.map((r) => `${r.i},${r.j}`));
const plotCells = new Set(PLOTS.map((p) => `${p.i},${p.j}`));

/** Distance outside the 10 × 7 loop rectangle (0 inside or on it). */
const outside = (i: number, j: number) => Math.max(-i, i - 10, -j, j - 7, 0);
const isSea = (i: number, j: number) => outside(i, j) > 3.2;
const isSand = (i: number, j: number) => !isSea(i, j) && outside(i, j) > 2.2;
const isDirt = (i: number, j: number) => i >= 1 && i <= 9 && j >= 2 && j <= 5 && Math.abs(i - 5) <= 2.2;

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)))));
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
}
const pts = (p: number[][]) => p.map((q) => q.join(',')).join(' ');
const dia = (x: number, y: number, a = TW / 2, b = TH / 2) => [[x, y - b], [x + a, y], [x, y + b], [x - a, y]];
const poly = (p: number[][], fill: string, extra = '') => `<polygon points="${pts(p)}" fill="${fill}" ${extra}/>`;

function box(x: number, y: number, s: number, h: number, col: string, top?: string) {
  const a = (TW / 2) * s;
  const b = (TH / 2) * s;
  return (
    poly([[x - a, y], [x, y + b], [x, y + b - h], [x - a, y - h]], shade(col, -0.05)) +
    poly([[x, y + b], [x + a, y], [x + a, y - h], [x, y + b - h]], shade(col, -0.3)) +
    poly(dia(x, y - h, a, b), top ?? shade(col, 0.25))
  );
}

function tree(x: number, y: number, s: number) {
  return `<g><ellipse cx="${x + 8}" cy="${y + 4}" rx="${30 * s}" ry="${13 * s}" fill="#000" opacity=".18"/>
<rect x="${x - 4 * s}" y="${y - 34 * s}" width="${8 * s}" height="${36 * s}" rx="3" fill="#8a5a33"/>
<circle cx="${x}" cy="${y - 52 * s}" r="${30 * s}" fill="#3f8f3a"/><circle cx="${x - 14 * s}" cy="${y - 44 * s}" r="${20 * s}" fill="#4fa346"/>
<circle cx="${x + 12 * s}" cy="${y - 62 * s}" r="${16 * s}" fill="#6cc45a"/></g>`;
}

function palm(x: number, y: number) {
  let g = `<g><ellipse cx="${x + 10}" cy="${y + 4}" rx="34" ry="12" fill="#000" opacity=".16"/><path d="M${x} ${y} q8 -50 -4 -100" stroke="#a0703c" stroke-width="9" fill="none" stroke-linecap="round"/>`;
  for (const a of [-150, -110, -60, -20, 20]) {
    const r = (a * Math.PI) / 180;
    const ex = x - 4 + Math.cos(r) * 60;
    const ey = y - 100 + Math.sin(r) * 30 + 22;
    g += `<path d="M${x - 4} ${y - 100} Q${(x - 4 + ex) / 2} ${y - 128} ${ex} ${ey}" stroke="#3f9a3c" stroke-width="12" fill="none" stroke-linecap="round"/>`;
  }
  return g + '</g>';
}

function rock(x: number, y: number) {
  return `<g><ellipse cx="${x + 6}" cy="${y + 4}" rx="34" ry="12" fill="#000" opacity=".16"/><path d="M${x - 34} ${y} q6 -40 34 -44 q30 4 34 44 z" fill="#b5532a"/><path d="M${x - 10} ${y - 30} q10 -14 26 -6" stroke="#d9794a" stroke-width="5" fill="none"/></g>`;
}

function lettering(name: string, i: number, j: number, axis: 'i' | 'j', color: string) {
  const { x, y } = toScreen(i, j);
  const k = 100;
  const m = (dy: number) =>
    axis === 'i'
      ? `matrix(${TW / 2 / k},${TH / 2 / k},${-TW / 2 / k},${TH / 2 / k},${x},${y + dy})`
      : `matrix(${TW / 2 / k},${-TH / 2 / k},${TW / 2 / k},${TH / 2 / k},${x},${y + dy})`;
  let g = '';
  for (let d = 8; d >= 1; d--) g += `<text transform="${m(d)}" class="letters" fill="${shade(color, -0.45)}">${name}</text>`;
  g += `<text transform="${m(0)}" class="letters" fill="${color}" stroke="#fff6dc" stroke-width="3">${name}</text>`;
  return g;
}

export function staticSvg(): string {
  seed = 11;
  const out: string[] = [];
  out.push(`<defs>
<linearGradient id="sea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#43b3e6"/><stop offset="1" stop-color="#1f7fc4"/></linearGradient>
<filter id="soft"><feGaussianBlur stdDeviation="4"/></filter>
</defs><rect width="${WORLD_W}" height="${WORLD_H}" fill="url(#sea)"/>`);

  const cells: [number, number][] = [];
  for (let i = GRID.iMin; i <= GRID.iMax; i++) for (let j = GRID.jMin; j <= GRID.jMax; j++) cells.push([i, j]);
  cells.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));

  for (const [i, j] of cells) {
    const { x, y } = toScreen(i, j);
    if (isSea(i, j)) {
      out.push(poly(dia(x, y), shade('#2f9bd8', (rand() - 0.5) * 0.1), 'opacity=".5"'));
      continue;
    }
    const base = isSand(i, j) ? '#f1d79a' : isDirt(i, j) ? '#d9814a' : (i * 7 + j * 3) % 5 ? '#69b548' : '#5fae43';
    out.push(poly(dia(x, y), shade(base, (rand() - 0.5) * 0.1)));
    if (!isSand(i, j) && !isDirt(i, j) && !roadCells.has(`${i},${j}`)) {
      for (let k = 0; k < 2; k++) {
        const px = x + (rand() - 0.5) * TW * 0.6;
        const py = y + (rand() - 0.5) * TH * 0.5;
        out.push(`<path d="M${px} ${py} l2 -7 l2 7" stroke="#4e9a35" stroke-width="2" fill="none" stroke-linecap="round"/>`);
      }
    }
  }
  // Foam along the coast.
  for (const [i, j] of cells) {
    if (isSea(i, j)) continue;
    const { x, y } = toScreen(i, j);
    const edges: string[] = [];
    if (isSea(i + 1, j)) edges.push(`M${x} ${y - TH / 2} L${x + TW / 2} ${y}`);
    if (isSea(i, j + 1)) edges.push(`M${x + TW / 2} ${y} L${x} ${y + TH / 2}`);
    if (isSea(i - 1, j)) edges.push(`M${x} ${y + TH / 2} L${x - TW / 2} ${y}`);
    if (isSea(i, j - 1)) edges.push(`M${x - TW / 2} ${y} L${x} ${y - TH / 2}`);
    if (edges.length) out.push(`<path d="${edges.join(' ')}" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".85"/>`);
  }
  // Road.
  for (const r of ROADS) {
    const { x, y } = toScreen(r.i, r.j);
    out.push(poly(dia(x, y, (TW / 2) * 0.98, (TH / 2) * 0.98), '#3b3f4a'));
  }
  const lines: string[] = [];
  for (const r of ROADS)
    for (const n of r.next) {
      const a = toScreen(r.i, r.j);
      const b = toScreen(ROADS[n].i, ROADS[n].j);
      lines.push(`M${a.x} ${a.y} L${b.x} ${b.y}`);
    }
  out.push(`<path d="${lines.join(' ')}" stroke="#ffd23f" stroke-width="5" stroke-dasharray="22 18" fill="none" stroke-linecap="round"/>`);
  for (const r of REGIONS) out.push(lettering(r.name, r.label.i, r.label.j, r.label.axis, r.color));

  // Scenery on free cells.
  const objs: [number, string][] = [];
  for (const [i, j] of cells) {
    const key = `${i},${j}`;
    if (isSea(i, j) || roadCells.has(key) || plotCells.has(key)) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => roadCells.has(`${i + a},${j + b}`) || plotCells.has(`${i + a},${j + b}`));
    const { x, y } = toScreen(i, j);
    const r = rand();
    if (isSand(i, j)) {
      if (r < 0.3) objs.push([i + j + 0.6, palm(x + (rand() - 0.5) * 50, y)]);
    } else if (isDirt(i, j)) {
      if (r < 0.2) objs.push([i + j + 0.6, rock(x, y)]);
    } else if (!near && r < 0.45) objs.push([i + j + 0.6, tree(x + (rand() - 0.5) * 60, y + (rand() - 0.5) * 20, 0.8 + rand() * 0.5)]);
  }
  objs.sort((a, b) => a[0] - b[0]);
  out.push(objs.map((o) => o[1]).join(''));
  return out.join('');
}

// ------------------------------------------------------------------ dynamic

function plotOutline(x: number, y: number, color: string | null) {
  const d = dia(x, y, (TW / 2) * 0.86, (TH / 2) * 0.86);
  return (color ? poly(d, color, 'opacity=".22"') : '') + poly(d, 'none', `stroke="${color ?? '#ffffff'}" stroke-width="${color ? 5 : 3}" stroke-dasharray="${color ? '0' : '12 8'}" opacity=".95"`);
}

function shadow(x: number, y: number, s: number) {
  return `<ellipse cx="${x + 10}" cy="${y + 6}" rx="${(TW / 2) * s}" ry="${(TH / 2) * s * 0.8}" fill="#000" opacity=".22" filter="url(#soft)"/>`;
}

function building(x: number, y: number, level: number, color: string) {
  let g = '';
  switch (level) {
    case 1: {
      const a = (TW / 2) * 0.42;
      const b = (TH / 2) * 0.42;
      g += shadow(x, y, 0.5) + poly([[x - a, y], [x, y + b], [x, y - 52]], color) + poly([[x, y + b], [x + a, y], [x, y - 52]], shade(color, -0.3)) + poly([[x - 9, y + b - 4], [x + 3, y + b - 2], [x, y - 14]], '#1d2a44');
      break;
    }
    case 2:
    case 3: {
      const h = level === 3 ? 62 : 40;
      g += shadow(x, y, 0.62) + box(x, y, 0.56, h, '#fff4dc');
      const a = (TW / 2) * 0.62;
      const b = (TH / 2) * 0.62;
      const rt = y - h;
      const ap = rt - 46;
      g += poly([[x - a, rt], [x, rt + b], [x, ap]], shade(color, -0.05)) + poly([[x, rt + b], [x + a, rt], [x, ap]], shade(color, -0.3)) + poly([[x - a, rt], [x, rt - b], [x, ap]], shade(color, 0.15));
      g += poly([[x - 30, y + 2], [x - 16, y + 9], [x - 16, y - 13], [x - 30, y - 20]], '#7ec8f0') + poly([[x + 14, y + 8], [x + 28, y + 1], [x + 28, y - 21], [x + 14, y - 14]], '#5aa8d8');
      if (level === 3) g += poly([[x - 30, y - 28], [x - 16, y - 21], [x - 16, y - 41], [x - 30, y - 48]], '#7ec8f0');
      break;
    }
    case 4: {
      const h = 124;
      g += shadow(x, y, 0.72) + box(x, y, 0.66, h, '#fde8c8');
      const a = (TW / 2) * 0.66;
      for (let f = 22; f < h; f += 24) {
        g += `<path d="M${x - a + 10} ${y - f + 6} L${x - 8} ${y + 22 - f}" stroke="#5aa8d8" stroke-width="9" stroke-dasharray="10 8"/>`;
        g += `<path d="M${x + 8} ${y + 22 - f} L${x + a - 10} ${y - f + 6}" stroke="#3f86bd" stroke-width="9" stroke-dasharray="10 8"/>`;
      }
      g += poly(dia(x, y - h, a, (TH / 2) * 0.66), color);
      break;
    }
    case 5: {
      const h = 220;
      g += shadow(x, y, 0.7) + box(x, y, 0.5, h, '#9fc6e6', '#d9eefc');
      const a = (TW / 2) * 0.5;
      const b = (TH / 2) * 0.5;
      for (let f = 18; f < h - 6; f += 16) {
        g += `<path d="M${x - a + 6} ${y - f + 3} L${x - 4} ${y + b - f - 1}" stroke="#fff" stroke-width="4" opacity=".7"/>`;
        g += `<path d="M${x + 4} ${y + b - f - 1} L${x + a - 6} ${y - f + 3}" stroke="#cfe7f8" stroke-width="4" opacity=".55"/>`;
      }
      g += poly(dia(x, y - h, a * 0.5, b * 0.5), color) + `<rect x="${x - 2}" y="${y - h - 46}" width="4" height="40" fill="#1d2a44"/><circle cx="${x}" cy="${y - h - 48}" r="6" fill="${color}"/>`;
      break;
    }
  }
  return g;
}

function special(x: number, y: number, kind: string, color: string) {
  switch (kind) {
    case 'park':
      return shadow(x, y, 0.6) + tree(x - 30, y + 4, 0.7) + tree(x + 28, y - 6, 0.8) + `<ellipse cx="${x}" cy="${y + 10}" rx="26" ry="12" fill="#7ec8f0" stroke="#fff" stroke-width="4"/>`;
    case 'mall':
      return (
        shadow(x, y, 0.82) +
        box(x, y, 0.8, 46, '#ffe9f0') +
        `<path d="M${x - (TW / 2) * 0.5} ${y - 46} A ${(TW / 2) * 0.5} ${(TW / 2) * 0.42} 0 0 1 ${x + (TW / 2) * 0.5} ${y - 46}" fill="${shade(color, 0.35)}" stroke="${shade(color, -0.2)}" stroke-width="3"/>`
      );
    case 'petrol':
      return shadow(x, y, 0.7) + box(x, y, 0.3, 40, '#ffffff') + `<rect x="${x - 60}" y="${y - 80}" width="120" height="16" rx="4" fill="${color}"/><rect x="${x - 50}" y="${y - 64}" width="6" height="64" fill="#566079"/><rect x="${x + 44}" y="${y - 64}" width="6" height="64" fill="#566079"/>`;
    case 'theme':
      return (
        shadow(x, y, 0.7) +
        `<circle cx="${x}" cy="${y - 90}" r="70" fill="none" stroke="${color}" stroke-width="8"/><circle cx="${x}" cy="${y - 90}" r="8" fill="#1d2a44"/>` +
        Array.from({ length: 8 }, (_, k) => {
          const a = (k * Math.PI) / 4;
          return `<line x1="${x}" y1="${y - 90}" x2="${x + Math.cos(a) * 70}" y2="${y - 90 + Math.sin(a) * 70}" stroke="#fff" stroke-width="3"/><circle cx="${x + Math.cos(a) * 70}" cy="${y - 90 + Math.sin(a) * 70}" r="9" fill="${k % 2 ? '#ffd23f' : '#3a86ff'}"/>`;
        }).join('') +
        `<path d="M${x - 40} ${y} L${x} ${y - 90} L${x + 40} ${y}" stroke="#566079" stroke-width="7" fill="none"/>`
      );
  }
  return '';
}

function disc(x: number, y: number, kind: keyof typeof DISC_INFO) {
  const info = DISC_INFO[kind];
  const col = info.color;
  const txt = kind === 'hospital' ? '#d6342c' : '#fff';
  const label = info.label;
  const size = label.length > 3 ? 24 : label.length > 1 ? 30 : 42;
  return `<g><ellipse cx="${x}" cy="${y + 6}" rx="66" ry="33" fill="#000" opacity=".28"/>
<ellipse cx="${x}" cy="${y}" rx="66" ry="33" fill="${shade(col, -0.35)}"/>
<ellipse cx="${x}" cy="${y - 6}" rx="66" ry="33" fill="${col}" stroke="${kind === 'hospital' ? '#d6342c' : '#fff'}" stroke-width="5"/>
<ellipse cx="${x - 10}" cy="${y - 15}" rx="36" ry="12" fill="#fff" opacity=".22"/>
<text x="${x}" y="${y + size * 0.3}" text-anchor="middle" class="disc-label" font-size="${size}" fill="${txt}" transform="matrix(1,0,0,.8,0,${(y - 6) * 0.2})">${label}</text></g>`;
}

export function dynamicSvg(s: GameState, colors: Record<string, string>): string {
  const objs: [number, string][] = [];
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    const { x, y } = toScreen(p.i, p.j);
    const color = ps.owner ? colors[ps.owner] ?? '#888' : null;
    let g = plotOutline(x, y, color);
    if (!ps.owner) {
      g += `<g transform="translate(${x},${y - 14})"><rect x="-3" y="0" width="6" height="26" fill="#8a5a33"/><rect x="-38" y="-28" width="76" height="32" rx="8" fill="#fff" stroke="#1d2a44" stroke-width="3"/><text x="0" y="-6" text-anchor="middle" class="sign">$${p.price}</text></g>`;
    } else if (ps.special) g += special(x, y, ps.special, color!);
    else if (ps.level > 0) g += building(x, y, ps.level, color!);
    else g += `<g transform="translate(${x + 26},${y - 8})"><rect x="-2" y="-40" width="4" height="44" fill="#566079"/><path d="M2 -40 L30 -32 L2 -24 Z" fill="${color}"/></g>`;
    objs.push([p.i + p.j + 0.5, g]);
  }
  for (const r of ROADS) {
    const { x, y } = toScreen(r.i, r.j);
    let g = '';
    if (r.disc) g += disc(x, y, r.disc);
    if (s.roadblocks[r.id] !== undefined) g += `<g transform="translate(${x},${y - 6})"><rect x="-40" y="-22" width="80" height="26" rx="5" fill="#ff8c00" stroke="#1d2a44" stroke-width="3"/><path d="M-28 -22 l-10 26 M-4 -22 l-10 26 M20 -22 l-10 26" stroke="#fff" stroke-width="7"/><rect x="-36" y="4" width="6" height="16" fill="#1d2a44"/><rect x="30" y="4" width="6" height="16" fill="#1d2a44"/></g>`;
    if (s.bananas[r.id] !== undefined) g += `<g transform="translate(${x - 10},${y})"><path d="M-22 -2 q22 22 46 -10 q-6 -4 -10 -2 q-14 14 -30 2 z" fill="#ffd23f" stroke="#8a5a00" stroke-width="3"/></g>`;
    const god = s.mapGods[r.id];
    if (god) {
      const c = GODS[god.id].color;
      g += `<g class="map-god"><ellipse cx="${x}" cy="${y + 4}" rx="30" ry="12" fill="#000" opacity=".2"/><circle cx="${x}" cy="${y - 70}" r="34" fill="${c}" stroke="#fff" stroke-width="5"/><circle cx="${x}" cy="${y - 70}" r="40" fill="none" stroke="${c}" stroke-width="3" opacity=".5"/><text x="${x}" y="${y - 60}" text-anchor="middle" class="god-glyph">${GODS[god.id].good ? '★' : '☁'}</text></g>`;
    }
    if (g) objs.push([r.i + r.j + 0.2, g]);
  }
  objs.sort((a, b) => a[0] - b[0]);
  return objs.map((o) => o[1]).join('');
}
