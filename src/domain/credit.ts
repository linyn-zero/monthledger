import { addMonths, compareYearMonth } from "./calendar";
import type {
  CreditDirection,
  CreditMarker,
  CreditRole,
  Kind,
  LedgerMeta,
  LineItem,
  RecurringRule,
  YearMonth
} from "./types";

export function creditDirectionOf(
  marker: Pick<CreditMarker, "direction"> | undefined
): CreditDirection {
  return marker?.direction === "lend" ? "lend" : "borrow";
}

export function creditLineKind(
  direction: CreditDirection,
  role: CreditRole
): Kind {
  const inflow =
    direction === "borrow" ? role === "loan_in" : role === "loan_repay";
  return inflow ? "income" : "expense";
}

export function applyCreditDirection(
  items: LineItem[],
  creditId: string,
  direction: CreditDirection
): LineItem[] {
  return items.map((item) => {
    if (item.creditId !== creditId || item.creditRole == null) return item;
    return { ...item, kind: creditLineKind(direction, item.creditRole) };
  });
}

export function applyAllCreditDirections(
  items: LineItem[],
  markers: CreditMarker[]
): LineItem[] {
  let next = items;
  for (const marker of markers) {
    next = applyCreditDirection(next, marker.id, creditDirectionOf(marker));
  }
  return next;
}

export function partyEmptyError(direction: CreditDirection): string {
  return direction === "lend" ? "借款人不能为空" : "债权方不能为空";
}

function displayCents(item: LineItem): number {
  if (item.status === "confirmed" && item.actualCents !== null) {
    return item.actualCents;
  }
  return item.plannedCents;
}

function loanInLine(items: LineItem[], creditId: string): LineItem | undefined {
  return items.find(
    (line) => line.creditId === creditId && line.creditRole === "loan_in"
  );
}

export function creditRemainingCents(
  items: LineItem[],
  creditId: string,
  throughMonth: YearMonth
): number {
  const principal = loanInLine(items, creditId);
  if (!principal || principal.month == null) return 0;
  if (compareYearMonth(principal.month, throughMonth) > 0) return 0;

  const repaid = items
    .filter(
      (line) =>
        line.creditId === creditId &&
        line.creditRole === "loan_repay" &&
        line.month != null &&
        compareYearMonth(line.month, throughMonth) <= 0
    )
    .reduce((sum, line) => sum + displayCents(line), 0);

  return Math.max(0, displayCents(principal) - repaid);
}

export function creditVisibleInMonth(
  items: LineItem[],
  creditId: string,
  month: YearMonth
): boolean {
  const principal = loanInLine(items, creditId);
  if (!principal || principal.month == null) return false;
  if (principal.month === month) return true;
  if (compareYearMonth(principal.month, month) > 0) return false;
  return creditRemainingCents(items, creditId, addMonths(month, -1)) > 0;
}

export function payoffRepaymentId(
  items: LineItem[],
  creditId: string,
  month: YearMonth
): string | null {
  const principal = loanInLine(items, creditId);
  if (!principal || principal.month == null) return null;
  if (compareYearMonth(principal.month, month) > 0) return null;

  const startRemaining =
    principal.month === month
      ? displayCents(principal)
      : creditRemainingCents(items, creditId, addMonths(month, -1));

  const repayments = items
    .filter(
      (line) =>
        line.creditId === creditId &&
        line.creditRole === "loan_repay" &&
        line.month === month
    )
    .sort((a, b) => {
      const dateA = a.expectedDate ?? "9999-99-99";
      const dateB = b.expectedDate ?? "9999-99-99";
      if (dateA !== dateB) return dateA < dateB ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  let remaining = startRemaining;
  let hitId: string | null = null;
  for (const repay of repayments) {
    const before = remaining;
    remaining = Math.max(0, remaining - displayCents(repay));
    if (hitId == null && before > 0 && remaining === 0) {
      if (repay.status !== "confirmed") return null;
      hitId = repay.id;
    }
  }
  if (remaining !== 0) return null;
  return hitId;
}

export function adoptOpeningDebt(input: {
  meta: LedgerMeta;
  markers: CreditMarker[];
  items: LineItem[];
  rules: RecurringRule[];
  newCreditId: string;
  newLineId: string;
}): {
  meta: LedgerMeta;
  markers: CreditMarker[];
  items: LineItem[];
  rules: RecurringRule[];
} {
  const already = input.markers.some((marker) => marker.creditor === "爸妈");
  if (input.meta.openingDebtCents === 0 || already) {
    return {
      ...input,
      meta: { ...input.meta, openingDebtCents: 0 }
    };
  }

  const principal = input.meta.openingDebtCents;
  const loan: LineItem = {
    id: input.newLineId,
    month: input.meta.startMonth,
    name: "爸妈",
    kind: "income",
    plannedCents: principal,
    actualCents: principal,
    expectedDate: `${input.meta.startMonth}-01`,
    status: "confirmed",
    source: "manual",
    ruleId: null,
    holdId: null,
    userOverridden: false,
    creditId: input.newCreditId,
    creditRole: "loan_in",
    spreadDaily: null
  };

  const items = input.items.map((line) => {
    if (line.kind !== "debt_repay") return line;
    return {
      ...line,
      name: "爸妈",
      kind: "expense" as const,
      creditId: input.newCreditId,
      creditRole: "loan_repay" as const
    };
  });

  return {
    meta: {
      ...input.meta,
      openingCashCents: input.meta.openingCashCents - principal,
      openingDebtCents: 0
    },
    markers: [
      ...input.markers,
      { id: input.newCreditId, creditor: "爸妈", direction: "borrow" }
    ],
    items: [...items, loan],
    rules: input.rules.map((rule) =>
      rule.kind === "debt_repay" ? { ...rule, enabled: false } : rule
    )
  };
}
