import type { YearMonth } from "./types";

/** Positive if a is after b, zero if equal. */
export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return ay * 12 + am - (by * 12 + bm);
}

export function addMonths(month: YearMonth, delta: number): YearMonth {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const year = Math.floor(total / 12);
  const monthIndex = ((total % 12) + 12) % 12;
  const mm = String(monthIndex + 1).padStart(2, "0");
  return `${year}-${mm}`;
}

export function monthEndDate(month: YearMonth): string {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

export function horizonEndMonth(today: Date, monthsAhead: number): YearMonth {
  return addMonths(shanghaiYearMonth(today), monthsAhead);
}

/** Calendar date in Asia/Shanghai as `YYYY-MM-DD` (not UTC). */
export function shanghaiCalendarDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

/** Calendar month in Asia/Shanghai as `YYYY-MM`. */
export function shanghaiYearMonth(now: Date = new Date()): YearMonth {
  return shanghaiCalendarDate(now).slice(0, 7);
}

export function monthsInclusive(from: YearMonth, to: YearMonth): YearMonth[] {
  if (compareYearMonth(from, to) > 0) return [];
  const months: YearMonth[] = [];
  let month = from;
  while (compareYearMonth(month, to) <= 0) {
    months.push(month);
    month = addMonths(month, 1);
  }
  return months;
}

/** Hold-bar months: startMonth through max(today+12, window end). */
export function holdMonthOptions(
  startMonth: YearMonth,
  todayMonth: YearMonth,
  windowEndMonth: YearMonth
): YearMonth[] {
  const horizon = addMonths(todayMonth, 12);
  const end =
    compareYearMonth(windowEndMonth, horizon) > 0 ? windowEndMonth : horizon;
  return monthsInclusive(startMonth, end);
}
