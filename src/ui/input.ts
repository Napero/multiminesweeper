export interface InputCallbacks {
  onLeftClick(row: number, col: number): void;
  onCycleMarker(row: number, col: number, shift: boolean): void;
  onSpace?(row: number, col: number): void;
  onChord(row: number, col: number): void;
  onSetMarker?(row: number, col: number, value: number): void;
  getMinMarker?(): number;
  getMaxMarker?(): number;
}

interface CellPos {
  row: number;
  col: number;
}

export class InputHandler {
  private contextMenuHandler = (e: Event) => e.preventDefault();
  private cursorPos: CellPos | null = null;
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== "Space") return;
    if (!this.cursorPos) return;
    e.preventDefault();
    if (this.callbacks.onSpace) this.callbacks.onSpace(this.cursorPos.row, this.cursorPos.col);
  };

  // Touch handling state
  private touchStartPos: CellPos | null = null;
  private touchStartY = 0;
  private touchTimer: number | null = null;
  private isMarking = false;
  private markingStartValue = 0;
  private currentMarkValue = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private toCell: (px: number, py: number) => CellPos | null,
    private callbacks: InputCallbacks,
  ) {
    this.attach();
  }

  private attach(): void {
    this.canvas.addEventListener("mousedown", this.onMouse);
    this.canvas.addEventListener("contextmenu", this.contextMenuHandler);
    this.canvas.addEventListener("mousemove", this.onMouseMove);
    this.canvas.addEventListener("mouseleave", this.onMouseLeave);
    window.addEventListener("keydown", this.onKeyDown);
    this.canvas.addEventListener("touchstart", this.onTouchStart, { passive: false });
    this.canvas.addEventListener("touchmove", this.onTouchMove, { passive: false });
    this.canvas.addEventListener("touchend", this.onTouchEnd);
  }

  detach(): void {
    this.canvas.removeEventListener("mousedown", this.onMouse);
    this.canvas.removeEventListener("contextmenu", this.contextMenuHandler);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mouseleave", this.onMouseLeave);
    window.removeEventListener("keydown", this.onKeyDown);
    this.canvas.removeEventListener("touchstart", this.onTouchStart);
    this.canvas.removeEventListener("touchmove", this.onTouchMove);
    this.canvas.removeEventListener("touchend", this.onTouchEnd);
  }

  private onMouse = (e: MouseEvent): void => {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const pos = this.toCell(px, py);
    if (!pos) return;

    switch (e.button) {
      case 0: this.callbacks.onLeftClick(pos.row, pos.col); break;
      case 1: this.callbacks.onChord(pos.row, pos.col); break;
      case 2: this.callbacks.onCycleMarker(pos.row, pos.col, e.shiftKey); break;
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const pos = this.toCell(px, py);
    this.cursorPos = pos;
  };

  private onMouseLeave = (): void => {
    this.cursorPos = null;
  };

  private clearTouchTimer(): void {
    if (this.touchTimer !== null) {
      window.clearTimeout(this.touchTimer);
      this.touchTimer = null;
    }
  }

  private onTouchStart = (e: TouchEvent): void => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    const px = t.clientX - rect.left;
    const py = t.clientY - rect.top;
    const pos = this.toCell(px, py);
    if (!pos) return;

    e.preventDefault();
    this.touchStartPos = pos;
    this.touchStartY = t.clientY;
    this.isMarking = false;
    this.markingStartValue = 0;
    this.currentMarkValue = 0;

    // Long press to start marking (500ms)
    this.touchTimer = window.setTimeout(() => {
      this.touchTimer = null;
      this.isMarking = true;
      const cell = this.toCell(px, py);
      if (!cell) return;
      this.markingStartValue = 0; // default start at 0 -> first drag sets to 1
      this.currentMarkValue = this.markingStartValue;
      if (this.callbacks.onSetMarker) this.callbacks.onSetMarker(cell.row, cell.col, this.currentMarkValue);
    }, 500);
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    const px = t.clientX - rect.left;
    const py = t.clientY - rect.top;
    const pos = this.toCell(px, py);
    if (!this.touchStartPos) {
      this.cursorPos = pos;
      return;
    }

    // If marking hasn't started yet, allow finger movement without starting marking
    if (!this.isMarking) {
      // if the finger moved a lot, cancel long-press
      if (Math.abs(t.clientY - this.touchStartY) > 10 || (pos && (pos.row !== this.touchStartPos.row || pos.col !== this.touchStartPos.col))) {
        this.clearTouchTimer();
      }
      return;
    }

    e.preventDefault();
    // Map vertical drag to marker value changes
    const dy = this.touchStartY - t.clientY; // upward drag increases value
    const stepPx = 20; // pixels per step
    const steps = Math.round(dy / stepPx);
    const minVal = this.callbacks.getMinMarker ? this.callbacks.getMinMarker() : 0;
    const maxVal = this.callbacks.getMaxMarker ? this.callbacks.getMaxMarker() : 6;
    const val = Math.max(minVal, Math.min(maxVal, this.markingStartValue + steps));
    if (val !== this.currentMarkValue && this.touchStartPos) {
      this.currentMarkValue = val;
      if (this.callbacks.onSetMarker) this.callbacks.onSetMarker(this.touchStartPos.row, this.touchStartPos.col, this.currentMarkValue);
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    this.clearTouchTimer();
    if (!this.touchStartPos) return;
    const pos = this.touchStartPos;
    // If we were marking, finalize. If not, treat as tap.
    if (this.isMarking) {
      // finalize marker (already updated via onSetMarker during move)
      if (this.callbacks.onSetMarker) this.callbacks.onSetMarker(pos.row, pos.col, this.currentMarkValue);
      this.isMarking = false;
    } else {
      // tap: open or chord handled by left click
      if (this.callbacks.onLeftClick) this.callbacks.onLeftClick(pos.row, pos.col);
    }
    this.touchStartPos = null;
  };
}
