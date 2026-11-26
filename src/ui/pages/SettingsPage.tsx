import { useEffect, useRef, useState } from "react";
import {
  compareYearMonth,
  holdMonthOptions,
  shanghaiCalendarDate
} from "../../domain/calendar";
import { formatYuanFromCents, yuanToCents } from "../../domain/money";
import type { HoldItem, LedgerMeta, YearMonth } from "../../domain/types";
import { HoldBar } from "../components/HoldBar";

export type SettingsPageProps = {
  onBack: () => void;
  onOpenEntries?: () => void;
  todayMonth?: YearMonth;
  reloadNonce?: number;
  onLedgerMutated?: () => void;
};

function currentYearMonth(): YearMonth {
  return shanghaiCalendarDate().slice(0, 7);
}

function parseYuan(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const yuan = Number(cleaned);
  if (!Number.isFinite(yuan)) return null;
  return yuanToCents(yuan);
}

export function SettingsPage({
  onBack,
  onOpenEntries,
  todayMonth,
  reloadNonce,
  onLedgerMutated
}: SettingsPageProps) {
  const [dbPath, setDbPath] = useState("");
  const [openingCents, setOpeningCents] = useState<number | null>(null);
  const [openingYuan, setOpeningYuan] = useState("");
  const [holds, setHolds] = useState<HoldItem[]>([]);
  const [holdMonths, setHoldMonths] = useState<YearMonth[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const skipOpeningBlurRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const today = todayMonth ?? currentYearMonth();
        const [meta, path]: [LedgerMeta, string] = await Promise.all([
          window.ledgerApi.getMeta(),
          window.ledgerApi.dbPath()
        ]);
        const count = Math.max(1, compareYearMonth(today, meta.startMonth) + 1);
        const overview = await window.ledgerApi.getOverview(meta.startMonth, count);
        if (cancelled) return;
        setOpeningCents(meta.openingCashCents);
        setOpeningYuan(formatYuanFromCents(meta.openingCashCents));
        setDbPath(path);
        setHolds(overview.holds);
        setHoldMonths(holdMonthOptions(meta.startMonth, today, today));
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
  }, [reloadToken, reloadNonce, todayMonth]);

  async function saveOpening() {
    const cents = parseYuan(openingYuan);
    if (cents == null) {
      setError("起始现金须为数字");
      return;
    }
    if (openingCents != null && cents === openingCents) {
      setOpeningYuan(formatYuanFromCents(cents));
      setError(null);
      return;
    }
    try {
      await window.ledgerApi.saveOpeningCash(cents);
      setOpeningCents(cents);
      setOpeningYuan(formatYuanFromCents(cents));
      setError(null);
      onLedgerMutated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function exportCsv() {
    try {
      const result = await window.ledgerApi.exportCsvToDir();
      if (result.cancelled) return;
      if (!result.ok) {
        setError("导出失败");
        return;
      }
      setError(null);
      setNotice(result.dir ? `已导出到 ${result.dir}` : "已导出");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="settings-page">
      <header className="settings-page__top">
        <div className="settings-page__brand-row">
          <h1 className="settings-page__brand">设置</h1>
          <button type="button" className="nav-link" onClick={onBack}>
            台账
          </button>
          {onOpenEntries ? (
            <button type="button" className="nav-link" onClick={onOpenEntries}>
              条目
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p className="settings-page__error">{error}</p> : null}
      {notice ? <p className="settings-page__notice">{notice}</p> : null}

      <div className="settings-page__columns">
        <div className="settings-page__col settings-page__col--primary">
          <section className="settings-page__panel settings-page__holds">
            <HoldBar
              holds={holds}
              months={holdMonths}
              onMergeHold={(holdId, month) => {
                void window.ledgerApi
                  .mergeHold(holdId, month)
                  .then(() => {
                    setError(null);
                    setReloadToken((n) => n + 1);
                    onLedgerMutated?.();
                  })
                  .catch((err) => {
                    setError(err instanceof Error ? err.message : String(err));
                  });
              }}
            />
          </section>

          <form
            className="settings-page__form"
            onSubmit={(e) => {
              e.preventDefault();
              const field = e.currentTarget.querySelector("input");
              if (field instanceof HTMLInputElement && document.activeElement === field) {
                field.blur();
              }
            }}
          >
            <h2 className="settings-page__heading">起始现金</h2>
            <label>
              起始现金
              <input
                value={openingYuan}
                onChange={(e) => setOpeningYuan(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={() => {
                  if (skipOpeningBlurRef.current) {
                    skipOpeningBlurRef.current = false;
                    return;
                  }
                  void saveOpening();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    skipOpeningBlurRef.current = true;
                    if (openingCents != null) {
                      setOpeningYuan(formatYuanFromCents(openingCents));
                    }
                    setError(null);
                    e.currentTarget.blur();
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                inputMode="decimal"
              />
            </label>
          </form>
        </div>

        <div className="settings-page__col settings-page__col--secondary">
          <section className="settings-page__panel">
            <p className="settings-page__hint">
              回撤固定保留最近 10 次修改，请用台账页工具栏按钮。
            </p>
          </section>

          <section className="settings-page__panel">
            <h2 className="settings-page__heading">数据文件</h2>
            <p className="settings-page__path">{dbPath}</p>
            <button
              type="button"
              className="settings-page__export"
              onClick={() => void exportCsv()}
            >
              导出 CSV
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
