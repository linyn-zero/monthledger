import { compareYearMonth } from "./calendar";
import { expectedDateForSchedule } from "./commands";
import { displayCents } from "./formulas";
import type { LineItem, RecurringRule, YearMonth } from "./types";

export function cashflowDateDiffers(rule: RecurringRule, line: LineItem): boolean {
  const month = line.month;
  if (!month) return false;
  const lineSpread = line.spreadDaily ?? rule.spreadDaily;
  if (lineSpread !== rule.spreadDaily) return true;
  if (lineSpread) return false;
  if (line.expectedDate == null) return false;
  return line.expectedDate !== expectedDateForSchedule(month, rule.schedule);
}

export function cashflowLineIsException(rule: RecurringRule, line: LineItem): boolean {
  if (line.ruleId !== rule.id || line.month == null) return false;
  if (displayCents(line) !== rule.amountCents) return true;
  return cashflowDateDiffers(rule, line);
}

export function cashflowExceptionMonths(
  rule: RecurringRule,
  items: LineItem[],
  selectedMonth?: YearMonth
): YearMonth[] {
  const months = items
    .filter((line) => cashflowLineIsException(rule, line))
    .map((line) => line.month as YearMonth);

  const unique = [...new Set(months)].sort(compareYearMonth);
  if (selectedMonth == null || !unique.includes(selectedMonth)) return unique;
  return [selectedMonth, ...unique.filter((month) => month !== selectedMonth)];
}
