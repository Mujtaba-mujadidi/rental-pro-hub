"use client";

import {
  formatContractVersionStatus,
  type RentalContractVersionMeta,
} from "@/lib/companies/contract-version-display";
import { formatUkDateTime } from "@/lib/datetime/uk";
import { rentalContractCopy } from "@/lib/rental-contract-copy";
import { RentalContractVersionPdfActions } from "./rental-contract-version-pdf-actions";

function signedLabel(version: RentalContractVersionMeta): string | null {
  const raw = version.signedByCustomerAt ?? version.signedAt;
  return raw ? formatUkDateTime(raw) : null;
}

export function RentalPreviousAgreementsTable({ versions }: { versions: RentalContractVersionMeta[] }) {
  if (versions.length === 0) {
    return (
      <p className="rounded-xl border border-rph-border bg-rph-raised px-4 py-6 text-sm text-rph-fg-muted">
        {rentalContractCopy.platformAgreementPreviousEmpty}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-rph-border">
      <table className="min-w-full text-sm">
        <thead className="bg-rph-chrome text-left text-xs uppercase tracking-wide text-rph-fg-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Version</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Signed</th>
            <th className="px-4 py-3 font-medium">Superseded</th>
            <th className="px-4 py-3 font-medium">Reason</th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => {
            const signed = signedLabel(version);
            const superseded = version.supersededAt ? formatUkDateTime(version.supersededAt) : "—";
            return (
              <tr key={version.id} className="border-t border-rph-border bg-rph-raised">
                <td className="px-4 py-3 font-medium text-rph-fg">v{version.versionNumber}</td>
                <td className="px-4 py-3 text-rph-fg-secondary">
                  {formatContractVersionStatus(version.versionStatus)}
                </td>
                <td className="px-4 py-3 text-rph-fg-secondary">{signed ?? "—"}</td>
                <td className="px-4 py-3 text-rph-fg-secondary">{superseded}</td>
                <td className="max-w-xs px-4 py-3 text-rph-fg-secondary">
                  {version.changeReason?.trim() || "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    <RentalContractVersionPdfActions
                      versionId={version.id}
                      versionNumber={version.versionNumber}
                      hasPdf={version.hasPdf}
                      compact
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
