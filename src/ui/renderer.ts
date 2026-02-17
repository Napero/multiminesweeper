import { CellView, GameStatus, GridShape, TopologyMode } from "../engine/types";
import { Game } from "../engine/game";
import { neighboursForGrid } from "../engine/board";
import { buildIrregularLayout, IrregularPoint } from "../engine/irregular";
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
  drawBombCross,
} from "./fallback";

const PENTAGON_PETALS = 6;
const PENTAGON_DEG = Math.PI / 180;
const PENTAGON_BASE_ROTATION_DEG = 10;
const PENTAGON_BASE_FLOWER_STEP_X = 1.61;
const PENTAGON_BASE_FLOWER_STEP_Y = 1.39;
const PENTAGON_BASE_FLOWER_ROW_OFFSET = 0.805;
const PENTAGON_CENTER_MARGIN = 0;
const PENTAGON_SIDE_A = 0.74;
const PENTAGON_SIDE_B = 0.34;

export interface PentagonLayout {
  spacingScale: number;
  rotationDeg: number;
}

const pentagonLayout: PentagonLayout = {
  spacingScale: 1.04,
  rotationDeg: PENTAGON_BASE_ROTATION_DEG,
};

export function getPentagonLayout(): PentagonLayout {
  return { ...pentagonLayout };
}

export function setPentagonLayout(next: Partial<PentagonLayout>): void {
  if (typeof next.spacingScale === "number" && Number.isFinite(next.spacingScale)) {
    pentagonLayout.spacingScale = Math.max(0.85, Math.min(1.35, next.spacingScale));
  }
  if (typeof next.rotationDeg === "number" && Number.isFinite(next.rotationDeg)) {
    pentagonLayout.rotationDeg = Math.max(-30, Math.min(30, next.rotationDeg));
  }
}

function pentagonStepX(): number {
  return PENTAGON_BASE_FLOWER_STEP_X * pentagonLayout.spacingScale;
}

function pentagonStepY(): number {
  return PENTAGON_BASE_FLOWER_STEP_Y * pentagonLayout.spacingScale;
}

function pentagonRowOffset(): number {
  return PENTAGON_BASE_FLOWER_ROW_OFFSET * pentagonLayout.spacingScale;
}

interface IrregularMesh {
  rows: number;
  cols: number;
  scale: number;
  seed: number;
  quads: Array<Array<{ x: number; y: number }>>;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}


function getPentagonPoints(row: number, col: number, cellW: number): Array<{ x: number; y: number }> {
  const flowerCol = Math.floor(col / PENTAGON_PETALS);
  const petal = ((col % PENTAGON_PETALS) + PENTAGON_PETALS) % PENTAGON_PETALS;
  const cx =
    (PENTAGON_CENTER_MARGIN +
      flowerCol * pentagonStepX() +
      (row % 2 === 0 ? 0 : pentagonRowOffset())) *
    cellW;
  const cy = (PENTAGON_CENTER_MARGIN + row * pentagonStepY()) * cellW;
  const angle = (-90 + pentagonLayout.rotationDeg + petal * 60) * PENTAGON_DEG; // outward axis from the shared hub
  const sideA = PENTAGON_SIDE_A * cellW;
  const sideB = PENTAGON_SIDE_B * cellW;
  const sideC = (PENTAGON_SIDE_A - PENTAGON_SIDE_B) * cellW;
  const dirs = [30, -30, -90, -150];
  const lens = [sideA, sideB, sideC, sideB];
  const points = [{ x: cx, y: cy }];

  let x = cx;
  let y = cy;
  for (let i = 0; i < dirs.length; i++) {
    const theta = angle + dirs[i] * PENTAGON_DEG;
    x += Math.cos(theta) * lens[i];
    y += Math.sin(theta) * lens[i];
    points.push({ x, y });
  }

  return points;
}

function boundsOfPoints(points: Array<{ x: number; y: number }>): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

interface PentagonBoardBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function getPentagonBoardBounds(rows: number, cols: number, cellW: number): PentagonBoardBounds {
  if (rows <= 0 || cols <= 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const bounds = boundsOfPoints(getPentagonPoints(r, c, cellW));
      if (bounds.minX < minX) minX = bounds.minX;
      if (bounds.minY < minY) minY = bounds.minY;
      if (bounds.maxX > maxX) maxX = bounds.maxX;
      if (bounds.maxY > maxY) maxY = bounds.maxY;
    }
  }
  return { minX, minY, maxX, maxY };
}

function measurePentagonBoard(rows: number, cols: number, cellW: number): { width: number; height: number } {
  const b = getPentagonBoardBounds(rows, cols, cellW);
  const pad = cellW * 0.02;
  return {
    width: Math.ceil(Math.max(0, b.maxX - b.minX) + pad * 2),
    height: Math.ceil(Math.max(0, b.maxY - b.minY) + pad * 2),
  };
}

function buildIrregularMesh(rows: number, cols: number, scale: number, seed: number): IrregularMesh {
  const layout = buildIrregularLayout(rows, cols, seed);
  const cellW = CELL_SIZE * scale;
  const cellH = CELL_HEIGHT * scale;
  const quads = layout.polygons.map((poly: IrregularPoint[]) =>
    poly.map((p) => ({ x: p.x * cellW, y: p.y * cellH })),
  );
  const minX = layout.minX * cellW;
  const minY = layout.minY * cellH;
  const maxX = layout.maxX * cellW;
  const maxY = layout.maxY * cellH;
  const pad = Math.max(1, scale);
  const offsetX = pad - minX;
  const offsetY = pad - minY;
  return {
    rows,
    cols,
    scale,
    seed,
    quads,
    offsetX,
    offsetY,
    width: Math.ceil(maxX - minX + pad * 2),
    height: Math.ceil(maxY - minY + pad * 2),
  };
}

export function measureBoardPixels(rows: number, cols: number, shape: GridShape, scale = 1, seed = 0): { width: number; height: number } {
  const cellW = CELL_SIZE * scale;
  const cellH = CELL_HEIGHT * scale;
  if (shape === "hex") {
    const hexH = cellW * 2 / Math.sqrt(3);
    const stepY = hexH * 0.75;
    return {
      width: Math.ceil(cols * cellW + cellW * 0.5),
      height: Math.ceil((rows - 1) * stepY + hexH),
    };
  }
  if (shape === "triangle") {
    const triH = cellW * Math.sqrt(3) / 2;
    const stepX = cellW * 0.5;
    return {
      width: Math.ceil(cols * stepX + cellW * 0.5),
      height: Math.ceil(rows * triH),
    };
  }
  if (shape === "pentagon") {
    return measurePentagonBoard(rows, cols, cellW);
  }
  if (shape === "irregular") {
    const mesh = buildIrregularMesh(rows, cols, scale, seed);
    return { width: mesh.width, height: mesh.height };
  }
  return { width: Math.ceil(cols * cellW), height: Math.ceil(rows * cellH) };
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private sheet: HTMLImageElement | null;
  scale: number;

  // Off-screen canvas for drawing inverted/flipped sprites
  private invertCanvas: HTMLCanvasElement;
  private invertCtx: CanvasRenderingContext2D;
  private currentShape: GridShape = "square";
  private gridRows = 0;
  private gridCols = 0;
  private pentagonOffsetX = 0;
  private pentagonOffsetY = 0;
  private irregularMesh: IrregularMesh | null = null;

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

  resize(rows: number, cols: number, shape: GridShape = "square", seed = 0): void {
    this.currentShape = shape;
    this.gridRows = rows;
    this.gridCols = cols;
    let w = 0;
    let h = 0;

    if (shape === "pentagon") {
      const cellW = CELL_SIZE * this.scale;
      const bounds = getPentagonBoardBounds(rows, cols, cellW);
      const pad = cellW * 0.02;
      this.pentagonOffsetX = pad - bounds.minX;
      this.pentagonOffsetY = pad - bounds.minY;
      w = Math.ceil(Math.max(0, bounds.maxX - bounds.minX) + pad * 2);
      h = Math.ceil(Math.max(0, bounds.maxY - bounds.minY) + pad * 2);
      this.irregularMesh = null;
    } else if (shape === "irregular") {
      this.pentagonOffsetX = 0;
      this.pentagonOffsetY = 0;
      this.irregularMesh = buildIrregularMesh(rows, cols, this.scale, seed);
      w = this.irregularMesh.width;
      h = this.irregularMesh.height;
    } else {
      this.pentagonOffsetX = 0;
      this.pentagonOffsetY = 0;
      this.irregularMesh = null;
      const size = measureBoardPixels(rows, cols, shape, this.scale);
      w = size.width;
      h = size.height;
    }

    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.imageSmoothingEnabled = false;
  }

  pixelToCell(px: number, py: number): { row: number; col: number } | null {
    if (px < 0 || py < 0) return null;
    if (px >= this.canvas.width || py >= this.canvas.height) return null;

    if (this.currentShape === "square") {
      const col = Math.floor(px / (CELL_SIZE * this.scale));
      const row = Math.floor(py / (CELL_HEIGHT * this.scale));
      if (col < 0 || row < 0) return null;
      if (row >= this.gridRows || col >= this.gridCols) return null;
      return { row, col };
    }

    const cellW = CELL_SIZE * this.scale;
    const cellH = CELL_HEIGHT * this.scale;

    if (this.currentShape === "hex") {
      const hexH = cellW * 2 / Math.sqrt(3);
      const stepY = hexH * 0.75;
      const rowGuess = Math.floor(py / stepY);
      for (let rr = rowGuess - 1; rr <= rowGuess + 1; rr++) {
        if (rr < 0 || rr >= this.gridRows) continue;
        const rowOffsetX = rr % 2 === 0 ? 0 : cellW * 0.5;
        const colGuess = Math.floor((px - rowOffsetX) / cellW);
        for (let cc = colGuess - 1; cc <= colGuess + 1; cc++) {
          if (cc < 0 || cc >= this.gridCols) continue;
          if (this.pointInCellPolygon(rr, cc, px, py)) return { row: rr, col: cc };
        }
      }
      return null;
    }

    if (this.currentShape === "pentagon") {
      const stepY = CELL_SIZE * this.scale * pentagonStepY();
      const stepX = CELL_SIZE * this.scale * pentagonStepX();
      const rowGuess = Math.floor(py / stepY);
      for (let rr = rowGuess - 2; rr <= rowGuess + 2; rr++) {
        if (rr < 0 || rr >= this.gridRows) continue;
        const rowOffsetX =
          (PENTAGON_CENTER_MARGIN + (rr % 2 === 0 ? 0 : pentagonRowOffset())) *
          CELL_SIZE *
          this.scale;
        const flowerGuess = Math.floor((px - rowOffsetX) / stepX);
        for (let ff = flowerGuess - 2; ff <= flowerGuess + 2; ff++) {
          if (ff < 0) continue;
          for (let petal = 0; petal < PENTAGON_PETALS; petal++) {
            const cc = ff * PENTAGON_PETALS + petal;
            if (cc < 0 || cc >= this.gridCols) continue;
            if (this.pointInCellPolygon(rr, cc, px, py)) return { row: rr, col: cc };
          }
        }
      }
      return null;
    }

    if (this.currentShape === "irregular") {
      if (!this.irregularMesh) return null;
      for (let rr = 0; rr < this.gridRows; rr++) {
        for (let cc = 0; cc < this.gridCols; cc++) {
          if (this.pointInCellPolygon(rr, cc, px, py)) return { row: rr, col: cc };
        }
      }
      return null;
    }

    const triH = cellW * Math.sqrt(3) / 2;
    const stepX = cellW * 0.5;
    const rowGuess = Math.floor(py / triH);
    const colGuess = Math.floor(px / stepX);
    for (let rr = rowGuess - 1; rr <= rowGuess + 1; rr++) {
      if (rr < 0) continue;
      for (let cc = colGuess - 1; cc <= colGuess + 1; cc++) {
        if (cc < 0) continue;
        if (rr >= this.gridRows || cc >= this.gridCols) continue;
        if (this.pointInCellPolygon(rr, cc, px, py)) return { row: rr, col: cc };
      }
    }
    return null;
  }

  renderBoard(
    game: Game,
    pressedCell: { row: number; col: number } | null = null,
    viewport?: { originRow: number; originCol: number; rows: number; cols: number },
  ): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const originRow = viewport?.originRow ?? 0;
    const originCol = viewport?.originCol ?? 0;
    const viewRows = viewport?.rows ?? game.rows;
    const viewCols = viewport?.cols ?? game.cols;

    for (let vr = 0; vr < viewRows; vr++) {
      for (let vc = 0; vc < viewCols; vc++) {
        const gr = originRow + vr;
        const gc = originCol + vc;
        if (gr < 0 || gc < 0 || gr >= game.rows || gc >= game.cols) continue;
        const isPressed = pressedCell !== null && pressedCell.row === gr && pressedCell.col === gc;
        const view = game.cellView(gr, gc);
        this.renderCell({ ...view, row: vr, col: vc }, game.status, isPressed);
      }
    }
  }

  renderCell(view: CellView, status: GameStatus, isPressed = false): void {
    if (this.currentShape !== "square") {
      this.renderCellGeometric(view, status, isPressed);
      return;
    }

    const dx = view.col * CELL_SIZE * this.scale;
    const dy = view.row * CELL_HEIGHT * this.scale;
    const dw = CELL_SIZE * this.scale;
    const dh = CELL_HEIGHT * this.scale;
    const fb = this.useFallback;

    const lost = status === GameStatus.Lost;
    const mc = view.mineCount ?? 0;

    if (isPressed && status === GameStatus.Playing && !view.opened && view.markerCount === 0) {
      if (fb) {
        drawCellOpen(this.ctx, dx, dy, dw, dh);
      } else {
        this.drawSprite(SPRITE_CELL_OPEN, dx, dy, dw, dh);
      }
      return;
    }

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
        // Wrong marker: bomb + cross overlay
        if (fb) {
          drawCellOpen(this.ctx, dx, dy, dw, dh);
          drawBombCross(this.ctx, Math.abs(view.markerCount), dx, dy, dw, dh);
        } else {
          this.drawSprite(SPRITE_CELL_OPEN, dx, dy, dw, dh);
          this.drawBombSprite(view.markerCount, dx, dy, dw, dh, false);
          this.drawSprite(SPRITE_CROSS, dx, dy, dw, dh);
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

  private renderCellGeometric(view: CellView, status: GameStatus, isPressed = false): void {
    const g = this.getCellGeometry(view.row, view.col);
    const fb = this.useFallback;
    const lost = status === GameStatus.Lost;
    const mc = view.mineCount ?? 0;

    const shouldOpenForReveal = lost && mc !== 0 && view.markerCount === 0;
    const baseOpen = view.opened || shouldOpenForReveal || view.wrongMarker || isPressed;

    // Compute inset square for content sprites, centered on polygon centroid
    const insetFactor =
      this.currentShape === "hex" ? 0.65 : this.currentShape === "irregular" ? 0.6 : 0.55;
    let cx = 0, cy = 0;
    for (const p of g.points) { cx += p.x; cy += p.y; }
    cx /= g.points.length;
    cy /= g.points.length;
    const side = Math.min(g.dw, g.dh) * insetFactor;
    const ix = cx - side * 0.5;
    const iy = cy - side * 0.5;
    const iw = side;
    const ih = side;

    if (baseOpen) {
      this.drawOpenCellFill(g.points, view.exploded);
      this.drawCellOutline(g.points);
    } else {
      this.drawCellBevel(g.points, this.currentShape);
    }

    if (view.exploded) {
      this.withCellClip(g.points, () => this.drawBombSprite(mc, ix, iy, iw, ih, fb));
      return;
    }

    if (view.opened) {
      if (mc !== 0) {
        this.withCellClip(g.points, () => this.drawBombSprite(mc, ix, iy, iw, ih, fb));
      } else {
        this.withCellClip(g.points, () => {
          const h = view.hint ?? 0;
          if (fb) {
            if (h !== 0 || view.adjacentMines) drawHintNumber(this.ctx, h, ix, iy, iw, ih, view.adjacentMines);
          } else {
            this.renderHint(h, view.adjacentMines, ix, iy, iw, ih);
          }
        });
      }
      return;
    }

    if (shouldOpenForReveal) {
      this.withCellClip(g.points, () => this.drawBombSprite(mc, ix, iy, iw, ih, fb));
      return;
    }

    if (view.wrongMarker) {
      this.withCellClip(g.points, () => {
        this.drawBombSprite(view.markerCount, ix, iy, iw, ih, fb);
        if (fb) {
          drawBombCross(this.ctx, Math.abs(view.markerCount), ix, iy, iw, ih);
        } else {
          this.drawSprite(SPRITE_CROSS, ix, iy, iw, ih);
        }
      });
      return;
    }

    if (view.markerCount !== 0) {
      this.withCellClip(g.points, () => {
        if (fb) drawFlag(this.ctx, Math.abs(view.markerCount), ix, iy, iw, ih);
        else this.drawFlagSprite(view.markerCount, ix, iy, iw, ih);
      });
    }
  }

  private drawOpenCellFill(points: Array<{ x: number; y: number }>, exploded: boolean): void {
    const ctx = this.ctx;
    this.tracePolygon(points);
    ctx.fillStyle = exploded ? "#ff0000" : "#c0c0c0";
    ctx.fill();
  }

  private drawCellOutline(points: Array<{ x: number; y: number }>): void {
    const ctx = this.ctx;
    ctx.save();
    this.tracePolygon(points);
    ctx.strokeStyle = "#808080";
    ctx.lineWidth = Math.max(1, this.scale * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  private drawCellBevel(points: Array<{ x: number; y: number }>, shape: string = "square"): void {
    const ctx = this.ctx;

    // Compute center
    let cx = 0, cy = 0;
    for (const p of points) { cx += p.x; cy += p.y; }
    cx /= points.length;
    cy /= points.length;

    // 1) Fill outer polygon by angular slices (edge midpoint direction from center).
    //    Highlight slices that face from straight-up to straight-left.
    ctx.save();
    this.tracePolygon(points);
    ctx.clip();

    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const mx = (a.x + b.x) * 0.5;
      const my = (a.y + b.y) * 0.5;
      const vx = mx - cx;
      const vy = my - cy;
      // Stable angular sector: highlight faces whose outward direction is
      // between left (180 deg) and up (270 deg), inclusive.
      let deg = (Math.atan2(vy, vx) * 180) / Math.PI;
      if (deg < 0) deg += 360;
      const eps = 0.001;
      const lit = deg >= (180 - eps) && deg <= (270 + eps);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.closePath();
      ctx.fillStyle = lit ? "#ffffff" : "#9a9a9a";
      ctx.fill();
    }

    ctx.restore();

    // 2) Draw inner (smaller) polygon filled with medium gray (the cell face)
    const inset = shape === "triangle" ? 0.62 : 0.78;
    const inner = points.map((p) => ({
      x: cx + (p.x - cx) * inset,
      y: cy + (p.y - cy) * inset,
    }));
    this.tracePolygon(inner);
    ctx.fillStyle = "#c0c0c0";
    ctx.fill();
  }

  private getCellGeometry(row: number, col: number): {
    dx: number;
    dy: number;
    dw: number;
    dh: number;
    points: Array<{ x: number; y: number }>;
  } {
    const dw = CELL_SIZE * this.scale;
    const dh = CELL_HEIGHT * this.scale;

    if (this.currentShape === "hex") {
      const hexH = dw * 2 / Math.sqrt(3);
      const stepY = hexH * 0.75;
      const dx = col * dw + (row % 2 === 0 ? 0 : dw * 0.5);
      const dy = row * stepY;
      const points = [
        { x: dx + dw * 0.5, y: dy },
        { x: dx + dw, y: dy + hexH * 0.25 },
        { x: dx + dw, y: dy + hexH * 0.75 },
        { x: dx + dw * 0.5, y: dy + hexH },
        { x: dx, y: dy + hexH * 0.75 },
        { x: dx, y: dy + hexH * 0.25 },
      ];
      return { dx, dy, dw, dh: hexH, points };
    }

    if (this.currentShape === "triangle") {
      const triH = dw * Math.sqrt(3) / 2;
      const stepX = dw * 0.5;
      const stepY = triH;
      const dx = col * stepX;
      const dy = row * stepY;
      const up = (row + col) % 2 === 0;
      const points = up
        ? [
            { x: dx, y: dy + triH },
            { x: dx + dw, y: dy + triH },
            { x: dx + dw * 0.5, y: dy },
          ]
        : [
            { x: dx, y: dy },
            { x: dx + dw, y: dy },
            { x: dx + dw * 0.5, y: dy + triH },
          ];
      return { dx, dy, dw, dh: triH, points };
    }

    if (this.currentShape === "pentagon") {
      const points = getPentagonPoints(row, col, dw).map((p) => ({
        x: p.x + this.pentagonOffsetX,
        y: p.y + this.pentagonOffsetY,
      }));
      const bounds = boundsOfPoints(points);
      return {
        dx: bounds.minX,
        dy: bounds.minY,
        dw: bounds.maxX - bounds.minX,
        dh: bounds.maxY - bounds.minY,
        points,
      };
    }

    if (this.currentShape === "irregular" && this.irregularMesh) {
      const idx = row * this.gridCols + col;
      const quad = this.irregularMesh.quads[idx];
      if (!quad) {
        const dx = col * dw;
        const dy = row * dh;
        const points = [
          { x: dx, y: dy },
          { x: dx + dw, y: dy },
          { x: dx + dw, y: dy + dh },
          { x: dx, y: dy + dh },
        ];
        return { dx, dy, dw, dh, points };
      }
      const points = quad.map((p) => ({
        x: p.x + this.irregularMesh!.offsetX,
        y: p.y + this.irregularMesh!.offsetY,
      }));
      const bounds = boundsOfPoints(points);
      return {
        dx: bounds.minX,
        dy: bounds.minY,
        dw: bounds.maxX - bounds.minX,
        dh: bounds.maxY - bounds.minY,
        points,
      };
    }

    const dx = col * dw;
    const dy = row * dh;
    const points = [
      { x: dx, y: dy },
      { x: dx + dw, y: dy },
      { x: dx + dw, y: dy + dh },
      { x: dx, y: dy + dh },
    ];
    return { dx, dy, dw, dh, points };
  }

  private tracePolygon(points: Array<{ x: number; y: number }>): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
  }

  private withCellClip(points: Array<{ x: number; y: number }>, draw: () => void): void {
    this.ctx.save();
    this.tracePolygon(points);
    this.ctx.clip();
    draw();
    this.ctx.restore();
  }

  private pointInCellPolygon(row: number, col: number, px: number, py: number): boolean {
    const { points } = this.getCellGeometry(row, col);
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x;
      const yi = points[i].y;
      const xj = points[j].x;
      const yj = points[j].y;
      const intersect =
        (yi > py) !== (yj > py) &&
        px < ((xj - xi) * (py - yi)) / ((yj - yi) || Number.EPSILON) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
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

  renderHintOverlay(
    row: number,
    col: number,
    rows: number,
    cols: number,
    topology: TopologyMode,
    seed = 0,
    originRow = 0,
    originCol = 0,
  ): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";

    const targets = [
      { row, col },
      ...neighboursForGrid(row, col, rows, cols, topology, this.currentShape, seed),
    ];

    for (const { row: r, col: c } of targets) {
      if (r >= originRow && r < originRow + rows && c >= originCol && c < originCol + cols) {
        const localR = r - originRow;
        const localC = c - originCol;
        if (this.currentShape === "square") {
          const dx = localC * CELL_SIZE * this.scale;
          const dy = localR * CELL_HEIGHT * this.scale;
          const dw = CELL_SIZE * this.scale;
          const dh = CELL_HEIGHT * this.scale;
          ctx.fillRect(dx, dy, dw, dh);
        } else {
          const g = this.getCellGeometry(localR, localC);
          this.tracePolygon(g.points);
          ctx.fill();
        }
      }
    }
  }
}
