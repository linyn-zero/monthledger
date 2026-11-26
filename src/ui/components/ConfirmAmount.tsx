import { useEffect, useRef, useState } from "react";
import { formatYuanFromCents, yuanToCents } from "../../domain/money";

export type ConfirmAmountProps = {
  plannedCents: number;
  onConfirm: (actualCents: number) => void;
  onCancel: () => void;
};

function parseYuanInput(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const yuan = Number(cleaned);
  if (Number.isNaN(yuan)) return null;
  return yuanToCents(yuan);
}

export function ConfirmAmount({
  plannedCents,
  onConfirm,
  onCancel
}: ConfirmAmountProps) {
  const [value, setValue] = useState(() => formatYuanFromCents(plannedCents));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  function submit() {
    const cents = parseYuanInput(value);
    if (cents == null) return;
    onConfirm(cents);
  }

  return (
    <span className="confirm-amount">
      <input
        ref={inputRef}
        className="confirm-amount__input"
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        aria-label="确认金额"
      />
      <button
        type="button"
        className="confirm-amount__button"
        onClick={submit}
      >
        确认
      </button>
    </span>
  );
}
