import { CellView, Pos } from "./types";

export interface GroupTotal {
  group: number;
  total: number;
}

export interface SolverInput {
  rows: number;
  cols: number;
  cells: CellView[][];
  maxMinesPerCell: number;
  negativeMines: boolean;
  groupTotals?: GroupTotal[];
  maxSearchNodes?: number;
}

export interface SolverMark extends Pos {
  value: number;
}

export interface SolverResult {
  opens: Pos[];
  marks: SolverMark[];
  stalled: boolean;
  contradiction: boolean;
  reason?: string;
  complete: boolean;
}

interface Equation {
  vars: number[];
  target: number;
}

interface BuildState {
  unknownPositions: Pos[];
  equations: Equation[];
  fixedCounts: Map<number, number>;
  freeVarIndices: Set<number>;
  constrainedVarIndices: number[];
}

const DEFAULT_MAX_SEARCH_NODES = 5_000_000;

export function solveLogically(input: SolverInput): SolverResult {
  const max = input.maxMinesPerCell;
  const min = input.negativeMines ? -max : 0;
  const maxSearchNodes = input.maxSearchNodes ?? DEFAULT_MAX_SEARCH_NODES;
  const nonZeroValues = buildNonZeroValues(min, max);
  const useGlobalCounts = input.groupTotals !== undefined;
  const groupTotals = useGlobalCounts ? buildGroupTotals(nonZeroValues, input.groupTotals) : undefined;

  const built = buildState(input, groupTotals);
  if ("contradiction" in built) {
    return {
      opens: [],
      marks: [],
      stalled: true,
      contradiction: true,
      reason: built.contradiction,
      complete: true,
    };
  }

  const {
    unknownPositions,
    equations,
    fixedCounts,
    freeVarIndices,
    constrainedVarIndices,
  } = built;

  const remainingCounts = new Map<number, number>();
  if (useGlobalCounts && groupTotals) {
    for (const v of nonZeroValues) {
      const total = groupTotals.get(v) ?? 0;
      const fixed = fixedCounts.get(v) ?? 0;
      const rem = total - fixed;
      if (rem < 0) {
        return {
          opens: [],
          marks: [],
          stalled: true,
          contradiction: true,
          reason: `Too many fixed cells for group ${v}.`,
          complete: true,
        };
      }
      remainingCounts.set(v, rem);
    }

    const unknownCount = unknownPositions.length;
    const totalRemainingNonZero = sumMapValues(remainingCounts);
    if (totalRemainingNonZero > unknownCount) {
      return {
        opens: [],
        marks: [],
        stalled: true,
        contradiction: true,
        reason: "Remaining mine groups exceed unknown cell count.",
        complete: true,
      };
    }
  }

  const constrainedIndexByVar = new Map<number, number>();
  constrainedVarIndices.forEach((varId, i) => constrainedIndexByVar.set(varId, i));

  const constrainedPositions = constrainedVarIndices.map((varId) => unknownPositions[varId]);
  const constrainedCount = constrainedVarIndices.length;
  const freeCount = freeVarIndices.size;
  const componentAllowedValues = uniqueSorted(
    useGlobalCounts
      ? [0, ...nonZeroValues.filter((v) => (remainingCounts.get(v) ?? 0) > 0)]
      : buildDomain(min, max),
  );

  const propagation = inferForcedByBounds(
    constrainedVarIndices,
    equations,
    componentAllowedValues,
  );
  if (propagation.contradiction) {
    return {
      opens: [],
      marks: [],
      stalled: true,
      contradiction: true,
      reason: propagation.reason ?? "No assignments satisfy visible constraints.",
      complete: true,
    };
  }
  if (propagation.forced.size > 0) {
    const opens: Pos[] = [];
    const marks: SolverMark[] = [];
    for (const [varId, val] of propagation.forced) {
      const pos = unknownPositions[varId];
      if (val === 0) opens.push(pos);
      else marks.push({ ...pos, value: val });
    }
    return {
      opens,
      marks,
      stalled: false,
      contradiction: false,
      complete: true,
    };
  }

  const componentPass = inferForcedFromComponents(
    constrainedVarIndices,
    equations,
    propagation.domains,
    Math.max(200_000, Math.floor(maxSearchNodes / 4)),
  );
  if (componentPass.contradiction) {
    return {
      opens: [],
      marks: [],
      stalled: true,
      contradiction: true,
      reason: componentPass.reason ?? "No assignments satisfy visible constraints.",
      complete: componentPass.complete,
    };
  }
  if (componentPass.forced.size > 0) {
    const opens: Pos[] = [];
    const marks: SolverMark[] = [];
    for (const [varId, val] of componentPass.forced) {
      const pos = unknownPositions[varId];
      if (val === 0) opens.push(pos);
      else marks.push({ ...pos, value: val });
    }
    return {
      opens,
      marks,
      stalled: false,
      contradiction: false,
      complete: componentPass.complete,
      reason: componentPass.complete ? undefined : "Component search budget reached.",
    };
  }

  if (constrainedCount === 0) {
    if (!useGlobalCounts) {
      return {
        opens: [],
        marks: [],
        stalled: true,
        contradiction: false,
        complete: true,
      };
    }
    return solveOnlyFromGlobalCounts(unknownPositions, remainingCounts, nonZeroValues, freeCount);
  }

  const eqVars = equations.map((eq) =>
    eq.vars
      .map((varId) => constrainedIndexByVar.get(varId))
      .filter((v): v is number => v !== undefined),
  );
  const eqTargets = equations.map((eq) => eq.target);
  const eqAssignedSum = new Array(equations.length).fill(0);
  const eqUnassigned = eqVars.map((vars) => vars.length);

  for (let i = 0; i < eqVars.length; i++) {
    if (eqUnassigned[i] === 0 && eqTargets[i] !== 0) {
      return {
        opens: [],
        marks: [],
        stalled: true,
        contradiction: true,
        reason: "Visible hints are inconsistent.",
        complete: true,
      };
    }
  }

  const varToEq = new Array(constrainedCount).fill(0).map(() => [] as number[]);
  for (let eqi = 0; eqi < eqVars.length; eqi++) {
    for (const vi of eqVars[eqi]) varToEq[vi].push(eqi);
  }

  const constrainedDomains = constrainedVarIndices.map(
    (varId) => propagation.domains.get(varId) ?? componentAllowedValues,
  );
  const domainMin = constrainedDomains.map((d) => d[0]);
  const domainMax = constrainedDomains.map((d) => d[d.length - 1]);
  const assignment = new Array<number>(constrainedCount).fill(Number.NaN);
  const isAssigned = new Array<boolean>(constrainedCount).fill(false);
  let assignedCount = 0;
  let searchNodes = 0;
  let aborted = false;

  let solutionCount = 0;
  const seenValues = new Array(constrainedCount).fill(0).map(() => new Set<number>());
  const remMin = new Map<number, number>();
  const remMax = new Map<number, number>();
  for (const v of nonZeroValues) {
    remMin.set(v, Number.POSITIVE_INFINITY);
    remMax.set(v, Number.NEGATIVE_INFINITY);
  }

  const remCounts = new Map<number, number>(remainingCounts);

  function groupFeasible(): boolean {
    if (useGlobalCounts) {
      const unassignedConstrained = constrainedCount - assignedCount;
      const capacity = unassignedConstrained + freeCount;
      let nonZeroRemaining = 0;
      for (const v of nonZeroValues) {
        const rem = remCounts.get(v)!;
        if (rem < 0) return false;
        if (rem > capacity) return false;
        nonZeroRemaining += rem;
      }
      if (nonZeroRemaining > capacity) return false;
    }
    return true;
  }

  function eqFeasible(eqi: number): boolean {
    const remTarget = eqTargets[eqi] - eqAssignedSum[eqi];
    let minSum = 0;
    let maxSum = 0;
    for (const vi of eqVars[eqi]) {
      if (!isAssigned[vi]) {
        minSum += domainMin[vi];
        maxSum += domainMax[vi];
      }
    }
    return remTarget >= minSum && remTarget <= maxSum;
  }

  function candidateFeasible(vi: number, val: number): boolean {
    for (const eqi of varToEq[vi]) {
      const remTarget = eqTargets[eqi] - (eqAssignedSum[eqi] + val);
      let minSum = 0;
      let maxSum = 0;
      for (const ov of eqVars[eqi]) {
        if (ov === vi || isAssigned[ov]) continue;
        minSum += domainMin[ov];
        maxSum += domainMax[ov];
      }
      if (remTarget < minSum || remTarget > maxSum) return false;
    }
    return true;
  }

  function pickNextVar(): number {
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < constrainedCount; i++) {
      if (isAssigned[i]) continue;
      const score = varToEq[i].length;
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    return best;
  }

  function buildCandidates(vi: number): number[] {
    const candidates: number[] = [];
    for (const v of constrainedDomains[vi]) {
      if (useGlobalCounts && v !== 0 && (remCounts.get(v) ?? 0) <= 0) continue;
      if (candidateFeasible(vi, v)) candidates.push(v);
    }
    return candidates;
  }

  function applyAssign(vi: number, val: number): void {
    isAssigned[vi] = true;
    assignment[vi] = val;
    assignedCount++;
    for (const eqi of varToEq[vi]) {
      eqAssignedSum[eqi] += val;
      eqUnassigned[eqi]--;
    }
    if (useGlobalCounts && val !== 0) remCounts.set(val, remCounts.get(val)! - 1);
  }

  function revertAssign(vi: number, val: number): void {
    isAssigned[vi] = false;
    assignment[vi] = Number.NaN;
    assignedCount--;
    for (const eqi of varToEq[vi]) {
      eqAssignedSum[eqi] -= val;
      eqUnassigned[eqi]++;
    }
    if (useGlobalCounts && val !== 0) remCounts.set(val, remCounts.get(val)! + 1);
  }

  function recordSolution(): void {
    solutionCount++;
    for (let i = 0; i < constrainedCount; i++) {
      seenValues[i].add(assignment[i]);
    }
    if (useGlobalCounts) {
      for (const v of nonZeroValues) {
        const rem = remCounts.get(v)!;
        remMin.set(v, Math.min(remMin.get(v)!, rem));
        remMax.set(v, Math.max(remMax.get(v)!, rem));
      }
    }
  }

  function dfs(): void {
    if (aborted) return;
    searchNodes++;
    if (searchNodes > maxSearchNodes) {
      aborted = true;
      return;
    }

    for (let eqi = 0; eqi < eqVars.length; eqi++) {
      if (!eqFeasible(eqi)) return;
    }
    if (!groupFeasible()) return;

    if (assignedCount === constrainedCount) {
      if (useGlobalCounts) {
        if (freeCount === 0) {
          for (const v of nonZeroValues) {
            if (remCounts.get(v)! !== 0) return;
          }
        } else {
          if (sumMapValues(remCounts) > freeCount) return;
        }
      }
      recordSolution();
      return;
    }

    const vi = pickNextVar();
    const candidates = buildCandidates(vi);
    if (candidates.length === 0) return;

    for (const val of candidates) {
      applyAssign(vi, val);
      dfs();
      revertAssign(vi, val);
      if (aborted) return;
    }
  }

  dfs();

  if (solutionCount === 0) {
    return {
      opens: [],
      marks: [],
      stalled: true,
      contradiction: true,
      reason: "No assignments satisfy the visible constraints.",
      complete: !aborted,
    };
  }

  if (aborted) {
    return {
      opens: [],
      marks: [],
      stalled: true,
      contradiction: false,
      reason: "Search limit reached before proving forced moves.",
      complete: false,
    };
  }

  const opens: Pos[] = [];
  const marks: SolverMark[] = [];

  for (let i = 0; i < constrainedCount; i++) {
    const seen = seenValues[i];
    if (seen.size !== 1) continue;
    const value = seen.values().next().value as number;
    const pos = constrainedPositions[i];
    if (value === 0) opens.push(pos);
    else marks.push({ ...pos, value });
  }

  if (useGlobalCounts && freeCount > 0) {
    const allNonZeroFixed = allGroupsFixed(remMin, remMax, nonZeroValues);
    const minNonZero = sumMapValues(remMin);
    const maxNonZero = sumMapValues(remMax);

    if (maxNonZero === 0) {
      for (const varId of freeVarIndices) {
        opens.push(unknownPositions[varId]);
      }
    } else if (minNonZero === freeCount && maxNonZero === freeCount && allNonZeroFixed) {
      const exact = exactSingleGroup(remMin, nonZeroValues, freeCount);
      if (exact !== null) {
        for (const varId of freeVarIndices) {
          marks.push({ ...unknownPositions[varId], value: exact });
        }
      }
    }
  }

  return {
    opens,
    marks,
    stalled: opens.length === 0 && marks.length === 0,
    contradiction: false,
    complete: true,
  };
}

function buildState(input: SolverInput, groupTotals?: Map<number, number>): BuildState | { contradiction: string } {
  const unknownPositions: Pos[] = [];
  const unknownId = new Map<string, number>();
  const fixedCounts = new Map<number, number>();
  const equations: Equation[] = [];

  const rows = input.rows;
  const cols = input.cols;
  const cells = input.cells;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = cells[r][c];
      if (!v.opened && v.markerCount === 0) {
        const id = unknownPositions.length;
        unknownPositions.push({ row: r, col: c });
        unknownId.set(`${r},${c}`, id);
      } else if (!v.opened && v.markerCount !== 0) {
        fixedCounts.set(v.markerCount, (fixedCounts.get(v.markerCount) ?? 0) + 1);
      } else if (v.opened && v.mineCount !== null && v.mineCount !== 0) {
        fixedCounts.set(v.mineCount, (fixedCounts.get(v.mineCount) ?? 0) + 1);
      }
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r][c];
      if (!cell.opened || cell.hint === null) continue;

      let fixedSum = 0;
      const vars: number[] = [];
      for (const n of neighbours(r, c, rows, cols)) {
        const nc = cells[n.row][n.col];
        if (nc.opened) {
          fixedSum += nc.mineCount ?? 0;
          continue;
        }
        if (nc.markerCount !== 0) {
          fixedSum += nc.markerCount;
          continue;
        }
        const id = unknownId.get(`${n.row},${n.col}`);
        if (id !== undefined) vars.push(id);
      }

      const target = cell.hint - fixedSum;
      if (vars.length === 0) {
        if (target !== 0) {
          return { contradiction: `Hint contradiction at (${r}, ${c}).` };
        }
        continue;
      }

      equations.push({ vars, target });
    }
  }

  const varUsed = new Array<boolean>(unknownPositions.length).fill(false);
  for (const eq of equations) {
    for (const v of eq.vars) varUsed[v] = true;
  }

  const constrainedVarIndices: number[] = [];
  const freeVarIndices = new Set<number>();
  for (let i = 0; i < unknownPositions.length; i++) {
    if (varUsed[i]) constrainedVarIndices.push(i);
    else freeVarIndices.add(i);
  }

  if (groupTotals) {
    for (const [g] of fixedCounts) {
      if (g === 0) continue;
      if (!groupTotals.has(g)) {
        return { contradiction: `Group ${g} is not present in visible totals.` };
      }
    }
  }

  return {
    unknownPositions,
    equations,
    fixedCounts,
    freeVarIndices,
    constrainedVarIndices,
  };
}

function solveOnlyFromGlobalCounts(
  unknownPositions: Pos[],
  remainingCounts: Map<number, number>,
  nonZeroValues: number[],
  freeCount: number,
): SolverResult {
  const opens: Pos[] = [];
  const marks: SolverMark[] = [];
  const nonZeroRemaining = sumMapValues(remainingCounts);

  if (nonZeroRemaining === 0) {
    for (const p of unknownPositions) opens.push(p);
  } else if (nonZeroRemaining === freeCount) {
    const exact = exactSingleGroup(remainingCounts, nonZeroValues, freeCount);
    if (exact !== null) {
      for (const p of unknownPositions) marks.push({ ...p, value: exact });
    }
  }

  return {
    opens,
    marks,
    stalled: opens.length === 0 && marks.length === 0,
    contradiction: false,
    complete: true,
  };
}

function buildDomain(min: number, max: number): number[] {
  const out: number[] = [];
  for (let v = min; v <= max; v++) out.push(v);
  return out;
}

function buildNonZeroValues(min: number, max: number): number[] {
  const out: number[] = [];
  for (let v = min; v <= max; v++) {
    if (v !== 0) out.push(v);
  }
  return out;
}

function buildGroupTotals(nonZeroValues: number[], totals?: GroupTotal[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const v of nonZeroValues) map.set(v, 0);
  if (!totals) return map;
  for (const g of totals) {
    map.set(g.group, g.total);
  }
  return map;
}

function sumMapValues(map: Map<number, number>): number {
  let s = 0;
  for (const [, v] of map) s += v;
  return s;
}

function allGroupsFixed(
  mins: Map<number, number>,
  maxs: Map<number, number>,
  groups: number[],
): boolean {
  for (const g of groups) {
    if (mins.get(g)! !== maxs.get(g)!) return false;
  }
  return true;
}

function exactSingleGroup(
  counts: Map<number, number>,
  groups: number[],
  total: number,
): number | null {
  let found: number | null = null;
  for (const g of groups) {
    const c = counts.get(g) ?? 0;
    if (c === 0) continue;
    if (c === total && found === null) {
      found = g;
      continue;
    }
    return null;
  }
  return found;
}

function neighbours(row: number, col: number, rows: number, cols: number): Pos[] {
  const result: Pos[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        result.push({ row: r, col: c });
      }
    }
  }
  return result;
}

function inferForcedByBounds(
  constrainedVarIndices: number[],
  equations: Equation[],
  allowedValues: number[],
): PropagationPassResult {
  const domains = new Map<number, number[]>();
  for (const varId of constrainedVarIndices) domains.set(varId, [...allowedValues]);
  if (constrainedVarIndices.length === 0 || equations.length === 0) {
    return { forced: new Map(), domains, contradiction: false };
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const eq of equations) {
      let minSum = 0;
      let maxSum = 0;
      for (const varId of eq.vars) {
        const d = domains.get(varId);
        if (!d || d.length === 0) {
          return {
            forced: new Map(),
            domains,
            contradiction: true,
            reason: "A constrained cell has no possible values.",
          };
        }
        minSum += d[0];
        maxSum += d[d.length - 1];
      }

      if (eq.target < minSum || eq.target > maxSum) {
        return {
          forced: new Map(),
          domains,
          contradiction: true,
          reason: "Visible hints are contradictory.",
        };
      }

      for (const varId of eq.vars) {
        const d = domains.get(varId)!;
        const varMin = d[0];
        const varMax = d[d.length - 1];
        const lo = eq.target - (maxSum - varMax);
        const hi = eq.target - (minSum - varMin);
        const pruned = d.filter((v) => v >= lo && v <= hi);
        if (pruned.length === 0) {
          return {
            forced: new Map(),
            domains,
            contradiction: true,
            reason: "Domain pruning found no valid value for a cell.",
          };
        }
        if (pruned.length !== d.length) {
          domains.set(varId, pruned);
          changed = true;
        }
      }
    }
  }

  const forced = new Map<number, number>();
  for (const varId of constrainedVarIndices) {
    const d = domains.get(varId)!;
    if (d.length === 1) forced.set(varId, d[0]);
  }

  return {
    forced,
    domains,
    contradiction: false,
  };
}

function uniqueSorted(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

interface ComponentPassResult {
  forced: Map<number, number>;
  contradiction: boolean;
  complete: boolean;
  reason?: string;
}

interface PropagationPassResult {
  forced: Map<number, number>;
  domains: Map<number, number[]>;
  contradiction: boolean;
  reason?: string;
}

function inferForcedFromComponents(
  constrainedVarIndices: number[],
  equations: Equation[],
  domains: Map<number, number[]>,
  maxNodesPerComponent: number,
): ComponentPassResult {
  if (constrainedVarIndices.length === 0 || equations.length === 0) {
    return { forced: new Map(), contradiction: false, complete: true };
  }

  const eqByVar = new Map<number, number[]>();
  for (const varId of constrainedVarIndices) eqByVar.set(varId, []);
  for (let eqi = 0; eqi < equations.length; eqi++) {
    for (const v of equations[eqi].vars) {
      const list = eqByVar.get(v);
      if (list) list.push(eqi);
    }
  }

  const visited = new Set<number>();
  const forced = new Map<number, number>();
  let complete = true;

  for (const startVar of constrainedVarIndices) {
    if (visited.has(startVar)) continue;

    const compVarsSet = new Set<number>();
    const compEqSet = new Set<number>();
    const queue: number[] = [startVar];
    visited.add(startVar);

    while (queue.length > 0) {
      const v = queue.pop()!;
      compVarsSet.add(v);
      const eqs = eqByVar.get(v) ?? [];
      for (const eqi of eqs) {
        if (compEqSet.has(eqi)) continue;
        compEqSet.add(eqi);
        for (const ov of equations[eqi].vars) {
          if (!visited.has(ov)) {
            visited.add(ov);
            queue.push(ov);
          }
        }
      }
    }

    const compVars = Array.from(compVarsSet);
    const compEqs = Array.from(compEqSet);
    const compDomains = compVars.map((varId) => domains.get(varId) ?? []);
    const local = solveComponentExactly(compVars, compEqs, equations, compDomains, maxNodesPerComponent);
    if (local.contradiction) {
      return {
        forced: new Map(),
        contradiction: true,
        complete: local.complete,
        reason: local.reason,
      };
    }
    if (!local.complete) complete = false;
    for (const [varId, val] of local.forced) {
      forced.set(varId, val);
    }
  }

  return { forced, contradiction: false, complete };
}

function solveComponentExactly(
  compVars: number[],
  compEqIdx: number[],
  equations: Equation[],
  compDomains: number[][],
  maxNodes: number,
): ComponentPassResult {
  for (const d of compDomains) {
    if (d.length === 0) {
      return {
        forced: new Map(),
        contradiction: true,
        complete: true,
        reason: "No values are allowed by global totals.",
      };
    }
  }

  const localIndex = new Map<number, number>();
  compVars.forEach((varId, i) => localIndex.set(varId, i));

  const localEqVars: number[][] = [];
  const localTargets: number[] = [];
  for (const eqi of compEqIdx) {
    const eq = equations[eqi];
    const mapped: number[] = [];
    for (const v of eq.vars) {
      const li = localIndex.get(v);
      if (li !== undefined) mapped.push(li);
    }
    localEqVars.push(mapped);
    localTargets.push(eq.target);
  }

  const n = compVars.length;
  const eCount = localEqVars.length;
  const varToEq = new Array(n).fill(0).map(() => [] as number[]);
  for (let ei = 0; ei < eCount; ei++) {
    for (const vi of localEqVars[ei]) varToEq[vi].push(ei);
  }
  const domMin = compDomains.map((d) => d[0]);
  const domMax = compDomains.map((d) => d[d.length - 1]);

  const assign = new Array<number>(n).fill(Number.NaN);
  const assigned = new Array<boolean>(n).fill(false);
  const eqAssigned = new Array<number>(eCount).fill(0);
  const eqUnassigned = localEqVars.map((vs) => vs.length);
  const seen = new Array(n).fill(0).map(() => new Set<number>());

  let assignedCount = 0;
  let nodes = 0;
  let complete = true;
  let solutions = 0;

  function eqFeasible(ei: number): boolean {
    const rem = localTargets[ei] - eqAssigned[ei];
    let minSum = 0;
    let maxSum = 0;
    for (const vi of localEqVars[ei]) {
      if (!assigned[vi]) {
        minSum += domMin[vi];
        maxSum += domMax[vi];
      }
    }
    return rem >= minSum && rem <= maxSum;
  }

  function canPlace(vi: number, val: number): boolean {
    for (const ei of varToEq[vi]) {
      const rem = localTargets[ei] - (eqAssigned[ei] + val);
      let minSum = 0;
      let maxSum = 0;
      for (const ov of localEqVars[ei]) {
        if (ov === vi || assigned[ov]) continue;
        minSum += domMin[ov];
        maxSum += domMax[ov];
      }
      if (rem < minSum || rem > maxSum) return false;
    }
    return true;
  }

  function pickVar(): number {
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < n; i++) {
      if (assigned[i]) continue;
      const score = varToEq[i].length;
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    return best;
  }

  function assignVar(vi: number, val: number): void {
    assigned[vi] = true;
    assign[vi] = val;
    assignedCount++;
    for (const ei of varToEq[vi]) {
      eqAssigned[ei] += val;
      eqUnassigned[ei]--;
    }
  }

  function unassignVar(vi: number, val: number): void {
    assigned[vi] = false;
    assign[vi] = Number.NaN;
    assignedCount--;
    for (const ei of varToEq[vi]) {
      eqAssigned[ei] -= val;
      eqUnassigned[ei]++;
    }
  }

  function dfs(): void {
    nodes++;
    if (nodes > maxNodes) {
      complete = false;
      return;
    }

    for (let ei = 0; ei < eCount; ei++) {
      if (!eqFeasible(ei)) return;
    }

    if (assignedCount === n) {
      solutions++;
      for (let i = 0; i < n; i++) seen[i].add(assign[i]);
      return;
    }

    const vi = pickVar();
    for (const v of compDomains[vi]) {
      if (!canPlace(vi, v)) continue;
      assignVar(vi, v);
      dfs();
      unassignVar(vi, v);
      if (!complete) return;
    }
  }

  dfs();

  if (solutions === 0) {
    return {
      forced: new Map(),
      contradiction: true,
      complete,
      reason: "Local constraints are contradictory.",
    };
  }

  const forced = new Map<number, number>();
  if (complete) {
    for (let i = 0; i < n; i++) {
      if (seen[i].size === 1) {
        forced.set(compVars[i], seen[i].values().next().value as number);
      }
    }
  }
  return { forced, contradiction: false, complete };
}
