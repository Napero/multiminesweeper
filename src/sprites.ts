// 128×128 spritesheet, 16×16 tiles (slim digits are 8×16)
//
// Row 0: cell_closed, cell_open, 1w..6w
// Row 1: 7w..9w, slim digits 1s..9s,0s (8px each @ x=48)
// Row 2: flag1..flag6, flag_generic, (empty)
// Row 3: bomb1..bomb6, bomb_generic, cross_overlay
// Row 4: misflag1..misflag6, misflag_generic (empty)
// Row 5: question_mark, red_bg, (empty ×6)
// Row 6: 0neg, -1w..-7w (negative wide numbers, inverted colours)
// Row 7: -8w, -9w, slim neg 1s..9s,0s (8px each @ x=32), minus_overlay

export interface SpriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const W = 16;
const H = 16;
const SW = 8; // slim width

function tile(col: number, row: number): SpriteRect {
  return { x: col * W, y: row * H, w: W, h: H };
}

function slimTile(index: number): SpriteRect {
  // Slim tiles start after 3 wide tiles on row 1 → x = 3*16 + index*8
  return { x: 3 * W + index * SW, y: 1 * H, w: SW, h: H };
}

function slimTileNeg(index: number): SpriteRect {
  // Negative slim tiles start after 2 wide tiles on row 7 → x = 2*16 + index*8
  return { x: 2 * W + index * SW, y: 7 * H, w: SW, h: H };
}

export const SPRITE_CELL_CLOSED: SpriteRect = tile(0, 0);
export const SPRITE_CELL_OPEN: SpriteRect = tile(1, 0);

// Positive wide hint numbers (1–9)
export const SPRITE_NUM_WIDE: Record<number, SpriteRect> = {
  1: tile(2, 0),
  2: tile(3, 0),
  3: tile(4, 0),
  4: tile(5, 0),
  5: tile(6, 0),
  6: tile(7, 0),
  7: tile(0, 1),
  8: tile(1, 1),
  9: tile(2, 1),
};

// Negative wide hint numbers (0 through -9, inverted colours)
export const SPRITE_NUM_WIDE_NEG: Record<number, SpriteRect> = {
  0: tile(0, 6),
  1: tile(1, 6),
  2: tile(2, 6),
  3: tile(3, 6),
  4: tile(4, 6),
  5: tile(5, 6),
  6: tile(6, 6),
  7: tile(7, 6),
  8: tile(0, 7),
  9: tile(1, 7),
};

// Slim digits (positive, for two-digit hints)
export const SPRITE_DIGIT_SLIM: Record<number, SpriteRect> = {
  1: slimTile(0),
  2: slimTile(1),
  3: slimTile(2),
  4: slimTile(3),
  5: slimTile(4),
  6: slimTile(5),
  7: slimTile(6),
  8: slimTile(7),
  9: slimTile(8),
  0: slimTile(9),
};

// Slim digits (negative/inverted, for two-digit negative hints)
export const SPRITE_DIGIT_SLIM_NEG: Record<number, SpriteRect> = {
  1: slimTileNeg(0),
  2: slimTileNeg(1),
  3: slimTileNeg(2),
  4: slimTileNeg(3),
  5: slimTileNeg(4),
  6: slimTileNeg(5),
  7: slimTileNeg(6),
  8: slimTileNeg(7),
  9: slimTileNeg(8),
  0: slimTileNeg(9),
};

// Minus sign overlay (for multi-digit negative hints)
export const SPRITE_MINUS: SpriteRect = tile(7, 7);

// Positive flags (1–6) + generic fallback for >6
export const SPRITE_FLAG: Record<number, SpriteRect> = {
  1: tile(0, 2),
  2: tile(1, 2),
  3: tile(2, 2),
  4: tile(3, 2),
  5: tile(4, 2),
  6: tile(5, 2),
};
export const SPRITE_FLAG_GENERIC: SpriteRect = tile(6, 2);

// Positive bombs (1–6) + generic fallback for >6
export const SPRITE_BOMB: Record<number, SpriteRect> = {
  1: tile(0, 3),
  2: tile(1, 3),
  3: tile(2, 3),
  4: tile(3, 3),
  5: tile(4, 3),
  6: tile(5, 3),
};
export const SPRITE_BOMB_GENERIC: SpriteRect = tile(6, 3);

// Positive misflags (1–6)v
export const SPRITE_MISFLAG: Record<number, SpriteRect> = {
  1: tile(0, 4),
  2: tile(1, 4),
  3: tile(2, 4),
  4: tile(3, 4),
  5: tile(4, 4),
  6: tile(5, 4),
};
export const SPRITE_MISFLAG_GENERIC: SpriteRect = tile(6, 4);

// Cross overlay (drawn on top of bomb sprite for wrong markers)
export const SPRITE_CROSS: SpriteRect = tile(7, 3);

export const SPRITE_QUESTION: SpriteRect = tile(0, 5);
export const SPRITE_RED_BG: SpriteRect = tile(1, 5);

export const CELL_SIZE = W;
export const CELL_HEIGHT = H;

export function loadSpritesheet(url = `${import.meta.env.BASE_URL}sprites/sprites.png`): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (_e) => reject(new Error(`Failed to load spritesheet: ${url}`));
    img.src = url;
  });
}
