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
