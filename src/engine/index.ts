export { Game } from "./game";
export {
  createEmptyGrid,
  placeMines,
  computeHints,
  neighbours,
  neighboursForTopology,
  neighboursForGrid,
} from "./board";
export { createRng, shuffle } from "./rng";
export type {
  GameConfig,
  Cell,
  CellView,
  Pos,
  TopologyMode,
  GridShape,
} from "./types";
export { GameStatus, DEFAULT_CONFIG } from "./types";
