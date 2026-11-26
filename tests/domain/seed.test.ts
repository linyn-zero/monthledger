import { describe, expect, it } from "vitest";
import { buildOverview } from "../../src/domain/formulas";
import { yuanToCents } from "../../src/domain/money";
import { buildSeedState } from "../../src/domain/seed";

describe("buildSeedState", () => {
  it("seed Q4 closings and debts match the spec table", () => {
    const state = buildSeedState();
    const months = buildOverview(state.meta, state.items, "2026-09", 4);
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
    expect(state.holds).toHaveLength(2);
    expect(state.holds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "出差报销",
          amountCents: yuanToCents(3000)
        }),
        expect.objectContaining({
          name: "奖学金",
          amountCents: yuanToCents(8000),
          note: "还款"
        })
      ])
    );
  });
});
