import { useEffect, useState } from "react";
import {
  addMonths,
  compareYearMonth,
  shanghaiYearMonth
} from "../../domain/calendar";
import type { MonthSnapshot } from "../../domain/formulas";
import type { LineItem, RecurringRule, YearMonth, CreditMarker } from "../../domain/types";
import { MonthField } from "../components/MonthCal";
import { MonthGrid } from "../components/MonthGrid";
import { MonthPanel } from "../components/MonthPanel";

export type BoardPageProps = {
  /** Injectable for tests; defaults to the real calendar month. */
  todayMonth?: YearMonth;
  onOpenEntries?: () => void;
  onOpenSettings?: () => void;
  onSelectedMonthChange?: (month: YearMonth) => void;
  onWindowChange?: (from: YearMonth, count: number) => void;
  reloadNonce?: number;
  onLedgerMutated?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
};

function currentYearMonth(): YearMonth {
  return shanghaiYearMonth();
}

/** 12-column window start: today−5, never before ledger startMonth. */
export function resolveBoardFromMonth(
  todayMonth: YearMonth,
  startMonth: YearMonth
): YearMonth {
  const centered = addMonths(todayMonth, -5);
  return compareYearMonth(centered, startMonth) < 0 ? startMonth : centered;
}

export function BoardPage({
  todayMonth,
  onOpenEntries,
  onOpenSettings,
  onSelectedMonthChange,
  onWindowChange,
  reloadNonce,
  onLedgerMutated,
  onUndo,
  onRedo
}: BoardPageProps) {
  const [months, setMonths] = useState<MonthSnapshot[]>([]);
  const [ledgerItems, setLedgerItems] = useState<LineItem[]>([]);
  const [markers, setMarkers] = useState<CreditMarker[]>([]);
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<YearMonth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [windowFrom, setWindowFrom] = useState<YearMonth | null>(null);
  const [monthCount, setMonthCount] = useState(12);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const today = todayMonth ?? currentYearMonth();
        const nextMeta = await window.ledgerApi.getMeta();
        const from =
          windowFrom ?? resolveBoardFromMonth(today, nextMeta.startMonth);
        const data = await window.ledgerApi.getOverview(from, monthCount);
        const [allItems, creditRows, ruleRows] = await Promise.all([
          typeof window.ledgerApi.listItems === "function"
            ? window.ledgerApi.listItems()
            : Promise.resolve([] as LineItem[]),
          typeof window.ledgerApi.listCredits === "function"
            ? window.ledgerApi.listCredits()
            : Promise.resolve([] as CreditMarker[]),
          typeof window.ledgerApi.listRules === "function"
            ? window.ledgerApi.listRules()
            : Promise.resolve([] as RecurringRule[])
        ]);
        if (cancelled) return;
        setMonths(data.months);
        setLedgerItems(allItems);
        setMarkers(creditRows);
        setRules(ruleRows);
        setWindowFrom((prev) => prev ?? from);
        setSelectedMonth((prev) => {
          if (prev && data.months.some((m) => m.month === prev)) return prev;
          const hit = data.months.find((m) => m.month === today);
          return hit?.month ?? data.months[0]?.month ?? null;
        });
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [todayMonth, reloadToken, windowFrom, monthCount, reloadNonce]);

  useEffect(() => {
    if (selectedMonth) onSelectedMonthChange?.(selectedMonth);
  }, [selectedMonth, onSelectedMonthChange]);

  useEffect(() => {
    if (windowFrom) onWindowChange?.(windowFrom, monthCount);
  }, [windowFrom, monthCount, onWindowChange]);

  useEffect(() => {
    const unsub = window.ledgerApi.onFocusMonth?.((month) => {
      setSelectedMonth(month);
    });
    return () => {
      unsub?.();
    };
  }, []);

  const selected = months.find((m) => m.month === selectedMonth) ?? null;
  const today = todayMonth ?? currentYearMonth();
  const windowEnd =
    windowFrom != null
      ? addMonths(windowFrom, monthCount - 1)
      : (months[months.length - 1]?.month ?? today);

  function setRange(start: YearMonth, end: YearMonth | null) {
    const to = end ?? start;
    const lo = compareYearMonth(start, to) <= 0 ? start : to;
    const hi = compareYearMonth(start, to) <= 0 ? to : start;
    setWindowFrom(lo);
    setMonthCount(Math.max(1, compareYearMonth(hi, lo) + 1));
  }

  return (
    <div className="board-page">
      <header className="board-page__top">
        <div className="board-page__brand-row">
          <h1 className="board-page__brand">收支台账</h1>
          {onOpenEntries ? (
            <button type="button" className="nav-link" onClick={onOpenEntries}>
              条目
            </button>
          ) : null}
        </div>
        <nav className="board-page__nav">
          {onUndo ? (
            <button type="button" className="nav-link" onClick={onUndo}>
              回撤
            </button>
          ) : null}
          {onRedo ? (
            <button type="button" className="nav-link" onClick={onRedo}>
              反回撤
            </button>
          ) : null}
          {onOpenSettings ? (
            <button type="button" className="nav-link" onClick={onOpenSettings}>
              设置
            </button>
          ) : null}
        </nav>
      </header>
      {error ? <p className="board-page__error">{error}</p> : null}
      <div className="ledger-toolbar">
        {windowFrom ? (
          <MonthField
            name="台账月份范围"
            value={windowFrom}
            rangeTo={windowEnd}
            mode="range"
            onChange={setRange}
          />
        ) : null}
      </div>
      <div className="board-page__body">
        <div className="board-page__grid">
          <MonthGrid
            months={months}
            selectedMonth={selectedMonth}
            onSelect={setSelectedMonth}
          />
        </div>
        <MonthPanel
          month={selectedMonth}
          items={selected?.items ?? []}
          ledgerItems={ledgerItems}
          markers={markers}
          rules={rules}
          onLedgerChange={() => {
            setReloadToken((n) => n + 1);
            onLedgerMutated?.();
          }}
        />
      </div>
    </div>
  );
}
