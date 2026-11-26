export function yuanToCents(yuan: number): number {
  return Math.round(yuan * 100);
}

export function centsToYuan(cents: number): number {
  return cents / 100;
}

export function formatYuanFromCents(cents: number): string {
  const yuan = cents / 100;
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(yuan);
}
