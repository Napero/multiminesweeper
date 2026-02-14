import { Cell, GameConfig, Pos } from "./types";
import { createRng, shuffle } from "./rng";

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
  const maxMinesPerCellCapped = Math.max(1, Math.min(6, maxMinesPerCell));
  const density = Math.max(0, Math.min(1, config.density ?? 0.5));
  const rng = createRng(seed);

  const excludeSet = new Set(excludePositions.map((p) => `${p.row},${p.col}`));

  const eligible: Pos[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!excludeSet.has(`${r},${c}`)) eligible.push({ row: r, col: c });
    }
  }

  // Track cells by state for O(1) random picks
  const empty: Pos[] = [];    // mineCount === 0
  const partial: Pos[] = [];  // 0 < mineCount < max
  for (const p of eligible) empty.push(p);
  shuffle(empty, rng);

  function pickRandom(arr: Pos[]): Pos {
    return arr[Math.floor(rng() * arr.length)];
  }

  function removeFromArray(arr: Pos[], pos: Pos): void {
    const idx = arr.findIndex((p) => p.row === pos.row && p.col === pos.col);
    if (idx !== -1) {
      arr[idx] = arr[arr.length - 1];
      arr.pop();
    }
  }

  // Place positive mines
  let placed = 0;
  while (placed < minesTotal) {
    let target: Pos | null = null;

    if (rng() < density && partial.length > 0) {
      // Clump: stack onto a cell that already has mines
      target = pickRandom(partial);
    } else if (empty.length > 0) {
      // Spread: pick an empty cell
      target = pickRandom(empty);
    } else if (partial.length > 0) {
      // No empty cells left, stack
      target = pickRandom(partial);
    } else {
      break; // all cells full
    }

    const cell = grid[target.row][target.col];
    cell.mineCount++;
    placed++;

    if (cell.mineCount === 1) {
      // Was in empty, move to partial
      removeFromArray(empty, target);
      partial.push(target);
    } else if (cell.mineCount >= maxMinesPerCellCapped) {
      // Full, remove from partial
      removeFromArray(partial, target);
    }
  }

  // Place negative mines (if enabled)
  if (config.negativeMines) {
    // Re-collect eligible cells for negative placement
    // Negative mines go on cells that currently have mineCount === 0
    const negEligible: Pos[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!excludeSet.has(`${r},${c}`) && grid[r][c].mineCount === 0) {
          negEligible.push({ row: r, col: c });
        }
      }
    }
    shuffle(negEligible, rng);

    const negEmpty: Pos[] = [...negEligible];      // mineCount === 0
    const negPartial: Pos[] = [];                   // -max < mineCount < 0

    // Negative mine count: proportional to positive mines
    // Roughly 30% of minesTotal as negative mines, capped by available cells
    const negTotal = Math.min(
      Math.floor(minesTotal * 0.3),
      negEligible.length * maxMinesPerCellCapped,
    );

    let negPlaced = 0;
    while (negPlaced < negTotal) {
      let target: Pos | null = null;

      if (rng() < density && negPartial.length > 0) {
        target = pickRandom(negPartial);
      } else if (negEmpty.length > 0) {
        target = pickRandom(negEmpty);
      } else if (negPartial.length > 0) {
        target = pickRandom(negPartial);
      } else {
        break;
      }

      const cell = grid[target.row][target.col];
      cell.mineCount--;
      negPlaced++;

      if (cell.mineCount === -1) {
        removeFromArray(negEmpty, target);
        negPartial.push(target);
      } else if (cell.mineCount <= -maxMinesPerCellCapped) {
        removeFromArray(negPartial, target);
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
