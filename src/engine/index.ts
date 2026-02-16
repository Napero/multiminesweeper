export { Game } from "./game";
export {
  createEmptyGrid,
  placeMines,
  computeHints,
  neighbours,
  neighboursForTopology,
} from "./board";
export { createRng, shuffle } from "./rng";
export type {
  GameConfig,
  Cell,
  CellView,
  Pos,
  TopologyMode,
} from "./types";
export { GameStatus, DEFAULT_CONFIG } from "./types";
