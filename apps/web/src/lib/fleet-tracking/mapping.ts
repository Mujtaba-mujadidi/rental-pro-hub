import { normalizeVrm } from "@/lib/fleet/vehicles";

export type TrackerDevice = {
  imei: string;
  devicename: string;
  platenumber: string;
  devicetype?: string;
};

export type DeviceGroup = {
  baseVrm: string;
  primaryImei: string;
  secondaryImei: string | null;
  primaryName: string;
  secondaryName: string | null;
  devices: TrackerDevice[];
};

export type MappingSuggestion = {
  vehicleId: string;
  vrm: string;
  make: string;
  model: string;
  baseVrm: string;
  primaryImei: string;
  secondaryImei: string | null;
  primaryName: string;
  secondaryName: string | null;
  alreadyLinked: boolean;
};

export type VehicleMappingLinkInput = {
  vehicleId: string;
  primaryImei: string;
  secondaryImei: string | null;
};

export type VehicleImeiRow = {
  id: string;
  vrm: string;
  gps_primary_imei: string | null;
  gps_secondary_imei: string | null;
};

function linkedImeisForVehicle(vehicle: VehicleImeiRow): string[] {
  const imeis: string[] = [];
  const primary = vehicle.gps_primary_imei?.trim();
  const secondary = vehicle.gps_secondary_imei?.trim();
  if (primary) imeis.push(primary);
  if (secondary && secondary !== primary) imeis.push(secondary);
  return imeis;
}

/** Dropdown label for an unmatched device group. */
export function deviceGroupOptionLabel(group: DeviceGroup): string {
  const names = group.secondaryName ? `${group.primaryName} + ${group.secondaryName}` : group.primaryName;
  return `${names} (${group.baseVrm})`;
}

/**
 * Validates mapping links before persisting IMEIs on vehicles.
 * Ensures devices exist on the tracker account and are not linked to another vehicle.
 */
export function validateVehicleMappingLinks(
  links: VehicleMappingLinkInput[],
  context: {
    accountImeis: ReadonlySet<string>;
    vehicles: VehicleImeiRow[];
  },
): { ok: true } | { ok: false; error: string } {
  if (!links.length) return { ok: false, error: "No mappings to save." };

  const vehicleById = new Map(context.vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const imeiOwner = new Map<string, string>();
  for (const vehicle of context.vehicles) {
    for (const imei of linkedImeisForVehicle(vehicle)) {
      imeiOwner.set(imei, vehicle.id);
    }
  }

  const usedImeis = new Set<string>();

  for (const link of links) {
    const vehicleId = link.vehicleId.trim();
    const primary = link.primaryImei.trim();
    const secondary = link.secondaryImei?.trim() || null;

    if (!vehicleId) return { ok: false, error: "Every mapping needs a vehicle." };
    if (!primary) return { ok: false, error: "Every mapping needs a primary device." };

    const vehicle = vehicleById.get(vehicleId);
    if (!vehicle) return { ok: false, error: "One or more vehicles could not be found." };

    if (!context.accountImeis.has(primary)) {
      return { ok: false, error: `Primary device ${primary} is not on this tracker account.` };
    }
    if (secondary) {
      if (secondary === primary) {
        return { ok: false, error: "Secondary device must differ from primary." };
      }
      if (!context.accountImeis.has(secondary)) {
        return { ok: false, error: `Secondary device ${secondary} is not on this tracker account.` };
      }
    }

    for (const imei of [primary, secondary].filter((value): value is string => Boolean(value))) {
      if (usedImeis.has(imei)) {
        return { ok: false, error: `Device ${imei} is linked more than once in this request.` };
      }
      usedImeis.add(imei);

      const ownerId = imeiOwner.get(imei);
      if (ownerId && ownerId !== vehicleId) {
        const owner = vehicleById.get(ownerId);
        return { ok: false, error: `Device ${imei} is already linked to ${owner?.vrm ?? ownerId}.` };
      }
    }
  }

  return { ok: true };
}

const IMOB_SUFFIX_RE = /(?:[-_\s]*)IMOB$/i;

/** Strip immobiliser suffix and normalise like VRM. */
export function baseVrmFromDeviceLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const withoutImob = trimmed.replace(IMOB_SUFFIX_RE, "");
  return normalizeVrm(withoutImob);
}

export function isImobDeviceLabel(raw: string): boolean {
  return IMOB_SUFFIX_RE.test(raw.trim());
}

export type TrackingDataSource = {
  vehicleVrm: string;
  role: "primary";
  deviceLabel: string;
  isImobDevice: boolean;
  hasSecondaryDevice: boolean;
  secondaryDeviceLabel: string | null;
};

/** UI line for where live tracker readings come from. */
export function describeTrackingDataSource(source: TrackingDataSource): string {
  const device = source.deviceLabel.trim() || source.vehicleVrm;
  const role = source.isImobDevice ? "Primary device (immobiliser)" : "Primary device";
  return `${role} · ${device}`;
}

/** Prefer device name; fall back to plate number. */
export function deviceMatchLabel(d: TrackerDevice): string {
  return (d.devicename || d.platenumber || "").trim();
}

/**
 * Group tracker devices by base VRM.
 * Primary = imob device when present; otherwise the plain VRM device.
 */
export function groupDevicesByBaseVrm(devices: TrackerDevice[]): DeviceGroup[] {
  const byBase = new Map<string, TrackerDevice[]>();
  for (const d of devices) {
    const label = deviceMatchLabel(d);
    const base = baseVrmFromDeviceLabel(label);
    if (!base || !d.imei?.trim()) continue;
    const list = byBase.get(base) ?? [];
    list.push(d);
    byBase.set(base, list);
  }

  const groups: DeviceGroup[] = [];
  for (const [baseVrm, list] of byBase) {
    const imob = list.find((d) => isImobDeviceLabel(deviceMatchLabel(d)));
    const plain = list.find((d) => !isImobDeviceLabel(deviceMatchLabel(d)));
    const primary = imob ?? plain ?? list[0];
    const secondary = imob && plain && plain.imei !== primary.imei ? plain : null;
    groups.push({
      baseVrm,
      primaryImei: primary.imei.trim(),
      secondaryImei: secondary?.imei.trim() ?? null,
      primaryName: deviceMatchLabel(primary),
      secondaryName: secondary ? deviceMatchLabel(secondary) : null,
      devices: list,
    });
  }
  return groups.sort((a, b) => a.baseVrm.localeCompare(b.baseVrm));
}

export function suggestVehicleMappings(
  vehicles: {
    id: string;
    vrm: string;
    make: string;
    model: string;
    gps_primary_imei: string | null;
    gps_secondary_imei: string | null;
  }[],
  devices: TrackerDevice[],
): { suggestions: MappingSuggestion[]; unmatchedDevices: DeviceGroup[]; unmatchedVehicles: typeof vehicles } {
  const groups = groupDevicesByBaseVrm(devices);
  const groupByBase = new Map(groups.map((g) => [g.baseVrm, g]));
  const usedBases = new Set<string>();

  const suggestions: MappingSuggestion[] = [];
  const unmatchedVehicles: typeof vehicles = [];

  for (const v of vehicles) {
    const base = normalizeVrm(v.vrm);
    const group = groupByBase.get(base);
    if (!group) {
      unmatchedVehicles.push(v);
      continue;
    }
    usedBases.add(base);
    suggestions.push({
      vehicleId: v.id,
      vrm: v.vrm,
      make: v.make,
      model: v.model,
      baseVrm: base,
      primaryImei: group.primaryImei,
      secondaryImei: group.secondaryImei,
      primaryName: group.primaryName,
      secondaryName: group.secondaryName,
      alreadyLinked:
        v.gps_primary_imei === group.primaryImei &&
        (v.gps_secondary_imei ?? null) === (group.secondaryImei ?? null),
    });
  }

  const unmatchedDevices = groups.filter((g) => !usedBases.has(g.baseVrm));
  return { suggestions, unmatchedDevices, unmatchedVehicles };
}
