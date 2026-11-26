import { describe, expect, it } from "vitest";
import { addMonths } from "../../src/domain/calendar";
import {
  exportLedgerCsv,
  exportMonthWindow
} from "../../src/domain/exportCsv";
import { buildOverview } from "../../src/domain/formulas";
import type {
  HoldItem,
  LedgerMeta,
  LineItem,
  RecurringRule
} from "../../src/domain/types";

const meta: LedgerMeta = {
  startMonth: "2026-09",
  openingCashCents: 430000,
  openingDebtCents: 400000,
  largeThresholdCents: 50000,
  notifyEnabled: true
};

const items: LineItem[] = [
  {
    id: "i1",
    month: "2026-09",
    name: "实验室工资",
    kind: "income",
    plannedCents: 400000,
    actualCents: null,
    expectedDate: "2026-09-30",
    status: "pending",
    source: "manual",
    ruleId: null,
    holdId: null,
    userOverridden: false
  },
  {
    id: "i2",
    month: "2026-09",
    name: "房租,市区",
    kind: "expense",
    plannedCents: 150000,
    actualCents: null,
    expectedDate: "2026-09-05",
    status: "pending",
    source: "rule",
    ruleId: "rule-rent",
    holdId: null,
    userOverridden: false
  }
];

const holds: HoldItem[] = [
  {
    id: "h1",
    name: "出差报销",
    kind: "income",
    amountCents: 300000,
    note: "备注,含逗号",
    mergedIntoMonth: null
  }
];

const rules: RecurringRule[] = [
  {
    id: "rule-rent",
    name: "房租",
    kind: "expense",
    amountCents: 150000,
    schedule: { type: "day_of_month", day: 5 },
    startMonth: "2026-09",
    endMonth: null,
    enabled: true
  }
];

describe("exportLedgerCsv", () => {
  it("overview csv starts with BOM and header", () => {
    const months = buildOverview(meta, items, "2026-09", 12);
    const csv = exportLedgerCsv(meta, months, items, holds, rules);
    expect(csv.overview.startsWith("\uFEFF")).toBe(true);
    expect(csv.overview).toContain("月份,月初,月底预计,月内最低,负债,应收");
  });

  it("puts BOM on every csv and writes amounts in yuan not cents", () => {
    const months = buildOverview(meta, items, "2026-09", 1);
    const csv = exportLedgerCsv(meta, months, items, holds, rules);
    expect(csv.items.startsWith("\uFEFF")).toBe(true);
    expect(csv.holds.startsWith("\uFEFF")).toBe(true);
    expect(csv.rules.startsWith("\uFEFF")).toBe(true);
    expect(csv.overview).toContain("2026-09,4300,");
    expect(csv.overview).not.toContain("430000");
    expect(csv.items).toContain("4000");
    expect(csv.items).not.toContain("400000");
    expect(csv.holds).toContain("3000");
    expect(csv.rules).toContain("1500");
  });

  it("escapes fields that contain commas or quotes", () => {
    const months = buildOverview(meta, items, "2026-09", 1);
    const csv = exportLedgerCsv(meta, months, items, holds, rules);
    expect(csv.items).toContain('"房租,市区"');
    expect(csv.holds).toContain('"备注,含逗号"');
  });
});

describe("exportMonthWindow", () => {
  it("spans startMonth through max(latest item month, start+11)", () => {
    const short = exportMonthWindow(meta, items);
    expect(short.fromMonth).toBe("2026-09");
    expect(short.monthCount).toBe(12);
    expect(addMonths(short.fromMonth, short.monthCount - 1)).toBe("2027-08");

    const farItems: LineItem[] = [
      ...items,
      { ...items[0], id: "far", month: "2028-01" }
    ];
    const far = exportMonthWindow(meta, farItems);
    expect(far.fromMonth).toBe("2026-09");
    expect(addMonths(far.fromMonth, far.monthCount - 1)).toBe("2028-01");
  });
});
