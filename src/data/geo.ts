// The shape of Australia and the routes of the roads, in longitude / latitude.
// Everything keeps its real size and place, drawn on a gently tilted view.

export type LonLat = [number, number];
export type Pt = [number, number];

const K = 105; // pixels per degree of latitude
const COS_LAT = 0.89; // a degree of longitude is shorter this far south
const TILT = 0.88; // squash north–south a little to tilt the map away from the viewer

const LON0 = 108.5;
const LAT0 = 5.5;

/** Flat map position before the tilt, used for distances along the road. */
export function plane([lon, lat]: LonLat): Pt {
  return [(lon - LON0) * K * COS_LAT, (-lat - LAT0) * K];
}

export const PAD_TOP = 120;
/** Screen position in the world picture. */
export const tilt = ([x, y]: Pt): Pt => [x, y * TILT + PAD_TOP];
export const world = (p: LonLat): Pt => tilt(plane(p));

export const MAINLAND: LonLat[] = [
  [142.5, -10.7], [143.5, -12.5], [143.8, -14.0], [145.3, -15.0], [145.5, -16.6], [146.1, -18.0], [146.4, -19.0], [148.0, -20.0], [149.1, -21.0],
  [150.1, -22.2], [151.0, -23.6], [152.5, -24.8], [153.1, -26.0], [153.6, -28.2], [153.1, -30.5], [152.5, -32.0], [151.3, -33.8], [150.8, -35.0],
  [150.0, -36.6], [149.9, -37.6], [148.0, -37.9], [146.4, -39.0], [145.0, -38.5], [143.5, -38.8], [141.5, -38.4], [140.0, -37.6], [139.6, -36.6],
  [138.3, -35.7], [138.4, -34.6], [137.8, -35.4], [137.5, -34.0], [137.8, -32.8], [136.0, -34.6], [135.2, -34.8], [134.2, -32.8], [131.5, -31.5],
  [129.0, -31.7], [126.0, -32.3], [124.0, -33.0], [123.5, -33.9], [121.0, -33.8], [119.5, -34.4], [117.9, -35.1], [116.0, -34.8], [115.0, -34.3],
  [115.6, -33.4], [115.7, -31.8], [115.0, -30.0], [114.6, -28.5], [114.0, -26.5], [113.5, -25.0], [113.7, -24.0], [113.8, -22.2], [114.6, -21.8],
  [116.7, -20.6], [118.5, -20.3], [121.0, -19.5], [122.3, -18.0], [122.7, -16.8], [123.6, -16.3], [124.5, -15.3], [125.5, -14.5], [126.9, -13.8],
  [128.2, -14.9], [129.5, -14.9], [130.0, -13.3], [130.8, -12.4], [132.0, -11.5], [132.6, -12.1], [133.5, -11.9], [135.0, -12.2], [136.7, -12.2],
  [136.0, -13.3], [135.9, -15.0], [137.5, -16.2], [139.2, -17.4], [140.8, -17.4], [141.5, -15.0], [141.6, -12.6],
];
export const TASMANIA: LonLat[] = [[144.7, -40.7], [146.5, -41.1], [148.3, -40.9], [148.3, -42.2], [147.6, -43.2], [146.0, -43.5], [145.2, -42.3]];

// ------------------------------------------------------------------ curves

/** Points along a Catmull-Rom curve through the given points. */
export function sampleCurve(points: Pt[], closed: boolean, per = 24): Pt[] {
  const n = points.length;
  const at = (i: number) => (closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
  const out: Pt[] = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let s = 0; s < per; s++) {
      const t = s / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(points[n - 1]);
  return out;
}

/** SVG path through the points, smooth. */
export function smoothPath(points: Pt[], closed: boolean, tension = 1): string {
  const n = points.length;
  const at = (i: number) => (closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
  const r = (v: number) => v.toFixed(1);
  let d = `M${r(points[0][0])} ${r(points[0][1])}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + ((p2[0] - p0[0]) * tension) / 6, p1[1] + ((p2[1] - p0[1]) * tension) / 6];
    const c2 = [p2[0] - ((p3[0] - p1[0]) * tension) / 6, p2[1] - ((p3[1] - p1[1]) * tension) / 6];
    d += ` C${r(c1[0])} ${r(c1[1])} ${r(c2[0])} ${r(c2[1])} ${r(p2[0])} ${r(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

/** Cumulative lengths along a polyline. */
export function lengths(poly: Pt[], closed: boolean) {
  const L = [0];
  const m = closed ? poly.length : poly.length - 1;
  for (let i = 0; i < m; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    L.push(L[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return L;
}

/** The point at a distance along a polyline, with the direction of travel. */
export function pointAt(poly: Pt[], L: number[], dist: number): { p: Pt; dir: Pt } {
  let i = 0;
  while (i < L.length - 2 && L[i + 1] < dist) i++;
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  const len = L[i + 1] - L[i] || 1;
  const t = Math.max(0, Math.min(1, (dist - L[i]) / len));
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], dir: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] };
}

export function inside(pt: Pt, poly: Pt[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export const MAINLAND_PLANE = MAINLAND.map(plane);
export const TASMANIA_PLANE = TASMANIA.map(plane);

const all = [...MAINLAND_PLANE, ...TASMANIA_PLANE].map(tilt);
const MARGIN = 420;
const minX = Math.min(...all.map((p) => p[0])) - MARGIN * 2;
const maxX = Math.max(...all.map((p) => p[0])) + MARGIN * 2;
const minY = Math.min(...all.map((p) => p[1])) - MARGIN;
const maxY = Math.max(...all.map((p) => p[1])) + MARGIN;
/** Shift so the world picture starts at 0,0. */
export const OFFSET: Pt = [-minX, -minY];
export const WORLD_W = Math.round(maxX - minX);
export const WORLD_H = Math.round(maxY - minY);
/** Final position in the world picture. */
export const toWorld = (p: Pt): Pt => {
  const [x, y] = tilt(p);
  return [Math.round((x + OFFSET[0]) * 10) / 10, Math.round((y + OFFSET[1]) * 10) / 10];
};
/** Back from the world picture to the flat map. */
export const fromWorld = ([x, y]: Pt): Pt => [x - OFFSET[0], (y - OFFSET[1] - PAD_TOP) / TILT];
export const lonLatToWorld = (p: LonLat): Pt => toWorld(plane(p));
