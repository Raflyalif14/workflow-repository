import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as language from "../components/i18n/language-provider";
import * as auth from "../components/auth/auth-provider";
import { AccountProfileCard, getUserInitials } from "../components/settings/account-profile-card";
import { ChangePasswordCard } from "../components/settings/change-password-card";
import { UserAccountMenu } from "../components/auth/user-account-menu";
import { User } from "../types/user";

const mockUser: User = {
  id: "user-123",
  email: "architect@example.com",
  fullName: "Solution Architect Test",
  role: "SA",
  isActive: true,
  mustChangePassword: false,
  createdAt: "2026-01-15T10:00:00Z",
};

// Setup language mock for static rendering
(language as any).useLanguage = () => ({
  t: (key: string, params?: Record<string, any>) => {
    if (params?.count !== undefined) return `${key}:${params.count}`;
    return key;
  },
  formatDate: (val: string) => `formatted:${val}`,
  locale: "en",
});

(auth as any).useAuth = () => ({
  user: mockUser,
  logout: async () => {},
  isAuthenticated: true,
});

// Test 1: getUserInitials helper
assert.equal(getUserInitials("Solution Architect Test"), "SA");
assert.equal(getUserInitials("Single"), "SI");
assert.equal(getUserInitials(""), "U");
assert.equal(getUserInitials(undefined), "U");
console.log("Test 1: getUserInitials passed");

// Test 2: AccountProfileCard rendering
{
  const markup = renderToStaticMarkup(<AccountProfileCard user={mockUser} />);
  assert.ok(markup.includes("Solution Architect Test"), "Includes user full name");
  assert.ok(markup.includes("architect@example.com"), "Includes user email");
  assert.ok(markup.includes("Solution Architect"), "Includes role label");
  assert.ok(markup.includes("data-testid=\"account-profile-card\""), "Has testid");
  console.log("Test 2: AccountProfileCard rendering passed");
}

// Test 3: ChangePasswordCard rendering
{
  const markup = renderToStaticMarkup(<ChangePasswordCard />);
  assert.ok(markup.includes("data-testid=\"change-password-card\""), "Has testid");
  assert.ok(markup.includes("id=\"change-password\""), "Has anchor id");
  assert.ok(markup.includes("input-current-password"), "Has current password field");
  assert.ok(markup.includes("input-new-password"), "Has new password field");
  assert.ok(markup.includes("input-confirm-password"), "Has confirm password field");
  console.log("Test 3: ChangePasswordCard rendering passed");
}

// Test 4: UserAccountMenu initial trigger rendering
{
  const markup = renderToStaticMarkup(<UserAccountMenu />);
  assert.ok(markup.includes("data-testid=\"user-account-menu\""), "Has testid");
  assert.ok(markup.includes("Solution Architect Test"), "Shows user name");
  assert.ok(markup.includes("user-menu-trigger"), "Has trigger button");
  console.log("Test 4: UserAccountMenu rendering passed");
}

console.log("All account settings UI tests passed.");
