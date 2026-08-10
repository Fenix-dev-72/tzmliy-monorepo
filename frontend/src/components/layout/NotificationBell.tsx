import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, CheckCheck } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as notificationsApi from "@/lib/api/notifications";
import type { InAppNotification } from "@/lib/api/notifications";

const POLL_INTERVAL_MS = 30_000;

const content = {
  uz: {
    notifications: "Bildirishnomalar",
    empty: "Hozircha bildirishnoma yo'q",
    markAllRead: "Hammasini o'qilgan deb belgilash",
  },
  ru: {
    notifications: "Уведомления",
    empty: "Пока нет уведомлений",
    markAllRead: "Отметить всё как прочитанное",
  },
};

export function NotificationBell() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const { accessToken } = useTenantAuth();

  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function refreshUnreadCount() {
    if (!accessToken) return;
    try {
      const res = await notificationsApi.getUnreadCount(accessToken);
      setUnreadCount(res.count);
    } catch {
      // Non-critical -- the bell just won't show a badge this tick.
    }
  }

  useEffect(() => {
    void refreshUnreadCount();
    const timer = setInterval(() => void refreshUnreadCount(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && accessToken) {
      try {
        setItems(await notificationsApi.getInbox(accessToken, 20));
        setLoaded(true);
      } catch {
        // Leave whatever was last successfully loaded (or empty) showing.
      }
    }
  }

  async function handleItemClick(item: InAppNotification) {
    setOpen(false);
    if (!item.is_read && accessToken) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_read: true } : i)));
      setUnreadCount((c) => Math.max(0, c - 1));
      notificationsApi.markNotificationRead(accessToken, item.id).catch(() => {});
    }
    if (item.link) navigate(item.link);
  }

  async function handleMarkAllRead() {
    if (!accessToken) return;
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
    setUnreadCount(0);
    try {
      await notificationsApi.markAllNotificationsRead(accessToken);
    } catch {
      void refreshUnreadCount();
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => void handleToggle()}
        aria-label={t.notifications}
        title={t.notifications}
        className="border-card-border text-foreground-muted hover:bg-accent hover:text-foreground relative flex size-9 items-center justify-center rounded-lg border transition-colors"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="bg-destructive absolute top-1.5 right-1.5 size-2 rounded-full" />
        )}
      </button>

      {open && (
        <div className="glass-card absolute top-full right-0 z-10 mt-2 w-80 max-w-[90vw] overflow-hidden p-0">
          {items.length > 0 && (
            <div className="border-card-border flex items-center justify-end border-b px-3 py-2">
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="text-foreground-muted hover:text-foreground flex items-center gap-1 text-xs font-medium"
              >
                <CheckCheck size={13} />
                {t.markAllRead}
              </button>
            </div>
          )}
          <div className="max-h-96 overflow-y-auto">
            {loaded && items.length === 0 && (
              <p className="text-foreground-muted p-4 text-center text-sm">{t.empty}</p>
            )}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void handleItemClick(item)}
                className={`border-card-border hover:bg-accent flex w-full flex-col gap-0.5 border-b px-3.5 py-3 text-left last:border-b-0 ${
                  item.is_read ? "" : "bg-primary/[0.04]"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {!item.is_read && <span className="bg-primary size-1.5 shrink-0 rounded-full" />}
                  <span className="text-sm font-semibold text-foreground">{item.title}</span>
                </div>
                <p className="text-foreground-muted line-clamp-2 text-xs">{item.body}</p>
                <span className="text-foreground-muted mt-0.5 text-[11px]">
                  {new Date(item.created_at).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
