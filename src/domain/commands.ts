import { addMonths, compareYearMonth, monthEndDate } from "./calendar";
import { creditLineKind, partyEmptyError } from "./credit";
import type {
  CreditDirection,
  CreditMarker,
  HoldItem,
  Kind,
  LineItem,
  RecurringRule,
  Schedule,
  YearMonth
} from "./types";

export type LargeEntryInput = {
  id: string;
  name: string;
  kind: Kind;
  amountCents: number;
  month: YearMonth;
  expectedDate: string | null;
  /** Default true (confirmed). False inserts a pending plan line. */
  settled?: boolean;
};

export type ManualLineInput = {
  id: string;
  month: YearMonth;
  name: string;
  kind: Kind;
  amountCents: number;
  expectedDate: string | null;
};

export type LargeEntryResult =
  | { ok: true; item: LineItem; matchingPending: LineItem | null }
  | { ok: false; error: string };

export function expectedDateForSchedule(month: YearMonth, schedule: Schedule): string | null {
  if (schedule.type === "unknown_day") return null;
  if (schedule.type === "month_end") return monthEndDate(month);
  const lastDay = Number(monthEndDate(month).slice(-2));
  const day = Math.min(schedule.day, lastDay);
  return `${month}-${String(day).padStart(2, "0")}`;
}

function monthRangeEnd(rule: RecurringRule, horizonEnd: YearMonth): YearMonth {
  const cap = rule.endMonth ?? horizonEnd;
  return compareYearMonth(cap, horizonEnd) <= 0 ? cap : horizonEnd;
}

export function generateRuleLines(
  rule: RecurringRule,
  existing: LineItem[],
  horizonEnd: YearMonth,
  nextId: () => string
): LineItem[] {
  if (!rule.enabled) return [];

  const occupied = new Set(
    existing
      .filter((l) => l.ruleId === rule.id && l.month != null)
      .map((l) => l.month as YearMonth)
  );

  const end = monthRangeEnd(rule, horizonEnd);
  let month = rule.startMonth;
  if (compareYearMonth(month, end) > 0) return [];

  const created: LineItem[] = [];
  while (compareYearMonth(month, end) <= 0) {
    if (!occupied.has(month)) {
      created.push({
        id: nextId(),
        month,
        name: rule.name,
        kind: rule.kind,
        plannedCents: rule.amountCents,
        actualCents: null,
        expectedDate: expectedDateForSchedule(month, rule.schedule),
        status: "pending",
        source: "rule",
        ruleId: rule.id,
        holdId: null,
        userOverridden: false,
        creditId: null,
        creditRole: null,
        spreadDaily: null
      });
    }
    month = addMonths(month, 1);
  }
  return created;
}

export function applyDeleteRule(
  ruleId: string,
  items: LineItem[],
  keepMonths: YearMonth[]
): LineItem[] {
  const keepSet = new Set(keepMonths);
  return items.flatMap((item) => {
    if (item.ruleId !== ruleId) return [item];

    if (item.status === "confirmed") {
      return [{ ...item, ruleId: null, source: "manual" as const }];
    }

    if (item.month != null && keepSet.has(item.month)) {
      return [{ ...item, ruleId: null, source: "manual" as const }];
    }

    return [];
  });
}

export function confirmItem(item: LineItem, actualCents: number): LineItem {
  return {
    ...item,
    status: "confirmed",
    actualCents
  };
}

export function unconfirmItem(item: LineItem): LineItem {
  return {
    ...item,
    status: "pending",
    actualCents: null
  };
}

export function createCredit(input: {
  creditId: string;
  lineId: string;
  creditor: string;
  occurDate: string;
  principalCents: number;
  direction?: CreditDirection;
}): { marker: CreditMarker; item: LineItem } {
  const direction = input.direction ?? "borrow";
  if (!input.creditor.trim()) {
    throw new Error(partyEmptyError(direction));
  }
  if (input.principalCents <= 0) {
    throw new Error("本金必须大于 0");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurDate)) {
    throw new Error("日期不合法");
  }
  return {
    marker: {
      id: input.creditId,
      creditor: input.creditor.trim(),
      direction
    },
    item: {
      id: input.lineId,
      month: input.occurDate.slice(0, 7),
      name: input.creditor.trim(),
      kind: creditLineKind(direction, "loan_in"),
      plannedCents: input.principalCents,
      actualCents: null,
      expectedDate: input.occurDate,
      status: "pending",
      source: "manual",
      ruleId: null,
      holdId: null,
      userOverridden: false,
      creditId: input.creditId,
      creditRole: "loan_in",
      spreadDaily: null
    }
  };
}

export function addRepayment(input: {
  id: string;
  creditId: string;
  creditor: string;
  expectedDate: string;
  amountCents: number;
  direction?: CreditDirection;
}): LineItem {
  if (input.amountCents <= 0) {
    throw new Error("还款金额必须大于 0");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expectedDate)) {
    throw new Error("日期不合法");
  }
  const direction = input.direction ?? "borrow";
  return {
    id: input.id,
    month: input.expectedDate.slice(0, 7),
    name: input.creditor,
    kind: creditLineKind(direction, "loan_repay"),
    plannedCents: input.amountCents,
    actualCents: null,
    expectedDate: input.expectedDate,
    status: "pending",
    source: "manual",
    ruleId: null,
    holdId: null,
    userOverridden: false,
    creditId: input.creditId,
    creditRole: "loan_repay",
    spreadDaily: null
  };
}

export function deleteCredit(creditId: string, items: LineItem[]): LineItem[] {
  return items.flatMap((item) => {
    if (item.creditId !== creditId) return [item];
    if (item.status !== "confirmed") return [];
    return [{ ...item, creditId: null, creditRole: null }];
  });
}

export function addLargeEntry(
  input: LargeEntryInput,
  thresholdCents: number,
  monthItems: LineItem[]
): LargeEntryResult {
  if (input.amountCents < thresholdCents) {
    return { ok: false, error: `大额须 ≥ ${thresholdCents / 100} 元` };
  }

  const matchingPending =
    monthItems.find(
      (item) =>
        item.month === input.month &&
        item.name === input.name &&
        item.kind === input.kind &&
        item.status === "pending"
    ) ?? null;

  const settled = input.settled !== false;
  const item: LineItem = {
    id: input.id,
    month: input.month,
    name: input.name,
    kind: input.kind,
    plannedCents: input.amountCents,
    actualCents: settled ? input.amountCents : null,
    expectedDate: input.expectedDate,
    status: settled ? "confirmed" : "pending",
    source: "manual",
    ruleId: null,
    holdId: null,
    userOverridden: false,
    creditId: null,
    creditRole: null,
    spreadDaily: null
  };

  return { ok: true, item, matchingPending };
}

export function overrideExpectedDate(
  item: LineItem,
  expectedDate: string | null
): LineItem {
  return { ...item, expectedDate, userOverridden: true };
}

export function overridePlannedAmount(
  item: LineItem,
  amountCents: number
): LineItem {
  if (item.status === "confirmed") {
    return {
      ...item,
      plannedCents: amountCents,
      actualCents: amountCents,
      userOverridden: true
    };
  }
  return { ...item, plannedCents: amountCents, userOverridden: true };
}

export function overrideItemName(item: LineItem, name: string): LineItem {
  return { ...item, name, userOverridden: true };
}

export function overrideSpreadDaily(
  item: LineItem,
  spreadDaily: boolean | null
): LineItem {
  return { ...item, spreadDaily };
}

export function addPendingLine(input: ManualLineInput): LineItem {
  return {
    id: input.id,
    month: input.month,
    name: input.name,
    kind: input.kind,
    plannedCents: input.amountCents,
    actualCents: null,
    expectedDate: input.expectedDate,
    status: "pending",
    source: "manual",
    ruleId: null,
    holdId: null,
    userOverridden: true,
    creditId: null,
    creditRole: null,
    spreadDaily: null
  };
}

export function mergeHold(
  hold: HoldItem,
  month: YearMonth,
  id: string
): { hold: HoldItem; item: LineItem } {
  return {
    hold: { ...hold, mergedIntoMonth: month },
    item: {
      id,
      month,
      name: hold.name,
      kind: hold.kind,
      plannedCents: hold.amountCents,
      actualCents: null,
      expectedDate: null,
      status: "pending",
      source: "hold",
      ruleId: null,
      holdId: hold.id,
      userOverridden: false,
      creditId: null,
      creditRole: null,
      spreadDaily: null
    }
  };
}
