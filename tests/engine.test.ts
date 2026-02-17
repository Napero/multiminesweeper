// ─── Engine tests ───────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  Game,
  GameStatus,
  createRng,
  neighbours,
  createEmptyGrid,
  placeMines,
  computeHints,
  neighboursForTopology,
  neighboursForGrid,
} from "../src/engine/index";

// ─── RNG determinism ────────────────────────────────────────────────────────

describe("createRng", () => {
  it("produces deterministic sequences", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it("different seeds give different sequences", () => {
    const a = createRng(1);
    const b = createRng(2);
    // Very unlikely they'd all match
    let same = true;
    for (let i = 0; i < 20; i++) {
      if (a() !== b()) same = false;
    }
    expect(same).toBe(false);
  });
});

// ─── Neighbours ─────────────────────────────────────────────────────────────

describe("neighbours", () => {
  it("returns 8 neighbours for a centre cell", () => {
    expect(neighbours(5, 5, 10, 10)).toHaveLength(8);
  });

  it("returns 3 neighbours for a corner cell", () => {
    expect(neighbours(0, 0, 10, 10)).toHaveLength(3);
  });

  it("returns 5 neighbours for an edge cell", () => {
    expect(neighbours(0, 5, 10, 10)).toHaveLength(5);
  });

  it("torus wraps around both axes", () => {
    const n = neighboursForTopology(0, 0, 4, 4, "torus");
    expect(n).toHaveLength(8);
    expect(n.some((p) => p.row === 3 && p.col === 3)).toBe(true);
  });

  it("cylinder wraps horizontally only", () => {
    const n = neighboursForTopology(0, 0, 4, 4, "cylinder");
    expect(n.some((p) => p.row === 0 && p.col === 3)).toBe(true);
    expect(n.some((p) => p.row === 3 && p.col === 0)).toBe(false);
  });

  it("hex grid has 6 neighbors for an interior cell", () => {
    const n = neighboursForGrid(2, 2, 6, 6, "plane", "hex");
    expect(n).toHaveLength(6);
  });

  it("hex grid corner cell has 2-3 neighbors", () => {
    const n = neighboursForGrid(0, 0, 6, 6, "plane", "hex");
    expect(n.length).toBeGreaterThanOrEqual(2);
    expect(n.length).toBeLessThanOrEqual(3);
  });

  it("hex grid edge cell has fewer than 6 neighbors", () => {
    const n = neighboursForGrid(0, 3, 6, 6, "plane", "hex");
    expect(n.length).toBeLessThan(6);
    expect(n.length).toBeGreaterThanOrEqual(3);
  });

  it("hex neighbors are all unique", () => {
    const n = neighboursForGrid(3, 3, 8, 8, "plane", "hex");
    const keys = n.map((p) => `${p.row},${p.col}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("hex neighbors never include the cell itself", () => {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        const n = neighboursForGrid(r, c, 6, 6, "plane", "hex");
        expect(n.some((p) => p.row === r && p.col === c)).toBe(false);
      }
    }
  });

  it("hex even row vs odd row have correct stagger", () => {
    // Even row (row 2): neighbors at dr=-1 should include dc=-1 and dc=0
    const evenN = neighboursForGrid(2, 2, 6, 6, "plane", "hex");
    expect(evenN.some((p) => p.row === 1 && p.col === 1)).toBe(true);
    expect(evenN.some((p) => p.row === 1 && p.col === 2)).toBe(true);
    // Odd row (row 3): neighbors at dr=-1 should include dc=0 and dc=1
    const oddN = neighboursForGrid(3, 2, 6, 6, "plane", "hex");
    expect(oddN.some((p) => p.row === 2 && p.col === 2)).toBe(true);
    expect(oddN.some((p) => p.row === 2 && p.col === 3)).toBe(true);
  });

  it("triangle grid has 3 neighbors for an interior cell", () => {
    const n = neighboursForGrid(2, 2, 6, 6, "plane", "triangle");
    expect(n).toHaveLength(3);
  });

  it("triangle up vs down have correct neighbors", () => {
    // (2,2): (row+col)%2==0 → points up → neighbors: left, right, below
    const up = neighboursForGrid(2, 2, 6, 6, "plane", "triangle");
    expect(up).toHaveLength(3);
    expect(up.some((p) => p.row === 2 && p.col === 1)).toBe(true); // left
    expect(up.some((p) => p.row === 2 && p.col === 3)).toBe(true); // right
    expect(up.some((p) => p.row === 3 && p.col === 2)).toBe(true); // below
    // (2,3): (row+col)%2==1 → points down → neighbors: left, right, above
    const down = neighboursForGrid(2, 3, 6, 6, "plane", "triangle");
    expect(down).toHaveLength(3);
    expect(down.some((p) => p.row === 2 && p.col === 2)).toBe(true); // left
    expect(down.some((p) => p.row === 2 && p.col === 4)).toBe(true); // right
    expect(down.some((p) => p.row === 1 && p.col === 3)).toBe(true); // above
  });

  it("triangle corner has fewer than 3 neighbors", () => {
    const n = neighboursForGrid(0, 0, 6, 6, "plane", "triangle");
    expect(n.length).toBeLessThanOrEqual(2);
  });

  it("triangle neighbors never include the cell itself", () => {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        const n = neighboursForGrid(r, c, 6, 6, "plane", "triangle");
        expect(n.some((p) => p.row === r && p.col === c)).toBe(false);
      }
    }
  });

  it("pentagon grid has 8 neighbors for an interior cell (edge + vertex touching)", () => {
    const n = neighboursForGrid(4, 12, 10, 24, "plane", "pentagon");
    expect(n).toHaveLength(8);
  });

  it("pentagon corner has fewer than 8 neighbors", () => {
    const n = neighboursForGrid(0, 0, 10, 24, "plane", "pentagon");
    expect(n.length).toBeLessThan(8);
  });

  it("pentagon neighbors are unique and never include itself", () => {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 20; c++) {
        const n = neighboursForGrid(r, c, 8, 20, "plane", "pentagon");
        const keys = n.map((p) => `${p.row},${p.col}`);
        expect(new Set(keys).size).toBe(keys.length);
        expect(n.some((p) => p.row === r && p.col === c)).toBe(false);
      }
    }
  });

  it("irregular grid interior has variable neighbors (not fixed 8)", () => {
    const n = neighboursForGrid(3, 3, 8, 8, "plane", "irregular", 42);
    expect(n.length).toBeGreaterThanOrEqual(2);
    expect(n.length).toBeLessThanOrEqual(8);
  });

  it("irregular grid neighbors are unique and never include itself", () => {
    const n = neighboursForGrid(0, 0, 8, 8, "plane", "irregular", 42);
    const keys = n.map((p) => `${p.row},${p.col}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(n.some((p) => p.row === 0 && p.col === 0)).toBe(false);
  });

  it("hex + torus wraps correctly", () => {
    const n = neighboursForGrid(0, 0, 6, 6, "torus", "hex");
    // Should have 6 neighbors, some wrapping around
    expect(n).toHaveLength(6);
    // All neighbors should be in bounds
    for (const p of n) {
      expect(p.row).toBeGreaterThanOrEqual(0);
      expect(p.row).toBeLessThan(6);
      expect(p.col).toBeGreaterThanOrEqual(0);
      expect(p.col).toBeLessThan(6);
    }
  });

  it("hex + cylinder wraps columns only", () => {
    const n = neighboursForGrid(0, 0, 6, 6, "cylinder", "hex");
    // Should wrap on columns but not rows, so fewer than 6 at top edge
    for (const p of n) {
      expect(p.row).toBeGreaterThanOrEqual(0);
      expect(p.col).toBeGreaterThanOrEqual(0);
      expect(p.col).toBeLessThan(6);
    }
  });
});

// ─── Mine placement ─────────────────────────────────────────────────────────

describe("placeMines", () => {
  it("places the correct total number of mines", () => {
    const config = {
      rows: 10,
      cols: 10,
      minesTotal: 30,
      maxMinesPerCell: 3,
      seed: 42,
      safeFirstClick: false,
      density: 0.5,
      negativeMines: false,
      topology: "plane" as const,
      gridShape: "square" as const,
    };
    const grid = createEmptyGrid(10, 10);
    placeMines(grid, config);
    let total = 0;
    for (const row of grid) for (const cell of row) total += cell.mineCount;
    expect(total).toBe(30);
  });

  it("respects maxMinesPerCell", () => {
    const config = {
      rows: 5,
      cols: 5,
      minesTotal: 50,
      maxMinesPerCell: 4,
      seed: 123,
      safeFirstClick: false,
      density: 1,
      negativeMines: false,
      topology: "plane" as const,
      gridShape: "square" as const,
    };
    const grid = createEmptyGrid(5, 5);
    placeMines(grid, config);
    for (const row of grid) {
      for (const cell of row) {
        expect(cell.mineCount).toBeLessThanOrEqual(4);
      }
    }
  });

  it("respects maxMinesPerCell=1 (no cell exceeds 1 mine)", () => {
    for (const seed of [1, 42, 999, 7777]) {
      const config = {
        rows: 10,
        cols: 10,
        minesTotal: 30,
        maxMinesPerCell: 1,
        seed,
        safeFirstClick: false,
        density: 0.6,
        negativeMines: false,
        topology: "plane" as const,
        gridShape: "square" as const,
      };
      const grid = createEmptyGrid(10, 10);
      placeMines(grid, config);
      for (const row of grid) {
        for (const cell of row) {
          expect(cell.mineCount).toBeLessThanOrEqual(1);
          expect(cell.mineCount).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("excludes positions when specified", () => {
    const config = {
      rows: 5,
      cols: 5,
      minesTotal: 50,
      maxMinesPerCell: 6,
      seed: 99,
      safeFirstClick: false,
      density: 1,
      negativeMines: false,
      topology: "plane" as const,
      gridShape: "square" as const,
    };
    const exclude = [{ row: 2, col: 2 }, { row: 2, col: 3 }];
    const grid = createEmptyGrid(5, 5);
    placeMines(grid, config, exclude);
    expect(grid[2][2].mineCount).toBe(0);
    expect(grid[2][3].mineCount).toBe(0);
  });

  it("is deterministic for the same seed", () => {
    const config = {
      rows: 8,
      cols: 8,
      minesTotal: 20,
      maxMinesPerCell: 3,
      seed: 777,
      safeFirstClick: false,
      density: 0.5,
      negativeMines: false,
      topology: "plane" as const,
      gridShape: "square" as const,
    };
    const g1 = createEmptyGrid(8, 8);
    placeMines(g1, config);
    const g2 = createEmptyGrid(8, 8);
    placeMines(g2, config);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        expect(g1[r][c].mineCount).toBe(g2[r][c].mineCount);
      }
    }
  });
});

// ─── Hints with multiplicity ────────────────────────────────────────────────

describe("computeHints", () => {
  it("computes correct hints considering multi-mine cells", () => {
    const grid = createEmptyGrid(3, 3);
    // Centre cell surrounded by cells with varying mine counts
    grid[0][0].mineCount = 3;
    grid[0][1].mineCount = 2;
    grid[0][2].mineCount = 1;
    grid[1][0].mineCount = 0;
    grid[1][1].mineCount = 0; // centre
    grid[1][2].mineCount = 4;
    grid[2][0].mineCount = 5;
    grid[2][1].mineCount = 6;
    grid[2][2].mineCount = 0;
    computeHints(grid, 3, 3);
    // hint(1,1) = 3+2+1+0+4+5+6+0 = 21
    expect(grid[1][1].hint).toBe(21);
  });

  it("hint can reach 48 (all 8 neighbours have 6 mines each)", () => {
    const grid = createEmptyGrid(3, 3);
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) grid[r][c].mineCount = 6;
    grid[1][1].mineCount = 0; // centre has 0
    computeHints(grid, 3, 3);
    expect(grid[1][1].hint).toBe(48);
  });
});

// ─── Game: open / flood fill ────────────────────────────────────────────────

describe("Game - open & flood fill", () => {
  it("opening a mine cell loses", () => {
    const game = new Game({
      rows: 5,
      cols: 5,
      minesTotal: 24,
      maxMinesPerCell: 1,
      seed: 42,
      safeFirstClick: false,
    });
    // Find a cell with a mine
    let minePos = { row: 0, col: 0 };
    outer: for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (game.grid[r][c].mineCount > 0) {
          minePos = { row: r, col: c };
          break outer;
        }
      }
    }
    game.open(minePos.row, minePos.col);
    expect(game.status).toBe(GameStatus.Lost);
  });

  it("opening a safe cell with hint=0 flood-fills", () => {
    // Create a game with very few mines in a big grid
    const game = new Game({
      rows: 10,
      cols: 10,
      minesTotal: 1,
      maxMinesPerCell: 1,
      seed: 42,
      safeFirstClick: true,
    });
    // Open the first click (safe thanks to safeFirstClick)
    const opened = game.open(5, 5);
    // Should open more than just 1 cell because of flood fill
    expect(opened.length).toBeGreaterThan(1);
    // With only 1 mine and safeFirstClick, flood fill likely clears all safe cells
    expect([GameStatus.Playing, GameStatus.Won]).toContain(game.status);
  });

  it("safe first click avoids mines on the clicked cell and neighbours", () => {
    const game = new Game({
      rows: 5,
      cols: 5,
      minesTotal: 20,
      maxMinesPerCell: 6,
      seed: 42,
      safeFirstClick: true,
    });
    game.open(2, 2);
    expect(game.status).not.toBe(GameStatus.Lost);
    expect(game.grid[2][2].mineCount).toBe(0);
  });

});

// ─── Game: cycleMarker ──────────────────────────────────────────────────────

describe("Game - cycleMarker", () => {
  it("cycles 0→1→2→…→6→0", () => {
    const game = new Game({
      rows: 5,
      cols: 5,
      minesTotal: 0,
      maxMinesPerCell: 6,
      seed: 1,
      safeFirstClick: false,
    });
    const cell = game.grid[0][0];
    expect(cell.markerCount).toBe(0);
    for (let i = 1; i <= 6; i++) {
      game.cycleMarker(0, 0);
      expect(cell.markerCount).toBe(i);
    }
    game.cycleMarker(0, 0);
    expect(cell.markerCount).toBe(0);
  });

  it("does nothing on an opened cell", () => {
    const game = new Game({
      rows: 5,
      cols: 5,
      minesTotal: 0,
      maxMinesPerCell: 6,
      seed: 1,
      safeFirstClick: false,
    });
    game.open(0, 0);
    game.cycleMarker(0, 0);
    expect(game.grid[0][0].markerCount).toBe(0);
  });
});

// ─── Game: cycleMarkerDown ──────────────────────────────────────────────────

describe("Game - cycleMarkerDown", () => {
  it("does not go negative when negativeMines is false", () => {
    const game = new Game({
      rows: 5,
      cols: 5,
      minesTotal: 0,
      maxMinesPerCell: 1,
      seed: 1,
      safeFirstClick: false,
      negativeMines: false,
    });
    const cell = game.grid[0][0];
    expect(cell.markerCount).toBe(0);
    // Cycling down from 0 should stay at 0 when negativeMines=false
    game.cycleMarkerDown(0, 0);
    expect(cell.markerCount).toBe(0);
    // Set to 1, then down should go to 0
    game.cycleMarker(0, 0);
    expect(cell.markerCount).toBe(1);
    game.cycleMarkerDown(0, 0);
    expect(cell.markerCount).toBe(0);
    // Another down should stay at 0
    game.cycleMarkerDown(0, 0);
    expect(cell.markerCount).toBe(0);
  });

  it("cycles 0→-1→-2→…→-max→0 when negativeMines is true", () => {
    const game = new Game({
      rows: 5,
      cols: 5,
      minesTotal: 0,
      maxMinesPerCell: 3,
      seed: 1,
      safeFirstClick: false,
      negativeMines: true,
    });
    const cell = game.grid[0][0];
    expect(cell.markerCount).toBe(0);
    for (let i = -1; i >= -3; i--) {
      game.cycleMarkerDown(0, 0);
      expect(cell.markerCount).toBe(i);
    }
    // At -max, cycling down should return to 0
    game.cycleMarkerDown(0, 0);
    expect(cell.markerCount).toBe(0);
  });
});

// ─── Game: chordOpen ────────────────────────────────────────────────────────

describe("Game - chordOpen", () => {
  it("opens unmarked neighbours when marker sum matches hint", () => {
    // Manual setup: 3×3 grid, centre is safe, corner has 1 mine
    const game = new Game({
      rows: 3,
      cols: 3,
      minesTotal: 0,
      maxMinesPerCell: 6,
      seed: 1,
      safeFirstClick: false,
    });
    // Manually place 1 mine at (0,0)
    game.grid[0][0].mineCount = 1;
    // Recompute hints
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (const n of neighbours(r, c, 3, 3)) {
          sum += game.grid[n.row][n.col].mineCount;
        }
        game.grid[r][c].hint = sum;
      }
    }

    // Open centre (1,1) — hint should be 1
    game.open(1, 1);
    expect(game.grid[1][1].hint).toBe(1);

    // Mark (0,0) with 1 flag
    game.cycleMarker(0, 0);
    expect(game.grid[0][0].markerCount).toBe(1);

    // Chord on (1,1) — should open all other closed neighbours
    const opened = game.chordOpen(1, 1);
    expect(opened.length).toBeGreaterThan(0);
    // (0,0) should remain closed (it's flagged)
    expect(game.grid[0][0].opened).toBe(false);
    // (0,1) should now be open
    expect(game.grid[0][1].opened).toBe(true);
  });

  it("does nothing when marker sum ≠ hint", () => {
    const game = new Game({
      rows: 3,
      cols: 3,
      minesTotal: 0,
      maxMinesPerCell: 6,
      seed: 1,
      safeFirstClick: false,
    });
    game.grid[0][0].mineCount = 2;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (const n of neighbours(r, c, 3, 3)) {
          sum += game.grid[n.row][n.col].mineCount;
        }
        game.grid[r][c].hint = sum;
      }
    }
    game.open(1, 1);
    // Mark only 1 flag but hint is 2
    game.cycleMarker(0, 0);
    const opened = game.chordOpen(1, 1);
    expect(opened).toHaveLength(0);
  });
});

// ─── Game: win detection ────────────────────────────────────────────────────

describe("Game - win detection", () => {
  it("wins when all safe cells are opened", () => {
    // Use engine-placed mines so safeCellCount is consistent
    const game = new Game({
      rows: 5,
      cols: 5,
      minesTotal: 3,
      maxMinesPerCell: 1,
      seed: 42,
      safeFirstClick: false,
    });
    // Open all non-mine cells
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (game.grid[r][c].mineCount === 0) {
          game.open(r, c);
        }
      }
    }
    expect(game.status).toBe(GameStatus.Won);
  });
});

// ─── Hex grid: mine placement & hints ───────────────────────────────────────

describe("Hex grid - placement & hints", () => {
  const hexConfig = {
    rows: 8,
    cols: 8,
    minesTotal: 15,
    maxMinesPerCell: 3,
    seed: 42,
    safeFirstClick: false,
    density: 0.5,
    negativeMines: false,
    topology: "plane" as const,
    gridShape: "hex" as const,
  };

  it("places correct total mines on hex grid", () => {
    const grid = createEmptyGrid(8, 8);
    placeMines(grid, hexConfig);
    let total = 0;
    for (const row of grid) for (const cell of row) total += cell.mineCount;
    expect(total).toBe(15);
  });

  it("computes hex hints using 6 neighbors", () => {
    const grid = createEmptyGrid(5, 5);
    // Place mines around (2,2) in hex neighbor positions
    grid[2][1].mineCount = 1;
    grid[2][3].mineCount = 2;
    computeHints(grid, 5, 5, "plane", "hex");
    // (2,2) is even row, so neighbors: (2,1),(2,3),(1,1),(1,2),(3,1),(3,2)
    const expected = grid[2][1].mineCount + grid[2][3].mineCount +
      grid[1][1].mineCount + grid[1][2].mineCount +
      grid[3][1].mineCount + grid[3][2].mineCount;
    expect(grid[2][2].hint).toBe(expected);
  });
});

// ─── Triangle grid: mine placement & hints ──────────────────────────────────

describe("Triangle grid - placement & hints", () => {
  const triConfig = {
    rows: 8,
    cols: 10,
    minesTotal: 20,
    maxMinesPerCell: 3,
    seed: 42,
    safeFirstClick: false,
    density: 0.5,
    negativeMines: false,
    topology: "plane" as const,
    gridShape: "triangle" as const,
  };

  it("places correct total mines on triangle grid", () => {
    const grid = createEmptyGrid(8, 10);
    placeMines(grid, triConfig);
    let total = 0;
    for (const row of grid) for (const cell of row) total += cell.mineCount;
    expect(total).toBe(20);
  });

  it("computes triangle hints using 3 neighbors", () => {
    const grid = createEmptyGrid(5, 5);
    // (2,2) points up → neighbors: (2,1), (2,3), (3,2)
    grid[2][1].mineCount = 1;
    grid[2][3].mineCount = 2;
    grid[3][2].mineCount = 3;
    computeHints(grid, 5, 5, "plane", "triangle");
    expect(grid[2][2].hint).toBe(6); // 1+2+3
  });
});

// ─── Hex game play ──────────────────────────────────────────────────────────

describe("Game - hex grid play", () => {
  it("safe first click works on hex grid", () => {
    const game = new Game({
      rows: 8,
      cols: 8,
      minesTotal: 30,
      maxMinesPerCell: 6,
      seed: 42,
      safeFirstClick: true,
      gridShape: "hex",
    });
    game.open(4, 4);
    expect(game.status).not.toBe(GameStatus.Lost);
    expect(game.grid[4][4].mineCount).toBe(0);
  });

  it("flood fill works on hex grid", () => {
    const game = new Game({
      rows: 8,
      cols: 8,
      minesTotal: 1,
      maxMinesPerCell: 1,
      seed: 42,
      safeFirstClick: true,
      gridShape: "hex",
    });
    const opened = game.open(4, 4);
    expect(opened.length).toBeGreaterThan(1);
  });

  it("wins hex game when all safe cells opened", () => {
    const game = new Game({
      rows: 5,
      cols: 5,
      minesTotal: 3,
      maxMinesPerCell: 1,
      seed: 42,
      safeFirstClick: false,
      gridShape: "hex",
    });
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (game.grid[r][c].mineCount === 0) {
          game.open(r, c);
        }
      }
    }
    expect(game.status).toBe(GameStatus.Won);
  });
});

// ─── Triangle game play ─────────────────────────────────────────────────────

describe("Game - triangle grid play", () => {
  it("safe first click works on triangle grid", () => {
    const game = new Game({
      rows: 8,
      cols: 10,
      minesTotal: 30,
      maxMinesPerCell: 6,
      seed: 42,
      safeFirstClick: true,
      gridShape: "triangle",
    });
    game.open(4, 5);
    expect(game.status).not.toBe(GameStatus.Lost);
    expect(game.grid[4][5].mineCount).toBe(0);
  });

  it("flood fill works on triangle grid", () => {
    const game = new Game({
      rows: 8,
      cols: 10,
      minesTotal: 1,
      maxMinesPerCell: 1,
      seed: 42,
      safeFirstClick: true,
      gridShape: "triangle",
    });
    const opened = game.open(4, 5);
    expect(opened.length).toBeGreaterThan(1);
  });

  it("wins triangle game when all safe cells opened", () => {
    const game = new Game({
      rows: 5,
      cols: 6,
      minesTotal: 3,
      maxMinesPerCell: 1,
      seed: 42,
      safeFirstClick: false,
      gridShape: "triangle",
    });
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 6; c++) {
        if (game.grid[r][c].mineCount === 0) {
          game.open(r, c);
        }
      }
    }
    expect(game.status).toBe(GameStatus.Won);
  });
});
