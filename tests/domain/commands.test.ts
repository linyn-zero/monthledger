import { describe, expect, it } from "vitest";
import {
  addLargeEntry,
  addPendingLine,
  applyDeleteRule,
  confirmItem,
  addRepayment,
  createCredit,
  deleteCredit,
  generateRuleLines,
  mergeHold,
  overrideExpectedDate,
  overrideItemName,
  overridePlannedAmount,
  unconfirmItem
} from "../../src/domain/commands";
import { buildOverview } from "../../src/domain/formulas";
import { yuanToCents } from "../../src/domain/money";
import type { HoldItem, LedgerMeta, LineItem, RecurringRule } from "../../src/domain/types";

const meta: LedgerMeta = {
  startMonth: "2026-09",
  openingCashCents: yuanToCents(4300),
  openingDebtCents: 0,
  largeThresholdCents: yuanToCents(500),
  notifyEnabled: true
};

it("uses typed actual amount not planned amount", () => {
  const lab: LineItem = {
    id: "lab",
    month: "2026-09",
    name: "实验室工资",
    kind: "income",
    plannedCents: yuanToCents(4000),
    actualCents: null,
    expectedDate: "2026-09-30",
    status: "pending",
    source: "manual",
    ruleId: null,
    holdId: null,
    userOverridden: false
  };
  const confirmed = confirmItem(lab, yuanToCents(3800));
  expect(confirmed.status).toBe("confirmed");
  expect(confirmed.actualCents).toBe(yuanToCents(3800));
  const [sep] = buildOverview(meta, [confirmed], "2026-09", 1);
  expect(sep.closingCents).toBe(yuanToCents(4300 + 3800));
});

it("unconfirm clears actual and returns to planned", () => {
  const lab: LineItem = {
    id: "lab",
    month: "2026-09",
    name: "实验室工资",
    kind: "income",
    plannedCents: yuanToCents(4000),
    actualCents: yuanToCents(3800),
    expectedDate: null,
    status: "confirmed",
    source: "manual",
    ruleId: null,
    holdId: null,
    userOverridden: false
  };
  const pending = unconfirmItem(lab);
  expect(pending.status).toBe("pending");
  expect(pending.actualCents).toBeNull();
});

it("merging a hold creates a month line and stops excluding it", () => {
  const hold: HoldItem = {
    id: "h1",
    name: "出差报销",
    kind: "income",
    amountCents: yuanToCents(3000),
    note: "",
    mergedIntoMonth: null
  };
  const { hold: merged, item } = mergeHold(hold, "2026-09", "line-h1");
  expect(merged.mergedIntoMonth).toBe("2026-09");
  expect(item.month).toBe("2026-09");
  expect(item.source).toBe("hold");
  expect(item.holdId).toBe("h1");
  expect(item.status).toBe("pending");
  const [sep] = buildOverview(meta, [item], "2026-09", 1);
  expect(sep.closingCents).toBe(yuanToCents(4300 + 3000));
});

it("does not overwrite confirmed or user-overridden rule lines", () => {
  const rule: RecurringRule = {
    id: "lab",
    name: "实验室工资",
    kind: "income",
    amountCents: yuanToCents(2000),
    schedule: { type: "month_end" },
    startMonth: "2026-10",
    endMonth: null,
    enabled: true
  };
  const existing: LineItem[] = [
    {
      id: "exist",
      month: "2026-10",
      name: "实验室工资",
      kind: "income",
      plannedCents: yuanToCents(2000),
      actualCents: yuanToCents(2000),
      expectedDate: "2026-10-31",
      status: "confirmed",
      source: "rule",
      ruleId: "lab",
      holdId: null,
      userOverridden: false
    }
  ];
  const created = generateRuleLines(rule, existing, "2026-12", () => "n" + Math.random());
  expect(created.some((l) => l.month === "2026-10")).toBe(false);
  expect(created.some((l) => l.month === "2026-11")).toBe(true);
  expect(created.find((l) => l.month === "2026-11")?.expectedDate).toBe("2026-11-30");
});

it("keeps confirmed lines even when month is not selected", () => {
  const items: LineItem[] = [
    {
      id: "c",
      month: "2026-10",
      name: "实验室工资",
      kind: "income",
      plannedCents: yuanToCents(2000),
      actualCents: yuanToCents(2000),
      expectedDate: "2026-10-31",
      status: "confirmed",
      source: "rule",
      ruleId: "lab",
      holdId: null,
      userOverridden: false
    },
    {
      id: "p",
      month: "2026-11",
      name: "实验室工资",
      kind: "income",
      plannedCents: yuanToCents(2000),
      actualCents: null,
      expectedDate: "2026-11-30",
      status: "pending",
      source: "rule",
      ruleId: "lab",
      holdId: null,
      userOverridden: false
    }
  ];
  const next = applyDeleteRule("lab", items, []);
  expect(next).toHaveLength(1);
  expect(next[0].id).toBe("c");
  expect(next[0].ruleId).toBeNull();
  expect(next[0].source).toBe("manual");
});

it("addLargeEntry defaults to confirmed", () => {
  const result = addLargeEntry(
    {
      id: "n",
      name: "旅行",
      kind: "expense",
      amountCents: yuanToCents(2000),
      month: "2026-10",
      expectedDate: null
    },
    yuanToCents(500),
    []
  );
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.item.status).toBe("confirmed");
    expect(result.item.actualCents).toBe(yuanToCents(2000));
  }
});

it("addLargeEntry with settled false is pending", () => {
  const result = addLargeEntry(
    {
      id: "n",
      name: "旅行",
      kind: "expense",
      amountCents: yuanToCents(2000),
      month: "2026-10",
      expectedDate: null,
      settled: false
    },
    yuanToCents(500),
    []
  );
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.item.status).toBe("pending");
    expect(result.item.actualCents).toBeNull();
    expect(result.item.plannedCents).toBe(yuanToCents(2000));
  }
});

it("overrideExpectedDate sets date and userOverridden", () => {
  const item: LineItem = {
    id: "rent",
    month: "2026-09",
    name: "房租",
    kind: "expense",
    plannedCents: yuanToCents(1500),
    actualCents: null,
    expectedDate: "2026-09-05",
    status: "pending",
    source: "rule",
    ruleId: "rule-rent",
    holdId: null,
    userOverridden: false
  };
  const next = overrideExpectedDate(item, "2026-09-12");
  expect(next.expectedDate).toBe("2026-09-12");
  expect(next.userOverridden).toBe(true);
  expect(item.userOverridden).toBe(false);
});

it("overridePlannedAmount only this line and marks userOverridden", () => {
  const item: LineItem = {
    id: "rent",
    month: "2026-09",
    name: "房租",
    kind: "expense",
    plannedCents: yuanToCents(1500),
    actualCents: null,
    expectedDate: "2026-09-05",
    status: "pending",
    source: "rule",
    ruleId: "rule-rent",
    holdId: null,
    userOverridden: false
  };
  const next = overridePlannedAmount(item, yuanToCents(2000));
  expect(next.plannedCents).toBe(yuanToCents(2000));
  expect(next.userOverridden).toBe(true);
  expect(next.ruleId).toBe("rule-rent");
  expect(next.source).toBe("rule");
  expect(item.plannedCents).toBe(yuanToCents(1500));
  expect(item.userOverridden).toBe(false);
});

it("overrideItemName only this line and marks userOverridden", () => {
  const item: LineItem = {
    id: "rent",
    month: "2026-09",
    name: "房租",
    kind: "expense",
    plannedCents: yuanToCents(1500),
    actualCents: null,
    expectedDate: "2026-09-05",
    status: "pending",
    source: "rule",
    ruleId: "rule-rent",
    holdId: null,
    userOverridden: false
  };
  const next = overrideItemName(item, "合租房租");
  expect(next.name).toBe("合租房租");
  expect(next.userOverridden).toBe(true);
  expect(next.ruleId).toBe("rule-rent");
  expect(item.name).toBe("房租");
});

it("overridePlannedAmount on confirmed line also updates actualCents", () => {
  const item: LineItem = {
    id: "lab",
    month: "2026-09",
    name: "实验室工资",
    kind: "income",
    plannedCents: yuanToCents(4000),
    actualCents: yuanToCents(4000),
    expectedDate: "2026-09-30",
    status: "confirmed",
    source: "manual",
    ruleId: null,
    holdId: null,
    userOverridden: false
  };
  const next = overridePlannedAmount(item, yuanToCents(3500));
  expect(next.status).toBe("confirmed");
  expect(next.plannedCents).toBe(yuanToCents(3500));
  expect(next.actualCents).toBe(yuanToCents(3500));
  expect(next.userOverridden).toBe(true);
});

it("addPendingLine creates a pending manual row", () => {
  const line = addPendingLine({
    id: "trip",
    month: "2026-09",
    name: "旅行",
    kind: "expense",
    amountCents: yuanToCents(2000),
    expectedDate: "2026-09-20"
  });
  expect(line.status).toBe("pending");
  expect(line.actualCents).toBeNull();
  expect(line.source).toBe("manual");
  expect(line.plannedCents).toBe(yuanToCents(2000));
});

it("rejects large entry below threshold", () => {
  const result = addLargeEntry(
    { id: "x", name: "零食", kind: "expense", amountCents: yuanToCents(20), month: "2026-09", expectedDate: null },
    yuanToCents(500),
    []
  );
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toBe("大额须 ≥ 500 元");
});

it("flags matching pending plan line", () => {
  const pending: LineItem = {
    id: "rent",
    month: "2026-09",
    name: "房租",
    kind: "expense",
    plannedCents: yuanToCents(1500),
    actualCents: null,
    expectedDate: "2026-09-05",
    status: "pending",
    source: "rule",
    ruleId: "rent",
    holdId: null,
    userOverridden: false
  };
  const result = addLargeEntry(
    { id: "n", name: "房租", kind: "expense", amountCents: yuanToCents(1500), month: "2026-09", expectedDate: "2026-09-05" },
    yuanToCents(500),
    [pending]
  );
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.matchingPending?.id).toBe("rent");
});

it("createCredit writes one pending income line", () => {
  const { marker, item } = createCredit({
    creditId: "c1",
    lineId: "l1",
    creditor: "张三",
    occurDate: "2026-11-03",
    principalCents: 500_000
  });
  expect(marker).toEqual({ id: "c1", creditor: "张三", direction: "borrow" });
  expect(item).toMatchObject({
    month: "2026-11",
    name: "张三",
    kind: "income",
    creditRole: "loan_in",
    plannedCents: 500_000,
    status: "pending",
    expectedDate: "2026-11-03"
  });
});

it("createCredit lend writes a pending expense principal", () => {
  const { marker, item } = createCredit({
    creditId: "c2",
    lineId: "l2",
    creditor: "同事",
    occurDate: "2026-11-03",
    principalCents: 200_000,
    direction: "lend"
  });
  expect(marker.direction).toBe("lend");
  expect(item.kind).toBe("expense");
  expect(item.creditRole).toBe("loan_in");
});

it("addRepayment on a lend credit is income", () => {
  const item = addRepayment({
    id: "r1",
    creditId: "c2",
    creditor: "同事",
    expectedDate: "2026-12-01",
    amountCents: 50_000,
    direction: "lend"
  });
  expect(item.kind).toBe("income");
  expect(item.creditRole).toBe("loan_repay");
});

it("deleteCredit keeps confirmed lines as ordinary income or expense", () => {
  const kept: LineItem = {
    id: "loan",
    month: "2026-09",
    name: "爸妈",
    kind: "income",
    plannedCents: 100,
    actualCents: 100,
    expectedDate: "2026-09-01",
    status: "confirmed",
    source: "manual",
    ruleId: null,
    holdId: null,
    userOverridden: false,
    creditId: "c1",
    creditRole: "loan_in",
    spreadDaily: null
  };
  const pendingRepay: LineItem = {
    ...kept,
    id: "r1",
    month: "2026-11",
    kind: "expense",
    actualCents: null,
    status: "pending",
    creditRole: "loan_repay"
  };
  const left = deleteCredit("c1", [kept, pendingRepay]);
  expect(left.map((line) => line.id)).toEqual(["loan"]);
  expect(left[0].creditId).toBeNull();
  expect(left[0].creditRole).toBeNull();
  expect(left[0].kind).toBe("income");
});
