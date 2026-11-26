import { addMonths, compareYearMonth } from "./calendar";
import type { MonthSnapshot } from "./formulas";
import type {
  HoldItem,
  LedgerMeta,
  LineItem,
  RecurringRule,
  Schedule,
  YearMonth
} from "./types";

const BOM = "\uFEFF";

export function exportMonthWindow(
  meta: LedgerMeta,
  items: LineItem[]
): { fromMonth: YearMonth; monthCount: number } {
  const fromMonth = meta.startMonth;
  let end = addMonths(fromMonth, 11);
  for (const item of items) {
    if (item.month == null) continue;
    if (compareYearMonth(item.month, end) > 0) {
      end = item.month;
    }
  }
  return {
    fromMonth,
    monthCount: compareYearMonth(end, fromMonth) + 1
  };
}

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function yuanFromCents(cents: number): string {
  return String(cents / 100);
}

function toCsv(header: string, rows: string[][]): string {
  const lines = [header, ...rows.map((row) => row.map(csvField).join(","))];
  return `${BOM}${lines.join("\n")}\n`;
}

function kindLabel(kind: LineItem["kind"]): string {
  if (kind === "income") return "收入";
  if (kind === "debt_repay") return "还债";
  return "支出";
}

function scheduleLabel(schedule: Schedule): string {
  if (schedule.type === "month_end") return "月末";
  if (schedule.type === "unknown_day") return "不定";
  return `每月${schedule.day}号`;
}

export function exportLedgerCsv(
  _meta: LedgerMeta,
  months: MonthSnapshot[],
  items: LineItem[],
  holds: HoldItem[],
  rules: RecurringRule[]
): { overview: string; items: string; holds: string; rules: string } {
  const overview = toCsv("月份,月初,月底预计,月内最低,负债,应收", months.map((m) => [
    m.month,
    yuanFromCents(m.openingCents),
    yuanFromCents(m.closingCents),
    yuanFromCents(m.troughCents),
    yuanFromCents(m.debtCents),
    yuanFromCents(m.receivableCents)
  ]));

  const itemsCsv = toCsv(
    "月份,名称,方向,计划金额,实际金额,预计日期,状态,来源",
    items.map((item) => [
      item.month ?? "",
      item.name,
      kindLabel(item.kind),
      yuanFromCents(item.plannedCents),
      item.actualCents == null ? "" : yuanFromCents(item.actualCents),
      item.expectedDate ?? "",
      item.status,
      item.source
    ])
  );

  const holdsCsv = toCsv("名称,方向,金额,备注,并入月份", holds.map((hold) => [
    hold.name,
    kindLabel(hold.kind),
    yuanFromCents(hold.amountCents),
    hold.note,
    hold.mergedIntoMonth ?? ""
  ]));

  const rulesCsv = toCsv("名称,方向,金额,周期,起始月,结束月,启用", rules.map((rule) => [
    rule.name,
    kindLabel(rule.kind),
    yuanFromCents(rule.amountCents),
    scheduleLabel(rule.schedule),
    rule.startMonth,
    rule.endMonth ?? "",
    rule.enabled ? "是" : "否"
  ]));

  return {
    overview,
    items: itemsCsv,
    holds: holdsCsv,
    rules: rulesCsv
  };
}
