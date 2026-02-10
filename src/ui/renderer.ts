import { CellView, GameStatus } from "../engine/types";
import { Game } from "../engine/game";
import {
  SpriteRect,
  SPRITE_CELL_CLOSED,
  SPRITE_CELL_OPEN,
  SPRITE_NUM_WIDE,
  SPRITE_DIGIT_SLIM,
  SPRITE_FLAG,
  SPRITE_BOMB,
  SPRITE_BOMB_CROSS,
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
  drawBombCross,
} from "./fallback";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private sheet: HTMLImageElement | null;
  scale: number;

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

    if (view.opened) {
      if (view.exploded) {
        if (fb) { drawRedBg(this.ctx, dx, dy, dw, dh); }
        else    { this.drawSprite(SPRITE_RED_BG, dx, dy, dw, dh); }
        if (view.mineCount && view.mineCount > 0) {
          if (fb) { drawBomb(this.ctx, view.mineCount, dx, dy, dw, dh); }
          else    { this.drawSprite(SPRITE_BOMB[view.mineCount], dx, dy, dw, dh); }
        }
      } else if (view.mineCount && view.mineCount > 0) {
        if (fb) { drawCellOpen(this.ctx, dx, dy, dw, dh); drawBomb(this.ctx, view.mineCount, dx, dy, dw, dh); }
        else    { this.drawSprite(SPRITE_CELL_OPEN, dx, dy, dw, dh); this.drawSprite(SPRITE_BOMB[view.mineCount], dx, dy, dw, dh); }
      } else {
        if (fb) { drawCellOpen(this.ctx, dx, dy, dw, dh); drawHintNumber(this.ctx, view.hint ?? 0, dx, dy, dw, dh); }
        else    { this.drawSprite(SPRITE_CELL_OPEN, dx, dy, dw, dh); this.renderHint(view.hint ?? 0, dx, dy, dw, dh); }
      }
    } else {
      if (lost && view.mineCount && view.mineCount > 0 && view.markerCount === 0) {
        if (fb) { drawCellOpen(this.ctx, dx, dy, dw, dh); drawBomb(this.ctx, view.mineCount, dx, dy, dw, dh); }
        else    { this.drawSprite(SPRITE_CELL_OPEN, dx, dy, dw, dh); this.drawSprite(SPRITE_BOMB[view.mineCount], dx, dy, dw, dh); }
      } else if (view.wrongMarker) {
        if (fb) { drawCellOpen(this.ctx, dx, dy, dw, dh); drawBombCross(this.ctx, view.markerCount, dx, dy, dw, dh); }
        else    { this.drawSprite(SPRITE_CELL_OPEN, dx, dy, dw, dh); this.drawSprite(SPRITE_BOMB_CROSS[view.markerCount], dx, dy, dw, dh); }
      } else {
        if (fb) {
          drawCellClosed(this.ctx, dx, dy, dw, dh);
          if (view.markerCount > 0) drawFlag(this.ctx, view.markerCount, dx, dy, dw, dh);
        } else {
          this.drawSprite(SPRITE_CELL_CLOSED, dx, dy, dw, dh);
          if (view.markerCount > 0) this.drawSprite(SPRITE_FLAG[view.markerCount], dx, dy, dw, dh);
        }
      }
    }
  }

  private renderHint(hint: number, dx: number, dy: number, dw: number, dh: number): void {
    if (hint === 0) return;

    if (hint <= 9) {
      this.drawSprite(SPRITE_NUM_WIDE[hint], dx, dy, dw, dh);
    } else {
      const tens = Math.floor(hint / 10);
      const ones = hint % 10;
      const halfW = dw / 2;
      this.drawSprite(SPRITE_DIGIT_SLIM[tens], dx, dy, halfW, dh);
      this.drawSprite(SPRITE_DIGIT_SLIM[ones], dx + halfW, dy, halfW, dh);
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
