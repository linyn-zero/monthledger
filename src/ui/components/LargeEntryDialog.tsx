import { useState } from "react";
import type { LargeEntryInput } from "../../domain/commands";
import { yuanToCents } from "../../domain/money";
import type { Kind, YearMonth } from "../../domain/types";

export type LargeEntryMatchingPending = {
  id: string;
  name: string;
};

export type LargeEntryDialogProps = {
  thresholdCents: number;
  defaultMonth: YearMonth;
  matchingPending?: LargeEntryMatchingPending | null;
  onSubmit: (input: Omit<LargeEntryInput, "id">) => void;
  onConfirmExisting?: () => void;
  onForceNew?: () => void;
  onClose: () => void;
};

function parseYuan(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const yuan = Number(cleaned);
  if (!Number.isFinite(yuan)) return null;
  return yuanToCents(yuan);
}

export function LargeEntryDialog({
  thresholdCents,
  defaultMonth,
  matchingPending,
  onSubmit,
  onConfirmExisting,
  onForceNew,
  onClose
}: LargeEntryDialogProps) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("expense");
  const [amountYuan, setAmountYuan] = useState("");
  const [month, setMonth] = useState(defaultMonth);
  const [expectedDate, setExpectedDate] = useState("");
  const [settled, setSettled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const amountCents = parseYuan(amountYuan);
    if (amountCents == null || amountCents < thresholdCents) {
      setError(`大额须 ≥ ${thresholdCents / 100} 元`);
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setError("名称不能为空");
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      setError("归属月格式应为 YYYY-MM");
      return;
    }
    if (expectedDate && !/^\d{4}-\d{2}-\d{2}$/.test(expectedDate)) {
      setError("预计日期格式应为 YYYY-MM-DD");
      return;
    }
    setError(null);
    onSubmit({
      name: trimmed,
      kind,
      amountCents,
      month,
      expectedDate: expectedDate.trim() ? expectedDate.trim() : null,
      settled
    });
  }

  if (matchingPending) {
    return (
      <div className="large-entry-dialog" role="dialog" aria-modal="true">
        <h2 className="large-entry-dialog__title">记大额</h2>
        <p className="large-entry-dialog__hint">
          这是在确认已有计划，还是新增一行？
        </p>
        <div className="large-entry-dialog__actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="button" onClick={onForceNew}>
            仍要新增
          </button>
          <button
            type="button"
            className="large-entry-dialog__primary"
            onClick={onConfirmExisting}
          >
            确认已有计划
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="large-entry-dialog" role="dialog" aria-modal="true">
      <h2 className="large-entry-dialog__title">记大额</h2>
      <form
        className="large-entry-dialog__form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label>
          名称
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          收入或开销
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
          >
            <option value="income">收入</option>
            <option value="expense">开销</option>
          </select>
        </label>
        <label>
          金额
          <input
            value={amountYuan}
            onChange={(e) => setAmountYuan(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <label>
          归属月
          <input
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            placeholder="YYYY-MM"
          />
        </label>
        <label>
          预计日期
          <input
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
            placeholder="可空"
          />
        </label>
        <label className="large-entry-dialog__check">
          <input
            type="checkbox"
            checked={settled}
            onChange={(e) => setSettled(e.target.checked)}
          />
          已到账/已付
        </label>
        {error ? <p className="large-entry-dialog__error">{error}</p> : null}
        <div className="large-entry-dialog__actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="large-entry-dialog__primary">
            保存
          </button>
        </div>
      </form>
    </div>
  );
}
