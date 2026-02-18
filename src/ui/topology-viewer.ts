import { TopologyMode } from "../engine/types";

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface FaceUV {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  index: number;
}

export interface TopologyPreviewCell {
  opened: boolean;
  markerCount: number;
  exploded: boolean;
  wrongMarker: boolean;
  hint: number | null;
  mineCount: number | null;
}

const HINT_COLORS: Record<number, string> = {
  1: "#0000ff",
  2: "#008000",
  3: "#ff0000",
  4: "#000080",
  5: "#800000",
  6: "#008080",
  7: "#000000",
  8: "#606060",
  9: "#800080",
};

export class TopologyViewer {
  private ctx: CanvasRenderingContext2D;
  private animId: number | null = null;
  private topology: TopologyMode = "plane";
  private rows = 16;
  private cols = 30;
  private cells: TopologyPreviewCell[] = [];
  private faces: FaceUV[] = [];

  private yaw = 0.4;
  private pitch = -0.5;
  private zoom = 1.3;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.attachInput();
  }

  setBoard(topology: TopologyMode, rows: number, cols: number, cells: TopologyPreviewCell[]): void {
    this.topology = topology;
    this.rows = Math.max(2, rows);
    this.cols = Math.max(2, cols);
    this.cells = cells;
    this.rebuildFaces();
    this.render();
  }

  start(): void {
    if (this.animId !== null) return;
    this.animId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  private loop = (): void => {
    this.render();
    this.animId = requestAnimationFrame(this.loop);
  };

  private attachInput(): void {
    this.canvas.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    this.canvas.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.yaw += dx * 0.012;
      this.pitch -= dy * 0.008;
      const maxPitch = Math.PI * 0.47;
      if (this.pitch < -maxPitch) this.pitch = -maxPitch;
      if (this.pitch > maxPitch) this.pitch = maxPitch;
      e.preventDefault();
    });

    this.canvas.addEventListener("pointerup", (e) => {
      this.dragging = false;
      this.canvas.releasePointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointercancel", (e) => {
      this.dragging = false;
      this.canvas.releasePointerCapture(e.pointerId);
    });

    this.canvas.addEventListener(
      "wheel",
      (e) => {
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        this.zoom *= factor;
        if (this.zoom < 0.45) this.zoom = 0.45;
        if (this.zoom > 8) this.zoom = 8;
        e.preventDefault();
      },
      { passive: false },
    );

    this.canvas.addEventListener("dblclick", () => {
      this.yaw = 0.4;
      this.pitch = -0.5;
      this.zoom = 1.3;
    });
  }

  private rebuildFaces(): void {
    const out: FaceUV[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        out.push({
          u0: c / this.cols,
          v0: r / this.rows,
          u1: (c + 1) / this.cols,
          v1: (r + 1) / this.rows,
          index: r * this.cols + c,
        });
      }
    }
    this.faces = out;
  }

  private surfacePoint(u: number, v: number): Vec3 {
    const U = u * Math.PI * 2;
    const V = v * Math.PI * 2;

    if (this.topology === "plane") {
      return { x: (u - 0.5) * 2.25, y: (v - 0.5) * 1.65, z: 0 };
    }

    if (this.topology === "cylinder") {
      const r = 0.78;
      const h = 1.9;
      return { x: r * Math.cos(U), y: (v - 0.5) * h, z: r * Math.sin(U) };
    }

    if (this.topology === "torus") {
      const R = 0.95;
      const r = 0.37;
      return {
        x: (R + r * Math.cos(V)) * Math.cos(U),
        y: r * Math.sin(V),
        z: (R + r * Math.cos(V)) * Math.sin(U),
      };
    }

    if (this.topology === "mobius") {
      const R = 0.95;
      const t = (v - 0.5) * 0.92;
      return {
        x: (R + t * Math.cos(U * 0.5)) * Math.cos(U),
        y: t * Math.sin(U * 0.5),
        z: (R + t * Math.cos(U * 0.5)) * Math.sin(U),
      };
    }

    if (this.topology === "klein") {
      const u2 = U;
      const v2 = V;
      let x = 0;
      let z = 0;
      if (u2 < Math.PI) {
        x = 3 * Math.cos(u2) * (1 + Math.sin(u2)) + 2 * (1 - Math.cos(u2) * 0.5) * Math.cos(u2) * Math.cos(v2);
        z = -8 * Math.sin(u2) - 2 * (1 - Math.cos(u2) * 0.5) * Math.sin(u2) * Math.cos(v2);
      } else {
        x = 3 * Math.cos(u2) * (1 + Math.sin(u2)) + 2 * (1 - Math.cos(u2) * 0.5) * Math.cos(v2 + Math.PI);
        z = -8 * Math.sin(u2);
      }
      const y = -2 * (1 - Math.cos(u2) * 0.5) * Math.sin(v2);
      return { x: x * 0.12, y: y * 0.12, z: z * 0.12 };
    }

    const u2 = u * Math.PI;
    const v2 = V;
    const s = Math.sin(u2);
    const c = Math.cos(u2);
    return {
      x: 0.98 * s * Math.cos(v2),
      y: 0.72 * s * Math.sin(v2),
      z: 0.58 * c * Math.sin(v2 * 0.5),
    };
  }

  private rotate(p: Vec3): Vec3 {
    const ry = this.yaw;
    const rx = this.pitch;
    const cosy = Math.cos(ry);
    const siny = Math.sin(ry);
    const cosx = Math.cos(rx);
    const sinx = Math.sin(rx);

    const x1 = p.x * cosy + p.z * siny;
    const z1 = -p.x * siny + p.z * cosy;
    const y2 = p.y * cosx - z1 * sinx;
    const z2 = p.y * sinx + z1 * cosx;
    return { x: x1, y: y2, z: z2 };
  }

  private projectNormalized(p: Vec3): { x: number; y: number; z: number; ok: boolean } {
    const camera = 3.9;
    const d = camera - p.z;
    if (d <= 0.1) return { x: 0, y: 0, z: p.z, ok: false };
    return { x: p.x / d, y: p.y / d, z: p.z, ok: true };
  }

  private cellFill(index: number): string {
    const c = this.cells[index];
    if (!c) return "#7e8799";
    if (c.exploded) return "#ff0000";
    if (c.wrongMarker) return "#a03030";
    if (c.markerCount !== 0) return "#b65555";
    if (c.opened) return "#c7cfd8";
    return "#808b9f";
  }

  private cellStroke(index: number): string {
    const c = this.cells[index];
    if (!c) return "rgba(30,35,46,0.95)";
    if (c.markerCount !== 0) return "rgba(90,25,25,0.95)";
    if (c.opened) return "rgba(85,95,110,0.95)";
    return "rgba(40,46,58,0.95)";
  }

  private cellLabel(index: number): { text: string; color: string } | null {
    const c = this.cells[index];
    if (!c) return null;
    if (c.markerCount !== 0) {
      const n = Math.abs(c.markerCount);
      return { text: n === 1 ? "F" : `F${n}`, color: "#200000" };
    }
    if (c.mineCount !== null && c.mineCount !== 0) {
      return { text: "*", color: "#000000" };
    }
    if (c.opened && c.hint !== null && c.hint !== 0) {
      const abs = Math.abs(c.hint);
      const key = abs <= 9 ? abs : Math.floor(abs / 10);
      return { text: String(c.hint), color: HINT_COLORS[key] ?? "#000000" };
    }
    return null;
  }

  private render(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#1f2430";
    ctx.fillRect(0, 0, w, h);

    const projectedFaces: Array<{
      index: number;
      z: number;
      p: Array<{ x: number; y: number; z: number }>;
    }> = [];

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const f of this.faces) {
      const p0 = this.projectNormalized(this.rotate(this.surfacePoint(f.u0, f.v0)));
      const p1 = this.projectNormalized(this.rotate(this.surfacePoint(f.u1, f.v0)));
      const p2 = this.projectNormalized(this.rotate(this.surfacePoint(f.u1, f.v1)));
      const p3 = this.projectNormalized(this.rotate(this.surfacePoint(f.u0, f.v1)));
      if (!p0.ok || !p1.ok || !p2.ok || !p3.ok) continue;
      const arr = [p0, p1, p2, p3];

      for (const p of arr) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      projectedFaces.push({
        index: f.index,
        z: (p0.z + p1.z + p2.z + p3.z) * 0.25,
        p: arr,
      });
    }

    if (!projectedFaces.length) return;

    const spanX = Math.max(1e-6, maxX - minX);
    const spanY = Math.max(1e-6, maxY - minY);
    const fitScale = Math.min((w * 0.84) / spanX, (h * 0.78) / spanY);
    const scale = fitScale * this.zoom;
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;

    const toScreen = (p: { x: number; y: number }): { x: number; y: number } => ({
      x: w * 0.5 + (p.x - cx) * scale,
      y: h * 0.54 + (p.y - cy) * scale,
    });

    projectedFaces.sort((a, b) => a.z - b.z);

    ctx.lineWidth = 1;
    for (const face of projectedFaces) {
      const pts = face.p.map(toScreen);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.lineTo(pts[2].x, pts[2].y);
      ctx.lineTo(pts[3].x, pts[3].y);
      ctx.closePath();
      ctx.fillStyle = this.cellFill(face.index);
      ctx.fill();
      ctx.strokeStyle = this.cellStroke(face.index);
      ctx.stroke();

      const area = Math.abs(
        (pts[0].x * pts[1].y - pts[1].x * pts[0].y) +
          (pts[1].x * pts[2].y - pts[2].x * pts[1].y) +
          (pts[2].x * pts[3].y - pts[3].x * pts[2].y) +
          (pts[3].x * pts[0].y - pts[0].x * pts[3].y),
      ) * 0.5;
      if (area < 36) continue;
      const label = this.cellLabel(face.index);
      if (!label) continue;

      const cxFace = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) * 0.25;
      const cyFace = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) * 0.25;
      const fontPx = Math.max(7, Math.min(17, Math.sqrt(area) * 0.28));
      ctx.font = `bold ${fontPx}px 'Pixelated MS Sans Serif', Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.fillStyle = label.color;
      ctx.strokeText(label.text, cxFace, cyFace + 0.5);
      ctx.fillText(label.text, cxFace, cyFace + 0.5);
    }

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "11px 'Pixelated MS Sans Serif', Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`${this.topology} topology`, 8, 8);
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fillText(`${this.rows}x${this.cols} cells`, 8, 22);
    ctx.fillText("Drag rotate, wheel zoom, dbl-click reset", 8, 36);
  }
}
