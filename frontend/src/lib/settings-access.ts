export const SYSTEM_SETTINGS_ALLOWED_ROLES = ["SUPER_ADMIN"];

export const PERSONAL_SETTINGS_ALLOWED_ROLES = ["SUPER_ADMIN", "SALES", "HEAD_SA", "SA"];

export const PERSONAL_NOTIFICATION_SETTINGS_ALLOWED_ROLES = [
  "SUPER_ADMIN",
  "SALES",
  "HEAD_SA",
  "SA",
];

export const PERSONAL_NOTIFICATIONS_SETTINGS_HREF = "/settings#personal-notifications";

export function canUsePersonalNotificationSettings(user?: {
  id?: string; role?: string; isActive?: boolean; mustChangePassword?: boolean;
} | null): boolean {
  return Boolean(user?.id && user.isActive === true && !user.mustChangePassword &&
    PERSONAL_NOTIFICATION_SETTINGS_ALLOWED_ROLES.includes(user.role ?? ""));
}

export function canShowNavigationItem(role: string | undefined, allowedRoles?: string[]): boolean {
  return Boolean(role && PERSONAL_SETTINGS_ALLOWED_ROLES.includes(role) &&
    (!allowedRoles || allowedRoles.includes(role)));
}
