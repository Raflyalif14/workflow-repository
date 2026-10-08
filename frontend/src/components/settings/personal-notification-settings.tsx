"use client";
import { useLanguage } from "@/components/i18n/language-provider";

import { translate as translateI18n, translateStoredMessage, getIntlLocale } from "@/i18n";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Link2,
  LoaderCircle,
  MessageCircle,
  Send,
  Unplug,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useCreateTelegramLink,
  useInvalidateTelegramLink,
  useNotificationPreferences,
  useUnlinkTelegram,
  useUpdateNotificationPreferences,
} from "@/hooks/use-notifications";
import { canUsePersonalNotificationSettings } from "@/lib/settings-access";
import { getAuthSession, isCurrentSession } from "@/lib/auth";

const TELEGRAM_POLL_INTERVAL_MS = 2_000;
const TELEGRAM_POLL_MAX_DURATION_MS = 60_000;
const TELEGRAM_LINK_FAILURE_MESSAGE = "notificationSettings.linkFailure";

const getValidatedTelegramLink = (linkUrl: string): string | null => {
  try {
    const url = new URL(linkUrl);
    const pathSegments = url.pathname.split("/").filter(Boolean);
    const startTokens = url.searchParams.getAll("start");

    if (
      url.protocol !== "https:" ||
      url.hostname !== "t.me" ||
      url.port ||
      url.username ||
      url.password ||
      url.hash ||
      pathSegments.length !== 1 ||
      url.pathname !== `/${pathSegments[0]}` ||
      !/^[A-Za-z0-9_]{5,32}$/.test(pathSegments[0]) ||
      url.searchParams.size !== 1 ||
      startTokens.length !== 1 ||
      !/^[A-Za-z0-9_-]{32,128}$/.test(startTokens[0])
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
};

const formatLinkedAt = (value: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(getIntlLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

type PreferencesToggleProps = {
  id: string;
  checked: boolean;
  disabled: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
};

function PreferencesToggle({ id, checked, disabled, label, onCheckedChange }: PreferencesToggleProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? "border-primary bg-primary" : "border-border/70 bg-muted"
      }`}
    >
      <span
        className={`h-5 w-5 rounded-full bg-background shadow-sm transition-transform ${
          checked ? "translate-x-[1.2rem]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export function PersonalNotificationSettings() {
  const { locale } = useLanguage();
  const { user, isLoading: authLoading } = useAuth();
  const session = getAuthSession();
  const eligible = !authLoading && canUsePersonalNotificationSettings(user) && Boolean(session);
  const mounted = useRef(true);
  const busy = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const isCurrentAccount = () => Boolean(mounted.current && eligible && session && isCurrentSession(session));
  const [preferenceChange, setPreferenceChange] = useState<{ field: "in_app_enabled" | "telegram_enabled"; value: boolean } | null>(null);
  const [isWaitingForTelegram, setIsWaitingForTelegram] = useState(false);
  const [linkExpiresAt, setLinkExpiresAt] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [linkFailure, setLinkFailure] = useState<string | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const {
    data: preferences,
    isLoading,
    isError,
    refetch: refetchPreferences,
  } = useNotificationPreferences(eligible);
  const updatePreferences = useUpdateNotificationPreferences();
  const createTelegramLink = useCreateTelegramLink();
  const invalidateTelegramLink = useInvalidateTelegramLink();
  const unlinkTelegram = useUnlinkTelegram();

  const linkedAt = useMemo(
    () => formatLinkedAt(preferences?.telegram_linked_at || null),
    [preferences?.telegram_linked_at, locale]
  );
  const isAnyMutationPending =
    updatePreferences.isPending ||
    createTelegramLink.isPending ||
    invalidateTelegramLink.isPending ||
    unlinkTelegram.isPending;
  const mainActionsDisabled = isAnyMutationPending || disconnectOpen || Boolean(preferenceChange);

  useEffect(() => {
    if (!eligible || !isWaitingForTelegram) return;

    if (preferences?.telegram_linked) {
      setIsWaitingForTelegram(false);
      setLinkExpiresAt(null);
      setLinkFailure(null);
      setFeedback("notificationSettings.connectedHelp");
      return;
    }

    const deadline = Math.min(
      Date.now() + TELEGRAM_POLL_MAX_DURATION_MS,
      linkExpiresAt ?? Number.POSITIVE_INFINITY
    );
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      setIsWaitingForTelegram(false);
      setLinkExpiresAt(null);
      setFeedback(null);
      setLinkFailure(TELEGRAM_LINK_FAILURE_MESSAGE);
      return;
    }

    const interval = window.setInterval(() => {
      if (isCurrentAccount()) void refetchPreferences();
    }, TELEGRAM_POLL_INTERVAL_MS);
    const timeout = window.setTimeout(() => {
      setIsWaitingForTelegram(false);
      setLinkExpiresAt(null);
      setFeedback(null);
      setLinkFailure(TELEGRAM_LINK_FAILURE_MESSAGE);
    }, remaining);

    if (isCurrentAccount()) void refetchPreferences();
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [eligible, session?.id, isWaitingForTelegram, linkExpiresAt, preferences?.telegram_linked, refetchPreferences]);

  const handleUpdatePreference = async (
    field: "in_app_enabled" | "telegram_enabled",
    value: boolean
  ) => {
    if (busy.current || !isCurrentAccount()) return;
    busy.current = true;
    setActionError(null);
    setFeedback(null);
    try {
      await updatePreferences.mutateAsync({ [field]: value });
      if (!isCurrentAccount()) return;
      setPreferenceChange(null);
      setFeedback("notificationSettings.saved");
    } catch {
      if (isCurrentAccount()) setActionError("notificationSettings.updateFailed");
    } finally { busy.current = false; }
  };

  const handleConnectTelegram = async () => {
    if (busy.current || !isCurrentAccount()) return;
    busy.current = true;
    setActionError(null);
    setFeedback(null);
    setLinkFailure(null);

    const popup = window.open("", "_blank");
    if (!popup) {
      setActionError("notificationSettings.popupFailed");
      busy.current = false;
      return;
    }

    try {
      popup.opener = null;
    } catch {
      popup.close();
      setActionError("notificationSettings.popupFailed");
      busy.current = false;
      return;
    }

    const closePopup = () => {
      try {
        if (!popup.closed) popup.close();
      } catch {
        // The browser can close a popup before this handler resumes.
      }
    };

    try {
      const result = await createTelegramLink.mutateAsync();
      if (!isCurrentAccount()) { closePopup(); return; }
      const validatedLink = getValidatedTelegramLink(result.linkUrl);
      if (!validatedLink) {
        closePopup();
        setActionError("notificationSettings.linkCreateFailed");
        return;
      }

      if (popup.closed) {
        setFeedback("notificationSettings.windowClosed");
        const parsedExpiry = Date.parse(result.expiresAt);
        setLinkExpiresAt(Number.isNaN(parsedExpiry) ? Date.now() + TELEGRAM_POLL_MAX_DURATION_MS : parsedExpiry);
        setIsWaitingForTelegram(true);
        return;
      }

      popup.location.replace(validatedLink);

      const parsedExpiry = Date.parse(result.expiresAt);
      setLinkExpiresAt(Number.isNaN(parsedExpiry) ? Date.now() + TELEGRAM_POLL_MAX_DURATION_MS : parsedExpiry);
      setIsWaitingForTelegram(true);
    } catch {
      closePopup();
      if (isCurrentAccount()) setActionError("notificationSettings.startFailed");
    } finally { busy.current = false; }
  };

  const handleCancelTelegramLink = async () => {
    if (busy.current || !isCurrentAccount()) return;
    busy.current = true;
    setActionError(null);
    setLinkFailure(null);
    try {
      await invalidateTelegramLink.mutateAsync();
      if (!isCurrentAccount()) return;
      setIsWaitingForTelegram(false);
      setLinkExpiresAt(null);
      setFeedback("notificationSettings.linkCancelled");
    } catch {
      if (isCurrentAccount()) setActionError("notificationSettings.cancelFailed");
    } finally { busy.current = false; }
  };

  const handleDisconnectTelegram = async () => {
    if (busy.current || !isCurrentAccount()) return;
    busy.current = true;
    setActionError(null);
    try {
      await unlinkTelegram.mutateAsync();
      if (!isCurrentAccount()) return;
      setIsWaitingForTelegram(false);
      setLinkExpiresAt(null);
      setDisconnectOpen(false);
      setFeedback("notificationSettings.disconnected");
    } catch {
      if (isCurrentAccount()) setActionError("notificationSettings.disconnectFailed");
    } finally { busy.current = false; }
  };

  if (!eligible) return null;

  return (
    <section id="personal-notifications" aria-labelledby="personal-notifications-title" className="scroll-mt-20 space-y-4">
      <div>
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
            <Bell className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            {translateI18n("notificationSettings.personal")}
          </span>
        </div>
        <h2 id="personal-notifications-title" className="text-xl font-semibold">{translateI18n("notifications.settings")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{translateI18n("copy.notificationDelivery")}</p>
      </div>

      {actionError && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{translateStoredMessage(actionError)}</p>
        </div>
      )}
      {linkFailure && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{translateStoredMessage(linkFailure)}</p>
        </div>
      )}
      {feedback && (
        <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p>{translateStoredMessage(feedback)}</p>
        </div>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            {translateI18n("notificationSettings.loading")}
          </CardContent>
        </Card>
      ) : isError || !preferences ? (
        <Card>
          <CardContent className="flex min-h-24 flex-col items-center justify-center gap-3 px-5 text-center">
            <CircleAlert className="h-5 w-5 text-destructive" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{translateI18n("copy.notificationPrefsError")}</p>
            <Button variant="outline" size="sm" onClick={() => { if (isCurrentAccount()) void refetchPreferences(); }}>
              {translateI18n("common.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                  <Bell className="h-4 w-4" aria-hidden="true" />
                </span>
                <Badge variant={preferences.in_app_enabled ? "success" : "outline"}>
                  {translateI18n(preferences.in_app_enabled ? "common.enabled" : "common.disabled")}
                </Badge>
              </div>
              <div>
                <CardTitle className="text-base font-semibold tracking-tight">{translateI18n("ui.inAppNotifications")}</CardTitle>
                <CardDescription className="mt-1 text-xs">
                  {translateI18n("notificationSettings.inAppHelp")}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4 border-t border-border/40 pt-5">
              <div>
                <p className="text-sm font-medium text-foreground">{translateI18n("copy.showInApp")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{translateI18n("copy.notificationControl")}</p>
              </div>
              <PreferencesToggle
                id="in-app-enabled"
                label={translateI18n("notificationSettings.enableInApp")}
                checked={preferences.in_app_enabled}
                disabled={mainActionsDisabled}
                onCheckedChange={(value) => { setActionError(null); setPreferenceChange({ field: "in_app_enabled", value }); }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-400/15 bg-sky-400/10 text-info">
                  <Send className="h-4 w-4" aria-hidden="true" />
                </span>
                <Badge variant={preferences.telegram_linked ? "success" : "outline"}>
                  {translateI18n(preferences.telegram_linked ? "notificationSettings.connected" : "notificationSettings.notConnected")}
                </Badge>
              </div>
              <div>
                <CardTitle className="text-base font-semibold tracking-tight">{translateI18n("copy.telegramNotifications")}</CardTitle>
                <CardDescription className="mt-1 text-xs">
                  {translateI18n("notificationSettings.telegramHelp")}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 border-t border-border/40 pt-5">
              {preferences.telegram_linked ? (
                <>
                  <div className="space-y-1 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-xs">
                    {preferences.telegram_username && (
                      <p className="font-medium text-foreground">@{preferences.telegram_username}</p>
                    )}
                    {linkedAt && <p className="text-muted-foreground">{translateI18n("notificationSettings.connectedAt", { date: linkedAt })}</p>}
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">{translateI18n("copy.enableTelegram")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{translateI18n("copy.telegramOff")}</p>
                    </div>
                    <PreferencesToggle
                      id="telegram-enabled"
                      label={translateI18n("notificationSettings.enableTelegram")}
                      checked={preferences.telegram_enabled}
                      disabled={mainActionsDisabled}
                      onCheckedChange={(value) => { setActionError(null); setPreferenceChange({ field: "telegram_enabled", value }); }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2 text-destructive hover:text-destructive"
                    disabled={mainActionsDisabled}
                    onClick={() => { setActionError(null); setDisconnectOpen(true); }}
                  >
                    <Unplug className="h-4 w-4" aria-hidden="true" />
                    {translateI18n("notificationSettings.disconnect")}
                  </Button>
                </>
              ) : isWaitingForTelegram ? (
                <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-start gap-3">
                    <LoaderCircle className="mt-0.5 h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{translateI18n("copy.waitingTelegram")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {translateI18n("notificationSettings.completeLink")}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={invalidateTelegramLink.isPending}
                    onClick={() => void handleCancelTelegramLink()}
                  >
                    {invalidateTelegramLink.isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                    {translateI18n("common.cancel")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
                    <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
                    <p>{translateI18n("copy.telegramLinkRequired")}</p>
                  </div>
                  <Button
                    type="button"
                    className="w-full gap-2"
                    disabled={mainActionsDisabled}
                    onClick={() => void handleConnectTelegram()}
                  >
                    {createTelegramLink.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    {translateI18n("notificationSettings.connect")}
                    {!createTelegramLink.isPending && <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={Boolean(preferenceChange)} onOpenChange={(open) => { if (!open && !isAnyMutationPending) setPreferenceChange(null); }}>
        <DialogHeader>
          <DialogTitle>{translateI18n("notificationSettings.saveTitle")}</DialogTitle>
          <DialogDescription>{preferenceChange && translateI18n("notificationSettings.saveConfirm", {
            channel: translateI18n(preferenceChange.field === "in_app_enabled" ? "ui.inAppNotifications" : "copy.telegramNotifications"),
            state: translateI18n(preferenceChange.value ? "common.enabled" : "common.disabled"),
          })}</DialogDescription>
        </DialogHeader>
        {actionError && <p role="alert" className="text-sm text-destructive">{translateStoredMessage(actionError)}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={isAnyMutationPending} onClick={() => setPreferenceChange(null)}>{translateI18n("common.cancel")}</Button>
          <Button disabled={isAnyMutationPending} onClick={() => { if (preferenceChange) void handleUpdatePreference(preferenceChange.field, preferenceChange.value); }}>{translateI18n(isAnyMutationPending ? "common.saving" : "common.save")}</Button>
        </DialogFooter>
      </Dialog>
      <Dialog open={disconnectOpen} onOpenChange={(open) => { if (!isAnyMutationPending) setDisconnectOpen(open); }}>
        <DialogHeader>
          <DialogTitle>{translateI18n("copy.disconnectTelegram")}</DialogTitle>
          <DialogDescription>
            {translateI18n("notificationSettings.disconnectHelp")}
          </DialogDescription>
        </DialogHeader>
        {actionError && <p role="alert" className="text-sm text-destructive">{translateStoredMessage(actionError)}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setDisconnectOpen(false)} disabled={unlinkTelegram.isPending}>
            {translateI18n("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={() => void handleDisconnectTelegram()} disabled={unlinkTelegram.isPending}>
            {translateI18n(unlinkTelegram.isPending ? "notificationSettings.disconnectProgress" : "notificationSettings.disconnect")}
          </Button>
        </DialogFooter>
      </Dialog>
    </section>
  );
}
