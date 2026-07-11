import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { AlertCircle, ArrowRight, ChevronDown, Loader2, Plus, ShieldAlert, ShoppingCart, X } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as salesApi from "@/lib/api/sales";
import type { Sale, SaleStatus } from "@/lib/api/sales";
import * as customersApi from "@/lib/api/customers";
import type { Customer } from "@/lib/api/customers";
import * as catalogApi from "@/lib/api/catalog";
import { flattenCategories } from "@/lib/api/catalog";
import * as financeApi from "@/lib/api/finance";
import type { PaymentMethod, SaleLedger } from "@/lib/api/finance";
import { ApiError } from "@/lib/api/client";
import { formatMoney } from "@/lib/format/money";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "Savdolar",
    sub: "Barcha savdo shartnomalari",
    add: "Yangi savdo",
    customer: "Mijoz",
    category: "Kategoriya (ixtiyoriy)",
    noCategory: "—",
    price: "Narx",
    currency: "Valyuta",
    deadline: "Muddat",
    create: "Qo'shish",
    cancel: "Bekor qilish",
    empty: "Hali savdolar yo'q",
    emptyDesc: "Birinchi savdongizni qo'shing.",
    noCustomers: "Avval mijoz qo'shishingiz kerak",
    goToCustomers: "Mijozlar bo'limiga o'tish",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    genericError: "Xatolik yuz berdi",
    created: "Savdo qo'shildi",
    selectCustomer: "Mijozni tanlang",
    statuses: { active: "Faol", completed: "Yakunlangan", cancelled: "Bekor qilingan" } as Record<SaleStatus, string>,
    balance: "Qoldiq",
    fullyPaid: "To'liq to'langan",
    recordPayment: "To'lov qabul qilish",
    amount: "Summa",
    method: "Usul",
    methods: { cash: "Naqd", card: "Karta", click: "Click", payme: "Payme", manual: "Qo'lda" } as Record<PaymentMethod, string>,
    entryTypes: { charge: "Hisoblandi", payment: "To'landi", refund: "Qaytarildi", adjustment: "Tuzatildi" },
    need2fa: "To'lov qabul qilish uchun 2FA yoqilgan bo'lishi kerak.",
    enable2fa: "2FA yoqish",
    paymentRecorded: "To'lov qabul qilindi",
  },
  ru: {
    title: "Продажи",
    sub: "Все сделки продаж",
    add: "Новая продажа",
    customer: "Клиент",
    category: "Категория (необязательно)",
    noCategory: "—",
    price: "Цена",
    currency: "Валюта",
    deadline: "Срок",
    create: "Добавить",
    cancel: "Отмена",
    empty: "Продаж пока нет",
    emptyDesc: "Добавьте свою первую продажу.",
    noCustomers: "Сначала нужно добавить клиента",
    goToCustomers: "Перейти в раздел Клиенты",
    loadError: "Не удалось загрузить данные",
    genericError: "Произошла ошибка",
    created: "Продажа добавлена",
    selectCustomer: "Выберите клиента",
    statuses: { active: "Активна", completed: "Завершена", cancelled: "Отменена" } as Record<SaleStatus, string>,
    balance: "Остаток",
    fullyPaid: "Полностью оплачено",
    recordPayment: "Принять платёж",
    amount: "Сумма",
    method: "Способ",
    methods: { cash: "Наличные", card: "Карта", click: "Click", payme: "Payme", manual: "Вручную" } as Record<PaymentMethod, string>,
    entryTypes: { charge: "Начислено", payment: "Оплачено", refund: "Возвращено", adjustment: "Скорректировано" },
    need2fa: "Для приёма платежей требуется включённая 2FA.",
    enable2fa: "Включить 2FA",
    paymentRecorded: "Платёж принят",
  },
};

type SalesContent = (typeof content)["uz"];

function SaleRow({
  sale,
  customerName,
  accessToken,
  has2fa,
  t,
  isLast,
}: {
  sale: Sale;
  customerName: string;
  accessToken: string;
  has2fa: boolean;
  t: SalesContent;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [ledger, setLedger] = useState<SaleLedger | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [saving, setSaving] = useState(false);

  async function loadLedger() {
    setLoadingLedger(true);
    try {
      setLedger(await financeApi.getSaleLedger(accessToken, sale.id));
    } catch {
      // shown as "-" below if it stays null
    } finally {
      setLoadingLedger(false);
    }
  }

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && ledger === null) loadLedger();
  }

  async function handleRecordPayment() {
    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) return;
    const amountToSend = sale.currency === "USD" ? Math.round(amountNumber * 100) : Math.round(amountNumber);

    setSaving(true);
    try {
      await financeApi.recordPayment(accessToken, {
        sale_id: sale.id,
        amount: amountToSend,
        currency: sale.currency as "UZS" | "USD",
        method,
      });
      toast.success(t.paymentRecorded);
      setAmount("");
      setFormOpen(false);
      await loadLedger();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        toast.error(t.need2fa);
      } else {
        toast.error(t.genericError);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={isLast ? "" : "border-b border-card-border/60"}>
      <button className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5" onClick={toggle}>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{customerName}</div>
          <div className="text-xs text-foreground-muted">{new Date(sale.deadline).toLocaleDateString()}</div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-mono text-sm font-semibold text-primary">{formatMoney(sale.price_amount, sale.currency)}</span>
          <span
            className="rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap"
            style={{
              background: `${STATUS_COLOR[sale.status]}15`,
              borderColor: `${STATUS_COLOR[sale.status]}30`,
              color: STATUS_COLOR[sale.status],
            }}
          >
            {t.statuses[sale.status]}
          </span>
          <ChevronDown size={16} className={`text-foreground-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {expanded && (
        <div className="bg-background/60 border-card-border border-t px-4 pb-4 sm:px-5 sm:pb-5">
          {loadingLedger || ledger === null ? (
            <div className="flex justify-center py-6">
              <Loader2 size={18} className="text-primary animate-spin" />
            </div>
          ) : (
            <>
              <div className="space-y-1.5 py-3">
                {ledger.entries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between text-xs">
                    <span className="text-foreground-muted">
                      {t.entryTypes[entry.entry_type]} · {new Date(entry.created_at).toLocaleDateString()}
                    </span>
                    <span className={`font-mono font-semibold ${entry.amount >= 0 ? "text-primary" : "text-success"}`}>
                      {entry.amount >= 0 ? "+" : ""}
                      {formatMoney(entry.amount, entry.currency)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-card-border flex items-center justify-between border-t pt-3">
                <span className="text-sm font-semibold text-foreground">{t.balance}</span>
                <span className={`font-mono text-base font-bold ${ledger.balance > 0 ? "text-primary" : "text-success"}`}>
                  {ledger.balance > 0 ? formatMoney(ledger.balance, sale.currency) : t.fullyPaid}
                </span>
              </div>

              {ledger.balance > 0 && (
                <div className="mt-3">
                  {!has2fa ? (
                    <div className="border-primary/25 bg-primary/8 flex flex-wrap items-center gap-2 rounded-xl border p-3">
                      <ShieldAlert size={14} className="text-primary shrink-0" />
                      <span className="flex-1 text-xs text-foreground">{t.need2fa}</span>
                      <Link to="/dashboard/settings/2fa" className="text-primary text-xs font-semibold">
                        {t.enable2fa}
                      </Link>
                    </div>
                  ) : formOpen ? (
                    <div className="flex flex-wrap items-end gap-3">
                      <FormField
                        label={t.amount}
                        type="number"
                        min="0"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="mb-0 w-32"
                      />
                      <div>
                        <label className="text-foreground mb-1.5 block text-sm font-medium">{t.method}</label>
                        <select
                          value={method}
                          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                          className="border-card-border bg-input-background text-foreground h-11 rounded-xl border px-3 text-sm outline-none"
                        >
                          {(Object.keys(t.methods) as PaymentMethod[]).map((m) => (
                            <option key={m} value={m}>
                              {t.methods[m]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Button variant="gold" size="sm" disabled={saving || !amount} onClick={handleRecordPayment}>
                        {saving && <Loader2 size={14} className="animate-spin" />}
                        {t.create}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setFormOpen(false)}>
                        {t.cancel}
                      </Button>
                    </div>
                  ) : (
                    <Button variant="gold" size="sm" onClick={() => setFormOpen(true)}>
                      {t.recordPayment}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const STATUS_COLOR: Record<SaleStatus, string> = {
  active: "#D4AF37",
  completed: "#2FBF71",
  cancelled: "#E5484D",
};

export function SalesPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken, user } = useTenantAuth();
  const has2fa = Boolean(user?.totp_enabled);

  const [sales, setSales] = useState<Sale[] | null>(null);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [categories, setCategories] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const [customerId, setCustomerId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<"UZS" | "USD">("UZS");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  const customerName = useMemo(() => {
    const map = new Map((customers ?? []).map((c) => [c.id, c.full_name]));
    return (customerId: string) => map.get(customerId) ?? "—";
  }, [customers]);

  async function load() {
    if (!accessToken) return;
    setError(null);
    try {
      const [salesData, customersData] = await Promise.all([
        salesApi.listSales(accessToken),
        customersApi.listCustomers(accessToken),
      ]);
      setSales(salesData);
      setCustomers(customersData);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.loadError);
      return;
    }
    try {
      setCategories(flattenCategories(await catalogApi.listCategories(accessToken)));
    } catch {
      // category picker is optional -- sale creation still works without catalog.view
    }
  }

  useEffect(() => {
    if (accessToken) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function handleCreate() {
    if (!accessToken || !user) return;
    const priceNumber = Number(price);
    if (!Number.isFinite(priceNumber) || priceNumber < 0) return;
    const priceAmount = currency === "USD" ? Math.round(priceNumber * 100) : Math.round(priceNumber);

    setSaving(true);
    try {
      await salesApi.createSale(accessToken, {
        customer_id: customerId,
        catalog_category_id: categoryId || undefined,
        responsible_user_id: user.id,
        currency,
        price_amount: priceAmount,
        deadline: `${deadline}T00:00:00`,
      });
      toast.success(t.created);
      setCustomerId("");
      setCategoryId("");
      setPrice("");
      setDeadline("");
      setFormOpen(false);
      await load();
    } catch {
      toast.error(t.genericError);
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = customerId.length > 0 && price.trim().length > 0 && deadline.length > 0;
  const hasCustomers = (customers?.length ?? 0) > 0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 sm:mb-8">
        <div>
          <h1 className="font-heading mb-1 text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
          <p className="text-sm text-foreground-muted">{t.sub}</p>
        </div>
        <Button variant="gold" disabled={customers !== null && !hasCustomers} onClick={() => setFormOpen((o) => !o)}>
          {formOpen ? <X size={16} /> : <Plus size={16} />}
          {t.add}
        </Button>
      </div>

      {customers !== null && !hasCustomers && (
        <div className="border-primary/25 bg-primary/8 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
          <span className="text-sm text-foreground">{t.noCustomers}</span>
          <Link to="/dashboard/customers" className="text-primary flex items-center gap-1.5 text-sm font-semibold">
            {t.goToCustomers}
            <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {formOpen && hasCustomers && (
        <div className="glass-card mb-6 p-5 sm:p-6">
          <div className="mb-4">
            <label className="text-foreground mb-1.5 block text-sm font-medium">{t.customer}</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="border-card-border bg-input-background text-foreground focus-visible:border-ring focus-visible:ring-ring/15 h-11 w-full rounded-xl border px-3.5 text-sm outline-none focus-visible:ring-[3px]"
            >
              <option value="">{t.selectCustomer}</option>
              {customers!.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} — {c.phone}
                </option>
              ))}
            </select>
          </div>

          {categories.length > 0 && (
            <div className="mb-4">
              <label className="text-foreground mb-1.5 block text-sm font-medium">{t.category}</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="border-card-border bg-input-background text-foreground focus-visible:border-ring focus-visible:ring-ring/15 h-11 w-full rounded-xl border px-3.5 text-sm outline-none focus-visible:ring-[3px]"
              >
                <option value="">{t.noCategory}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField
              label={t.price}
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={currency === "USD" ? "150" : "1500000"}
            />
            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">{t.currency}</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as "UZS" | "USD")}
                className="border-card-border bg-input-background text-foreground focus-visible:border-ring focus-visible:ring-ring/15 h-11 w-full rounded-xl border px-3.5 text-sm outline-none focus-visible:ring-[3px]"
              >
                <option value="UZS">UZS</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <FormField label={t.deadline} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>

          <div className="mt-2 flex gap-3">
            <Button variant="gold" disabled={!canSubmit || saving} onClick={handleCreate}>
              {saving && <Loader2 size={16} className="animate-spin" />}
              {t.create}
            </Button>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              {t.cancel}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle size={28} className="text-destructive" />
          <p className="text-sm text-foreground-muted">{error}</p>
        </div>
      )}

      {!error && sales === null && (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="text-primary animate-spin" />
        </div>
      )}

      {!error && sales !== null && sales.length === 0 && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center sm:p-14">
          <ShoppingCart size={32} className="text-foreground-muted" />
          <h2 className="font-heading text-lg font-bold text-foreground">{t.empty}</h2>
          <p className="max-w-md text-sm text-foreground-muted">{t.emptyDesc}</p>
        </div>
      )}

      {!error && sales !== null && sales.length > 0 && accessToken && (
        <div className="glass-card overflow-hidden p-0">
          {sales.map((s, i) => (
            <SaleRow
              key={s.id}
              sale={s}
              customerName={customerName(s.customer_id)}
              accessToken={accessToken}
              has2fa={has2fa}
              t={t}
              isLast={i === sales.length - 1}
            />
          ))}
        </div>
      )}
    </main>
  );
}
