import { DEFAULT_CONFIG, Game, GameConfig, GameStatus, GridShape, TopologyMode } from "../engine/index";
import { Renderer, measureBoardPixels } from "./renderer";
import { InputHandler } from "./input";
import { loadSpritesheet } from "../sprites";
import { SPRITE_BOMB, SpriteRect } from "../sprites";
import { Smiley, SmileyState } from "./smiley";
import { ToolbarButton } from "./toolbar-button";
import { drawBomb } from "./fallback";

const PENTAGON_PETALS = 6;

const PRESETS: Record<string, Partial<GameConfig>> = {
  beginner:     { rows: 9,  cols: 9,  minesTotal: 30,  maxMinesPerCell: 4, density: 0.7 },
  intermediate: { rows: 16, cols: 16, minesTotal: 60,  maxMinesPerCell: 5, density: 0.6 },
  hard:         { rows: 16, cols: 30, minesTotal: 170, maxMinesPerCell: 6, density: 0.6 },
  expert:       { rows: 16, cols: 30, minesTotal: 250, maxMinesPerCell: 6, density: 0.6 },
  nightmare:    { rows: 20, cols: 35, minesTotal: 450, maxMinesPerCell: 6, density: 0.45 },
  "intermediate-negative": { rows: 16, cols: 16, minesTotal: 60, maxMinesPerCell: 5, density: 0.6, negativeMines: true },
  "hard-negative": { rows: 16, cols: 30, minesTotal: 170, maxMinesPerCell: 6, density: 0.6, negativeMines: true },
  cylinder: { rows: 16, cols: 30, minesTotal: 170, maxMinesPerCell: 6, density: 0.6, topology: "cylinder" },
  torus: { rows: 16, cols: 30, minesTotal: 170, maxMinesPerCell: 6, density: 0.6, topology: "torus" },
  mobius: { rows: 16, cols: 30, minesTotal: 170, maxMinesPerCell: 6, density: 0.6, topology: "mobius" },
  klein: { rows: 16, cols: 30, minesTotal: 170, maxMinesPerCell: 6, density: 0.6, topology: "klein" },
  hex: { rows: 14, cols: 20, minesTotal: 130, maxMinesPerCell: 6, density: 0.6, gridShape: "hex" },
  triangle: { rows: 12, cols: 30, minesTotal: 150, maxMinesPerCell: 6, density: 0.6, gridShape: "triangle" },
  // For pentagon mode, rows/cols represent flower-grid dimensions.
  pentagon: { rows: 6, cols: 9, minesTotal: 155, maxMinesPerCell: 6, density: 0.6, gridShape: "pentagon" },
  "irregular-rectangle": { rows: 16, cols: 24, minesTotal: 180, maxMinesPerCell: 6, density: 0.6, gridShape: "irregular" },
  irregular: { rows: 16, cols: 24, minesTotal: 180, maxMinesPerCell: 6, density: 0.6, gridShape: "irregular" }, // legacy alias
  "random-grid": { rows: 14, cols: 22, minesTotal: 120, maxMinesPerCell: 6, density: 0.6, gridShape: "random" },
  random: { rows: 14, cols: 22, minesTotal: 120, maxMinesPerCell: 6, density: 0.6, gridShape: "random" }, // alias
};

function parseSeedInput(seedStr: string): number {
  const numeric = Number(seedStr);
  if (Number.isInteger(numeric) && Number.isFinite(numeric)) return numeric;
  return hashString(seedStr);
}

function readConfigFromModal(): { config: Partial<GameConfig>; hasSeed: boolean } {
  const val = (id: string, fallback: number) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    const n = el ? parseInt(el.value, 10) : NaN;
    return isNaN(n) ? fallback : n;
  };
  const seedEl = document.getElementById("opt-seed") as HTMLInputElement | null;
  const seedStr = seedEl?.value.trim() ?? "";
  const density = val("opt-density", 60) / 100;
  const negEl = document.getElementById("opt-negative") as HTMLInputElement | null;
  const negativeMines = negEl?.checked ?? false;
  const topologyEl = document.getElementById("opt-topology") as HTMLSelectElement | null;
  const topology = (topologyEl?.value ?? "plane") as TopologyMode;
  const shapeEl = document.getElementById("opt-shape") as HTMLSelectElement | null;
  const gridShape = (shapeEl?.value ?? "square") as GridShape;
  const vertexEl = document.getElementById("opt-vertex-neighbors") as HTMLInputElement | null;
  const includeVertexNeighbors = vertexEl?.checked ?? true;
  const rows = val("opt-rows", 16);
  const cols = val("opt-cols", 30);

  const config: Partial<GameConfig> = {
    rows,
    cols,
    minesTotal: val("opt-mines", 99),
    maxMinesPerCell: val("opt-max", 6),
    density,
    negativeMines,
    topology,
    gridShape,
    includeVertexNeighbors,
    safeFirstClick: true,
  };
  if (seedStr !== "") config.seed = parseSeedInput(seedStr);
  return { config, hasSeed: seedStr !== "" };
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
  private boardLeftHeld = false;
  private pressedCellPreview: { row: number; col: number } | null = null;
  private helpCloseClickHandler = () => this.closeHelp();
  private helpOverlayClickHandler = (ev: MouseEvent) => {
    const overlay = document.getElementById("help-overlay");
    if (overlay && ev.target === overlay) this.closeHelp();
  };
  private breakdownInvertCanvas = document.createElement("canvas");
  private breakdownInvertCtx = this.breakdownInvertCanvas.getContext("2d")!;
  private seedLocked = false;

  private normalizeConfigForEngine(cfg: GameConfig): GameConfig {
    if (cfg.gridShape !== "pentagon") return cfg;
    return {
      ...cfg,
      rows: Math.max(1, Math.floor(cfg.rows)),
      cols: Math.max(1, Math.floor(cfg.cols)) * PENTAGON_PETALS,
    };
  }

  constructor(canvas: HTMLCanvasElement, config: Partial<GameConfig> = {}) {
    this.canvas = canvas;
    this.config = config;
  }

  async init(): Promise<void> {
    // Read initial config from URL hash (if any)
    const hashConfig = this.readConfigFromHash();
    if (hashConfig) {
      this.config = hashConfig;
    }
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
      const btn = new ToolbarButton(helpCanvas, "help", () => this.openHelp());
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
          this.newGame(
            { ...PRESETS[preset], seed: Date.now(), includeVertexNeighbors: true },
            { lockSeed: false },
          );
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
      const { config: cfg, hasSeed } = readConfigFromModal();
      this.closeCustomModal();
      this.newGame(cfg, { lockSeed: hasSeed });
    });
    document.getElementById("help-close")?.addEventListener("click", this.helpCloseClickHandler);
    document.getElementById("help-overlay")?.addEventListener("click", this.helpOverlayClickHandler);

    // Density slider label sync
    const densitySlider = document.getElementById("opt-density") as HTMLInputElement | null;
    const densityLabel = document.getElementById("density-val");
    densitySlider?.addEventListener("input", () => {
      if (densityLabel) densityLabel.textContent = (parseInt(densitySlider.value, 10) / 100).toFixed(2);
    });
    const shapeSelect = document.getElementById("opt-shape") as HTMLSelectElement | null;
    shapeSelect?.addEventListener("change", () => this.updatePentagonShapeNoteVisibility());

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
      const local = this.renderer.pixelToCell(e.clientX - rect.left, e.clientY - rect.top);
      if (!local) return;
      const pos = local;
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
    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      this.boardLeftHeld = true;
      if (this.game.status === GameStatus.Playing) {
        this.smiley?.draw(SmileyState.Surprised);
      }
      this.updatePressedCellPreviewFromPixels(e.clientX, e.clientY);
    });
    this.canvas.addEventListener("mousemove", (e) => {
      if (!this.boardLeftHeld) return;
      this.updatePressedCellPreviewFromPixels(e.clientX, e.clientY);
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button !== 0) return;
      this.boardLeftHeld = false;
      const hadPressedPreview = this.pressedCellPreview !== null;
      this.pressedCellPreview = null;
      this.updateSmiley();
      if (hadPressedPreview) this.render();
    });
    this.canvas.addEventListener("mouseleave", () => {
      if (this.boardLeftHeld) {
        const hadPressedPreview = this.pressedCellPreview !== null;
        this.pressedCellPreview = null;
        if (hadPressedPreview) this.render();
      } else {
        this.updateSmiley();
      }
    });
    this.canvas.addEventListener("touchstart", () => {
      this.boardLeftHeld = true;
      if (this.game.status === GameStatus.Playing) {
        this.smiley?.draw(SmileyState.Surprised);
      }
    }, { passive: true });
    this.canvas.addEventListener("touchend", () => {
      this.boardLeftHeld = false;
      this.pressedCellPreview = null;
      this.updateSmiley();
    }, { passive: true });
    this.canvas.addEventListener("touchcancel", () => {
      this.boardLeftHeld = false;
      this.pressedCellPreview = null;
      this.updateSmiley();
    }, { passive: true });

    this.newGame(this.config);
    // Global keyboard: ? opens help, Esc closes
    window.addEventListener("keydown", this.onGlobalKey);
  }

  private onGlobalKey = (e: KeyboardEvent): void => {
    // Ignore if typing in an input
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
    if (e.key === "?") {
      e.preventDefault();
      this.openHelp();
    } else if (e.key === "Escape") {
      this.closeHelp();
      this.closeCustomModal();
      this.closeSettingsDropdown();
    }
  };

  private toggleSettingsDropdown(): void {
    document.getElementById("settings-dropdown")?.classList.toggle("open");
  }

  private closeSettingsDropdown(): void {
    document.getElementById("settings-dropdown")?.classList.remove("open");
  }

  private openCustomModal(): void {
    this.syncCustomModalFromCurrentConfig();
    document.getElementById("custom-overlay")?.classList.add("open");
  }

  private closeCustomModal(): void {
    document.getElementById("custom-overlay")?.classList.remove("open");
  }

  private openHelp(): void {
    document.getElementById("help-overlay")?.classList.add("open");
  }

  private closeHelp(): void {
    document.getElementById("help-overlay")?.classList.remove("open");
  }

  private readConfigFromHash(): Partial<GameConfig> | null {
    const hash = window.location.hash.slice(1);
    if (!hash) return null;
    const params = new URLSearchParams(hash);

    // Named preset: #preset=hex
    const presetName = params.get("preset");
    if (presetName && PRESETS[presetName]) {
      const cfg: Partial<GameConfig> = { ...PRESETS[presetName], includeVertexNeighbors: true };
      const seed = params.get("seed");
      if (seed) {
        cfg.seed = parseSeedInput(seed);
        this.seedLocked = true;
      }
      return cfg;
    }

    // Custom params: #rows=14&cols=20&mines=130&...
    if (!params.has("rows") && !params.has("cols")) return null;
    const cfg: Partial<GameConfig> = {};
    if (params.has("rows")) cfg.rows = parseInt(params.get("rows")!, 10);
    if (params.has("cols")) cfg.cols = parseInt(params.get("cols")!, 10);
    if (params.has("mines")) cfg.minesTotal = parseInt(params.get("mines")!, 10);
    if (params.has("max")) cfg.maxMinesPerCell = parseInt(params.get("max")!, 10);
    if (params.has("density")) cfg.density = parseFloat(params.get("density")!);
    if (params.has("shape")) cfg.gridShape = params.get("shape") as GridShape;
    if (params.has("topology")) cfg.topology = params.get("topology") as TopologyMode;
    if (params.has("negative")) cfg.negativeMines = params.get("negative") === "1";
    if (params.has("vertex")) cfg.includeVertexNeighbors = params.get("vertex") !== "0";
    if (params.has("seed")) {
      cfg.seed = parseSeedInput(params.get("seed")!);
      this.seedLocked = true;
    }

    // Backward compatibility: older pentagon hashes used cols as raw cells.
    if (cfg.gridShape === "pentagon" && typeof cfg.cols === "number" && cfg.cols >= 18 && cfg.cols % PENTAGON_PETALS === 0) {
      cfg.cols = Math.floor(cfg.cols / PENTAGON_PETALS);
    }
    return cfg;
  }

  private writeConfigToHash(): void {
    const cfg = this.config as GameConfig;
    const def = DEFAULT_CONFIG;
    const params = new URLSearchParams();

    // Check if this matches a named preset
    for (const [name, preset] of Object.entries(PRESETS)) {
      const merged = { ...def, ...preset };
      if (
        cfg.rows === merged.rows &&
        cfg.cols === merged.cols &&
        cfg.minesTotal === merged.minesTotal &&
        cfg.maxMinesPerCell === merged.maxMinesPerCell &&
        cfg.density === merged.density &&
        cfg.gridShape === merged.gridShape &&
        cfg.topology === merged.topology &&
        cfg.negativeMines === merged.negativeMines &&
        cfg.includeVertexNeighbors === (merged.includeVertexNeighbors ?? true)
      ) {
        params.set("preset", name);
        if (this.seedLocked) params.set("seed", String(cfg.seed));
        window.history.replaceState(null, "", `#${params.toString()}`);
        return;
      }
    }

    // Custom params
    params.set("rows", String(cfg.rows));
    params.set("cols", String(cfg.cols));
    params.set("mines", String(cfg.minesTotal));
    if (cfg.maxMinesPerCell !== def.maxMinesPerCell) params.set("max", String(cfg.maxMinesPerCell));
    if (cfg.density !== def.density) params.set("density", String(cfg.density));
    if (cfg.gridShape !== "square") params.set("shape", cfg.gridShape);
    if (cfg.topology !== "plane") params.set("topology", cfg.topology);
    if (cfg.negativeMines) params.set("negative", "1");
    if (cfg.includeVertexNeighbors === false) params.set("vertex", "0");
    if (this.seedLocked) params.set("seed", String(cfg.seed));
    window.history.replaceState(null, "", `#${params.toString()}`);
  }

  private setInputValue(id: string, value: string): void {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (el) el.value = value;
  }

  private hasGameProgress(): boolean {
    if (!this.game) return false;
    for (let r = 0; r < this.game.rows; r++) {
      for (let c = 0; c < this.game.cols; c++) {
        const cell = this.game.cell(r, c);
        if (cell.opened || cell.markerCount !== 0) return true;
      }
    }
    return false;
  }

  private syncCustomModalFromCurrentConfig(): void {
    const cfg: GameConfig = { ...DEFAULT_CONFIG, ...this.config };
    this.setInputValue("opt-rows", String(cfg.rows));
    this.setInputValue("opt-cols", String(cfg.cols));
    this.setInputValue("opt-mines", String(cfg.minesTotal));
    this.setInputValue("opt-max", String(cfg.maxMinesPerCell));
    this.setInputValue("opt-density", String(Math.round(cfg.density * 100)));
    this.setInputValue("opt-topology", cfg.topology);
    this.setInputValue("opt-shape", cfg.gridShape);
    const vertexEl = document.getElementById("opt-vertex-neighbors") as HTMLInputElement | null;
    if (vertexEl) vertexEl.checked = cfg.includeVertexNeighbors !== false;

    const negEl = document.getElementById("opt-negative") as HTMLInputElement | null;
    if (negEl) negEl.checked = !!cfg.negativeMines;

    const seedEl = document.getElementById("opt-seed") as HTMLInputElement | null;
    if (seedEl) {
      seedEl.value = this.hasGameProgress() ? String(cfg.seed) : "";
    }

    const densityLabel = document.getElementById("density-val");
    if (densityLabel) densityLabel.textContent = cfg.density.toFixed(2);
    this.updatePentagonShapeNoteVisibility();
  }

  newGame(config?: Partial<GameConfig>, options?: { lockSeed?: boolean }): void {
    if (config) {
      this.config = { ...DEFAULT_CONFIG, ...config };
      if (typeof options?.lockSeed === "boolean") this.seedLocked = options.lockSeed;
    } else if (!this.seedLocked) {
      this.config = { ...this.config, seed: Date.now() };
    }
    if (typeof this.config.seed !== "number" || !Number.isFinite(this.config.seed)) {
      this.config.seed = Date.now();
    }
    if (this.input) this.input.detach();

    const logicalConfig: GameConfig = { ...DEFAULT_CONFIG, ...this.config };
    const engineConfig = this.normalizeConfigForEngine(logicalConfig);
    this.game = new Game(engineConfig);

    const scale = this.computeScale();
    this.renderer = new Renderer(this.canvas, this.sheet, scale);
    this.renderer.resize(this.game.rows, this.game.cols, this.game.gridShape, this.game.config.seed);

    this.input = new InputHandler(
      this.canvas,
      (px, py) => {
        return this.renderer.pixelToCell(px, py);
      },
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
        onSetMarker: (r, c, value) => {
          this.startTimer();
          const cell = this.game.cell(r, c);
          if (cell.opened) return;
          // clamp to allowed range
          const v = Math.max(this.game.minMarker, Math.min(this.game.maxMarker, value));
          cell.markerCount = v;
          this.render();
        },
        getMinMarker: () => this.game.minMarker,
        getMaxMarker: () => this.game.maxMarker,
        onSpace: (r, c) => {
          this.startTimer();
          const cell = this.game.cell(r, c);
          if (cell.opened) {
            this.game.chordOpen(r, c);
            if (this.game.status !== GameStatus.Playing) this.stopTimer();
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
    this.pressedCellPreview = null;
    this.hintBtn?.setActive(false);
    this.updateTimerDisplay();
    this.render();
    this.writeConfigToHash();
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

    const size = measureBoardPixels(this.game.rows, this.game.cols, this.game.gridShape, 1, this.game.config.seed);
    const boardW = size.width;
    const boardH = size.height;

    const scaleX = maxW / boardW;
    const scaleY = maxH / boardH;
    const best = Math.floor(Math.min(scaleX, scaleY));
    return Math.max(1, best);
  }

  private onResize(): void {
    if (!this.game) return;
    const scale = this.computeScale();
    this.renderer.scale = scale;
    this.renderer.resize(this.game.rows, this.game.cols, this.game.gridShape, this.game.config.seed);
    this.render();
  }

  private render(): void {
    this.renderer.renderBoard(this.game, this.pressedCellPreview);
    if (this.hintPending && this.hintHoverPos && this.game.status === GameStatus.Playing) {
      this.renderer.renderHintOverlay(
        this.hintHoverPos.row, this.hintHoverPos.col,
        this.game.rows, this.game.cols,
        this.game.topology,
        this.game.config.seed,
        this.game.config.includeVertexNeighbors,
      );
    }
    this.updateSmiley();
    this.updateStatusBar();
  }

  private updatePentagonShapeNoteVisibility(): void {
    const note = document.getElementById("opt-pentagon-note");
    const shapeEl = document.getElementById("opt-shape") as HTMLSelectElement | null;
    if (!note || !shapeEl) return;
    note.style.display = shapeEl.value === "pentagon" ? "block" : "none";
  }

  private updateSmiley(): void {
    if (!this.smiley) return;
    if (this.boardLeftHeld && this.game.status === GameStatus.Playing) {
      this.smiley.draw(SmileyState.Surprised);
      return;
    }
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
      const topologySuffix = this.game.topology === "plane" ? "" : ` · Topology: ${this.game.topology}`;
      bar.textContent = `Mines remaining: ${this.game.remainingMines}${topologySuffix}`;
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
    const tmp = this.breakdownInvertCanvas;
    const tc = this.breakdownInvertCtx;
    tmp.width = sprite.w;
    tmp.height = sprite.h;
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

  private updatePressedCellPreviewFromPixels(clientX: number, clientY: number): void {
    if (this.game.status !== GameStatus.Playing) {
      if (this.pressedCellPreview) {
        this.pressedCellPreview = null;
        this.render();
      }
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const local = this.renderer.pixelToCell(clientX - rect.left, clientY - rect.top);
    const pos = local;
    let next: { row: number; col: number } | null = null;
    if (pos) {
      const cell = this.game.cell(pos.row, pos.col);
      if (!cell.opened && cell.markerCount === 0) {
        next = pos;
      }
    }

    const changed =
      (this.pressedCellPreview === null) !== (next === null) ||
      (this.pressedCellPreview !== null &&
        next !== null &&
        (this.pressedCellPreview.row !== next.row || this.pressedCellPreview.col !== next.col));

    if (changed) {
      this.pressedCellPreview = next;
      this.render();
    }
  }
}
