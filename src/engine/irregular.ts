import { createRng } from "./rng";

export interface IrregularPoint {
  x: number;
  y: number;
}

export interface IrregularLayout {
  rows: number;
  cols: number;
  polygons: IrregularPoint[][];
  neighbours: number[][];
  neighboursEdge: number[][];
  neighboursAll: number[][];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const layoutCache = new Map<string, IrregularLayout>();

function layoutKey(rows: number, cols: number, seed: number): string {
  return `${rows}x${cols}:${seed}`;
}

function rectArea(r: Rect): number {
  return Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
}

function overlapLen(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function generateRects(rows: number, cols: number, seed: number): Rect[] {
  const target = Math.max(1, rows * cols);
  const rng = createRng(seed);
  const rects: Rect[] = [{ x0: 0, y0: 0, x1: cols, y1: rows }];

  while (rects.length < target) {
    let bestIdx = 0;
    let bestArea = -1;
    for (let i = 0; i < rects.length; i++) {
      const a = rectArea(rects[i]) * (0.8 + rng() * 0.4);
      if (a > bestArea) {
        bestArea = a;
        bestIdx = i;
      }
    }

    const rect = rects[bestIdx];
    const w = rect.x1 - rect.x0;
    const h = rect.y1 - rect.y0;
    if (w <= 0.2 || h <= 0.2) break;

    const splitVertical = w > h * 1.2 ? true : h > w * 1.2 ? false : rng() < 0.5;
    if (splitVertical) {
      const x = rect.x0 + w * (0.3 + rng() * 0.4);
      if (x <= rect.x0 + 0.05 || x >= rect.x1 - 0.05) break;
      rects.splice(bestIdx, 1, { x0: rect.x0, y0: rect.y0, x1: x, y1: rect.y1 }, { x0: x, y0: rect.y0, x1: rect.x1, y1: rect.y1 });
    } else {
      const y = rect.y0 + h * (0.3 + rng() * 0.4);
      if (y <= rect.y0 + 0.05 || y >= rect.y1 - 0.05) break;
      rects.splice(bestIdx, 1, { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: y }, { x0: rect.x0, y0: y, x1: rect.x1, y1: rect.y1 });
    }
  }

  rects.sort((a, b) => {
    const acy = (a.y0 + a.y1) * 0.5;
    const bcy = (b.y0 + b.y1) * 0.5;
    if (acy !== bcy) return acy - bcy;
    const acx = (a.x0 + a.x1) * 0.5;
    const bcx = (b.x0 + b.x1) * 0.5;
    return acx - bcx;
  });

  if (rects.length > target) return rects.slice(0, target);
  while (rects.length < target) rects.push(rects[rects.length - 1]);
  return rects;
}

export function buildIrregularLayout(rows: number, cols: number, seed: number): IrregularLayout {
  const key = layoutKey(rows, cols, seed);
  const cached = layoutCache.get(key);
  if (cached) return cached;

  const rects = generateRects(rows, cols, seed);
  const neighboursEdge: number[][] = Array.from({ length: rects.length }, () => []);
  const neighboursAll: number[][] = Array.from({ length: rects.length }, () => []);
  const eps = 1e-6;

  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const shareVertical =
        (Math.abs(a.x1 - b.x0) < eps || Math.abs(b.x1 - a.x0) < eps) &&
        overlapLen(a.y0, a.y1, b.y0, b.y1) > 1e-4;
      const shareHorizontal =
        (Math.abs(a.y1 - b.y0) < eps || Math.abs(b.y1 - a.y0) < eps) &&
        overlapLen(a.x0, a.x1, b.x0, b.x1) > 1e-4;
      const shareCorner =
        (Math.abs(a.x1 - b.x0) < eps || Math.abs(b.x1 - a.x0) < eps) &&
        (Math.abs(a.y1 - b.y0) < eps || Math.abs(b.y1 - a.y0) < eps);
      const edge = shareVertical || shareHorizontal;
      const any = edge || shareCorner;
      if (edge) {
        neighboursEdge[i].push(j);
        neighboursEdge[j].push(i);
      }
      if (any) {
        neighboursAll[i].push(j);
        neighboursAll[j].push(i);
      }
    }
  }

  const polygons: IrregularPoint[][] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const r of rects) {
    const poly = [
      { x: r.x0, y: r.y0 },
      { x: r.x1, y: r.y0 },
      { x: r.x1, y: r.y1 },
      { x: r.x0, y: r.y1 },
    ];
    polygons.push(poly);
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  const layout: IrregularLayout = {
    rows,
    cols,
    polygons,
    neighbours: neighboursAll,
    neighboursEdge,
    neighboursAll,
    minX,
    minY,
    maxX,
    maxY,
  };
  layoutCache.set(key, layout);
  return layout;
}
