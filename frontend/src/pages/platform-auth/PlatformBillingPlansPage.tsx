import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { CheckCircle2, ChevronDown, ChevronUp, CreditCard, Loader2, Pencil, Plus, Sparkles, Star, X } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { usePlatformAuth } from "@/lib/auth/platformAuthStore";
import { ApiError } from "@/lib/api/client";
import * as billingApi from "@/lib/api/billing";
import type { BillingPlan, BillingPlanCreateParams } from "@/lib/api/billing";
import { formatMoney } from "@/lib/format/money";
import { bytesFromUnit, unitFromBytes, type StorageUnit } from "@/lib/format/storage";
import {
  FEATURE_CRM_INTEGRATIONS,
  FEATURE_META_ADS,
  FEATURE_TELEGRAM_NOTIFICATIONS,
  FEATURE_ADVANCED_REPORTS,
} from "@/lib/billing/features";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

// Mirrors backend/app/modules/billing/features.py's ALL_FEATURE_KEYS -- kept
// in sync manually (a small, stable, code-defined catalog, same as this
// page's own `content` translation objects below).
const FEATURE_KEYS = [FEATURE_CRM_INTEGRATIONS, FEATURE_META_ADS, FEATURE_TELEGRAM_NOTIFICATIONS, FEATURE_ADVANCED_REPORTS];

const content = {
  uz: {
    title: "Tarif rejalar",
    sub: "Mavjud tariflarni tahrirlang yoki yangi tarif qo'shing — o'zgarishlar darhol saytdagi narxlar bo'limida ko'rinadi.",
    newPlan: "Yangi tarif qo'shish",
    active: "Faol",
    inactive: "Nofaol",
    popular: "Mashhur",
    trialBadge: "Sinov",
    perMonth: "/oy",
    users: "foydalanuvchi",
    edit: "Tahrirlash",
    cancel: "Bekor qilish",
    save: "Saqlash",
    createTitle: "Yangi tarif",
    code: "Kod (slug)",
    codeHint: "Faqat kichik lotin harflari, raqam va tire — masalan: business-plus",
    nameField: "Nomi",
    price: "Narxi",
    currency: "Valyuta",
    period: "Davr (oy)",
    maxUsers: "Xodimlar limiti",
    maxStorage: "Xotira limiti",
    featuresUz: "Xususiyatlar (O'zbekcha, har birini yangi qatorga yozing)",
    featuresRu: "Xususiyatlar (Ruscha, har birini yangi qatorga yozing)",
    isPopular: "Mashhur sifatida belgilash",
    isActive: "Faol (saytda ko'rinadi)",
    isTrial: "Bepul sinov tarifi sifatida belgilash",
    trialDays: "Sinov muddati (kun)",
    features: "Premium funksiyalar",
    featureLabels: {
      crm_integrations: "CRM integratsiyalari (AmoCRM, Bitrix24)",
      meta_ads: "Meta Ads integratsiyasi",
      telegram_notifications: "Telegram bot bildirishnomalari",
      advanced_reports: "Kengaytirilgan hisobot eksporti",
    } as Record<string, string>,
    reason: "Sabab (audit uchun, kamida 3 belgi)",
    reasonPlaceholder: "Masalan: Yangi 'Premium' tarifi qo'shildi",
    create: "Tarifni yaratish",
    genericError: "Xatolik yuz berdi, qayta urinib ko'ring",
    codeTaken: "Bu kod band, boshqasini tanlang",
    trialTaken: "Sinov tarifi allaqachon mavjud — avval eskisini o'chiring",
    need2fa: "Tarif yaratish uchun avval hisobingizda 2FA yoqilgan bo'lishi kerak.",
    go2fa: "2FA sozlashga o'tish",
    noPlans: "Hozircha tariflar yo'q.",
    savedOk: "Saqlandi",
  },
  ru: {
    title: "Тарифные планы",
    sub: "Редактируйте существующие тарифы или добавьте новый — изменения сразу видны в разделе цен на сайте.",
    newPlan: "Добавить тариф",
    active: "Активен",
    inactive: "Неактивен",
    popular: "Популярный",
    trialBadge: "Пробный",
    perMonth: "/мес",
    users: "пользователей",
    edit: "Редактировать",
    cancel: "Отмена",
    save: "Сохранить",
    createTitle: "Новый тариф",
    code: "Код (slug)",
    codeHint: "Только строчные латинские буквы, цифры и дефис — например: business-plus",
    nameField: "Название",
    price: "Цена",
    currency: "Валюта",
    period: "Период (мес.)",
    maxUsers: "Лимит сотрудников",
    maxStorage: "Лимит хранилища",
    featuresUz: "Особенности (узб., каждая с новой строки)",
    featuresRu: "Особенности (рус., каждая с новой строки)",
    isPopular: "Отметить как популярный",
    isActive: "Активен (виден на сайте)",
    isTrial: "Отметить как бесплатный пробный тариф",
    trialDays: "Длительность пробного периода (дней)",
    features: "Премиум-функции",
    featureLabels: {
      crm_integrations: "CRM-интеграции (AmoCRM, Bitrix24)",
      meta_ads: "Интеграция Meta Ads",
      telegram_notifications: "Уведомления через Telegram-бота",
      advanced_reports: "Расширенный экспорт отчётов",
    } as Record<string, string>,
    reason: "Причина (для аудита, минимум 3 символа)",
    reasonPlaceholder: "Например: Добавлен новый тариф 'Premium'",
    create: "Создать тариф",
    genericError: "Произошла ошибка, попробуйте снова",
    codeTaken: "Этот код уже занят, выберите другой",
    trialTaken: "Пробный тариф уже существует — сначала удалите старый",
    need2fa: "Для создания тарифа сначала нужно включить 2FA в аккаунте.",
    go2fa: "Перейти к настройке 2FA",
    noPlans: "Пока нет тарифов.",
    savedOk: "Сохранено",
  },
};

function slugifyCode(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const emptyCreateForm = {
  code: "",
  name: "",
  price_amount: "",
  currency: "UZS",
  billing_period_months: "1",
  max_users: "",
  storage_value: "5",
  storage_unit: "GB" as StorageUnit,
  features_uz: "",
  features_ru: "",
  feature_keys: [] as string[],
  is_popular: false,
  is_active: true,
  is_trial: false,
  trial_days: "15",
  reason: "",
};

function toggleFeature(keys: string[], key: string): string[] {
  return keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
}

export function PlatformBillingPlansPage() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const { status, totpEnabled, accessToken } = usePlatformAuth();

  const [plans, setPlans] = useState<BillingPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<
    (BillingPlanCreateParams & { storage_value: string; storage_unit: StorageUnit }) | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  useEffect(() => {
    if (status === "anonymous") navigate("/platform/login", { replace: true });
  }, [status, navigate]);

  useEffect(() => {
    if (!accessToken) return;
    setLoadingPlans(true);
    billingApi
      .listPlatformPlans(accessToken)
      .then(setPlans)
      .catch(() => setError(t.genericError))
      .finally(() => setLoadingPlans(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  if (status !== "authenticated" || !accessToken) return null;

  if (!totpEnabled) {
    return (
      <main className="mx-auto max-w-[640px] px-4 py-8 sm:px-6 sm:py-10">
        <div className="glass-card p-6 text-center">
          <p className="text-foreground-muted mb-4 text-sm">{t.need2fa}</p>
          <Button variant="gold" size="lg" onClick={() => navigate("/platform/2fa-setup")}>
            {t.go2fa}
          </Button>
        </div>
      </main>
    );
  }

  const canSubmitCreate =
    /^[a-z0-9-]+$/.test(createForm.code) &&
    createForm.name.trim().length > 0 &&
    createForm.price_amount.trim().length > 0 &&
    createForm.max_users.trim().length > 0 &&
    createForm.storage_value.trim().length > 0 &&
    (!createForm.is_trial || Number(createForm.trial_days) > 0) &&
    createForm.reason.trim().length >= 3;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmitCreate || creating) return;
    setCreateError(null);
    setCreating(true);
    try {
      const created = await billingApi.createPlan(accessToken!, {
        code: createForm.code,
        name: createForm.name.trim(),
        price_amount: Number(createForm.price_amount),
        currency: createForm.currency,
        billing_period_months: Number(createForm.billing_period_months) || 1,
        max_users: Number(createForm.max_users),
        max_billable_storage_bytes: bytesFromUnit(Number(createForm.storage_value), createForm.storage_unit),
        features_uz: createForm.features_uz.split("\n").map((s) => s.trim()).filter(Boolean),
        features_ru: createForm.features_ru.split("\n").map((s) => s.trim()).filter(Boolean),
        feature_keys: createForm.feature_keys,
        is_popular: createForm.is_popular,
        is_active: createForm.is_active,
        is_trial: createForm.is_trial,
        trial_days: createForm.is_trial ? Number(createForm.trial_days) : null,
        reason: createForm.reason.trim(),
      });
      setPlans((prev) => [...(prev ?? []), created]);
      setCreateForm(emptyCreateForm);
      setShowCreate(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setCreateError(err.detail.toLowerCase().includes("trial") ? t.trialTaken : t.codeTaken);
      } else {
        setCreateError(err instanceof ApiError ? err.detail : t.genericError);
      }
    } finally {
      setCreating(false);
    }
  }

  function startEdit(plan: BillingPlan) {
    const { value, unit } = unitFromBytes(plan.max_billable_storage_bytes);
    setEditingCode(plan.code);
    setEditForm({
      code: plan.code,
      name: plan.name,
      price_amount: plan.price_amount,
      currency: plan.currency,
      billing_period_months: plan.billing_period_months,
      max_users: plan.max_users,
      max_billable_storage_bytes: plan.max_billable_storage_bytes,
      storage_value: String(value),
      storage_unit: unit,
      features_uz: plan.features_uz,
      features_ru: plan.features_ru,
      feature_keys: plan.feature_keys,
      is_popular: plan.is_popular,
      is_active: plan.is_active,
      is_trial: plan.is_trial,
      trial_days: plan.trial_days,
      reason: "",
    });
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm || !editingCode || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await billingApi.updatePlan(accessToken!, editingCode, {
        name: editForm.name,
        price_amount: editForm.price_amount,
        currency: editForm.currency,
        max_users: editForm.max_users,
        max_billable_storage_bytes: bytesFromUnit(Number(editForm.storage_value), editForm.storage_unit),
        features_uz: editForm.features_uz,
        features_ru: editForm.features_ru,
        feature_keys: editForm.feature_keys,
        is_popular: editForm.is_popular,
        is_active: editForm.is_active,
        is_trial: editForm.is_trial,
        trial_days: editForm.is_trial ? editForm.trial_days : null,
      });
      setPlans((prev) => (prev ?? []).map((p) => (p.code === updated.code ? updated : p)));
      setEditingCode(null);
      setEditForm(null);
      setSavedFlash(updated.code);
      setTimeout(() => setSavedFlash(null), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.genericError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-[900px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="border-primary/25 bg-primary/12 flex size-11 items-center justify-center rounded-2xl border">
            <CreditCard size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="font-heading text-xl font-extrabold text-foreground">{t.title}</h1>
            <p className="text-foreground-muted text-sm">{t.sub}</p>
          </div>
        </div>
        <Button variant="gold" size="sm" onClick={() => setShowCreate((s) => !s)}>
          {showCreate ? <X size={14} /> : <Plus size={14} />}
          {t.newPlan}
        </Button>
      </div>

      {error && <p className="text-destructive mb-4 text-[13px] font-medium">{error}</p>}

      {showCreate && (
        <form onSubmit={handleCreate} className="glass-card mb-6 p-6">
          <h2 className="mb-4 text-sm font-bold text-foreground">{t.createTitle}</h2>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <FormField
              label={t.code}
              placeholder="business-plus"
              value={createForm.code}
              onChange={(e) => setCreateForm((f) => ({ ...f, code: slugifyCode(e.target.value) }))}
              hint={t.codeHint}
            />
            <FormField
              label={t.nameField}
              placeholder="Business Plus"
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
            />
            <FormField
              label={t.price}
              type="number"
              min={0}
              value={createForm.price_amount}
              onChange={(e) => setCreateForm((f) => ({ ...f, price_amount: e.target.value }))}
            />
            <div className="mb-4">
              <Label className="mb-1.5">{t.currency}</Label>
              <select
                className="border-input-border bg-input h-11 w-full rounded-xl border px-3.5 text-sm text-foreground"
                value={createForm.currency}
                onChange={(e) => setCreateForm((f) => ({ ...f, currency: e.target.value }))}
              >
                <option value="UZS">UZS</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <FormField
              label={t.period}
              type="number"
              min={1}
              value={createForm.billing_period_months}
              onChange={(e) => setCreateForm((f) => ({ ...f, billing_period_months: e.target.value }))}
            />
            <FormField
              label={t.maxUsers}
              type="number"
              min={1}
              value={createForm.max_users}
              onChange={(e) => setCreateForm((f) => ({ ...f, max_users: e.target.value }))}
            />
            <div className="mb-4">
              <Label className="mb-1.5">{t.maxStorage}</Label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="border-input-border bg-input h-11 w-full rounded-xl border px-3.5 text-sm text-foreground"
                  value={createForm.storage_value}
                  onChange={(e) => setCreateForm((f) => ({ ...f, storage_value: e.target.value }))}
                />
                <select
                  className="border-input-border bg-input h-11 shrink-0 rounded-xl border px-3 text-sm text-foreground"
                  value={createForm.storage_unit}
                  onChange={(e) => setCreateForm((f) => ({ ...f, storage_unit: e.target.value as StorageUnit }))}
                >
                  <option value="MB">MB</option>
                  <option value="GB">GB</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <Label className="mb-1.5">{t.featuresUz}</Label>
            <textarea
              className="border-input-border bg-input min-h-[90px] w-full rounded-xl border px-3.5 py-2.5 text-sm text-foreground"
              value={createForm.features_uz}
              onChange={(e) => setCreateForm((f) => ({ ...f, features_uz: e.target.value }))}
            />
          </div>
          <div className="mb-4">
            <Label className="mb-1.5">{t.featuresRu}</Label>
            <textarea
              className="border-input-border bg-input min-h-[90px] w-full rounded-xl border px-3.5 py-2.5 text-sm text-foreground"
              value={createForm.features_ru}
              onChange={(e) => setCreateForm((f) => ({ ...f, features_ru: e.target.value }))}
            />
          </div>

          <div className="mb-4">
            <Label className="mb-2">{t.features}</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {FEATURE_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={createForm.feature_keys.includes(key)}
                    onChange={() => setCreateForm((f) => ({ ...f, feature_keys: toggleFeature(f.feature_keys, key) }))}
                  />
                  {t.featureLabels[key]}
                </label>
              ))}
            </div>
          </div>

          <div className="mb-5 flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={createForm.is_popular}
                onChange={(e) => setCreateForm((f) => ({ ...f, is_popular: e.target.checked }))}
              />
              {t.isPopular}
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={createForm.is_active}
                onChange={(e) => setCreateForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              {t.isActive}
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={createForm.is_trial}
                onChange={(e) => setCreateForm((f) => ({ ...f, is_trial: e.target.checked }))}
              />
              {t.isTrial}
            </label>
          </div>

          {createForm.is_trial && (
            <FormField
              label={t.trialDays}
              type="number"
              min={1}
              value={createForm.trial_days}
              onChange={(e) => setCreateForm((f) => ({ ...f, trial_days: e.target.value }))}
            />
          )}

          <FormField
            label={t.reason}
            placeholder={t.reasonPlaceholder}
            value={createForm.reason}
            onChange={(e) => setCreateForm((f) => ({ ...f, reason: e.target.value }))}
          />

          {createError && <p className="text-destructive mb-4 text-[13px] font-medium">{createError}</p>}

          <Button type="submit" variant="gold" size="lg" className="w-full" disabled={!canSubmitCreate || creating}>
            {creating && <Loader2 size={16} className="animate-spin" />}
            {t.create}
          </Button>
        </form>
      )}

      {loadingPlans && (
        <div className="text-foreground-muted flex items-center justify-center gap-2 py-16 text-sm">
          <Loader2 size={16} className="animate-spin" />
        </div>
      )}

      {!loadingPlans && plans && plans.length === 0 && (
        <p className="text-foreground-muted py-12 text-center text-sm">{t.noPlans}</p>
      )}

      <div className="grid gap-4">
        {plans?.map((plan) => {
          const isEditing = editingCode === plan.code;
          return (
            <div key={plan.code} className="glass-card p-5">
              {!isEditing ? (
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="font-heading text-base font-bold text-foreground">{plan.name}</h3>
                      {plan.is_trial && (
                        <span className="bg-secondary/12 text-secondary flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                          <Sparkles size={11} /> {t.trialBadge}
                        </span>
                      )}
                      {plan.is_popular && (
                        <span className="bg-primary/12 text-primary flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                          <Star size={11} /> {t.popular}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          plan.is_active ? "bg-success/12 text-success" : "bg-destructive/12 text-destructive"
                        }`}
                      >
                        {plan.is_active ? t.active : t.inactive}
                      </span>
                      {savedFlash === plan.code && (
                        <span className="text-success flex items-center gap-1 text-[11px] font-semibold">
                          <CheckCircle2 size={12} /> {t.savedOk}
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-foreground-muted mb-2 text-xs">{plan.code}</p>
                    <p className="text-foreground text-lg font-bold">
                      {formatMoney(plan.price_amount, plan.currency)}
                      <span className="text-foreground-muted text-sm font-normal">{t.perMonth}</span>
                    </p>
                    <p className="text-foreground-muted text-xs">
                      {plan.max_users} {t.users}
                    </p>
                    {plan.feature_keys.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {plan.feature_keys.map((key) => (
                          <span key={key} className="bg-accent text-foreground-muted rounded-md px-1.5 py-0.5 text-[10.5px]">
                            {t.featureLabels[key] ?? key}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => startEdit(plan)}>
                    <Pencil size={13} />
                    {t.edit}
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSaveEdit}>
                  <div className="grid gap-x-4 sm:grid-cols-2">
                    <FormField
                      label={t.nameField}
                      value={editForm!.name}
                      onChange={(e) => setEditForm((f) => (f ? { ...f, name: e.target.value } : f))}
                    />
                    <FormField
                      label={t.price}
                      type="number"
                      min={0}
                      value={editForm!.price_amount}
                      onChange={(e) => setEditForm((f) => (f ? { ...f, price_amount: Number(e.target.value) } : f))}
                    />
                    <div className="mb-4">
                      <Label className="mb-1.5">{t.currency}</Label>
                      <select
                        className="border-input-border bg-input h-11 w-full rounded-xl border px-3.5 text-sm text-foreground"
                        value={editForm!.currency}
                        onChange={(e) => setEditForm((f) => (f ? { ...f, currency: e.target.value } : f))}
                      >
                        <option value="UZS">UZS</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
                    <FormField
                      label={t.maxUsers}
                      type="number"
                      min={1}
                      value={editForm!.max_users}
                      onChange={(e) => setEditForm((f) => (f ? { ...f, max_users: Number(e.target.value) } : f))}
                    />
                    <div className="mb-4 sm:col-span-2">
                      <Label className="mb-1.5">{t.maxStorage}</Label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className="border-input-border bg-input h-11 w-full rounded-xl border px-3.5 text-sm text-foreground"
                          value={editForm!.storage_value}
                          onChange={(e) => setEditForm((f) => (f ? { ...f, storage_value: e.target.value } : f))}
                        />
                        <select
                          className="border-input-border bg-input h-11 shrink-0 rounded-xl border px-3 text-sm text-foreground"
                          value={editForm!.storage_unit}
                          onChange={(e) =>
                            setEditForm((f) => (f ? { ...f, storage_unit: e.target.value as StorageUnit } : f))
                          }
                        >
                          <option value="MB">MB</option>
                          <option value="GB">GB</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="mb-4">
                    <Label className="mb-1.5">{t.featuresUz}</Label>
                    <textarea
                      className="border-input-border bg-input min-h-[90px] w-full rounded-xl border px-3.5 py-2.5 text-sm text-foreground"
                      value={editForm!.features_uz.join("\n")}
                      onChange={(e) =>
                        setEditForm((f) => (f ? { ...f, features_uz: e.target.value.split("\n") } : f))
                      }
                    />
                  </div>
                  <div className="mb-4">
                    <Label className="mb-1.5">{t.featuresRu}</Label>
                    <textarea
                      className="border-input-border bg-input min-h-[90px] w-full rounded-xl border px-3.5 py-2.5 text-sm text-foreground"
                      value={editForm!.features_ru.join("\n")}
                      onChange={(e) =>
                        setEditForm((f) => (f ? { ...f, features_ru: e.target.value.split("\n") } : f))
                      }
                    />
                  </div>
                  <div className="mb-4">
                    <Label className="mb-2">{t.features}</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {FEATURE_KEYS.map((key) => (
                        <label key={key} className="flex items-center gap-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={editForm!.feature_keys.includes(key)}
                            onChange={() =>
                              setEditForm((f) => (f ? { ...f, feature_keys: toggleFeature(f.feature_keys, key) } : f))
                            }
                          />
                          {t.featureLabels[key]}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="mb-5 flex flex-wrap gap-6">
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={editForm!.is_popular}
                        onChange={(e) => setEditForm((f) => (f ? { ...f, is_popular: e.target.checked } : f))}
                      />
                      {t.isPopular}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={editForm!.is_active}
                        onChange={(e) => setEditForm((f) => (f ? { ...f, is_active: e.target.checked } : f))}
                      />
                      {t.isActive}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={editForm!.is_trial}
                        onChange={(e) => setEditForm((f) => (f ? { ...f, is_trial: e.target.checked } : f))}
                      />
                      {t.isTrial}
                    </label>
                  </div>
                  {editForm!.is_trial && (
                    <FormField
                      label={t.trialDays}
                      type="number"
                      min={1}
                      value={editForm!.trial_days ?? ""}
                      onChange={(e) => setEditForm((f) => (f ? { ...f, trial_days: Number(e.target.value) } : f))}
                    />
                  )}
                  <div className="flex gap-3">
                    <Button type="submit" variant="gold" size="sm" disabled={saving}>
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <ChevronUp size={14} />}
                      {t.save}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingCode(null);
                        setEditForm(null);
                      }}
                    >
                      <ChevronDown size={14} />
                      {t.cancel}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
