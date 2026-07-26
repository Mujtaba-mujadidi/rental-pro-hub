"use client";

import { useState } from "react";
import type { RentalContractVersionMeta } from "@/lib/companies/contract-version-display";
import { rentalContractCopy } from "@/lib/rental-contract-copy";
import { RentalPreviousAgreementsTable } from "./rental-previous-agreements-table";

type TabId = "active" | "previous";

export function RentalPlatformAgreementTabs({
  activePanel,
  previousVersions,
}: {
  activePanel: React.ReactNode;
  previousVersions: RentalContractVersionMeta[];
}) {
  const [tab, setTab] = useState<TabId>("active");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={tab === "active" ? "rph-pill-active" : "rph-pill"}
          onClick={() => setTab("active")}
        >
          {rentalContractCopy.platformAgreementTabActive}
        </button>
        <button
          type="button"
          className={tab === "previous" ? "rph-pill-active" : "rph-pill"}
          onClick={() => setTab("previous")}
        >
          {rentalContractCopy.platformAgreementTabPrevious}
          {previousVersions.length > 0 ? (
            <span className="ml-1.5 rounded-full bg-rph-chrome px-1.5 py-0.5 text-[10px] font-semibold text-rph-fg-muted">
              {previousVersions.length}
            </span>
          ) : null}
        </button>
      </div>

      {tab === "active" ? activePanel : null}

      {tab === "previous" ? (
        <div className="space-y-4">
          <p className="rph-muted max-w-2xl text-sm">{rentalContractCopy.platformAgreementPreviousLead}</p>
          <RentalPreviousAgreementsTable versions={previousVersions} />
        </div>
      ) : null}
    </div>
  );
}
