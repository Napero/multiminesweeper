export type TopologyMode =
  | "plane"
  | "cylinder"
  | "torus"
  | "mobius"
  | "klein"
  | "projective";

export type GridShape = "square" | "hex" | "triangle" | "pentagon" | "irregular" | "random";

export interface GameConfig {
  rows: number;
  cols: number;
  minesTotal: number;
  maxMinesPerCell: number; // 1..6
  seed: number;
  safeFirstClick: boolean;
  // 0 = spread evenly (max 1 per cell before reuse), 1 = fully random clumping
  density: number;
  negativeMines: boolean;  // allow cells with negative mine counts
  topology: TopologyMode;
  gridShape: GridShape;
  includeVertexNeighbors?: boolean;
}

export interface Cell {
  mineCount: number;   // -maxMinesPerCell..maxMinesPerCell
  opened: boolean;
  markerCount: number; // -max..max (negative in negative mode)
  hint: number;        // sum of neighbour mineCount (can be negative)
  adjacentMines: boolean; // true if any neighbour has mineCount !== 0
}

export enum GameStatus {
  Playing = "playing",
  Won = "won",
  Lost = "lost",
}

// Read-only cell snapshot for the UI layer
export interface CellView {
  row: number;
  col: number;
  opened: boolean;
  markerCount: number;
  hint: number | null;      // visible when opened or game over
  mineCount: number | null;
  exploded: boolean;        // the cell the player clicked to lose
  wrongMarker: boolean;     // wrong marker shown on game-over
  adjacentMines: boolean;   // true if any neighbour has mineCount !== 0
}

export interface Pos {
  row: number;
  col: number;
}

/** Default config */
export const DEFAULT_CONFIG: GameConfig = {
  rows: 16,
  cols: 30,
  minesTotal: 170,
  maxMinesPerCell: 6,
  seed: Date.now(),
  safeFirstClick: true,
  density: 0.6,
  negativeMines: false,
  topology: "plane",
  gridShape: "square",
  includeVertexNeighbors: true,
};
