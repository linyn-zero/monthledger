import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode
} from "react";
import {
  addMonths,
  compareYearMonth,
  monthsInclusive,
  shanghaiYearMonth
} from "../../domain/calendar";
import { expectedDateForSchedule } from "../../domain/commands";
import {
  creditDirectionOf,
  creditLineKind,
  creditRemainingCents
} from "../../domain/credit";
import { creditUi } from "../creditCopy";
import {
  cashflowsInRange,
  creditsInRange,
  onceInRange
} from "../../domain/entriesRange";
import { displayCents } from "../../domain/formulas";
import { formatYuanFromCents, yuanToCents } from "../../domain/money";
import type {
  CreditDirection,
  CreditMarker,
  Kind,
  LineItem,
  RecurringRule,
  Schedule,
  YearMonth
} from "../../domain/types";
import { DateField, DatePicker, CalendarGlyph } from "../components/DateField";
import {
  DeleteRuleDialog,
  type DeleteRuleMonthRow
} from "../components/DeleteRuleDialog";
import { MonthField } from "../components/MonthCal";
import {
  axisCoverRuns,
  formatMonthAria,
  formatMonthStamp,
  useCornerYear
} from "../components/MonthGrid";
import { resolveBoardFromMonth } from "./BoardPage";

const SAVE_FAILED = "未保存，数据未改动";

export type EntriesPageProps = {
  ledgerMonth: YearMonth | null;
  defaultFrom: YearMonth | null;
  defaultCount?: number;
  onOpenBoard: () => void;
  onOpenSettings?: () => void;
  reloadNonce?: number;
  onLedgerMutated?: () => void;
};

type FilterId = "once" | "flow" | "credit";
type Selection =
  | { kind: "once"; id: string }
  | { kind: "flow"; id: string }
  | { kind: "credit"; id: string }
  | { kind: "draft"; draft: FilterId }
  | null;

function parseYuan(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const yuan = Number(cleaned);
  if (!Number.isFinite(yuan)) return null;
  return yuanToCents(yuan);
}

function signedYuan(kind: Kind, cents: number): string {
  const n = formatYuanFromCents(cents);
  return kind === "income" ? n : `−${n}`;
}

function defaultOnceMonth(
  ledgerMonth: YearMonth | null,
  from: YearMonth,
  to: YearMonth
): YearMonth {
  if (
    ledgerMonth &&
    compareYearMonth(from, ledgerMonth) <= 0 &&
    compareYearMonth(ledgerMonth, to) <= 0
  ) {
    return ledgerMonth;
  }
  return from;
}

function statusLabel(item: LineItem): string {
  if (item.status === "confirmed") return "已确认";
  if (item.kind === "income") return "待发";
  return "待付";
}

function PaperConfirm({
  item,
  ariaName,
  onSaved,
  onError
}: {
  item: LineItem;
  ariaName: string;
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  async function handleConfirm() {
    try {
      await window.ledgerApi.confirmItem(item.id, item.plannedCents);
      onError(null);
      onSaved();
    } catch {
      onError(SAVE_FAILED);
    }
  }

  async function handleUnconfirm() {
    try {
      await window.ledgerApi.unconfirmItem(item.id);
      onError(null);
      onSaved();
    } catch {
      onError(SAVE_FAILED);
    }
  }

  return (
    <div className="entries-paper__confirm">
      <input
        type="checkbox"
        className="month-panel__check"
        checked={item.status === "confirmed"}
        aria-label={`确认${ariaName}`}
        onChange={() => {
          if (item.status === "confirmed") {
            void handleUnconfirm();
            return;
          }
          void handleConfirm();
        }}
      />
      <span className="entries-paper__status">{statusLabel(item)}</span>
    </div>
  );
}

function KidsHead({ cols }: { cols: string[] }) {
  return (
    <div className="entries-kids__cols" aria-hidden="true">
      {cols.map((col) => (
        <span key={col}>{col}</span>
      ))}
    </div>
  );
}

function KidField({ children }: { children: ReactNode }) {
  return <div className="entries-kids__field">{children}</div>;
}

function EntryDateField({
  name,
  month,
  date,
  spreadOn = false,
  allowEveryday,
  onChange,
  onEveryday
}: {
  name: string;
  month: string;
  date: string | null;
  spreadOn?: boolean;
  allowEveryday: boolean;
  onChange: (iso: string) => void;
  onEveryday?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <DateField
      name={name}
      month={month}
      expectedDate={date}
      spreadOn={spreadOn}
      allowEveryday={allowEveryday}
      editing={editing}
      pickerOpen={pickerOpen}
      onStartEdit={() => setEditing(true)}
      onCancelEdit={() => setEditing(false)}
      onOpenPicker={() => setPickerOpen(true)}
      onClosePicker={() => setPickerOpen(false)}
      onChange={(raw) => {
        setEditing(false);
        setPickerOpen(false);
        onChange(raw);
      }}
      onEveryday={
        onEveryday
          ? () => {
              setPickerOpen(false);
              onEveryday();
            }
          : undefined
      }
    />
  );
}

function ScheduleField({
  name,
  month,
  schedule,
  spread,
  onPick,
  onEveryday,
  onClear
}: {
  name: string;
  month: YearMonth;
  schedule: Schedule;
  spread: boolean;
  onPick: (iso: string) => void;
  onEveryday: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const iconRef = useRef<HTMLButtonElement>(null);
  const selected =
    !spread && schedule.type === "day_of_month"
      ? expectedDateForSchedule(month, schedule)
      : null;
  const text = spread
    ? "everyday"
    : schedule.type === "day_of_month"
      ? `每月${schedule.day}号`
      : "";
  return (
    <span className="month-panel__date">
      <span
        className={spread ? "month-panel__everyday" : "month-panel__date-text"}
        aria-label={`${name}每月日期`}
      >
        {text}
      </span>
      <button
        ref={iconRef}
        type="button"
        className="month-panel__date-icon"
        aria-label={`选择${name}每月日期`}
        onClick={() => setOpen(true)}
      >
        <CalendarGlyph />
      </button>
      {open && iconRef.current ? (
        <DatePicker
          name={`${name}每月`}
          month={month}
          selectedDate={selected}
          allowEveryday
          anchor={iconRef.current}
          onPick={(iso) => {
            setOpen(false);
            if (!iso) onClear();
            else onPick(iso);
          }}
          onEveryday={() => {
            setOpen(false);
            onEveryday();
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </span>
  );
}

function OncePaper({
  item,
  draft,
  defaultMonth,
  onSaved,
  onError,
  onCreated,
  onDeleted
}: {
  item: LineItem | null;
  draft: boolean;
  defaultMonth: YearMonth;
  onSaved: () => void;
  onError: (message: string | null) => void;
  onCreated: (id: string) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [kind, setKind] = useState<Kind>(item?.kind === "income" ? "income" : "expense");
  const [amount, setAmount] = useState(item ? String(displayCents(item) / 100) : "");
  const [date, setDate] = useState(item?.expectedDate ?? "");
  const [month, setMonth] = useState(item?.month ?? defaultMonth);
  const [spread, setSpread] = useState(item?.spreadDaily === true);

  function parsedAmount(): number | null {
    const cents = parseYuan(amount);
    if (cents == null || cents <= 0) return null;
    return cents;
  }

  async function persist(next: Partial<LineItem>) {
    if (!item) return;
    const amountCents = parsedAmount();
    if (!name.trim()) {
      onError("名称不能为空");
      return;
    }
    if (amountCents == null) {
      onError("金额必须大于 0");
      return;
    }
    try {
      const merged = {
        ...item,
        name: name.trim(),
        kind,
        month,
        plannedCents: amountCents,
        actualCents: item.status === "confirmed" ? amountCents : null,
        expectedDate: date || null,
        spreadDaily: spread,
        ...next
      };
      await window.ledgerApi.saveLine({
        ...merged,
        actualCents:
          merged.status === "confirmed" ? merged.plannedCents : merged.actualCents
      });
      onError(null);
      onSaved();
    } catch {
      onError(SAVE_FAILED);
    }
  }

  async function create() {
    if (!name.trim()) {
      onError("名称不能为空");
      return;
    }
    const amountCents = parsedAmount();
    if (amountCents == null) {
      onError("金额必须大于 0");
      return;
    }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      onError("日期不合法");
      return;
    }
    const id = crypto.randomUUID();
    try {
      await window.ledgerApi.saveLine({
        id,
        month,
        name: name.trim(),
        kind,
        plannedCents: amountCents,
        actualCents: null,
        expectedDate: date || null,
        status: "pending",
        source: "manual",
        ruleId: null,
        holdId: null,
        userOverridden: true,
        creditId: null,
        creditRole: null,
        spreadDaily: spread
      });
      onError(null);
      onCreated(id);
    } catch {
      onError(SAVE_FAILED);
    }
  }

  return (
    <section className="entries-paper" aria-label={draft ? "新单笔" : item?.name}>
      <div>
        <h2 className="entries-paper__title">{draft ? "新单笔" : item?.name}</h2>
        <div className="entries-paper__fields">
          <label>
            名称
            <input
              aria-label={`${draft ? "新单笔" : item?.name}名称`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (!draft) void persist({ name: name.trim() });
              }}
            />
          </label>
          <label>
            方向
            <select
              aria-label={`${draft ? "新单笔" : item?.name}方向`}
              value={kind}
              onChange={(e) => {
                const next = e.target.value as Kind;
                setKind(next);
                if (!draft) void persist({ kind: next });
              }}
            >
              <option value="income">收入</option>
              <option value="expense">支出</option>
            </select>
          </label>
          <div className="entries-paper__amount-confirm">
            <label>
              金额
              <input
                aria-label={`${draft ? "新单笔" : item?.name}金额`}
                value={amount}
                inputMode="decimal"
                onChange={(e) => setAmount(e.target.value)}
                onBlur={() => {
                  if (!draft) void persist({});
                }}
              />
            </label>
            {!draft && item ? (
              <div className="entries-paper__check">
                确认
                <PaperConfirm
                  item={item}
                  ariaName={item.name}
                  onSaved={onSaved}
                  onError={onError}
                />
              </div>
            ) : null}
          </div>
          <label>
            日期
            <EntryDateField
              name={draft ? "新单笔" : item?.name ?? "单笔"}
              month={month}
              date={spread ? null : date || null}
              spreadOn={spread}
              allowEveryday
              onChange={(iso) => {
                setDate(iso);
                setSpread(false);
                if (!draft) {
                  void persist({ expectedDate: iso || null, spreadDaily: false });
                }
              }}
              onEveryday={() => {
                setSpread(true);
                setDate("");
                if (!draft) void persist({ spreadDaily: true, expectedDate: null });
              }}
            />
          </label>
          <label>
            归属月
            <MonthField
              name={`${draft ? "新单笔" : item?.name}归属月`}
              value={month}
              mode="single"
              onChange={(from) => {
                setMonth(from);
                if (!draft) void persist({ month: from });
              }}
            />
          </label>
        </div>
      </div>
      <div className="entries-paper__actions">
        {draft ? (
          <button type="button" className="entries-paper__save" onClick={() => void create()}>
            记下
          </button>
        ) : (
          <button
            type="button"
            className="entries-paper__danger"
            onClick={() => {
              if (!item) return;
              const ok = window.confirm(
                `删除「${item.name}」${formatYuanFromCents(displayCents(item))}？`
              );
              if (!ok) return;
              void window.ledgerApi
                .deleteLine(item.id)
                .then(() => {
                  onError(null);
                  onDeleted();
                })
                .catch(() => onError(SAVE_FAILED));
            }}
          >
            删除
          </button>
        )}
      </div>
    </section>
  );
}

function FlowPaper({
  rule,
  items,
  draft,
  defaultStart,
  onSaved,
  onError,
  onCreated,
  onAskDelete
}: {
  rule: RecurringRule | null;
  items: LineItem[];
  draft: boolean;
  defaultStart: YearMonth;
  onSaved: () => void;
  onError: (message: string | null) => void;
  onCreated: (id: string) => void;
  onAskDelete: (rule: RecurringRule) => void;
}) {
  const [name, setName] = useState(rule?.name ?? "");
  const [kind, setKind] = useState<Kind>(rule?.kind === "income" ? "income" : "expense");
  const [amount, setAmount] = useState(rule ? String(rule.amountCents / 100) : "");
  const [schedule, setSchedule] = useState<Schedule>(rule?.schedule ?? { type: "unknown_day" });
  const [startMonth, setStartMonth] = useState(rule?.startMonth ?? defaultStart);
  const [endMonth, setEndMonth] = useState<YearMonth | null>(rule?.endMonth ?? null);
  const [spread, setSpread] = useState(rule?.spreadDaily ?? false);
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [childMonth, setChildMonth] = useState<YearMonth | null>(null);
  const [childAmount, setChildAmount] = useState("");
  const [childDate, setChildDate] = useState("");

  const childLines = rule
    ? items
        .filter((row) => row.ruleId === rule.id && row.month != null)
        .sort((a, b) => compareYearMonth(a.month as YearMonth, b.month as YearMonth))
    : [];

  function parsedAmount(): number | null {
    const cents = parseYuan(amount);
    if (cents == null || cents <= 0) return null;
    return cents;
  }

  async function persistRule(patch: Partial<RecurringRule>) {
    if (!rule) return;
    if (!name.trim()) {
      onError("名称不能为空");
      return;
    }
    const amountCents = parsedAmount();
    if (amountCents == null) {
      onError("金额必须大于 0");
      return;
    }
    try {
      await window.ledgerApi.saveRule({
        ...rule,
        name: name.trim(),
        kind,
        amountCents,
        schedule,
        startMonth,
        endMonth,
        enabled,
        spreadDaily: spread,
        ...patch
      });
      onError(null);
      onSaved();
    } catch {
      onError(SAVE_FAILED);
    }
  }

  async function create() {
    if (!name.trim()) {
      onError("名称不能为空");
      return;
    }
    const amountCents = parsedAmount();
    if (amountCents == null) {
      onError("金额必须大于 0");
      return;
    }
    const id = crypto.randomUUID();
    try {
      await window.ledgerApi.saveRule({
        id,
        name: name.trim(),
        kind,
        amountCents,
        schedule,
        startMonth,
        endMonth,
        enabled,
        spreadDaily: spread
      });
      onError(null);
      onCreated(id);
    } catch {
      onError(SAVE_FAILED);
    }
  }

  async function saveChild(
    month: YearMonth,
    amountRaw: string,
    dateRaw: string
  ) {
    if (!rule) return;
    const amountCents = parseYuan(amountRaw);
    if (amountCents == null || amountCents <= 0) {
      onError("金额必须大于 0");
      return;
    }
    if (dateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
      onError("日期不合法");
      return;
    }
    const existing = items.find((row) => row.ruleId === rule.id && row.month === month);
    const defaultDate = expectedDateForSchedule(month, rule.schedule);
    const nextDate = dateRaw || defaultDate;
    if (
      existing &&
      amountCents === displayCents(existing) &&
      (dateRaw || "") === (existing.expectedDate ?? "")
    ) {
      return;
    }
    const amountDiffers = amountCents !== rule.amountCents;
    const dateDiffers = Boolean(dateRaw) && dateRaw !== defaultDate;
    try {
      if (existing && !amountDiffers && !dateDiffers) {
        await window.ledgerApi.saveLine({
          ...existing,
          plannedCents: rule.amountCents,
          actualCents: existing.status === "confirmed" ? rule.amountCents : null,
          expectedDate: nextDate,
          userOverridden: false
        });
      } else if (existing) {
        await window.ledgerApi.saveLine({
          ...existing,
          plannedCents: amountCents,
          actualCents: existing.status === "confirmed" ? amountCents : null,
          expectedDate: nextDate,
          userOverridden: true
        });
      } else {
        await window.ledgerApi.saveLine({
          id: crypto.randomUUID(),
          month,
          name: rule.name,
          kind: rule.kind === "income" ? "income" : "expense",
          plannedCents: amountCents,
          actualCents: null,
          expectedDate: nextDate,
          status: "pending",
          source: "rule",
          ruleId: rule.id,
          holdId: null,
          userOverridden: true,
          creditId: null,
          creditRole: null,
          spreadDaily: null
        });
      }
      setChildAmount("");
      setChildDate("");
      setChildMonth(null);
      onError(null);
      onSaved();
    } catch {
      onError(SAVE_FAILED);
    }
  }

  const title = draft ? "新现金流" : rule?.name ?? "现金流";
  return (
    <section className="entries-paper" aria-label={title}>
      <div>
        <div className="entries-paper__head">
        <h2 className="entries-paper__title">{title}</h2>
        <div className="entries-paper__fields">
          <label>
            名称
            <input
              aria-label={`${title}名称`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (!draft) void persistRule({ name: name.trim() });
              }}
            />
          </label>
          <label>
            方向
            <select
              aria-label={`${title}方向`}
              value={kind}
              onChange={(e) => {
                const next = e.target.value as Kind;
                setKind(next);
                if (!draft) void persistRule({ kind: next });
              }}
            >
              <option value="income">收入</option>
              <option value="expense">支出</option>
            </select>
          </label>
          <label>
            金额
            <input
              aria-label={`${title}金额`}
              value={amount}
              inputMode="decimal"
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => {
                if (!draft) void persistRule({});
              }}
            />
          </label>
          <label>
            每月日期
            <ScheduleField
              name={title}
              month={startMonth}
              schedule={schedule}
              spread={spread}
              onPick={(iso) => {
                const day = Number(iso.slice(-2));
                const next: Schedule = { type: "day_of_month", day };
                setSchedule(next);
                setSpread(false);
                if (!draft) void persistRule({ schedule: next, spreadDaily: false });
              }}
              onEveryday={() => {
                setSpread(true);
                if (!draft) void persistRule({ spreadDaily: true });
              }}
              onClear={() => {
                const next: Schedule = { type: "unknown_day" };
                setSchedule(next);
                setSpread(false);
                if (!draft) void persistRule({ schedule: next, spreadDaily: false });
              }}
            />
          </label>
          <label>
            起止月
            <MonthField
              name={`${title}起止月`}
              value={startMonth}
              rangeTo={endMonth}
              openEnd={endMonth == null}
              mode="open-end"
              onChange={(from, to) => {
                setStartMonth(from);
                setEndMonth(to);
                if (!draft) void persistRule({ startMonth: from, endMonth: to });
              }}
            />
          </label>
          <label className="entries-paper__check">
            <input
              type="checkbox"
              aria-label={`启用${title}`}
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
                if (!draft) void persistRule({ enabled: e.target.checked });
              }}
            />
            启用
          </label>
        </div>
        </div>
        {rule ? (
          <>
            <p className="entries-paper__kicker">子条目</p>
            <div className="entries-kids entries-kids--flow">
              <KidsHead cols={["月份", "金额", "日期", "确认"]} />
              <div className="entries-kids__row">
                <KidField>
                  <MonthField
                    name={`${title}子条目月份`}
                    value={childMonth}
                    mode="single"
                    onChange={(from) => setChildMonth(from)}
                  />
                </KidField>
                <KidField>
                  <input
                    aria-label={`${title}子条目金额`}
                    className="entries-kids__amt"
                    value={childAmount}
                    inputMode="decimal"
                    onChange={(e) => setChildAmount(e.target.value)}
                  />
                </KidField>
                <KidField>
                  <EntryDateField
                    name={`${title}子条目`}
                    month={childMonth ?? startMonth}
                    date={childDate || null}
                    allowEveryday
                    onChange={setChildDate}
                    onEveryday={() => setChildDate("")}
                  />
                </KidField>
                <button
                  type="button"
                  className="entries-kids__add"
                  onClick={() => {
                    if (!childMonth) {
                      onError("请选月份");
                      return;
                    }
                    void saveChild(
                      childMonth,
                      childAmount || String(rule.amountCents / 100),
                      childDate
                    );
                  }}
                >
                  加一行
                </button>
              </div>
              <ul>
                {childLines.map((line) => (
                  <ChildRow
                    key={line.id}
                    rule={rule}
                    line={line}
                    onSave={(amountRaw, dateRaw) =>
                      void saveChild(line.month as YearMonth, amountRaw, dateRaw)
                    }
                    onConfirmSaved={onSaved}
                    onConfirmError={onError}
                  />
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </div>
      <div className="entries-paper__actions">
        {draft ? (
          <button type="button" className="entries-paper__save" onClick={() => void create()}>
            记下
          </button>
        ) : rule ? (
          <button type="button" className="entries-paper__danger" onClick={() => onAskDelete(rule)}>
            删除
          </button>
        ) : null}
      </div>
    </section>
  );
}

function ChildRow({
  rule,
  line,
  onSave,
  onConfirmSaved,
  onConfirmError
}: {
  rule: RecurringRule;
  line: LineItem;
  onSave: (amount: string, date: string) => void;
  onConfirmSaved: () => void;
  onConfirmError: (message: string | null) => void;
}) {
  const shownAmount = String(displayCents(line) / 100);
  const [amount, setAmount] = useState(shownAmount);
  const [editingAmount, setEditingAmount] = useState(false);
  const [date, setDate] = useState(line.expectedDate ?? "");
  const amountValue = editingAmount ? amount : shownAmount;

  useEffect(() => {
    setDate(line.expectedDate ?? "");
  }, [line.expectedDate]);

  return (
    <li>
      <KidField>
        <MonthField
          name={`${rule.name}${line.month}月份`}
          value={line.month}
          mode="single"
          onChange={(from) => onSave(amountValue, date.startsWith(from) ? date : "")}
        />
      </KidField>
      <KidField>
        <input
          aria-label={`${rule.name}${line.month}金额`}
          className="entries-kids__amt"
          value={amountValue}
          inputMode="decimal"
          onFocus={() => {
            setAmount(shownAmount);
            setEditingAmount(true);
          }}
          onChange={(e) => {
            setEditingAmount(true);
            setAmount(e.target.value);
          }}
          onBlur={() => {
            const next = editingAmount ? amount : shownAmount;
            setEditingAmount(false);
            onSave(next, date);
          }}
        />
      </KidField>
      <KidField>
        <EntryDateField
          name={`${rule.name}${line.month}`}
          month={line.month ?? rule.startMonth}
          date={date || null}
          allowEveryday
          spreadOn={line.spreadDaily === true}
          onChange={(iso) => {
            setDate(iso);
            onSave(amountValue, iso);
          }}
          onEveryday={() => onSave(amountValue, "")}
        />
      </KidField>
      <PaperConfirm
        item={line}
        ariaName={`${rule.name}${line.month}`}
        onSaved={onConfirmSaved}
        onError={onConfirmError}
      />
    </li>
  );
}

function CreditPaper({
  marker,
  items,
  draft,
  defaultOccurDate,
  onSaved,
  onError,
  onCreated,
  onDeleted
}: {
  marker: CreditMarker | null;
  items: LineItem[];
  draft: boolean;
  defaultOccurDate: string;
  onSaved: () => void;
  onError: (message: string | null) => void;
  onCreated: () => void;
  onDeleted: () => void;
}) {
  const loan = marker
    ? items.find((row) => row.creditId === marker.id && row.creditRole === "loan_in")
    : undefined;
  const repayments = marker
    ? items
        .filter((row) => row.creditId === marker.id && row.creditRole === "loan_repay")
        .sort((a, b) => (a.expectedDate ?? "").localeCompare(b.expectedDate ?? ""))
    : [];
  const [creditor, setCreditor] = useState(marker?.creditor ?? "");
  const [direction, setDirection] = useState<CreditDirection>(
    creditDirectionOf(marker ?? undefined)
  );
  const [occurDate, setOccurDate] = useState(loan?.expectedDate ?? defaultOccurDate);
  const [principal, setPrincipal] = useState(loan ? String(displayCents(loan) / 100) : "");
  const [repayDate, setRepayDate] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const copy = creditUi(direction);

  async function persistHead(
    nextOccur = occurDate,
    nextPrincipal = principal,
    nextDirection = direction
  ) {
    if (!marker || !loan) return;
    if (!creditor.trim()) {
      onError(creditUi(nextDirection).partyEmpty);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextOccur)) {
      onError("日期不合法");
      return;
    }
    const principalCents = parseYuan(nextPrincipal);
    if (principalCents == null || principalCents <= 0) {
      onError("本金必须大于 0");
      return;
    }
    try {
      await window.ledgerApi.saveCredit({
        id: marker.id,
        creditor: creditor.trim(),
        direction: nextDirection
      });
      await window.ledgerApi.saveLine({
        ...loan,
        name: creditor.trim(),
        kind: creditLineKind(nextDirection, "loan_in"),
        month: nextOccur.slice(0, 7),
        expectedDate: nextOccur,
        plannedCents: principalCents,
        actualCents: loan.status === "confirmed" ? principalCents : null
      });
      onError(null);
      onSaved();
    } catch {
      onError(SAVE_FAILED);
    }
  }

  async function create() {
    if (!creditor.trim()) {
      onError(copy.partyEmpty);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurDate)) {
      onError("日期不合法");
      return;
    }
    const principalCents = parseYuan(principal);
    if (principalCents == null || principalCents <= 0) {
      onError("本金必须大于 0");
      return;
    }
    try {
      await window.ledgerApi.createCredit({
        creditor: creditor.trim(),
        occurDate,
        principalCents,
        direction
      });
      onError(null);
      onCreated();
    } catch {
      onError(SAVE_FAILED);
    }
  }

  async function saveRepay(row: LineItem, amountRaw: string, dateRaw: string) {
    const amountCents = parseYuan(amountRaw);
    if (amountCents == null || amountCents <= 0) {
      onError("还款金额必须大于 0");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
      onError("日期不合法");
      return;
    }
    try {
      await window.ledgerApi.saveLine({
        ...row,
        name: creditor.trim() || row.name,
        kind: creditLineKind(direction, "loan_repay"),
        month: dateRaw.slice(0, 7),
        expectedDate: dateRaw,
        plannedCents: amountCents,
        actualCents: row.status === "confirmed" ? amountCents : null
      });
      const nextItems = await window.ledgerApi.listItems();
      if (marker) {
        const remaining = creditRemainingCents(nextItems, marker.id, dateRaw.slice(0, 7));
        const principalLine = nextItems.find(
          (line) => line.creditId === marker.id && line.creditRole === "loan_in"
        );
        const repaid = nextItems
          .filter((line) => line.creditId === marker.id && line.creditRole === "loan_repay")
          .reduce((sum, line) => sum + displayCents(line), 0);
        if (principalLine && remaining === 0 && repaid > displayCents(principalLine)) {
          onError("超额");
        } else {
          onError(null);
        }
      } else {
        onError(null);
      }
      onSaved();
    } catch {
      onError(SAVE_FAILED);
    }
  }

  async function addRepay(dateRaw = repayDate, amountRaw = repayAmount) {
    if (!marker) return;
    const amountCents = parseYuan(amountRaw);
    if (amountCents == null || amountCents <= 0) {
      onError("还款金额必须大于 0");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
      onError("日期不合法");
      return;
    }
    try {
      await window.ledgerApi.addRepayment({
        creditId: marker.id,
        expectedDate: dateRaw,
        amountCents
      });
      setRepayAmount("");
      setRepayDate("");
      onError(null);
      onSaved();
    } catch {
      onError(SAVE_FAILED);
    }
  }

  const title = draft ? "新信贷" : marker?.creditor ?? "信贷";
  return (
    <section className="entries-paper" aria-label={title}>
      <div>
        <div className="entries-paper__head">
        <h2 className="entries-paper__title">{title}</h2>
        <div className="entries-paper__fields">
          <label>
            方向
            <select
              aria-label={`${title}方向`}
              value={direction}
              onChange={(e) => {
                const next = e.target.value as CreditDirection;
                setDirection(next);
                if (!draft) void persistHead(occurDate, principal, next);
              }}
            >
              <option value="borrow">借入</option>
              <option value="lend">借出</option>
            </select>
          </label>
          <label>
            {copy.party}
            <input
              aria-label={`${title}${copy.party}`}
              value={creditor}
              onChange={(e) => setCreditor(e.target.value)}
              onBlur={() => {
                if (!draft) void persistHead();
              }}
            />
          </label>
          <label>
            发生日
            <EntryDateField
              name={`${title}发生日`}
              month={occurDate.slice(0, 7) || defaultOccurDate.slice(0, 7)}
              date={occurDate || null}
              allowEveryday={false}
              onChange={(iso) => {
                setOccurDate(iso);
                if (!draft) void persistHead(iso);
              }}
            />
          </label>
          <div className="entries-paper__amount-confirm">
            <label>
              本金
              <input
                aria-label={`${title}本金`}
                value={principal}
                inputMode="decimal"
                onChange={(e) => setPrincipal(e.target.value)}
                onBlur={() => {
                  if (!draft) void persistHead();
                }}
              />
            </label>
            {!draft && loan ? (
              <div className="entries-paper__check">
                确认
                <PaperConfirm
                  item={loan}
                  ariaName={copy.loanConfirmAria(marker?.creditor ?? title)}
                  onSaved={onSaved}
                  onError={onError}
                />
              </div>
            ) : null}
          </div>
        </div>
        </div>
        {marker ? (
          <>
            <p className="entries-paper__kicker">{copy.kidsKicker}</p>
            <div className="entries-kids entries-kids--credit">
              <KidsHead cols={["日期", "金额", "确认"]} />
              <div className="entries-kids__row">
                <KidField>
                  <EntryDateField
                    name={`${title}${copy.newRow}`}
                    month={repayDate.slice(0, 7) || defaultOccurDate.slice(0, 7)}
                    date={repayDate || null}
                    allowEveryday={false}
                    onChange={setRepayDate}
                  />
                </KidField>
                <KidField>
                  <input
                    aria-label={`${title}${copy.newRow}金额`}
                    className="entries-kids__amt"
                    value={repayAmount}
                    inputMode="decimal"
                    onChange={(e) => setRepayAmount(e.target.value)}
                  />
                </KidField>
                <span />
                <button
                  type="button"
                  className="entries-kids__add"
                  onClick={() => void addRepay()}
                >
                  加一行
                </button>
              </div>
              <ul>
                {repayments.map((row) => (
                  <RepayRow
                    key={row.id}
                    item={row}
                    copy={copy}
                    onSave={saveRepay}
                    onConfirmSaved={onSaved}
                    onConfirmError={onError}
                    onDelete={() => {
                      const ok = window.confirm(
                        copy.deleteRepay(formatYuanFromCents(displayCents(row)))
                      );
                      if (!ok) return;
                      void window.ledgerApi
                        .deleteLine(row.id)
                        .then(() => {
                          onError(null);
                          onSaved();
                        })
                        .catch(() => onError(SAVE_FAILED));
                    }}
                  />
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </div>
      <div className="entries-paper__actions">
        {draft ? (
          <button type="button" className="entries-paper__save" onClick={() => void create()}>
            记下
          </button>
        ) : (
          <>
            <span />
            <button
              type="button"
              className="entries-paper__danger"
              onClick={() => {
                if (!marker) return;
                const ok = window.confirm(
                  copy.deleteWhole(marker.creditor)
                );
                if (!ok) return;
                void window.ledgerApi
                  .deleteCredit(marker.id)
                  .then(() => {
                    onError(null);
                    onDeleted();
                  })
                  .catch(() => onError(SAVE_FAILED));
              }}
            >
              删除整笔
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function RepayRow({
  item,
  copy,
  onSave,
  onConfirmSaved,
  onConfirmError,
  onDelete
}: {
  item: LineItem;
  copy: ReturnType<typeof creditUi>;
  onSave: (item: LineItem, amount: string, date: string) => void;
  onConfirmSaved: () => void;
  onConfirmError: (message: string | null) => void;
  onDelete: () => void;
}) {
  const [amount, setAmount] = useState(String(displayCents(item) / 100));
  const [date, setDate] = useState(item.expectedDate ?? "");
  return (
    <li>
      <KidField>
        <EntryDateField
          name={`${item.name}${item.month}${copy.repayTag}日`}
          month={item.month ?? date.slice(0, 7)}
          date={date || null}
          allowEveryday={false}
          onChange={(iso) => {
            setDate(iso);
            onSave(item, amount, iso);
          }}
        />
      </KidField>
      <KidField>
        <input
          aria-label={`${item.name}${item.month}${copy.repayTag}金额`}
          className="entries-kids__amt"
          value={amount}
          inputMode="decimal"
          onChange={(e) => setAmount(e.target.value)}
          onBlur={() => onSave(item, amount, date)}
        />
      </KidField>
      <PaperConfirm
        item={item}
        ariaName={copy.confirmAria(item.name)}
        onSaved={onConfirmSaved}
        onError={onConfirmError}
      />
      <button type="button" className="entries-kids__remove" onClick={onDelete}>
        删除
      </button>
    </li>
  );
}

export function EntriesPage({
  ledgerMonth,
  defaultFrom,
  defaultCount = 12,
  onOpenBoard,
  onOpenSettings,
  reloadNonce,
  onLedgerMutated
}: EntriesPageProps) {
  const [rangeFrom, setRangeFrom] = useState<YearMonth | null>(null);
  const [rangeTo, setRangeTo] = useState<YearMonth | null>(null);
  const [filters, setFilters] = useState<Record<FilterId, boolean>>({
    once: true,
    flow: true,
    credit: true
  });
  const [items, setItems] = useState<LineItem[]>([]);
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [markers, setMarkers] = useState<CreditMarker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [rosterMonth, setRosterMonth] = useState<YearMonth | null>(null);
  const [sheetMode, setSheetMode] = useState<"year" | "month">("year");
  const [deleting, setDeleting] = useState<{
    rule: RecurringRule;
    months: DeleteRuleMonthRow[];
  } | null>(null);

  useEffect(() => {
    if (rangeFrom) return;
    if (defaultFrom) {
      setRangeFrom(defaultFrom);
      setRangeTo(addMonths(defaultFrom, defaultCount - 1));
      return;
    }
    let cancelled = false;
    void window.ledgerApi.getMeta().then((meta) => {
      if (cancelled) return;
      const from = resolveBoardFromMonth(shanghaiYearMonth(), meta.startMonth);
      setRangeFrom(from);
      setRangeTo(addMonths(from, 11));
    });
    return () => {
      cancelled = true;
    };
  }, [defaultFrom, defaultCount, rangeFrom]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [nextItems, nextRules, nextMarkers] = await Promise.all([
          window.ledgerApi.listItems(),
          window.ledgerApi.listRules(),
          window.ledgerApi.listCredits()
        ]);
        if (cancelled) return;
        setItems(nextItems);
        setRules(nextRules);
        setMarkers(nextMarkers);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken, reloadNonce]);

  const from = rangeFrom ?? "2026-09";
  const to = rangeTo ?? addMonths(from, 11);
  const axisMonths = monthsInclusive(from, to);
  const cols = useMemo(
    () => axisMonths.map((month) => ({ type: "month" as const, month })),
    [from, to]
  );
  const { wrapRef, cornerYear } = useCornerYear(cols);
  const once = filters.once ? onceInRange(items, from, to) : [];
  const flows = filters.flow ? cashflowsInRange(rules, from, to) : [];
  const credits = filters.credit ? creditsInRange(items, markers, from, to) : [];
  const onceMonth = defaultOnceMonth(ledgerMonth, from, to);
  const occurDate = `${onceMonth}-01`;
  const activeRoster =
    rosterMonth &&
    compareYearMonth(from, rosterMonth) <= 0 &&
    compareYearMonth(rosterMonth, to) <= 0
      ? rosterMonth
      : onceMonth;

  function reload() {
    setReloadToken((n) => n + 1);
    onLedgerMutated?.();
  }

  function covered(month: YearMonth, start: YearMonth, end: YearMonth | null): boolean {
    if (compareYearMonth(month, start) < 0) return false;
    if (end != null && compareYearMonth(month, end) > 0) return false;
    return compareYearMonth(month, to) <= 0 && compareYearMonth(from, month) <= 0;
  }

  function flowCovers(rule: RecurringRule, month: YearMonth): boolean {
    return covered(month, rule.startMonth, rule.endMonth);
  }

  function creditCovers(marker: CreditMarker, month: YearMonth): boolean {
    return creditsInRange(items, [marker], month, month).length > 0;
  }

  function firstCoveredMonth(kind: FilterId, id: string): YearMonth | null {
    if (kind === "once") {
      return once.find((row) => row.id === id)?.month ?? null;
    }
    if (kind === "flow") {
      const rule = flows.find((row) => row.id === id);
      if (!rule) return null;
      return axisMonths.find((month) => flowCovers(rule, month)) ?? null;
    }
    const marker = credits.find((row) => row.id === id);
    if (!marker) return null;
    return axisMonths.find((month) => creditCovers(marker, month)) ?? null;
  }

  function coversActive(kind: FilterId, id: string, month: YearMonth): boolean {
    if (kind === "once") {
      return once.some((row) => row.id === id && row.month === month);
    }
    if (kind === "flow") {
      const rule = flows.find((row) => row.id === id);
      return rule ? flowCovers(rule, month) : false;
    }
    const marker = credits.find((row) => row.id === id);
    return marker ? creditCovers(marker, month) : false;
  }

  function selectRow(kind: FilterId, id: string) {
    setComposeOpen(false);
    setSelection({ kind, id });
    setSheetMode("month");
    if (!coversActive(kind, id, activeRoster)) {
      const next = firstCoveredMonth(kind, id);
      if (next) setRosterMonth(next);
    }
  }

  function pickRunMonth(
    event: MouseEvent<HTMLTableCellElement>,
    months: YearMonth[]
  ) {
    event.stopPropagation();
    if (months.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const t = rect.width <= 0 ? 0 : (event.clientX - rect.left) / rect.width;
    const i = Math.min(months.length - 1, Math.max(0, Math.floor(t * months.length)));
    setRosterMonth(months[i] ?? months[0]);
    setSheetMode("month");
  }

  function startDraft(draft: FilterId) {
    setComposeOpen(false);
    setSelection({ kind: "draft", draft });
    setSheetMode("month");
  }

  function showYearSheet() {
    setSheetMode("year");
  }

  function showMonthSheet(month: YearMonth) {
    setRosterMonth(month);
    setSheetMode("month");
  }

  async function openDelete(rule: RecurringRule) {
    try {
      const months = await window.ledgerApi.listRuleDeleteMonths(rule.id);
      setDeleting({ rule, months });
      setError(null);
    } catch {
      setError(SAVE_FAILED);
    }
  }

  async function confirmDelete(keepMonths: string[]) {
    if (!deleting) return;
    try {
      await window.ledgerApi.deleteRule(deleting.rule.id, keepMonths);
      setDeleting(null);
      setSelection(null);
      reload();
    } catch {
      setError(SAVE_FAILED);
    }
  }

  const rosterFlows = flows.filter((rule) => flowCovers(rule, activeRoster));
  const rosterOnce = once.filter((item) => item.month === activeRoster);
  const rosterCredits = credits.filter((marker) => creditCovers(marker, activeRoster));

  const selectedOnce =
    selection?.kind === "once" ? once.find((row) => row.id === selection.id) ?? null : null;
  const selectedFlow =
    selection?.kind === "flow" ? flows.find((row) => row.id === selection.id) ?? rules.find((row) => row.id === selection.id) ?? null : null;
  const selectedCredit =
    selection?.kind === "credit"
      ? credits.find((row) => row.id === selection.id) ?? markers.find((row) => row.id === selection.id) ?? null
      : null;

  return (
    <div className="entries-page">
      <header className="entries-page__top">
        <div className="entries-page__brand-row">
          <h1 className="entries-page__brand">条目管理</h1>
          <button type="button" className="nav-link" onClick={onOpenBoard}>
            台账
          </button>
        </div>
        <nav className="entries-page__nav">
          {onOpenSettings ? (
            <button type="button" className="nav-link" onClick={onOpenSettings}>
              设置
            </button>
          ) : null}
        </nav>
      </header>
      {error ? <p className="entries-page__error">{error}</p> : null}
      <div className="ledger-toolbar">
        <MonthField
          name="条目月份范围"
          value={from}
          rangeTo={to}
          mode="range"
          onChange={(start, end) => {
            setRangeFrom(start);
            setRangeTo(end ?? start);
          }}
        />
        <div className="entries-chips" role="group" aria-label="条目分类">
          {(
            [
              ["flow", "现金流"],
              ["once", "单笔"],
              ["credit", "信贷"]
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filters[id]}
              className={filters[id] ? "is-on" : undefined}
              onClick={() => setFilters((prev) => ({ ...prev, [id]: !prev[id] }))}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="entries-compose">
          <button
            type="button"
            className="entries-compose__btn"
            onClick={() => setComposeOpen((v) => !v)}
          >
            记一笔
          </button>
          {composeOpen ? (
            <div className="entries-compose__menu" role="menu">
              <button type="button" role="menuitem" onClick={() => startDraft("once")}>
                单笔
              </button>
              <button type="button" role="menuitem" onClick={() => startDraft("flow")}>
                现金流
              </button>
              <button type="button" role="menuitem" onClick={() => startDraft("credit")}>
                信贷
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="entries-page__body">
      <div
        className={`month-grid-wrap entries-sheet${sheetMode === "month" ? " is-month" : ""}`}
      >
        <div className="entries-sheet__scroller" ref={wrapRef}>
        <table
          className="month-grid entries-year"
          style={{
            minWidth: `calc(17.5rem + ${axisMonths.length} * 2.6em)`
          }}
        >
          <colgroup>
            <col className="month-grid__col-label" />
            {axisMonths.map((month) => (
              <col key={`month-col-${month}`} className="month-grid__col-month" />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th
                className={
                  sheetMode === "year"
                    ? "month-grid__corner month-grid__year-num is-selected"
                    : "month-grid__corner month-grid__year-num"
                }
                scope="col"
                data-testid="month-grid-corner"
                aria-label="展示完整年表"
                onClick={showYearSheet}
              >
                {cornerYear}
              </th>
              {axisMonths.map((month) => (
                  <th
                    key={month}
                    scope="col"
                    role="columnheader"
                    aria-label={formatMonthAria(month)}
                    className={
                      sheetMode === "month" && month === activeRoster
                        ? "month-grid__stamp is-selected"
                        : "month-grid__stamp"
                    }
                    onClick={() => showMonthSheet(month)}
                  >
                    {formatMonthStamp(month)}
                  </th>
              ))}
            </tr>
          </thead>
          {sheetMode === "year" ? (
          <tbody>
            {flows.map((rule) => (
              <tr
                key={`flow-${rule.id}`}
                className={
                  selection?.kind === "flow" && selection.id === rule.id ? "is-on" : undefined
                }
              >
                <th
                  scope="row"
                  className="month-grid__row-label entries-year__name"
                  onClick={() => selectRow("flow", rule.id)}
                >
                  <span>
                    <span className="entries-year__name-text">{rule.name}</span>
                    <span className="entries-kind">流</span>
                  </span>
                  <span className="num">{signedYuan(rule.kind, rule.amountCents)}</span>
                </th>
                {axisCoverRuns(cols, (month) =>
                  covered(month, rule.startMonth, rule.endMonth)
                ).map((seg) =>
                  seg.type === "year-break" ? (
                    <td
                      key={`year-${seg.year}`}
                      className="month-grid__year-break entries-year__break"
                    />
                  ) : (
                    <td
                      key={seg.months[0]}
                      className="entries-year__month"
                      colSpan={seg.months.length}
                      onClick={(event) => pickRunMonth(event, seg.months)}
                    >
                      {seg.on ? (
                        <span
                          className={`entries-bar ${rule.kind === "income" ? "is-in" : "is-out"}`}
                        />
                      ) : null}
                    </td>
                  )
                )}
              </tr>
            ))}
            {once.map((item) => (
              <tr
                key={`once-${item.id}`}
                className={
                  selection?.kind === "once" && selection.id === item.id ? "is-on" : undefined
                }
              >
                <th
                  scope="row"
                  className="month-grid__row-label entries-year__name"
                  onClick={() => selectRow("once", item.id)}
                >
                  <span>
                    <span className="entries-year__name-text">{item.name}</span>
                    <span className="entries-kind">笔</span>
                  </span>
                  <span className="num">{signedYuan(item.kind, displayCents(item))}</span>
                </th>
                {axisCoverRuns(cols, (month) => item.month === month).map((seg) =>
                  seg.type === "year-break" ? (
                    <td
                      key={`year-${seg.year}`}
                      className="month-grid__year-break entries-year__break"
                    />
                  ) : (
                    <td
                      key={seg.months[0]}
                      className="entries-year__month"
                      colSpan={seg.months.length}
                      onClick={(event) => pickRunMonth(event, seg.months)}
                    >
                      {seg.on ? <span className="entries-bar is-once" /> : null}
                    </td>
                  )
                )}
              </tr>
            ))}
            {credits.map((marker) => (
                <tr
                  key={`credit-${marker.id}`}
                  className={
                    selection?.kind === "credit" && selection.id === marker.id ? "is-on" : undefined
                  }
                >
                  <th
                    scope="row"
                    className="month-grid__row-label entries-year__name"
                    onClick={() => selectRow("credit", marker.id)}
                  >
                    <span>
                      <span className="entries-year__name-text">{marker.creditor}</span>
                      <span className="entries-kind">贷</span>
                    </span>
                    <span className="num">
                      {`剩 ${formatYuanFromCents(creditRemainingCents(items, marker.id, to))}`}
                    </span>
                  </th>
                  {axisCoverRuns(
                    cols,
                    (month) => creditsInRange(items, [marker], month, month).length > 0
                  ).map((seg) =>
                    seg.type === "year-break" ? (
                      <td
                        key={`year-${seg.year}`}
                        className="month-grid__year-break entries-year__break"
                      />
                    ) : (
                      <td
                        key={seg.months[0]}
                        className="entries-year__month"
                        colSpan={seg.months.length}
                        onClick={(event) => pickRunMonth(event, seg.months)}
                      >
                        {seg.on ? <span className="entries-bar is-credit" /> : null}
                      </td>
                    )
                  )}
                </tr>
            ))}
          </tbody>
          ) : null}
        </table>
        </div>
      {sheetMode === "month" ? (
      <div className="entries-month-book" aria-label="月录">
        <aside className="entries-roster">
          <h2>{formatMonthAria(activeRoster)}</h2>
          <div className="entries-roster__list">
            {rosterFlows.map((rule) => (
              <button
                key={`roster-flow-${rule.id}`}
                type="button"
                data-roster={`flow-${rule.id}`}
                className={
                  selection?.kind === "flow" && selection.id === rule.id
                    ? "entries-r-item is-on"
                    : "entries-r-item"
                }
                onClick={() => selectRow("flow", rule.id)}
              >
                <span>
                  {rule.name}
                  <span className="entries-kind">流</span>
                </span>
                <span className="num">{signedYuan(rule.kind, rule.amountCents)}</span>
              </button>
            ))}
            {rosterOnce.map((item) => (
              <button
                key={`roster-once-${item.id}`}
                type="button"
                data-roster={`once-${item.id}`}
                className={
                  selection?.kind === "once" && selection.id === item.id
                    ? "entries-r-item is-on"
                    : "entries-r-item"
                }
                onClick={() => selectRow("once", item.id)}
              >
                <span>
                  {item.name}
                  <span className="entries-kind">笔</span>
                </span>
                <span className="num">{signedYuan(item.kind, displayCents(item))}</span>
              </button>
            ))}
            {rosterCredits.map((marker) => (
              <button
                key={`roster-credit-${marker.id}`}
                type="button"
                data-roster={`credit-${marker.id}`}
                className={
                  selection?.kind === "credit" && selection.id === marker.id
                    ? "entries-r-item is-on"
                    : "entries-r-item"
                }
                onClick={() => selectRow("credit", marker.id)}
              >
                <span>
                  {marker.creditor}
                  <span className="entries-kind">贷</span>
                </span>
                <span className="num">
                  {`剩 ${formatYuanFromCents(creditRemainingCents(items, marker.id, activeRoster))}`}
                </span>
              </button>
            ))}
          </div>
        </aside>
      <div className="entries-paper-shell" aria-label="编辑纸">
      {selection?.kind === "once" && selectedOnce ? (
        <OncePaper
          key={selectedOnce.id}
          item={selectedOnce}
          draft={false}
          defaultMonth={onceMonth}
          onSaved={reload}
          onError={setError}
          onCreated={() => {}}
          onDeleted={() => {
            setSelection(null);
            reload();
          }}
        />
      ) : null}
      {selection?.kind === "flow" && selectedFlow ? (
        <FlowPaper
          key={selectedFlow.id}
          rule={selectedFlow}
          items={items}
          draft={false}
          defaultStart={from}
          onSaved={reload}
          onError={setError}
          onCreated={() => {}}
          onAskDelete={(rule) => void openDelete(rule)}
        />
      ) : null}
      {selection?.kind === "credit" && selectedCredit ? (
        <CreditPaper
          key={selectedCredit.id}
          marker={selectedCredit}
          items={items}
          draft={false}
          defaultOccurDate={occurDate}
          onSaved={reload}
          onError={setError}
          onCreated={() => {}}
          onDeleted={() => {
            setSelection(null);
            reload();
          }}
        />
      ) : null}
      {selection?.kind === "draft" && selection.draft === "once" ? (
        <OncePaper
          item={null}
          draft
          defaultMonth={onceMonth}
          onSaved={reload}
          onError={setError}
          onCreated={(id) => {
            setSelection({ kind: "once", id });
            reload();
          }}
          onDeleted={() => setSelection(null)}
        />
      ) : null}
      {selection?.kind === "draft" && selection.draft === "flow" ? (
        <FlowPaper
          rule={null}
          items={items}
          draft
          defaultStart={from}
          onSaved={reload}
          onError={setError}
          onCreated={(id) => {
            setSelection({ kind: "flow", id });
            reload();
          }}
          onAskDelete={() => {}}
        />
      ) : null}
      {selection?.kind === "draft" && selection.draft === "credit" ? (
        <CreditPaper
          marker={null}
          items={items}
          draft
          defaultOccurDate={occurDate}
          onSaved={reload}
          onError={setError}
          onCreated={() => {
            void window.ledgerApi.listCredits().then((next) => {
              const created = next.find((row) => !markers.some((old) => old.id === row.id));
              if (created) setSelection({ kind: "credit", id: created.id });
            });
            reload();
          }}
          onDeleted={() => setSelection(null)}
        />
      ) : null}
      {selection == null ||
      (selection.kind === "once" && !selectedOnce) ||
      (selection.kind === "flow" && !selectedFlow) ||
      (selection.kind === "credit" && !selectedCredit) ? (
        <p className="entries-paper__idle">点一条来改</p>
      ) : null}
      </div>
      </div>
      ) : null}
      </div>
      </div>
      {deleting ? (
        <div className="rules-page__overlay">
          <DeleteRuleDialog
            ruleName={deleting.rule.name}
            months={deleting.months}
            onCancel={() => setDeleting(null)}
            onConfirm={(keepMonths) => void confirmDelete(keepMonths)}
          />
        </div>
      ) : null}
    </div>
  );
}
