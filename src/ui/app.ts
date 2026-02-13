import { Game, GameConfig, DEFAULT_CONFIG, GameStatus } from "../engine/index";
import { Renderer } from "./renderer";
import { InputHandler } from "./input";
import { loadSpritesheet } from "../sprites";
import { CELL_SIZE, CELL_HEIGHT, SPRITE_FLAG, SPRITE_BOMB, SpriteRect } from "../sprites";
import { Smiley, SmileyState } from "./smiley";
import { ToolbarButton } from "./toolbar-button";
import { drawFlag, drawBomb } from "./fallback";

const PRESETS: Record<string, Partial<GameConfig>> = {
  beginner:     { rows: 9,  cols: 9,  minesTotal: 30,  maxMinesPerCell: 4, density: 0.7 },
  intermediate: { rows: 16, cols: 16, minesTotal: 60,  maxMinesPerCell: 5, density: 0.6 },
  hard:         { rows: 16, cols: 30, minesTotal: 170, maxMinesPerCell: 6, density: 0.6 },
  expert:       { rows: 16, cols: 30, minesTotal: 250, maxMinesPerCell: 6, density: 0.6 },
  nightmare:    { rows: 20, cols: 35, minesTotal: 450, maxMinesPerCell: 6, density: 0.45 },
  "hard-negative": { rows: 16, cols: 30, minesTotal: 170, maxMinesPerCell: 6, density: 0.6, negativeMines: true },
};

export function readConfigFromModal(): Partial<GameConfig> {
  const val = (id: string, fallback: number) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    const n = el ? parseInt(el.value, 10) : NaN;
    return isNaN(n) ? fallback : n;
  };
  const seedEl = document.getElementById("opt-seed") as HTMLInputElement | null;
  const seedStr = seedEl?.value.trim() ?? "";
  const seed = seedStr === "" ? Date.now() : hashString(seedStr);
  const density = val("opt-density", 60) / 100;
  const negEl = document.getElementById("opt-negative") as HTMLInputElement | null;
  const negativeMines = negEl?.checked ?? false;

  return {
    rows: val("opt-rows", 16),
    cols: val("opt-cols", 30),
    minesTotal: val("opt-mines", 99),
    maxMinesPerCell: val("opt-max", 6),
    seed,
    density,
    negativeMines,
  };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

export class App {
  private game!: Game;
  private renderer!: Renderer;
  private input!: InputHandler;
  private canvas: HTMLCanvasElement;
  private config: Partial<GameConfig>;
  private sheet: HTMLImageElement | null = null;
  private smiley!: Smiley;
  private hintBtn!: ToolbarButton;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private startTime = 0;
  private elapsedSeconds = 0;
  private timerStarted = false;
  private hintPending = false;
  private hintHoverPos: { row: number; col: number } | null = null;
  private hintCount = 0;

  constructor(canvas: HTMLCanvasElement, config: Partial<GameConfig> = {}) {
    this.canvas = canvas;
    this.config = config;
  }

  async init(): Promise<void> {
    try {
      this.sheet = await loadSpritesheet();
    } catch {
      console.warn("Spritesheet not found, using canvas fallback.");
      this.sheet = null;
    }

    // Smiley (new game on click)
    const smileyCanvas = document.getElementById("smiley") as HTMLCanvasElement;
    if (smileyCanvas) {
      this.smiley = new Smiley(smileyCanvas);
      await this.smiley.ready;
      smileyCanvas.addEventListener("mousedown", () => {
        if (this.game.status === GameStatus.Playing) {
          this.smiley.draw(SmileyState.HappyPressed);
        }
      });
      smileyCanvas.addEventListener("mouseup", () => this.newGame());
      smileyCanvas.addEventListener("mouseleave", () => this.updateSmiley());
    }

    // Sprite toolbar buttons
    const hintCanvas = document.getElementById("btn-hint") as HTMLCanvasElement;
    if (hintCanvas) {
      this.hintBtn = new ToolbarButton(hintCanvas, "hint", () => this.toggleHint());
      await this.hintBtn.ready;
    }

    const giveupCanvas = document.getElementById("btn-giveup") as HTMLCanvasElement;
    if (giveupCanvas) {
      const btn = new ToolbarButton(giveupCanvas, "giveup", () => this.giveUp());
      await btn.ready;
    }

    const settingsCanvas = document.getElementById("btn-settings") as HTMLCanvasElement;
    if (settingsCanvas) {
      const btn = new ToolbarButton(settingsCanvas, "settings", () => this.toggleSettingsDropdown());
      await btn.ready;
    }

    const helpCanvas = document.getElementById("btn-help") as HTMLCanvasElement;
    if (helpCanvas) {
      const btn = new ToolbarButton(helpCanvas, "help", () => window.open("https://github.com/Napero/multiminesweeper", "_blank"));
      await btn.ready;
    }

    // Settings dropdown: presets + custom
    document.querySelectorAll("#settings-dropdown .preset").forEach((el) => {
      el.addEventListener("click", () => {
        const preset = (el as HTMLElement).dataset.preset!;
        this.closeSettingsDropdown();
        if (preset === "custom") {
          this.openCustomModal();
        } else if (PRESETS[preset]) {
          this.newGame({ ...PRESETS[preset], seed: Date.now() });
        }
      });
    });

    // Close dropdown on outside click
    document.addEventListener("click", (e) => {
      const anchor = document.getElementById("settings-anchor");
      if (anchor && !anchor.contains(e.target as Node)) {
        this.closeSettingsDropdown();
      }
    });

    // Custom modal
    document.getElementById("custom-cancel")?.addEventListener("click", () => this.closeCustomModal());
    document.getElementById("custom-ok")?.addEventListener("click", () => {
      const cfg = readConfigFromModal();
      this.closeCustomModal();
      this.newGame(cfg);
    });

    // Density slider label sync
    const densitySlider = document.getElementById("opt-density") as HTMLInputElement | null;
    const densityLabel = document.getElementById("density-val");
    densitySlider?.addEventListener("input", () => {
      if (densityLabel) densityLabel.textContent = (parseInt(densitySlider.value, 10) / 100).toFixed(2);
    });

    window.addEventListener("resize", () => this.onResize());

    // Hint preview overlay on hover
    this.canvas.addEventListener("mousemove", (e) => {
      if (!this.hintPending || this.game.status !== GameStatus.Playing) {
        if (this.hintHoverPos) {
          this.hintHoverPos = null;
          this.render();
        }
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      const pos = this.renderer.pixelToCell(e.clientX - rect.left, e.clientY - rect.top);
      if (!pos) return;
      if (!this.hintHoverPos || this.hintHoverPos.row !== pos.row || this.hintHoverPos.col !== pos.col) {
        this.hintHoverPos = pos;
        this.render();
      }
    });
    this.canvas.addEventListener("mouseleave", () => {
      if (this.hintHoverPos) {
        this.hintHoverPos = null;
        this.render();
      }
    });

    this.newGame();
  }

  private toggleSettingsDropdown(): void {
    document.getElementById("settings-dropdown")?.classList.toggle("open");
  }

  private closeSettingsDropdown(): void {
    document.getElementById("settings-dropdown")?.classList.remove("open");
  }

  private openCustomModal(): void {
    document.getElementById("custom-overlay")?.classList.add("open");
  }

  private closeCustomModal(): void {
    document.getElementById("custom-overlay")?.classList.remove("open");
  }

  newGame(config?: Partial<GameConfig>): void {
    if (config) this.config = config;
    // Always generate a fresh seed for replays (smiley button);
    // explicit configs from presets/modal already have their own seed.
    if (!config) this.config.seed = Date.now();
    if (this.input) this.input.detach();

    this.game = new Game(this.config);
    const scale = this.computeScale();
    this.renderer = new Renderer(this.canvas, this.sheet, scale);
    this.renderer.resize(this.game.rows, this.game.cols);

    this.input = new InputHandler(
      this.canvas,
      (px, py) => this.renderer.pixelToCell(px, py),
      {
        onLeftClick: (r, c) => {
          this.startTimer();
          if (this.hintPending) {
            this.hintPending = false;
            this.hintHoverPos = null;
            this.hintBtn?.setActive(false);
            this.hintCount++;
            this.startTime -= this.hintCount * 10 * 1000;
            this.game.applyHint(r, c);
          } else {
            const cell = this.game.cell(r, c);
            if (cell.opened) {
              this.game.chordOpen(r, c);
            } else {
              this.game.open(r, c);
            }
          }
          if (this.game.status !== GameStatus.Playing) this.stopTimer();
          this.render();
        },
        onCycleMarker: (r, c, shift) => {
          this.startTimer();
          if (shift) {
            this.game.cycleMarkerDown(r, c);
          } else {
            this.game.cycleMarker(r, c);
          }
          this.render();
        },
        onChord: (r, c) => {
          this.startTimer();
          this.game.chordOpen(r, c);
          if (this.game.status !== GameStatus.Playing) this.stopTimer();
          this.render();
        },
      },
    );

    this.stopTimer();
    this.elapsedSeconds = 0;
    this.timerStarted = false;
    this.hintPending = false;
    this.hintHoverPos = null;
    this.hintCount = 0;
    this.hintBtn?.setActive(false);
    this.updateTimerDisplay();
    this.render();
  }

  giveUp(): void {
    if (this.game.status !== GameStatus.Playing) return;
    this.game.giveUp();
    this.stopTimer();
    this.render();
  }

  private toggleHint(): void {
    if (this.game.status !== GameStatus.Playing) return;
    this.hintPending = !this.hintPending;
    this.hintBtn?.setActive(this.hintPending);
    if (!this.hintPending) {
      this.hintHoverPos = null;
      this.render();
    }
  }

  private startTimer(): void {
    if (this.timerStarted) return;
    this.timerStarted = true;
    this.startTime = Date.now();
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
      this.updateTimerDisplay();
    }, 200);
  }

  private stopTimer(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private updateTimerDisplay(): void {
    const el = document.getElementById("timer");
    if (!el) return;
    const m = Math.floor(this.elapsedSeconds / 60);
    const s = this.elapsedSeconds % 60;
    el.textContent = `${m}:${s.toString().padStart(2, "0")}`;
  }

  private computeScale(): number {
    const container = document.getElementById("game-container");
    const padding = 60;
    const maxW = (container?.parentElement?.clientWidth ?? window.innerWidth) - 24;
    const maxH = window.innerHeight - padding - 80;

    const boardW = this.game.cols * CELL_SIZE;
    const boardH = this.game.rows * CELL_HEIGHT;

    const scaleX = maxW / boardW;
    const scaleY = maxH / boardH;
    const best = Math.floor(Math.min(scaleX, scaleY));
    return Math.max(1, best);
  }

  private onResize(): void {
    if (!this.game) return;
    const scale = this.computeScale();
    this.renderer.scale = scale;
    this.renderer.resize(this.game.rows, this.game.cols);
    this.render();
  }

  private render(): void {
    this.renderer.renderBoard(this.game);
    if (this.hintPending && this.hintHoverPos && this.game.status === GameStatus.Playing) {
      this.renderer.renderHintOverlay(
        this.hintHoverPos.row, this.hintHoverPos.col,
        this.game.rows, this.game.cols,
      );
    }
    this.updateSmiley();
    this.updateStatusBar();
  }

  private updateSmiley(): void {
    if (!this.smiley) return;
    if (this.game.status === GameStatus.Won) {
      this.smiley.draw(SmileyState.Cool);
    } else if (this.game.status === GameStatus.Lost) {
      this.smiley.draw(SmileyState.Dead);
    } else {
      this.smiley.draw(SmileyState.Happy);
    }
  }

  private updateStatusBar(): void {
    const bar = document.getElementById("status-bar");
    if (!bar) return;
    const { status } = this.game;
    if (status === GameStatus.Lost) {
      bar.textContent = "You hit a mine! Click the smiley to try again.";
    } else if (status === GameStatus.Won) {
      bar.textContent = "Congratulations, you win!";
    } else {
      bar.textContent = `Mines remaining: ${this.game.remainingMines}`;
    }
    this.renderBreakdown();
  }

  private renderBreakdown(): void {
    const canvas = document.getElementById("breakdown-canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const dist = this.game.mineDistribution();
    if (dist.length === 0) {
      canvas.width = 0;
      return;
    }
    const spriteSize = 24;
    const textWidth = 52;
    const gap = 6;
    const entryW = spriteSize + textWidth + gap;
    const totalW = dist.length * entryW;
    const h = 28;

    canvas.width = totalW;
    canvas.height = h;
    canvas.style.width = `${totalW}px`;
    canvas.style.height = `${h}px`;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, totalW, h);

    let x = 0;
    for (const { group, total, flagged, remaining } of dist) {
      const sy = (h - spriteSize) / 2;
      const abs = Math.abs(group);

      if (this.sheet && SPRITE_BOMB[abs]) {
        const sprite = SPRITE_BOMB[abs] as SpriteRect;
        if (group < 0) {
          // Invert for negative bombs
          this.drawInvertedToCtx(ctx, this.sheet, sprite, x, sy, spriteSize, spriteSize);
        } else {
          ctx.drawImage(
            this.sheet,
            sprite.x, sprite.y, sprite.w, sprite.h,
            x, sy, spriteSize, spriteSize,
          );
        }
      } else {
        drawBomb(ctx, abs, x, sy, spriteSize, spriteSize);
      }

      const textX = x + spriteSize + 3;
      ctx.fillStyle = remaining === 0 ? "#008000" : "#333";
      ctx.font = "bold 11px 'Pixelated MS Sans Serif', Arial, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`${flagged}/${total}`, textX, h / 2);

      x += entryW;
    }
  }

  /** Helper to draw an inverted sprite onto a given context (preserving transparency). */
  private drawInvertedToCtx(
    ctx: CanvasRenderingContext2D,
    sheet: HTMLImageElement,
    sprite: SpriteRect,
    dx: number, dy: number, dw: number, dh: number,
  ): void {
    const tmp = document.createElement("canvas");
    tmp.width = sprite.w;
    tmp.height = sprite.h;
    const tc = tmp.getContext("2d")!;
    tc.drawImage(sheet, sprite.x, sprite.y, sprite.w, sprite.h, 0, 0, sprite.w, sprite.h);
    tc.globalCompositeOperation = "difference";
    tc.fillStyle = "#ffffff";
    tc.fillRect(0, 0, sprite.w, sprite.h);
    // Restore original alpha mask: keep result only where the sprite was opaque
    tc.globalCompositeOperation = "destination-in";
    tc.drawImage(sheet, sprite.x, sprite.y, sprite.w, sprite.h, 0, 0, sprite.w, sprite.h);
    tc.globalCompositeOperation = "source-over";
    ctx.drawImage(tmp, 0, 0, sprite.w, sprite.h, dx, dy, dw, dh);
  }
}
