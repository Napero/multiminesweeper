export enum SmileyState {
  Happy,
  HappyPressed,
  Surprised,
  Cool,
  Dead,
}

const FRAME = 26;
const DISPLAY_SIZE = 52;

// Frame order in smiley.png: happy, happy_pressed, surprised, sunglasses, dead
const FRAME_INDEX: Record<SmileyState, number> = {
  [SmileyState.Happy]: 0,
  [SmileyState.HappyPressed]: 1,
  [SmileyState.Surprised]: 2,
  [SmileyState.Cool]: 3,
  [SmileyState.Dead]: 4,
};

export class Smiley {
  private ctx: CanvasRenderingContext2D;
  private sheet: HTMLImageElement | null = null;
  ready: Promise<void>;

  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = FRAME;
    canvas.height = FRAME;
    canvas.style.width = `${DISPLAY_SIZE}px`;
    canvas.style.height = `${DISPLAY_SIZE}px`;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.ready = this.loadSheet();
  }

  private async loadSheet(): Promise<void> {
    try {
      const img = new Image();
      img.src = `${import.meta.env.BASE_URL}sprites/smiley.png`;
      await img.decode();
      this.sheet = img;
    } catch {
      console.warn("smiley.png not loaded, using fallback circle");
    }
    this.draw(SmileyState.Happy);
  }

  draw(state: SmileyState): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, FRAME, FRAME);

    if (this.sheet) {
      const sx = FRAME_INDEX[state] * FRAME;
      ctx.drawImage(this.sheet, sx, 0, FRAME, FRAME, 0, 0, FRAME, FRAME);
    } else {
      // minimal yellow circle fallback
      ctx.fillStyle = "#c0c0c0";
      ctx.fillRect(0, 0, FRAME, FRAME);
      ctx.fillStyle = "#ffff00";
      ctx.beginPath();
      ctx.arc(FRAME / 2, FRAME / 2, FRAME * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}
