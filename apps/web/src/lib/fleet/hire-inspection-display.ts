import { formatUkDateText } from "@/lib/datetime/uk";

/** Inspection stamp: `10 Aug 2026 · 01:23` */
export function formatHireInspectionStamp(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}:\d{2})/);
    if (!match) return value;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day = Number.parseInt(match[1]!, 10);
    const month = months[Number.parseInt(match[2]!, 10) - 1] ?? match[2];
    return `${day} ${month} ${match[3]} · ${match[4]}`;
  }
  const date = new Date(parsed);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = date.getDate();
  const month = months[date.getMonth()] ?? "";
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} · ${hours}:${minutes}`;
}

export function formatHireInspectionTimeOnly(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    const match = value.match(/(\d{2}:\d{2})/);
    return match?.[1] ?? "—";
  }
  const date = new Date(parsed);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatHireInspectionDateOnly(value: string | null | undefined): string {
  if (!value) return "—";
  return formatUkDateText(value);
}

export function formatHireInspectionOdometer(miles: number | null | undefined): string {
  if (miles == null || !Number.isFinite(miles)) return "—";
  return `${Math.round(miles).toLocaleString("en-GB")} mi`;
}

export function summarizeInspectionKit(
  accessories: Record<string, boolean | null>,
  keys: readonly string[],
): string {
  let present = 0;
  let notPresent = 0;
  let notRecorded = 0;
  for (const key of keys) {
    const value = accessories[key];
    if (value === true) present += 1;
    else if (value === false) notPresent += 1;
    else notRecorded += 1;
  }
  const parts: string[] = [];
  if (present > 0) parts.push(`${present} present`);
  if (notPresent > 0) parts.push(`${notPresent} not present`);
  if (!parts.length) return notRecorded > 0 ? "Not recorded" : "None recorded";
  return parts.join(" · ");
}
