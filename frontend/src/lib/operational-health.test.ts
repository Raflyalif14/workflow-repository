import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canReadOperationalHealth, canRetryStorageCleanup } from "./operational-health";

for (const role of ["SALES", "SA", "HEAD_SA"] as const) {
  assert.equal(canReadOperationalHealth({ role, isActive: true }), false);
}
assert.equal(canReadOperationalHealth(null), false);
assert.equal(canReadOperationalHealth(undefined), false);
assert.equal(canReadOperationalHealth({ role: "SUPER_ADMIN", isActive: false }), false);
assert.equal(canReadOperationalHealth({ role: "SUPER_ADMIN", isActive: true }), true);
assert.equal(canRetryStorageCleanup("FAILED"), true);
assert.equal(canRetryStorageCleanup("PENDING"), false);
assert.equal(canRetryStorageCleanup("COMPLETED"), false);

const hooks = readFileSync(join(__dirname, "../hooks/use-operational-health.ts"), "utf8");
const page = readFileSync(join(__dirname, "../app/settings/telegram-delivery-health/page.tsx"), "utf8");
assert(hooks.includes("enabled,") && hooks.includes("refetchInterval: 30_000"), "monitoring queries must be disabled before eligibility");
assert(hooks.includes("onSettled: () => queryClient.invalidateQueries({ queryKey: operationalHealthKeys.cleanups() })"), "every retry outcome must refresh cleanup summaries and pages");
assert(page.includes("canReadOperationalHealth(user)") && page.includes("<RoleGuard allowedRoles={[\"SUPER_ADMIN\"]}>"), "page guard and query eligibility must agree");
console.log("Operational health eligibility and retry invalidation: passed");
