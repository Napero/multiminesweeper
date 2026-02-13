// Win95-style canvas fallback when the spritesheet is missing

import { CELL_SIZE, CELL_HEIGHT } from "../sprites";

const W = CELL_SIZE;
const H = CELL_HEIGHT;

const COL_BG = "#c0c0c0";
const COL_LIGHT = "#ffffff";
const COL_DARK = "#808080";
const COL_DARKER = "#404040";
const COL_OPEN_BG = "#c0c0c0";
const COL_RED = "#ff0000";
const COL_BLACK = "#000000";

const HINT_COLORS: Record<number, string> = {
  0: "transparent",
  1: "#0000ff",
  2: "#008000",
  3: "#ff0000",
  4: "#000080",
  5: "#800000",
  6: "#008080",
  7: "#000000",
  8: "#808080",
  9: "#800080",
};

function hintColor(n: number): string {
  if (n <= 9) return HINT_COLORS[n] ?? COL_BLACK;
  // For 10+, use first digit's colour
  return HINT_COLORS[Math.floor(n / 10)] ?? COL_BLACK;
}

export function drawCellClosed(
  ctx: CanvasRenderingContext2D,
  dx: number, dy: number, dw: number, dh: number,
): void {
  const bevel = Math.max(1, Math.round(dw / 8));
  ctx.fillStyle = COL_BG;
  ctx.fillRect(dx, dy, dw, dh);
  ctx.fillStyle = COL_LIGHT;
  ctx.fillRect(dx, dy, dw, bevel);
  ctx.fillRect(dx, dy, bevel, dh);
  ctx.fillStyle = COL_DARK;
  ctx.fillRect(dx, dy + dh - bevel, dw, bevel);
  ctx.fillRect(dx + dw - bevel, dy, bevel, dh);
  ctx.fillStyle = COL_DARKER;
  ctx.fillRect(dx + dw - bevel, dy + dh - bevel, bevel, bevel);
}

export function drawCellOpen(
  ctx: CanvasRenderingContext2D,
  dx: number, dy: number, dw: number, dh: number,
): void {
  ctx.fillStyle = COL_OPEN_BG;
  ctx.fillRect(dx, dy, dw, dh);
  ctx.strokeStyle = COL_DARK;
  ctx.lineWidth = 1;
  ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
}

export function drawRedBg(
  ctx: CanvasRenderingContext2D,
  dx: number, dy: number, dw: number, dh: number,
): void {
  ctx.fillStyle = COL_RED;
  ctx.fillRect(dx, dy, dw, dh);
}

export function drawHintNumber(
  ctx: CanvasRenderingContext2D,
  hint: number,
  dx: number, dy: number, dw: number, dh: number,
  showZero = false,
): void {
  if (hint === 0 && !showZero) return;
  const text = String(hint);
  ctx.fillStyle = hintColor(hint);
  ctx.font = `bold ${Math.round(dh * 0.75)}px "Courier New", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, dx + dw / 2, dy + dh / 2 + 1);
}

export function drawFlag(
  ctx: CanvasRenderingContext2D,
  count: number,
  dx: number, dy: number, dw: number, dh: number,
): void {
  const cx = dx + dw / 2;
  const cy = dy + dh / 2;
  const sz = dw * 0.25;

  ctx.strokeStyle = COL_BLACK;
  ctx.lineWidth = Math.max(1, dw / 16);
  ctx.beginPath();
  ctx.moveTo(cx, cy - sz * 1.2);
  ctx.lineTo(cx, cy + sz);
  ctx.stroke();

  ctx.fillStyle = COL_RED;
  ctx.beginPath();
  ctx.moveTo(cx, cy - sz * 1.2);
  ctx.lineTo(cx + sz * 1.2, cy - sz * 0.4);
  ctx.lineTo(cx, cy + sz * 0.2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = COL_BLACK;
  ctx.fillRect(cx - sz * 0.8, cy + sz, sz * 1.6, dh * 0.1);

  if (count > 1) {
    const badgeR = dw * 0.18;
    ctx.fillStyle = "#000080";
    ctx.beginPath();
    ctx.arc(dx + dw * 0.78, dy + dh * 0.22, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COL_LIGHT;
    ctx.font = `bold ${Math.round(badgeR * 1.5)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(count), dx + dw * 0.78, dy + dh * 0.23);
  }
}

export function drawBomb(
  ctx: CanvasRenderingContext2D,
  count: number,
  dx: number, dy: number, dw: number, dh: number,
): void {
  const cx = dx + dw / 2;
  const cy = dy + dh / 2;
  const r = dw * 0.25;

  ctx.fillStyle = COL_BLACK;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  const spike = r * 1.5;
  ctx.strokeStyle = COL_BLACK;
  ctx.lineWidth = Math.max(1, dw / 16);
  for (let a = 0; a < 8; a++) {
    const angle = (a / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * r * 0.6, cy + Math.sin(angle) * r * 0.6);
    ctx.lineTo(cx + Math.cos(angle) * spike, cy + Math.sin(angle) * spike);
    ctx.stroke();
  }

  ctx.fillStyle = COL_LIGHT;
  ctx.beginPath();
  ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.2, 0, Math.PI * 2);
  ctx.fill();

  if (count > 1) {
    const badgeR = dw * 0.18;
    ctx.fillStyle = COL_RED;
    ctx.beginPath();
    ctx.arc(dx + dw * 0.8, dy + dh * 0.2, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COL_LIGHT;
    ctx.font = `bold ${Math.round(badgeR * 1.5)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(count), dx + dw * 0.8, dy + dh * 0.21);
  }
}

export function drawBombCross(
  ctx: CanvasRenderingContext2D,
  count: number,
  dx: number, dy: number, dw: number, dh: number,
): void {
  drawBomb(ctx, count, dx, dy, dw, dh);
  const margin = dw * 0.15;
  ctx.strokeStyle = COL_RED;
  ctx.lineWidth = Math.max(2, dw / 8);
  ctx.beginPath();
  ctx.moveTo(dx + margin, dy + margin);
  ctx.lineTo(dx + dw - margin, dy + dh - margin);
  ctx.moveTo(dx + dw - margin, dy + margin);
  ctx.lineTo(dx + margin, dy + dh - margin);
  ctx.stroke();
}
