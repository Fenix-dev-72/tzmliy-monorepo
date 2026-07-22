export const STOCK_LOW_THRESHOLD = 5;

export interface StockStatusLabels {
  critical: string;
  low: string;
  normal: string;
}

export function stockStatus(qty: number, labels: StockStatusLabels): { label: string; color: string } {
  if (qty <= 0) return { label: labels.critical, color: "#EF4444" };
  if (qty <= STOCK_LOW_THRESHOLD) return { label: labels.low, color: "#F59E0B" };
  return { label: labels.normal, color: "#10B981" };
}
