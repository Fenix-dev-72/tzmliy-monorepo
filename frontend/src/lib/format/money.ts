// Money is always BIGINT on the backend — UZS in so'm, USD in cents. Never a float.
// See FRONTEND.md "Pul maydonlari": USD 1050 = $10.50.
export function formatMoney(amount: number, currency: string): string {
  const value = currency === "USD" ? amount / 100 : amount;
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: currency === "USD" ? 2 : 0,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  });
  return currency === "USD" ? `$${formatted}` : `${formatted} ${currency}`;
}
