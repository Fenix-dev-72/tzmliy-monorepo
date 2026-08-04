import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  ChevronDown,
  CreditCard,
  Loader2,
  Plus,
  ShieldAlert,
  ShoppingCart,
  Trash2,
  Undo2,
  Workflow,
  X,
} from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as salesApi from "@/lib/api/sales";
import { SALES_PAGE_SIZE } from "@/lib/api/sales";
import type { DeliveryMode, Sale, SaleStatus } from "@/lib/api/sales";
import * as customersApi from "@/lib/api/customers";
import type { Customer } from "@/lib/api/customers";
import * as usersApi from "@/lib/api/users";
import { USERS_DROPDOWN_LIMIT } from "@/lib/api/users";
import type { TenantUserRow } from "@/lib/api/users";

// Sale creation needs the customer-select dropdown to cover as many
// customers as possible in one request (unlike the paginated sales list
// below) -- 200 is the backend's max allowed page size.
const CUSTOMER_DROPDOWN_LIMIT = 200;
import * as productsApi from "@/lib/api/products";
import type { Product } from "@/lib/api/products";
import * as financeApi from "@/lib/api/finance";
import type { CustomerOutstandingSale, PaymentMethod, SaleLedger } from "@/lib/api/finance";
import { ApiError } from "@/lib/api/client";
import { formatMoney } from "@/lib/format/money";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { DashboardPageContainer } from "@/components/shared/DashboardPageContainer";
import { SearchFilterBar } from "@/components/shared/SearchFilterBar";
import { PaginationBar } from "@/components/shared/PaginationBar";

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
    deliveryMode: "Sotuv turi",
    deliveryModeUnset: "Tanlanmagan",
    deliveryModeOnline: "Onlayn",
    deliveryModeOffline: "Oflayn",
    deliveryModeIntensive: "Intensiv",
    create: "Qo'shish",
    cancel: "Bekor qilish",
    back: "Orqaga",
    empty: "Hali savdolar yo'q",
    emptyDesc: "Birinchi savdongizni qo'shing.",
    noCustomers: "Avval mijoz qo'shishingiz kerak",
    goToCustomers: "Mijozlar bo'limiga o'tish",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    loadMore: "Ko'proq yuklash",
    genericError: "Xatolik yuz berdi",
    created: "Savdo qo'shildi",
    createdMultiple: "ta savdo qo'shildi",
    selectCustomer: "Mijozni tanlang",
    addNewCustomer: "Yangi mijoz qo'shish",
    newCustomerName: "F.I.Sh.",
    newCustomerPhone: "Telefon raqami",
    duplicatePhone: "Bu telefon raqami bilan mijoz allaqachon mavjud",
    existingCustomerSelected: "Bu raqam bilan mijoz allaqachon mavjud — tanlandi",
    existingCustomerFound: "Bu raqam bilan mijoz allaqachon mavjud",
    useExistingCustomer: "Shu mijozni tanlash",
    customerAdded: "Mijoz qo'shildi",
    statuses: { active: "Faol", completed: "Yakunlangan", cancelled: "Bekor qilingan" } as Record<SaleStatus, string>,
    all: "Barchasi",
    searchPlaceholder: "Mijoz nomi bo'yicha qidirish...",
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
    reversePayment: "To'lovni bekor qilish",
    paymentReversed: "To'lov ortga qaytarildi",
    reversed: "ortga qaytarilgan",
    amountExceedsBalance: "Summa qoldiqdan oshib ketdi",
    ledgerAccessDenied: "Bu savdoning moliyaviy tafsilotlarini ko'rish uchun ruxsatingiz yo'q",
    // debt-check flow
    checkingDebts: "Mijozning oldingi savdolari tekshirilmoqda...",
    debtFoundTitle: "Bu mijozning to'lanmagan qarzi bor",
    debtFoundDesc: "Nima qilmoqchisiz?",
    payDebt: "Qarzni yopish",
    newSale: "Yangi savdo qo'shish",
    chooseDebt: "Qaysi qarzni yopmoqchisiz?",
    debtDeadline: "Muddat",
    payThisDebt: "Shu qarzni to'lash",
    product: "Mahsulot",
    addProduct: "Mahsulot qo'shish",
    removeProduct: "O'chirish",
    items: "Mahsulotlar",
    responsibleEmployee: "Mas'ul xodim",
    seller: "Sotuvchi",
    quantity: "Soni",
    noProduct: "Mahsulotsiz (erkin narx)",
    stockLabel: "Ombor",
    insufficientStock: "Omborda yetarli mahsulot yo'q",
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
    deliveryMode: "Тип продажи",
    deliveryModeUnset: "Не выбрано",
    deliveryModeOnline: "Онлайн",
    deliveryModeOffline: "Оффлайн",
    deliveryModeIntensive: "Интенсив",
    create: "Добавить",
    cancel: "Отмена",
    back: "Назад",
    empty: "Продаж пока нет",
    emptyDesc: "Добавьте свою первую продажу.",
    noCustomers: "Сначала нужно добавить клиента",
    goToCustomers: "Перейти в раздел Клиенты",
    loadError: "Не удалось загрузить данные",
    loadMore: "Загрузить ещё",
    genericError: "Произошла ошибка",
    created: "Продажа добавлена",
    createdMultiple: "продаж добавлено",
    selectCustomer: "Выберите клиента",
    addNewCustomer: "Добавить нового клиента",
    newCustomerName: "ФИО",
    newCustomerPhone: "Номер телефона",
    duplicatePhone: "Клиент с этим номером уже существует",
    existingCustomerSelected: "Клиент с этим номером уже существует — выбран",
    existingCustomerFound: "Клиент с этим номером уже существует",
    useExistingCustomer: "Выбрать этого клиента",
    customerAdded: "Клиент добавлен",
    statuses: { active: "Активна", completed: "Завершена", cancelled: "Отменена" } as Record<SaleStatus, string>,
    all: "Все",
    searchPlaceholder: "Поиск по имени клиента...",
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
    reversePayment: "Отменить платёж",
    paymentReversed: "Платёж отменён",
    reversed: "отменён",
    amountExceedsBalance: "Сумма превышает остаток",
    ledgerAccessDenied: "У вас нет доступа к финансовым деталям этой продажи",
    checkingDebts: "Проверяем предыдущие покупки клиента...",
    debtFoundTitle: "У этого клиента есть непогашенный долг",
    debtFoundDesc: "Что вы хотите сделать?",
    payDebt: "Погасить долг",
    newSale: "Добавить новую продажу",
    chooseDebt: "Какой долг вы хотите погасить?",
    debtDeadline: "Срок",
    payThisDebt: "Оплатить этот долг",
    product: "Товар",
    addProduct: "Добавить товар",
    removeProduct: "Удалить",
    items: "Товары",
    responsibleEmployee: "Ответственный сотрудник",
    seller: "Продавец",
    quantity: "Количество",
    noProduct: "Без товара (свободная цена)",
    stockLabel: "Склад",
    insufficientStock: "Недостаточно товара на складе",
  },
};

type SalesContent = (typeof content)["uz"];

// Distinguishes a CRM-auto-created sale from a normal human-entered one
// (client requirement, 2026-07-24) -- reuses the same brand icon/color each
// provider already has on IntegrationsPage.tsx, so a "Bu AmoCRM'dan kelgan
// savdo" reads as visually consistent across the app, not a one-off style.
const SOURCE_META: Record<string, { label: string; color: string; icon: typeof Workflow }> = {
  amocrm: { label: "AmoCRM", color: "#2FBF71", icon: Workflow },
  bitrix24: { label: "Bitrix24", color: "#4C6FFF", icon: Building2 },
};

function SourceBadge({ source }: { source: string }) {
  const meta = SOURCE_META[source];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      className="flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold whitespace-nowrap"
      style={{ background: `${meta.color}15`, borderColor: `${meta.color}30`, color: meta.color }}
    >
      <Icon size={11} />
      {meta.label}
    </span>
  );
}

function SaleRow({
  sale,
  customerName,
  sellerName,
  accessToken,
  has2fa,
  t,
  onSaleUpdated,
}: {
  sale: Sale;
  customerName: string;
  sellerName: string;
  accessToken: string;
  has2fa: boolean;
  t: SalesContent;
  // Recording/reversing a payment here can flip the sale's own status
  // server-side (finance.record_payment auto-completes once the balance
  // hits 0) -- this row only had loadLedger() to refresh the ledger sub-view,
  // never the `sale` prop itself (owned by the parent's `sales` list), so a
  // fully-paid sale kept showing "Faol" until an unrelated page reload. Call
  // this after any payment change so the parent re-fetches the list.
  onSaleUpdated: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [ledger, setLedger] = useState<SaleLedger | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [ledgerError, setLedgerError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [saving, setSaving] = useState(false);
  const [reversingId, setReversingId] = useState<string | null>(null);

  async function loadLedger() {
    setLoadingLedger(true);
    setLedgerError(false);
    try {
      setLedger(await financeApi.getSaleLedger(accessToken, sale.id));
    } catch {
      // Own-data scoping (2026-07-22): a caller without finance.view (or
      // finance.view_all for a sale they don't own) gets a 403/404 here --
      // ledgerError stops the section from spinning forever in that case,
      // instead of retrying against ledger === null indefinitely.
      setLedgerError(true);
    } finally {
      setLoadingLedger(false);
    }
  }

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && ledger === null) loadLedger();
  }

  const maxPayable = ledger ? (sale.currency === "USD" ? ledger.balance / 100 : ledger.balance) : undefined;

  async function handleRecordPayment() {
    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) return;
    if (maxPayable !== undefined && amountNumber > maxPayable) {
      toast.error(t.amountExceedsBalance);
      return;
    }
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
      onSaleUpdated();
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

  async function handleReversePayment(paymentId: string) {
    setReversingId(paymentId);
    try {
      await financeApi.reversePayment(accessToken, paymentId);
      toast.success(t.paymentReversed);
      await loadLedger();
      onSaleUpdated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : t.genericError);
    } finally {
      setReversingId(null);
    }
  }

  return (
    <div className="bg-card/95 border-card-border overflow-hidden rounded-[14px] border shadow-sm">
      <button className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5" onClick={toggle}>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{customerName}</div>
          <div className="text-xs text-foreground-muted">
            {new Date(sale.deadline).toLocaleDateString()} · {sellerName}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {sale.source && <SourceBadge source={sale.source} />}
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
          {loadingLedger ? (
            <div className="flex justify-center py-6">
              <Loader2 size={18} className="text-primary animate-spin" />
            </div>
          ) : ledgerError || ledger === null ? (
            <p className="text-foreground-muted py-6 text-center text-xs">{t.ledgerAccessDenied}</p>
          ) : (
            <>
              <div className="space-y-1.5 py-3">
                {ledger.entries.map((entry) => {
                  const isReversed = ledger.entries.some(
                    (e) => e.entry_type === "adjustment" && e.related_payment_id === entry.related_payment_id,
                  );
                  const isReversiblePayment = entry.entry_type === "payment" && entry.related_payment_id && !isReversed;
                  return (
                    <div key={entry.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-foreground-muted">
                        {t.entryTypes[entry.entry_type]} · {new Date(entry.created_at).toLocaleDateString()}
                        {entry.entry_type === "payment" && isReversed && ` · ${t.reversed}`}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={`font-mono font-semibold ${entry.amount >= 0 ? "text-primary" : "text-success"}`}>
                          {entry.amount >= 0 ? "+" : ""}
                          {formatMoney(entry.amount, entry.currency)}
                        </span>
                        {isReversiblePayment && (
                          <button
                            onClick={() => handleReversePayment(entry.related_payment_id!)}
                            disabled={reversingId === entry.related_payment_id}
                            aria-label={t.reversePayment}
                            title={t.reversePayment}
                            className="text-foreground-muted hover:text-destructive shrink-0"
                          >
                            {reversingId === entry.related_payment_id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Undo2 size={13} />
                            )}
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="border-card-border flex items-center justify-between border-t pt-3">
                <span className="text-sm font-semibold text-foreground">{t.balance}</span>
                <span className={`font-mono text-base font-bold ${ledger.balance > 0 ? "text-primary" : "text-success"}`}>
                  {ledger.balance > 0 ? formatMoney(ledger.balance, sale.currency) : t.fullyPaid}
                </span>
              </div>

              {ledger.balance > 0 && sale.status !== "cancelled" && (
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
                        max={maxPayable}
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
                      <Button
                        variant="gold"
                        size="sm"
                        disabled={saving || !amount || (maxPayable !== undefined && Number(amount) > maxPayable)}
                        onClick={handleRecordPayment}
                      >
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
  active: "#F59E0B",
  completed: "#10B981",
  cancelled: "#EF4444",
};

type SaleItem = { productId: string; quantity: string; price: string };

type FormStep = "customer" | "checking" | "choice" | "debts" | "debt-payment" | "items";

export function SalesPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken, user } = useTenantAuth();
  const has2fa = Boolean(user?.totp_enabled);

  const [sales, setSales] = useState<Sale[] | null>(null);
  const [salesTotal, setSalesTotal] = useState(0);
  const [salesPage, setSalesPage] = useState(1);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [users, setUsers] = useState<TenantUserRow[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SaleStatus | "all">("all");

  const [step, setStep] = useState<FormStep>("customer");
  const [customerId, setCustomerId] = useState("");
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [phoneMatch, setPhoneMatch] = useState<Customer | null>(null);
  const [outstanding, setOutstanding] = useState<CustomerOutstandingSale[]>([]);
  const [selectedDebt, setSelectedDebt] = useState<CustomerOutstandingSale | null>(null);
  const [debtAmount, setDebtAmount] = useState("");
  const [debtMethod, setDebtMethod] = useState<PaymentMethod>("cash");

  const [items, setItems] = useState<SaleItem[]>([{ productId: "", quantity: "1", price: "" }]);
  const [currency, setCurrency] = useState<"UZS" | "USD">("UZS");
  const [deadline, setDeadline] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode | "">("");
  const [responsibleUserId, setResponsibleUserId] = useState("");
  const [saving, setSaving] = useState(false);

  const customerName = useMemo(() => {
    const map = new Map((customers ?? []).map((c) => [c.id, c.full_name]));
    return (customerId: string) => map.get(customerId) ?? "—";
  }, [customers]);

  const visibleSales = useMemo(() => {
    let list = sales ?? [];
    if (statusFilter !== "all") list = list.filter((s) => s.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((s) => customerName(s.customer_id).toLowerCase().includes(q));
    }
    return list;
  }, [sales, statusFilter, searchQuery, customerName]);

  const sellerName = useMemo(() => {
    const map = new Map((users ?? []).map((u) => [u.id, u.full_name || u.email || u.phone || "—"]));
    return (userId: string) => map.get(userId) ?? "—";
  }, [users]);

  async function load(targetPage: number) {
    if (!accessToken) return;
    setError(null);
    try {
      const [salesData, customersData] = await Promise.all([
        salesApi.listSales(accessToken, SALES_PAGE_SIZE, (targetPage - 1) * SALES_PAGE_SIZE),
        customersApi.listCustomers(accessToken, CUSTOMER_DROPDOWN_LIMIT),
      ]);
      setSales(salesData.items);
      setSalesTotal(salesData.total);
      setCustomers(customersData.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.loadError);
      return;
    }
    try {
      setProducts(await productsApi.listProducts(accessToken));
    } catch {
      // product picker is optional -- sale creation still works without catalog.view
    }
    try {
      // Only admin/manager/finance roles carry users.view by default -- an
      // agent without it just keeps the hardcoded "self" behavior below.
      setUsers((await usersApi.listUsers(accessToken, USERS_DROPDOWN_LIMIT)).items);
    } catch {
      setUsers(null);
    }
  }

  useEffect(() => {
    if (accessToken) load(salesPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, salesPage]);

  function resetForm() {
    setStep("customer");
    setCustomerId("");
    setOutstanding([]);
    setSelectedDebt(null);
    setDebtAmount("");
    setItems([{ productId: "", quantity: "1", price: "" }]);
    setDeadline("");
    setDeliveryMode("");
    setResponsibleUserId(user?.id ?? "");
    setNewCustomerOpen(false);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setPhoneMatch(null);
  }

  function openForm() {
    resetForm();
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    resetForm();
  }

  async function handleCustomerChosen(id: string) {
    setCustomerId(id);
    if (!accessToken || !id) return;
    setStep("checking");
    try {
      const debts = await financeApi.getCustomerOutstandingSales(accessToken, id);
      setOutstanding(debts);
      setStep(debts.length > 0 ? "choice" : "items");
    } catch {
      // if the debt check fails, don't block the flow -- just go straight to a new sale
      setOutstanding([]);
      setStep("items");
    }
  }

  // Search-as-you-type: while the inline "add new customer" form is open,
  // check the typed phone against existing customers (debounced) instead of
  // only finding out about a duplicate after the admin clicks "Qo'shish".
  // A short phone prefix would match too many/no real customers and just
  // burn requests, so this waits for something phone-number-shaped.
  useEffect(() => {
    if (!newCustomerOpen || !accessToken) {
      setPhoneMatch(null);
      return;
    }
    const phone = newCustomerPhone.trim();
    if (phone.replace(/\D/g, "").length < 9) {
      setPhoneMatch(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setPhoneMatch(await customersApi.getCustomerByPhone(accessToken, phone));
      } catch {
        setPhoneMatch(null);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [newCustomerOpen, newCustomerPhone, accessToken]);

  function selectPhoneMatch() {
    if (!phoneMatch) return;
    setCustomers((prev) => (prev?.some((c) => c.id === phoneMatch.id) ? prev : [...(prev ?? []), phoneMatch]));
    setNewCustomerOpen(false);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setPhoneMatch(null);
    handleCustomerChosen(phoneMatch.id);
  }

  async function handleCreateCustomerInline() {
    if (!accessToken || !newCustomerName.trim() || !newCustomerPhone.trim()) return;
    setCreatingCustomer(true);
    try {
      const customer = await customersApi.createCustomer(accessToken, {
        full_name: newCustomerName.trim(),
        phone: newCustomerPhone.trim(),
      });
      setCustomers((prev) => [...(prev ?? []), customer]);
      toast.success(t.customerAdded);
      setNewCustomerOpen(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      await handleCustomerChosen(customer.id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Same phone already belongs to an existing customer -- instead of
        // just erroring out and making the admin cancel this form and
        // search the dropdown themselves, look that customer up and select
        // them directly (closer to a search-as-you-type experience).
        try {
          const existing = await customersApi.getCustomerByPhone(accessToken, newCustomerPhone.trim());
          setCustomers((prev) => (prev?.some((c) => c.id === existing.id) ? prev : [...(prev ?? []), existing]));
          toast.success(t.existingCustomerSelected);
          setNewCustomerOpen(false);
          setNewCustomerName("");
          setNewCustomerPhone("");
          await handleCustomerChosen(existing.id);
        } catch {
          toast.error(t.duplicatePhone);
        }
      } else {
        toast.error(t.genericError);
      }
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function handlePayDebt() {
    if (!accessToken || !selectedDebt) return;
    const amountNumber = Number(debtAmount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) return;
    const amountToSend = selectedDebt.currency === "USD" ? Math.round(amountNumber * 100) : Math.round(amountNumber);

    setSaving(true);
    try {
      await financeApi.recordPayment(accessToken, {
        sale_id: selectedDebt.sale_id,
        amount: amountToSend,
        currency: selectedDebt.currency as "UZS" | "USD",
        method: debtMethod,
      });
      toast.success(t.paymentRecorded);
      closeForm();
      await load(salesPage);
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
    } finally {
      setSaving(false);
    }
  }

  function productOf(productId: string): Product | undefined {
    return products.find((p) => p.id === productId);
  }

  function suggestedPrice(product: Product, quantity: string): string {
    const qty = Number(quantity) || 1;
    const amount = product.sell_price_amount * qty;
    return String(product.sell_price_currency === "USD" ? amount / 100 : amount);
  }

  function updateItem(index: number, patch: Partial<SaleItem>) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const next = { ...it, ...patch };
        if (patch.productId !== undefined) {
          const product = productOf(patch.productId);
          next.price = product ? suggestedPrice(product, next.quantity) : "";
        } else if (patch.quantity !== undefined) {
          const product = productOf(next.productId);
          if (product) next.price = suggestedPrice(product, next.quantity);
        }
        return next;
      }),
    );
  }

  function addItem() {
    setItems((prev) => [...prev, { productId: "", quantity: "1", price: "" }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreateItems() {
    if (!accessToken || !user) return;
    const validItems = items.filter((it) => it.price.trim().length > 0);
    if (validItems.length === 0 || !deadline) return;

    setSaving(true);
    let createdCount = 0;
    try {
      for (const it of validItems) {
        const product = productOf(it.productId);
        const itemCurrency = product?.sell_price_currency ?? currency;
        const priceNumber = Number(it.price);
        if (!Number.isFinite(priceNumber) || priceNumber < 0) continue;
        const priceAmount = itemCurrency === "USD" ? Math.round(priceNumber * 100) : Math.round(priceNumber);
        const quantity = Math.max(1, Math.round(Number(it.quantity)) || 1);
        await salesApi.createSale(accessToken, {
          customer_id: customerId,
          responsible_user_id: responsibleUserId || user.id,
          currency: itemCurrency,
          price_amount: priceAmount,
          deadline: `${deadline}T00:00:00`,
          delivery_mode: deliveryMode || undefined,
          product_id: it.productId || undefined,
          quantity,
        });
        createdCount += 1;
      }
      toast.success(createdCount > 1 ? `${createdCount} ${t.createdMultiple}` : t.created);
      closeForm();
      await load(salesPage);
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 409 ? t.insufficientStock : t.genericError);
    } finally {
      setSaving(false);
    }
  }

  const canSubmitItems =
    deadline.length > 0 && items.some((it) => it.price.trim().length > 0 && Number(it.price) >= 0);

  return (
    <DashboardPageContainer>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 sm:mb-8">
        <div>
          <h1 className="font-heading mb-1 text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
          <p className="text-sm text-foreground-muted">{t.sub}</p>
        </div>
        <Button variant="gold" onClick={() => (formOpen ? closeForm() : openForm())}>
          {formOpen ? <X size={16} /> : <Plus size={16} />}
          {t.add}
        </Button>
      </div>

      {formOpen && (
        <div className="glass-card mb-6 p-5 sm:p-6">
          {/* Step 1: pick the customer -- every other step depends on this */}
          {step === "customer" && (
            <div className="mb-1">
              <label className="text-foreground mb-1.5 block text-sm font-medium">{t.customer}</label>
              <select
                value={customerId}
                onChange={(e) => handleCustomerChosen(e.target.value)}
                className="border-card-border bg-input-background text-foreground focus-visible:border-ring focus-visible:ring-ring/15 h-11 w-full rounded-xl border px-3.5 text-sm outline-none focus-visible:ring-[3px]"
              >
                <option value="">{t.selectCustomer}</option>
                {(customers ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} — {c.phone}
                  </option>
                ))}
              </select>

              {newCustomerOpen ? (
                <div className="border-card-border mt-4 rounded-xl border p-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      label={t.newCustomerName}
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      placeholder="Alisher Tursunov"
                      className="mb-0"
                    />
                    <FormField
                      label={t.newCustomerPhone}
                      type="tel"
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      placeholder="+998 90 123 45 67"
                      className="mb-0"
                    />
                  </div>

                  {phoneMatch && (
                    <div className="bg-warning/10 border-warning/30 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                      <span className="text-sm text-foreground">
                        {t.existingCustomerFound}: <span className="font-semibold">{phoneMatch.full_name}</span>
                      </span>
                      <Button variant="outline" size="sm" onClick={selectPhoneMatch}>
                        {t.useExistingCustomer}
                      </Button>
                    </div>
                  )}

                  <div className="mt-3 flex gap-3">
                    <Button
                      variant="gold"
                      size="sm"
                      disabled={!newCustomerName.trim() || !newCustomerPhone.trim() || creatingCustomer || !!phoneMatch}
                      onClick={handleCreateCustomerInline}
                    >
                      {creatingCustomer && <Loader2 size={14} className="animate-spin" />}
                      {t.create}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setNewCustomerOpen(false)}>
                      {t.cancel}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setNewCustomerOpen(true)}
                  className="text-primary mt-3 flex items-center gap-1.5 text-sm font-semibold"
                >
                  <Plus size={14} />
                  {t.addNewCustomer}
                </button>
              )}
            </div>
          )}

          {/* Step 2: checking for outstanding debts on this customer */}
          {step === "checking" && (
            <div className="flex items-center justify-center gap-3 py-8">
              <Loader2 size={20} className="text-primary animate-spin" />
              <span className="text-sm text-foreground-muted">{t.checkingDebts}</span>
            </div>
          )}

          {/* Step 3: customer has debt(s) -- ask what to do */}
          {step === "choice" && (
            <div>
              <button onClick={() => setStep("customer")} className="text-foreground-muted mb-4 flex items-center gap-1.5 text-xs">
                <ArrowLeft size={12} /> {t.back}
              </button>
              <div className="border-primary/25 bg-primary/8 mb-5 flex items-start gap-3 rounded-2xl border p-4">
                <ShieldAlert size={18} className="text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{t.debtFoundTitle}</p>
                  <p className="text-xs text-foreground-muted">{t.debtFoundDesc}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button variant="gold" onClick={() => setStep("debts")} className="justify-center">
                  <CreditCard size={16} />
                  {t.payDebt}
                </Button>
                <Button variant="outline" onClick={() => setStep("items")} className="justify-center">
                  <Plus size={16} />
                  {t.newSale}
                </Button>
              </div>
            </div>
          )}

          {/* Step 4a: pick which specific debt to pay off */}
          {step === "debts" && (
            <div>
              <button onClick={() => setStep("choice")} className="text-foreground-muted mb-4 flex items-center gap-1.5 text-xs">
                <ArrowLeft size={12} /> {t.back}
              </button>
              <p className="mb-3 text-sm font-semibold text-foreground">{t.chooseDebt}</p>
              <div className="flex flex-col gap-2">
                {outstanding.map((debt) => (
                  <button
                    key={debt.sale_id}
                    onClick={() => {
                      setSelectedDebt(debt);
                      setStep("debt-payment");
                    }}
                    className="border-card-border hover:border-primary/40 hover:bg-primary/5 flex items-center justify-between rounded-xl border p-3.5 text-left transition-colors"
                  >
                    <div>
                      <div className="text-sm font-semibold text-foreground">{debt.category_name ?? t.noCategory}</div>
                      <div className="text-xs text-foreground-muted">
                        {t.debtDeadline}: {new Date(debt.deadline).toLocaleDateString()}
                      </div>
                    </div>
                    <span className="font-mono text-sm font-bold text-primary">{formatMoney(debt.balance, debt.currency)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4b: pay the selected debt */}
          {step === "debt-payment" && selectedDebt && (
            <div>
              <button onClick={() => setStep("debts")} className="text-foreground-muted mb-4 flex items-center gap-1.5 text-xs">
                <ArrowLeft size={12} /> {t.back}
              </button>
              <div className="border-card-border mb-4 flex items-center justify-between rounded-xl border p-3.5">
                <span className="text-sm font-semibold text-foreground">{selectedDebt.category_name ?? t.noCategory}</span>
                <span className="font-mono text-sm font-bold text-primary">{formatMoney(selectedDebt.balance, selectedDebt.currency)}</span>
              </div>

              {!has2fa ? (
                <div className="border-primary/25 bg-primary/8 flex flex-wrap items-center gap-2 rounded-xl border p-3">
                  <ShieldAlert size={14} className="text-primary shrink-0" />
                  <span className="flex-1 text-xs text-foreground">{t.need2fa}</span>
                  <Link to="/dashboard/settings/2fa" className="text-primary text-xs font-semibold">
                    {t.enable2fa}
                  </Link>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      label={t.amount}
                      type="number"
                      min="0"
                      value={debtAmount}
                      onChange={(e) => setDebtAmount(e.target.value)}
                    />
                    <div>
                      <label className="text-foreground mb-1.5 block text-sm font-medium">{t.method}</label>
                      <select
                        value={debtMethod}
                        onChange={(e) => setDebtMethod(e.target.value as PaymentMethod)}
                        className="border-card-border bg-input-background text-foreground h-11 w-full rounded-xl border px-3 text-sm outline-none"
                      >
                        {(Object.keys(t.methods) as PaymentMethod[]).map((m) => (
                          <option key={m} value={m}>
                            {t.methods[m]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-3">
                    <Button variant="gold" disabled={saving || !debtAmount} onClick={handlePayDebt}>
                      {saving && <Loader2 size={16} className="animate-spin" />}
                      {t.payThisDebt}
                    </Button>
                    <Button variant="outline" onClick={closeForm}>
                      {t.cancel}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 5: new sale, one or more products for the same customer */}
          {step === "items" && (
            <div>
              <button onClick={() => setStep(outstanding.length > 0 ? "choice" : "customer")} className="text-foreground-muted mb-4 flex items-center gap-1.5 text-xs">
                <ArrowLeft size={12} /> {t.back}
              </button>

              <div className="mb-4">
                <label className="text-foreground mb-1.5 block text-sm font-medium">{t.customer}</label>
                <div className="border-card-border bg-input-background text-foreground h-11 flex items-center rounded-xl border px-3.5 text-sm">
                  {customerName(customerId)}
                </div>
              </div>

              <p className="text-foreground mb-2 text-sm font-medium">{t.items}</p>
              <div className="mb-4 flex flex-col gap-3">
                {items.map((item, i) => {
                  const selectedProduct = productOf(item.productId);
                  return (
                  <div key={i} className="border-card-border flex flex-wrap items-end gap-3 rounded-xl border p-3">
                    {products.length > 0 && (
                      <div className="min-w-[200px] flex-1">
                        <label className="text-foreground-muted mb-1 block text-xs">{t.product}</label>
                        <select
                          value={item.productId}
                          onChange={(e) => updateItem(i, { productId: e.target.value })}
                          className="border-card-border bg-input-background text-foreground h-10 w-full rounded-lg border px-3 text-sm outline-none"
                        >
                          <option value="">{t.noProduct}</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({t.stockLabel}: {p.stock_quantity})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {selectedProduct && (
                      <div className="w-24">
                        <label className="text-foreground-muted mb-1 block text-xs">{t.quantity}</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(i, { quantity: e.target.value })}
                          className="border-card-border bg-input-background text-foreground h-10 w-full rounded-lg border px-3 text-sm outline-none"
                        />
                      </div>
                    )}
                    <div className="w-32">
                      <label className="text-foreground-muted mb-1 block text-xs">{t.price}</label>
                      <input
                        type="number"
                        min="0"
                        value={item.price}
                        onChange={(e) => updateItem(i, { price: e.target.value })}
                        placeholder={currency === "USD" ? "150" : "1500000"}
                        className="border-card-border bg-input-background text-foreground h-10 w-full rounded-lg border px-3 text-sm outline-none"
                      />
                    </div>
                    {items.length > 1 && (
                      <button
                        onClick={() => removeItem(i)}
                        aria-label={t.removeProduct}
                        className="text-foreground-muted hover:text-destructive flex h-10 items-center px-1"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  );
                })}
              </div>
              <Button variant="outline" size="sm" onClick={addItem} className="mb-5">
                <Plus size={14} />
                {t.addProduct}
              </Button>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <FormField label={t.deadline} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mb-0" />
                <div>
                  <label className="text-foreground mb-1.5 block text-sm font-medium">{t.deliveryMode}</label>
                  <select
                    value={deliveryMode}
                    onChange={(e) => setDeliveryMode(e.target.value as DeliveryMode | "")}
                    className="border-card-border bg-input-background text-foreground focus-visible:border-ring focus-visible:ring-ring/15 h-11 w-full rounded-xl border px-3.5 text-sm outline-none focus-visible:ring-[3px]"
                  >
                    <option value="">{t.deliveryModeUnset}</option>
                    <option value="online">{t.deliveryModeOnline}</option>
                    <option value="offline">{t.deliveryModeOffline}</option>
                    <option value="intensive">{t.deliveryModeIntensive}</option>
                  </select>
                </div>
                {users && users.length > 1 && (
                  <div>
                    <label className="text-foreground mb-1.5 block text-sm font-medium">{t.responsibleEmployee}</label>
                    <select
                      value={responsibleUserId}
                      onChange={(e) => setResponsibleUserId(e.target.value)}
                      className="border-card-border bg-input-background text-foreground focus-visible:border-ring focus-visible:ring-ring/15 h-11 w-full rounded-xl border px-3.5 text-sm outline-none focus-visible:ring-[3px]"
                    >
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name || u.email || u.phone || u.id}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="mt-4 flex gap-3">
                <Button variant="gold" disabled={!canSubmitItems || saving} onClick={handleCreateItems}>
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  {t.create}
                </Button>
                <Button variant="outline" onClick={closeForm}>
                  {t.cancel}
                </Button>
              </div>
            </div>
          )}
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

      {!error && sales !== null && sales.length > 0 && (
        <SearchFilterBar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder={t.searchPlaceholder}
          filters={[
            { value: "all", label: t.all },
            { value: "active", label: t.statuses.active },
            { value: "completed", label: t.statuses.completed },
            { value: "cancelled", label: t.statuses.cancelled },
          ]}
          activeFilter={statusFilter}
          onFilterChange={setStatusFilter}
        />
      )}

      {!error && sales !== null && sales.length > 0 && accessToken && (
        // Each sale is its own spaced card, not one continuous divided list
        // (same "stuck together" feedback as Users) -- SaleRow renders its
        // own bg-card/rounded-[14px]/border/shadow shell now.
        <div className="flex flex-col gap-3">
          {visibleSales.map((s) => (
            <SaleRow
              key={s.id}
              sale={s}
              customerName={customerName(s.customer_id)}
              sellerName={sellerName(s.responsible_user_id)}
              accessToken={accessToken}
              has2fa={has2fa}
              t={t}
              onSaleUpdated={() => load(salesPage)}
            />
          ))}
        </div>
      )}

      {!error && sales !== null && sales.length > 0 && (
        <PaginationBar page={salesPage} totalPages={Math.ceil(salesTotal / SALES_PAGE_SIZE)} onChange={setSalesPage} />
      )}
    </DashboardPageContainer>
  );
}
