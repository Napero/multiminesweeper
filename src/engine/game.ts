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
  neighboursForGrid,
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
    computeHints(this.grid, this.rows, this.cols, this.config.topology, this.config.gridShape, this.config.seed);

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

  private firstClickExclude(row: number, col: number): Pos[] {
    const depth = 1;
    const visited = new Set<string>();
    const queue: Array<{ row: number; col: number; d: number }> = [{ row, col, d: 0 }];
    const result: Pos[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const key = `${current.row},${current.col}`;
      if (visited.has(key)) continue;
      visited.add(key);
      result.push({ row: current.row, col: current.col });

      if (current.d >= depth) continue;
      const nbrs = this.neighbours(current.row, current.col);
      for (const n of nbrs) {
        const nk = `${n.row},${n.col}`;
        if (!visited.has(nk)) {
          queue.push({ row: n.row, col: n.col, d: current.d + 1 });
        }
      }
    }

    return result;
  }

  private neighbours(row: number, col: number): Pos[] {
    return neighboursForGrid(
      row,
      col,
      this.rows,
      this.cols,
      this.config.topology,
      this.config.gridShape,
      this.config.seed,
    );
  }

  get topology() {
    return this.config.topology;
  }

  get gridShape() {
    return this.config.gridShape;
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
      const exclude = this.firstClickExclude(row, col);
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
      const queue: Pos[] = this.neighbours(row, col);
      while (queue.length > 0) {
        const p = queue.pop()!;
        const nc = this.grid[p.row][p.col];
        if (nc.opened || nc.markerCount !== 0 || nc.mineCount !== 0) continue;
        nc.opened = true;
        this.openedCount++;
        opened.push(p);
        if (nc.hint === 0 && nc.mineCount === 0) {
          queue.push(...this.neighbours(p.row, p.col));
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
      return;
    }
    cell.markerCount--;
  }

  // Open unmarked neighbours if marker sum matches hint
  chordOpen(row: number, col: number): Pos[] {
    if (this.status !== GameStatus.Playing) return [];
    if (!this.inBounds(row, col)) return [];
    const cell = this.grid[row][col];
    if (!cell.opened) return [];

    const nbrs = this.neighbours(row, col);
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
      const exclude = this.firstClickExclude(row, col);
      this.initBoard(exclude);
      this.firstClick = false;
    } else if (this.firstClick) {
      this.firstClick = false;
    }

    const targets = [{ row, col }, ...this.neighbours(row, col)];
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
      const queue: Pos[] = this.neighbours(row, col);
      while (queue.length > 0) {
        const p = queue.pop()!;
        const nc = this.grid[p.row][p.col];
        if (nc.opened || nc.markerCount !== 0 || nc.mineCount !== 0) continue;
        nc.opened = true;
        this.openedCount++;
        if (nc.hint === 0 && nc.mineCount === 0) {
          queue.push(...this.neighbours(p.row, p.col));
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
