import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Pure / sync helpers we gate coverage on.
 * Mixed modules (DB/fetch/localStorage/sharp) are still unit-tested for their pure exports,
 * but are omitted here so async dead weight does not tank thresholds.
 */
const PURE_LIB_COVERAGE = [
  "src/lib/admin/driver-list-shared.ts",
  "src/lib/auth/rental-permissions.ts",
  "src/lib/auth/supabase-auth-user-message.ts",
  "src/lib/companies/company-identity.ts",
  "src/lib/contract-terms/hash.ts",
  "src/lib/contract-terms/plain-preview.ts",
  "src/lib/csv/parse-csv.ts",
  "src/lib/datetime/uk.ts",
  "src/lib/driver/licence-attention.ts",
  "src/lib/driver/licence-check.ts",
  "src/lib/driver/licence-display.ts",
  "src/lib/esign/crypto.ts",
  "src/lib/esign/datetime.ts",
  "src/lib/esign/roles.ts",
  "src/lib/fleet/maintenance.ts",
  "src/lib/fleet/vehicle-expiry-attention.ts",
  "src/lib/fleet/vehicle-workspace-nav.ts",
  "src/lib/fleet/vehicles.ts",
  "src/lib/fleet-tracking/mapping.ts",
  "src/lib/fleet-tracking/units.ts",
  "src/lib/settings/notification-settings.ts",
  "src/lib/validation/driver-signup.ts",
];

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      include: PURE_LIB_COVERAGE,
      thresholds: {
        lines: 85,
        functions: 90,
        branches: 80,
        statements: 85,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
