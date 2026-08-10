import { formatUkCalendarDateTimeText, formatUkDateTimeText } from "@/lib/datetime/uk";
import { formatHireRentAmountGbp } from "@/lib/fleet/hire-access-display";
import { hireContractEndYmd } from "@/lib/fleet/hire-income";
import {
  HIRE_PDF_DEFAULT_END_TIME,
  HIRE_PDF_DEFAULT_START_TIME,
  normalizeHireTime,
} from "@/lib/fleet/hire-pdf-details";

export type HireWorkspaceHeroMetrics = {
  activeSinceLabel: string;
  contractEndLabel: string | null;
  dailyRentLabel: string | null;
};

export function buildHireWorkspaceHeroMetrics(input: {
  startDate: string;
  startTime?: string | null;
  endTime?: string | null;
  activatedAt?: string | null;
  terminatedAt?: string | null;
  endedAt?: string | null;
  status?: string | null;
  rentAmountGbp?: number | null;
  agreementEndDates?: (string | null | undefined)[];
}): HireWorkspaceHeroMetrics {
  const activatedAt = input.activatedAt?.trim() || null;
  const activeSinceLabel = activatedAt
    ? formatUkDateTimeText(activatedAt)
    : formatUkCalendarDateTimeText(
        input.startDate,
        normalizeHireTime(input.startTime, HIRE_PDF_DEFAULT_START_TIME),
      );

  const contractEndedYmd = hireContractEndYmd({
    status: String(input.status ?? ""),
    terminatedAt: input.terminatedAt ?? null,
    endedAt: input.endedAt ?? null,
  });
  const maxAgreementEndDate =
    (input.agreementEndDates ?? [])
      .filter((d): d is string => Boolean(d?.trim()))
      .sort()
      .at(-1) ?? null;

  let contractEndLabel: string | null = null;
  if (contractEndedYmd) {
    const endedInstant = input.terminatedAt?.trim() || input.endedAt?.trim() || null;
    contractEndLabel = endedInstant ? formatUkDateTimeText(endedInstant) : null;
  } else if (maxAgreementEndDate) {
    contractEndLabel = formatUkCalendarDateTimeText(
      maxAgreementEndDate,
      normalizeHireTime(input.endTime, HIRE_PDF_DEFAULT_END_TIME),
    );
  }

  return {
    activeSinceLabel,
    contractEndLabel,
    dailyRentLabel: formatHireRentAmountGbp(input.rentAmountGbp),
  };
}
