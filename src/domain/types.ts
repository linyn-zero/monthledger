export type YearMonth = string;
export type Kind = "income" | "expense" | "debt_repay";
export type CreditRole = "loan_in" | "loan_repay";
export type CreditDirection = "borrow" | "lend";
export type Status = "pending" | "confirmed";
export type Source = "rule" | "manual" | "hold" | "adjust";
export type Schedule =
  | { type: "day_of_month"; day: number }
  | { type: "month_end" }
  | { type: "unknown_day" };

export type LedgerMeta = {
  startMonth: YearMonth;
  openingCashCents: number;
  openingDebtCents: number;
  largeThresholdCents: number;
  notifyEnabled: boolean;
  /** Kept writes in the undo stack. Default 40; settings clamp 10–200. */
  undoLimit?: number;
};

export type RecurringRule = {
  id: string;
  name: string;
  kind: Kind;
  amountCents: number;
  schedule: Schedule;
  startMonth: YearMonth;
  endMonth: YearMonth | null;
  enabled: boolean;
  spreadDaily: boolean;
};

export type CreditMarker = {
  id: string;
  creditor: string;
  direction: CreditDirection;
};

export type LineItem = {
  id: string;
  month: YearMonth | null;
  name: string;
  kind: Kind;
  plannedCents: number;
  actualCents: number | null;
  expectedDate: string | null;
  status: Status;
  source: Source;
  ruleId: string | null;
  holdId: string | null;
  userOverridden: boolean;
  creditId: string | null;
  creditRole: CreditRole | null;
  /** null means follow the cashflow rule default. */
  spreadDaily: boolean | null;
};

export type HoldItem = {
  id: string;
  name: string;
  kind: Kind;
  amountCents: number;
  note: string;
  mergedIntoMonth: YearMonth | null;
};

/** Month row for selective rule delete dialog. */
export type RuleDeleteMonth = {
  month: YearMonth;
  confirmed: boolean;
  amountCents: number;
};
