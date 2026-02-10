export { Game } from "./game";
export {
  createEmptyGrid,
  placeMines,
  computeHints,
  neighbours,
} from "./board";
export { createRng, shuffle } from "./rng";
export type {
  GameConfig,
  Cell,
  CellView,
  Pos,
} from "./types";
export { GameStatus, DEFAULT_CONFIG } from "./types";
