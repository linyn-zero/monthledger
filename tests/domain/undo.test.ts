import { describe, expect, it } from "vitest";
import {
  parseUndoLimit,
  pushUndo,
  redo,
  trimLanes,
  undo,
  type LedgerSnapshot,
  type UndoLanes
} from "../../src/domain/undo";

const snap = (n: number): LedgerSnapshot => ({
  meta: {
    startMonth: "2026-09",
    openingCashCents: n,
    openingDebtCents: 0,
    largeThresholdCents: 0,
    notifyEnabled: true,
    undoLimit: 40
  },
  items: [],
  rules: [],
  holds: [],
  markers: []
});

const emptyLanes = (): UndoLanes => ({ past: [], future: [] });

describe("undo", () => {
  it("parses 10–200 integers only", () => {
    expect(parseUndoLimit("40")).toBe(40);
    expect(parseUndoLimit("10")).toBe(10);
    expect(parseUndoLimit("200")).toBe(200);
    expect(parseUndoLimit("9")).toBeNull();
    expect(parseUndoLimit("201")).toBeNull();
    expect(parseUndoLimit("40.5")).toBeNull();
    expect(parseUndoLimit("")).toBeNull();
  });

  it("pushes onto past, drops the oldest when over limit, and clears future", () => {
    let lanes = emptyLanes();
    for (let i = 1; i <= 10; i += 1) lanes = pushUndo(lanes, snap(i), 10);
    lanes = { ...lanes, future: [snap(99)] };
    lanes = pushUndo(lanes, snap(11), 10);
    expect(lanes.past.map((row) => row.meta.openingCashCents)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11
    ]);
    expect(lanes.future).toEqual([]);
  });

  it("undo restores the last past snapshot and moves current onto future", () => {
    const afterPush = pushUndo(pushUndo(emptyLanes(), snap(1), 40), snap(2), 40);
    const result = undo(afterPush, snap(3));
    expect(result?.restore.meta.openingCashCents).toBe(2);
    expect(result?.lanes.past.map((row) => row.meta.openingCashCents)).toEqual([1]);
    expect(result?.lanes.future.map((row) => row.meta.openingCashCents)).toEqual([3]);
  });

  it("redo restores the nearest future snapshot", () => {
    const afterUndo = undo(pushUndo(emptyLanes(), snap(1), 40), snap(2));
    const result = redo(afterUndo!.lanes, afterUndo!.restore);
    expect(result?.restore.meta.openingCashCents).toBe(2);
    expect(result?.lanes.future).toEqual([]);
  });

  it("trims oldest past entries when the limit shrinks", () => {
    let stacked = emptyLanes();
    for (let i = 0; i < 12; i += 1) stacked = pushUndo(stacked, snap(i), 40);
    stacked = trimLanes(stacked, 10);
    expect(stacked.past.map((row) => row.meta.openingCashCents)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11
    ]);
  });
});
