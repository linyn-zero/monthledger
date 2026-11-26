import { addMonths, compareYearMonth, monthEndDate } from "./calendar";
import {
  applyAllCreditDirections,
  creditDirectionOf,
  creditRemainingCents
} from "./credit";
import type {
  CreditMarker,
  LedgerMeta,
  LineItem,
  RecurringRule,
  YearMonth
} from "./types";

export function daysInMonth(month: YearMonth): number {
  return Number(monthEndDate(month).slice(-2));
}

export function effectiveSpreadDaily(
  item: LineItem,
  rule: RecurringRule | null
): boolean {
  if (item.spreadDaily != null) return item.spreadDaily;
  return rule?.spreadDaily ?? false;
}

function spreadEvents(item: LineItem, month: YearMonth): LineItem[] {
  const days = daysInMonth(month);
  const amount = displayCents(item);
  const base = Math.floor(amount / days);
  const remainder = amount - base * days;
  const events: LineItem[] = [];
  for (let day = 1; day <= days; day++) {
    const slice = day === days ? base + remainder : base;
    const dd = String(day).padStart(2, "0");
    events.push({
      ...item,
      id: `${item.id}#${dd}`,
      plannedCents: slice,
      actualCents: null,
      status: "pending",
      expectedDate: `${month}-${dd}`,
      spreadDaily: false
    });
  }
  return events;
}

export function eventDateForTrough(item: LineItem, month: YearMonth): string {
  if (item.expectedDate) {
    return item.expectedDate;
  }
  if (item.status === "pending" && item.kind === "income") {
    return monthEndDate(month);
  }
  return `${month}-01`;
}

function troughSortKey(item: LineItem, month: YearMonth): [string, number] {
  const date = eventDateForTrough(item, month);
  const outflowFirst = item.kind === "income" ? 1 : 0;
  return [date, outflowFirst];
}

function computeTroughCents(
  openingCents: number,
  monthItems: LineItem[],
  month: YearMonth,
  rules: RecurringRule[] = []
): number {
  const expanded: LineItem[] = [];
  for (const line of monthItems) {
    const rule = rules.find((candidate) => candidate.id === line.ruleId) ?? null;
    if (effectiveSpreadDaily(line, rule)) {
      expanded.push(...spreadEvents(line, month));
    } else {
      expanded.push(line);
    }
  }
  let balance = openingCents;
  let min = balance;
  const sorted = [...expanded].sort((a, b) => {
    const [da, oa] = troughSortKey(a, month);
    const [db, ob] = troughSortKey(b, month);
    if (da !== db) {
      return da.localeCompare(db);
    }
    return oa - ob;
  });
  for (const line of sorted) {
    balance += signedCents(line);
    if (balance < min) {
      min = balance;
    }
  }
  return min;
}

export type MonthSnapshot = {
  month: YearMonth;
  openingCents: number;
  closingCents: number;
  troughCents: number;
  debtCents: number;
  receivableCents: number;
  items: LineItem[];
};

function remainingBuckets(
  items: LineItem[],
  month: YearMonth,
  markers: CreditMarker[]
): { debtCents: number; receivableCents: number } {
  const directionById = new Map(
    markers.map((marker) => [marker.id, creditDirectionOf(marker)])
  );
  const creditIds = new Set<string>();
  for (const line of items) {
    if (line.creditRole === "loan_in" && line.creditId) {
      creditIds.add(line.creditId);
    }
  }
  let debtCents = 0;
  let receivableCents = 0;
  for (const creditId of creditIds) {
    const remaining = creditRemainingCents(items, creditId, month);
    if (directionById.get(creditId) === "lend") {
      receivableCents += remaining;
    } else {
      debtCents += remaining;
    }
  }
  return { debtCents, receivableCents };
}

export function displayCents(item: LineItem): number {
  if (item.status === "confirmed" && item.actualCents !== null) {
    return item.actualCents;
  }
  return item.plannedCents;
}

export function signedCents(item: LineItem): number {
  const amount = displayCents(item);
  if (item.kind === "income") {
    return amount;
  }
  return -amount;
}

/** Opening cash plus confirmed signed amounts through todayMonth (inclusive). */
export function impliedCashCents(
  meta: LedgerMeta,
  items: LineItem[],
  todayMonth: YearMonth
): number {
  let cash = meta.openingCashCents;
  for (const item of items) {
    if (item.status !== "confirmed" || item.month == null) continue;
    if (compareYearMonth(item.month, todayMonth) > 0) continue;
    cash += signedCents(item);
  }
  return cash;
}

export function buildOverview(
  meta: LedgerMeta,
  rawItems: LineItem[],
  fromMonth: YearMonth,
  monthCount: number,
  rules: RecurringRule[] = [],
  markers: CreditMarker[] = []
): MonthSnapshot[] {
  const snapshots: MonthSnapshot[] = [];
  const items = applyAllCreditDirections(rawItems, markers);
  let openingCents = meta.openingCashCents;

  const monthsBeforeFrom = compareYearMonth(fromMonth, meta.startMonth);
  if (monthsBeforeFrom < 0) {
    throw new Error(
      `fromMonth ${fromMonth} is before ledger startMonth ${meta.startMonth}`
    );
  }

  let cursor = meta.startMonth;
  for (let i = 0; i < monthsBeforeFrom; i++) {
    const monthItems = items.filter((line) => line.month === cursor);
    const delta = monthItems.reduce((sum, line) => sum + signedCents(line), 0);
    openingCents = openingCents + delta;
    cursor = addMonths(cursor, 1);
  }

  for (let i = 0; i < monthCount; i++) {
    const month = addMonths(fromMonth, i);
    const monthItems = items.filter((item) => item.month === month);
    const delta = monthItems.reduce((sum, item) => sum + signedCents(item), 0);
    const closingCents = openingCents + delta;
    const { debtCents, receivableCents } = remainingBuckets(
      items,
      month,
      markers
    );

    snapshots.push({
      month,
      openingCents,
      closingCents,
      troughCents: computeTroughCents(openingCents, monthItems, month, rules),
      debtCents,
      receivableCents,
      items: monthItems
    });

    openingCents = closingCents;
  }

  return snapshots;
}
