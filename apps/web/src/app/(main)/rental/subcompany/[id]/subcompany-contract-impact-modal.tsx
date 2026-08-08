"use client";

import { useCallback, useState, useTransition } from "react";
import {
  loadAffectedHireDocumentsForImpactAction,
  recordSubcompanyContractImpactAnswerAction,
} from "@/app/actions/rental-subcompany-workspace";
import {
  affectedHireDocumentKey,
  type AffectedHireDocument,
} from "@/lib/rental/subcompany-hire-document-impact";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { FormModalStepProgress } from "@/components/forms/form-modal-step-progress";
import type { SubcompanyFieldChange } from "@/lib/rental/subcompany-contract-impact";
import { SUBCOMPANY_DOCUMENT_KIND_LABELS } from "@/lib/rental/subcompany-workspace-types";

const STEP_LABELS = ["Impact", "Documents"] as const;

const btnPrimary =
  "flex h-11 min-w-[7rem] items-center justify-center rounded-lg bg-rph-rail px-4 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50";
const btnGhost =
  "flex h-11 shrink-0 items-center justify-center rounded-lg border border-rph-border bg-rph-raised px-4 text-sm font-medium text-rph-fg-secondary hover:bg-rph-chrome disabled:opacity-50";

function docKey(doc: AffectedHireDocument) {
  return affectedHireDocumentKey(doc);
}

/**
 * Asked after a subcompany detail or logo change: do live hire contracts need
 * re-issuing, and if so which ones.
 */
export function SubcompanyContractImpactModal({
  open,
  subcompanyId,
  changedFields,
  onDone,
}: {
  open: boolean;
  subcompanyId: string;
  changedFields: SubcompanyFieldChange[];
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const [documents, setDocuments] = useState<AffectedHireDocument[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dismissConfirmOpen, setDismissConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const reset = useCallback(() => {
    setStep(0);
    setDocuments([]);
    setSelected([]);
    setError(null);
    setDismissConfirmOpen(false);
  }, []);

  const finish = useCallback(() => {
    reset();
    onDone();
  }, [reset, onDone]);

  const record = useCallback(
    (contractsNeedUpdate: boolean, docs: AffectedHireDocument[]) => {
      startTransition(async () => {
        const res = await recordSubcompanyContractImpactAnswerAction({
          subcompanyId,
          contractsNeedUpdate,
          changedFields,
          selectedDocuments: docs,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        finish();
      });
    },
    [subcompanyId, changedFields, finish],
  );

  const goToDocuments = useCallback(() => {
    startTransition(async () => {
      const res = await loadAffectedHireDocumentsForImpactAction(subcompanyId, changedFields);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDocuments(res.documents);
      setSelected(res.documents.map(docKey));
      setError(null);
      setStep(1);
    });
  }, [subcompanyId, changedFields]);

  function toggle(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  const selectedDocs = documents.filter((d) => selected.includes(docKey(d)));

  return (
    <>
      <FormModalShell
        open={open}
        titleId="subcompany-contract-impact-title"
        title="Contract impact"
        description="These details appear on driver-facing hire documents."
        headerExtra={<FormModalStepProgress step={step} labels={STEP_LABELS} ariaLabel="Contract impact steps" />}
        maxWidthClass="max-w-2xl"
        pending={pending}
        showDraftActions={false}
        onRequestClose={() => setDismissConfirmOpen(true)}
        // Shell's built-in discard confirm talks about drafts; this flow uses its own copy below.
        discardConfirmOpen={false}
        onConfirmDiscard={finish}
        onCancelDiscard={() => setDismissConfirmOpen(false)}
        footer={
          step === 0 ? (
            <>
              <button
                type="button"
                className={btnGhost}
                disabled={pending}
                onClick={() => setDismissConfirmOpen(true)}
              >
                Decide later
              </button>
              <div className="flex flex-wrap gap-3">
                <button type="button" className={btnGhost} disabled={pending} onClick={() => record(false, [])}>
                  No changes needed
                </button>
                <button type="button" className={btnPrimary} disabled={pending} onClick={goToDocuments}>
                  Yes, choose documents
                </button>
              </div>
            </>
          ) : (
            <>
              <button type="button" className={btnGhost} disabled={pending} onClick={() => setStep(0)}>
                Back
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={pending || (documents.length > 0 && !selectedDocs.length)}
                onClick={() => record(true, selectedDocs)}
              >
                {pending ? "Saving…" : "Flag for update"}
              </button>
            </>
          )
        }
      >
        {error ? <p className="rph-alert-error mb-4 text-sm">{error}</p> : null}

        {step === 0 ? (
          <div className="space-y-4">
            <div className="rph-card p-3">
              <p className="rph-meta font-semibold uppercase tracking-wide">What changed</p>
              {changedFields.length ? (
                <ul className="mt-2 space-y-1 text-sm text-rph-fg-secondary">
                  {changedFields.map((change) => (
                    <li key={change.field}>
                      <span className="font-medium text-rph-fg">{change.label}</span>
                      {": "}
                      {change.from ?? "—"} → {change.to ?? "—"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rph-muted mt-2 text-sm">No field detail recorded.</p>
              )}
            </div>
            <p className="text-sm text-rph-fg">
              Do any rental-related contracts need to be changed?
            </p>
            <p className="rph-muted text-sm">
              Choosing yes flags the selected hire documents so they can be re-issued or re-signed. Only active,
              on-rent hires with issued PDFs are listed — ended contracts are excluded. Nothing is sent to drivers now.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-rph-fg">Select the hire documents that must be updated.</p>
            {!documents.length ? (
              <p className="rph-muted text-sm">No live hire documents use this subcompany.</p>
            ) : (
              <ul className="space-y-2">
                {documents.map((doc) => {
                  const key = docKey(doc);
                  return (
                    <li key={key} className="rph-card p-3">
                      <label className="flex items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-rph-border text-rph-rail focus:ring-rph-rail/30"
                          checked={selected.includes(key)}
                          disabled={pending}
                          onChange={() => toggle(key)}
                        />
                        <span>
                          <span className="block font-medium text-rph-fg">{doc.label}</span>
                          <span className="rph-meta">{SUBCOMPANY_DOCUMENT_KIND_LABELS[doc.documentKind]}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </FormModalShell>

      <ConfirmDialog
        open={dismissConfirmOpen}
        title="Answer later?"
        description="Your detail changes are already saved. You can record the contract impact later from the Details page, but affected hire documents will not be flagged until you do."
        confirmLabel="Close without answering"
        cancelLabel="Keep deciding"
        variant="danger"
        pending={pending}
        onConfirm={finish}
        onCancel={() => setDismissConfirmOpen(false)}
      />
    </>
  );
}
