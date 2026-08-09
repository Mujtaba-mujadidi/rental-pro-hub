"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  completeMirroredHireCheckinForTransferAction,
  completeVehicleSubcompanyTransferAction,
  loadVehicleTransferWizardStateAction,
  type VehicleTransferWizardState,
} from "@/app/actions/vehicle-subcompany-transfer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { FormModalStepProgress } from "@/components/forms/form-modal-step-progress";
import { FormModalSelect } from "@/components/forms/form-modal-select";
import { vehicleTransferBlockedMessage } from "@/lib/fleet/vehicle-transfer-readiness";

const STEP_LABELS = ["Destination", "Close hire", "Documents", "Transfer"] as const;

const btnPrimary =
  "flex h-11 min-w-[7rem] items-center justify-center rounded-lg bg-rph-rail px-4 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50";
const btnGhost =
  "flex h-11 shrink-0 items-center justify-center rounded-lg border border-rph-border bg-rph-raised px-4 text-sm font-medium text-rph-fg-secondary hover:bg-rph-chrome disabled:opacity-50";

export function VehicleSubcompanyTransferModal({
  open,
  vehicleId,
  vehicleVrm,
  fromSubcompanyId,
  subcompanies,
  onDone,
}: {
  open: boolean;
  vehicleId: string;
  vehicleVrm: string;
  fromSubcompanyId: string;
  subcompanies: { id: string; name: string | null }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [toSubcompanyId, setToSubcompanyId] = useState("");
  const [notes, setNotes] = useState("");
  const [state, setState] = useState<VehicleTransferWizardState | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [attestation, setAttestation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dismissConfirmOpen, setDismissConfirmOpen] = useState(false);
  const [pendingMessage, setPendingMessage] = useState("Working…");
  const [pending, startTransition] = useTransition();

  const destinationOptions = useMemo(
    () =>
      subcompanies
        .filter((s) => s.id !== fromSubcompanyId)
        .map((s) => ({ value: s.id, label: s.name ?? "Untitled" })),
    [fromSubcompanyId, subcompanies],
  );

  const defaultDestinationId = destinationOptions[0]?.value ?? "";

  const resetForm = useCallback(() => {
    setStep(0);
    setToSubcompanyId(defaultDestinationId);
    setNotes("");
    setState(null);
    setSelectedKeys([]);
    setAttestation("");
    setError(null);
    setDismissConfirmOpen(false);
  }, [defaultDestinationId]);

  const finish = useCallback(() => {
    resetForm();
    onDone();
  }, [onDone, resetForm]);

  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      resetForm();
    }
    wasOpenRef.current = open;
  }, [open, resetForm]);

  const refreshState = useCallback(() => {
    if (!toSubcompanyId) return;
    setPendingMessage("Refreshing status…");
    startTransition(async () => {
      const res = await loadVehicleTransferWizardStateAction({
        vehicleId,
        toSubcompanyId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setState(res.data);
      setSelectedKeys(res.data.documentOptions.filter((o) => o.defaultSelected).map((o) => o.key));
      setError(null);
    });
  }, [toSubcompanyId, vehicleId]);

  const goDestinationNext = useCallback(() => {
    if (!toSubcompanyId) return;
    setPendingMessage("Checking transfer status…");
    startTransition(async () => {
      const res = await loadVehicleTransferWizardStateAction({
        vehicleId,
        toSubcompanyId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setState(res.data);
      setSelectedKeys(res.data.documentOptions.filter((o) => o.defaultSelected).map((o) => o.key));
      setError(null);
      setStep(res.data.canTransfer ? 2 : 1);
    });
  }, [toSubcompanyId, vehicleId]);

  const goDocumentsNext = useCallback(() => {
    if (!state?.canTransfer) {
      setError(state?.blockedMessage ?? vehicleTransferBlockedMessage(state?.hirePhase ?? "needs_end_contract"));
      return;
    }
    setStep(2);
    setError(null);
  }, [state]);

  const completeTransfer = useCallback(() => {
    if (!toSubcompanyId) return;
    setPendingMessage("Transferring vehicle…");
    startTransition(async () => {
      const res = await completeVehicleSubcompanyTransferAction({
        vehicleId,
        toSubcompanyId,
        selectedDocumentKeys: selectedKeys,
        notes,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      finish();
      if (res.data.supersessionHireGroupId) {
        router.push(`/rental/hires/${res.data.supersessionHireGroupId}`);
      }
    });
  }, [finish, notes, router, selectedKeys, toSubcompanyId, vehicleId]);

  const submitMirroredCheckin = useCallback(() => {
    if (!state?.blockingHire) return;
    setPendingMessage("Completing check-in…");
    startTransition(async () => {
      const res = await completeMirroredHireCheckinForTransferAction({
        vehicleId,
        hireGroupId: state.blockingHire!.id,
        attestation,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      refreshState();
    });
  }, [attestation, refreshState, state?.blockingHire, vehicleId]);

  const cancelIntent = useCallback(() => {
    finish();
  }, [finish]);

  function toggleKey(key: string) {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  const hireId = state?.blockingHire?.id;

  return (
    <>
      <FormModalShell
        open={open}
        titleId="vehicle-subcompany-transfer-title"
        title="Transfer vehicle"
        description={`Move ${vehicleVrm} to another subcompany. Open hires must be ended before transfer.`}
        headerExtra={<FormModalStepProgress step={step} labels={[...STEP_LABELS]} ariaLabel="Vehicle transfer steps" />}
        maxWidthClass="max-w-2xl"
        pending={pending}
        pendingMessage={pendingMessage}
        showDraftActions={false}
        onRequestClose={() => setDismissConfirmOpen(true)}
        discardConfirmOpen={false}
        onConfirmDiscard={cancelIntent}
        onCancelDiscard={() => setDismissConfirmOpen(false)}
        footer={
          step === 0 ? (
            <>
              <button type="button" className={btnGhost} disabled={pending} onClick={() => setDismissConfirmOpen(true)}>
                Cancel
              </button>
              <button type="button" className={btnPrimary} disabled={pending || !toSubcompanyId} onClick={goDestinationNext}>
                Continue
              </button>
            </>
          ) : step === 1 ? (
            <>
              <button type="button" className={btnGhost} disabled={pending} onClick={() => setStep(0)}>
                Back
              </button>
              <div className="flex flex-wrap gap-3">
                <button type="button" className={btnGhost} disabled={pending} onClick={refreshState}>
                  Refresh status
                </button>
                <button type="button" className={btnPrimary} disabled={pending || !state?.canTransfer} onClick={goDocumentsNext}>
                  Continue
                </button>
              </div>
            </>
          ) : step === 2 ? (
            <>
              <button type="button" className={btnGhost} disabled={pending} onClick={() => setStep(state?.blockingHire ? 1 : 0)}>
                Back
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={pending || !selectedKeys.length}
                onClick={() => setStep(3)}
              >
                Review transfer
              </button>
            </>
          ) : (
            <>
              <button type="button" className={btnGhost} disabled={pending} onClick={() => setStep(2)}>
                Back
              </button>
              <button type="button" className={btnPrimary} disabled={pending} onClick={completeTransfer}>
                {pending
                  ? "Transferring…"
                  : state?.blockingHire
                    ? "Transfer & create hire"
                    : "Transfer vehicle"}
              </button>
            </>
          )
        }
      >
        {error ? <p className="rph-alert-error mb-4 text-sm">{error}</p> : null}

        {step === 0 ? (
          <div className="space-y-4">
            <div>
              <label className="rph-meta mb-1 block font-semibold uppercase tracking-wide">Destination subcompany</label>
              <FormModalSelect
                value={toSubcompanyId}
                aria-label="Destination subcompany"
                options={destinationOptions}
                placeholder="Select subcompany"
                onValueChange={setToSubcompanyId}
              />
            </div>
            <div>
              <label className="rph-meta mb-1 block font-semibold uppercase tracking-wide">Notes (optional)</label>
              <input className="rph-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        ) : null}

        {step === 1 && state ? (
          <div className="space-y-4">
            {state.canTransfer ? (
              <p className="text-sm text-rph-fg">The current hire is closed. Continue to document updates.</p>
            ) : (
              <>
                <p className="rph-alert-warn text-sm">{state.blockedMessage}</p>
                {hireId ? (
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/rental/hires/${hireId}`} className="rph-link text-sm font-medium">
                      Open hire workspace
                    </Link>
                    <Link href={`/rental/hires/${hireId}/checkin`} className="rph-link text-sm font-medium">
                      Check-in
                    </Link>
                    <Link href={`/rental/hires/${hireId}/payments`} className="rph-link text-sm font-medium">
                      Payments & settlement
                    </Link>
                  </div>
                ) : null}
                {state.hirePhase === "needs_checkin" && hireId ? (
                  <div className="rph-card space-y-3 p-4">
                    <p className="text-sm font-medium text-rph-fg">Mirrored check-in (transfer only)</p>
                    <p className="rph-muted text-sm">
                      Record check-in using the original checkout condition. No new damage charges are added. Physical
                      check-in remains available on the Check-in tab.
                    </p>
                    <textarea
                      className="rph-input"
                      rows={3}
                      placeholder="Attest the vehicle condition is unchanged since checkout…"
                      value={attestation}
                      onChange={(e) => setAttestation(e.target.value)}
                    />
                    <button
                      type="button"
                      className={btnGhost}
                      disabled={pending || attestation.trim().length < 10}
                      onClick={submitMirroredCheckin}
                    >
                      Complete mirrored check-in
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {step === 2 && state ? (
          <div className="space-y-3">
            <p className="text-sm text-rph-fg">
              Select vehicle and hire documents that must be updated after the transfer. Upload replacements from the
              vehicle Documents tab — previous files are kept as superseded versions.
            </p>
            <ul className="space-y-2">
              {state.documentOptions.map((doc) => {
                const key = doc.key;
                return (
                  <li key={key} className="rph-card p-3">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedKeys.includes(key)}
                        onChange={() => toggleKey(key)}
                      />
                      <span className="text-sm text-rph-fg">{doc.label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {step === 3 && state ? (
          <div className="space-y-3 text-sm text-rph-fg-secondary">
            <p>
              Transfer <span className="font-medium text-rph-fg">{vehicleVrm}</span> to{" "}
              <span className="font-medium text-rph-fg">
                {subcompanies.find((s) => s.id === toSubcompanyId)?.name ?? "destination"}
              </span>
              .
            </p>
            {state.blockingHire ? (
              <p>A replacement hire draft will be created for the same driver with checkout carried from the original hire.</p>
            ) : (
              <p>No open hire — only the vehicle subcompany assignment changes.</p>
            )}
            <p className="rph-muted">{selectedKeys.length} document update(s) will be flagged.</p>
          </div>
        ) : null}
      </FormModalShell>

      <ConfirmDialog
        open={dismissConfirmOpen}
        title="Cancel transfer?"
        description="Any selections you made will be discarded. Nothing is saved until you confirm the transfer on the final step."
        confirmLabel="Cancel transfer"
        cancelLabel="Keep working"
        variant="danger"
        pending={pending}
        onConfirm={cancelIntent}
        onCancel={() => setDismissConfirmOpen(false)}
      />
    </>
  );
}
