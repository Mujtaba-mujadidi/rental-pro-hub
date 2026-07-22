"use server";

import { getSessionUser, requireRentalCompanyArea } from "@/lib/auth/profile";
import { canReadRentals } from "@/lib/auth/rental-permissions";
import { loadHireGroupSignedDocuments, type HireSignedDocumentRow } from "@/lib/fleet/hire-signed-documents";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type HireSignedDocumentsPayload = {
  hireGroupId: string;
  vehicleVrm: string;
  driverLabel: string | null;
  documents: HireSignedDocumentRow[];
};

async function loadGroupHeader(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  hireGroupId: string,
): Promise<{ vehicleVrm: string; driverLabel: string | null } | null> {
  const { data: group } = await admin
    .from("vehicle_hire_groups")
    .select("driver_email, driver_licence_number, vehicles(vrm)")
    .eq("id", hireGroupId)
    .maybeSingle();
  if (!group) return null;

  const vehicle = group.vehicles as { vrm?: string | null } | null;
  return {
    vehicleVrm: vehicle?.vrm?.trim() || "Vehicle",
    driverLabel: (group.driver_email as string | null) ?? (group.driver_licence_number as string | null) ?? null,
  };
}

export async function loadRentalHireSignedDocumentsAction(
  hireGroupId: string,
): Promise<{ ok: true; payload: HireSignedDocumentsPayload } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };

  const id = hireGroupId.trim();
  if (!id) return { ok: false, error: "Hire not found." };

  const supabase = await createClient();
  const { data: group, error } = await supabase.from("vehicle_hire_groups").select("id").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!group?.id) return { ok: false, error: "Hire not found." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const header = await loadGroupHeader(admin, id);
  if (!header) return { ok: false, error: "Hire not found." };

  const documents = await loadHireGroupSignedDocuments(admin, id);
  if (!documents.length) return { ok: false, error: "No signed agreements yet." };

  return {
    ok: true,
    payload: {
      hireGroupId: id,
      vehicleVrm: header.vehicleVrm,
      driverLabel: header.driverLabel,
      documents,
    },
  };
}

export async function loadDriverHireSignedDocumentsAction(
  hireGroupId: string,
): Promise<{ ok: true; payload: HireSignedDocumentsPayload } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const id = hireGroupId.trim();
  if (!id) return { ok: false, error: "Hire not found." };

  const supabase = await createClient();
  const { data: group, error } = await supabase
    .from("vehicle_hire_groups")
    .select("id, driver_user_id")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!group?.id) return { ok: false, error: "Hire not found." };
  if (group.driver_user_id !== user.id) return { ok: false, error: "You are not authorised to view these documents." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const header = await loadGroupHeader(admin, id);
  if (!header) return { ok: false, error: "Hire not found." };

  const documents = await loadHireGroupSignedDocuments(admin, id);
  if (!documents.length) return { ok: false, error: "No signed agreements yet." };

  return {
    ok: true,
    payload: {
      hireGroupId: id,
      vehicleVrm: header.vehicleVrm,
      driverLabel: header.driverLabel,
      documents,
    },
  };
}
