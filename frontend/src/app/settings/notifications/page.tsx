import { redirect } from "next/navigation";
import { PERSONAL_NOTIFICATIONS_SETTINGS_HREF } from "@/lib/settings-access";

// Preserve bookmarks while keeping one personal preferences form.
export default function NotificationSettingsPage() {
  redirect(PERSONAL_NOTIFICATIONS_SETTINGS_HREF);
}
