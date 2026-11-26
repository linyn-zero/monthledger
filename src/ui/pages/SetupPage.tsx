import { useState } from "react";
import { yuanToCents } from "../../domain/money";
import type { YearMonth } from "../../domain/types";

export type SetupPageProps = {
  onComplete: () => void;
};

export function SetupPage({ onComplete }: SetupPageProps) {
  const [cashYuan, setCashYuan] = useState("");
  const [debtYuan, setDebtYuan] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const cashRaw = cashYuan.replace(/,/g, "").trim();
    const debtRaw = debtYuan.replace(/,/g, "").trim();
    if (cashRaw === "") {
      setError("当前现金不能为空");
      return;
    }
    if (debtRaw === "") {
      setError("当前负债不能为空");
      return;
    }
    const cash = Number(cashRaw);
    const debt = Number(debtRaw);
    if (!Number.isFinite(cash)) {
      setError("当前现金须为数字");
      return;
    }
    if (!Number.isFinite(debt) || debt < 0) {
      setError("当前负债须为非负数字");
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(startMonth)) {
      setError("起始月格式应为 YYYY-MM");
      return;
    }

    try {
      await window.ledgerApi.setup({
        startMonth: startMonth as YearMonth,
        openingCashCents: yuanToCents(cash),
        openingDebtCents: yuanToCents(debt),
        largeThresholdCents: 50000,
        notifyEnabled: true
      });
      setError(null);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="setup-page">
      <header className="setup-page__top">
        <h1 className="setup-page__brand">收支台账</h1>
        <p className="setup-page__lede">从这三个数开始第一张表</p>
      </header>
      {error ? <p className="setup-page__error">{error}</p> : null}
      <form
        className="setup-page__form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label>
          当前现金
          <input
            value={cashYuan}
            onChange={(e) => setCashYuan(e.target.value)}
            inputMode="decimal"
            placeholder="元"
          />
        </label>
        <label>
          当前负债
          <input
            value={debtYuan}
            onChange={(e) => setDebtYuan(e.target.value)}
            inputMode="decimal"
            placeholder="元"
          />
        </label>
        <label>
          起始月
          <input
            value={startMonth}
            onChange={(e) => setStartMonth(e.target.value)}
            placeholder="YYYY-MM"
          />
        </label>
        <button type="submit" className="setup-page__submit">
          进入台账
        </button>
      </form>
    </div>
  );
}
