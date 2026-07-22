import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useLang } from "@/lib/i18n/LangContext";
import * as salesApi from "@/lib/api/sales";
import type { Sale, SaleStatus } from "@/lib/api/sales";
import * as customersApi from "@/lib/api/customers";
import type { Customer } from "@/lib/api/customers";
import { formatMoney } from "@/lib/format/money";

const content = {
  uz: {
    title: "So'nggi buyurtmalar",
    seeAll: "Barchasini ko'rish",
    orderId: "Buyurtma #",
    customer: "Mijoz",
    amount: "Summa",
    status: "Holat",
    time: "Vaqt",
    empty: "Hali savdolar mavjud emas",
    statuses: { active: "Faol", completed: "Yakunlangan", cancelled: "Bekor qilingan" } as Record<SaleStatus, string>,
  },
  ru: {
    title: "Последние заказы",
    seeAll: "Смотреть все",
    orderId: "Заказ #",
    customer: "Клиент",
    amount: "Сумма",
    status: "Статус",
    time: "Время",
    empty: "Продаж пока нет",
    statuses: { active: "Активна", completed: "Завершена", cancelled: "Отменена" } as Record<SaleStatus, string>,
  },
};

const STATUS_COLOR: Record<SaleStatus, string> = {
  active: "var(--warning)",
  completed: "var(--success)",
  cancelled: "var(--destructive)",
};

const LATEST_ORDERS_LIMIT = 5;
// Enough to resolve names for a handful of recent sales without a second
// paginated round-trip -- same dropdown-sized fetch SalesPage.tsx uses.
const CUSTOMER_LOOKUP_LIMIT = 200;

export function LatestOrdersTable({ accessToken }: { accessToken: string }) {
  const { lang } = useLang();
  const t = content[lang];
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    salesApi.listSales(accessToken, LATEST_ORDERS_LIMIT).then(setSales).catch(() => setSales([]));
    customersApi.listCustomers(accessToken, CUSTOMER_LOOKUP_LIMIT).then(setCustomers).catch(() => {});
  }, [accessToken]);

  const customerName = useMemo(() => {
    const map = new Map(customers.map((c) => [c.id, c.full_name]));
    return (customerId: string) => map.get(customerId) ?? "—";
  }, [customers]);

  return (
    <div className="glass-card flex h-full flex-col p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t.title}</h3>
        <Link to="/dashboard/sales" className="text-primary text-xs font-semibold whitespace-nowrap">
          {t.seeAll}
        </Link>
      </div>

      {sales === null && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-accent/60 h-10 animate-pulse rounded-xl" />
          ))}
        </div>
      )}

      {sales !== null && sales.length === 0 && (
        <div className="flex flex-1 items-center justify-center py-6">
          <p className="text-sm text-foreground-muted">{t.empty}</p>
        </div>
      )}

      {sales !== null && sales.length > 0 && (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[380px] border-collapse text-sm">
            <thead>
              <tr className="text-foreground-muted text-xs">
                <th className="px-2 pb-2 text-left font-medium">{t.orderId}</th>
                <th className="px-2 pb-2 text-left font-medium">{t.customer}</th>
                <th className="px-2 pb-2 text-right font-medium">{t.amount}</th>
                <th className="px-2 pb-2 text-right font-medium">{t.status}</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale, i) => (
                <tr key={sale.id} className={i < sales.length - 1 ? "border-t border-card-border/60" : ""}>
                  <td className="px-2 py-2.5 font-mono text-xs text-foreground-muted">#{sale.id.slice(0, 6).toUpperCase()}</td>
                  <td className="max-w-[140px] truncate px-2 py-2.5 text-foreground">{customerName(sale.customer_id)}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-foreground">{formatMoney(sale.price_amount, sale.currency)}</td>
                  <td className="px-2 py-2.5 text-right">
                    <span
                      className="rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
                      style={{
                        background: `${STATUS_COLOR[sale.status]}15`,
                        borderColor: `${STATUS_COLOR[sale.status]}30`,
                        color: STATUS_COLOR[sale.status],
                      }}
                    >
                      {t.statuses[sale.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
