import { createRng } from "./rng";

export interface RandomPoint {
  x: number;
  y: number;
}

export interface RandomLayout {
  rows: number;
  cols: number;
  polygons: RandomPoint[][];
  neighbours: number[][];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const layoutCache = new Map<string, RandomLayout>();

function layoutKey(rows: number, cols: number, seed: number): string {
  return `${rows}x${cols}:${seed}`;
}

function clipPolygonHalfPlane(
  polygon: RandomPoint[],
  a: number,
  b: number,
  c: number,
): RandomPoint[] {
  if (polygon.length === 0) return polygon;
  const out: RandomPoint[] = [];
  const eps = 1e-9;

  for (let i = 0; i < polygon.length; i++) {
    const s = polygon[i];
    const e = polygon[(i + 1) % polygon.length];
    const ds = a * s.x + b * s.y - c;
    const de = a * e.x + b * e.y - c;
    const sInside = ds <= eps;
    const eInside = de <= eps;

    if (sInside && eInside) {
      out.push(e);
      continue;
    }

    if (sInside !== eInside) {
      const denom = ds - de;
      if (Math.abs(denom) > eps) {
        const t = ds / denom;
        out.push({
          x: s.x + (e.x - s.x) * t,
          y: s.y + (e.y - s.y) * t,
        });
      }
    }

    if (!sInside && eInside) out.push(e);
  }

  return out;
}

function pointSegmentDistanceSq(p: RandomPoint, a: RandomPoint, b: RandomPoint): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq <= 1e-12) {
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    return dx * dx + dy * dy;
  }
  let t = (apx * abx + apy * aby) / abLenSq;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  const qx = a.x + abx * t;
  const qy = a.y + aby * t;
  const dx = p.x - qx;
  const dy = p.y - qy;
  return dx * dx + dy * dy;
}

function polygonsTouch(a: RandomPoint[], b: RandomPoint[]): boolean {
  const epsSq = 1e-6;

  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    for (let j = 0; j < b.length; j++) {
      const q0 = b[j];
      const q1 = b[(j + 1) % b.length];
      if (pointSegmentDistanceSq(p, q0, q1) <= epsSq) return true;
    }
  }
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    for (let j = 0; j < a.length; j++) {
      const q0 = a[j];
      const q1 = a[(j + 1) % a.length];
      if (pointSegmentDistanceSq(p, q0, q1) <= epsSq) return true;
    }
  }
  return false;
}

function generateSites(rows: number, cols: number, seed: number): RandomPoint[] {
  const rng = createRng(seed ^ 0x9e3779b9);
  const pts: RandomPoint[] = [];
  const jitterX = 1.15;
  const jitterY = 1.05;
  const waveAmpX = 0.24;
  const waveAmpY = 0.22;
  const shearAmp = 0.12;
  const edgePad = 0.06;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const baseX = c + 0.5;
      const baseY = r + 0.5;
      const waveX =
        Math.sin((r + seed * 0.001) * 0.85 + c * 0.41) * waveAmpX +
        Math.sin((r + c) * 0.29 + seed * 0.0007) * (waveAmpX * 0.45);
      const waveY =
        Math.cos((c - seed * 0.0013) * 0.79 + r * 0.36) * waveAmpY +
        Math.cos((r - c) * 0.33 - seed * 0.0009) * (waveAmpY * 0.45);
      const randX = (rng() - 0.5) * jitterX;
      const randY = (rng() - 0.5) * jitterY;
      const shearX = (rng() - 0.5) * shearAmp + (baseY / Math.max(1, rows) - 0.5) * shearAmp;
      const shearY = (rng() - 0.5) * shearAmp + (baseX / Math.max(1, cols) - 0.5) * shearAmp;
      const x = Math.min(cols - edgePad, Math.max(edgePad, baseX + waveX + randX + shearX));
      const y = Math.min(rows - edgePad, Math.max(edgePad, baseY + waveY + randY + shearY));
      pts.push({ x, y });
    }
  }

  return pts;
}

function buildLocalCompetitorLists(sites: RandomPoint[]): number[][] {
  const n = sites.length;
  const competitors: number[][] = new Array(n);
  const localAxis = 3.5;
  const minLocal = 14;
  const fallbackCount = 28;

  for (let i = 0; i < n; i++) {
    const s = sites[i];
    const nearby: number[] = [];
    const allDist: Array<{ j: number; d2: number }> = [];

    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const t = sites[j];
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      const d2 = dx * dx + dy * dy;
      if (adx <= localAxis && ady <= localAxis) nearby.push(j);
      allDist.push({ j, d2 });
    }

    if (nearby.length >= minLocal) {
      competitors[i] = nearby;
      continue;
    }

    allDist.sort((a, b) => a.d2 - b.d2);
    competitors[i] = allDist.slice(0, fallbackCount).map((x) => x.j);
  }

  return competitors;
}

export function buildRandomLayout(rows: number, cols: number, seed: number): RandomLayout {
  const key = layoutKey(rows, cols, seed);
  const cached = layoutCache.get(key);
  if (cached) return cached;

  const n = Math.max(1, rows * cols);
  const sites = generateSites(rows, cols, seed);
  const competitors = buildLocalCompetitorLists(sites);
  const bounds: RandomPoint[] = [
    { x: 0, y: 0 },
    { x: cols, y: 0 },
    { x: cols, y: rows },
    { x: 0, y: rows },
  ];

  const polygons: RandomPoint[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const si = sites[i];
    let poly = bounds.slice();
    for (const j of competitors[i]) {
      const sj = sites[j];
      const a = 2 * (sj.x - si.x);
      const b = 2 * (sj.y - si.y);
      const c = sj.x * sj.x + sj.y * sj.y - (si.x * si.x + si.y * si.y);
      poly = clipPolygonHalfPlane(poly, a, b, c);
      if (poly.length === 0) break;
    }
    polygons[i] = poly.length > 0 ? poly : [{ x: si.x, y: si.y }];
  }

  const neighbours: number[][] = Array.from({ length: n }, () => []);
  const maxTouchDistSq = 12.25;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = sites[j].x - sites[i].x;
      const dy = sites[j].y - sites[i].y;
      if (dx * dx + dy * dy > maxTouchDistSq) continue;
      if (!polygonsTouch(polygons[i], polygons[j])) continue;
      neighbours[i].push(j);
      neighbours[j].push(i);
    }
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const poly of polygons) {
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  const layout: RandomLayout = {
    rows,
    cols,
    polygons,
    neighbours,
    minX,
    minY,
    maxX,
    maxY,
  };
  layoutCache.set(key, layout);
  return layout;
}
