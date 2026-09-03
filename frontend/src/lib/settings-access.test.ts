import {
  PERSONAL_NOTIFICATION_SETTINGS_ALLOWED_ROLES,
  SYSTEM_SETTINGS_ALLOWED_ROLES,
} from "./settings-access";

const systemSettingsRoles = ["SUPER_ADMIN"];
const personalNotificationSettingsRoles = ["SUPER_ADMIN", "SALES", "HEAD_SA", "SA"];

if (JSON.stringify(SYSTEM_SETTINGS_ALLOWED_ROLES) !== JSON.stringify(systemSettingsRoles)) {
  throw new Error("System settings must be restricted to SUPER_ADMIN only");
}

if (
  JSON.stringify(PERSONAL_NOTIFICATION_SETTINGS_ALLOWED_ROLES) !==
  JSON.stringify(personalNotificationSettingsRoles)
) {
  throw new Error("Personal notification settings must remain available to every application role");
}

console.log("Settings access configuration tests passed.");
