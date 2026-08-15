export type SubcompanyPortfolioCardTone = "primary" | "attention" | "ok";

export type SubcompanyPortfolioCard = {
  id: string;
  name: string;
  initials: string;
  isPrimary: boolean;
  badgeLabel: string;
  tone: SubcompanyPortfolioCardTone;
  detail: string;
  vehicleCount: number;
  activeHireCount: number;
  attentionCount: number;
  href: string;
};

export type SubcompanyPortfolioSummary = {
  companyCount: number;
  fleetVehicleCount: number;
  activeHireCount: number;
  needsAttentionCount: number;
};

export type SubcompanyPortfolioPayload = {
  summary: SubcompanyPortfolioSummary;
  cards: SubcompanyPortfolioCard[];
};

/** Two-letter initials from a trading name (e.g. "Oxus Cars Ltd" → "OC"). */
export function subcompanyInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function subcompanyPortfolioCardDetail(input: {
  isPrimary: boolean;
  vehicleCount: number;
  attentionCount: number;
}): string {
  if (input.isPrimary) {
    if (input.attentionCount > 0) {
      const n = input.attentionCount;
      return `Primary account and billing entity · ${n} need${n === 1 ? "s" : ""} attention`;
    }
    return "Primary account and billing entity";
  }
  const vehicleLabel =
    input.vehicleCount === 1 ? "1 fleet vehicle" : `${input.vehicleCount} fleet vehicles`;
  if (input.attentionCount > 0) {
    const n = input.attentionCount;
    return `${vehicleLabel} · ${n} need${n === 1 ? "s" : ""} attention`;
  }
  return `${vehicleLabel} · all documents current`;
}

export function subcompanyPortfolioCardTone(input: {
  isPrimary: boolean;
  attentionCount: number;
}): SubcompanyPortfolioCardTone {
  if (input.isPrimary) return "primary";
  return input.attentionCount > 0 ? "attention" : "ok";
}

export function buildSubcompanyPortfolioPayload(
  rows: readonly {
    id: string;
    name: string;
    isPrimary: boolean;
    vehicleCount: number;
    activeHireCount: number;
    attentionCount: number;
  }[],
): SubcompanyPortfolioPayload {
  const cards: SubcompanyPortfolioCard[] = [...rows]
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.name.localeCompare(b.name, "en-GB");
    })
    .map((row) => {
      const tone = subcompanyPortfolioCardTone(row);
      return {
        id: row.id,
        name: row.name,
        initials: subcompanyInitials(row.name),
        isPrimary: row.isPrimary,
        badgeLabel: row.isPrimary ? "Main company" : "Subcompany",
        tone,
        detail: subcompanyPortfolioCardDetail(row),
        vehicleCount: row.vehicleCount,
        activeHireCount: row.activeHireCount,
        attentionCount: row.attentionCount,
        href: `/rental/subcompany/${row.id}`,
      };
    });

  return {
    summary: {
      companyCount: cards.length,
      fleetVehicleCount: cards.reduce((sum, c) => sum + c.vehicleCount, 0),
      activeHireCount: cards.reduce((sum, c) => sum + c.activeHireCount, 0),
      needsAttentionCount: cards.reduce((sum, c) => sum + c.attentionCount, 0),
    },
    cards,
  };
}
