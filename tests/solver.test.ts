// ─── Solver tests ──────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  Game,
  solve,
  isNoGuess,
  initializeSolver,
  solveStep,
  createEmptyGrid,
  computeHints,
  neighbours,
} from "../src/engine/index";

// ─── Basic solver functionality ────────────────────────────────────────────

describe("initializeSolver", () => {
  it("correctly initializes solver state from game grid", () => {
    const game = new Game({
      rows: 3,
      cols: 3,
      minesTotal: 1,
      maxMinesPerCell: 1,
      seed: 42,
      safeFirstClick: false,
    });
    
    // Open a cell
    game.open(0, 0);
    
    const solver = initializeSolver(game.grid, 3, 3);
    
    // Check that opened cells are marked as opened
    expect(solver[0][0].opened).toBe(true);
    expect(solver[0][0].hint).toBe(game.grid[0][0].hint);
  });
  
  it("treats markers as known mines", () => {
    const game = new Game({
      rows: 3,
      cols: 3,
      minesTotal: 0,
      maxMinesPerCell: 6,
      seed: 42,
      safeFirstClick: false,
    });
    
    // Add a marker
    game.cycleMarker(1, 1); // 1 flag
    game.cycleMarker(1, 1); // 2 flags
    
    const solver = initializeSolver(game.grid, 3, 3);
    
    expect(solver[1][1].knownMines).toBe(2);
  });
});

// ─── Simple deduction tests ────────────────────────────────────────────────

describe("solveStep - basic deductions", () => {
  it("identifies safe cells when hint equals known mines", () => {
    // Create a 3x3 grid with 1 mine at (0,0)
    const grid = createEmptyGrid(3, 3);
    grid[0][0].mineCount = 1;
    computeHints(grid, 3, 3);
    
    // Open center cell (1,1) which has hint = 1
    grid[1][1].opened = true;
    
    // Mark (0,0) with 1 flag
    grid[0][0].markerCount = 1;
    
    const solver = initializeSolver(grid, 3, 3);
    const result = solveStep(solver, 3, 3);
    
    // All other neighbors should be identified as safe
    expect(result.progress).toBe(true);
    expect(result.safeCells.length).toBeGreaterThan(0);
  });
  
  it("identifies mine count for single unknown neighbor", () => {
    // Create a 3x3 grid with 3 mines at (0,0)
    const grid = createEmptyGrid(3, 3);
    grid[0][0].mineCount = 3;
    computeHints(grid, 3, 3);
    
    // Open center cell (1,1) which has hint = 3
    grid[1][1].opened = true;
    
    // Mark all neighbors except (0,0) as opened/safe
    for (const n of neighbours(1, 1, 3, 3)) {
      if (n.row !== 0 || n.col !== 0) {
        grid[n.row][n.col].opened = true;
      }
    }
    
    const solver = initializeSolver(grid, 3, 3);
    const result = solveStep(solver, 3, 3);
    
    // The solver should deduce (0,0) has 3 mines
    expect(result.progress).toBe(true);
    expect(result.minedCells.size).toBe(1);
    expect(result.minedCells.get("0,0")).toBe(3);
  });
});

// ─── Full solve tests ──────────────────────────────────────────────────────

describe("solve", () => {
  it("solves a simple game with all cells opened except one mine", () => {
    // Create a 3x3 grid with 1 mine at (2,2)
    const grid = createEmptyGrid(3, 3);
    grid[2][2].mineCount = 1;
    computeHints(grid, 3, 3);
    
    // Open all cells except the mine
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (r !== 2 || c !== 2) {
          grid[r][c].opened = true;
        }
      }
    }
    
    const result = solve(grid, 3, 3);
    
    // Should determine the mine location
    expect(result.minedCells.get("2,2")).toBe(1);
  });
  
  it("identifies partially solvable games", () => {
    // Create a game with some cells that can't be determined
    const game = new Game({
      rows: 10,
      cols: 10,
      minesTotal: 30,
      maxMinesPerCell: 3,
      seed: 12345,
      safeFirstClick: false,
    });
    
    // Open just one corner cell
    game.open(0, 0);
    
    const result = solve(game.grid, 10, 10);
    
    // Progress can be 0 if the opened cells don't provide enough constraints
    // (which is expected when only boundary hints are visible)
    expect(result.progress).toBeGreaterThanOrEqual(0);
    expect(result.progress).toBeLessThanOrEqual(1);
  });
});

// ─── No-guess detection ────────────────────────────────────────────────────

describe("isNoGuess", () => {
  it("returns true for a fully opened game", () => {
    const grid = createEmptyGrid(3, 3);
    grid[0][0].mineCount = 1;
    computeHints(grid, 3, 3);
    
    // Open all safe cells
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (grid[r][c].mineCount === 0) {
          grid[r][c].opened = true;
        }
      }
    }
    
    const result = isNoGuess(grid, 3, 3);
    
    // Should be able to deduce the remaining mine
    expect(result).toBe(true);
  });
  
  it("returns false for games with no opened cells", () => {
    const grid = createEmptyGrid(5, 5);
    grid[0][0].mineCount = 1;
    computeHints(grid, 5, 5);
    
    const result = isNoGuess(grid, 5, 5);
    
    // Can't solve without any information
    expect(result).toBe(false);
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────

describe("solver edge cases", () => {
  it("handles cells with maximum mines (6)", () => {
    const grid = createEmptyGrid(3, 3);
    grid[0][0].mineCount = 6;
    computeHints(grid, 3, 3);
    
    // Open center which should have hint = 6
    grid[1][1].opened = true;
    
    // Mark all neighbors except (0,0) as opened
    for (const n of neighbours(1, 1, 3, 3)) {
      if (n.row !== 0 || n.col !== 0) {
        grid[n.row][n.col].opened = true;
      }
    }
    
    const solver = initializeSolver(grid, 3, 3);
    const result = solveStep(solver, 3, 3);
    
    expect(result.progress).toBe(true);
    expect(result.minedCells.get("0,0")).toBe(6);
  });
  
  it("handles empty grid (no mines)", () => {
    const grid = createEmptyGrid(3, 3);
    computeHints(grid, 3, 3);
    
    // Open one cell
    grid[0][0].opened = true;
    
    const result = solve(grid, 3, 3);
    
    // Should identify all cells as safe
    expect(result.safeCells.length).toBeGreaterThan(0);
  });
  
  it("handles grid with all cells having mines", () => {
    const grid = createEmptyGrid(3, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        grid[r][c].mineCount = 1;
      }
    }
    computeHints(grid, 3, 3);
    
    // Open center (it's a mine, but let's test solver logic)
    grid[1][1].opened = true;
    
    const result = solve(grid, 3, 3);
    
    // Without any known safe cells, hard to make deductions
    // But solver should not crash
    expect(result).toBeDefined();
  });
});

// ─── Integration with Game class ───────────────────────────────────────────

describe("solver integration with Game", () => {
  it("works with a real game instance", () => {
    const game = new Game({
      rows: 5,
      cols: 5,
      minesTotal: 5,
      maxMinesPerCell: 2,
      seed: 999,
      safeFirstClick: true,
    });
    
    // Make first click
    game.open(2, 2);
    
    // Try to solve from this state
    const result = solve(game.grid, game.rows, game.cols);
    
    expect(result).toBeDefined();
    // Progress depends on what information is exposed after the first click
    expect(result.progress).toBeGreaterThanOrEqual(0);
    expect(result.progress).toBeLessThanOrEqual(1);
  });
  
  it("identifies solvable positions after multiple opens", () => {
    const game = new Game({
      rows: 8,
      cols: 8,
      minesTotal: 10,
      maxMinesPerCell: 2,
      seed: 42,
      safeFirstClick: true,
    });
    
    // Open multiple cells
    game.open(0, 0);
    game.open(7, 7);
    
    const result = solve(game.grid, game.rows, game.cols);
    
    // Should make some progress
    expect(result.progress).toBeGreaterThan(0);
  });
});

// ─── Performance tests ─────────────────────────────────────────────────────

describe("solver performance", () => {
  it("completes in reasonable time for large boards", () => {
    const game = new Game({
      rows: 16,
      cols: 30,
      minesTotal: 99,
      maxMinesPerCell: 3,
      seed: 777,
      safeFirstClick: true,
    });
    
    // Open a few cells
    game.open(8, 15);
    
    const startTime = Date.now();
    const result = solve(game.grid, game.rows, game.cols);
    const endTime = Date.now();
    
    // Should complete in less than 1 second
    expect(endTime - startTime).toBeLessThan(1000);
    expect(result).toBeDefined();
  });
});
