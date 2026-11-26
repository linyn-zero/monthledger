import { useMemo, useState } from "react";
import { compareYearMonth } from "../../domain/calendar";
import { formatYuanFromCents } from "../../domain/money";

export type DeleteRuleMonthRow = {
  month: string;
  confirmed: boolean;
  amountCents: number;
};

export type DeleteRuleDialogProps = {
  ruleName: string;
  months: DeleteRuleMonthRow[];
  onCancel: () => void;
  onConfirm: (keepMonths: string[]) => void;
};

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y}年${Number(m)}月`;
}

function initialKept(months: DeleteRuleMonthRow[]): Set<string> {
  // Pending months default all-checked; confirmed always kept.
  return new Set(months.map((row) => row.month));
}

export function DeleteRuleDialog({
  ruleName,
  months,
  onCancel,
  onConfirm
}: DeleteRuleDialogProps) {
  const sorted = useMemo(
    () => [...months].sort((a, b) => compareYearMonth(a.month, b.month)),
    [months]
  );
  const [kept, setKept] = useState(() => initialKept(months));
  const [rangeFrom, setRangeFrom] = useState(sorted[0]?.month ?? "");
  const [rangeTo, setRangeTo] = useState(sorted[sorted.length - 1]?.month ?? "");

  const pending = sorted.filter((row) => !row.confirmed);
  const dropCount = pending.filter((row) => !kept.has(row.month)).length;

  function setPendingAll(selected: boolean) {
    setKept((prev) => {
      const next = new Set(prev);
      for (const row of pending) {
        if (selected) next.add(row.month);
        else next.delete(row.month);
      }
      for (const row of sorted) {
        if (row.confirmed) next.add(row.month);
      }
      return next;
    });
  }

  function applyRange() {
    if (!rangeFrom || !rangeTo) return;
    const lo = compareYearMonth(rangeFrom, rangeTo) <= 0 ? rangeFrom : rangeTo;
    const hi = compareYearMonth(rangeFrom, rangeTo) <= 0 ? rangeTo : rangeFrom;
    setKept((prev) => {
      const next = new Set(prev);
      for (const row of pending) {
        const inRange =
          compareYearMonth(row.month, lo) >= 0 &&
          compareYearMonth(row.month, hi) <= 0;
        if (inRange) next.add(row.month);
        else next.delete(row.month);
      }
      for (const row of sorted) {
        if (row.confirmed) next.add(row.month);
      }
      return next;
    });
  }

  function togglePending(month: string) {
    setKept((prev) => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  }

  function confirm() {
    const keepMonths = sorted
      .filter((row) => !row.confirmed && kept.has(row.month))
      .map((row) => row.month);
    onConfirm(keepMonths);
  }

  return (
    <div className="delete-rule-dialog" role="dialog" aria-modal="true">
      <h2 className="delete-rule-dialog__title">删除规则：{ruleName}</h2>
      <p className="delete-rule-dialog__hint">
        勾选要保留的月份；未勾选的待处理月份将被删除。已确认月份一律保留。
      </p>

      <div className="delete-rule-dialog__toolbar">
        <button type="button" onClick={() => setPendingAll(true)}>
          待处理全选
        </button>
        <button type="button" onClick={() => setPendingAll(false)}>
          待处理全不选
        </button>
        <label>
          从
          <select
            aria-label="保留起始月"
            value={rangeFrom}
            onChange={(e) => setRangeFrom(e.target.value)}
          >
            {sorted.map((row) => (
              <option key={`from-${row.month}`} value={row.month}>
                {formatMonthLabel(row.month)}
              </option>
            ))}
          </select>
          到
          <select
            aria-label="保留结束月"
            value={rangeTo}
            onChange={(e) => setRangeTo(e.target.value)}
          >
            {sorted.map((row) => (
              <option key={`to-${row.month}`} value={row.month}>
                {formatMonthLabel(row.month)}
              </option>
            ))}
          </select>
          <button type="button" onClick={applyRange}>
            套用
          </button>
        </label>
      </div>

      <ul className="delete-rule-dialog__list">
        {sorted.map((row) => {
          const label = formatMonthLabel(row.month);
          const checked = kept.has(row.month);
          return (
            <li key={row.month} className="delete-rule-dialog__row">
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={row.confirmed}
                  onChange={() => {
                    if (!row.confirmed) togglePending(row.month);
                  }}
                  aria-label={label}
                />
                <span>{label}</span>
                <span className="delete-rule-dialog__amount">
                  {formatYuanFromCents(row.amountCents)}
                </span>
                {row.confirmed ? (
                  <span className="delete-rule-dialog__locked">已确认，必留</span>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>

      <p className="delete-rule-dialog__summary">
        将删除 {dropCount} 个月的待发行
      </p>

      <div className="delete-rule-dialog__actions">
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button type="button" className="delete-rule-dialog__danger" onClick={confirm}>
          确认删除
        </button>
      </div>
    </div>
  );
}
