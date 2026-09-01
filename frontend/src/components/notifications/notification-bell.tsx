"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, CircleAlert, LoaderCircle } from "lucide-react";
import {
  useMarkAllNotificationsAsRead,
  useMarkNotificationAsRead,
  useNotifications,
  useUnreadNotificationCount,
} from "@/hooks/use-notifications";
import { AppNotification } from "@/types/notification";

const formatCreatedAt = (value: string): string => {
  const createdAt = new Date(value);
  const timestamp = createdAt.getTime();
  if (Number.isNaN(timestamp)) return "";

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1_000));
  if (elapsedSeconds < 60) return "Just now";
  if (elapsedSeconds < 3_600) return `${Math.floor(elapsedSeconds / 60)}m ago`;
  if (elapsedSeconds < 86_400) return `${Math.floor(elapsedSeconds / 3_600)}h ago`;
  if (elapsedSeconds < 604_800) return `${Math.floor(elapsedSeconds / 86_400)}d ago`;

  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(createdAt);
};

const isInternalActionUrl = (actionUrl: string | null): actionUrl is string =>
  Boolean(
    actionUrl &&
      actionUrl.startsWith("/") &&
      !actionUrl.startsWith("//") &&
      !actionUrl.startsWith("/\\")
  );

export function NotificationBell({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const {
    data: notifications = [],
    isLoading,
    isError,
    refetch: refetchNotifications,
  } = useNotifications(enabled);
  const { data: unreadCountData } = useUnreadNotificationCount(enabled);
  const markAsRead = useMarkNotificationAsRead();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const unreadCount = unreadCountData?.unreadCount || 0;
  const hasUnread = unreadCount > 0;

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleNotificationClick = async (notification: AppNotification) => {
    setActionError(null);
    if (!notification.is_read) {
      try {
        await markAsRead.mutateAsync(notification.id);
      } catch {
        setActionError("Unable to update this notification. Please try again.");
        return;
      }
    }

    if (isInternalActionUrl(notification.action_url)) {
      setIsOpen(false);
      router.push(notification.action_url);
    }
  };

  const handleMarkAllAsRead = async () => {
    setActionError(null);
    try {
      await markAllAsRead.mutateAsync();
    } catch {
      setActionError("Unable to mark notifications as read. Please try again.");
    }
  };

  const handleToggle = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen && enabled) {
      setActionError(null);
      void refetchNotifications();
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-label={hasUnread ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-transparent text-muted-foreground transition-all hover:border-border/60 hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
        {hasUnread && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-background bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border/60 bg-card/95 shadow-xl shadow-black/10 backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
              <p className="text-[11px] text-muted-foreground">Latest workspace updates</p>
            </div>
            {hasUnread && (
              <button
                type="button"
                onClick={() => void handleMarkAllAsRead()}
                disabled={markAllAsRead.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {markAllAsRead.isPending ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Mark all as read
              </button>
            )}
          </div>

          {actionError && (
            <div className="mx-3 mt-3 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <p>{actionError}</p>
            </div>
          )}

          <div className="max-h-[min(28rem,calc(100vh-7rem))] overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex min-h-32 items-center justify-center gap-2 text-xs text-muted-foreground">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading notifications...
              </div>
            ) : isError ? (
              <div className="flex min-h-32 flex-col items-center justify-center gap-2 px-5 text-center text-xs text-muted-foreground">
                <CircleAlert className="h-5 w-5 text-destructive" aria-hidden="true" />
                <p>Unable to load notifications right now.</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex min-h-32 flex-col items-center justify-center gap-2 px-5 text-center text-xs text-muted-foreground">
                <Bell className="h-5 w-5" aria-hidden="true" />
                <p>No notifications yet</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => void handleNotificationClick(notification)}
                      disabled={markAsRead.isPending}
                      className={`relative w-full rounded-lg px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-wait ${
                        notification.is_read
                          ? "text-muted-foreground hover:bg-muted/50"
                          : "bg-primary/5 text-foreground hover:bg-primary/10"
                      }`}
                    >
                      {!notification.is_read && (
                        <span className="absolute bottom-3 left-0 top-3 w-0.5 rounded-r-full bg-primary" aria-hidden="true" />
                      )}
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-semibold leading-5 text-foreground">{notification.title}</p>
                        <time className="shrink-0 pt-0.5 text-[10px] text-muted-foreground" dateTime={notification.created_at}>
                          {formatCreatedAt(notification.created_at)}
                        </time>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{notification.message}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
