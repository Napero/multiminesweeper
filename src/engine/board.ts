import { Cell, GameConfig, Pos } from "./types";
import { createRng } from "./rng";

interface Bucket {
  items: Pos[];
  indexByKey: Map<string, number>;
}

function posKey(pos: Pos): string {
  return `${pos.row},${pos.col}`;
}

function addToBucket(bucket: Bucket, pos: Pos): void {
  const key = posKey(pos);
  if (bucket.indexByKey.has(key)) return;
  bucket.indexByKey.set(key, bucket.items.length);
  bucket.items.push(pos);
}

function removeFromBucket(bucket: Bucket, pos: Pos): void {
  const key = posKey(pos);
  const idx = bucket.indexByKey.get(key);
  if (idx === undefined) return;

  const lastIndex = bucket.items.length - 1;
  const last = bucket.items[lastIndex];
  bucket.items[idx] = last;
  bucket.indexByKey.set(posKey(last), idx);
  bucket.items.pop();
  bucket.indexByKey.delete(key);
}

function pickRandomFromBucket(bucket: Bucket, rng: () => number): Pos {
  return bucket.items[Math.floor(rng() * bucket.items.length)];
}

export function neighbours(row: number, col: number, rows: number, cols: number): Pos[] {
  const result: Pos[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        result.push({ row: r, col: c });
      }
    }
  }
  return result;
}

export function createEmptyGrid(rows: number, cols: number): Cell[][] {
  const grid: Cell[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < cols; c++) {
      row.push({ mineCount: 0, opened: false, markerCount: 0, hint: 0, adjacentMines: false });
    }
    grid.push(row);
  }
  return grid;
}

// Distribute mines with density-controlled clumping.
// For each mine: with probability `density`, try to stack onto a cell
// that already has mines (clumping). Otherwise prefer an empty cell (spreading).
// density=0 → mines spread across as many cells as possible
// density=1 → mines pile up into fewer cells (more 4/5/6 stacks)
export function placeMines(
  grid: Cell[][],
  config: GameConfig,
  excludePositions: Pos[] = [],
): Cell[][] {
  const { rows, cols, minesTotal, maxMinesPerCell, seed } = config;
  const density = Math.max(0, Math.min(1, config.density ?? 0.5));
  const rng = createRng(seed);

  const excludeSet = new Set(excludePositions.map((p) => posKey(p)));

  const eligible: Pos[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = { row: r, col: c };
      if (!excludeSet.has(posKey(p))) eligible.push(p);
    }
  }

  // Track cells by state for O(1) random picks
  const empty: Bucket = { items: [], indexByKey: new Map() };    // mineCount === 0
  const partial: Bucket = { items: [], indexByKey: new Map() };  // 0 < mineCount < max
  for (const p of eligible) addToBucket(empty, p);

  // Place positive mines
  let placed = 0;
  while (placed < minesTotal) {
    let target: Pos | null = null;

    if (rng() < density && partial.items.length > 0) {
      // Clump: stack onto a cell that already has mines
      target = pickRandomFromBucket(partial, rng);
    } else if (empty.items.length > 0) {
      // Spread: pick an empty cell
      target = pickRandomFromBucket(empty, rng);
    } else if (partial.items.length > 0) {
      // No empty cells left, stack
      target = pickRandomFromBucket(partial, rng);
    } else {
      break; // all cells full
    }

    const cell = grid[target.row][target.col];
    cell.mineCount++;
    placed++;

    if (cell.mineCount === 1) {
      // Was in empty, move to partial
      removeFromBucket(empty, target);
      addToBucket(partial, target);
    } else if (cell.mineCount >= maxMinesPerCell) {
      // Full, remove from partial
      removeFromBucket(partial, target);
    }
  }

  // Place negative mines (if enabled)
  if (config.negativeMines) {
    // Re-collect eligible cells for negative placement
    // Negative mines go on cells that currently have mineCount === 0
    const negEligible: Pos[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = { row: r, col: c };
        if (!excludeSet.has(posKey(p)) && grid[r][c].mineCount === 0) {
          negEligible.push({ row: r, col: c });
        }
      }
    }

    const negEmpty: Bucket = { items: [], indexByKey: new Map() };       // mineCount === 0
    const negPartial: Bucket = { items: [], indexByKey: new Map() };     // -max < mineCount < 0
    for (const p of negEligible) addToBucket(negEmpty, p);

    // Negative mine count: proportional to positive mines
    // Roughly 30% of minesTotal as negative mines, capped by available cells
    const negTotal = Math.min(
      Math.floor(minesTotal * 0.3),
      negEligible.length * maxMinesPerCell,
    );

    let negPlaced = 0;
    while (negPlaced < negTotal) {
      let target: Pos | null = null;

      if (rng() < density && negPartial.items.length > 0) {
        target = pickRandomFromBucket(negPartial, rng);
      } else if (negEmpty.items.length > 0) {
        target = pickRandomFromBucket(negEmpty, rng);
      } else if (negPartial.items.length > 0) {
        target = pickRandomFromBucket(negPartial, rng);
      } else {
        break;
      }

      const cell = grid[target.row][target.col];
      cell.mineCount--;
      negPlaced++;

      if (cell.mineCount === -1) {
        removeFromBucket(negEmpty, target);
        addToBucket(negPartial, target);
      } else if (cell.mineCount <= -maxMinesPerCell) {
        removeFromBucket(negPartial, target);
      }
    }
  }

  return grid;
}

// hint = sum of neighbour mineCount
export function computeHints(grid: Cell[][], rows: number, cols: number): void {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      let hasAdj = false;
      for (const n of neighbours(r, c, rows, cols)) {
        const mc = grid[n.row][n.col].mineCount;
        sum += mc;
        if (mc !== 0) hasAdj = true;
      }
      grid[r][c].hint = sum;
      grid[r][c].adjacentMines = hasAdj;
    }
  }
}
