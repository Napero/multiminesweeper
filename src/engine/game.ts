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
        lost && !c.opened && c.markerCount > 0 && c.mineCount === 0,
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

  mineDistribution(): { group: number; total: number; flagged: number; remaining: number }[] {
    const totals = new Array(7).fill(0);
    const flagged = new Array(7).fill(0);

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (cell.mineCount >= 1 && cell.mineCount <= 6) {
          totals[cell.mineCount]++;
        }
        if (!cell.opened && cell.markerCount >= 1 && cell.markerCount <= 6) {
          flagged[cell.markerCount]++;
        }
      }
    }

    const result: { group: number; total: number; flagged: number; remaining: number }[] = [];
    for (let g = 1; g <= this.config.maxMinesPerCell; g++) {
      if (totals[g] > 0) {
        result.push({
          group: g,
          total: totals[g],
          flagged: flagged[g],
          remaining: totals[g] - flagged[g],
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
    if (cell.opened || cell.markerCount > 0) return [];

    cell.opened = true;
    this.openedCount++;
    const opened: Pos[] = [{ row, col }];

    if (cell.mineCount > 0) {
      this.status = GameStatus.Lost;
      this.explodedPos = { row, col };
      return opened;
    }

    if (cell.hint === 0) {
      const queue: Pos[] = neighbours(row, col, this.rows, this.cols);
      while (queue.length > 0) {
        const p = queue.pop()!;
        const nc = this.grid[p.row][p.col];
        if (nc.opened || nc.markerCount > 0) continue;
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

  cycleMarker(row: number, col: number): void {
    if (this.status !== GameStatus.Playing) return;
    if (!this.inBounds(row, col)) return;
    const cell = this.grid[row][col];
    if (cell.opened) return;
    cell.markerCount = (cell.markerCount + 1) % (this.config.maxMinesPerCell + 1);
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
      if (c.mineCount > 0) {
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
    if (cell.opened || cell.markerCount > 0) return;

    cell.opened = true;
    this.openedCount++;

    if (cell.hint === 0) {
      const queue: Pos[] = neighbours(row, col, this.rows, this.cols);
      while (queue.length > 0) {
        const p = queue.pop()!;
        const nc = this.grid[p.row][p.col];
        if (nc.opened || nc.markerCount > 0) continue;
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
}
