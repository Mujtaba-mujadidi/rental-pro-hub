import type {
  HireDetailsDocumentItem,
  HireDetailsHirerCard,
  HireDetailsPayload,
  HireDetailsVehicleCard,
} from "@/app/actions/hire-details";
import { daysFromTodayToExpiry, formatUkDate } from "@/lib/datetime/uk";
import { LICENCE_EXPIRING_SOON_MAX_DAYS } from "@/lib/driver/licence-attention";

export type HireDetailsDocumentStatusChip = {
  label: string;
  tone: "success" | "warn" | "muted";
};

export type HireDetailsComplianceTile = {
  id: string;
  title: string;
  detail: string;
  tone: "warn" | "ok" | "neutral";
  badgeLabel: string;
  badgeTone: "warn" | "ok" | "neutral";
  interactive?: boolean;
};

export type HireDetailsDocumentRowDisplay = {
  id: string;
  label: string;
  subtitle: string | null;
  status: HireDetailsDocumentStatusChip;
  document: HireDetailsDocumentItem;
};

const VEHICLE_DOC_LABELS: Record<string, string> = {
  mot: "MOT certificate",
  logbook: "V5C registration document",
  phv_taxi_licence_paper: "PHV vehicle licence",
};

function parseUkDisplayToYmd(label: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(label.trim());
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function daysBetweenCalendarDates(fromYmd: string, toYmd: string): number | null {
  const from = new Date(`${fromYmd.slice(0, 10)}T12:00:00Z`);
  const to = new Date(`${toYmd.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function expiresDuringHire(expiryYmd: string | null | undefined, contractEndYmd: string | null): boolean {
  if (!expiryYmd || !contractEndYmd) return false;
  return expiryYmd.slice(0, 10) <= contractEndYmd.slice(0, 10);
}

export function vehicleExpiryHint(
  expiryYmd: string | null | undefined,
  contractEndYmd: string | null,
): string | null {
  if (!expiryYmd || !contractEndYmd) return null;
  const daysBeforeEnd = daysBetweenCalendarDates(expiryYmd.slice(0, 10), contractEndYmd.slice(0, 10));
  if (daysBeforeEnd === null) return null;
  if (daysBeforeEnd >= 0 && daysBeforeEnd <= 31) return "before end";
  if (expiryYmd.slice(0, 10) <= contractEndYmd.slice(0, 10)) return "during hire";
  return null;
}

export function hireDetailsDocumentStatusChip(input: {
  status: HireDetailsDocumentItem["status"];
  expiryYmd?: string | null;
  contractEndYmd?: string | null;
}): HireDetailsDocumentStatusChip {
  if (input.status === "missing") {
    return { label: "Missing", tone: "warn" };
  }
  if (input.expiryYmd && expiresDuringHire(input.expiryYmd, input.contractEndYmd ?? null)) {
    return { label: "Expires during hire", tone: "warn" };
  }
  if (input.expiryYmd) {
    return { label: "Current", tone: "success" };
  }
  return { label: "Available", tone: "muted" };
}

function vehicleDocExpiryYmd(
  docId: string,
  vehicle: HireDetailsVehicleCard,
): string | null {
  if (docId === "mot") return vehicle.motExpiryYmd;
  if (docId === "phv_taxi_licence_paper") return vehicle.phvExpiryYmd;
  return null;
}

export function buildHireDetailsVehicleDocumentRows(
  data: Pick<HireDetailsPayload, "vehicleDocuments" | "vehicle" | "rental">,
): HireDetailsDocumentRowDisplay[] {
  return data.vehicleDocuments.map((document) => {
    const docKey = document.id;
    const expiryYmd = vehicleDocExpiryYmd(docKey, data.vehicle);
    let subtitle: string | null = null;
    if (docKey === "mot" && data.vehicle.motExpiryLabel !== "—") {
      subtitle = `Expires ${data.vehicle.motExpiryLabel}`;
    } else if (docKey === "phv_taxi_licence_paper" && data.vehicle.phvExpiryLabel !== "—") {
      subtitle = `Expires ${data.vehicle.phvExpiryLabel}`;
    }
    return {
      id: document.id,
      label: VEHICLE_DOC_LABELS[docKey] ?? document.label,
      subtitle,
      status: hireDetailsDocumentStatusChip({
        status: document.status,
        expiryYmd,
        contractEndYmd: data.rental.contractEndYmd,
      }),
      document,
    };
  });
}

export function buildHireDetailsDriverDocumentRows(
  data: Pick<HireDetailsPayload, "hirerDocuments" | "hirer" | "rental">,
): HireDetailsDocumentRowDisplay[] {
  const docs = data.hirerDocuments;
  const licenceFront = docs.find((doc) => doc.id === "driving_licence_front");
  const licenceBack = docs.find((doc) => doc.id === "driving_licence_back");
  const phv = docs.find((doc) => doc.id === "phv_licence_card");
  const licenceStatus =
    licenceFront?.status === "on_file" && licenceBack?.status === "on_file"
      ? "on_file"
      : licenceFront?.status === "on_file" || licenceBack?.status === "on_file"
        ? "on_file"
        : "missing";

  const rows: HireDetailsDocumentRowDisplay[] = [
    {
      id: "driving_licence",
      label: "Driving licence",
      subtitle: data.hirer?.drivingLicenceExpiryLabel
        ? `Expires ${data.hirer.drivingLicenceExpiryLabel}`
        : null,
      status: hireDetailsDocumentStatusChip({
        status: licenceStatus,
        expiryYmd: data.hirer?.drivingLicenceExpiryLabel
          ? parseUkDisplayToYmd(data.hirer.drivingLicenceExpiryLabel)
          : null,
        contractEndYmd: data.rental.contractEndYmd,
      }),
      document: {
        id: "driving_licence",
        label: "Driving licence",
        status: licenceStatus,
        viewUrl: licenceFront?.viewUrl ?? licenceBack?.viewUrl ?? null,
        fileName: licenceFront?.fileName ?? licenceBack?.fileName ?? null,
      },
    },
    {
      id: "phv_licence_card",
      label: "PHV driver licence",
      subtitle: data.hirer?.phvLicenceExpiryLabel
        ? `Expires ${data.hirer.phvLicenceExpiryLabel}`
        : null,
      status: hireDetailsDocumentStatusChip({
        status: phv?.status ?? "missing",
        expiryYmd: data.hirer?.phvLicenceExpiryLabel
          ? parseUkDisplayToYmd(data.hirer.phvLicenceExpiryLabel)
          : null,
        contractEndYmd: data.rental.contractEndYmd,
      }),
      document: phv ?? {
        id: "phv_licence_card",
        label: "PHV driver licence",
        status: "missing",
        viewUrl: null,
        fileName: null,
      },
    },
  ];

  return rows;
}

const ENDED_HIRE_STATUSES = new Set(["completed", "terminated", "cancelled"]);

export function hireDetailsIsEnded(status: string | null | undefined): boolean {
  return Boolean(status && ENDED_HIRE_STATUSES.has(status));
}

export function buildHireDetailsInsuranceDocumentRow(
  data: Pick<HireDetailsPayload, "hireInsurance" | "rental">,
  audience: "staff" | "driver" = "staff",
): HireDetailsDocumentRowDisplay {
  const insurance = data.hireInsurance;
  const expiryYmd = insurance.expiryDate?.slice(0, 10) ?? null;
  const expiryLabel = expiryYmd ? formatUkDate(expiryYmd) : null;
  let subtitle: string | null = null;
  if (!insurance.hasDocument) {
    subtitle =
      insurance.providedBy === "driver"
        ? audience === "driver"
          ? "You need to upload this"
          : "Awaiting upload from the driver"
        : insurance.providedBy === "company"
          ? audience === "driver"
            ? "Your rental company will upload this"
            : "Awaiting upload from your rental company"
          : "Not uploaded";
  } else if (insurance.insuranceTypeLabel && expiryLabel) {
    subtitle = `${insurance.insuranceTypeLabel} · Expires ${expiryLabel}`;
  } else if (expiryLabel) {
    subtitle = `Expires ${expiryLabel}`;
  } else if (insurance.insuranceTypeLabel) {
    subtitle = insurance.insuranceTypeLabel;
  }

  let status: HireDetailsDocumentStatusChip;
  if (!insurance.hasDocument) {
    status = { label: "Missing", tone: "warn" };
  } else if (insurance.status === "expired") {
    status = { label: "Expired", tone: "warn" };
  } else if (insurance.status === "expiring") {
    status = { label: "Expiring soon", tone: "warn" };
  } else {
    status = hireDetailsDocumentStatusChip({
      status: "on_file",
      expiryYmd,
      contractEndYmd: data.rental.contractEndYmd,
    });
  }

  return {
    id: "hire_insurance",
    label: "Hire insurance certificate",
    subtitle,
    status,
    document: {
      id: "hire_insurance",
      label: "Hire insurance certificate",
      status: insurance.hasDocument ? "on_file" : "missing",
      viewUrl: null,
      fileName: insurance.fileName,
    },
  };
}

function licenceComplianceDetail(
  hirer: HireDetailsHirerCard | null,
  field: "driving" | "phv",
  contractEndYmd: string | null,
): string {
  const expiryLabel =
    field === "driving" ? hirer?.drivingLicenceExpiryLabel : hirer?.phvLicenceExpiryLabel;
  if (!expiryLabel || expiryLabel === "—") return "Expiry not recorded";
  const duringHire =
    contractEndYmd && parseUkDisplayToYmd(expiryLabel)
      ? expiresDuringHire(parseUkDisplayToYmd(expiryLabel), contractEndYmd)
        ? "during hire"
        : null
      : null;
  return duringHire ? `Expires ${expiryLabel} - ${duringHire}` : `Expires ${expiryLabel}`;
}

function insuranceComplianceTile(
  insurance: HireDetailsPayload["hireInsurance"],
  audience: "staff" | "driver" = "staff",
): HireDetailsComplianceTile {
  if (insurance.status === "not_configured" || !insurance.hasDocument) {
    const responsibilityUnset = insurance.status === "not_configured" && !insurance.providedBy;
    const awaitingFromDriver = insurance.providedBy === "driver";
    const detail = responsibilityUnset
      ? audience === "driver"
        ? "Insurance has not been set for this hire."
        : "Insurance responsibility has not been set for this hire."
      : awaitingFromDriver
        ? audience === "driver"
          ? "You need to upload your hire insurance certificate."
          : "Awaiting upload from the driver."
        : audience === "driver"
          ? "Your rental company will upload the hire insurance certificate."
          : "Awaiting upload from your rental company.";
    return {
      id: "insurance",
      title: "Hire insurance certificate",
      detail,
      tone: "warn",
      badgeLabel: responsibilityUnset ? "Not set" : "Awaiting upload",
      badgeTone: "warn",
      interactive: insurance.canUpload && !insurance.hasDocument,
    };
  }

  const warn = insurance.status === "expired" || insurance.status === "expiring";
  return {
    id: "insurance",
    title: "Hire insurance certificate",
    detail:
      insurance.attentionMessage ??
      insurance.insuranceTypeLabel ??
      (audience === "driver" ? "Your certificate is on file." : "Certificate uploaded."),
    tone: warn ? "warn" : "ok",
    badgeLabel:
      insurance.status === "expired"
        ? "Expired"
        : insurance.status === "expiring"
          ? "Expiring soon"
          : "On file",
    badgeTone: warn ? "warn" : "ok",
    interactive: false,
  };
}

export function buildHireDetailsComplianceTiles(
  data: Pick<HireDetailsPayload, "hireInsurance" | "hirer" | "rental">,
): HireDetailsComplianceTile[] {
  const insuranceTile = insuranceComplianceTile(data.hireInsurance, "staff");

  const drivingExpiry = data.hirer?.drivingLicenceExpiryLabel;
  const phvExpiry = data.hirer?.phvLicenceExpiryLabel;
  const drivingDays = drivingExpiry ? daysFromTodayToExpiry(parseUkDisplayToYmd(drivingExpiry)) : null;
  const phvDays = phvExpiry ? daysFromTodayToExpiry(parseUkDisplayToYmd(phvExpiry)) : null;

  return [
    insuranceTile,
    {
      id: "driving_licence",
      title: "Driving licence",
      detail: licenceComplianceDetail(data.hirer, "driving", data.rental.contractEndYmd),
      tone:
        drivingDays !== null && (drivingDays < 0 || drivingDays <= LICENCE_EXPIRING_SOON_MAX_DAYS)
          ? "warn"
          : "ok",
      badgeLabel: "Monitor",
      badgeTone: "warn",
    },
    {
      id: "phv_licence",
      title: "Driver PHV licence",
      detail: licenceComplianceDetail(data.hirer, "phv", data.rental.contractEndYmd),
      tone:
        phvDays !== null && (phvDays < 0 || phvDays <= LICENCE_EXPIRING_SOON_MAX_DAYS) ? "warn" : "ok",
      badgeLabel: "Monitor",
      badgeTone: "warn",
    },
  ];
}

export function buildHireDetailsDriverComplianceTiles(
  data: Pick<HireDetailsPayload, "hireInsurance">,
): HireDetailsComplianceTile[] {
  return [insuranceComplianceTile(data.hireInsurance, "driver")];
}

export const HIRE_DETAILS_EXPIRING_PREVIEW_COUNT = 3;

export type HireDetailsExpiringSoonItem = {
  id: string;
  kind: "vehicle_document" | "hire_agreement";
  label: string;
  expiryLabel: string;
  expiryYmd: string;
  statusLabel: string;
  statusTone: "warn" | "danger" | "success" | "muted";
  viewUrl: string | null;
};

function isExpiringSoonOrDuringHire(expiryYmd: string, contractEndYmd: string | null): boolean {
  const daysUntil = daysFromTodayToExpiry(expiryYmd);
  if (daysUntil !== null && daysUntil <= LICENCE_EXPIRING_SOON_MAX_DAYS) return true;
  return expiresDuringHire(expiryYmd, contractEndYmd);
}

function latestHireEndYmd(rental: Pick<HireDetailsPayload["rental"], "contractEndYmd" | "agreements">): string | null {
  return rental.agreements.reduce<string | null>((latest, agreement) => {
    const ymd = agreement.endDateYmd;
    if (!ymd) return latest;
    if (!latest || ymd > latest) return ymd;
    return latest;
  }, rental.contractEndYmd);
}

function pushExpiringItem(
  items: HireDetailsExpiringSoonItem[],
  item: Omit<HireDetailsExpiringSoonItem, "statusLabel" | "statusTone"> & {
    contractEndYmd: string | null;
  },
) {
  if (!item.expiryYmd || !item.expiryLabel || item.expiryLabel === "—") return;
  if (!isExpiringSoonOrDuringHire(item.expiryYmd, item.contractEndYmd)) return;
  const daysUntil = daysFromTodayToExpiry(item.expiryYmd);
  const duringHire = expiresDuringHire(item.expiryYmd, item.contractEndYmd);
  const expired = daysUntil !== null && daysUntil < 0;
  const hireAgreement = item.kind === "hire_agreement";
  let statusLabel = "Monitor";
  if (expired) {
    statusLabel = hireAgreement ? "Hire agreement expired" : "Expired";
  } else if (daysUntil !== null && daysUntil <= LICENCE_EXPIRING_SOON_MAX_DAYS) {
    statusLabel = hireAgreement ? "Hire agreement ending soon" : "Expiring soon";
  } else if (duringHire) {
    statusLabel = hireAgreement ? "Hire agreement ends during hire" : "Expires during hire";
  }
  items.push({
    id: item.id,
    kind: item.kind,
    label: item.label,
    expiryLabel: item.expiryLabel,
    expiryYmd: item.expiryYmd,
    statusLabel,
    statusTone: expired ? "danger" : "warn",
    viewUrl: item.viewUrl,
  });
}

/** Extra compliance items (not already shown as the three tiles). */
export function buildHireDetailsExpiringSoonItems(
  data: Pick<HireDetailsPayload, "vehicle" | "rental" | "hireStatus">,
): HireDetailsExpiringSoonItem[] {
  const latestEndYmd = latestHireEndYmd(data.rental);
  const items: HireDetailsExpiringSoonItem[] = [];

  pushExpiringItem(items, {
    id: "vehicle-mot",
    kind: "vehicle_document",
    label: "MOT certificate",
    expiryLabel: data.vehicle.motExpiryLabel,
    expiryYmd: data.vehicle.motExpiryYmd ?? "",
    viewUrl: null,
    contractEndYmd: latestEndYmd,
  });
  pushExpiringItem(items, {
    id: "vehicle-tax",
    kind: "vehicle_document",
    label: "Vehicle tax",
    expiryLabel: data.vehicle.taxExpiryLabel,
    expiryYmd: data.vehicle.taxExpiryYmd ?? "",
    viewUrl: null,
    contractEndYmd: latestEndYmd,
  });
  pushExpiringItem(items, {
    id: "vehicle-phv",
    kind: "vehicle_document",
    label: "PHV vehicle licence",
    expiryLabel: data.vehicle.phvExpiryLabel,
    expiryYmd: data.vehicle.phvExpiryYmd ?? "",
    viewUrl: null,
    contractEndYmd: latestEndYmd,
  });

  if (!hireDetailsIsEnded(data.hireStatus)) {
    for (const agreement of data.rental.agreements) {
      const ymd = agreement.endDateYmd;
      if (!ymd) continue;
      if (latestEndYmd && ymd >= latestEndYmd) continue;
      pushExpiringItem(items, {
        id: `agreement-${agreement.id}`,
        kind: "hire_agreement",
        label: /hire agreement/i.test(agreement.label)
          ? agreement.label
          : `${agreement.label} hire agreement`,
        expiryLabel: agreement.endDateLabel,
        expiryYmd: ymd,
        viewUrl: agreement.pdfUrl,
        contractEndYmd: latestEndYmd,
      });
    }
  }

  return items.sort((a, b) => a.expiryYmd.localeCompare(b.expiryYmd));
}

export function formatHireDetailsVehicleSubtitle(vehicle: HireDetailsVehicleCard): string {
  const parts = [
    [vehicle.make, vehicle.model].filter(Boolean).join(" "),
    vehicle.colour,
    vehicle.fuelType,
  ].filter(Boolean);
  return parts.join(" · ");
}
