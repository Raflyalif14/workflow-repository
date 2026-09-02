"use client";

import { useEffect, useMemo, useState } from "react";
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

const TELEGRAM_POLL_INTERVAL_MS = 2_000;
const TELEGRAM_POLL_MAX_DURATION_MS = 60_000;
const TELEGRAM_LINK_FAILURE_MESSAGE =
  "Telegram connection could not be completed. The account may already be linked, the link may have expired, or the connection was cancelled. Please try again.";

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

  return new Intl.DateTimeFormat(undefined, {
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

export default function NotificationSettingsPage() {
  const { user } = useAuth();
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
  } = useNotificationPreferences(Boolean(user));
  const updatePreferences = useUpdateNotificationPreferences();
  const createTelegramLink = useCreateTelegramLink();
  const invalidateTelegramLink = useInvalidateTelegramLink();
  const unlinkTelegram = useUnlinkTelegram();

  const linkedAt = useMemo(
    () => formatLinkedAt(preferences?.telegram_linked_at || null),
    [preferences?.telegram_linked_at]
  );
  const isAnyMutationPending =
    updatePreferences.isPending ||
    createTelegramLink.isPending ||
    invalidateTelegramLink.isPending ||
    unlinkTelegram.isPending;

  useEffect(() => {
    if (!isWaitingForTelegram) return;

    if (preferences?.telegram_linked) {
      setIsWaitingForTelegram(false);
      setLinkExpiresAt(null);
      setLinkFailure(null);
      setFeedback("Telegram connected. Enable Telegram Notifications when you are ready.");
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
      void refetchPreferences();
    }, TELEGRAM_POLL_INTERVAL_MS);
    const timeout = window.setTimeout(() => {
      setIsWaitingForTelegram(false);
      setLinkExpiresAt(null);
      setFeedback(null);
      setLinkFailure(TELEGRAM_LINK_FAILURE_MESSAGE);
    }, remaining);

    void refetchPreferences();
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [isWaitingForTelegram, linkExpiresAt, preferences?.telegram_linked, refetchPreferences]);

  const handleUpdatePreference = async (
    field: "in_app_enabled" | "telegram_enabled",
    value: boolean
  ) => {
    setActionError(null);
    setFeedback(null);
    try {
      await updatePreferences.mutateAsync({ [field]: value });
    } catch {
      setActionError("Unable to update notification preferences. Please try again.");
      void refetchPreferences();
    }
  };

  const handleConnectTelegram = async () => {
    setActionError(null);
    setFeedback(null);
    setLinkFailure(null);

    const popup = window.open("", "_blank");
    if (!popup) {
      setActionError("Unable to open Telegram. Allow pop-ups for this site and try again.");
      return;
    }

    try {
      popup.opener = null;
    } catch {
      popup.close();
      setActionError("Unable to open Telegram. Allow pop-ups for this site and try again.");
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
      const validatedLink = getValidatedTelegramLink(result.linkUrl);
      if (!validatedLink) {
        closePopup();
        setActionError("Unable to create a secure Telegram connection link. Please try again.");
        return;
      }

      if (popup.closed) {
        setFeedback("Telegram window was closed. Waiting briefly for a connection before you try again.");
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
      setActionError("Unable to start Telegram connection. Please try again.");
    }
  };

  const handleCancelTelegramLink = async () => {
    setActionError(null);
    setLinkFailure(null);
    try {
      await invalidateTelegramLink.mutateAsync();
      setIsWaitingForTelegram(false);
      setLinkExpiresAt(null);
      setFeedback("Telegram connection link cancelled.");
    } catch {
      setActionError("Unable to cancel the Telegram connection link. Please try again.");
    }
  };

  const handleDisconnectTelegram = async () => {
    setActionError(null);
    try {
      await unlinkTelegram.mutateAsync();
      setIsWaitingForTelegram(false);
      setLinkExpiresAt(null);
      setDisconnectOpen(false);
      setFeedback("Telegram has been disconnected.");
    } catch {
      setActionError("Unable to disconnect Telegram. Please try again.");
    }
  };

  return (
    <div className="container space-y-6 py-8">
      <div className="border-b border-border/60 pb-6">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
            <Bell className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            Personal Preferences
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Notification Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage how you receive workflow updates.</p>
      </div>

      {actionError && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{actionError}</p>
        </div>
      )}
      {linkFailure && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{linkFailure}</p>
        </div>
      )}
      {feedback && (
        <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p>{feedback}</p>
        </div>
      )}

      {isLoading ? (
        <Card className="border-border/60 bg-card/70 shadow-sm">
          <CardContent className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading notification preferences...
          </CardContent>
        </Card>
      ) : isError || !preferences ? (
        <Card className="border-border/60 bg-card/70 shadow-sm">
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 px-5 text-center">
            <CircleAlert className="h-5 w-5 text-destructive" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Unable to load notification preferences.</p>
            <Button variant="outline" size="sm" onClick={() => void refetchPreferences()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="border-border/60 bg-card/70 shadow-sm">
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                  <Bell className="h-4 w-4" aria-hidden="true" />
                </span>
                <Badge variant={preferences.in_app_enabled ? "success" : "outline"}>
                  {preferences.in_app_enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <div>
                <CardTitle className="text-base font-semibold tracking-tight">In-App Notifications</CardTitle>
                <CardDescription className="mt-1 text-xs">
                  Receive workflow updates in the notification bell.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4 border-t border-border/40 pt-5">
              <div>
                <p className="text-sm font-medium text-foreground">Show in-app updates</p>
                <p className="mt-1 text-xs text-muted-foreground">Control notifications in your workspace.</p>
              </div>
              <PreferencesToggle
                id="in-app-enabled"
                label="Enable in-app notifications"
                checked={preferences.in_app_enabled}
                disabled={isAnyMutationPending}
                onCheckedChange={(checked) => void handleUpdatePreference("in_app_enabled", checked)}
              />
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 shadow-sm">
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-400/15 bg-sky-400/10 text-sky-400">
                  <Send className="h-4 w-4" aria-hidden="true" />
                </span>
                <Badge variant={preferences.telegram_linked ? "success" : "outline"}>
                  {preferences.telegram_linked ? "Connected" : "Not Connected"}
                </Badge>
              </div>
              <div>
                <CardTitle className="text-base font-semibold tracking-tight">Telegram Notifications</CardTitle>
                <CardDescription className="mt-1 text-xs">
                  Link Telegram first, then choose whether workflow updates are delivered there.
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
                    {linkedAt && <p className="text-muted-foreground">Connected {linkedAt}</p>}
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Enable Telegram delivery</p>
                      <p className="mt-1 text-xs text-muted-foreground">Telegram remains off until you enable it.</p>
                    </div>
                    <PreferencesToggle
                      id="telegram-enabled"
                      label="Enable Telegram notifications"
                      checked={preferences.telegram_enabled}
                      disabled={isAnyMutationPending}
                      onCheckedChange={(checked) => void handleUpdatePreference("telegram_enabled", checked)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2 text-destructive hover:text-destructive"
                    disabled={isAnyMutationPending}
                    onClick={() => setDisconnectOpen(true)}
                  >
                    <Unplug className="h-4 w-4" aria-hidden="true" />
                    Disconnect Telegram
                  </Button>
                </>
              ) : isWaitingForTelegram ? (
                <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-start gap-3">
                    <LoaderCircle className="mt-0.5 h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Waiting for Telegram connection...</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Complete the connection in Telegram. This page will update automatically.
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
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
                    <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                    <p>Telegram must be linked before delivery can be enabled.</p>
                  </div>
                  <Button
                    type="button"
                    className="w-full gap-2"
                    disabled={isAnyMutationPending}
                    onClick={() => void handleConnectTelegram()}
                  >
                    {createTelegramLink.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    Connect Telegram
                    {!createTelegramLink.isPending && <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogHeader>
          <DialogTitle>Disconnect Telegram?</DialogTitle>
          <DialogDescription>
            Telegram delivery will be disabled and this account will no longer receive workflow updates there.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDisconnectOpen(false)} disabled={unlinkTelegram.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void handleDisconnectTelegram()} disabled={unlinkTelegram.isPending}>
            {unlinkTelegram.isPending ? "Disconnecting..." : "Disconnect Telegram"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
