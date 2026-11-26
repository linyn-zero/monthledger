import { describe, expect, it } from "vitest";
import {
  adoptOpeningDebt,
  applyCreditDirection,
  creditRemainingCents,
  creditVisibleInMonth,
  payoffRepaymentId
} from "../../src/domain/credit";
import type { LineItem } from "../../src/domain/types";

function line(
  partial: Partial<LineItem> & Pick<LineItem, "id" | "month" | "name" | "kind" | "plannedCents">
): LineItem {
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

function loanIn(creditId: string, month: string, cents: number): LineItem {
  return line({
    id: `loan-${creditId}`,
    month,
    name: "债",
    kind: "income",
    plannedCents: cents,
    expectedDate: `${month}-01`,
    creditId,
    creditRole: "loan_in"
  });
}

function repay(
  creditId: string,
  id: string,
  month: string,
  cents: number,
  status: "pending" | "confirmed"
): LineItem {
  return line({
    id,
    month,
    name: "还",
    kind: "expense",
    plannedCents: cents,
    actualCents: status === "confirmed" ? cents : null,
    expectedDate: `${month}-15`,
    status,
    creditId,
    creditRole: "loan_repay"
  });
}

describe("credit", () => {
  it("remaining subtracts repayments through that month and floors at 0", () => {
    const items = [
      loanIn("c1", "2026-09", 10_000_00),
      repay("c1", "r1", "2026-11", 4_000_00, "pending"),
      repay("c1", "r2", "2026-12", 8_000_00, "pending")
    ];
    expect(creditRemainingCents(items, "c1", "2026-10")).toBe(10_000_00);
    expect(creditRemainingCents(items, "c1", "2026-11")).toBe(6_000_00);
    expect(creditRemainingCents(items, "c1", "2026-12")).toBe(0);
  });

  it("shows a credit in the payoff month and hides it the next month", () => {
    const items = [
      loanIn("c1", "2026-08", 3_000_00),
      repay("c1", "r1", "2026-11", 3_000_00, "pending")
    ];
    expect(creditVisibleInMonth(items, "c1", "2026-11")).toBe(true);
    expect(creditVisibleInMonth(items, "c1", "2026-12")).toBe(false);
  });

  it("puts the congratulation only on the confirmed repayment that reaches zero", () => {
    const items = [
      loanIn("c1", "2026-08", 3_000_00),
      repay("c1", "r1", "2026-11", 3_000_00, "pending")
    ];
    expect(payoffRepaymentId(items, "c1", "2026-11")).toBeNull();
    items[1] = { ...items[1], status: "confirmed", actualCents: 3_000_00 };
    expect(payoffRepaymentId(items, "c1", "2026-11")).toBe("r1");
  });

  it("adopts opening debt as 爸妈 and subtracts principal from opening cash once", () => {
    const meta = {
      startMonth: "2026-09",
      openingCashCents: 430_000,
      openingDebtCents: 400_000,
      largeThresholdCents: 50_000,
      notifyEnabled: true
    };
    const oldRepay: LineItem = {
      id: "old",
      month: "2026-11",
      name: "还款",
      kind: "debt_repay",
      plannedCents: 400_000,
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
    };
    const first = adoptOpeningDebt({
      meta,
      markers: [],
      items: [oldRepay],
      rules: [],
      newCreditId: "credit-parents",
      newLineId: "loan-parents"
    });
    expect(first.meta.openingCashCents).toBe(30_000);
    expect(first.meta.openingDebtCents).toBe(0);
    expect(first.markers).toEqual([
      { id: "credit-parents", creditor: "爸妈", direction: "borrow" }
    ]);
    const loan = first.items.find((row) => row.creditRole === "loan_in");
    expect(loan).toMatchObject({
      name: "爸妈",
      kind: "income",
      month: "2026-09",
      expectedDate: "2026-09-01",
      plannedCents: 400_000,
      actualCents: 400_000,
      status: "confirmed"
    });
    expect(first.items.find((row) => row.id === "old")).toMatchObject({
      kind: "expense",
      creditId: "credit-parents",
      creditRole: "loan_repay",
      name: "爸妈"
    });
    const second = adoptOpeningDebt({
      ...first,
      newCreditId: "again",
      newLineId: "again-line"
    });
    expect(second.meta.openingCashCents).toBe(30_000);
    expect(second.markers).toHaveLength(1);
  });

  it("flips principal and repayment kinds when direction becomes lend", () => {
    const items = [
      loanIn("c1", "2026-09", 10_000_00),
      repay("c1", "r1", "2026-11", 4_000_00, "pending")
    ];
    const flipped = applyCreditDirection(items, "c1", "lend");
    expect(flipped[0].kind).toBe("expense");
    expect(flipped[1].kind).toBe("income");
  });
});
