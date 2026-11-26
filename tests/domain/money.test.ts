import { describe, expect, it } from "vitest";
import { centsToYuan, formatYuanFromCents, yuanToCents } from "../../src/domain/money";

describe("money", () => {
  it("converts yuan to integer cents", () => {
    expect(yuanToCents(4300)).toBe(430000);
    expect(yuanToCents(8.7)).toBe(870);
  });

  it("formats cents with grouping", () => {
    expect(centsToYuan(870000)).toBe(8700);
    expect(formatYuanFromCents(1020000)).toBe("10,200");
  });
});
