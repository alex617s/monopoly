import { describe, expect, test } from 'vitest';
import { PLOTS, REGIONS, ROAD_CURVES, SIGN_H, signWidth } from './map';

// On screen a place is a wide oval with its price sign or building standing above it.
describe('map layout', () => {
  test('places do not overlap each other', () => {
    const close: string[] = [];
    PLOTS.forEach((a, i) =>
      PLOTS.slice(i + 1).forEach((b) => {
        if (Math.hypot((a.x - b.x) / 165, (a.y - b.y) / 130) < 1) close.push(`${a.name} / ${b.name}`);
      }),
    );
    expect(close).toEqual([]);
  });

  test('places keep off the road', () => {
    const onRoad = PLOTS.filter((p) => ROAD_CURVES.some((c) => c.pts.some(([x, y]) => Math.hypot((x - p.x) / 112, (y - p.y) / 92) < 1)));
    expect(onRoad.map((p) => p.name)).toEqual([]);
  });

  test('city signs cover no place and no road', () => {
    const bad: string[] = [];
    for (const r of REGIONS) {
      const half = signWidth(r.capital ? `★ ${r.name}` : r.name) / 2;
      const { x, y } = r.label;
      for (const p of PLOTS) if (!(x + half < p.x - 80 || x - half > p.x + 80 || y < p.y - 130 || y - SIGN_H > p.y + 46)) bad.push(`${r.name} covers ${p.name}`);
      if (ROAD_CURVES.some((c) => c.pts.some(([qx, qy]) => Math.abs(qx - x) < half + 30 && qy > y - SIGN_H - 35 && qy < y + 35))) bad.push(`${r.name} is on the road`);
    }
    expect(bad).toEqual([]);
  });
});
