import {
  HIRE_INSPECTION_ACCESSORY_KEYS,
  type HireInspectionAccessoryKey,
} from "@/lib/fleet/hire-inspection-accessories";

export type HirePendingReturnReviewDecision = "approve" | "waive";

export type ParsedHirePendingReturnReviewId =
  | { kind: "damage"; damageId: string }
  | { kind: "fuel" }
  | { kind: "accessory"; key: HireInspectionAccessoryKey };

/** Pure authorisation gate for resolving pending return-charge reviews. */
export function hirePendingReturnReviewResolveGate(input: {
  canWriteRentals: boolean;
  hireStatus: string;
}): string | null {
  if (!input.canWriteRentals) return "You do not have permission.";
  if (input.hireStatus !== "terminated" && input.hireStatus !== "completed") {
    return "Pending return reviews can only be resolved after the contract has ended.";
  }
  return null;
}

export function parseHirePendingReturnReviewId(
  reviewId: string,
): ParsedHirePendingReturnReviewId | null {
  const id = reviewId.trim();
  if (!id) return null;
  if (id === "fuel-review") return { kind: "fuel" };
  if (id.startsWith("accessory-")) {
    const key = id.slice("accessory-".length);
    if ((HIRE_INSPECTION_ACCESSORY_KEYS as readonly string[]).includes(key)) {
      return { kind: "accessory", key: key as HireInspectionAccessoryKey };
    }
    return null;
  }
  // Damage review ids are inspection damage UUIDs.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return { kind: "damage", damageId: id };
  }
  return null;
}

export function parseHirePendingReturnReviewDecision(
  value: string,
): HirePendingReturnReviewDecision | null {
  if (value === "approve" || value === "waive") return value;
  return null;
}

export function parseHirePendingReturnReviewAmountGbp(
  decision: HirePendingReturnReviewDecision,
  amountGbp: number | null | undefined,
): { ok: true; amountGbp: number | null } | { ok: false; error: string } {
  if (decision === "waive") return { ok: true, amountGbp: null };
  if (amountGbp == null || !Number.isFinite(amountGbp) || amountGbp <= 0) {
    return { ok: false, error: "Enter a charge amount to approve." };
  }
  const rounded = Math.round(amountGbp * 100) / 100;
  if (rounded <= 0) return { ok: false, error: "Enter a charge amount to approve." };
  return { ok: true, amountGbp: rounded };
}
