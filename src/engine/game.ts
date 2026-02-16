import {
  Cell,
  CellView,
  GameConfig,
  GameStatus,
  Pos,
  DEFAULT_CONFIG,
} from "./types";
import {
  createEmptyGrid,
  placeMines,
  computeHints,
  neighbours,
} from "./board";
import { solveLogically, SolverResult } from "./solver";

export class Game {
  readonly config: GameConfig;
  readonly rows: number;
  readonly cols: number;
  grid: Cell[][];
  status: GameStatus = GameStatus.Playing;
  explodedPos: Pos | null = null;
  private firstClick = true;
  private safeCellCount = 0;
  private openedCount = 0;

  constructor(config: Partial<GameConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rows = this.config.rows;
    this.cols = this.config.cols;
    this.grid = createEmptyGrid(this.rows, this.cols);

    if (!this.config.safeFirstClick) {
      this.initBoard([]);
    }
  }

  // Lazily called on first click when safeFirstClick is on
  private initBoard(excludePositions: Pos[]): void {
    this.grid = createEmptyGrid(this.rows, this.cols);
    placeMines(this.grid, this.config, excludePositions);
    computeHints(this.grid, this.rows, this.cols);

    this.safeCellCount = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        // A "safe" cell has no mines (positive or negative)
        if (this.grid[r][c].mineCount === 0) this.safeCellCount++;
      }
    }
  }

  private inBounds(row: number, col: number): boolean {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  cell(row: number, col: number): Cell {
    return this.grid[row][col];
  }

  cellView(row: number, col: number): CellView {
    const c = this.grid[row][col];
    const lost = this.status === GameStatus.Lost;
    const won = this.status === GameStatus.Won;
    const gameOver = lost || won;
    const exploded =
      lost &&
      this.explodedPos !== null &&
      this.explodedPos.row === row &&
      this.explodedPos.col === col;

    return {
      row,
      col,
      opened: c.opened,
      markerCount: c.markerCount,
      hint: c.opened ? c.hint : gameOver && c.mineCount === 0 ? c.hint : null,
      mineCount: gameOver || c.opened ? c.mineCount : null,
      exploded,
      wrongMarker:
        lost && !c.opened && c.markerCount !== 0 && c.mineCount === 0,
      adjacentMines: c.adjacentMines,
    };
  }

  get remainingMines(): number {
    let markers = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        markers += this.grid[r][c].markerCount;
      }
    }
    return this.config.minesTotal - markers;
  }

  /** Min marker value (negative of maxMinesPerCell in negative mode, 0 otherwise) */
  get minMarker(): number {
    return this.config.negativeMines ? -this.config.maxMinesPerCell : 0;
  }

  /** Max marker value */
  get maxMarker(): number {
    return this.config.maxMinesPerCell;
  }

  mineDistribution(): { group: number; total: number; flagged: number; remaining: number }[] {
    const max = this.config.maxMinesPerCell;
    const min = this.config.negativeMines ? -max : 1;

    // Use offset arrays: index = group - min
    const range = max - min + 1;
    const totals = new Array(range).fill(0);
    const flagged = new Array(range).fill(0);

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (cell.mineCount !== 0 && cell.mineCount >= min && cell.mineCount <= max) {
          totals[cell.mineCount - min]++;
        }
        if (!cell.opened && cell.markerCount !== 0 && cell.markerCount >= min && cell.markerCount <= max) {
          flagged[cell.markerCount - min]++;
        }
      }
    }

    const result: { group: number; total: number; flagged: number; remaining: number }[] = [];
    for (let g = min; g <= max; g++) {
      if (g === 0) continue;
      const idx = g - min;
      if (totals[idx] > 0) {
        result.push({
          group: g,
          total: totals[idx],
          flagged: flagged[idx],
          remaining: totals[idx] - flagged[idx],
        });
      }
    }
    return result;
  }

  open(row: number, col: number): Pos[] {
    if (this.status !== GameStatus.Playing) return [];
    if (!this.inBounds(row, col)) return [];

    if (this.firstClick && this.config.safeFirstClick) {
      const exclude = [
        { row, col },
        ...neighbours(row, col, this.rows, this.cols),
      ];
      this.initBoard(exclude);
      this.firstClick = false;
    } else if (this.firstClick) {
      this.firstClick = false;
    }

    const cell = this.grid[row][col];
    if (cell.opened || cell.markerCount !== 0) return [];

    cell.opened = true;
    this.openedCount++;
    const opened: Pos[] = [{ row, col }];

    // Any non-zero mineCount (positive or negative) is a mine → loss
    if (cell.mineCount !== 0) {
      this.status = GameStatus.Lost;
      this.explodedPos = { row, col };
      return opened;
    }

    if (cell.hint === 0) {
      const queue: Pos[] = neighbours(row, col, this.rows, this.cols);
      while (queue.length > 0) {
        const p = queue.pop()!;
        const nc = this.grid[p.row][p.col];
        if (nc.opened || nc.markerCount !== 0 || nc.mineCount !== 0) continue;
        nc.opened = true;
        this.openedCount++;
        opened.push(p);
        if (nc.hint === 0 && nc.mineCount === 0) {
          queue.push(...neighbours(p.row, p.col, this.rows, this.cols));
        }
      }
    }

    this.checkWin();
    return opened;
  }

  /** Right-click: cycle marker upward (0 → 1 → 2 → … → max → 0) */
  cycleMarker(row: number, col: number): void {
    if (this.status !== GameStatus.Playing) return;
    if (!this.inBounds(row, col)) return;
    const cell = this.grid[row][col];
    if (cell.opened) return;
    const max = this.config.maxMinesPerCell;
    if (cell.markerCount >= max) {
      cell.markerCount = 0;
    } else {
      cell.markerCount++;
      // Skip 0 when going up (0 → 1)
      if (cell.markerCount === 0) cell.markerCount = 1;
    }
  }

  /** Shift+right-click: cycle marker downward (0 → -1 → -2 → … → -max → 0) */
  cycleMarkerDown(row: number, col: number): void {
    if (this.status !== GameStatus.Playing) return;
    if (!this.inBounds(row, col)) return;
    const cell = this.grid[row][col];
    if (cell.opened) return;
    const min = this.config.negativeMines ? -this.config.maxMinesPerCell : 0;
    if (cell.markerCount <= min) {
      cell.markerCount = 0;
    } else {
      cell.markerCount--;
      // Skip 0 when going down (0 → -1)
      if (cell.markerCount === 0) cell.markerCount = -1;
    }
  }

  // Open unmarked neighbours if marker sum matches hint
  chordOpen(row: number, col: number): Pos[] {
    if (this.status !== GameStatus.Playing) return [];
    if (!this.inBounds(row, col)) return [];
    const cell = this.grid[row][col];
    if (!cell.opened) return [];

    const nbrs = neighbours(row, col, this.rows, this.cols);
    let markerSum = 0;
    for (const n of nbrs) {
      const nc = this.grid[n.row][n.col];
      if (!nc.opened) markerSum += nc.markerCount;
    }

    if (markerSum !== cell.hint) return [];

    const opened: Pos[] = [];
    for (const n of nbrs) {
      const nc = this.grid[n.row][n.col];
      if (!nc.opened && nc.markerCount === 0) {
        opened.push(...this.open(n.row, n.col));
      }
    }
    return opened;
  }

  // Reveal the correct state for a cell and its neighbours:
  // mines get flagged, safe cells get opened.
  applyHint(row: number, col: number): void {
    if (this.status !== GameStatus.Playing) return;
    if (!this.inBounds(row, col)) return;

    // Make sure the board exists (first click safety)
    if (this.firstClick && this.config.safeFirstClick) {
      const exclude = [
        { row, col },
        ...neighbours(row, col, this.rows, this.cols),
      ];
      this.initBoard(exclude);
      this.firstClick = false;
    } else if (this.firstClick) {
      this.firstClick = false;
    }

    const targets = [{ row, col }, ...neighbours(row, col, this.rows, this.cols)];
    for (const pos of targets) {
      const c = this.grid[pos.row][pos.col];
      if (c.opened) continue;
      if (c.mineCount !== 0) {
        c.markerCount = c.mineCount;
      } else {
        this.openSafe(pos.row, pos.col);
      }
    }
    this.checkWin();
  }

  // Open a cell that's known to be safe (no lose check, just flood fill)
  private openSafe(row: number, col: number): void {
    const cell = this.grid[row][col];
    if (cell.opened || cell.markerCount !== 0) return;

    cell.opened = true;
    this.openedCount++;

    if (cell.hint === 0) {
      const queue: Pos[] = neighbours(row, col, this.rows, this.cols);
      while (queue.length > 0) {
        const p = queue.pop()!;
        const nc = this.grid[p.row][p.col];
        if (nc.opened || nc.markerCount !== 0 || nc.mineCount !== 0) continue;
        nc.opened = true;
        this.openedCount++;
        if (nc.hint === 0 && nc.mineCount === 0) {
          queue.push(...neighbours(p.row, p.col, this.rows, this.cols));
        }
      }
    }
  }

  giveUp(): void {
    if (this.status !== GameStatus.Playing) return;
    this.status = GameStatus.Lost;
  }

  private checkWin(): void {
    if (this.openedCount === this.safeCellCount) {
      this.status = GameStatus.Won;
    }
  }

  visibleCells(): CellView[][] {
    const out: CellView[][] = [];
    for (let r = 0; r < this.rows; r++) {
      const row: CellView[] = [];
      for (let c = 0; c < this.cols; c++) {
        row.push(this.cellView(r, c));
      }
      out.push(row);
    }
    return out;
  }

  solveLogicalStep(maxSearchNodes?: number): SolverResult & { openedCount: number; markedCount: number } {
    const totals = this.mineDistribution().map((d) => ({ group: d.group, total: d.total }));
    const result = solveLogically({
      rows: this.rows,
      cols: this.cols,
      cells: this.visibleCells(),
      maxMinesPerCell: this.config.maxMinesPerCell,
      negativeMines: this.config.negativeMines,
      groupTotals: totals,
      maxSearchNodes,
    });

    if (result.contradiction || !result.complete) {
      return { ...result, openedCount: 0, markedCount: 0 };
    }

    let openedCount = 0;
    let markedCount = 0;

    for (const m of result.marks) {
      const cell = this.cell(m.row, m.col);
      if (!cell.opened && cell.markerCount === 0) {
        cell.markerCount = m.value;
        markedCount++;
      }
    }

    for (const p of result.opens) {
      const cell = this.cell(p.row, p.col);
      if (!cell.opened && cell.markerCount === 0) {
        const opened = this.open(p.row, p.col);
        openedCount += opened.length;
      }
    }

    return { ...result, openedCount, markedCount };
  }

  solveLogicalUntilStuck(maxSteps = 200, maxSearchNodes?: number): SolverResult & { steps: number } {
    let steps = 0;
    let last: SolverResult = {
      opens: [],
      marks: [],
      stalled: true,
      contradiction: false,
      complete: true,
    };

    while (steps < maxSteps && this.status === GameStatus.Playing) {
      const step = this.solveLogicalStep(maxSearchNodes);
      last = step;
      if (step.contradiction || !step.complete) break;
      if (step.openedCount === 0 && step.markedCount === 0) break;
      steps++;
    }

    return { ...last, steps };
  }

  guessEducated(): { guessed: boolean; row?: number; col?: number; score?: number } {
    if (this.status !== GameStatus.Playing) return { guessed: false };

    const min = this.minMarker;
    const max = this.maxMarker;
    const candidates: { row: number; col: number; score: number; evidence: number }[] = [];

    let totalUnknown = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (!cell.opened && cell.markerCount === 0) totalUnknown++;
      }
    }
    if (totalUnknown === 0) return { guessed: false };

    const dist = this.mineDistribution();
    let remainingPackedCells = 0;
    for (const g of dist) remainingPackedCells += Math.max(0, g.remaining);
    const globalRisk = Math.max(0, Math.min(1, remainingPackedCells / totalUnknown));

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (cell.opened || cell.markerCount !== 0) continue;

        let riskSum = 0;
        let evidence = 0;
        for (const n of neighbours(r, c, this.rows, this.cols)) {
          const clue = this.grid[n.row][n.col];
          if (!clue.opened) continue;

          let fixedSum = 0;
          let unknownCount = 0;
          for (const nn of neighbours(n.row, n.col, this.rows, this.cols)) {
            const around = this.grid[nn.row][nn.col];
            if (around.opened) {
              fixedSum += around.mineCount;
            } else if (around.markerCount !== 0) {
              fixedSum += around.markerCount;
            } else {
              unknownCount++;
            }
          }
          if (unknownCount === 0) continue;

          const remaining = clue.hint - fixedSum;
          const boundedRemaining = Math.max(min * unknownCount, Math.min(max * unknownCount, remaining));
          const localRisk = Math.max(0, Math.min(1, Math.abs(boundedRemaining) / (Math.max(1, max) * unknownCount)));
          riskSum += localRisk;
          evidence++;
        }

        const score = evidence > 0
          ? (riskSum / evidence) * 0.75 + globalRisk * 0.25
          : globalRisk + 0.05; // slight penalty for no local information

        candidates.push({ row: r, col: c, score, evidence });
      }
    }

    if (candidates.length === 0) return { guessed: false };
    candidates.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      if (a.evidence !== b.evidence) return b.evidence - a.evidence;
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });
    const best = candidates[0];
    this.open(best.row, best.col);
    return { guessed: true, row: best.row, col: best.col, score: best.score };
  }

  solveAutoWithGuesses(
    maxCycles = 200,
    maxLogicalStepsPerCycle = 300,
    maxSearchNodes?: number,
  ): SolverResult & { steps: number; neededGuesses: number } {
    let neededGuesses = 0;
    let steps = 0;
    let last: SolverResult = {
      opens: [],
      marks: [],
      stalled: true,
      contradiction: false,
      complete: true,
    };

    for (let i = 0; i < maxCycles && this.status === GameStatus.Playing; i++) {
      const logical = this.solveLogicalUntilStuck(maxLogicalStepsPerCycle, maxSearchNodes);
      last = logical;
      steps += logical.steps;

      if (this.status !== GameStatus.Playing) break;
      if (logical.contradiction) break;
      if (!logical.complete) break;
      if (!logical.stalled) continue;

      const guessed = this.guessEducated();
      if (!guessed.guessed) break;
      neededGuesses++;
      if (this.status !== GameStatus.Playing) break;
    }

    return { ...last, steps, neededGuesses };
  }
}
