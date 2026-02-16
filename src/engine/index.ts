export { Game } from "./game";
export {
  createEmptyGrid,
  placeMines,
  computeHints,
  neighbours,
} from "./board";
export { createRng, shuffle } from "./rng";
export { solveLogically } from "./solver";
export type {
  GameConfig,
  Cell,
  CellView,
  Pos,
} from "./types";
export type {
  GroupTotal,
  SolverInput,
  SolverMark,
  SolverResult,
} from "./solver";
export { GameStatus, DEFAULT_CONFIG } from "./types";
