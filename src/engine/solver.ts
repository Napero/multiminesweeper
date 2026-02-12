import { Cell, Pos } from "./types";
import { neighbours } from "./board";

/**
 * Multi-Minesweeper Logic Solver
 * 
 * This solver uses pure logical deduction to determine which cells can be
 * safely opened or flagged without guessing. It's used to verify that a
 * generated game is solvable using logic alone (no-guess property).
 * 
 * Key Concepts:
 * - Each cell can contain 0-6 mines
 * - Opened cells show a "hint": the sum of mines in all 8 neighbors (0-48)
 * - We track what we know: opened cells (with hints), flagged cells, and unknowns
 * - We apply constraint-based reasoning to deduce new information
 */

/**
 * Cell state from the solver's perspective
 */
export interface SolverCell {
  opened: boolean;      // Is this cell opened?
  hint: number | null;  // If opened, what's the hint value?
  knownMines: number;   // How many mines we know are here (0-6)
  isSafe: boolean;      // Have we deduced this cell is mine-free?
}

/**
 * Result of a solver step
 */
export interface SolverStep {
  safeCells: Pos[];      // Cells we deduced are safe to open
  minedCells: Map<string, number>; // Cells with known mine counts: "row,col" -> mineCount
  progress: boolean;     // Did we make any progress?
}

/**
 * Solver result
 */
export interface SolverResult {
  solvable: boolean;     // Can we solve without guessing?
  progress: number;      // How many cells did we figure out? (0-100%)
  safeCells: Pos[];      // All cells we determined are safe
  minedCells: Map<string, number>; // All cells with known mine counts
}

/**
 * Initialize solver state from game grid
 */
export function initializeSolver(
  grid: Cell[][],
  rows: number,
  cols: number
): SolverCell[][] {
  const solver: SolverCell[][] = [];
  
  for (let r = 0; r < rows; r++) {
    const row: SolverCell[] = [];
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      row.push({
        opened: cell.opened,
        hint: cell.opened ? cell.hint : null,
        // If a cell has markers, we treat those as known mines for solving
        knownMines: cell.markerCount,
        isSafe: cell.opened && cell.mineCount === 0,
      });
    }
    solver.push(row);
  }
  
  return solver;
}

/**
 * Convert position to string key for Maps/Sets
 */
function posKey(pos: Pos): string {
  return `${pos.row},${pos.col}`;
}

/**
 * Perform one iteration of logical deduction
 * 
 * For each opened cell with a hint, we apply two main rules:
 * 
 * 1. If (hint - known_mines_in_neighbors) == 0:
 *    All unknown neighbors must be safe (0 mines)
 * 
 * 2. If (hint - known_mines_in_neighbors) == (count of unknown neighbors) * 6:
 *    All unknown neighbors must have exactly 6 mines each
 *    (This is the maximum possible constraint)
 * 
 * 3. If count of unknown neighbors == 1 and we know remaining mines:
 *    That single unknown cell must have exactly (hint - known_mines) mines
 * 
 * We iterate until no more progress can be made.
 */
export function solveStep(
  solver: SolverCell[][],
  rows: number,
  cols: number
): SolverStep {
  const safeCells: Pos[] = [];
  const minedCells = new Map<string, number>();
  
  // Check each opened cell for deductions
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = solver[r][c];
      
      // Only process opened cells (they have hints)
      if (!cell.opened || cell.hint === null) continue;
      
      const nbrs = neighbours(r, c, rows, cols);
      
      // Categorize neighbors
      const unknownNeighbors: Pos[] = [];
      let knownMinesSum = 0;
      
      for (const n of nbrs) {
        const nCell = solver[n.row][n.col];
        
        if (nCell.opened || nCell.isSafe) {
          // Already opened or known safe - contributes 0 mines
          continue;
        } else if (nCell.knownMines > 0) {
          // We know how many mines are here
          knownMinesSum += nCell.knownMines;
        } else {
          // Unknown cell
          unknownNeighbors.push(n);
        }
      }
      
      // Remaining mines to account for
      const remainingMines = cell.hint - knownMinesSum;
      
      // Rule 1: If no remaining mines, all unknowns are safe
      if (remainingMines === 0 && unknownNeighbors.length > 0) {
        for (const pos of unknownNeighbors) {
          const key = posKey(pos);
          if (!minedCells.has(key) && !safeCells.some(p => p.row === pos.row && p.col === pos.col)) {
            const nCell = solver[pos.row][pos.col];
            if (!nCell.isSafe && !nCell.opened) {
              nCell.isSafe = true;
              nCell.knownMines = 0;
              safeCells.push(pos);
            }
          }
        }
      }
      
      // Rule 2: If exactly one unknown neighbor, we can deduce its mine count
      if (unknownNeighbors.length === 1 && remainingMines > 0 && remainingMines <= 6) {
        const pos = unknownNeighbors[0];
        const key = posKey(pos);
        const nCell = solver[pos.row][pos.col];
        
        if (nCell.knownMines === 0 && !nCell.isSafe && !nCell.opened) {
          nCell.knownMines = remainingMines;
          minedCells.set(key, remainingMines);
        }
      }
      
      // Rule 3: If all remaining mines must go in unknowns with max capacity
      if (unknownNeighbors.length > 0 && remainingMines > 0) {
        const maxPossible = unknownNeighbors.length * 6;
        const minPossible = unknownNeighbors.length * 1;
        
        // If remaining mines equals max possible, all unknowns have 6 mines
        if (remainingMines === maxPossible) {
          for (const pos of unknownNeighbors) {
            const key = posKey(pos);
            const nCell = solver[pos.row][pos.col];
            if (nCell.knownMines === 0 && !nCell.isSafe && !nCell.opened) {
              nCell.knownMines = 6;
              minedCells.set(key, 6);
            }
          }
        }
        
        // If remaining mines equals min possible (each unknown has 1), mark all as having 1
        // Only if this is the ONLY way to satisfy the constraint
        if (remainingMines === minPossible && unknownNeighbors.length > 1) {
          // This is a weak inference, skip it for now
          // We'd need more sophisticated constraint solving
        }
      }
    }
  }
  
  const progress = safeCells.length > 0 || minedCells.size > 0;
  
  return { safeCells, minedCells, progress };
}

/**
 * Solve the puzzle using iterative logical deduction
 * 
 * Algorithm:
 * 1. Initialize solver state from current game state
 * 2. Repeatedly apply logical rules until no progress
 * 3. Check if all non-opened cells have been determined
 * 
 * Returns whether the puzzle is solvable without guessing, and what we deduced.
 */
export function solve(
  grid: Cell[][],
  rows: number,
  cols: number
): SolverResult {
  const solver = initializeSolver(grid, rows, cols);
  
  const allSafeCells: Pos[] = [];
  const allMinedCells = new Map<string, number>();
  
  // Keep iterating until we make no more progress
  let iterations = 0;
  const maxIterations = rows * cols; // Prevent infinite loops
  
  while (iterations < maxIterations) {
    const step = solveStep(solver, rows, cols);
    
    if (!step.progress) {
      // No more progress possible
      break;
    }
    
    // Accumulate results
    for (const pos of step.safeCells) {
      if (!allSafeCells.some(p => p.row === pos.row && p.col === pos.col)) {
        allSafeCells.push(pos);
      }
    }
    
    for (const [key, count] of step.minedCells) {
      allMinedCells.set(key, count);
    }
    
    iterations++;
  }
  
  // Calculate how many cells we determined
  let totalUnknown = 0;
  let determined = 0;
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const sCell = solver[r][c];
      
      // Count cells that were initially unknown
      if (!cell.opened) {
        totalUnknown++;
        
        // Did we determine this cell?
        if (sCell.isSafe || sCell.knownMines > 0) {
          determined++;
        }
      }
    }
  }
  
  const progressPercent = totalUnknown > 0 ? determined / totalUnknown : 1.0;
  const solvable = progressPercent === 1.0;
  
  return {
    solvable,
    progress: progressPercent,
    safeCells: allSafeCells,
    minedCells: allMinedCells,
  };
}

/**
 * Check if a game is no-guess (fully solvable with logic)
 * 
 * A game is no-guess if, starting from any opened cells, we can
 * deduce the state of all remaining cells using pure logic.
 */
export function isNoGuess(
  grid: Cell[][],
  rows: number,
  cols: number
): boolean {
  const result = solve(grid, rows, cols);
  return result.solvable;
}
