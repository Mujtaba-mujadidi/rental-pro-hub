"use client";

import {
  archiveCompanyHireTermsVersionAction,
  listCompanyHireTermsAction,
  publishCompanyHireTermsVersionAction,
  republishArchivedCompanyHireTermsVersionAction,
  saveCompanyHireTermsDraftAction,
} from "@/app/actions/rental-hire-terms";
import { TermsVersionsClient } from "@/components/contract-terms/terms-versions-client";
import type { TermsVersionRow } from "@/lib/contract-terms/types";
import { useEffect, useState, useTransition } from "react";

const HIRE_TERMS_CONFIG = {
  scopeLabel: "Your rental company",
  scopeDescription: "Driver hire agreements",
  modalDescription: "Add or update terms included in driver hire contracts sent for e-signature.",
  publishAfterSaveHelp:
    "Makes this the active published version for new hire agreements (any current published version is archived).",
  draftKeyPrefix: "hire-terms",
  searchPlaceholder: "Search hire terms",
  entityName: "hire terms",
  createButtonLabel: "New hire terms",
  modalEditTitle: "Edit hire terms",
  modalCreateTitle: "Create hire terms",
  contentSectionLabel: "Hire terms content",
} as const;

const hireTermsActions = {
  saveDraft: saveCompanyHireTermsDraftAction,
  publish: publishCompanyHireTermsVersionAction,
  archive: archiveCompanyHireTermsVersionAction,
  republishArchived: republishArchivedCompanyHireTermsVersionAction,
};

export function HireTermsSettingsSection() {
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<TermsVersionRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    startTransition(async () => {
      const res = await listCompanyHireTermsAction();
      if (!res.ok) {
        setError(res.error);
        setLoaded(true);
        return;
      }
      setRows(res.rows);
      setCanManage(res.canManage);
      setLoaded(true);
      setError(null);
    });
  }

  useEffect(() => {
    reload();
  }, []);

  if (!loaded && pending) {
    return <p className="rph-muted text-sm">Loading hire terms…</p>;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Hire terms &amp; conditions</h2>
        <p className="rph-meta mt-1">
          Published terms are snapshotted into each new hire contract. Same workflow as platform master terms: draft,
          publish, archive.
        </p>
      </div>
      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
      <TermsVersionsClient
        initialRows={rows}
        actions={hireTermsActions}
        config={HIRE_TERMS_CONFIG}
        canManage={canManage}
        onDataChange={reload}
      />
    </section>
  );
}
