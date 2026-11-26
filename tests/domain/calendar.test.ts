import { describe, expect, it } from "vitest";
import {
  holdMonthOptions,
  horizonEndMonth,
  monthsInclusive,
  shanghaiYearMonth
} from "../../src/domain/calendar";

describe("horizonEndMonth", () => {
  it("uses Asia/Shanghai month not the UTC Date month", () => {
    const utcEvening = new Date("2026-09-30T16:00:00.000Z");
    expect(horizonEndMonth(utcEvening, 0)).toBe("2026-10");
    expect(horizonEndMonth(utcEvening, 12)).toBe("2027-10");
  });
});

describe("shanghaiYearMonth", () => {
  it("uses Asia/Shanghai calendar month", () => {
    expect(shanghaiYearMonth(new Date("2026-09-30T16:00:00.000Z"))).toBe(
      "2026-10"
    );
  });
});

describe("monthsInclusive", () => {
  it("lists every month from start through end", () => {
    expect(monthsInclusive("2026-09", "2026-11")).toEqual([
      "2026-09",
      "2026-10",
      "2026-11"
    ]);
  });
});

describe("holdMonthOptions", () => {
  it("spans startMonth through horizon even if the 12-col window is later", () => {
    const months = holdMonthOptions("2026-09", "2027-06", "2027-12");
    expect(months[0]).toBe("2026-09");
    expect(months.at(-1)).toBe("2028-06");
    expect(months).toContain("2026-09");
    expect(months).toContain("2028-06");
  });

  it("extends through a window that is past the 12-month horizon", () => {
    const months = holdMonthOptions("2026-09", "2026-09", "2028-03");
    expect(months.at(-1)).toBe("2028-03");
  });
});
