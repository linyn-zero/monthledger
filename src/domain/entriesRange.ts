import { compareYearMonth, monthsInclusive } from "./calendar";
import { creditVisibleInMonth } from "./credit";
import type { CreditMarker, LineItem, RecurringRule, YearMonth } from "./types";

function byName<T extends { name?: string; creditor?: string }>(
  key: (row: T) => string
): (a: T, b: T) => number {
  return (a, b) => key(a).localeCompare(key(b), "zh-CN");
}

export function onceInRange(
  items: LineItem[],
  from: YearMonth,
  to: YearMonth
): LineItem[] {
  return items
    .filter(
      (item) =>
        item.source !== "rule" &&
        item.source !== "adjust" &&
        item.creditRole == null &&
        item.month != null &&
        compareYearMonth(from, item.month) <= 0 &&
        compareYearMonth(item.month, to) <= 0
    )
    .sort(byName((item) => item.name));
}

export function cashflowsInRange(
  rules: RecurringRule[],
  from: YearMonth,
  to: YearMonth
): RecurringRule[] {
  return rules
    .filter((rule) => {
      if (!rule.enabled || rule.kind === "debt_repay") return false;
      if (compareYearMonth(rule.startMonth, to) > 0) return false;
      if (rule.endMonth != null && compareYearMonth(from, rule.endMonth) > 0) {
        return false;
      }
      return true;
    })
    .sort(byName((rule) => rule.name));
}

export function creditsInRange(
  items: LineItem[],
  markers: CreditMarker[],
  from: YearMonth,
  to: YearMonth
): CreditMarker[] {
  const months = monthsInclusive(from, to);
  return markers
    .filter((marker) =>
      months.some((month) => creditVisibleInMonth(items, marker.id, month))
    )
    .sort(byName((marker) => marker.creditor));
}
