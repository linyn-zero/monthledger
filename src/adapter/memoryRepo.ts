import type {
  CreditMarker,
  HoldItem,
  LedgerMeta,
  LineItem,
  RecurringRule
} from "../domain/types";
import {
  emptyUndoLanes,
  type LedgerSnapshot,
  type UndoLanes
} from "../domain/undo";

export type LedgerState = {
  meta: LedgerMeta;
  rules: RecurringRule[];
  items: LineItem[];
  holds: HoldItem[];
  markers: CreditMarker[];
};

export class MemoryRepo {
  private meta: LedgerMeta | null = null;
  private rules: RecurringRule[] = [];
  private items: LineItem[] = [];
  private holds: HoldItem[] = [];
  private markers: CreditMarker[] = [];
  private undo: UndoLanes = emptyUndoLanes();

  clear(): void {
    this.meta = null;
    this.rules = [];
    this.items = [];
    this.holds = [];
    this.markers = [];
    this.undo = emptyUndoLanes();
  }

  load(state: LedgerState, undo: UndoLanes = emptyUndoLanes()): void {
    this.meta = structuredClone(state.meta);
    this.rules = structuredClone(state.rules);
    this.items = structuredClone(state.items);
    this.holds = structuredClone(state.holds);
    this.markers = structuredClone(state.markers);
    this.undo = structuredClone(undo);
  }

  getMeta(): LedgerMeta | null {
    return this.meta ? structuredClone(this.meta) : null;
  }

  saveMeta(meta: LedgerMeta): void {
    this.meta = structuredClone(meta);
  }

  listRules(): RecurringRule[] {
    return structuredClone(this.rules);
  }

  saveRule(rule: RecurringRule): void {
    const idx = this.rules.findIndex((r) => r.id === rule.id);
    const copy = structuredClone(rule);
    if (idx >= 0) this.rules[idx] = copy;
    else this.rules.push(copy);
  }

  deleteRuleRow(id: string): void {
    this.rules = this.rules.filter((r) => r.id !== id);
  }

  listItems(): LineItem[] {
    return structuredClone(this.items);
  }

  upsertItem(item: LineItem): void {
    const idx = this.items.findIndex((row) => row.id === item.id);
    const copy = structuredClone(item);
    if (idx >= 0) this.items[idx] = copy;
    else this.items.push(copy);
  }

  deleteItem(id: string): void {
    this.items = this.items.filter((row) => row.id !== id);
  }

  listCredits(): CreditMarker[] {
    return structuredClone(this.markers);
  }

  upsertCredit(marker: CreditMarker): void {
    const idx = this.markers.findIndex((row) => row.id === marker.id);
    const copy = structuredClone(marker);
    if (idx >= 0) this.markers[idx] = copy;
    else this.markers.push(copy);
  }

  deleteCredit(id: string): void {
    this.markers = this.markers.filter((row) => row.id !== id);
  }

  listHolds(): HoldItem[] {
    return structuredClone(this.holds);
  }

  upsertHold(hold: HoldItem): void {
    const idx = this.holds.findIndex((row) => row.id === hold.id);
    const copy = structuredClone(hold);
    if (idx >= 0) this.holds[idx] = copy;
    else this.holds.push(copy);
  }

  dumpState(): LedgerState | null {
    if (!this.meta) return null;
    return {
      meta: structuredClone(this.meta),
      rules: structuredClone(this.rules),
      items: structuredClone(this.items),
      holds: structuredClone(this.holds),
      markers: structuredClone(this.markers)
    };
  }

  readUndo(): UndoLanes {
    return structuredClone(this.undo);
  }

  writeUndo(lanes: UndoLanes): void {
    this.undo = structuredClone(lanes);
  }

  replaceAll(state: LedgerState): void {
    this.meta = structuredClone(state.meta);
    this.rules = structuredClone(state.rules);
    this.items = structuredClone(state.items);
    this.holds = structuredClone(state.holds);
    this.markers = structuredClone(state.markers);
  }

  runInTransaction(fn: () => void): void {
    fn();
  }
}

export type { LedgerSnapshot };
