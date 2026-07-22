import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Loader2, Plus, Users, X } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as customersApi from "@/lib/api/customers";
import { CUSTOMERS_PAGE_SIZE } from "@/lib/api/customers";
import type { Customer, CustomerStage } from "@/lib/api/customers";
import { ApiError } from "@/lib/api/client";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "Mijozlar",
    sub: "Barcha lidlar va mijozlaringiz",
    add: "Yangi mijoz",
    name: "F.I.Sh.",
    phone: "Telefon raqami",
    stage: "Bosqich",
    create: "Qo'shish",
    cancel: "Bekor qilish",
    empty: "Hali mijozlar yo'q",
    emptyDesc: "Birinchi mijozingizni qo'shing.",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    duplicatePhone: "Bu telefon raqami bilan mijoz allaqachon mavjud",
    genericError: "Xatolik yuz berdi",
    created: "Mijoz qo'shildi",
    loadMore: "Ko'proq yuklash",
    stages: { lead: "Lid", qualified: "Malakali", customer: "Mijoz", lost: "Yo'qotilgan" } as Record<CustomerStage, string>,
  },
  ru: {
    title: "Клиенты",
    sub: "Все ваши лиды и клиенты",
    add: "Новый клиент",
    name: "ФИО",
    phone: "Номер телефона",
    stage: "Этап",
    create: "Добавить",
    cancel: "Отмена",
    empty: "Клиентов пока нет",
    emptyDesc: "Добавьте своего первого клиента.",
    loadError: "Не удалось загрузить данные",
    duplicatePhone: "Клиент с этим номером уже существует",
    genericError: "Произошла ошибка",
    created: "Клиент добавлен",
    loadMore: "Загрузить ещё",
    stages: { lead: "Лид", qualified: "Квалифицирован", customer: "Клиент", lost: "Потерян" } as Record<CustomerStage, string>,
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
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<CustomerStage>("lead");
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!accessToken) return;
    setError(null);
    try {
      const page = await customersApi.listCustomers(accessToken);
      setCustomers(page);
      setHasMore(page.length === CUSTOMERS_PAGE_SIZE);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.loadError);
    }
  }

  async function loadMore() {
    if (!accessToken || !customers) return;
    setLoadingMore(true);
    try {
      const page = await customersApi.listCustomers(accessToken, CUSTOMERS_PAGE_SIZE, customers.length);
      setCustomers([...customers, ...page]);
      setHasMore(page.length === CUSTOMERS_PAGE_SIZE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : t.loadError);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (accessToken) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function handleCreate() {
    if (!accessToken) return;
    setSaving(true);
    try {
      await customersApi.createCustomer(accessToken, { full_name: fullName.trim(), phone: phone.trim(), stage });
      toast.success(t.created);
      setFullName("");
      setPhone("");
      setStage("lead");
      setFormOpen(false);
      await load();
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

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
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
        <div className="glass-card overflow-hidden p-0">
          {customers.map((c, i) => (
            <div
              key={c.id}
              className={`flex items-center justify-between gap-3 p-4 sm:p-5 ${
                i < customers.length - 1 ? "border-b border-card-border/60" : ""
              }`}
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
              <span
                className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                style={{
                  background: `${STAGE_COLOR[c.stage]}15`,
                  borderColor: `${STAGE_COLOR[c.stage]}30`,
                  color: STAGE_COLOR[c.stage],
                }}
              >
                {t.stages[c.stage]}
              </span>
            </div>
          ))}
        </div>
      )}

      {!error && customers !== null && customers.length > 0 && hasMore && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" disabled={loadingMore} onClick={loadMore}>
            {loadingMore && <Loader2 size={16} className="animate-spin" />}
            {t.loadMore}
          </Button>
        </div>
      )}
    </main>
  );
}
