import { describe, expect, it } from "vitest";
import {
  buildOverview,
  daysInMonth,
  effectiveSpreadDaily,
  impliedCashCents
} from "../../src/domain/formulas";
import { yuanToCents } from "../../src/domain/money";
import type { LedgerMeta, LineItem } from "../../src/domain/types";

const meta: LedgerMeta = {
  startMonth: "2026-09",
  openingCashCents: yuanToCents(4300),
  openingDebtCents: yuanToCents(4000),
  largeThresholdCents: yuanToCents(500),
  notifyEnabled: true
};

function item(partial: Partial<LineItem> & Pick<LineItem, "id" | "month" | "name" | "kind" | "plannedCents">): LineItem {
  return {
    actualCents: null,
    expectedDate: null,
    status: "pending",
    source: "manual",
    ruleId: null,
    holdId: null,
    userOverridden: false,
    creditId: null,
    creditRole: null,
    spreadDaily: null,
    ...partial
  };
}

describe("buildOverview", () => {
  it("carries closing into next opening and matches seed Sept-Dec closings", () => {
    const items: LineItem[] = [
      item({ id: "1", month: "2026-09", name: "助教费", kind: "income", plannedCents: yuanToCents(4900), status: "confirmed", actualCents: yuanToCents(4900) }),
      item({ id: "2", month: "2026-09", name: "实验室工资", kind: "income", plannedCents: yuanToCents(4000) }),
      item({ id: "3", month: "2026-09", name: "生活费", kind: "expense", plannedCents: yuanToCents(3000) }),
      item({ id: "4", month: "2026-09", name: "房租", kind: "expense", plannedCents: yuanToCents(1500) }),
      item({ id: "5", month: "2026-10", name: "实习工资", kind: "income", plannedCents: yuanToCents(6000) }),
      item({ id: "6", month: "2026-10", name: "实验室工资", kind: "income", plannedCents: yuanToCents(2000) }),
      item({ id: "7", month: "2026-10", name: "生活费", kind: "expense", plannedCents: yuanToCents(3000) }),
      item({ id: "8", month: "2026-10", name: "房租", kind: "expense", plannedCents: yuanToCents(1500) }),
      item({ id: "9", month: "2026-10", name: "旅行", kind: "expense", plannedCents: yuanToCents(2000) }),
      item({ id: "10", month: "2026-11", name: "实习工资", kind: "income", plannedCents: yuanToCents(6000) }),
      item({ id: "11", month: "2026-11", name: "实验室工资", kind: "income", plannedCents: yuanToCents(2000) }),
      item({ id: "12", month: "2026-11", name: "生活费", kind: "expense", plannedCents: yuanToCents(3000) }),
      item({ id: "13", month: "2026-11", name: "房租", kind: "expense", plannedCents: yuanToCents(1500) }),
      item({
        id: "parents",
        month: "2026-09",
        name: "爸妈",
        kind: "income",
        plannedCents: yuanToCents(4000),
        actualCents: yuanToCents(4000),
        status: "confirmed",
        expectedDate: "2026-09-01",
        creditId: "credit-parents",
        creditRole: "loan_in"
      }),
      item({
        id: "14",
        month: "2026-11",
        name: "爸妈",
        kind: "expense",
        plannedCents: yuanToCents(4000),
        creditId: "credit-parents",
        creditRole: "loan_repay"
      }),
      item({ id: "15", month: "2026-12", name: "实习工资", kind: "income", plannedCents: yuanToCents(6000) }),
      item({ id: "16", month: "2026-12", name: "实验室工资", kind: "income", plannedCents: yuanToCents(2000) }),
      item({ id: "17", month: "2026-12", name: "生活费", kind: "expense", plannedCents: yuanToCents(3000) }),
      item({ id: "18", month: "2026-12", name: "房租", kind: "expense", plannedCents: yuanToCents(1500) })
    ];
    const adopted = {
      ...meta,
      openingCashCents: yuanToCents(300),
      openingDebtCents: 0
    };
    const withoutLoan = items.filter((line) => line.creditId == null);
    expect(impliedCashCents(meta, withoutLoan, "2026-09")).toBe(
      impliedCashCents(adopted, items, "2026-09")
    );
    const months = buildOverview(adopted, items, "2026-09", 4);
    expect(months.map((m) => m.closingCents)).toEqual([
      yuanToCents(8700),
      yuanToCents(10200),
      yuanToCents(9700),
      yuanToCents(13200)
    ]);
    expect(months.map((m) => m.debtCents)).toEqual([
      yuanToCents(4000),
      yuanToCents(4000),
      0,
      0
    ]);
    expect(months[1].openingCents).toBe(months[0].closingCents);
  });

  it("throws when fromMonth is before startMonth without hanging", () => {
    expect(() => buildOverview(meta, [], "2026-08", 1)).toThrow(
      /before ledger startMonth/
    );
  });

  it("ignores hold lines with null month", () => {
    const items: LineItem[] = [
      item({ id: "h", month: null, name: "出差报销", kind: "income", plannedCents: yuanToCents(3000), source: "hold" }),
      item({ id: "1", month: "2026-09", name: "助教费", kind: "income", plannedCents: yuanToCents(4900), status: "confirmed", actualCents: yuanToCents(4900) }),
      item({ id: "2", month: "2026-09", name: "实验室工资", kind: "income", plannedCents: yuanToCents(4000) }),
      item({ id: "3", month: "2026-09", name: "生活费", kind: "expense", plannedCents: yuanToCents(3000) }),
      item({ id: "4", month: "2026-09", name: "房租", kind: "expense", plannedCents: yuanToCents(1500) })
    ];
    const [sep] = buildOverview(meta, items, "2026-09", 1);
    expect(sep.closingCents).toBe(yuanToCents(8700));
  });

  it("treats pending undated living expense as day 1 for trough", () => {
    const items: LineItem[] = [
      item({ id: "1", month: "2026-09", name: "助教费", kind: "income", plannedCents: yuanToCents(4900), status: "confirmed", actualCents: yuanToCents(4900) }),
      item({ id: "2", month: "2026-09", name: "实验室工资", kind: "income", plannedCents: yuanToCents(4000), expectedDate: "2026-09-30" }),
      item({ id: "3", month: "2026-09", name: "生活费", kind: "expense", plannedCents: yuanToCents(3000) }),
      item({ id: "4", month: "2026-09", name: "房租", kind: "expense", plannedCents: yuanToCents(1500), expectedDate: "2026-09-05" })
    ];
    const [sep] = buildOverview(meta, items, "2026-09", 1);
    expect(sep.troughCents).toBe(yuanToCents(1300));
    expect(sep.closingCents).toBe(yuanToCents(8700));
  });

  it("reduces debt from loan repayments and clamps at zero", () => {
    const items: LineItem[] = [
      item({
        id: "loan",
        month: "2026-09",
        name: "爸妈",
        kind: "income",
        plannedCents: yuanToCents(4000),
        creditId: "c1",
        creditRole: "loan_in"
      }),
      item({
        id: "r",
        month: "2026-11",
        name: "爸妈",
        kind: "expense",
        plannedCents: yuanToCents(5000),
        creditId: "c1",
        creditRole: "loan_repay"
      })
    ];
    const months = buildOverview(
      { ...meta, openingCashCents: yuanToCents(300), openingDebtCents: 0 },
      items,
      "2026-09",
      4
    );
    expect(months[0].debtCents).toBe(yuanToCents(4000));
    expect(months[1].debtCents).toBe(yuanToCents(4000));
    expect(months[2].debtCents).toBe(0);
    expect(months[3].debtCents).toBe(0);
  });

  it("spreads an expense across the month and puts the remainder on the last day", () => {
    expect(daysInMonth("2026-09")).toBe(30);
    expect(
      effectiveSpreadDaily(
        item({
          id: "x",
          month: "2026-09",
          name: "房租",
          kind: "expense",
          plannedCents: 1,
          spreadDaily: null,
          ruleId: "r"
        }),
        {
          id: "r",
          name: "房租",
          kind: "expense",
          amountCents: 1,
          schedule: { type: "day_of_month", day: 1 },
          startMonth: "2026-09",
          endMonth: null,
          enabled: true,
          spreadDaily: true
        }
      )
    ).toBe(true);
    const items = [
      item({
        id: "rent",
        month: "2026-09",
        name: "房租",
        kind: "expense",
        plannedCents: 100,
        spreadDaily: true,
        expectedDate: "2026-09-05"
      }),
      item({
        id: "bonus",
        month: "2026-09",
        name: "补贴",
        kind: "income",
        plannedCents: 100,
        expectedDate: "2026-09-15"
      })
    ];
    const [sep] = buildOverview(
      { ...meta, openingCashCents: 1000, openingDebtCents: 0 },
      items,
      "2026-09",
      1
    );
    expect(sep.closingCents).toBe(1000);
    expect(sep.troughCents).toBe(955);
  });
});

describe("impliedCashCents", () => {
  it("is opening plus confirmed signed amounts up to today month", () => {
    const items: LineItem[] = [
      item({
        id: "1",
        month: "2026-09",
        name: "助教费",
        kind: "income",
        plannedCents: yuanToCents(4900),
        status: "confirmed",
        actualCents: yuanToCents(4900)
      }),
      item({
        id: "2",
        month: "2026-09",
        name: "房租",
        kind: "expense",
        plannedCents: yuanToCents(1500)
      }),
      item({
        id: "3",
        month: "2026-10",
        name: "实习工资",
        kind: "income",
        plannedCents: yuanToCents(6000),
        status: "confirmed",
        actualCents: yuanToCents(6000)
      })
    ];
    expect(impliedCashCents(meta, items, "2026-09")).toBe(yuanToCents(9200));
  });

  it("puts lend remaining in receivable, not debt", () => {
    const items: LineItem[] = [
      item({
        id: "loan",
        month: "2026-09",
        name: "同事",
        kind: "expense",
        plannedCents: yuanToCents(2000),
        creditId: "c-lend",
        creditRole: "loan_in"
      }),
      item({
        id: "r",
        month: "2026-10",
        name: "同事",
        kind: "income",
        plannedCents: yuanToCents(500),
        creditId: "c-lend",
        creditRole: "loan_repay"
      })
    ];
    const months = buildOverview(
      { ...meta, openingDebtCents: 0 },
      items,
      "2026-09",
      2,
      [],
      [{ id: "c-lend", creditor: "同事", direction: "lend" }]
    );
    expect(months[0].debtCents).toBe(0);
    expect(months[0].receivableCents).toBe(yuanToCents(2000));
    expect(months[1].debtCents).toBe(0);
    expect(months[1].receivableCents).toBe(yuanToCents(1500));
  });

  it("counts a lend recovery as income even if the stored kind is expense", () => {
    const items: LineItem[] = [
      item({
        id: "loan",
        month: "2026-09",
        name: "同事",
        kind: "expense",
        plannedCents: yuanToCents(2000),
        creditId: "c-lend",
        creditRole: "loan_in"
      }),
      item({
        id: "r",
        month: "2026-10",
        name: "同事",
        kind: "expense",
        plannedCents: yuanToCents(500),
        creditId: "c-lend",
        creditRole: "loan_repay"
      })
    ];
    const markers = [{ id: "c-lend", creditor: "同事", direction: "lend" as const }];
    const months = buildOverview(
      { ...meta, openingDebtCents: 0 },
      items,
      "2026-09",
      2,
      [],
      markers
    );
    expect(months[1].items.find((row) => row.id === "r")?.kind).toBe("income");
    expect(months[1].closingCents).toBe(months[0].closingCents + yuanToCents(500));
  });
});
