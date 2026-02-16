import { describe, it, expect } from "vitest";
import { CellView } from "../src/engine/types";
import { solveLogically } from "../src/engine/solver";

function cell(
  row: number,
  col: number,
  opened: boolean,
  hint: number | null,
  markerCount = 0,
): CellView {
  return {
    row,
    col,
    opened,
    markerCount,
    hint,
    mineCount: opened ? 0 : null,
    exploded: false,
    wrongMarker: false,
    adjacentMines: hint !== null && hint !== 0,
  };
}

describe("solveLogically", () => {
  it("marks a forced positive pack from a single-variable equation", () => {
    const cells: CellView[][] = [
      [cell(0, 0, true, 3), cell(0, 1, false, null)],
    ];

    const result = solveLogically({
      rows: 1,
      cols: 2,
      cells,
      maxMinesPerCell: 6,
      negativeMines: false,
    });

    expect(result.contradiction).toBe(false);
    expect(result.marks).toEqual([{ row: 0, col: 1, value: 3 }]);
    expect(result.opens).toEqual([]);
  });

  it("opens a forced safe cell from a zero hint", () => {
    const cells: CellView[][] = [
      [cell(0, 0, true, 0), cell(0, 1, false, null)],
    ];

    const result = solveLogically({
      rows: 1,
      cols: 2,
      cells,
      maxMinesPerCell: 6,
      negativeMines: false,
    });

    expect(result.contradiction).toBe(false);
    expect(result.opens).toEqual([{ row: 0, col: 1 }]);
    expect(result.marks).toEqual([]);
  });

  it("marks a forced negative pack in negative mode", () => {
    const cells: CellView[][] = [
      [cell(0, 0, true, -2), cell(0, 1, false, null)],
    ];

    const result = solveLogically({
      rows: 1,
      cols: 2,
      cells,
      maxMinesPerCell: 6,
      negativeMines: true,
    });

    expect(result.contradiction).toBe(false);
    expect(result.marks).toEqual([{ row: 0, col: 1, value: -2 }]);
    expect(result.opens).toEqual([]);
  });

  it("uses global group totals to deduce all-free cells are safe", () => {
    const cells: CellView[][] = [
      [cell(0, 0, false, null), cell(0, 1, false, null)],
    ];

    const result = solveLogically({
      rows: 1,
      cols: 2,
      cells,
      maxMinesPerCell: 6,
      negativeMines: false,
      groupTotals: [],
    });

    expect(result.contradiction).toBe(false);
    expect(result.opens).toEqual([{ row: 0, col: 0 }, { row: 0, col: 1 }]);
    expect(result.marks).toEqual([]);
  });

  it("stalls when multiple assignments remain possible", () => {
    const cells: CellView[][] = [
      [cell(0, 0, false, null), cell(0, 1, true, 1), cell(0, 2, false, null)],
    ];

    const result = solveLogically({
      rows: 1,
      cols: 3,
      cells,
      maxMinesPerCell: 6,
      negativeMines: false,
    });

    expect(result.contradiction).toBe(false);
    expect(result.stalled).toBe(true);
    expect(result.opens).toEqual([]);
    expect(result.marks).toEqual([]);
  });
});
