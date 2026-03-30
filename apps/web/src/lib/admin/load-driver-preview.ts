import { cache } from "react";
import {
  driverOnboardingComplete,
  type DriverOnboardingRow,
} from "@/lib/driver/licence-check";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type DriverPreviewImageUrls = {
  front: string | null;
  back: string | null;
  phv: string | null;
};

export type DriverPreviewPreviousAddress = {
  line1: string;
  line2: string | null;
  town: string;
  county: string | null;
  postcode: string;
  effectiveTo: string | null;
};

/** Full `driver_profiles` row for admin preview (service role). */
export type DriverPreviewProfileRow = Record<string, unknown> & {
  user_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  address_town: string;
  address_county: string | null;
  address_postcode: string;
  address_verified_at: string | null;
  pending_address_line1: string | null;
  pending_address_line2: string | null;
  pending_address_town: string | null;
  pending_address_county: string | null;
  pending_address_postcode: string | null;
  pending_address_submitted_at: string | null;
  driving_licence_number: string | null;
  driving_licence_expiry: string | null;
  phv_licence_number: string | null;
  phv_licensing_authority: string | null;
  phv_licence_expiry: string | null;
  driving_licence_front_path: string | null;
  driving_licence_back_path: string | null;
  phv_licence_card_path: string | null;
  driving_address_confirmed_at: string | null;
  phv_address_confirmed_at: string | null;
  licence_revalidation_due_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DriverPreviewBundle = {
  userId: string;
  email: string | null;
  displayName: string | null;
  dp: DriverPreviewProfileRow;
  previousAddress: DriverPreviewPreviousAddress | null;
  onboardingComplete: boolean;
  licenceImageUrls: DriverPreviewImageUrls;
};

async function signLicenceObjectUrlAdmin(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path || !String(path).trim()) return null;
  const { data, error } = await admin.storage
    .from("driver-licences")
    .createSignedUrl(String(path).trim(), 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function loadDriverPreviewBundleImpl(userId: string): Promise<DriverPreviewBundle | null> {
  const trimmed = userId?.trim();
  if (!trimmed) return null;

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return null;
  }

  const [{ data: raw, error: rawErr }, { data: profRow, error: profErr }, authRes] = await Promise.all([
    admin.from("driver_profiles").select("*").eq("user_id", trimmed).maybeSingle(),
    admin.from("profiles").select("display_name").eq("id", trimmed).maybeSingle(),
    admin.auth.admin.getUserById(trimmed),
  ]);

  if (rawErr || !raw || typeof raw !== "object" || !("user_id" in raw)) return null;

  const dp = raw as DriverPreviewProfileRow;

  const { data: prevAddr } = await admin
    .from("driver_address_history")
    .select("address_line1, address_line2, address_town, address_county, address_postcode, effective_to")
    .eq("user_id", trimmed)
    .order("effective_to", { ascending: false })
    .limit(1)
    .maybeSingle();

  const previousAddress: DriverPreviewPreviousAddress | null = prevAddr
    ? {
        line1: prevAddr.address_line1,
        line2: prevAddr.address_line2 ?? null,
        town: prevAddr.address_town,
        county: prevAddr.address_county ?? null,
        postcode: prevAddr.address_postcode,
        effectiveTo: prevAddr.effective_to ?? null,
      }
    : null;

  const email = authRes.data?.user?.email ?? null;
  const displayName = profErr ? null : (profRow?.display_name ?? null);

  const [front, back, phv] = await Promise.all([
    signLicenceObjectUrlAdmin(admin, dp.driving_licence_front_path as string | null),
    signLicenceObjectUrlAdmin(admin, dp.driving_licence_back_path as string | null),
    signLicenceObjectUrlAdmin(admin, dp.phv_licence_card_path as string | null),
  ]);

  return {
    userId: trimmed,
    email,
    displayName,
    dp,
    previousAddress,
    onboardingComplete: driverOnboardingComplete(dp as unknown as DriverOnboardingRow),
    licenceImageUrls: { front, back, phv },
  };
}

/**
 * One load per request per `userId` (layout + pages share work; includes signed licence URLs).
 */
export const loadDriverPreviewBundle = cache(loadDriverPreviewBundleImpl);
