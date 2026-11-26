import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { compareYearMonth } from "../../domain/calendar";
import type { YearMonth } from "../../domain/types";
import { CalendarGlyph } from "./DateField";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function formatYearMonthLabel(month: YearMonth | null | undefined): string {
  if (!month) return "";
  const [y, m] = month.split("-");
  return `${y}年${Number(m)}月`;
}

export function formatMonthRangeLabel(from: YearMonth, to: YearMonth | null): string {
  const start = formatYearMonthLabel(from);
  if (to == null) return `${start} – 一直`;
  return `${start} – ${formatYearMonthLabel(to)}`;
}

function parseYearMonth(raw: string): YearMonth | null {
  const cleaned = raw.trim().replace(/年/, "-").replace(/月/, "").replace(/\//g, "-");
  const match = /^(\d{4})-(\d{1,2})$/.exec(cleaned);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${String(month).padStart(2, "0")}`;
}

function monthOf(year: number, month: number): YearMonth {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function inSpan(
  month: YearMonth,
  from: YearMonth | null | undefined,
  to: YearMonth | null | undefined
): boolean {
  if (!from) return false;
  if (compareYearMonth(month, from) < 0) return false;
  if (to == null) return true;
  return compareYearMonth(month, to) <= 0;
}

export function MonthCal({
  label,
  mode,
  selectedFrom,
  selectedTo,
  anchor,
  onSelect,
  onDismiss
}: {
  label: string;
  mode: "single" | "range" | "open-end";
  selectedFrom?: YearMonth | null;
  selectedTo?: YearMonth | null;
  anchor: HTMLElement;
  onSelect: (from: YearMonth, to: YearMonth | null) => void;
  onDismiss: () => void;
}) {
  const startYear = Number((selectedFrom ?? selectedTo ?? "2026-01").slice(0, 4));
  const [leftYear, setLeftYear] = useState(startYear);
  const [pending, setPending] = useState<YearMonth | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const picker = pickerRef.current;
    if (!picker) return;
    const rect = anchor.getBoundingClientRect();
    const box = picker.getBoundingClientRect();
    const gap = 4;
    const top = rect.top - box.height - gap;
    let left = rect.left;
    if (left + box.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - box.width - 8);
    }
    if (left < 8) left = 8;
    setPos({ top: Math.max(8, top), left });
  }, [anchor, leftYear, pending]);

  useEffect(() => {
    function handlePointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (pickerRef.current?.contains(target)) return;
      if (anchor.contains(target)) return;
      onDismiss();
    }
    document.addEventListener("pointerdown", handlePointer, true);
    return () => document.removeEventListener("pointerdown", handlePointer, true);
  }, [anchor, onDismiss]);

  function pickMonth(month: YearMonth) {
    if (mode === "single") {
      onSelect(month, month);
      return;
    }
    if (pending == null) {
      setPending(month);
      return;
    }
    const from = compareYearMonth(pending, month) <= 0 ? pending : month;
    const to = compareYearMonth(pending, month) <= 0 ? month : pending;
    onSelect(from, to);
  }

  function pane(year: number) {
    return (
      <div className="month-cal__pane">
        <div className="month-cal__head">
          {year === leftYear ? (
            <button type="button" aria-label="上一年" onClick={() => setLeftYear((y) => y - 1)}>
              ‹
            </button>
          ) : (
            <span />
          )}
          <span>{year}</span>
          {year === leftYear + 1 ? (
            <button type="button" aria-label="下一年" onClick={() => setLeftYear((y) => y + 1)}>
              ›
            </button>
          ) : (
            <span />
          )}
        </div>
        <div className="month-cal__grid">
          {MONTHS.map((month) => {
            const value = monthOf(year, month);
            const highlightFrom = pending ?? selectedFrom;
            const highlightTo = pending != null ? pending : selectedTo;
            const on =
              pending != null
                ? value === pending
                : inSpan(value, highlightFrom, mode === "single" ? selectedFrom : highlightTo);
            return (
              <button
                key={value}
                type="button"
                className={on ? "is-selected" : undefined}
                aria-label={`${year}年${month}月`}
                onClick={() => pickMonth(value)}
              >
                {month}月
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return createPortal(
    <div
      ref={pickerRef}
      className="month-cal"
      role="dialog"
      aria-label={label}
      style={
        pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: "hidden" }
      }
      onClick={(e) => e.stopPropagation()}
    >
      {pane(leftYear)}
      {pane(leftYear + 1)}
      <p className="month-cal__hint">
        {mode === "single"
          ? "点一个月份。"
          : "先点起始月，再点结束月。起止都算进去。点同一个月两次即只看那一个月。"}
      </p>
      {mode === "open-end" ? (
        <p className="month-cal__hint">
          <button
            type="button"
            className="month-cal__always"
            onClick={() => {
              const from = pending ?? selectedFrom;
              if (from) onSelect(from, null);
            }}
          >
            一直
          </button>
          没有结束月则点「一直」。
        </p>
      ) : null}
    </div>,
    document.body
  );
}

export function MonthField({
  name,
  value,
  openEnd,
  rangeTo,
  mode,
  onChange
}: {
  name: string;
  value: YearMonth | null;
  openEnd?: boolean;
  rangeTo?: YearMonth | null;
  mode: "single" | "range" | "open-end";
  onChange: (from: YearMonth, to: YearMonth | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const boxedRef = useRef<HTMLInputElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);

  const shown =
    mode === "single"
      ? formatYearMonthLabel(value)
      : value
        ? formatMonthRangeLabel(value, openEnd ? null : (rangeTo ?? value))
        : "";

  useEffect(() => {
    if (!editing) return;
    boxedRef.current?.focus();
    boxedRef.current?.select();
  }, [editing]);

  function commit() {
    if (mode === "single") {
      const parsed = parseYearMonth(draft);
      if (parsed) onChange(parsed, parsed);
      setEditing(false);
      return;
    }
    const parts = draft.split(/[–~]|到/).map((part) => part.trim());
    const from = parseYearMonth(parts[0] ?? "");
    if (!from) {
      setEditing(false);
      return;
    }
    if (parts[1] === "一直" || parts[1] === "") {
      onChange(from, null);
    } else {
      const to = parseYearMonth(parts[1] ?? "");
      onChange(from, to ?? from);
    }
    setEditing(false);
  }

  return (
    <span className="month-field">
      {editing ? (
        <input
          ref={boxedRef}
          type="text"
          className="month-panel__date-text month-panel__date--boxed"
          aria-label={`修改${name}`}
          value={draft}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          onBlur={() => commit()}
        />
      ) : (
        <span
          className="month-panel__date-text"
          aria-label={name}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setDraft(
              mode === "single"
                ? value ?? ""
                : `${value ?? ""}${openEnd ? " – 一直" : ` – ${rangeTo ?? value ?? ""}`}`
            );
            setEditing(true);
          }}
        >
          {shown}
        </span>
      )}
      <button
        ref={iconRef}
        type="button"
        className="month-panel__date-icon"
        aria-label={`选择${name}`}
        onClick={(e) => {
          e.stopPropagation();
          setPickerOpen(true);
        }}
      >
        <CalendarGlyph />
      </button>
      {pickerOpen && iconRef.current ? (
        <MonthCal
          label={`选择${name}`}
          mode={mode}
          selectedFrom={value}
          selectedTo={openEnd ? null : rangeTo}
          anchor={iconRef.current}
          onSelect={(from, to) => {
            onChange(from, to);
            setPickerOpen(false);
          }}
          onDismiss={() => setPickerOpen(false)}
        />
      ) : null}
    </span>
  );
}
