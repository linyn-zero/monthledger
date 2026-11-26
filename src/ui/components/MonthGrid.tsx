import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MonthSnapshot } from "../../domain/formulas";
import { displayCents } from "../../domain/formulas";
import { formatYuanFromCents } from "../../domain/money";
import type { YearMonth } from "../../domain/types";

export type MonthGridProps = {
  months: MonthSnapshot[];
  selectedMonth: YearMonth | null;
  onSelect: (month: YearMonth) => void;
};

const ROW_LABELS = ["月初", "收入", "开销", "月底", "月内最低", "负债", "应收"] as const;
const STRONG_ROWS = new Set<(typeof ROW_LABELS)[number]>(["月初", "月底", "负债", "应收"]);
const YEAR_BREAK_ROWSPAN = 1 + ROW_LABELS.length;

const TROUGH_HINT =
  "从月初余额起，按到账/付款日期把本月各笔收入加上、开销和还款减去，取过程中的最低余额。未填日期时：待发收入按月末计，待付开销和还款按月初计；已确认未填日期的按月初计。同一天先记账出再记账入。";

type MonthColumn = {
  type: "month";
  snap: MonthSnapshot;
  index: number;
};

type YearBreakColumn = {
  type: "year-break";
  year: number;
};

export type GridColumn = MonthColumn | YearBreakColumn;

export type ColumnSizes = {
  label: number;
  month: number;
  yearBreak: number;
};

export function yearOf(month: YearMonth): number {
  return Number(month.slice(0, 4));
}

export function formatMonthStamp(month: YearMonth): string {
  const m = Number(month.slice(5, 7));
  return `${m}月`;
}

export function formatMonthAria(month: YearMonth): string {
  const [y, m] = month.split("-");
  return `${y}年${Number(m)}月`;
}

export type AxisColumn =
  | { type: "month"; month: YearMonth }
  | { type: "year-break"; year: number };

export type CoverRun =
  | { type: "year-break"; year: number }
  | { type: "run"; months: YearMonth[]; on: boolean };

/** Consecutive covered/uncovered months, split at year-break columns. */
export function axisCoverRuns(
  cols: AxisColumn[],
  covered: (month: YearMonth) => boolean
): CoverRun[] {
  const out: CoverRun[] = [];
  let run: Extract<CoverRun, { type: "run" }> | null = null;
  function flush() {
    if (run) out.push(run);
    run = null;
  }
  for (const col of cols) {
    if (col.type === "year-break") {
      flush();
      out.push(col);
      continue;
    }
    const on = covered(col.month);
    if (!run || run.on !== on) {
      flush();
      run = { type: "run", months: [col.month], on };
    } else {
      run.months.push(col.month);
    }
  }
  flush();
  return out;
}

/** Months with a year-break between year changes. Shared by the board and entries year table. */
export function buildAxisColumns(months: YearMonth[]): AxisColumn[] {
  const columns: AxisColumn[] = [];
  for (let index = 0; index < months.length; index++) {
    const month = months[index];
    if (index > 0 && yearOf(month) !== yearOf(months[index - 1])) {
      columns.push({ type: "year-break", year: yearOf(month) });
    }
    columns.push({ type: "month", month });
  }
  return columns;
}

/** Build header columns: months with a year-break between year changes. */
export function buildGridColumns(months: MonthSnapshot[]): GridColumn[] {
  const columns: GridColumn[] = [];
  for (let index = 0; index < months.length; index++) {
    const snap = months[index];
    if (index > 0) {
      const prevYear = yearOf(months[index - 1].month);
      const nextYear = yearOf(snap.month);
      if (nextYear !== prevYear) {
        columns.push({ type: "year-break", year: nextYear });
      }
    }
    columns.push({ type: "month", snap, index });
  }
  return columns;
}

function toAxis(columns: GridColumn[] | AxisColumn[]): AxisColumn[] {
  return columns.map((col) => {
    if (col.type === "year-break") return col;
    if ("snap" in col) return { type: "month", month: col.snap.month };
    return col;
  });
}

/** Year of the first month column not fully hidden under the sticky label. */
export function visibleCornerYear(
  columns: GridColumn[] | AxisColumn[],
  scrollLeft: number,
  sizes: ColumnSizes
): number | null {
  let x = sizes.label;
  const threshold = scrollLeft + sizes.label;
  let fallback: number | null = null;
  for (const col of toAxis(columns)) {
    if (col.type === "year-break") {
      x += sizes.yearBreak;
      continue;
    }
    fallback ??= yearOf(col.month);
    x += sizes.month;
    if (x > threshold) return yearOf(col.month);
  }
  return fallback;
}

export function useCornerYear(columns: AxisColumn[]) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const first = columns.find((col) => col.type === "month");
  const [cornerYear, setCornerYear] = useState(() =>
    first && first.type === "month" ? String(yearOf(first.month)) : ""
  );

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    function syncCornerYear() {
      if (!wrap) return;
      const label = wrap.querySelector(".month-grid__corner");
      const stamp = wrap.querySelector(".month-grid__stamp");
      const yearBreak = wrap.querySelector(".month-grid__year-break");
      const year = visibleCornerYear(columns, wrap.scrollLeft, {
        label: label?.getBoundingClientRect().width ?? 0,
        month: stamp?.getBoundingClientRect().width ?? 0,
        yearBreak: yearBreak?.getBoundingClientRect().width ?? 0
      });
      if (year != null) setCornerYear(String(year));
    }

    syncCornerYear();
    wrap.addEventListener("scroll", syncCornerYear, { passive: true });
    const observer = new ResizeObserver(syncCornerYear);
    observer.observe(wrap);
    return () => {
      wrap.removeEventListener("scroll", syncCornerYear);
      observer.disconnect();
    };
  }, [columns]);

  return { wrapRef, cornerYear };
}

export function YearBreakCell({
  year,
  rowSpan
}: {
  year: number;
  rowSpan: number;
}) {
  const digits = String(year).split("");
  return (
    <th
      className="month-grid__year-break month-grid__year-num"
      scope="col"
      rowSpan={rowSpan}
      data-testid={`year-break-${year}`}
      aria-label={`${year}年`}
    >
      {digits.map((digit, i) => (
        <span key={`${year}-${i}`} className="month-grid__year-digit">
          {digit}
        </span>
      ))}
    </th>
  );
}

function sumIncomeCents(snap: MonthSnapshot): number {
  return snap.items
    .filter((item) => item.kind === "income")
    .reduce((sum, item) => sum + displayCents(item), 0);
}

function sumOutflowCents(snap: MonthSnapshot): number {
  return snap.items
    .filter((item) => item.kind === "expense" || item.kind === "debt_repay")
    .reduce((sum, item) => sum + displayCents(item), 0);
}

function isDebtClearedMonth(
  snap: MonthSnapshot,
  index: number,
  months: MonthSnapshot[]
): boolean {
  if (snap.debtCents !== 0) return false;
  if (index === 0) return false;
  return months[index - 1].debtCents > 0;
}

function cellValue(snap: MonthSnapshot, row: (typeof ROW_LABELS)[number]): number {
  switch (row) {
    case "月初":
      return snap.openingCents;
    case "收入":
      return sumIncomeCents(snap);
    case "开销":
      return sumOutflowCents(snap);
    case "月底":
      return snap.closingCents;
    case "月内最低":
      return snap.troughCents;
    case "负债":
      return snap.debtCents;
    case "应收":
      return snap.receivableCents;
  }
}

function cellTestId(row: (typeof ROW_LABELS)[number], month: YearMonth): string {
  const keys: Record<(typeof ROW_LABELS)[number], string> = {
    月初: "opening",
    收入: "income",
    开销: "expense",
    月底: "closing",
    月内最低: "trough",
    负债: "debt",
    应收: "receivable"
  };
  return `${keys[row]}-${month}`;
}

function TroughInfo() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  function place(el: HTMLElement) {
    const box = el.getBoundingClientRect();
    setPos({ x: box.right + 8, y: box.top + box.height / 2 });
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        className="month-grid__info"
        aria-label="月内最低说明"
        aria-expanded={open}
        onMouseEnter={(e) => place(e.currentTarget)}
        onMouseLeave={() => setOpen(false)}
        onFocus={(e) => place(e.currentTarget)}
        onBlur={() => setOpen(false)}
        onClick={(e) => e.stopPropagation()}
      >
        i
      </button>
      {open
        ? createPortal(
            <div
              role="tooltip"
              className="month-grid__tooltip"
              style={{ left: pos.x, top: pos.y }}
            >
              {TROUGH_HINT}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export function MonthGrid({ months, selectedMonth, onSelect }: MonthGridProps) {
  const columns = useMemo(() => buildGridColumns(months), [months]);
  const axis = useMemo(
    () =>
      columns.map((col) =>
        col.type === "year-break"
          ? col
          : { type: "month" as const, month: col.snap.month }
      ),
    [columns]
  );
  const { wrapRef, cornerYear } = useCornerYear(axis);

  return (
    <div className="month-grid-wrap" ref={wrapRef}>
      <table className="month-grid">
        <colgroup>
          <col className="month-grid__col-label" />
          {columns.map((col) =>
            col.type === "year-break" ? (
              <col
                key={`year-col-${col.year}`}
                className="month-grid__col-year-break"
              />
            ) : (
              <col key={`month-col-${col.snap.month}`} className="month-grid__col-month" />
            )
          )}
        </colgroup>
        <tbody>
          <tr>
            <th
              className="month-grid__corner month-grid__year-num"
              scope="col"
              data-testid="month-grid-corner"
            >
              {cornerYear}
            </th>
            {columns.map((col) => {
              if (col.type === "year-break") {
                return (
                  <YearBreakCell
                    key={`year-${col.year}`}
                    year={col.year}
                    rowSpan={YEAR_BREAK_ROWSPAN}
                  />
                );
              }
              const { snap, index } = col;
              const warn =
                snap.troughCents < 0 || isDebtClearedMonth(snap, index, months);
              const selected = snap.month === selectedMonth;
              return (
                <th
                  key={snap.month}
                  scope="col"
                  role="columnheader"
                  aria-label={formatMonthAria(snap.month)}
                  className={[
                    "month-grid__stamp",
                    selected ? "is-selected" : "",
                    warn ? "is-warn" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => onSelect(snap.month)}
                >
                  {formatMonthStamp(snap.month)}
                </th>
              );
            })}
          </tr>
          {ROW_LABELS.map((row) => {
            const strong = STRONG_ROWS.has(row);
            const sectionRule = row === "月底";
            return (
              <tr key={row}>
                <th
                  scope="row"
                  className={[
                    "month-grid__row-label",
                    strong ? "is-strong" : "",
                    sectionRule ? "has-section-rule" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {row}
                  {row === "月内最低" ? <TroughInfo /> : null}
                </th>
                {columns.map((col) => {
                  if (col.type === "year-break") return null;
                  const { snap, index } = col;
                  const warn =
                    snap.troughCents < 0 || isDebtClearedMonth(snap, index, months);
                  const selected = snap.month === selectedMonth;
                  const value = cellValue(snap, row);
                  const warnCell =
                    (row === "月内最低" && snap.troughCents < 0) ||
                    (row === "负债" && isDebtClearedMonth(snap, index, months));
                  return (
                    <td
                      key={`${row}-${snap.month}`}
                      data-testid={cellTestId(row, snap.month)}
                      className={[
                        "month-grid__cell",
                        selected ? "is-selected" : "",
                        warn ? "is-warn-col" : "",
                        warnCell ? "is-warn" : "",
                        strong ? "is-strong" : "",
                        sectionRule ? "has-section-rule" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => onSelect(snap.month)}
                    >
                      {formatYuanFromCents(value)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
