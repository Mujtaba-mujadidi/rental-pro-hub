import { daysFromTodayToExpiry, formatUkDate, ukTodayYmd } from "@/lib/datetime/uk";
import { formatGbp } from "@/lib/fleet/maintenance";
import type { HireSummaryActionItem } from "@/lib/fleet/hire-summary-action-items";
import type { RentCadence } from "@/lib/fleet/hire-types";

export type DriverDashboardKpiTone = "warn" | "ok" | "info" | "neutral";

export type DriverDashboardActiveHire = {
  hireGroupId: string;
  status: string;
  statusLabel: string;
  vehicleVrm: string;
  vehicleMakeModel: string;
  companyName: string;
  startedLabel: string;
  vrmInitials: string;
  fullySigned: boolean;
  href: string;
};

export type DriverDashboardKpi = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: DriverDashboardKpiTone;
  href: string | null;
};

export type DriverDashboardNextStep = {
  id: string;
  title: string;
  detail: string;
  href: string;
  icon: HireSummaryActionItem["icon"];
  iconCount?: number;
};

export type DriverDashboardLicenceRow = {
  id: string;
  label: string;
  detail: string;
  tone: "ok" | "warn" | "danger";
};

export type DriverDashboardUpdateItem = {
  id: string;
  title: string;
  detail: string;
  href: string | null;
  tone: "ok" | "info" | "warn" | "neutral";
};

export type DriverDashboardPayload = {
  greetingName: string;
  todayLabel: string;
  activeHire: DriverDashboardActiveHire | null;
  kpis: DriverDashboardKpi[];
  nextSteps: DriverDashboardNextStep[];
  licences: DriverDashboardLicenceRow[];
  updates: DriverDashboardUpdateItem[];
  documentsHref: string;
  notificationsHref: string;
};

/** First given name for greeting — falls back to "there". */
export function driverGreetingFirstName(displayName: string | null | undefined): string {
  const raw = (displayName ?? "").trim();
  if (!raw) return "there";
  const first = raw.split(/\s+/)[0] ?? "";
  if (!first || first.includes("@")) return "there";
  return first;
}

/** VRM chip initials (first two alphanumeric characters). */
export function driverHireVrmInitials(vrm: string): string {
  const chars = vrm.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return chars.slice(0, 2) || "—";
}

/** Compact amount-due subtext: `£100 deposit + £10 rent`. */
export function formatDriverAmountDueDetail(input: {
  depositOutstandingGbp: number;
  rentOutstandingGbp: number;
}): string {
  const deposit = input.depositOutstandingGbp > 0.005 ? formatGbp(input.depositOutstandingGbp) : null;
  const rent = input.rentOutstandingGbp > 0.005 ? formatGbp(input.rentOutstandingGbp) : null;
  if (deposit && rent) return `${deposit} deposit + ${rent} rent`;
  if (deposit) return `${deposit} deposit`;
  if (rent) return `${rent} rent outstanding`;
  return "Nothing outstanding";
}

/** Relative due label for next rent: `Due tomorrow · daily`. */
export function formatDriverNextRentDetail(input: {
  periodStartYmd: string | null;
  cadence: RentCadence | string | null;
  todayYmd?: string;
}): string {
  const today = input.todayYmd ?? ukTodayYmd();
  const cadenceRaw = (input.cadence ?? "").trim().toLowerCase();
  const cadenceLabel =
    cadenceRaw === "daily" || cadenceRaw === "weekly" || cadenceRaw === "monthly" ? cadenceRaw : null;

  let when = "Scheduled";
  const startDay =
    input.periodStartYmd && /^\d{4}-\d{2}-\d{2}/.test(input.periodStartYmd.trim())
      ? input.periodStartYmd.trim().slice(0, 10)
      : null;
  if (startDay) {
    const daysUntil = calendarDaysBetween(today, startDay);
    if (daysUntil === 0) when = "Due today";
    else if (daysUntil === 1) when = "Due tomorrow";
    else if (daysUntil > 1) when = `Due ${formatUkDate(startDay)}`;
    else when = "Overdue";
  }

  return cadenceLabel ? `${when} · ${cadenceLabel}` : when;
}

/** Whole calendar days from `fromYmd` to `toYmd` (UTC date parts). */
function calendarDaysBetween(fromYmd: string, toYmd: string): number {
  const from = Date.UTC(
    Number(fromYmd.slice(0, 4)),
    Number(fromYmd.slice(5, 7)) - 1,
    Number(fromYmd.slice(8, 10)),
  );
  const to = Date.UTC(
    Number(toYmd.slice(0, 4)),
    Number(toYmd.slice(5, 7)) - 1,
    Number(toYmd.slice(8, 10)),
  );
  return Math.round((to - from) / 86_400_000);
}

export function buildDriverLicenceStatusRows(input: {
  drivingLicenceExpiryYmd: string | null;
  phvLicenceExpiryYmd: string | null;
}): DriverDashboardLicenceRow[] {
  return [
    licenceRow("driving", "Driving licence", input.drivingLicenceExpiryYmd),
    licenceRow("phv", "PHV / taxi licence", input.phvLicenceExpiryYmd),
  ];
}

function licenceRow(
  id: string,
  label: string,
  expiryYmd: string | null,
): DriverDashboardLicenceRow {
  if (!expiryYmd) {
    return { id, label, detail: "Expiry not recorded", tone: "warn" };
  }
  const days = daysFromTodayToExpiry(expiryYmd);
  const until = formatUkDate(expiryYmd);
  if (days === null) {
    return { id, label, detail: `Expires ${until}`, tone: "warn" };
  }
  if (days < 0) {
    return { id, label, detail: `Expired ${until}`, tone: "danger" };
  }
  if (days <= 30) {
    return { id, label, detail: `Expires soon · ${until}`, tone: "warn" };
  }
  return { id, label, detail: `Current until ${until}`, tone: "ok" };
}

export function earliestLicenceExpiryYmd(input: {
  drivingLicenceExpiryYmd: string | null;
  phvLicenceExpiryYmd: string | null;
}): string | null {
  const dates = [input.drivingLicenceExpiryYmd, input.phvLicenceExpiryYmd]
    .map((v) => v?.trim().slice(0, 10) ?? "")
    .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))
    .sort();
  return dates[0] ?? null;
}

/** Overall licence KPI value/detail from the two licence rows. */
export function summariseDriverLicenceKpi(
  rows: readonly DriverDashboardLicenceRow[],
  earliestExpiryYmd: string | null = null,
): {
  value: string;
  detail: string;
  tone: DriverDashboardKpiTone;
} {
  if (rows.some((r) => r.tone === "danger")) {
    return { value: "Action needed", detail: "A licence has expired", tone: "warn" };
  }
  if (rows.some((r) => r.tone === "warn")) {
    return { value: "Review soon", detail: "A licence needs attention", tone: "warn" };
  }
  return {
    value: "Current",
    detail: earliestExpiryYmd ? `Next expiry ${formatUkDate(earliestExpiryYmd)}` : "Licences on file",
    tone: "ok",
  };
}

export function mapDriverDashboardNextSteps(
  items: readonly HireSummaryActionItem[],
  currentlyDueGbp: number,
  paymentsHref: string,
): DriverDashboardNextStep[] {
  const steps: DriverDashboardNextStep[] = items.map((item) => ({
    id: item.key,
    title: refineNextStepTitle(item),
    detail: refineNextStepDetail(item),
    href: item.href,
    icon: item.icon,
    iconCount: item.iconCount,
  }));

  const hasDueStep = steps.some(
    (s) =>
      s.id.includes("payment") ||
      s.title.toLowerCase().includes("due") ||
      s.title.toLowerCase().includes("deposit"),
  );
  if (currentlyDueGbp > 0.005 && !hasDueStep) {
    steps.push({
      id: "payment:currently-due",
      title: `${formatGbp(currentlyDueGbp)} is due now`,
      detail: "View the payment breakdown before paying",
      href: paymentsHref,
      icon: "pound",
    });
  } else if (currentlyDueGbp > 0.005) {
    // Prefer the mock wording when a generic deposit/due item already exists.
    const idx = steps.findIndex(
      (s) => s.icon === "pound" && (s.title.toLowerCase().includes("deposit") || s.title.toLowerCase().includes("due")),
    );
    if (idx >= 0) {
      const existing = steps[idx]!;
      steps[idx] = {
        ...existing,
        title: `${formatGbp(currentlyDueGbp)} is due now`,
        detail: "View the payment breakdown before paying",
      };
    }
  }

  return steps;
}

function refineNextStepTitle(item: HireSummaryActionItem): string {
  if (item.icon === "insurance" || item.key.includes("insurance")) {
    return "Upload your insurance document";
  }
  return item.title;
}

function refineNextStepDetail(item: HireSummaryActionItem): string {
  if (item.icon === "insurance" || item.key.includes("insurance")) {
    return "Required for your active hire";
  }
  return item.detail;
}

export function mapDriverDashboardUpdates(
  items: readonly {
    id: string;
    title: string;
    body: string;
    href: string | null;
    createdAt: string;
  }[],
): DriverDashboardUpdateItem[] {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    detail: compactUpdateDetail(item.body, item.createdAt),
    href: item.href,
    tone: updateTone(item.title),
  }));
}

function compactUpdateDetail(body: string, createdAt: string): string {
  const datePart = formatUkDate(createdAt, "");
  // Prefer a short body; strip leading "Your " for denser cards.
  let text = body.trim();
  if (text.toLowerCase().startsWith("your ")) text = text.slice(5);
  // Truncate long bodies.
  if (text.length > 72) text = `${text.slice(0, 69).trimEnd()}…`;
  if (datePart) {
    // Use short month day for the tail when body already has context.
    const short = formatUpdateDay(createdAt);
    return short ? `${text} · ${short}` : text;
  }
  return text;
}

function formatUpdateDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  });
}

function updateTone(title: string): DriverDashboardUpdateItem["tone"] {
  const t = title.toLowerCase();
  if (t.includes("approved") || t.includes("signed") || t.includes("complete")) return "ok";
  if (t.includes("rejected") || t.includes("expired") || t.includes("overdue")) return "warn";
  if (t.includes("hire") || t.includes("payment") || t.includes("submitted")) return "info";
  return "neutral";
}

export function formatDriverDashboardTodayLabel(now = new Date()): string {
  return now
    .toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/London",
    })
    .toUpperCase();
}

export function formatDriverHireStartedLabel(activatedAtOrStartYmd: string | null): string {
  if (!activatedAtOrStartYmd) return "Start date not set";
  // Prefer long prose for the hero subtitle to match the design reference.
  const raw = activatedAtOrStartYmd.trim();
  const ymd = /^\d{4}-\d{2}-\d{2}/.test(raw) && !raw.includes("T") ? raw.slice(0, 10) : null;
  if (ymd) {
    const [y, m, d] = ymd.split("-").map(Number);
    const date = new Date(Date.UTC(y!, m! - 1, d!));
    return `Started ${date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })}`;
  }
  const instant = new Date(raw);
  if (Number.isNaN(instant.getTime())) return `Started ${formatUkDate(raw)}`;
  return `Started ${instant.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  })}`;
}

export function buildDriverDashboardPayload(input: {
  displayName: string | null;
  drivingLicenceExpiryYmd: string | null;
  phvLicenceExpiryYmd: string | null;
  unreadNotifications: number;
  activeHire: {
    hireGroupId: string;
    status: string;
    statusLabel: string;
    vehicleVrm: string;
    vehicleMakeModel: string;
    companyName: string;
    startedAtOrYmd: string | null;
    fullySigned: boolean;
    rentCadence: string | null;
  } | null;
  currentlyDueGbp: number;
  depositOutstandingGbp: number;
  rentOutstandingGbp: number;
  nextDueAmountGbp: number | null;
  nextDuePeriodStartYmd: string | null;
  actionItems: readonly HireSummaryActionItem[];
  recentNotifications: readonly {
    id: string;
    title: string;
    body: string;
    href: string | null;
    createdAt: string;
  }[];
  now?: Date;
}): DriverDashboardPayload {
  const licences = buildDriverLicenceStatusRows({
    drivingLicenceExpiryYmd: input.drivingLicenceExpiryYmd,
    phvLicenceExpiryYmd: input.phvLicenceExpiryYmd,
  });
  const licenceKpi = summariseDriverLicenceKpi(
    licences,
    earliestLicenceExpiryYmd({
      drivingLicenceExpiryYmd: input.drivingLicenceExpiryYmd,
      phvLicenceExpiryYmd: input.phvLicenceExpiryYmd,
    }),
  );

  const hireHref = input.activeHire ? `/driver/hires/${input.activeHire.hireGroupId}` : null;
  const paymentsHref = input.activeHire ? `${hireHref}/payments` : "/driver/my-hire";

  const amountDue = input.currentlyDueGbp;
  const amountTone: DriverDashboardKpiTone = amountDue > 0.005 ? "warn" : "ok";

  const nextRentValue =
    input.nextDueAmountGbp != null && input.nextDueAmountGbp > 0.005
      ? formatGbp(input.nextDueAmountGbp)
      : "—";
  const nextRentDetail = input.activeHire
    ? formatDriverNextRentDetail({
        periodStartYmd: input.nextDuePeriodStartYmd,
        cadence: input.activeHire.rentCadence,
      })
    : "No active hire";

  const unread = Math.max(0, input.unreadNotifications);

  const kpis: DriverDashboardKpi[] = [
    {
      id: "amount-due",
      label: "Amount due now",
      value: formatGbp(amountDue),
      detail: input.activeHire
        ? formatDriverAmountDueDetail({
            depositOutstandingGbp: input.depositOutstandingGbp,
            rentOutstandingGbp: input.rentOutstandingGbp,
          })
        : "No active hire",
      tone: input.activeHire ? amountTone : "neutral",
      href: input.activeHire ? paymentsHref : "/driver/hire-requests",
    },
    {
      id: "next-rent",
      label: "Next rent payment",
      value: nextRentValue,
      detail: nextRentDetail,
      tone: "info",
      href: input.activeHire ? paymentsHref : null,
    },
    {
      id: "licence",
      label: "Licence status",
      value: licenceKpi.value,
      detail: licenceKpi.detail,
      tone: licenceKpi.tone,
      href: "/driver/onboarding",
    },
    {
      id: "updates",
      label: "Unread updates",
      value: String(unread),
      detail: unread === 0 ? "You're up to date" : "Payment and hire notifications",
      tone: unread > 0 ? "neutral" : "ok",
      href: "/driver/notifications",
    },
  ];

  const activeHire: DriverDashboardActiveHire | null = input.activeHire
    ? {
        hireGroupId: input.activeHire.hireGroupId,
        status: input.activeHire.status,
        statusLabel: input.activeHire.statusLabel,
        vehicleVrm: input.activeHire.vehicleVrm,
        vehicleMakeModel: input.activeHire.vehicleMakeModel,
        companyName: input.activeHire.companyName,
        startedLabel: formatDriverHireStartedLabel(input.activeHire.startedAtOrYmd),
        vrmInitials: driverHireVrmInitials(input.activeHire.vehicleVrm),
        fullySigned: input.activeHire.fullySigned,
        href: hireHref!,
      }
    : null;

  return {
    greetingName: driverGreetingFirstName(input.displayName),
    todayLabel: formatDriverDashboardTodayLabel(input.now),
    activeHire,
    kpis,
    nextSteps: mapDriverDashboardNextSteps(input.actionItems, amountDue, paymentsHref),
    licences,
    updates: mapDriverDashboardUpdates(input.recentNotifications),
    documentsHref: "/driver/onboarding",
    notificationsHref: "/driver/notifications",
  };
}
