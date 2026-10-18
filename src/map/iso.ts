// Isometric projection: grid cell (i, j) → pixel position in the world image.

export const TW = 176;
export const TH = 88;

export const GRID = { iMin: -6, iMax: 16, jMin: -6, jMax: 13 };

export const OX = (GRID.jMax - GRID.iMin) * (TW / 2) + 40;
export const OY = -(GRID.iMin + GRID.jMin) * (TH / 2) + 160;
export const WORLD_W = (GRID.iMax - GRID.iMin + GRID.jMax - GRID.jMin) * (TW / 2) + 80;
export const WORLD_H = (GRID.iMax + GRID.jMax - GRID.iMin - GRID.jMin) * (TH / 2) + 260;

export function toScreen(i: number, j: number) {
  return { x: OX + ((i - j) * TW) / 2, y: OY + ((i + j) * TH) / 2 };
}
