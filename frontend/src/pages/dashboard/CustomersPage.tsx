import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, ChevronDown, Loader2, Plus, Users, X } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as customersApi from "@/lib/api/customers";
import { CUSTOMERS_PAGE_SIZE } from "@/lib/api/customers";
import type { Customer, CustomerStage } from "@/lib/api/customers";
import { ApiError } from "@/lib/api/client";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { DashboardPageContainer } from "@/components/shared/DashboardPageContainer";
import { SearchFilterBar } from "@/components/shared/SearchFilterBar";
import { PaginationBar } from "@/components/shared/PaginationBar";

const content = {
  uz: {
    title: "Mijozlar",
    sub: "Barcha lidlar va mijozlaringiz",
    add: "Yangi mijoz",
    name: "F.I.Sh.",
    phone: "Telefon raqami",
    email: "Email",
    company: "Kompaniya",
    address: "Manzil / joylashuv",
    stage: "Bosqich",
    create: "Qo'shish",
    cancel: "Bekor qilish",
    empty: "Hali mijozlar yo'q",
    emptyDesc: "Birinchi mijozingizni qo'shing.",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    duplicatePhone: "Bu telefon raqami bilan mijoz allaqachon mavjud",
    genericError: "Xatolik yuz berdi",
    created: "Mijoz qo'shildi",
    stages: { lead: "Lid", qualified: "Malakali", customer: "Mijoz", lost: "Yo'qotilgan" } as Record<CustomerStage, string>,
    all: "Barchasi",
    searchPlaceholder: "Ism yoki telefon bo'yicha qidirish...",
  },
  ru: {
    title: "Клиенты",
    sub: "Все ваши лиды и клиенты",
    add: "Новый клиент",
    name: "ФИО",
    phone: "Номер телефона",
    email: "Email",
    company: "Компания",
    address: "Адрес / местоположение",
    stage: "Этап",
    create: "Добавить",
    cancel: "Отмена",
    empty: "Клиентов пока нет",
    emptyDesc: "Добавьте своего первого клиента.",
    loadError: "Не удалось загрузить данные",
    duplicatePhone: "Клиент с этим номером уже существует",
    genericError: "Произошла ошибка",
    created: "Клиент добавлен",
    stages: { lead: "Лид", qualified: "Квалифицирован", customer: "Клиент", lost: "Потерян" } as Record<CustomerStage, string>,
    all: "Все",
    searchPlaceholder: "Поиск по имени или телефону...",
  },
};

const STAGE_COLOR: Record<CustomerStage, string> = {
  lead: "#4C6FFF",
  qualified: "#F5A623",
  customer: "#2FBF71",
  lost: "#E5484D",
};

export function CustomersPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken } = useTenantAuth();

  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<CustomerStage | "all">("all");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [address, setAddress] = useState("");
  const [stage, setStage] = useState<CustomerStage>("lead");
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load(targetPage: number) {
    if (!accessToken) return;
    setError(null);
    try {
      const result = await customersApi.listCustomers(accessToken, CUSTOMERS_PAGE_SIZE, (targetPage - 1) * CUSTOMERS_PAGE_SIZE);
      setCustomers(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.loadError);
    }
  }

  useEffect(() => {
    if (accessToken) load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, page]);

  async function handleCreate() {
    if (!accessToken) return;
    setSaving(true);
    try {
      await customersApi.createCustomer(accessToken, {
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        company: company.trim() || undefined,
        address: address.trim() || undefined,
        stage,
      });
      toast.success(t.created);
      setFullName("");
      setPhone("");
      setEmail("");
      setCompany("");
      setAddress("");
      setStage("lead");
      setFormOpen(false);
      await load(page);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error(t.duplicatePhone);
      } else {
        toast.error(t.genericError);
      }
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = fullName.trim().length > 0 && phone.trim().length > 0;

  const visibleCustomers = (customers ?? []).filter((c) => {
    if (stageFilter !== "all" && c.stage !== stageFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return c.full_name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <DashboardPageContainer>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 sm:mb-8">
        <div>
          <h1 className="font-heading mb-1 text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
          <p className="text-sm text-foreground-muted">{t.sub}</p>
        </div>
        <Button variant="gold" onClick={() => setFormOpen((o) => !o)}>
          {formOpen ? <X size={16} /> : <Plus size={16} />}
          {t.add}
        </Button>
      </div>

      {formOpen && (
        <div className="glass-card mb-6 p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t.name} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Alisher Tursunov" />
            <FormField label={t.phone} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" />
            <FormField label={t.email} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alisher@company.com" />
            <FormField label={t.company} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Tizimly LLC" />
            <div className="sm:col-span-2">
              <FormField
                label={t.address}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Toshkent, Chilonzor tumani"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="text-foreground mb-1.5 block text-sm font-medium">{t.stage}</label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as CustomerStage)}
              className="border-card-border bg-input-background text-foreground focus-visible:border-ring focus-visible:ring-ring/15 h-11 w-full rounded-xl border px-3.5 text-sm outline-none focus-visible:ring-[3px] sm:w-56"
            >
              {(Object.keys(t.stages) as CustomerStage[]).map((s) => (
                <option key={s} value={s}>
                  {t.stages[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
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

      {!error && customers === null && (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="text-primary animate-spin" />
        </div>
      )}

      {!error && customers !== null && customers.length === 0 && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center sm:p-14">
          <Users size={32} className="text-foreground-muted" />
          <h2 className="font-heading text-lg font-bold text-foreground">{t.empty}</h2>
          <p className="max-w-md text-sm text-foreground-muted">{t.emptyDesc}</p>
        </div>
      )}

      {!error && customers !== null && customers.length > 0 && (
        <SearchFilterBar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder={t.searchPlaceholder}
          filters={[
            { value: "all", label: t.all },
            ...(Object.keys(t.stages) as CustomerStage[]).map((s) => ({ value: s, label: t.stages[s] })),
          ]}
          activeFilter={stageFilter}
          onFilterChange={setStageFilter}
        />
      )}

      {!error && customers !== null && customers.length > 0 && (
        // Each customer is its own spaced card (same "stuck together"
        // feedback as Users/Sales), and tapping the row expands to reveal
        // email/company/address alongside the phone number.
        <div className="flex flex-col gap-3">
          {visibleCustomers.map((c) => {
            const expanded = expandedId === c.id;
            return (
              <div key={c.id} className="bg-card/95 border-card-border overflow-hidden rounded-[14px] border shadow-sm">
                <button
                  className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left sm:p-5"
                  onClick={() => setExpandedId(expanded ? null : c.id)}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="bg-accent flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-foreground-muted">
                      {c.full_name
                        .split(" ")
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{c.full_name}</div>
                      <div className="font-mono truncate text-xs text-foreground-muted">{c.phone}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                      style={{
                        background: `${STAGE_COLOR[c.stage]}15`,
                        borderColor: `${STAGE_COLOR[c.stage]}30`,
                        color: STAGE_COLOR[c.stage],
                      }}
                    >
                      {t.stages[c.stage]}
                    </span>
                    <ChevronDown size={16} className={`text-foreground-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
                  </div>
                </button>
                {expanded && (
                  <div className="bg-background/40 border-card-border grid grid-cols-1 gap-3 border-t px-4 py-4 sm:grid-cols-2 sm:px-5">
                    <div>
                      <div className="text-foreground-muted text-[11px] font-semibold uppercase tracking-wide">{t.phone}</div>
                      <div className="font-mono text-sm text-foreground">{c.phone}</div>
                    </div>
                    <div>
                      <div className="text-foreground-muted text-[11px] font-semibold uppercase tracking-wide">{t.email}</div>
                      <div className="text-sm text-foreground">{c.email || "—"}</div>
                    </div>
                    <div>
                      <div className="text-foreground-muted text-[11px] font-semibold uppercase tracking-wide">{t.company}</div>
                      <div className="text-sm text-foreground">{c.company || "—"}</div>
                    </div>
                    <div>
                      <div className="text-foreground-muted text-[11px] font-semibold uppercase tracking-wide">{t.address}</div>
                      <div className="text-sm text-foreground">{c.address || "—"}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!error && customers !== null && customers.length > 0 && (
        <PaginationBar page={page} totalPages={Math.ceil(total / CUSTOMERS_PAGE_SIZE)} onChange={setPage} />
      )}
    </DashboardPageContainer>
  );
}
