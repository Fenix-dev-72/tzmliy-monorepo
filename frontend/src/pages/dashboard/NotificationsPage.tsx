import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Check, Copy, ExternalLink, Loader2, Pencil, Plus, Send, Trash2, UserX } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as notificationsApi from "@/lib/api/notifications";
import type {
  DeliveryLogEntry,
  GroupMapping,
  NotificationSchedule,
  OutboxMessage,
  ScheduleContentType,
  SchedulePeriod,
} from "@/lib/api/notifications";
import * as usersApi from "@/lib/api/users";
import { USERS_DROPDOWN_LIMIT } from "@/lib/api/users";
import type { TenantUserRow } from "@/lib/api/users";
import * as rolesApi from "@/lib/api/roles";
import type { Role } from "@/lib/api/roles";
import * as catalogApi from "@/lib/api/catalog";
import { flattenCategories } from "@/lib/api/catalog";
import { ApiError } from "@/lib/api/client";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { IntegrationCard } from "@/components/shared/IntegrationCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

const content = {
  uz: {
    title: "Bildirishnomalar",
    sub: "Telegram bot va guruh xabarlari",
    connect: "Ulash",
    connected: "Ulangan",
    save: "Saqlash",
    cancel: "Bekor qilish",
    botToken: "Bot tokeni",
    need2fa: "Sozlash uchun 2FA yoqilgan bo'lishi kerak.",
    genericError: "Xatolik yuz berdi",
    connectedToast: "Bot ulandi",
    disconnect: "Uzish",
    disconnectedToast: "Bot uzildi",
    botOnboarding: "Bot yo'q bo'lsa: Telegram'da @BotFather ga yozing, /newbot buyrug'i bilan yangi bot yarating va olingan tokenni shu yerga joylashtiring.",
    connectedAs: "Ulangan bot",
    mappingsTitle: "Guruh bog'lanishlari",
    label: "Nom",
    addMapping: "Guruhga qo'shish",
    addMappingOpened: "Telegram'da guruh tanlang",
    noMappings: "Hali bog'lanishlar yo'q",
    mappingSaved: "Guruh bog'landi",
    waitingForGroup: "Guruh tanlab, botni qo'shishingizni kutmoqdamiz...",
    fallbackHint: "Agar tugma orqali avtomatik ulanmasa, botni guruhga qo'lda qo'shib, guruhda quyidagi buyruqni yuboring:",
    copy: "Nusxalash",
    copied: "Nusxalandi",
    sendTitle: "Xabar yuborish",
    targetGroup: "Guruh",
    targetGroupDefault: "Standart guruh",
    messageText: "Xabar matni",
    send: "Yuborish",
    sent: "Yuborildi",
    telegramNotConfigured: "Avval Telegram botni ulang",
    noMappingFound: "Bu kategoriya uchun guruh bog'lanishi topilmadi",
    outboxTitle: "Chiquvchi xabarlar",
    noMessages: "Hali xabarlar yo'q",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    statusPending: "Kutilmoqda",
    statusSent: "Yuborilgan",
    statusFailed: "Xato",
    statusDeadLetter: "Bekor qilingan",
    scheduleTitle: "Rejalashtirilgan xabarlar",
    scheduleDesc: "Har biri o'z guruhi, vaqti va mazmuniga ega bir nechta avtomatik xabar yaratishingiz mumkin.",
    scheduleEnabled: "Yoqilgan",
    scheduleDisabled: "O'chirilgan",
    scheduleSave: "Saqlash",
    scheduleSaved: "Jadval saqlandi",
    scheduleDeleted: "Jadval o'chirildi",
    lastSent: "Oxirgi yuborilgan",
    never: "Hali yuborilmagan",
    scheduleGroup: "Qaysi guruhga",
    scheduleUsers: "Qaysi menejerlar (bo'sh = hammasi)",
    scheduleRoles: "Qaysi rollar (bo'sh = hammasi)",
    allUsers: "Hammasi",
    editMapping: "Guruhni tahrirlash",
    mappingCategory: "Kategoriya",
    mappingCategoryDefault: "Standart guruh",
    deactivateMapping: "Yashirish",
    confirmDeactivateMappingTitle: "Guruhni yashirasizmi?",
    confirmDeactivateMappingDesc: "Bu guruh endi xabar olmaydi, lekin ma'lumot saqlanadi -- xohlasangiz keyinroq qayta ulashingiz mumkin.",
    mappingUpdated: "Guruh yangilandi",
    mappingDeactivated: "Guruh yashirildi",
    mappingCategoryTaken: "Bu kategoriyaga boshqa guruh allaqachon bog'langan",
    deleteMapping: "O'chirish",
    confirmDeleteMappingTitle: "Guruhni butunlay o'chirasizmi?",
    confirmDeleteMappingDesc: "Bu amalni qaytarib bo'lmaydi.",
    mappingDeleted: "Guruh o'chirildi",
    mappingInUse: "Bu guruh jadval(lar) tomonidan ishlatilmoqda, avval ularni o'chiring yoki boshqa guruhga o'tkazing",
    addSchedule: "Yangi jadval",
    editSchedule: "Jadvalni tahrirlash",
    noSchedules: "Hali jadval yo'q",
    scheduleLabel: "Nom",
    scheduleContentType: "Xabar mazmuni",
    contentLeaderboard: "Jamoaviy reyting (kim qancha sotdi)",
    contentSellerKpis: "Bitta sotuvchi uchun batafsil hisobot",
    contentCustomText: "Erkin matn",
    schedulePeriod: "Davr",
    periodToday: "Bugun",
    periodWeek: "Shu hafta",
    periodMonth: "Shu oy",
    scheduleCustomText: "Xabar matni",
    scheduleDays: "Qaysi kunlar (bo'sh = har kuni)",
    days: ["Dush", "Sesh", "Chor", "Pay", "Jum", "Shan", "Yak"],
    seller_kpis_hint: "Bu tur uchun aynan bitta menejer tanlang",
  },
  ru: {
    title: "Уведомления",
    sub: "Telegram бот и групповые сообщения",
    connect: "Подключить",
    connected: "Подключено",
    save: "Сохранить",
    cancel: "Отмена",
    botToken: "Токен бота",
    need2fa: "Для настройки требуется включённая 2FA.",
    genericError: "Произошла ошибка",
    connectedToast: "Бот подключён",
    disconnect: "Отключить",
    disconnectedToast: "Бот отключён",
    botOnboarding: "Нет бота? Напишите @BotFather в Telegram, создайте бота командой /newbot и вставьте полученный токен сюда.",
    connectedAs: "Подключённый бот",
    mappingsTitle: "Привязки групп",
    label: "Название",
    addMapping: "Добавить в группу",
    addMappingOpened: "Выберите группу в Telegram",
    noMappings: "Привязок пока нет",
    mappingSaved: "Группа привязана",
    waitingForGroup: "Ожидаем, пока вы выберете группу и добавите бота...",
    fallbackHint: "Если автоматически не подключится, добавьте бота в группу вручную и отправьте в группе такую команду:",
    copy: "Копировать",
    copied: "Скопировано",
    sendTitle: "Отправить сообщение",
    targetGroup: "Группа",
    targetGroupDefault: "Группа по умолчанию",
    messageText: "Текст сообщения",
    send: "Отправить",
    sent: "Отправлено",
    telegramNotConfigured: "Сначала подключите Telegram бота",
    noMappingFound: "Привязка группы для этой категории не найдена",
    outboxTitle: "Исходящие сообщения",
    noMessages: "Сообщений пока нет",
    loadError: "Не удалось загрузить данные",
    statusPending: "Ожидает",
    statusSent: "Отправлено",
    statusFailed: "Ошибка",
    statusDeadLetter: "Отменено",
    scheduleTitle: "Запланированные сообщения",
    scheduleDesc: "Можно создать несколько автоматических рассылок, у каждой своя группа, время и содержание.",
    scheduleEnabled: "Включено",
    scheduleDisabled: "Выключено",
    scheduleSave: "Сохранить",
    scheduleSaved: "Расписание сохранено",
    scheduleDeleted: "Расписание удалено",
    lastSent: "Последняя отправка",
    never: "Ещё не отправлялось",
    scheduleGroup: "В какую группу",
    scheduleUsers: "Какие менеджеры (пусто = все)",
    scheduleRoles: "Какие роли (пусто = все)",
    allUsers: "Все",
    editMapping: "Редактировать группу",
    mappingCategory: "Категория",
    mappingCategoryDefault: "Группа по умолчанию",
    deactivateMapping: "Скрыть",
    confirmDeactivateMappingTitle: "Скрыть группу?",
    confirmDeactivateMappingDesc: "Эта группа больше не будет получать сообщения, но данные сохранятся -- позже можно подключить её снова.",
    mappingUpdated: "Группа обновлена",
    mappingDeactivated: "Группа скрыта",
    mappingCategoryTaken: "Другая группа уже привязана к этой категории",
    deleteMapping: "Удалить",
    confirmDeleteMappingTitle: "Удалить группу навсегда?",
    confirmDeleteMappingDesc: "Это действие необратимо.",
    mappingDeleted: "Группа удалена",
    mappingInUse: "Эта группа используется в расписании(ях) -- сначала удалите их или назначьте другую группу",
    addSchedule: "Новое расписание",
    editSchedule: "Редактировать расписание",
    noSchedules: "Расписаний пока нет",
    scheduleLabel: "Название",
    scheduleContentType: "Содержание сообщения",
    contentLeaderboard: "Командный рейтинг (кто сколько продал)",
    contentSellerKpis: "Подробный отчёт по одному менеджеру",
    contentCustomText: "Произвольный текст",
    schedulePeriod: "Период",
    periodToday: "Сегодня",
    periodWeek: "Эта неделя",
    periodMonth: "Этот месяц",
    scheduleCustomText: "Текст сообщения",
    scheduleDays: "Какие дни (пусто = каждый день)",
    days: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
    seller_kpis_hint: "Для этого типа выберите ровно одного менеджера",
  },
};

export function NotificationsPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken, user } = useTenantAuth();
  const has2fa = Boolean(user?.totp_enabled);
  const canView = (user?.permissions ?? []).includes("notifications.view");
  const canManage = (user?.permissions ?? []).includes("notifications.manage");

  const [configured, setConfigured] = useState(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [mappings, setMappings] = useState<GroupMapping[]>([]);
  const [messages, setMessages] = useState<OutboxMessage[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deliveryLogs, setDeliveryLogs] = useState<Record<string, DeliveryLogEntry[]>>({});
  const [error, setError] = useState<string | null>(null);

  const [mappingLabel, setMappingLabel] = useState("");
  const [mappingSaving, setMappingSaving] = useState(false);
  const [groupDeepLink, setGroupDeepLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Telegram's ?startgroup=<token> deep link is supposed to deliver the
  // token back automatically, but this was observed to not carry through
  // reliably in real testing (client/version-dependent Telegram behavior,
  // not something we control) -- the token is still embedded in the deep
  // link's query string, so it's extracted here to offer a guaranteed-to-work
  // manual fallback (`/link <token>`, a plain typed message).
  const groupLinkToken = groupDeepLink ? new URL(groupDeepLink).searchParams.get("startgroup") : null;
  const pollingRef = useRef(false);

  const [messageText, setMessageText] = useState("");
  const [messageGroupId, setMessageGroupId] = useState("");
  const [sending, setSending] = useState(false);

  const [tenantUsers, setTenantUsers] = useState<TenantUserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [categories, setCategories] = useState<{ id: string; label: string }[]>([]);

  const [schedules, setSchedules] = useState<NotificationSchedule[]>([]);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [scheduleLabel, setScheduleLabel] = useState("");
  const [scheduleTime, setScheduleTime] = useState("18:00");
  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [scheduleGroupId, setScheduleGroupId] = useState("");
  const [scheduleContentType, setScheduleContentType] = useState<ScheduleContentType>("leaderboard");
  const [schedulePeriod, setSchedulePeriod] = useState<SchedulePeriod>("today");
  const [scheduleCustomText, setScheduleCustomText] = useState("");
  const [scheduleDays, setScheduleDays] = useState<number[]>([]);
  const [scheduleUserIds, setScheduleUserIds] = useState<string[]>([]);
  const [scheduleRoleIds, setScheduleRoleIds] = useState<string[]>([]);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleDeleteTarget, setScheduleDeleteTarget] = useState<NotificationSchedule | null>(null);
  const [scheduleDeleting, setScheduleDeleting] = useState(false);

  const [editTarget, setEditTarget] = useState<GroupMapping | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<GroupMapping | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GroupMapping | null>(null);
  const [deleting, setDeleting] = useState(false);

  const statusLabels: Record<string, string> = {
    pending: t.statusPending,
    sent: t.statusSent,
    failed: t.statusFailed,
    dead_letter: t.statusDeadLetter,
  };

  async function load() {
    if (!accessToken || !canView) return;
    setError(null);
    try {
      const [status, mappingsData, messagesData, schedulesData] = await Promise.all([
        notificationsApi.getTelegramStatus(accessToken),
        notificationsApi.listGroupMappings(accessToken),
        notificationsApi.listMessages(accessToken),
        canManage ? notificationsApi.listSchedules(accessToken) : Promise.resolve<NotificationSchedule[]>([]),
      ]);
      setConfigured(status.configured);
      setBotUsername(status.bot_username ?? null);
      setMappings(mappingsData);
      setMessages(messagesData);
      setSchedules(schedulesData);
      // Only needed for the schedule's manager filter -- best-effort, a role
      // with notifications.manage but not users.view (not a default
      // combination, but custom roles can do anything) just won't get the
      // per-manager filter option, not a hard failure.
      if (canManage) {
        usersApi
          .listUsers(accessToken, USERS_DROPDOWN_LIMIT)
          .then(setTenantUsers)
          .catch(() => {});
        rolesApi
          .listRoles(accessToken)
          .then(setRoles)
          .catch(() => {});
        catalogApi
          .listCategories(accessToken)
          .then((tree) => setCategories(flattenCategories(tree)))
          .catch(() => {});
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.loadError);
    }
  }

  function openAddSchedule() {
    setEditingScheduleId(null);
    setScheduleLabel("");
    setScheduleTime("18:00");
    setScheduleEnabled(true);
    setScheduleGroupId("");
    setScheduleContentType("leaderboard");
    setSchedulePeriod("today");
    setScheduleCustomText("");
    setScheduleDays([]);
    setScheduleUserIds([]);
    setScheduleRoleIds([]);
    setScheduleDialogOpen(true);
  }

  function openEditSchedule(s: NotificationSchedule) {
    setEditingScheduleId(s.id);
    setScheduleLabel(s.label);
    setScheduleTime(s.send_time.slice(0, 5));
    setScheduleEnabled(s.is_enabled);
    setScheduleGroupId(s.group_mapping_id ?? "");
    setScheduleContentType(s.content_type);
    setSchedulePeriod(s.period);
    setScheduleCustomText(s.custom_text ?? "");
    setScheduleDays(s.days_of_week ?? []);
    setScheduleUserIds(s.user_ids ?? []);
    setScheduleRoleIds(s.role_ids ?? []);
    setScheduleDialogOpen(true);
  }

  async function handleSaveSchedule() {
    if (!accessToken) return;
    setScheduleSaving(true);
    try {
      const body = {
        label: scheduleLabel.trim(),
        send_time: `${scheduleTime}:00`,
        days_of_week: scheduleDays.length > 0 ? scheduleDays : undefined,
        is_enabled: scheduleEnabled,
        group_mapping_id: scheduleGroupId || undefined,
        content_type: scheduleContentType,
        period: schedulePeriod,
        custom_text: scheduleContentType === "custom_text" ? scheduleCustomText.trim() : undefined,
        user_ids: scheduleUserIds.length > 0 ? scheduleUserIds : undefined,
        role_ids: scheduleContentType === "seller_kpis" ? undefined : scheduleRoleIds.length > 0 ? scheduleRoleIds : undefined,
      };
      const res = editingScheduleId
        ? await notificationsApi.updateSchedule(accessToken, editingScheduleId, body)
        : await notificationsApi.createSchedule(accessToken, body);
      setSchedules((prev) =>
        editingScheduleId ? prev.map((s) => (s.id === res.id ? res : s)) : [...prev, res],
      );
      toast.success(t.scheduleSaved);
      setScheduleDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
    } finally {
      setScheduleSaving(false);
    }
  }

  async function handleDeleteSchedule() {
    if (!accessToken || !scheduleDeleteTarget) return;
    setScheduleDeleting(true);
    try {
      await notificationsApi.deleteSchedule(accessToken, scheduleDeleteTarget.id);
      setSchedules((prev) => prev.filter((s) => s.id !== scheduleDeleteTarget.id));
      toast.success(t.scheduleDeleted);
      setScheduleDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
    } finally {
      setScheduleDeleting(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function handleConnect(values: Record<string, string>) {
    if (!accessToken) return;
    try {
      await notificationsApi.configureTelegramBot(accessToken, values.bot_token);
      toast.success(t.connectedToast);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
    }
  }

  async function handleDisconnect() {
    if (!accessToken) return;
    try {
      await notificationsApi.disconnectTelegramBot(accessToken);
      toast.success(t.disconnectedToast);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
    }
  }

  async function handleCreateMapping() {
    if (!accessToken || !mappingLabel.trim()) return;
    setMappingSaving(true);
    try {
      const res = await notificationsApi.createGroupLinkToken(accessToken, { label: mappingLabel.trim() });
      setGroupDeepLink(res.deep_link);
      window.open(res.deep_link, "_blank", "noreferrer");
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
    } finally {
      setMappingSaving(false);
    }
  }

  // Poll for the new mapping while a "add to group" request is pending --
  // the bot only gets added (and the chat_id discovered) once the admin
  // actually picks a group in Telegram, an action this page can't observe
  // except by asking the mapping list again.
  useEffect(() => {
    if (!groupDeepLink || pollingRef.current) return;
    pollingRef.current = true;
    const startCount = mappings.length;
    const interval = setInterval(async () => {
      const fresh = await notificationsApi.listGroupMappings(accessToken!).catch(() => null);
      if (fresh && fresh.length > startCount) {
        setMappings(fresh);
        setGroupDeepLink(null);
        setMappingLabel("");
        toast.success(t.mappingSaved);
        clearInterval(interval);
        pollingRef.current = false;
      }
    }, 3000);
    return () => {
      clearInterval(interval);
      pollingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupDeepLink]);

  function openEditMapping(m: GroupMapping) {
    setEditTarget(m);
    setEditLabel(m.label);
    setEditCategoryId(m.category_id ?? "");
  }

  async function handleSaveMappingEdit() {
    if (!accessToken || !editTarget) return;
    setEditSaving(true);
    try {
      const updated = await notificationsApi.updateGroupMapping(accessToken, editTarget.id, {
        label: editLabel.trim(),
        category_id: editCategoryId || null,
      });
      setMappings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      toast.success(t.mappingUpdated);
      setEditTarget(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) toast.error(t.mappingCategoryTaken);
      else toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeactivateMapping() {
    if (!accessToken || !deactivateTarget) return;
    setDeactivating(true);
    try {
      await notificationsApi.deactivateGroupMapping(accessToken, deactivateTarget.id);
      setMappings((prev) => prev.filter((m) => m.id !== deactivateTarget.id));
      toast.success(t.mappingDeactivated);
      setDeactivateTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
    } finally {
      setDeactivating(false);
    }
  }

  async function handleDeleteMapping() {
    if (!accessToken || !deleteTarget) return;
    setDeleting(true);
    try {
      await notificationsApi.deleteGroupMapping(accessToken, deleteTarget.id);
      setMappings((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      toast.success(t.mappingDeleted);
      setDeleteTarget(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) toast.error(t.mappingInUse);
      else toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
    } finally {
      setDeleting(false);
    }
  }

  async function handleSend() {
    if (!accessToken || !messageText.trim()) return;
    setSending(true);
    try {
      await notificationsApi.sendMessage(accessToken, {
        text: messageText.trim(),
        group_mapping_id: messageGroupId || undefined,
      });
      toast.success(t.sent);
      setMessageText("");
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.detail.toLowerCase().includes("not configured")) {
        toast.error(t.telegramNotConfigured);
      } else if (err instanceof ApiError && err.status === 404) {
        toast.error(t.noMappingFound);
      } else {
        toast.error(t.genericError);
      }
    } finally {
      setSending(false);
    }
  }

  async function handleExpand(msg: OutboxMessage) {
    if (expandedId === msg.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(msg.id);
    if (!accessToken || msg.id in deliveryLogs) return;
    try {
      const logs = await notificationsApi.listDeliveryLog(accessToken, msg.id);
      setDeliveryLogs((prev) => ({ ...prev, [msg.id]: logs }));
    } catch {
      setDeliveryLogs((prev) => ({ ...prev, [msg.id]: [] }));
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-heading mb-1 text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
        <p className="text-sm text-foreground-muted">{t.sub}</p>
      </div>

      {!has2fa && canManage && (
        <div className="border-primary/25 bg-primary/8 mb-6 flex items-center gap-3 rounded-2xl border p-4">
          <span className="flex-1 text-sm text-foreground">{t.need2fa}</span>
        </div>
      )}

      <div className="mb-6 max-w-md">
        <IntegrationCard
          icon={Send}
          brandColor="#4C6FFF"
          name="Telegram"
          connected={configured}
          connectLabel={t.connect}
          connectedLabel={botUsername ? `${t.connected} (@${botUsername})` : t.connected}
          submitLabel={t.save}
          fields={[{ key: "bot_token", label: t.botToken, secret: true }]}
          onSubmit={handleConnect}
          onDisconnect={handleDisconnect}
          disconnectLabel={t.disconnect}
        />
        {!configured && <p className="mt-2 text-xs text-foreground-muted">{t.botOnboarding}</p>}
      </div>

      {error && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle size={28} className="text-destructive" />
          <p className="text-sm text-foreground-muted">{error}</p>
        </div>
      )}

      {!error && canView && (
        <>
          <div className="glass-card mb-6 p-5 sm:p-6">
            <h2 className="mb-4 text-sm font-bold text-foreground">{t.mappingsTitle}</h2>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t.label} value={mappingLabel} onChange={(e) => setMappingLabel(e.target.value)} placeholder="Sotuvlar guruhi" className="mb-0" />
              <Button
                variant="gold"
                size="sm"
                disabled={!mappingLabel.trim() || mappingSaving || Boolean(groupDeepLink)}
                onClick={handleCreateMapping}
                className="h-11 self-end"
              >
                {mappingSaving && <Loader2 size={14} className="animate-spin" />}
                {t.addMapping}
              </Button>
            </div>
            {groupDeepLink && (
              <div className="border-primary/25 bg-primary/8 mb-4 rounded-xl border p-3">
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="text-primary animate-spin" />
                  <span className="text-sm text-foreground">{t.waitingForGroup}</span>
                  <a href={groupDeepLink} target="_blank" rel="noreferrer" className="text-primary ml-auto flex items-center gap-1 text-xs font-medium hover:underline">
                    {t.addMappingOpened} <ExternalLink size={12} />
                  </a>
                </div>
                {groupLinkToken && (
                  <div className="mt-3 border-t border-primary/15 pt-3">
                    <p className="mb-1.5 text-xs text-foreground-muted">{t.fallbackHint}</p>
                    <div className="flex items-center gap-2">
                      <code className="bg-background/60 flex-1 truncate rounded-lg px-2.5 py-1.5 text-xs text-foreground">
                        /link {groupLinkToken}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0 px-2"
                        onClick={async () => {
                          await navigator.clipboard.writeText(`/link ${groupLinkToken}`);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                      >
                        {copied ? <Check size={13} /> : <Copy size={13} />}
                        {copied ? t.copied : t.copy}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {mappings.length === 0 ? (
              <p className="text-xs text-foreground-muted">{t.noMappings}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {mappings.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <span className="text-foreground">{m.resolved_title || m.label}</span>
                      <span className="font-mono ml-2 text-xs text-foreground-muted">{m.telegram_chat_id}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => openEditMapping(m)}
                        className="text-foreground-muted border-card-border bg-background/60 flex size-7 items-center justify-center rounded-lg border"
                        aria-label={t.editMapping}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => setDeactivateTarget(m)}
                        className="text-foreground-muted border-card-border bg-background/60 flex size-7 items-center justify-center rounded-lg border"
                        aria-label={t.deactivateMapping}
                      >
                        <UserX size={12} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(m)}
                        className="text-destructive border-destructive/25 bg-destructive/10 flex size-7 items-center justify-center rounded-lg border"
                        aria-label={t.deleteMapping}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {canManage && (
            <div className="glass-card mb-6 p-5 sm:p-6">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground">{t.scheduleTitle}</h2>
                <Button variant="gold" size="sm" onClick={openAddSchedule} className="h-9">
                  <Plus size={14} />
                  {t.addSchedule}
                </Button>
              </div>
              <p className="mb-4 text-xs text-foreground-muted">{t.scheduleDesc}</p>
              {schedules.length === 0 ? (
                <p className="text-xs text-foreground-muted">{t.noSchedules}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {schedules.map((s) => {
                    const groupLabel = mappings.find((m) => m.id === s.group_mapping_id)?.label ?? t.targetGroupDefault;
                    const contentLabel =
                      s.content_type === "leaderboard" ? t.contentLeaderboard : s.content_type === "seller_kpis" ? t.contentSellerKpis : t.contentCustomText;
                    return (
                      <div key={s.id} className="border-card-border rounded-xl border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{s.label || s.send_time.slice(0, 5)}</p>
                            <p className="text-xs text-foreground-muted">
                              {s.send_time.slice(0, 5)} · {groupLabel} · {contentLabel}
                            </p>
                            <p className="text-xs text-foreground-muted">{t.lastSent}: {s.last_sent_date ?? t.never}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span
                              className={`rounded-md border px-2 py-0.5 text-xs font-medium ${s.is_enabled ? "border-success/25 bg-success/12 text-success" : "border-border text-foreground-muted"}`}
                            >
                              {s.is_enabled ? t.scheduleEnabled : t.scheduleDisabled}
                            </span>
                            <button
                              onClick={() => openEditSchedule(s)}
                              className="text-foreground-muted border-card-border bg-background/60 flex size-7 items-center justify-center rounded-lg border"
                              aria-label={t.editSchedule}
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => setScheduleDeleteTarget(s)}
                              className="text-destructive border-destructive/25 bg-destructive/10 flex size-7 items-center justify-center rounded-lg border"
                              aria-label={t.scheduleDeleted}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {canManage && (
            <div className="glass-card mb-6 p-5 sm:p-6">
              <h2 className="mb-4 text-sm font-bold text-foreground">{t.sendTitle}</h2>
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-foreground-muted">{t.targetGroup}</label>
                <select
                  value={messageGroupId}
                  onChange={(e) => setMessageGroupId(e.target.value)}
                  className="border-card-border bg-input-background h-11 w-full rounded-xl border px-3.5 text-sm text-foreground outline-none"
                >
                  <option value="">{t.targetGroupDefault}</option>
                  {mappings.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <FormField label={t.messageText} value={messageText} onChange={(e) => setMessageText(e.target.value)} />
              <Button variant="gold" size="sm" disabled={!messageText.trim() || sending} onClick={handleSend}>
                {sending && <Loader2 size={14} className="animate-spin" />}
                {t.send}
              </Button>
            </div>
          )}

          <h2 className="font-heading mb-3 text-base font-bold text-foreground">{t.outboxTitle}</h2>
          {messages === null ? (
            <div className="flex justify-center py-12">
              <Loader2 size={24} className="text-primary animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <p className="glass-card py-10 text-center text-sm text-foreground-muted">{t.noMessages}</p>
          ) : (
            <div className="glass-card overflow-hidden p-0">
              {messages.map((msg, i) => (
                <div key={msg.id} className={i < messages.length - 1 ? "border-b border-card-border/60" : ""}>
                  <button
                    onClick={() => handleExpand(msg)}
                    className="hover:bg-accent/40 flex w-full items-center justify-between gap-3 p-4 text-left transition-colors"
                  >
                    <span className="truncate text-sm text-foreground">
                      {msg.text_body ?? msg.document_filename ?? "—"}
                    </span>
                    <StatusBadge status={msg.status} label={statusLabels[msg.status] ?? msg.status} />
                  </button>
                  {expandedId === msg.id && (
                    <div className="bg-background/40 px-4 pb-4">
                      {(deliveryLogs[msg.id] ?? []).length === 0 ? (
                        <Loader2 size={14} className="text-primary animate-spin" />
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {deliveryLogs[msg.id].map((log) => (
                            <div key={log.id} className="flex items-center justify-between text-xs">
                              <span className="text-foreground-muted">
                                #{log.attempt_number} · {new Date(log.attempted_at).toLocaleString()}
                              </span>
                              <span className={log.status === "success" ? "text-success" : "text-destructive"}>
                                {log.error ?? log.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={editTarget !== null}
        title={t.editMapping}
        confirmLabel={t.save}
        cancelLabel={t.cancel}
        loading={editSaving}
        onConfirm={handleSaveMappingEdit}
        onCancel={() => setEditTarget(null)}
      >
        <div className="mb-2">
          <FormField label={t.label} value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
          <div className="mb-3">
            <label className="mb-1.5 block text-sm font-medium text-foreground">{t.mappingCategory}</label>
            <select
              value={editCategoryId}
              onChange={(e) => setEditCategoryId(e.target.value)}
              className="border-card-border bg-input-background text-foreground h-11 w-full rounded-xl border px-3.5 text-sm outline-none"
            >
              <option value="">{t.mappingCategoryDefault}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={deactivateTarget !== null}
        title={t.confirmDeactivateMappingTitle}
        description={t.confirmDeactivateMappingDesc}
        confirmLabel={t.deactivateMapping}
        cancelLabel={t.cancel}
        destructive
        loading={deactivating}
        onConfirm={handleDeactivateMapping}
        onCancel={() => setDeactivateTarget(null)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t.confirmDeleteMappingTitle}
        description={t.confirmDeleteMappingDesc}
        confirmLabel={t.deleteMapping}
        cancelLabel={t.cancel}
        destructive
        loading={deleting}
        onConfirm={handleDeleteMapping}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={scheduleDialogOpen}
        title={editingScheduleId ? t.editSchedule : t.addSchedule}
        confirmLabel={t.scheduleSave}
        cancelLabel={t.cancel}
        loading={scheduleSaving}
        onConfirm={handleSaveSchedule}
        onCancel={() => setScheduleDialogOpen(false)}
      >
        <div className="mb-2 flex flex-col gap-3">
          <FormField label={t.scheduleLabel} value={scheduleLabel} onChange={(e) => setScheduleLabel(e.target.value)} className="mb-0" />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="" type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="mb-0" />
            <button
              type="button"
              onClick={() => setScheduleEnabled((v) => !v)}
              className={`h-11 rounded-lg border px-3 text-sm font-medium ${scheduleEnabled ? "border-success/25 bg-success/12 text-success" : "border-border text-foreground-muted"}`}
            >
              {scheduleEnabled ? t.scheduleEnabled : t.scheduleDisabled}
            </button>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">{t.scheduleGroup}</label>
            <select
              value={scheduleGroupId}
              onChange={(e) => setScheduleGroupId(e.target.value)}
              className="border-card-border bg-input-background text-foreground h-11 w-full rounded-xl border px-3.5 text-sm outline-none"
            >
              <option value="">{t.targetGroupDefault}</option>
              {mappings.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.resolved_title || m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">{t.scheduleDays}</label>
            <div className="flex flex-wrap gap-2">
              {t.days.map((d, idx) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setScheduleDays((prev) => (prev.includes(idx) ? prev.filter((v) => v !== idx) : [...prev, idx]))}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${scheduleDays.includes(idx) ? "border-primary/40 bg-primary/12 text-primary" : "border-card-border text-foreground-muted"}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">{t.scheduleContentType}</label>
            <select
              value={scheduleContentType}
              onChange={(e) => setScheduleContentType(e.target.value as ScheduleContentType)}
              className="border-card-border bg-input-background text-foreground h-11 w-full rounded-xl border px-3.5 text-sm outline-none"
            >
              <option value="leaderboard">{t.contentLeaderboard}</option>
              <option value="seller_kpis">{t.contentSellerKpis}</option>
              <option value="custom_text">{t.contentCustomText}</option>
            </select>
          </div>
          {scheduleContentType !== "custom_text" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">{t.schedulePeriod}</label>
              <select
                value={schedulePeriod}
                onChange={(e) => setSchedulePeriod(e.target.value as SchedulePeriod)}
                className="border-card-border bg-input-background text-foreground h-11 w-full rounded-xl border px-3.5 text-sm outline-none"
              >
                <option value="today">{t.periodToday}</option>
                <option value="week">{t.periodWeek}</option>
                <option value="month">{t.periodMonth}</option>
              </select>
            </div>
          )}
          {scheduleContentType === "custom_text" && (
            <FormField
              label={t.scheduleCustomText}
              value={scheduleCustomText}
              onChange={(e) => setScheduleCustomText(e.target.value)}
              className="mb-0"
            />
          )}
          {scheduleContentType === "seller_kpis" && <p className="text-xs text-foreground-muted">{t.seller_kpis_hint}</p>}
          {scheduleContentType !== "custom_text" && roles.length > 0 && scheduleContentType !== "seller_kpis" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">{t.scheduleRoles}</label>
              <div className="flex flex-wrap gap-3 rounded-xl border border-card-border p-2">
                {roles.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={scheduleRoleIds.includes(r.id)}
                      onChange={(e) =>
                        setScheduleRoleIds((ids) => (e.target.checked ? [...ids, r.id] : ids.filter((id) => id !== r.id)))
                      }
                    />
                    {r.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          {tenantUsers.length > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">{t.scheduleUsers}</label>
              <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto rounded-xl border border-card-border p-2">
                {tenantUsers.map((u) => {
                  const checked = scheduleUserIds.includes(u.id);
                  const disabled = scheduleContentType === "seller_kpis" && !checked && scheduleUserIds.length >= 1;
                  return (
                    <label key={u.id} className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={(e) =>
                          setScheduleUserIds((ids) => {
                            if (scheduleContentType === "seller_kpis") return e.target.checked ? [u.id] : [];
                            return e.target.checked ? [...ids, u.id] : ids.filter((id) => id !== u.id);
                          })
                        }
                      />
                      {u.full_name ?? u.email ?? u.phone}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={scheduleDeleteTarget !== null}
        title={t.scheduleDeleted}
        confirmLabel={t.deleteMapping}
        cancelLabel={t.cancel}
        destructive
        loading={scheduleDeleting}
        onConfirm={handleDeleteSchedule}
        onCancel={() => setScheduleDeleteTarget(null)}
      />
    </main>
  );
}
