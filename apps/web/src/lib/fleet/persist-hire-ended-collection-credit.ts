import "server-only";

import { applySignedChargeDeltaToSettlementBalance } from "@/lib/fleet/hire-inspection-damage-charges";
import { createClient } from "@/lib/supabase/server";

/**
 * When staff collect money on an ended hire via schedule or extra-charge payment,
 * reduce the settlement open-balance cache by the same amount (driver receipt).
 */
export async function persistEndedHireCollectionCredit(input: {
  hireGroupId: string;
  parentCompanyId: string;
  hireStatus: string;
  settlementBalanceDirection: "driver_owes_company" | "company_owes_driver" | "settled" | null;
  settlementBalanceGbp: number;
  collectedGbp: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ended = input.hireStatus === "terminated" || input.hireStatus === "completed";
  const collected = Math.round(Number(input.collectedGbp) * 100) / 100;
  if (!ended || !Number.isFinite(collected) || collected <= 0.005) return { ok: true };
  if (input.settlementBalanceDirection !== "driver_owes_company") return { ok: true };

  const next = applySignedChargeDeltaToSettlementBalance({
    settlementBalanceDirection: input.settlementBalanceDirection,
    settlementBalanceGbp: input.settlementBalanceGbp,
    deltaGbp: -collected,
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicle_hire_groups")
    .update({
      settlement_balance_direction: next.settlementBalanceDirection,
      settlement_balance_gbp: next.settlementBalanceGbp,
    })
    .eq("id", input.hireGroupId.trim())
    .eq("parent_company_id", input.parentCompanyId.trim());
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
