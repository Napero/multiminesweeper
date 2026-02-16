// Sprite-based toolbar button using buttons.png (52×130, 2 cols × 5 rows of 26×26)
// Column 0 = normal, column 1 = pressed
// Rows: 0=giveup, 1=settings, 2=hint, 3=help, 4=empty

const SIZE = 26;
const DISPLAY_SIZE = 52;

export type ButtonKind = "giveup" | "settings" | "hint" | "help";

const ROW: Record<ButtonKind, number> = {
  giveup: 0,
  settings: 1,
  hint: 2,
  help: 3,
};

let sharedSheet: HTMLImageElement | null = null;
let sheetPromise: Promise<HTMLImageElement | null> | null = null;

function loadButtonSheet(): Promise<HTMLImageElement | null> {
  if (sheetPromise) return sheetPromise;
  sheetPromise = new Promise((resolve) => {
    const img = new Image();
    img.src = `${import.meta.env.BASE_URL}sprites/buttons.png`;
    img.onload = () => { sharedSheet = img; resolve(img); };
    img.onerror = () => { resolve(null); };
  });
  return sheetPromise;
}

export class ToolbarButton {
  private ctx: CanvasRenderingContext2D;
  private sheet: HTMLImageElement | null = null;
  private row: number;
  private active = false;
  ready: Promise<void>;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private kind: ButtonKind,
    private onClick: () => void,
  ) {
    canvas.width = SIZE;
    canvas.height = SIZE;
    canvas.style.width = `${DISPLAY_SIZE}px`;
    canvas.style.height = `${DISPLAY_SIZE}px`;
    canvas.style.cursor = "pointer";
    canvas.style.imageRendering = "pixelated";
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.row = ROW[kind];

    canvas.addEventListener("mousedown", (e) => { e.preventDefault(); this.drawPressed(); });
    canvas.addEventListener("mouseup", () => { this.drawNormal(); this.onClick(); });
    canvas.addEventListener("mouseleave", () => { if (!this.active) this.drawNormal(); else this.drawPressed(); });

    this.ready = loadButtonSheet().then((img) => {
      this.sheet = img;
      this.drawNormal();
    });
  }

  // Keep the button visually "pressed" (e.g. hint active state)
  setActive(on: boolean): void {
    this.active = on;
    if (on) this.drawPressed(); else this.drawNormal();
  }

  private drawNormal(): void {
    this.blit(0);
  }

  private drawPressed(): void {
    this.blit(1);
  }

  private blit(col: number): void {
    this.ctx.clearRect(0, 0, SIZE, SIZE);
    if (this.sheet) {
      this.ctx.drawImage(
        this.sheet,
        col * SIZE, this.row * SIZE, SIZE, SIZE,
        0, 0, SIZE, SIZE,
      );
    } else {
      // text fallback
      this.ctx.fillStyle = col === 1 ? "#a0a0a0" : "#c0c0c0";
      this.ctx.fillRect(0, 0, SIZE, SIZE);
      this.ctx.fillStyle = "#000";
      this.ctx.font = "bold 9px sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      const label = this.kind === "giveup" ? "GU" : this.kind.slice(0, 2).toUpperCase();
      this.ctx.fillText(label, SIZE / 2, SIZE / 2);
    }
  }
}
