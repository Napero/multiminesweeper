import { CellView, GameStatus } from "../engine/types";
import { Game } from "../engine/game";
import {
  SpriteRect,
  SPRITE_CELL_CLOSED,
  SPRITE_CELL_OPEN,
  SPRITE_NUM_WIDE,
  SPRITE_NUM_WIDE_NEG,
  SPRITE_DIGIT_SLIM,
  SPRITE_DIGIT_SLIM_NEG,
  SPRITE_MINUS,
  SPRITE_FLAG,
  SPRITE_FLAG_GENERIC,
  SPRITE_BOMB,
  SPRITE_BOMB_GENERIC,
  SPRITE_MISFLAG,
  SPRITE_MISFLAG_GENERIC,
  SPRITE_CROSS,
  SPRITE_RED_BG,
  CELL_SIZE,
  CELL_HEIGHT,
} from "../sprites";
import {
  drawCellClosed,
  drawCellOpen,
  drawRedBg,
  drawHintNumber,
  drawFlag,
  drawBomb,
  drawMisflag,
  drawBombCross,
} from "./fallback";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private sheet: HTMLImageElement | null;
  scale: number;

  // Off-screen canvas for drawing inverted/flipped sprites
  private invertCanvas: HTMLCanvasElement;
  private invertCtx: CanvasRenderingContext2D;

  private get useFallback(): boolean {
    return !this.sheet;
  }

  constructor(
    private canvas: HTMLCanvasElement,
    sheet: HTMLImageElement | null,
    scale = 2,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.sheet = sheet;
    this.scale = scale;
    this.invertCanvas = document.createElement("canvas");
    this.invertCanvas.width = 16;
    this.invertCanvas.height = 16;
    this.invertCtx = this.invertCanvas.getContext("2d")!;
  }

  resize(rows: number, cols: number): void {
    const w = cols * CELL_SIZE * this.scale;
    const h = rows * CELL_HEIGHT * this.scale;
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.imageSmoothingEnabled = false;
  }

  pixelToCell(px: number, py: number): { row: number; col: number } | null {
    const col = Math.floor(px / (CELL_SIZE * this.scale));
    const row = Math.floor(py / (CELL_HEIGHT * this.scale));
    return { row, col };
  }

  renderBoard(game: Game): void {
    const { rows, cols } = game;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.renderCell(game.cellView(r, c), game.status);
      }
    }
  }

  renderCell(view: CellView, status: GameStatus): void {
    const dx = view.col * CELL_SIZE * this.scale;
    const dy = view.row * CELL_HEIGHT * this.scale;
    const dw = CELL_SIZE * this.scale;
    const dh = CELL_HEIGHT * this.scale;
    const fb = this.useFallback;

    const lost = status === GameStatus.Lost;
    const mc = view.mineCount ?? 0;

    if (view.opened) {
      if (view.exploded) {
        // Exploded cell: red background + bomb sprite
        if (fb) { drawRedBg(this.ctx, dx, dy, dw, dh); }
        else    { this.drawSprite(SPRITE_RED_BG, dx, dy, dw, dh); }
        if (mc !== 0) {
          this.drawBombSprite(mc, dx, dy, dw, dh, fb);
        }
      } else if (mc !== 0) {
        // Opened cell with mine (game over reveal)
        if (fb) { drawCellOpen(this.ctx, dx, dy, dw, dh); drawBomb(this.ctx, Math.abs(mc), dx, dy, dw, dh); }
        else    { this.drawSprite(SPRITE_CELL_OPEN, dx, dy, dw, dh); this.drawBombSprite(mc, dx, dy, dw, dh, fb); }
      } else {
        // Normal opened cell with hint
        if (fb) {
          drawCellOpen(this.ctx, dx, dy, dw, dh);
          const h = view.hint ?? 0;
          if (h !== 0 || view.adjacentMines) drawHintNumber(this.ctx, h, dx, dy, dw, dh, view.adjacentMines);
        } else {
          this.drawSprite(SPRITE_CELL_OPEN, dx, dy, dw, dh);
          this.renderHint(view.hint ?? 0, view.adjacentMines, dx, dy, dw, dh);
        }
      }
    } else {
      if (lost && mc !== 0 && view.markerCount === 0) {
        // Game over: reveal unflagged mines
        if (fb) { drawCellOpen(this.ctx, dx, dy, dw, dh); drawBomb(this.ctx, Math.abs(mc), dx, dy, dw, dh); }
        else    { this.drawSprite(SPRITE_CELL_OPEN, dx, dy, dw, dh); this.drawBombSprite(mc, dx, dy, dw, dh, fb); }
      } else if (view.wrongMarker) {
        // Wrong marker, 0 mines: bomb + cross overlay
        if (view.mineCount === 0) {
          if (fb) {
            drawCellOpen(this.ctx, dx, dy, dw, dh);
            drawBombCross(this.ctx, Math.abs(view.markerCount), dx, dy, dw, dh);
          } else {
            this.drawSprite(SPRITE_CELL_OPEN, dx, dy, dw, dh);
            this.drawBombSprite(view.markerCount, dx, dy, dw, dh, false);
            this.drawSprite(SPRITE_CROSS, dx, dy, dw, dh);
          }
        } else {
          if (fb) {
            drawCellOpen(this.ctx, dx, dy, dw, dh);
            drawFlag(this.ctx, Math.abs(view.markerCount), dx, dy, dw, dh);
            drawMisflag(this.ctx, Math.abs(view.mineCount), dx, dy, dw, dh);
          } else {
            this.drawSprite(SPRITE_CELL_OPEN, dx, dy, dw, dh);
            this.drawFlagSprite(view.markerCount, dx, dy, dw, dh, false);
            this.drawMisflagSprite(view.mineCount, dx, dy, dw, dh, false);
          }
        }
      } else {
        // Closed cell, maybe with flag
        if (fb) {
          drawCellClosed(this.ctx, dx, dy, dw, dh);
          if (view.markerCount !== 0) drawFlag(this.ctx, Math.abs(view.markerCount), dx, dy, dw, dh);
        } else {
          this.drawSprite(SPRITE_CELL_CLOSED, dx, dy, dw, dh);
          if (view.markerCount !== 0) this.drawFlagSprite(view.markerCount, dx, dy, dw, dh);
        }
      }
    }
  }

  /** Draw a bomb sprite. Positive = normal, negative = inverted colors (white bomb). */
  private drawBombSprite(count: number, dx: number, dy: number, dw: number, dh: number, fb: boolean): void {
    if (fb) {
      drawBomb(this.ctx, Math.abs(count), dx, dy, dw, dh);
      return;
    }
    const abs = Math.abs(count);
    const sprite = SPRITE_BOMB[abs] ?? SPRITE_BOMB_GENERIC;
    if (count < 0) {
      this.drawSpriteInverted(sprite, dx, dy, dw, dh);
    } else {
      this.drawSprite(sprite, dx, dy, dw, dh);
    }
  }

  /** Draw a misflag sprite. Positive = normal, negative = inverted colors (white bomb). */
  private drawMisflagSprite(count: number, dx: number, dy: number, dw: number, dh: number, fb: boolean): void {
    if (fb) {
      drawMisflag(this.ctx, Math.abs(count), dx, dy, dw, dh);
      return;
    }
    const abs = Math.abs(count);
    const sprite = SPRITE_MISFLAG[abs] ?? SPRITE_MISFLAG_GENERIC;
    if (count < 0) {
      this.drawSpriteInverted(sprite, dx, dy, dw, dh);
    } else {
      this.drawSprite(sprite, dx, dy, dw, dh);
    }
  }

  /** Draw a flag sprite. Positive = normal, negative = inverted + flipped vertically. */
  private drawFlagSprite(count: number, dx: number, dy: number, dw: number, dh: number): void {
    const abs = Math.abs(count);
    const sprite = SPRITE_FLAG[abs] ?? SPRITE_FLAG_GENERIC;
    if (count < 0) {
      this.drawSpriteInvertedFlipped(sprite, dx, dy, dw, dh);
    } else {
      this.drawSprite(sprite, dx, dy, dw, dh);
    }
  }

  private renderHint(hint: number, adjacentMines: boolean, dx: number, dy: number, dw: number, dh: number): void {
    if (hint === 0) {
      if (adjacentMines) {
        this.drawSprite(SPRITE_NUM_WIDE_NEG[0], dx, dy, dw, dh);
      }
      return;
    }

    const abs = Math.abs(hint);
    const neg = hint < 0;

    if (abs <= 9) {
      if (neg) {
        // Use the negative wide number sprite (keyed by abs value)
        this.drawSprite(SPRITE_NUM_WIDE_NEG[abs], dx, dy, dw, dh);
      } else {
        this.drawSprite(SPRITE_NUM_WIDE[abs], dx, dy, dw, dh);
      }
    } else {
      // Two-digit number: use slim digits in two halves, overlay minus if negative
      const tens = Math.floor(abs / 10);
      const ones = abs % 10;
      const slimSet = neg ? SPRITE_DIGIT_SLIM_NEG : SPRITE_DIGIT_SLIM;
      const halfW = dw / 2;
      this.drawSprite(slimSet[tens], dx, dy, halfW, dh);
      this.drawSprite(slimSet[ones], dx + halfW, dy, halfW, dh);
      if (neg) {
        this.drawSprite(SPRITE_MINUS, dx, dy, dw, dh);
      }
    }
  }

  private drawSprite(
    sprite: SpriteRect,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void {
    if (!this.sheet) return;
    this.ctx.drawImage(
      this.sheet,
      sprite.x,
      sprite.y,
      sprite.w,
      sprite.h,
      dx,
      dy,
      dw,
      dh,
    );
  }

  /** Draw a sprite with inverted colors (preserving transparency). */
  private drawSpriteInverted(
    sprite: SpriteRect,
    dx: number, dy: number, dw: number, dh: number,
  ): void {
    if (!this.sheet) return;
    const ic = this.invertCanvas;
    const ictx = this.invertCtx;
    ic.width = sprite.w;
    ic.height = sprite.h;
    ictx.clearRect(0, 0, sprite.w, sprite.h);
    ictx.drawImage(this.sheet, sprite.x, sprite.y, sprite.w, sprite.h, 0, 0, sprite.w, sprite.h);
    // Invert via difference blend (makes transparent pixels white)
    ictx.globalCompositeOperation = "difference";
    ictx.fillStyle = "#ffffff";
    ictx.fillRect(0, 0, sprite.w, sprite.h);
    // Restore original alpha mask: keep result only where the sprite was opaque
    ictx.globalCompositeOperation = "destination-in";
    ictx.drawImage(this.sheet, sprite.x, sprite.y, sprite.w, sprite.h, 0, 0, sprite.w, sprite.h);
    ictx.globalCompositeOperation = "source-over";
    this.ctx.drawImage(ic, 0, 0, sprite.w, sprite.h, dx, dy, dw, dh);
  }

  /** Draw a sprite with inverted colors AND flipped vertically (preserving transparency). */
  private drawSpriteInvertedFlipped(
    sprite: SpriteRect,
    dx: number, dy: number, dw: number, dh: number,
  ): void {
    if (!this.sheet) return;
    const ic = this.invertCanvas;
    const ictx = this.invertCtx;
    ic.width = sprite.w;
    ic.height = sprite.h;
    ictx.clearRect(0, 0, sprite.w, sprite.h);
    // Flip vertically
    ictx.save();
    ictx.translate(0, sprite.h);
    ictx.scale(1, -1);
    ictx.drawImage(this.sheet, sprite.x, sprite.y, sprite.w, sprite.h, 0, 0, sprite.w, sprite.h);
    ictx.restore();
    // Invert via difference blend (makes transparent pixels white)
    ictx.globalCompositeOperation = "difference";
    ictx.fillStyle = "#ffffff";
    ictx.fillRect(0, 0, sprite.w, sprite.h);
    // Restore original alpha mask from the flipped sprite
    ictx.globalCompositeOperation = "destination-in";
    ictx.save();
    ictx.translate(0, sprite.h);
    ictx.scale(1, -1);
    ictx.drawImage(this.sheet, sprite.x, sprite.y, sprite.w, sprite.h, 0, 0, sprite.w, sprite.h);
    ictx.restore();
    ictx.globalCompositeOperation = "source-over";
    this.ctx.drawImage(ic, 0, 0, sprite.w, sprite.h, dx, dy, dw, dh);
  }

  renderHintOverlay(row: number, col: number, rows: number, cols: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = row + dr;
        const c = col + dc;
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          const dx = c * CELL_SIZE * this.scale;
          const dy = r * CELL_HEIGHT * this.scale;
          const dw = CELL_SIZE * this.scale;
          const dh = CELL_HEIGHT * this.scale;
          ctx.fillRect(dx, dy, dw, dh);
        }
      }
    }
  }
}
