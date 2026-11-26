import type { HoldItem, LedgerMeta, LineItem, RecurringRule, CreditMarker } from "../domain/types";
import type { LedgerSnapshot, UndoLanes } from "../domain/undo";

export const SCHEMA_VERSION = 1;
export const UNDO_CAP = 10;
/** Chromium File System Access: each extension must be ≤16 chars (`.monthledger.json` is 17). */
export const FILE_EXTENSION = ".monthledger";

export type LedgerDocument = {
  schemaVersion: number;
  /** Absent until first-run wizard completes. */
  meta: LedgerMeta | null;
  rules: RecurringRule[];
  items: LineItem[];
  holds: HoldItem[];
  markers: CreditMarker[];
  undo: UndoLanes;
};

export type LedgerBody = {
  meta: LedgerMeta;
  rules: RecurringRule[];
  items: LineItem[];
  holds: HoldItem[];
  markers: CreditMarker[];
};

export function emptyUndo(): UndoLanes {
  return { past: [], future: [] };
}

export function bodyFromDoc(doc: LedgerDocument): LedgerBody | null {
  if (!doc.meta) return null;
  return {
    meta: doc.meta,
    rules: doc.rules,
    items: doc.items,
    holds: doc.holds,
    markers: doc.markers
  };
}

export function snapshotFromBody(body: LedgerBody): LedgerSnapshot {
  return {
    meta: body.meta,
    items: body.items,
    rules: body.rules,
    holds: body.holds,
    markers: body.markers
  };
}

export function parseLedgerDocument(raw: unknown): LedgerDocument {
  if (raw == null || typeof raw !== "object") {
    throw new Error("账本文件格式无效");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`不支持的 schemaVersion（需要 ${SCHEMA_VERSION}）`);
  }
  const meta =
    obj.meta != null && typeof obj.meta === "object"
      ? (obj.meta as LedgerMeta)
      : null;
  const undoRaw = obj.undo;
  let undo: UndoLanes = emptyUndo();
  if (undoRaw != null && typeof undoRaw === "object") {
    const u = undoRaw as { past?: unknown; future?: unknown };
    undo = {
      past: Array.isArray(u.past) ? (u.past as LedgerSnapshot[]) : [],
      future: Array.isArray(u.future) ? (u.future as LedgerSnapshot[]) : []
    };
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    meta,
    rules: Array.isArray(obj.rules) ? (obj.rules as RecurringRule[]) : [],
    items: Array.isArray(obj.items) ? (obj.items as LineItem[]) : [],
    holds: Array.isArray(obj.holds) ? (obj.holds as HoldItem[]) : [],
    markers: Array.isArray(obj.markers) ? (obj.markers as CreditMarker[]) : [],
    undo
  };
}

export function serializeDocument(
  body: LedgerBody | null,
  undo: UndoLanes
): string {
  const doc: LedgerDocument = {
    schemaVersion: SCHEMA_VERSION,
    meta: body?.meta ?? null,
    rules: body?.rules ?? [],
    items: body?.items ?? [],
    holds: body?.holds ?? [],
    markers: body?.markers ?? [],
    undo
  };
  return JSON.stringify(doc, null, 2);
}
