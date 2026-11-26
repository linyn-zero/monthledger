import type {
  CreditMarker,
  HoldItem,
  LedgerMeta,
  LineItem,
  RecurringRule
} from "./types";

export const UNDO_LIMIT_DEFAULT = 40;
export const UNDO_LIMIT_MIN = 10;
export const UNDO_LIMIT_MAX = 200;

export type LedgerSnapshot = {
  meta: LedgerMeta;
  items: LineItem[];
  rules: RecurringRule[];
  holds: HoldItem[];
  markers: CreditMarker[];
};

export type UndoLanes = {
  past: LedgerSnapshot[];
  future: LedgerSnapshot[];
};

export function parseUndoLimit(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (value < UNDO_LIMIT_MIN || value > UNDO_LIMIT_MAX) return null;
  return value;
}

export function emptyUndoLanes(): UndoLanes {
  return { past: [], future: [] };
}

export function pushUndo(
  lanes: UndoLanes,
  snapshot: LedgerSnapshot,
  limit: number
): UndoLanes {
  const past = [...lanes.past, snapshot];
  return trimLanes({ past, future: [] }, limit);
}

export function undo(
  lanes: UndoLanes,
  current: LedgerSnapshot
): { lanes: UndoLanes; restore: LedgerSnapshot } | null {
  if (lanes.past.length === 0) return null;
  const restore = lanes.past[lanes.past.length - 1];
  return {
    restore,
    lanes: {
      past: lanes.past.slice(0, -1),
      future: [current, ...lanes.future]
    }
  };
}

export function redo(
  lanes: UndoLanes,
  current: LedgerSnapshot
): { lanes: UndoLanes; restore: LedgerSnapshot } | null {
  if (lanes.future.length === 0) return null;
  const [restore, ...rest] = lanes.future;
  return {
    restore,
    lanes: {
      past: [...lanes.past, current],
      future: rest
    }
  };
}

export function trimLanes(lanes: UndoLanes, limit: number): UndoLanes {
  const cap = Math.max(UNDO_LIMIT_MIN, Math.min(UNDO_LIMIT_MAX, limit));
  return {
    past: lanes.past.slice(Math.max(0, lanes.past.length - cap)),
    future: lanes.future.slice(0, cap)
  };
}
