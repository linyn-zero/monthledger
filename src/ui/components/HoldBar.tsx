import { useState } from "react";
import { formatYuanFromCents } from "../../domain/money";
import type { HoldItem, YearMonth } from "../../domain/types";

export type HoldBarProps = {
  holds: HoldItem[];
  months: YearMonth[];
  onMergeHold: (holdId: string, month: YearMonth) => void;
};

function formatMonthLabel(month: YearMonth): string {
  const [y, m] = month.split("-");
  return `${y}年${Number(m)}月`;
}

export function HoldBar({ holds, months, onMergeHold }: HoldBarProps) {
  const open = holds.filter((h) => h.mergedIntoMonth == null);
  const [chosen, setChosen] = useState<Record<string, string>>({});

  return (
    <div className="hold-bar">
      <span className="hold-bar__label">挂账</span>
      <ul className="hold-bar__list">
        {open.map((hold) => (
          <li key={hold.id} className="hold-bar__item">
            <span className="hold-bar__name">{hold.name}</span>
            <span className="hold-bar__amount">
              {formatYuanFromCents(hold.amountCents)}
            </span>
            {hold.note ? (
              <span className="hold-bar__note">（{hold.note}）</span>
            ) : null}
            <label className="hold-bar__month">
              指定月份
              <select
                value={chosen[hold.id] ?? ""}
                onChange={(e) =>
                  setChosen((prev) => ({ ...prev, [hold.id]: e.target.value }))
                }
              >
                <option value="" disabled>
                  选择月份
                </option>
                {months.map((month) => (
                  <option key={month} value={month}>
                    {formatMonthLabel(month)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="hold-bar__confirm"
              onClick={() => {
                const month = chosen[hold.id];
                if (month) onMergeHold(hold.id, month);
              }}
            >
              确定
            </button>
          </li>
        ))}
        {open.length === 0 ? (
          <li className="hold-bar__empty">无挂账</li>
        ) : null}
      </ul>
    </div>
  );
}
