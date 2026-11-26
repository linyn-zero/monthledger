import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addMonths, monthEndDate, shanghaiCalendarDate } from "../../domain/calendar";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export function formatSlashDate(iso: string | null): string {
  if (iso == null || iso === "") return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${y}/${m}/${d}`;
}

export function toIsoDate(raw: string): string | null {
  const cleaned = raw.trim().replace(/-/g, "/");
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(cleaned);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function monthGridDays(month: string): (string | null)[] {
  const [year, monthIndex] = month.split("-").map(Number);
  const first = new Date(year, monthIndex - 1, 1);
  const weekday = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const lastDay = Number(monthEndDate(month).slice(-2));
  const cells: (string | null)[] = Array.from({ length: weekday }, () => null);
  for (let day = 1; day <= lastDay; day++) {
    cells.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function CalendarGlyph() {
  return (
    <svg className="month-panel__date-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="12"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M1.5 6h13" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 1.5v2.5M11 1.5v2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function DatePicker({
  name,
  month,
  selectedDate,
  allowEveryday,
  anchor,
  onPick,
  onEveryday,
  onDismiss
}: {
  name: string;
  month: string;
  selectedDate: string | null;
  allowEveryday: boolean;
  anchor: HTMLElement;
  onPick: (iso: string | null) => void;
  onEveryday?: () => void;
  onDismiss: () => void;
}) {
  const today = shanghaiCalendarDate();
  const [viewMonth, setViewMonth] = useState(selectedDate?.slice(0, 7) ?? month);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const cells = monthGridDays(viewMonth);
  const [year, monthNum] = viewMonth.split("-");

  useLayoutEffect(() => {
    const picker = pickerRef.current;
    if (!picker) return;
    const rect = anchor.getBoundingClientRect();
    const box = picker.getBoundingClientRect();
    const gap = 4;
    const top = rect.top - box.height - gap;
    let left = rect.left + rect.width / 2 - box.width / 2;
    if (left < 8) left = 8;
    if (left + box.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - box.width - 8);
    }
    setPos({ top, left });
  }, [anchor, viewMonth]);

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

  return createPortal(
    <div
      ref={pickerRef}
      className="month-panel__picker"
      role="dialog"
      aria-label={`选择${name}日期`}
      style={
        pos
          ? { top: pos.top, left: pos.left }
          : { top: 0, left: 0, visibility: "hidden" }
      }
      onClick={(e) => e.stopPropagation()}
    >
      <header className="month-panel__picker-head">
        <button type="button" aria-label="上一年" onClick={() => setViewMonth(addMonths(viewMonth, -12))}>
          «
        </button>
        <button type="button" aria-label="上个月" onClick={() => setViewMonth(addMonths(viewMonth, -1))}>
          ‹
        </button>
        <span>{`${year}年${Number(monthNum)}月`}</span>
        <button type="button" aria-label="下个月" onClick={() => setViewMonth(addMonths(viewMonth, 1))}>
          ›
        </button>
        <button type="button" aria-label="下一年" onClick={() => setViewMonth(addMonths(viewMonth, 12))}>
          »
        </button>
      </header>
      <div className="month-panel__picker-week">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="month-panel__picker-grid">
        {cells.map((iso, index) =>
          iso == null ? (
            <span key={`empty-${index}`} />
          ) : (
            <button
              key={iso}
              type="button"
              className={
                iso === selectedDate ? "is-selected" : iso === today ? "is-today" : undefined
              }
              aria-label={iso}
              onClick={() => onPick(iso)}
            >
              {Number(iso.slice(-2))}
            </button>
          )
        )}
      </div>
      <footer className="month-panel__picker-foot">
        <button type="button" onClick={() => onPick(null)}>
          清除
        </button>
        {allowEveryday && onEveryday ? (
          <button type="button" className="month-panel__everyday" onClick={onEveryday}>
            everyday
          </button>
        ) : (
          <span />
        )}
        <button type="button" onClick={() => onPick(today)}>
          今天
        </button>
      </footer>
    </div>,
    document.body
  );
}

export function DateField({
  name,
  month,
  expectedDate,
  spreadOn,
  allowEveryday,
  editing,
  pickerOpen,
  onStartEdit,
  onCancelEdit,
  onOpenPicker,
  onClosePicker,
  onChange,
  onEveryday
}: {
  name: string;
  month: string;
  expectedDate: string | null;
  spreadOn: boolean;
  allowEveryday: boolean;
  editing: boolean;
  pickerOpen: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onChange: (raw: string) => void;
  onEveryday?: () => void;
}) {
  const boxedRef = useRef<HTMLInputElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const [value, setValue] = useState(() => formatSlashDate(expectedDate));
  const busyRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!editing) {
      setValue(formatSlashDate(expectedDate));
      busyRef.current = false;
      cancelledRef.current = false;
      return;
    }
    boxedRef.current?.focus();
    boxedRef.current?.select();
  }, [editing, expectedDate]);

  function commit() {
    if (busyRef.current || cancelledRef.current) return;
    const trimmed = value.trim();
    if (trimmed === "") {
      busyRef.current = true;
      onChange("");
      return;
    }
    const iso = toIsoDate(trimmed);
    if (iso == null) {
      cancelledRef.current = true;
      onCancelEdit();
      return;
    }
    if (iso === expectedDate) {
      cancelledRef.current = true;
      onCancelEdit();
      return;
    }
    busyRef.current = true;
    onChange(iso);
  }

  function cancel() {
    cancelledRef.current = true;
    onCancelEdit();
  }

  return (
    <span className="month-panel__date">
      {spreadOn ? (
        <span className="month-panel__everyday" aria-label={`${name}日期`}>
          everyday
        </span>
      ) : editing ? (
        <input
          ref={boxedRef}
          type="text"
          inputMode="numeric"
          className="month-panel__date-text month-panel__date--boxed"
          aria-label={`修改${name}日期`}
          value={value}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          onBlur={() => commit()}
        />
      ) : (
        <span
          className="month-panel__date-text"
          aria-label={`${name}日期`}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onStartEdit();
          }}
        >
          {formatSlashDate(expectedDate)}
        </span>
      )}
      <button
        ref={iconRef}
        type="button"
        className="month-panel__date-icon"
        aria-label={`选择${name}日期`}
        onClick={(e) => {
          e.stopPropagation();
          onOpenPicker();
        }}
      >
        <CalendarGlyph />
      </button>
      {pickerOpen && iconRef.current ? (
        <DatePicker
          name={name}
          month={month}
          selectedDate={spreadOn ? null : expectedDate}
          allowEveryday={allowEveryday}
          anchor={iconRef.current}
          onPick={(iso) => onChange(iso ?? "")}
          onEveryday={onEveryday}
          onDismiss={onClosePicker}
        />
      ) : null}
    </span>
  );
}
