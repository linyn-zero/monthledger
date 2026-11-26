import { describe, expect, it } from "vitest";
import { cashflowExceptionMonths } from "../../src/domain/cashflowMonth";
import type { LineItem, RecurringRule } from "../../src/domain/types";

const rule: RecurringRule = {
  id: "rent",
  name: "房租",
  kind: "expense",
  amountCents: 150_000,
  schedule: { type: "day_of_month", day: 5 },
  startMonth: "2026-09",
  endMonth: null,
  enabled: true,
  spreadDaily: false
};

function row(
  month: string,
  plannedCents: number,
  actualCents: number | null = null,
  expectedDate: string | null = null
): LineItem {
  return {
    id: month,
    month,
    name: "房租",
    kind: "expense",
    plannedCents,
    actualCents,
    expectedDate,
    status: actualCents == null ? "pending" : "confirmed",
    source: "rule",
    ruleId: "rent",
    holdId: null,
    userOverridden:
      actualCents != null || plannedCents !== 150_000 || expectedDate != null,
    creditId: null,
    creditRole: null,
    spreadDaily: null
  };
}

describe("cashflowExceptionMonths", () => {
  it("lists months whose display amount differs, selected month first", () => {
    const items = [
      row("2026-09", 150_000),
      row("2026-10", 180_000),
      row("2026-11", 150_000, 160_000),
      row("2026-12", 150_000)
    ];
    expect(cashflowExceptionMonths(rule, items, "2026-11")).toEqual([
      "2026-11",
      "2026-10"
    ]);
  });

  it("also lists months whose date differs from the rule schedule", () => {
    const items = [
      row("2026-09", 150_000, null, "2026-09-05"),
      row("2026-10", 150_000, null, "2026-10-12"),
      row("2026-11", 180_000, null, "2026-11-05")
    ];
    expect(cashflowExceptionMonths(rule, items)).toEqual(["2026-10", "2026-11"]);
  });
});
