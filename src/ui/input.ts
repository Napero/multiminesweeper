export interface InputCallbacks {
  onLeftClick(row: number, col: number): void;
  onCycleMarker(row: number, col: number, shift: boolean): void;
  onChord(row: number, col: number): void;
}

interface CellPos {
  row: number;
  col: number;
}

export class InputHandler {
  private contextMenuHandler = (e: Event) => e.preventDefault();

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
  }

  detach(): void {
    this.canvas.removeEventListener("mousedown", this.onMouse);
    this.canvas.removeEventListener("contextmenu", this.contextMenuHandler);
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
}
