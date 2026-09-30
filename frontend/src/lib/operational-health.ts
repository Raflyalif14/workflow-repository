import type { User } from "@/types/user";

export const canReadOperationalHealth = (user: Pick<User, "role" | "isActive"> | null | undefined) =>
  user?.role === "SUPER_ADMIN" && user.isActive === true;

export const canRetryStorageCleanup = (status: string) => status === "FAILED";
