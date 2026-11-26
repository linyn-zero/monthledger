import { adoptOpeningDebt } from "./credit";
import { generateRuleLines } from "./commands";
import { yuanToCents } from "./money";
import type { CreditMarker, HoldItem, LedgerMeta, LineItem, RecurringRule } from "./types";

export type SeedState = {
  meta: LedgerMeta;
  rules: RecurringRule[];
  items: LineItem[];
  holds: HoldItem[];
  markers: CreditMarker[];
};

export function buildSeedState(): SeedState {
  const meta: LedgerMeta = {
    startMonth: "2026-09",
    openingCashCents: 430000,
    openingDebtCents: 400000,
    largeThresholdCents: 50000,
    notifyEnabled: true,
    undoLimit: 40
  };

  const rules: RecurringRule[] = [
    {
      id: "rule-intern",
      name: "实习工资",
      kind: "income",
      amountCents: yuanToCents(6000),
      schedule: { type: "day_of_month", day: 5 },
      startMonth: "2026-10",
      endMonth: null,
      enabled: true,
      spreadDaily: false
    },
    {
      id: "rule-lab",
      name: "实验室工资",
      kind: "income",
      amountCents: yuanToCents(2000),
      schedule: { type: "month_end" },
      startMonth: "2026-10",
      endMonth: null,
      enabled: true,
      spreadDaily: false
    },
    {
      id: "rule-rent",
      name: "房租",
      kind: "expense",
      amountCents: yuanToCents(1500),
      schedule: { type: "day_of_month", day: 5 },
      startMonth: "2026-09",
      endMonth: null,
      enabled: true,
      spreadDaily: false
    },
    {
      id: "rule-living",
      name: "生活费",
      kind: "expense",
      amountCents: yuanToCents(3000),
      schedule: { type: "unknown_day" },
      startMonth: "2026-09",
      endMonth: null,
      enabled: true,
      spreadDaily: false
    }
  ];

  let idSeq = 0;
  const nextId = () => `seed-${++idSeq}`;

  const items: LineItem[] = [];
  for (const rule of rules) {
    items.push(...generateRuleLines(rule, items, "2026-12", nextId));
  }

  items.push(
    {
      id: nextId(),
      month: "2026-09",
      name: "助教费",
      kind: "income",
      plannedCents: yuanToCents(4900),
      actualCents: yuanToCents(4900),
      expectedDate: null,
      status: "confirmed",
      source: "manual",
      ruleId: null,
      holdId: null,
      userOverridden: false,
      creditId: null,
      creditRole: null,
      spreadDaily: null
    },
    {
      id: nextId(),
      month: "2026-09",
      name: "实验室工资",
      kind: "income",
      plannedCents: yuanToCents(4000),
      actualCents: null,
      expectedDate: null,
      status: "pending",
      source: "manual",
      ruleId: null,
      holdId: null,
      userOverridden: false,
      creditId: null,
      creditRole: null,
      spreadDaily: null
    },
    {
      id: nextId(),
      month: "2026-10",
      name: "旅行",
      kind: "expense",
      plannedCents: yuanToCents(2000),
      actualCents: null,
      expectedDate: null,
      status: "pending",
      source: "manual",
      ruleId: null,
      holdId: null,
      userOverridden: false,
      creditId: null,
      creditRole: null,
      spreadDaily: null
    },
    {
      id: nextId(),
      month: "2026-11",
      name: "还款",
      kind: "debt_repay",
      plannedCents: yuanToCents(4000),
      actualCents: null,
      expectedDate: null,
      status: "pending",
      source: "manual",
      ruleId: null,
      holdId: null,
      userOverridden: false,
      creditId: null,
      creditRole: null,
      spreadDaily: null
    }
  );

  const adopted = adoptOpeningDebt({
    meta,
    markers: [],
    items,
    rules,
    newCreditId: "credit-parents",
    newLineId: "loan-parents"
  });

  const holds: HoldItem[] = [
    {
      id: "hold-reimburse",
      name: "出差报销",
      kind: "income",
      amountCents: yuanToCents(3000),
      note: "",
      mergedIntoMonth: null
    },
    {
      id: "hold-scholarship",
      name: "奖学金",
      kind: "income",
      amountCents: yuanToCents(8000),
      note: "还款",
      mergedIntoMonth: null
    }
  ];

  return {
    meta: adopted.meta,
    rules: adopted.rules,
    items: adopted.items,
    holds,
    markers: adopted.markers
  };
}
