import {
  addMonths,
  compareYearMonth,
  horizonEndMonth,
  monthEndDate,
  shanghaiCalendarDate
} from "../domain/calendar";
import {
  adoptOpeningDebt,
  applyAllCreditDirections,
  applyCreditDirection,
  creditDirectionOf,
  creditLineKind,
  partyEmptyError
} from "../domain/credit";
import {
  addPendingLine,
  addRepayment,
  applyDeleteRule,
  confirmItem as confirmLine,
  createCredit,
  deleteCredit,
  generateRuleLines,
  mergeHold as mergeHoldIntoMonth,
  overrideExpectedDate,
  overrideItemName,
  overrideSpreadDaily,
  overridePlannedAmount,
  unconfirmItem as unconfirmLine,
  type ManualLineInput
} from "../domain/commands";
import { exportLedgerCsv, exportMonthWindow } from "../domain/exportCsv";
import { buildOverview, type MonthSnapshot } from "../domain/formulas";
import { pushUndo, redo as redoLanes, undo as undoLanes } from "../domain/undo";
import type {
  CreditDirection,
  CreditMarker,
  HoldItem,
  LedgerMeta,
  LineItem,
  RecurringRule,
  RuleDeleteMonth,
  Schedule,
  YearMonth
} from "../domain/types";
import { UNDO_CAP } from "../fileStore/types";
import { MemoryRepo, type LedgerState } from "./memoryRepo";
import type { UndoLanes } from "../domain/undo";

export type OverviewPayload = {
  meta: LedgerMeta;
  months: MonthSnapshot[];
  holds: HoldItem[];
};

function expectedDateForSchedule(month: YearMonth, schedule: Schedule): string | null {
  if (schedule.type === "unknown_day") return null;
  if (schedule.type === "month_end") return monthEndDate(month);
  const lastDay = Number(monthEndDate(month).slice(-2));
  const day = Math.min(schedule.day, lastDay);
  return `${month}-${String(day).padStart(2, "0")}`;
}

export class WebService {
  private readonly repo = new MemoryRepo();
  private fileLabel = "";
  private persist: (() => void) | null = null;

  setPersistHandler(fn: () => void): void {
    this.persist = fn;
  }

  setFileLabel(name: string): void {
    this.fileLabel = name;
  }

  hydrate(state: LedgerState, undo: UndoLanes): void {
    const meta = { ...state.meta };
    delete meta.undoLimit;
    this.repo.load({ ...state, meta }, undo);
    this.adoptStoredOpeningDebt();
    this.syncCreditLineKinds();
    this.fillRuleHorizon(12);
  }

  startEmpty(): void {
    this.repo.clear();
  }

  needsSetup(): boolean {
    return this.repo.getMeta() == null;
  }

  getMeta(): LedgerMeta {
    return this.requireMeta();
  }

  getOverview(fromMonth: string, monthCount: number): OverviewPayload {
    const meta = this.requireMeta();
    const from =
      compareYearMonth(fromMonth, meta.startMonth) < 0
        ? meta.startMonth
        : fromMonth;
    const items = this.repo.listItems();
    return {
      meta,
      months: buildOverview(
        meta,
        items,
        from,
        monthCount,
        this.repo.listRules(),
        this.repo.listCredits()
      ),
      holds: this.repo.listHolds()
    };
  }

  confirmItem(id: string, actualCents: number): void {
    this.withUndo(() => {
      const item = this.requireItem(id);
      this.repo.upsertItem(confirmLine(item, actualCents));
    });
  }

  unconfirmItem(id: string): void {
    this.withUndo(() => {
      const item = this.requireItem(id);
      this.repo.upsertItem(unconfirmLine(item));
    });
  }

  createCredit(input: {
    creditor: string;
    occurDate: string;
    principalCents: number;
    direction?: CreditDirection;
  }): void {
    this.withUndo(() => {
      const created = createCredit({
        ...input,
        creditId: this.nextId(),
        lineId: this.nextId()
      });
      this.repo.upsertCredit(created.marker);
      this.repo.upsertItem(created.item);
    });
  }

  addRepayment(input: {
    creditId: string;
    expectedDate: string;
    amountCents: number;
  }): void {
    this.withUndo(() => {
      const marker = this.repo.listCredits().find((row) => row.id === input.creditId);
      if (!marker) throw new Error("信贷不存在");
      this.repo.upsertItem(
        addRepayment({
          id: this.nextId(),
          creditId: input.creditId,
          creditor: marker.creditor,
          expectedDate: input.expectedDate,
          amountCents: input.amountCents,
          direction: creditDirectionOf(marker)
        })
      );
    });
  }

  deleteCredit(creditId: string): void {
    this.withUndo(() => {
      this.repo.runInTransaction(() => {
        const before = this.repo.listItems();
        const after = deleteCredit(creditId, before);
        const afterIds = new Set(after.map((item) => item.id));
        for (const item of before) {
          if (!afterIds.has(item.id)) this.repo.deleteItem(item.id);
        }
        for (const item of after) this.repo.upsertItem(item);
        this.repo.deleteCredit(creditId);
      });
    });
  }

  mergeHold(holdId: string, month: string): void {
    this.withUndo(() => {
      const hold = this.repo.listHolds().find((h) => h.id === holdId);
      if (!hold) throw new Error(`hold not found: ${holdId}`);
      const { hold: updated, item } = mergeHoldIntoMonth(
        hold,
        month as YearMonth,
        this.nextId()
      );
      this.repo.runInTransaction(() => {
        this.repo.upsertHold(updated);
        this.repo.upsertItem(item);
      });
    });
  }

  listRules(): RecurringRule[] {
    return this.repo.listRules();
  }

  listRuleDeleteMonths(ruleId: string): RuleDeleteMonth[] {
    const byMonth = new Map<YearMonth, RuleDeleteMonth>();
    for (const item of this.repo.listItems()) {
      if (item.ruleId !== ruleId || item.month == null) continue;
      const confirmed = item.status === "confirmed";
      const prev = byMonth.get(item.month);
      if (!prev) {
        byMonth.set(item.month, {
          month: item.month,
          confirmed,
          amountCents: item.plannedCents
        });
        continue;
      }
      if (confirmed && !prev.confirmed) {
        byMonth.set(item.month, {
          month: item.month,
          confirmed: true,
          amountCents: item.plannedCents
        });
      }
    }
    return [...byMonth.values()].sort((a, b) =>
      compareYearMonth(a.month, b.month)
    );
  }

  saveRule(rule: RecurringRule): void {
    this.withUndo(() => {
      this.repo.runInTransaction(() => {
        this.repo.saveRule(rule);
        const items = this.repo.listItems();
        for (const item of items) {
          if (
            item.ruleId === rule.id &&
            item.status === "pending" &&
            !item.userOverridden
          ) {
            this.repo.upsertItem({
              ...item,
              name: rule.name,
              kind: rule.kind === "debt_repay" ? item.kind : rule.kind,
              plannedCents: rule.amountCents,
              expectedDate:
                item.month != null
                  ? expectedDateForSchedule(item.month, rule.schedule)
                  : item.expectedDate
            });
          }
        }
        this.fillRuleHorizon(12);
      });
    });
  }

  deleteRule(ruleId: string, keepMonths: string[]): void {
    this.withUndo(() => {
      this.repo.runInTransaction(() => {
        const before = this.repo.listItems();
        const after = applyDeleteRule(ruleId, before, keepMonths as YearMonth[]);
        const afterById = new Map(after.map((item) => [item.id, item]));
        for (const item of before) {
          if (!afterById.has(item.id)) this.repo.deleteItem(item.id);
        }
        for (const item of after) {
          const prev = before.find((b) => b.id === item.id);
          if (
            prev &&
            (prev.ruleId !== item.ruleId ||
              prev.source !== item.source ||
              prev.status !== item.status)
          ) {
            this.repo.upsertItem(item);
          }
        }
        this.repo.deleteRuleRow(ruleId);
      });
    });
  }

  updateExpectedDate(id: string, expectedDate: string | null): void {
    this.withUndo(() => {
      const item = this.requireItem(id);
      this.repo.upsertItem(overrideExpectedDate(item, expectedDate));
    });
  }

  updatePlannedAmount(id: string, amountCents: number): void {
    this.withUndo(() => {
      const item = this.requireItem(id);
      this.repo.upsertItem(overridePlannedAmount(item, amountCents));
    });
  }

  updateItemName(id: string, name: string): void {
    this.withUndo(() => {
      const item = this.requireItem(id);
      this.repo.upsertItem(overrideItemName(item, name));
    });
  }

  updateSpreadDaily(id: string, spreadDaily: boolean | null): void {
    this.withUndo(() => {
      const item = this.requireItem(id);
      this.repo.upsertItem(overrideSpreadDaily(item, spreadDaily));
    });
  }

  addManualLine(input: Omit<ManualLineInput, "id">): void {
    this.withUndo(() => {
      this.repo.upsertItem(addPendingLine({ ...input, id: this.nextId() }));
    });
  }

  setup(meta: {
    startMonth: YearMonth;
    openingCashCents: number;
    openingDebtCents: number;
    largeThresholdCents?: number;
    notifyEnabled?: boolean;
  }): void {
    this.repo.saveMeta({
      startMonth: meta.startMonth,
      openingCashCents: meta.openingCashCents,
      openingDebtCents: meta.openingDebtCents,
      largeThresholdCents: meta.largeThresholdCents ?? 50000,
      notifyEnabled: meta.notifyEnabled ?? true
    });
    this.adoptStoredOpeningDebt();
    this.schedulePersist();
  }

  saveSettings(settings: { notifyEnabled: boolean }): void {
    this.withUndo(() => {
      const meta = this.requireMeta();
      this.repo.saveMeta({
        ...meta,
        notifyEnabled: settings.notifyEnabled
      });
    });
  }

  saveOpeningCash(cents: number): void {
    if (!Number.isInteger(cents)) throw new Error("起始现金须为数字");
    const meta = this.requireMeta();
    if (meta.openingCashCents === cents) return;
    this.withUndo(() => {
      this.repo.saveMeta({
        ...meta,
        openingCashCents: cents
      });
    });
  }

  listCredits(): CreditMarker[] {
    return this.repo.listCredits();
  }

  saveLine(item: LineItem): void {
    this.withUndo(() => {
      if (!item.name.trim()) throw new Error("名称不能为空");
      if (item.plannedCents <= 0) throw new Error("金额必须大于 0");
      if (
        item.status === "confirmed" &&
        (item.actualCents == null || item.actualCents <= 0)
      ) {
        throw new Error("金额必须大于 0");
      }
      let next = item;
      if (item.creditId && item.creditRole) {
        const marker = this.repo.listCredits().find((row) => row.id === item.creditId);
        if (marker) {
          next = {
            ...item,
            kind: creditLineKind(creditDirectionOf(marker), item.creditRole)
          };
        }
      }
      this.repo.upsertItem(next);
    });
  }

  deleteLine(id: string): void {
    this.withUndo(() => {
      this.repo.deleteItem(id);
    });
  }

  saveCredit(marker: CreditMarker): void {
    this.withUndo(() => {
      const creditor = marker.creditor.trim();
      const direction = creditDirectionOf(marker);
      if (!creditor) throw new Error(partyEmptyError(direction));
      this.repo.runInTransaction(() => {
        this.repo.upsertCredit({ id: marker.id, creditor, direction });
        const flipped = applyCreditDirection(
          this.repo.listItems(),
          marker.id,
          direction
        );
        for (const item of flipped) {
          if (item.creditId !== marker.id) continue;
          this.repo.upsertItem({ ...item, name: creditor });
        }
      });
    });
  }

  listItems(): LineItem[] {
    return this.repo.listItems();
  }

  exportCsv(): {
    overview: string;
    items: string;
    holds: string;
    rules: string;
  } {
    const meta = this.requireMeta();
    const items = this.repo.listItems();
    const holds = this.repo.listHolds();
    const rules = this.repo.listRules();
    const { fromMonth, monthCount } = exportMonthWindow(meta, items);
    const months = buildOverview(
      meta,
      items,
      fromMonth,
      monthCount,
      rules,
      this.repo.listCredits()
    );
    return exportLedgerCsv(meta, months, items, holds, rules);
  }

  filePathLabel(): string {
    return this.fileLabel || "（未绑定文件）";
  }

  dumpForPersist(): { body: LedgerState; undo: UndoLanes } | null {
    const body = this.repo.dumpState();
    if (!body) return null;
    return { body, undo: this.repo.readUndo() };
  }

  undo(): boolean {
    const current = this.snapshot();
    const result = undoLanes(this.repo.readUndo(), current);
    if (!result) return false;
    this.repo.replaceAll(result.restore);
    this.repo.writeUndo(result.lanes);
    this.schedulePersist();
    return true;
  }

  redo(): boolean {
    const current = this.snapshot();
    const result = redoLanes(this.repo.readUndo(), current);
    if (!result) return false;
    this.repo.replaceAll(result.restore);
    this.repo.writeUndo(result.lanes);
    this.schedulePersist();
    return true;
  }

  private syncCreditLineKinds(): void {
    const before = this.repo.listItems();
    const synced = applyAllCreditDirections(before, this.repo.listCredits());
    for (const item of synced) {
      const prev = before.find((row) => row.id === item.id);
      if (prev && prev.kind !== item.kind) this.repo.upsertItem(item);
    }
  }

  private adoptStoredOpeningDebt(): void {
    const meta = this.repo.getMeta();
    if (!meta) return;
    const before = {
      meta,
      markers: this.repo.listCredits(),
      items: this.repo.listItems(),
      rules: this.repo.listRules()
    };
    const adopted = adoptOpeningDebt({
      ...before,
      newCreditId: this.nextId(),
      newLineId: this.nextId()
    });
    const changed =
      adopted.meta.openingCashCents !== before.meta.openingCashCents ||
      adopted.meta.openingDebtCents !== before.meta.openingDebtCents ||
      adopted.markers.length !== before.markers.length ||
      adopted.items.length !== before.items.length;
    if (!changed) return;
    this.repo.saveMeta(adopted.meta);
    for (const marker of adopted.markers) this.repo.upsertCredit(marker);
    for (const item of adopted.items) this.repo.upsertItem(item);
    for (const rule of adopted.rules) this.repo.saveRule(rule);
  }

  private snapshot() {
    const state = this.repo.dumpState();
    if (!state) throw new Error("ledger meta missing");
    return state;
  }

  private withUndo(fn: () => void): void {
    const before = this.snapshot();
    fn();
    this.repo.writeUndo(pushUndo(this.repo.readUndo(), before, UNDO_CAP));
    this.schedulePersist();
  }

  private schedulePersist(): void {
    this.persist?.();
  }

  private fillRuleHorizon(monthsAhead: number): void {
    const rules = this.repo.listRules();
    let items = this.repo.listItems();
    const horizon = horizonEndMonth(
      new Date(shanghaiCalendarDate() + "T12:00:00"),
      monthsAhead
    );
    const meta = this.repo.getMeta();
    const fromStart = meta ? addMonths(meta.startMonth, monthsAhead) : horizon;
    const end = fromStart > horizon ? fromStart : horizon;

    for (const rule of rules) {
      const created = generateRuleLines(rule, items, end, () => this.nextId());
      for (const item of created) this.repo.upsertItem(item);
      if (created.length > 0) items = [...items, ...created];
    }
  }

  private requireMeta(): LedgerMeta {
    const meta = this.repo.getMeta();
    if (!meta) throw new Error("ledger meta missing");
    return meta;
  }

  private requireItem(id: string): LineItem {
    const item = this.repo.listItems().find((line) => line.id === id);
    if (!item) throw new Error(`item not found: ${id}`);
    return item;
  }

  private nextId(): string {
    return crypto.randomUUID();
  }
}
