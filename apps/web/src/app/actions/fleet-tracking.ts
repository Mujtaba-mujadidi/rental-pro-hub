"use server";

import { revalidatePath } from "next/cache";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canManageFleetTracking } from "@/lib/auth/rental-permissions";
import { encryptFleetTrackingPassword } from "@/lib/fleet-tracking/crypto";
import {
  getCompanyAccessToken,
  loadCompanyFleetTracking,
} from "@/lib/fleet-tracking/credentials";
import {
  deviceMatchLabel,
  isImobDeviceLabel,
  suggestVehicleMappings,
  type MappingSuggestion,
  type DeviceGroup,
  type TrackingDataSource,
} from "@/lib/fleet-tracking/mapping";
import {
  accStatusLabel,
  clearAccessTokenCache,
  dataStatusLabel,
  getAccessToken,
  getDevicesByImeis,
  listDevices,
  mileageReport,
  sanitizeMileageError,
  setDeviceMileage,
  trackDevices,
  weeklyMileageWindowUnix,
  type TrackerTrackRecord,
} from "@/lib/fleet-tracking/smartcar-tracker-client";
import { formatUkDateTime } from "@/lib/datetime/uk";
import {
  formatMiles,
  kmhToMph,
  kmToMiles,
  metresToMiles,
  milesToSetMileageKmString,
} from "@/lib/fleet-tracking/units";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type FleetTrackingSettings = {
  enabled: boolean;
  account: string | null;
  hasPassword: boolean;
};

export async function loadFleetTrackingSettingsAction(): Promise<
  { ok: true; settings: FleetTrackingSettings } | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const row = await loadCompanyFleetTracking(companyId);
  if (!row) return { ok: false, error: "Company not found." };

  return {
    ok: true,
    settings: {
      enabled: Boolean(row.fleet_tracking_enabled),
      account: row.fleet_tracking_account,
      hasPassword: Boolean(row.fleet_tracking_password_encrypted),
    },
  };
}

export async function saveFleetTrackingCredentialsAction(input: {
  account: string;
  password: string;
}): Promise<{ ok: true; connectionWarning?: string } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canManageFleetTracking(profile)) {
    return { ok: false, error: "You do not have permission to manage Fleet Tracking." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const row = await loadCompanyFleetTracking(companyId);
  if (!row?.fleet_tracking_enabled) {
    return { ok: false, error: "Fleet Tracking is not enabled for this company. Contact support." };
  }

  const account = input.account.trim();
  const password = input.password;
  if (!account) return { ok: false, error: "Account is required." };
  if (!password && !row.fleet_tracking_password_encrypted) {
    return { ok: false, error: "Password is required." };
  }

  let encrypted = row.fleet_tracking_password_encrypted;
  if (password) {
    try {
      encrypted = encryptFleetTrackingPassword(password);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Could not encrypt password." };
    }
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("companies")
    .update({
      fleet_tracking_account: account,
      fleet_tracking_password_encrypted: encrypted,
    })
    .eq("id", companyId);
  if (error) return { ok: false, error: error.message };

  clearAccessTokenCache(companyId);

  // Validate against SmartCar Tracker after save (does not block saving)
  let connectionWarning: string | undefined;
  if (password) {
    const test = await getAccessToken(account, password, companyId);
    if (!test.ok) {
      clearAccessTokenCache(companyId);
      connectionWarning = test.error;
    }
  } else {
    const tokenRes = await getCompanyAccessToken(companyId);
    if (!tokenRes.ok) connectionWarning = tokenRes.error;
  }

  revalidatePath("/rental/fleet-tracking");
  if (connectionWarning) return { ok: true, connectionWarning };
  return { ok: true };
}

export async function testFleetTrackingConnectionAction(): Promise<
  { ok: true; deviceCount: number } | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const tokenRes = await getCompanyAccessToken(companyId);
  if (!tokenRes.ok) {
    return { ok: false, error: tokenRes.error };
  }

  const devices = await listDevices(tokenRes.token, tokenRes.account);
  if (!devices.ok) {
    return { ok: false, error: devices.error };
  }
  return { ok: true, deviceCount: devices.data.length };
}

export async function loadMappingSuggestionsAction(): Promise<
  | {
      ok: true;
      suggestions: MappingSuggestion[];
      unmatchedDevices: DeviceGroup[];
      unmatchedVehicles: { id: string; vrm: string; make: string; model: string }[];
    }
  | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  if (!canManageFleetTracking(profile)) {
    return { ok: false, error: "You do not have permission to manage Fleet Tracking." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const tokenRes = await getCompanyAccessToken(companyId);
  if (!tokenRes.ok) return tokenRes;

  const devicesRes = await listDevices(tokenRes.token, tokenRes.account);
  if (!devicesRes.ok) return { ok: false, error: devicesRes.error };

  const supabase = await createClient();
  const { data: vehicles, error } = await supabase
    .from("vehicles")
    .select("id, vrm, make, model, gps_primary_imei, gps_secondary_imei")
    .eq("parent_company_id", companyId)
    .order("vrm", { ascending: true });
  if (error) return { ok: false, error: error.message };

  const mapped = suggestVehicleMappings(
    (vehicles ?? []).map((v) => ({
      id: v.id,
      vrm: v.vrm,
      make: v.make,
      model: v.model,
      gps_primary_imei: v.gps_primary_imei ?? null,
      gps_secondary_imei: v.gps_secondary_imei ?? null,
    })),
    devicesRes.data,
  );

  return {
    ok: true,
    suggestions: mapped.suggestions,
    unmatchedDevices: mapped.unmatchedDevices,
    unmatchedVehicles: mapped.unmatchedVehicles.map((v) => ({
      id: v.id,
      vrm: v.vrm,
      make: v.make,
      model: v.model,
    })),
  };
}

export async function confirmVehicleMappingsAction(
  links: { vehicleId: string; primaryImei: string; secondaryImei: string | null }[],
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canManageFleetTracking(profile)) {
    return { ok: false, error: "You do not have permission to manage Fleet Tracking." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };
  if (!links.length) return { ok: false, error: "No mappings selected." };

  const supabase = await createClient();
  let updated = 0;
  for (const link of links) {
    const vehicleId = link.vehicleId.trim();
    const primary = link.primaryImei.trim();
    if (!vehicleId || !primary) continue;
    const secondary = link.secondaryImei?.trim() || null;
    const { error } = await supabase
      .from("vehicles")
      .update({
        gps_primary_imei: primary,
        gps_secondary_imei: secondary,
      })
      .eq("id", vehicleId)
      .eq("parent_company_id", companyId);
    if (error) return { ok: false, error: error.message };
    updated += 1;
  }

  revalidatePath("/rental/fleet-tracking");
  revalidatePath("/rental/vehicles");
  return { ok: true, updated };
}

export type LiveTrackSnapshot = {
  imei: string;
  latitude: number | null;
  longitude: number | null;
  speedMph: number | null;
  course: number | null;
  statusLabel: string;
  ignitionLabel: string;
  odometerMiles: number | null;
  todayMiles: number | null;
  lastGpsAt: string | null;
  mapUrl: string | null;
};

async function resolveTrackingDataSource(
  accessToken: string,
  vehicle: {
    vrm: string;
    gps_primary_imei: string;
    gps_secondary_imei: string | null;
  },
): Promise<TrackingDataSource> {
  const imeis = [vehicle.gps_primary_imei, vehicle.gps_secondary_imei].filter(
    (x): x is string => Boolean(x?.trim()),
  );
  const unique = [...new Set(imeis.map((i) => i.trim()))];
  const details = await getDevicesByImeis(accessToken, unique);
  const byImei = new Map(
    (details.ok ? details.data : []).map((d) => [d.imei, d] as const),
  );
  const primary = byImei.get(vehicle.gps_primary_imei.trim());
  const primaryLabel = primary ? deviceMatchLabel(primary) : "";
  const secondaryImei = vehicle.gps_secondary_imei?.trim() || null;
  const secondary = secondaryImei ? byImei.get(secondaryImei) : null;
  return {
    vehicleVrm: vehicle.vrm,
    role: "primary",
    deviceLabel: primaryLabel || vehicle.vrm,
    isImobDevice: primaryLabel ? isImobDeviceLabel(primaryLabel) : false,
    hasSecondaryDevice: Boolean(secondaryImei),
    secondaryDeviceLabel: secondary ? deviceMatchLabel(secondary) : null,
  };
}

function snapshotFromTrack(rec: TrackerTrackRecord): LiveTrackSnapshot {
  const lat = rec.latitude != null && Number.isFinite(rec.latitude) ? rec.latitude : null;
  const lng = rec.longitude != null && Number.isFinite(rec.longitude) ? rec.longitude : null;
  const odo =
    rec.mileage != null && rec.mileage >= 0 ? metresToMiles(rec.mileage) : null;
  const today =
    rec.todaymileage != null && rec.todaymileage >= 0 ? metresToMiles(rec.todaymileage) : null;
  const gpsUnix = rec.gpstime && rec.gpstime > 0 ? rec.gpstime : null;
  return {
    imei: rec.imei,
    latitude: lat,
    longitude: lng,
    speedMph: rec.speed != null && rec.speed >= 0 ? kmhToMph(rec.speed) : null,
    course: rec.course ?? null,
    statusLabel: dataStatusLabel(rec.datastatus),
    ignitionLabel: accStatusLabel(rec.accstatus),
    odometerMiles: odo,
    todayMiles: today,
    lastGpsAt: gpsUnix ? formatUkDateTime(new Date(gpsUnix * 1000)) : null,
    mapUrl:
      lat != null && lng != null
        ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`
        : null,
  };
}

export async function getVehicleLiveTrackAction(vehicleId: string): Promise<
  | { ok: true; linked: false }
  | { ok: true; linked: true; snapshot: LiveTrackSnapshot; source: TrackingDataSource }
  | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const row = await loadCompanyFleetTracking(companyId);
  if (!row?.fleet_tracking_enabled) return { ok: true, linked: false };

  const supabase = await createClient();
  const { data: vehicle, error } = await supabase
    .from("vehicles")
    .select("id, vrm, gps_primary_imei, gps_secondary_imei")
    .eq("id", vehicleId.trim())
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!vehicle?.gps_primary_imei) return { ok: true, linked: false };

  const tokenRes = await getCompanyAccessToken(companyId);
  if (!tokenRes.ok) return tokenRes;

  const [track, source] = await Promise.all([
    trackDevices(tokenRes.token, [vehicle.gps_primary_imei]),
    resolveTrackingDataSource(tokenRes.token, {
      vrm: vehicle.vrm,
      gps_primary_imei: vehicle.gps_primary_imei,
      gps_secondary_imei: vehicle.gps_secondary_imei,
    }),
  ]);
  if (!track.ok) return { ok: false, error: track.error };
  const rec = track.data[0];
  if (!rec) return { ok: false, error: "No track data returned for this device." };

  return { ok: true, linked: true, snapshot: snapshotFromTrack(rec), source };
}

export async function setVehicleTrackerMileageAction(
  vehicleId: string,
  mileageMiles: number,
): Promise<
  | { ok: true; response: string; targetMiles: number; deviceCount: number }
  | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canManageFleetTracking(profile)) {
    return { ok: false, error: "You do not have permission to set tracker mileage." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };
  if (!Number.isFinite(mileageMiles) || mileageMiles < 0) {
    return { ok: false, error: "Enter a valid mileage in miles." };
  }
  const milesInt = Math.ceil(mileageMiles);

  const supabase = await createClient();
  const { data: vehicle, error } = await supabase
    .from("vehicles")
    .select("id, gps_primary_imei, gps_secondary_imei")
    .eq("id", vehicleId.trim())
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!vehicle?.gps_primary_imei) {
    return { ok: false, error: "This vehicle is not linked to a tracker. Map devices in Fleet Tracking." };
  }

  const imeis = [vehicle.gps_primary_imei, vehicle.gps_secondary_imei].filter(
    (x): x is string => Boolean(x?.trim()),
  );
  const unique = [...new Set(imeis.map((i) => i.trim()))];

  const tokenRes = await getCompanyAccessToken(companyId);
  if (!tokenRes.ok) return tokenRes;

  const mileageKm = milesToSetMileageKmString(milesInt);
  const responses: string[] = [];
  for (const imei of unique) {
    const res = await setDeviceMileage(tokenRes.token, imei, mileageKm);
    if (!res.ok) return { ok: false, error: `${imei}: ${res.error}` };
    responses.push(res.data.response);
  }

  // Keep RMS odometer in sync (whole miles)
  await supabase
    .from("vehicles")
    .update({ current_mileage: milesInt })
    .eq("id", vehicle.id)
    .eq("parent_company_id", companyId);

  revalidatePath(`/rental/vehicles/${vehicle.id}`);
  revalidatePath(`/rental/vehicles/${vehicle.id}/details`);
  return {
    ok: true,
    response: responses[responses.length - 1] ?? "OK",
    targetMiles: milesInt,
    deviceCount: unique.length,
  };
}

export type WeeklyMileageRow = {
  vehicleId: string;
  vrm: string;
  make: string;
  model: string;
  miles: number | null;
  unavailable: boolean;
};

export async function loadWeeklyMileageReportAction(): Promise<
  | { ok: true; beginLabel: string; endLabel: string; rows: WeeklyMileageRow[] }
  | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const tokenRes = await getCompanyAccessToken(companyId);
  if (!tokenRes.ok) return tokenRes;

  const supabase = await createClient();
  const { data: vehicles, error } = await supabase
    .from("vehicles")
    .select("id, vrm, make, model, gps_primary_imei")
    .eq("parent_company_id", companyId)
    .order("vrm", { ascending: true });
  if (error) return { ok: false, error: error.message };

  const linked = (vehicles ?? []).filter((v) => v.gps_primary_imei);
  const { beginUnix, endUnix } = weeklyMileageWindowUnix();
  const beginLabel = formatUkDateTime(new Date(beginUnix * 1000));
  const endLabel = formatUkDateTime(new Date(endUnix * 1000));

  if (!linked.length) {
    return { ok: true, beginLabel, endLabel, rows: [] };
  }

  const imeis = linked.map((v) => v.gps_primary_imei as string);
  const report = await mileageReport(tokenRes.token, imeis, beginUnix, endUnix);
  if (!report.ok) return { ok: false, error: sanitizeMileageError(report.error) };

  const byImei = new Map(report.data.map((r) => [r.imei, r.mileageKm]));
  const rows: WeeklyMileageRow[] = (vehicles ?? []).map((v) => {
    if (!v.gps_primary_imei) {
      return {
        vehicleId: v.id,
        vrm: v.vrm,
        make: v.make,
        model: v.model,
        miles: null,
        unavailable: true,
      };
    }
    const km = byImei.get(v.gps_primary_imei);
    if (km == null) {
      return {
        vehicleId: v.id,
        vrm: v.vrm,
        make: v.make,
        model: v.model,
        miles: null,
        unavailable: true,
      };
    }
    return {
      vehicleId: v.id,
      vrm: v.vrm,
      make: v.make,
      model: v.model,
      miles: kmToMiles(km),
      unavailable: false,
    };
  });

  return { ok: true, beginLabel, endLabel, rows };
}

export async function getVehicleWeeklyMileageAction(vehicleId: string): Promise<
  | { ok: true; linked: false }
  | { ok: true; linked: true; miles: number; beginLabel: string; endLabel: string; source: TrackingDataSource }
  | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const row = await loadCompanyFleetTracking(companyId);
  if (!row?.fleet_tracking_enabled) return { ok: true, linked: false };

  const supabase = await createClient();
  const { data: vehicle, error } = await supabase
    .from("vehicles")
    .select("id, vrm, gps_primary_imei, gps_secondary_imei")
    .eq("id", vehicleId.trim())
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!vehicle?.gps_primary_imei) return { ok: true, linked: false };

  const tokenRes = await getCompanyAccessToken(companyId);
  if (!tokenRes.ok) return tokenRes;

  const { beginUnix, endUnix } = weeklyMileageWindowUnix();
  const [report, source] = await Promise.all([
    mileageReport(tokenRes.token, [vehicle.gps_primary_imei], beginUnix, endUnix),
    resolveTrackingDataSource(tokenRes.token, {
      vrm: vehicle.vrm,
      gps_primary_imei: vehicle.gps_primary_imei,
      gps_secondary_imei: vehicle.gps_secondary_imei,
    }),
  ]);
  if (!report.ok) return { ok: false, error: sanitizeMileageError(report.error) };
  const km = report.data[0]?.mileageKm;
  if (km == null) return { ok: false, error: "No mileage data for this period." };

  return {
    ok: true,
    linked: true,
    miles: kmToMiles(km),
    beginLabel: formatUkDateTime(new Date(beginUnix * 1000)),
    endLabel: formatUkDateTime(new Date(endUnix * 1000)),
    source,
  };
}

/** Re-export for client display helpers if needed */
export { formatMiles };
