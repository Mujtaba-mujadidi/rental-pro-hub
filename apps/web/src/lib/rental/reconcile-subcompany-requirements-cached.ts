import { cache } from "react";
import { reconcileEndedHireSubcompanyDocumentRequirements } from "@/lib/rental/subcompany-hire-document-requirements";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Run ended-hire document-requirement reconcile at most once per RSC request
 * (shell, attention, and overview previously each ran it).
 */
export const reconcileSubcompanyRequirementsOnce = cache(
  async (subcompanyId: string, parentCompanyId: string): Promise<void> => {
    try {
      const admin = createSupabaseAdminClient();
      await reconcileEndedHireSubcompanyDocumentRequirements(admin, {
        subcompanyId: subcompanyId.trim(),
        parentCompanyId: parentCompanyId.trim(),
      });
    } catch {
      // Non-fatal — callers still render; flags may stay stale until next success.
    }
  },
);
