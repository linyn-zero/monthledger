import type { CreditDirection } from "../domain/types";

export function creditUi(direction?: CreditDirection) {
  if (direction === "lend") {
    return {
      party: "借款人",
      principalTag: "借出",
      repayTag: "收回",
      monthPaid: "本月收回",
      emptyKids: "本月没有收回",
      over: "收回超过本金",
      congrats: "收回啦，恭喜你！真棒！",
      addBtn: "收一笔",
      kidsKicker: "收回记录",
      newRow: "新收回",
      partyEmpty: "借款人不能为空",
      dateName: (name: string) => `向${name}收回`,
      amountAria: (name: string) => `向${name}收回金额`,
      confirmAria: (name: string) => `${name}收回`,
      loanConfirmAria: (name: string) => `借出${name}`,
      deleteWhole: (name: string) =>
        `删除整笔信贷「${name}」？未确认的借出和收回会删掉，已确认的变成普通收入或支出，不再算应收。`,
      deleteRepay: (amount: string) => `删除这笔收回 ${amount}？`
    };
  }
  return {
    party: "债权方",
    principalTag: "借贷",
    repayTag: "还贷",
    monthPaid: "本月还款",
    emptyKids: "本月没有还款",
    over: "还款超过本金",
    congrats: "还清啦，恭喜你！真棒！",
      addBtn: "还一笔",
      kidsKicker: "还款记录",
      newRow: "新还款",
    partyEmpty: "债权方不能为空",
    dateName: (name: string) => `给${name}还款`,
    amountAria: (name: string) => `给${name}还款金额`,
    confirmAria: (name: string) => `${name}还贷`,
    loanConfirmAria: (name: string) => `借贷${name}`,
    deleteWhole: (name: string) =>
      `删除整笔信贷「${name}」？未确认的借贷和还贷会删掉，已确认的变成普通收入或支出，不再算负债。`,
    deleteRepay: (amount: string) => `删除这笔还贷 ${amount}？`
  };
}
