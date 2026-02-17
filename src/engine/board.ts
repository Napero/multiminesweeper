import { Cell, GameConfig, GridShape, Pos, TopologyMode } from "./types";
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
  return neighboursForGrid(row, col, rows, cols, "plane", "square");
}

function wrap(v: number, size: number): number {
  return ((v % size) + size) % size;
}

function normalizeForTopology(
  row: number,
  col: number,
  rows: number,
  cols: number,
  topology: TopologyMode,
): Pos | null {
  if (rows <= 0 || cols <= 0) return null;

  switch (topology) {
    case "plane": {
      if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
      return { row, col };
    }
    case "cylinder": {
      if (row < 0 || row >= rows) return null;
      return { row, col: wrap(col, cols) };
    }
    case "torus": {
      return { row: wrap(row, rows), col: wrap(col, cols) };
    }
    case "mobius": {
      let r = row;
      let c = col;
      if (c < 0) {
        c += cols;
        r = rows - 1 - r;
      } else if (c >= cols) {
        c -= cols;
        r = rows - 1 - r;
      }
      if (r < 0 || r >= rows) return null;
      return { row: r, col: c };
    }
    case "klein": {
      let r = row;
      let c = col;
      if (r < 0) {
        r += rows;
        c = cols - 1 - c;
      } else if (r >= rows) {
        r -= rows;
        c = cols - 1 - c;
      }
      c = wrap(c, cols);
      return { row: r, col: c };
    }
    case "projective": {
      let r = row;
      let c = col;
      if (c < 0) {
        c += cols;
        r = rows - 1 - r;
      } else if (c >= cols) {
        c -= cols;
        r = rows - 1 - r;
      }
      if (r < 0) {
        r += rows;
        c = cols - 1 - c;
      } else if (r >= rows) {
        r -= rows;
        c = cols - 1 - c;
      }
      c = wrap(c, cols);
      return { row: r, col: c };
    }
  }
}

export function neighboursForTopology(
  row: number,
  col: number,
  rows: number,
  cols: number,
  topology: TopologyMode,
): Pos[] {
  return neighboursForGrid(row, col, rows, cols, topology, "square");
}

function shapeNeighbourDeltas(row: number, col: number, shape: GridShape): Array<{ dr: number; dc: number }> {
  if (shape === "square") {
    const deltas: Array<{ dr: number; dc: number }> = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        deltas.push({ dr, dc });
      }
    }
    return deltas;
  }

  if (shape === "hex") {
    // Flat-top hexes using odd-r offset coordinates (staggered rows).
    // Even rows are shifted left relative to odd rows.
    const oddRow = row % 2 !== 0;
    return oddRow
      ? [
          { dr: 0, dc: -1 },
          { dr: 0, dc: 1 },
          { dr: -1, dc: 0 },
          { dr: -1, dc: 1 },
          { dr: 1, dc: 0 },
          { dr: 1, dc: 1 },
        ]
      : [
          { dr: 0, dc: -1 },
          { dr: 0, dc: 1 },
          { dr: -1, dc: -1 },
          { dr: -1, dc: 0 },
          { dr: 1, dc: -1 },
          { dr: 1, dc: 0 },
        ];
  }

  const pointsUp = (row + col) % 2 === 0;
  return pointsUp
    ? [
        { dr: 0, dc: -1 },
        { dr: 0, dc: 1 },
        { dr: 1, dc: 0 },
      ]
    : [
        { dr: 0, dc: -1 },
        { dr: 0, dc: 1 },
        { dr: -1, dc: 0 },
      ];
}

export function neighboursForGrid(
  row: number,
  col: number,
  rows: number,
  cols: number,
  topology: TopologyMode,
  shape: GridShape,
): Pos[] {
  const result: Pos[] = [];
  const seen = new Set<string>();
  for (const { dr, dc } of shapeNeighbourDeltas(row, col, shape)) {
    const normalized = normalizeForTopology(row + dr, col + dc, rows, cols, topology);
    if (!normalized) continue;
    const key = posKey(normalized);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
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
  const maxMinesPerCellCapped = Math.max(1, Math.min(6, maxMinesPerCell));
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
      if (cell.mineCount >= maxMinesPerCellCapped) {
        // Already full (maxMinesPerCell === 1), don't add to partial
      } else {
        addToBucket(partial, target);
      }
    } else if (cell.mineCount >= maxMinesPerCellCapped) {
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
      negEligible.length * maxMinesPerCellCapped,
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
        if (cell.mineCount <= -maxMinesPerCellCapped) {
          // Already full (maxMinesPerCell === 1), don't add to partial
        } else {
          addToBucket(negPartial, target);
        }
      } else if (cell.mineCount <= -maxMinesPerCellCapped) {
        removeFromBucket(negPartial, target);
      }
    }
  }

  return grid;
}

// hint = sum of neighbour mineCount
export function computeHints(
  grid: Cell[][],
  rows: number,
  cols: number,
  topology: TopologyMode = "plane",
  shape: GridShape = "square",
): void {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      let hasAdj = false;
      for (const n of neighboursForGrid(r, c, rows, cols, topology, shape)) {
        const mc = grid[n.row][n.col].mineCount;
        sum += mc;
        if (mc !== 0) hasAdj = true;
      }
      grid[r][c].hint = sum;
      grid[r][c].adjacentMines = hasAdj;
    }
  }
}
