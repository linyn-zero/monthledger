import { describe, expect, it } from "vitest";
import {
  cashflowsInRange,
  creditsInRange,
  onceInRange
} from "../../src/domain/entriesRange";
import type { CreditMarker, LineItem, RecurringRule } from "../../src/domain/types";

function line(partial: Partial<LineItem> & Pick<LineItem, "id" | "name" | "month">): LineItem {
  return {
    kind: "expense",
    plannedCents: 100,
    actualCents: null,
    expectedDate: null,
    status: "pending",
    source: "manual",
    ruleId: null,
    holdId: null,
    userOverridden: true,
    creditId: null,
    creditRole: null,
    spreadDaily: null,
    ...partial
  };
}

describe("entriesRange", () => {
  it("lists one-off lines whose month falls inside the span", () => {
    const items = [
      line({ id: "a", name: "显示器", month: "2026-10" }),
      line({ id: "b", name: "年终", month: "2026-12" }),
      line({ id: "c", name: "过期", month: "2026-08" })
    ];
    expect(onceInRange(items, "2026-09", "2026-11").map((row) => row.id)).toEqual(["a"]);
  });

  it("lists cashflows whose start/end overlap the span", () => {
    const rules: RecurringRule[] = [
      {
        id: "rent",
        name: "房租",
        kind: "expense",
        amountCents: 1,
        schedule: { type: "day_of_month", day: 1 },
        startMonth: "2026-09",
        endMonth: null,
        enabled: true,
        spreadDaily: false
      },
      {
        id: "old",
        name: "旧租",
        kind: "expense",
        amountCents: 1,
        schedule: { type: "day_of_month", day: 1 },
        startMonth: "2025-01",
        endMonth: "2026-08",
        enabled: true,
        spreadDaily: false
      }
    ];
    expect(cashflowsInRange(rules, "2026-09", "2027-08").map((row) => row.id)).toEqual(["rent"]);
  });

  it("lists credits visible in any month of the span", () => {
    const markers: CreditMarker[] = [
      { id: "c1", creditor: "爸妈", direction: "borrow" }
    ];
    const items: LineItem[] = [
      line({
        id: "loan",
        name: "爸妈",
        month: "2026-09",
        kind: "income",
        plannedCents: 400000,
        actualCents: 400000,
        status: "confirmed",
        creditId: "c1",
        creditRole: "loan_in"
      }),
      line({
        id: "repay",
        name: "爸妈",
        month: "2026-11",
        plannedCents: 400000,
        actualCents: 400000,
        status: "confirmed",
        creditId: "c1",
        creditRole: "loan_repay"
      })
    ];
    expect(creditsInRange(items, markers, "2026-09", "2026-11").map((row) => row.id)).toEqual([
      "c1"
    ]);
    expect(creditsInRange(items, markers, "2026-12", "2027-08")).toEqual([]);
  });
});
