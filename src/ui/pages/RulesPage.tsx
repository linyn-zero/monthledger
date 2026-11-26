import { useEffect, useMemo, useState } from "react";
import { yuanToCents } from "../../domain/money";
import type { Kind, RecurringRule, Schedule, YearMonth } from "../../domain/types";
import {
  DeleteRuleDialog,
  type DeleteRuleMonthRow
} from "../components/DeleteRuleDialog";

export type RulesPageProps = {
  onBack: () => void;
};

type FormState = {
  id: string | null;
  name: string;
  kind: Kind;
  amountYuan: string;
  scheduleType: Schedule["type"];
  day: string;
  startMonth: string;
  endMonth: string;
  enabled: boolean;
};

const emptyForm = (): FormState => ({
  id: null,
  name: "",
  kind: "expense",
  amountYuan: "",
  scheduleType: "day_of_month",
  day: "1",
  startMonth: "",
  endMonth: "",
  enabled: true
});

function scheduleLabel(schedule: Schedule): string {
  if (schedule.type === "month_end") return "月末";
  if (schedule.type === "unknown_day") return "不定";
  return `每月${schedule.day}号`;
}

function kindLabel(kind: Kind): string {
  if (kind === "income") return "收入";
  if (kind === "debt_repay") return "还债";
  return "支出";
}

function toSchedule(form: FormState): Schedule {
  if (form.scheduleType === "month_end") return { type: "month_end" };
  if (form.scheduleType === "unknown_day") return { type: "unknown_day" };
  return { type: "day_of_month", day: Math.max(1, Math.min(31, Number(form.day) || 1)) };
}

function formFromRule(rule: RecurringRule): FormState {
  return {
    id: rule.id,
    name: rule.name,
    kind: rule.kind,
    amountYuan: String(rule.amountCents / 100),
    scheduleType: rule.schedule.type,
    day: rule.schedule.type === "day_of_month" ? String(rule.schedule.day) : "1",
    startMonth: rule.startMonth,
    endMonth: rule.endMonth ?? "",
    enabled: rule.enabled
  };
}

export function RulesPage({ onBack }: RulesPageProps) {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [deleting, setDeleting] = useState<{
    rule: RecurringRule;
    months: DeleteRuleMonthRow[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await window.ledgerApi.listRules();
        if (!cancelled) {
          setRules(list);
          setError(null);
        }
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
  }, [reloadToken]);

  const editingId = form.id;

  const title = useMemo(
    () => (editingId ? "编辑规则" : "新增规则"),
    [editingId]
  );

  async function save() {
    const name = form.name.trim();
    const amountYuan = Number(form.amountYuan.replace(/,/g, ""));
    if (!name) {
      setError("名称不能为空");
      return;
    }
    if (!Number.isFinite(amountYuan) || amountYuan <= 0) {
      setError("规则金额必须大于 0");
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(form.startMonth)) {
      setError("起始月格式应为 YYYY-MM");
      return;
    }
    if (form.endMonth && !/^\d{4}-\d{2}$/.test(form.endMonth)) {
      setError("结束月格式应为 YYYY-MM");
      return;
    }

    const rule: RecurringRule = {
      id: form.id ?? crypto.randomUUID(),
      name,
      kind: form.kind,
      amountCents: yuanToCents(amountYuan),
      schedule: toSchedule(form),
      startMonth: form.startMonth as YearMonth,
      endMonth: form.endMonth ? (form.endMonth as YearMonth) : null,
      enabled: form.enabled,
      spreadDaily: rules.find((rule) => rule.id === form.id)?.spreadDaily ?? false
    };

    try {
      await window.ledgerApi.saveRule(rule);
      setForm(emptyForm());
      setReloadToken((n) => n + 1);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function openDelete(rule: RecurringRule) {
    try {
      const months = await window.ledgerApi.listRuleDeleteMonths(rule.id);
      setDeleting({ rule, months });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function confirmDelete(keepMonths: string[]) {
    if (!deleting) return;
    try {
      await window.ledgerApi.deleteRule(deleting.rule.id, keepMonths);
      setDeleting(null);
      if (form.id === deleting.rule.id) setForm(emptyForm());
      setReloadToken((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="rules-page">
      <header className="rules-page__top">
        <h1 className="rules-page__brand">收支台账</h1>
        <nav className="rules-page__nav">
          <button type="button" className="nav-link" onClick={onBack}>
            台账
          </button>
          <span className="nav-link is-current" aria-current="page">
            规则
          </span>
        </nav>
      </header>

      {error ? <p className="rules-page__error">{error}</p> : null}

      <section className="rules-page__table-wrap">
        <h2 className="rules-page__heading">固定规则</h2>
        <table className="rules-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>方向</th>
              <th>金额</th>
              <th>日期</th>
              <th>起止月</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td>{rule.name}</td>
                <td>{kindLabel(rule.kind)}</td>
                <td className="rules-table__num">
                  {(rule.amountCents / 100).toLocaleString("zh-CN")}
                </td>
                <td>{scheduleLabel(rule.schedule)}</td>
                <td>
                  {rule.startMonth}
                  {rule.endMonth ? ` ~ ${rule.endMonth}` : " 起"}
                </td>
                <td className="rules-table__actions">
                  <button
                    type="button"
                    onClick={() => setForm(formFromRule(rule))}
                  >
                    编辑
                  </button>
                  <button type="button" onClick={() => void openDelete(rule)}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {rules.length === 0 ? (
              <tr>
                <td colSpan={6} className="rules-table__empty">
                  暂无规则
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="rules-page__form-wrap">
        <h2 className="rules-page__heading">{title}</h2>
        <form
          className="rules-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label>
            名称
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            方向
            <select
              value={form.kind}
              onChange={(e) =>
                setForm({ ...form, kind: e.target.value as Kind })
              }
            >
              <option value="income">收入</option>
              <option value="expense">支出</option>
            </select>
          </label>
          <label>
            金额（元）
            <input
              value={form.amountYuan}
              onChange={(e) => setForm({ ...form, amountYuan: e.target.value })}
              inputMode="decimal"
            />
          </label>
          <label>
            每月日期
            <select
              value={form.scheduleType}
              onChange={(e) =>
                setForm({
                  ...form,
                  scheduleType: e.target.value as Schedule["type"]
                })
              }
            >
              <option value="day_of_month">每月几号</option>
              <option value="month_end">月末</option>
              <option value="unknown_day">不定</option>
            </select>
          </label>
          {form.scheduleType === "day_of_month" ? (
            <label>
              几号
              <input
                value={form.day}
                onChange={(e) => setForm({ ...form, day: e.target.value })}
                inputMode="numeric"
              />
            </label>
          ) : null}
          <label>
            起始月
            <input
              value={form.startMonth}
              onChange={(e) => setForm({ ...form, startMonth: e.target.value })}
              placeholder="YYYY-MM"
            />
          </label>
          <label>
            结束月（可空）
            <input
              value={form.endMonth}
              onChange={(e) => setForm({ ...form, endMonth: e.target.value })}
              placeholder="YYYY-MM"
            />
          </label>
          <label className="rules-form__check">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            启用
          </label>
          <div className="rules-form__actions">
            <button type="submit">保存</button>
            {form.id ? (
              <button
                type="button"
                onClick={() => setForm(emptyForm())}
              >
                取消编辑
              </button>
            ) : null}
          </div>
        </form>
      </section>

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
