"use client";

import {
  advanceHireWizardStepAction,
  amendHireContractDraftAction,
  confirmDriverProfileForHireAction,
  createHireDraftAction,
  finalizeHireContractsAction,
  loadHireDraftAction,
  loadHireTermsBodyForWizardAction,
  loadHireWizardShellAction,
  loadHireDriverProfileForReviewAction,
  requestDriverAccessForHireAction,
  saveHireDraftStepAction,
  searchAvailableVehiclesAction,
  type AvailableVehicleSearchRow,
  sendDriverRegistrationInviteForHireAction,
  type HireDriverReviewPayload,
  type HireWizardTermOption,
} from "@/app/actions/rental-hire-wizard";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { HireDriverReviewPanel } from "@/components/fleet/hire-driver-review-panel";
import { hireAmendContractConfirmCopy } from "@/lib/fleet/hire-audit";
import { formModalBtnContinue, formModalBtnGhost } from "@/components/forms/form-modal-actions";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { FormModalField, FormModalStepProgress } from "@/components/forms/form-modal-step-progress";
import { FormModalSelect } from "@/components/forms/form-modal-select";
import { VehicleTabLoader } from "@/app/(main)/rental/vehicles/[id]/vehicle-tab-loader";
import { useHireDraftRealtime } from "@/hooks/use-hire-realtime";
import { formatHireContractStartLabel } from "@/lib/fleet/hire-pdf-details";
import {
  canAdvanceFromDriverAccessStep,
  canAdvanceFromStep,
  driverAccessBlocksFinalize,
  driverAccessLocksContractTerms,
  hireWizardUsesCustomEndTime,
  resolveHireWizardEndTime,
  type HireWizardFormState,
  type HireWizardStep,
} from "@/lib/fleet/hire-wizard";
import type { ContractLengthKind, RentCadence } from "@/lib/fleet/hire-types";
import {
  driverAccessResendReasonCopy,
  type DriverAccessResendReason,
} from "@/lib/fleet/hire-access-token";
import DOMPurify from "isomorphic-dompurify";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

const STEP_LABELS = ["Vehicle", "Rental detail", "T&C", "Driver", "Review", "E-sign"] as const;

const LENGTH_LABELS: Record<ContractLengthKind, string> = {
  annual: "Annual",
  six_months: "6 months",
  custom: "Custom end date",
};

const emptyForm = (vehicleId = ""): HireWizardFormState => ({
  vehicleId,
  startDate: "",
  startTime: "09:00",
  endTime: "09:00",
  rentCadence: "weekly",
  rentAmountGbp: "",
  includeDeposit: false,
  depositGbp: "",
  defaultPaymentAccountId: "",
  contractLengths: { annual: false, six_months: false, custom: false },
  customEndDate: "",
  hireTermsVersionId: "",
  driverLicenceNumber: "",
  driverEmail: "",
  insuranceProvidedBy: "",
});

type Props = {
  open: boolean;
  hireGroupId: string | null;
  initialVehicleId?: string;
  onClose: () => void;
  onSaved: () => void;
};

const PAYMENT_ACCOUNT_NONE = "__none__";

export function HireContractWizardModal({ open, hireGroupId, initialVehicleId, onClose, onSaved }: Props) {
  const [pending, startTransition] = useTransition();
  const [draftLoading, setDraftLoading] = useState(false);
  const [overlay, setOverlay] = useState<ActionStatusOverlayState | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [amendConfirmOpen, setAmendConfirmOpen] = useState(false);
  const [step, setStep] = useState<HireWizardStep>(1);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [form, setForm] = useState<HireWizardFormState>(emptyForm(initialVehicleId));
  const [driverAccessStatus, setDriverAccessStatus] = useState("not_requested");
  const [driverAccessResendReason, setDriverAccessResendReason] = useState<DriverAccessResendReason | null>(null);
  const [driverProfileConfirmed, setDriverProfileConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [vehicleQuery, setVehicleQuery] = useState("");
  const [vehicles, setVehicles] = useState<AvailableVehicleSearchRow[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<{ id: string; label: string }[]>([]);
  const [terms, setTerms] = useState<HireWizardTermOption[]>([]);
  const [termsPreviewId, setTermsPreviewId] = useState<string | null>(null);
  const [termsPreviewHtml, setTermsPreviewHtml] = useState<string | null>(null);
  const [termsPreviewLoading, setTermsPreviewLoading] = useState(false);
  const termsBodyCacheRef = useRef<Map<string, string>>(new Map());
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [requestingDriverAccess, setRequestingDriverAccess] = useState(false);
  const [accessStatusRefreshing, setAccessStatusRefreshing] = useState(false);
  const [driverProfile, setDriverProfile] = useState<HireDriverReviewPayload | null>(null);
  const [driverProfileLoading, setDriverProfileLoading] = useState(false);
  const [driverProfileError, setDriverProfileError] = useState<string | null>(null);
  const driverProfileCacheRef = useRef<{ hireId: string; profile: HireDriverReviewPayload } | null>(null);
  const profileHireIdRef = useRef<string | null>(null);

  const busy = pending || overlay?.phase === "pending" || requestingDriverAccess;
  const shellPending = busy;
  const shellPendingMessage = "Saving…";
  const activeId = draftId ?? hireGroupId;
  const activeIdRef = useRef(activeId);
  const stepRef = useRef(step);
  activeIdRef.current = activeId;
  stepRef.current = step;

  const loadShell = useCallback(async (draftHireGroupId?: string | null) => {
    const openingDraft = Boolean(draftHireGroupId?.trim());
    if (openingDraft) setDraftLoading(true);
    try {
      const res = await loadHireWizardShellAction(draftHireGroupId ?? undefined);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBankAccounts(res.data.bankAccounts);
      setTerms(res.data.terms);
      if (res.data.draft) {
        setDraftId(res.data.draft.id);
        setStep(res.data.draft.wizard_step as HireWizardStep);
        setForm(res.data.draft.form);
        setDriverAccessStatus(res.data.draft.driver_access_status);
        setDriverAccessResendReason(res.data.draft.driver_access_resend_reason);
        setDriverProfileConfirmed(res.data.draft.driver_profile_confirmed);
      }
      setError(null);
    } finally {
      if (openingDraft) setDraftLoading(false);
    }
  }, []);

  const loadDraft = useCallback(async (id: string, options?: { refreshStatus?: boolean }) => {
    if (options?.refreshStatus) setAccessStatusRefreshing(true);
    else setDraftLoading(true);
    try {
      const res = await loadHireDraftAction(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDraftId(res.draft.id);
      setStep(res.draft.wizard_step as HireWizardStep);
      setForm(res.draft.form);
      setDriverAccessStatus(res.draft.driver_access_status);
      setDriverAccessResendReason(res.draft.driver_access_resend_reason);
      setDriverProfileConfirmed(res.draft.driver_profile_confirmed);
      setError(null);
    } finally {
      if (options?.refreshStatus) setAccessStatusRefreshing(false);
      else setDraftLoading(false);
    }
  }, []);

  const loadDriverProfile = useCallback((id: string, options?: { force?: boolean }) => {
    const cached = driverProfileCacheRef.current;
    if (!options?.force && cached?.hireId === id) {
      setDriverProfile(cached.profile);
      setDriverProfileLoading(false);
      setDriverProfileError(null);
      return;
    }

    setDriverProfileLoading(true);
    setDriverProfileError(null);
    void loadHireDriverProfileForReviewAction(id).then((res) => {
      setDriverProfileLoading(false);
      if (!res.ok) {
        if (driverProfileCacheRef.current?.hireId === id) driverProfileCacheRef.current = null;
        setDriverProfile(null);
        setDriverProfileError(res.error);
        return;
      }
      driverProfileCacheRef.current = { hireId: id, profile: res.profile };
      setDriverProfile(res.profile);
    });
  }, []);

  const clearDriverProfileCache = useCallback(() => {
    driverProfileCacheRef.current = null;
    setDriverProfile(null);
    setDriverProfileError(null);
    setDriverProfileLoading(false);
  }, []);

  useEffect(() => {
    if (activeId === profileHireIdRef.current) return;
    profileHireIdRef.current = activeId;
    clearDriverProfileCache();
  }, [activeId, clearDriverProfileCache]);

  useHireDraftRealtime(open ? activeId : null, () => {
    const id = activeIdRef.current;
    if (!id) return;
    loadDraft(id, { refreshStatus: stepRef.current === 4 });
    if (stepRef.current === 5) loadDriverProfile(id);
  });

  useEffect(() => {
    if (!open || step !== 5 || driverAccessStatus !== "approved" || !activeId) return;
    loadDriverProfile(activeId);
  }, [open, step, driverAccessStatus, activeId, loadDriverProfile]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAccessMessage(null);
    setTermsPreviewId(null);
    setTermsPreviewHtml(null);
    if (hireGroupId) {
      void loadShell(hireGroupId);
    } else {
      setDraftId(null);
      setStep(1);
      setForm(emptyForm(initialVehicleId));
      setDriverAccessStatus("not_requested");
      setDriverAccessResendReason(null);
      setDriverProfileConfirmed(false);
      clearDriverProfileCache();
      void loadShell(null);
    }
  }, [open, hireGroupId, initialVehicleId, loadShell, clearDriverProfileCache]);

  useEffect(() => {
    if (!open || step !== 1 || draftLoading) return;
    setVehiclesLoading(true);
    const t = window.setTimeout(() => {
      void searchAvailableVehiclesAction(vehicleQuery, { forHireGroupId: activeId ?? hireGroupId ?? undefined })
        .then((res) => {
          if (res.ok) setVehicles(res.rows);
        })
        .finally(() => setVehiclesLoading(false));
    }, 200);
    return () => {
      window.clearTimeout(t);
      setVehiclesLoading(false);
    };
  }, [open, step, vehicleQuery, activeId, hireGroupId, draftLoading]);

  const stepAdvanceError = useMemo(() => {
    const formError = canAdvanceFromStep(step, form);
    if (formError) return formError;
    if (step === 4) return canAdvanceFromDriverAccessStep(driverAccessStatus);
    if (step === 5 && !driverProfileConfirmed) return "Confirm the driver profile to continue.";
    return null;
  }, [step, form, driverAccessStatus, driverProfileConfirmed]);
  const finalizeBlocked = driverAccessBlocksFinalize(driverAccessStatus, driverProfileConfirmed);
  const contractTermsLocked = driverAccessLocksContractTerms(driverAccessStatus);
  const showRequestAccessButton =
    driverAccessStatus === "not_requested" ||
    driverAccessStatus === "rejected" ||
    driverAccessStatus === "awaiting_registration";

  async function openTermsPreview(termsId: string) {
    setTermsPreviewId(termsId);
    const cached = termsBodyCacheRef.current.get(termsId);
    if (cached) {
      setTermsPreviewHtml(cached);
      return;
    }
    setTermsPreviewLoading(true);
    setTermsPreviewHtml(null);
    const res = await loadHireTermsBodyForWizardAction(termsId);
    setTermsPreviewLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    termsBodyCacheRef.current.set(termsId, res.body);
    setTermsPreviewHtml(res.body);
  }

  const modalTitle = hireGroupId ? "Continue hire contract" : "New hire contract";

  function patchForm(patch: Partial<HireWizardFormState>) {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (patch.contractLengths && !next.contractLengths.custom) {
        next.endTime = next.startTime;
      }
      if (patch.startTime !== undefined && !next.contractLengths.custom) {
        next.endTime = patch.startTime;
      }
      return next;
    });
  }

  async function ensureDraftId(): Promise<string | null> {
    if (activeId) return activeId;
    const res = await createHireDraftAction();
    if (!res.ok) {
      setError(res.error);
      return null;
    }
    setDraftId(res.id);
    return res.id;
  }

  function saveDraft(nextStep?: HireWizardStep) {
    setError(null);
    startTransition(async () => {
      const id = await ensureDraftId();
      if (!id) return;
      const targetStep = nextStep ?? step;
      const res = contractTermsLocked
        ? await advanceHireWizardStepAction(id, targetStep)
        : await saveHireDraftStepAction({
            hireGroupId: id,
            step: targetStep,
            form,
          });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved();
      setOverlay({ phase: "success", title: "Draft saved", detail: "You can continue this contract later." });
    });
  }

  function goNext() {
    if (stepAdvanceError) {
      setError(stepAdvanceError);
      return;
    }
    setError(null);
    const next = Math.min(6, step + 1) as HireWizardStep;
    startTransition(async () => {
      const id = await ensureDraftId();
      if (!id) return;
      const res = contractTermsLocked
        ? await advanceHireWizardStepAction(id, next)
        : await saveHireDraftStepAction({ hireGroupId: id, step: next, form });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStep(next);
    });
  }

  function requestAccess() {
    setError(null);
    setAccessMessage(null);
    setRequestingDriverAccess(true);
    startTransition(async () => {
      try {
        const id = await ensureDraftId();
        if (!id) return;
        await saveHireDraftStepAction({ hireGroupId: id, step: 4, form });
        const res = await requestDriverAccessForHireAction(id);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        if (!res.driverExists) {
          setDriverAccessStatus("awaiting_registration");
          setAccessMessage("No driver profile found for this licence. Register the driver or send a registration link.");
        } else {
          setDriverAccessStatus("pending");
          setDriverAccessResendReason(null);
          setAccessMessage("Access request sent. The driver will receive an email to approve or reject.");
        }
        onSaved();
        const draftRes = await loadHireDraftAction(id);
        if (draftRes.ok) {
          setDraftId(draftRes.draft.id);
          setStep(draftRes.draft.wizard_step as HireWizardStep);
          setForm(draftRes.draft.form);
          setDriverAccessStatus(draftRes.draft.driver_access_status);
          setDriverAccessResendReason(draftRes.draft.driver_access_resend_reason);
          setDriverProfileConfirmed(draftRes.draft.driver_profile_confirmed);
        }
      } finally {
        setRequestingDriverAccess(false);
      }
    });
  }

  function sendRegistrationInvite() {
    if (!form.driverEmail.trim()) {
      setError("Enter the driver email address.");
      return;
    }
    startTransition(async () => {
      const id = activeId;
      if (!id) return;
      const res = await sendDriverRegistrationInviteForHireAction(id, form.driverEmail);
      if (!res.ok) setError(res.error);
      else setAccessMessage("Registration link sent to the driver.");
    });
  }

  function confirmProfile() {
    startTransition(async () => {
      const id = activeId;
      if (!id) return;
      const res = await confirmDriverProfileForHireAction(id);
      if (!res.ok) setError(res.error);
      else {
        setDriverProfileConfirmed(true);
        setStep(6);
        loadDraft(id);
      }
    });
  }

  function finalize() {
    setOverlay({ phase: "pending", title: "Creating contracts…", detail: "" });
    startTransition(async () => {
      const id = activeId;
      if (!id) return;
      const res = await finalizeHireContractsAction(id);
      if (!res.ok) {
        setOverlay({ phase: "error", title: "Could not create contracts", detail: res.error });
        setError(res.error);
        return;
      }
      setOverlay({ phase: "success", title: "Contracts prepared", detail: "Opening e-sign designer…" });
      onSaved();
      onClose();
      if (res.envelopeIds[0]) window.location.href = `/rental/esign/${res.envelopeIds[0]}`;
    });
  }

  function goBack() {
    setError(null);
    if (step === 6 && contractTermsLocked) {
      startTransition(async () => {
        const id = activeId;
        if (!id) return;
        const res = await advanceHireWizardStepAction(id, 5);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setStep(5);
      });
      return;
    }
    setStep((s) => Math.max(1, s - 1) as HireWizardStep);
  }

  function amendContract() {
    setError(null);
    startTransition(async () => {
      const id = activeId;
      if (!id) return;
      const res = await amendHireContractDraftAction(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAmendConfirmOpen(false);
      setDriverAccessStatus("not_requested");
      setDriverAccessResendReason(null);
      setDriverProfileConfirmed(false);
      clearDriverProfileCache();
      setAccessMessage(null);
      setStep(1);
      onSaved();
      loadDraft(id);
    });
  }

  function requestClose() {
    setDiscardConfirmOpen(true);
  }

  return (
    <>
      <FormModalShell
        open={open}
        titleId="hire-wizard-title"
        title={modalTitle}
        description="Drafts are saved to your company account. Use Save draft to continue later."
        headerExtra={<FormModalStepProgress step={step - 1} labels={STEP_LABELS} ariaLabel="Hire contract steps" />}
        allowMaximize
        pending={shellPending}
        pendingMessage={shellPendingMessage}
        maxWidthClass="max-w-5xl"
        panelHeightClass="h-[min(92vh,56rem)]"
        showDraftActions={false}
        onRequestClose={requestClose}
        discardConfirmOpen={discardConfirmOpen}
        onConfirmDiscard={() => {
          setDiscardConfirmOpen(false);
          onClose();
        }}
        onCancelDiscard={() => setDiscardConfirmOpen(false)}
        footer={
          <>
            <button type="button" className={formModalBtnGhost} disabled={busy || draftLoading} onClick={requestClose}>
              Cancel
            </button>
            <div className="flex flex-wrap gap-3">
              {step === 6 && contractTermsLocked ? (
                <button type="button" className={formModalBtnGhost} disabled={busy} onClick={goBack}>
                  Back
                </button>
              ) : step > 1 && contractTermsLocked ? (
                <button
                  type="button"
                  className={`${formModalBtnGhost} text-amber-800 dark:text-amber-200`}
                  disabled={busy}
                  onClick={() => setAmendConfirmOpen(true)}
                >
                  Amend contract
                </button>
              ) : step > 1 ? (
                <button type="button" className={formModalBtnGhost} disabled={busy} onClick={goBack}>
                  Back
                </button>
              ) : null}
              <button type="button" className={formModalBtnGhost} disabled={busy || draftLoading} onClick={() => saveDraft()}>
                Save draft
              </button>
              {step < 6 ? (
                <button
                  type="button"
                  className={formModalBtnContinue}
                  disabled={busy || draftLoading || Boolean(stepAdvanceError)}
                  onClick={goNext}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  className={formModalBtnContinue}
                  disabled={busy || draftLoading || finalizeBlocked}
                  onClick={finalize}
                >
                  {busy ? "Creating…" : "Create & send for e-sign"}
                </button>
              )}
            </div>
          </>
        }
      >
        {error ? <p className="rph-alert-error mb-4 text-sm">{error}</p> : null}

        {draftLoading ? (
          <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 text-sm text-rph-fg-muted">
            <InlineSpinner />
            <p>Loading draft…</p>
          </div>
        ) : null}

        {!draftLoading && contractTermsLocked && step >= 4 ? (
          <p className="rph-alert-warn mb-4 text-sm">
            The driver has approved access for this contract. Vehicle, rental terms, and driver details are locked.
            Use <strong>Amend contract</strong> if you need to change them — the driver must approve access again before
            you can continue.
          </p>
        ) : null}

        {!draftLoading && step === 1 ? (
          <div className="space-y-4">
            <p className="rph-meta text-sm">Select an available vehicle for this hire.</p>
            <FormModalField label="Search vehicles">
              <input
                className="rph-input w-full"
                placeholder="Search by VRM, make, or model…"
                value={vehicleQuery}
                disabled={busy || contractTermsLocked || Boolean(initialVehicleId)}
                onChange={(e) => setVehicleQuery(e.target.value)}
              />
            </FormModalField>
            <div className="overflow-hidden rounded-xl border border-rph-border">
              {vehiclesLoading ? (
                <VehicleTabLoader label="Loading available vehicles…" />
              ) : vehicles.length === 0 ? (
                <p className="rph-muted px-4 py-8 text-center text-sm">No available vehicles match your search.</p>
              ) : (
                <ul className="max-h-[min(42vh,22rem)] divide-y divide-rph-border overflow-y-auto">
                  {vehicles.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        className={`flex w-full flex-col px-4 py-3 text-left text-sm transition-colors hover:bg-rph-chrome ${
                          form.vehicleId === v.id ? "bg-rph-chrome/80 ring-1 ring-inset ring-rph-rail/40" : ""
                        }`}
                        disabled={busy || contractTermsLocked}
                        onClick={() => patchForm({ vehicleId: v.id })}
                      >
                        <p className="font-semibold text-rph-fg">
                          {[
                            v.vrm,
                            [v.make, v.model].filter(Boolean).join(" ") || null,
                            v.year,
                            v.colour,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <p className="mt-1 text-xs text-rph-fg-muted">{v.subcompanyName ?? "—"}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {!draftLoading && step === 2 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <p className="rph-meta text-sm sm:col-span-2">Rental dates, rent, and contract lengths for this hire.</p>
            <FormModalField label="Start date" className="sm:col-span-1">
              <input
                type="date"
                className="rph-input w-full"
                value={form.startDate}
                disabled={busy || contractTermsLocked}
                onChange={(e) => patchForm({ startDate: e.target.value })}
              />
            </FormModalField>
            <FormModalField label="Start time" className="sm:col-span-1">
              <input
                type="time"
                className="rph-input w-full"
                value={form.startTime}
                disabled={busy || contractTermsLocked}
                onChange={(e) => patchForm({ startTime: e.target.value })}
              />
            </FormModalField>
            {!hireWizardUsesCustomEndTime(form) ? (
              <p className="rph-meta text-xs sm:col-span-2">
                Annual and 6-month contracts end at the same time as the start.
              </p>
            ) : null}
            <FormModalField label="Cadence">
              <FormModalSelect
                value={form.rentCadence}
                disabled={busy || contractTermsLocked}
                onValueChange={(value) => patchForm({ rentCadence: value as RentCadence })}
                options={[
                  { value: "weekly", label: "Weekly" },
                  { value: "daily", label: "Daily" },
                  { value: "monthly", label: "Monthly" },
                ]}
              />
            </FormModalField>
            <FormModalField label="Rent (£)">
              <input
                className="rph-input w-full"
                value={form.rentAmountGbp}
                disabled={busy || contractTermsLocked}
                onChange={(e) => patchForm({ rentAmountGbp: e.target.value })}
              />
            </FormModalField>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.includeDeposit}
                disabled={busy || contractTermsLocked}
                onChange={(e) => patchForm({ includeDeposit: e.target.checked })}
              />
              <span className="text-sm text-rph-fg-secondary">Include deposit</span>
            </label>
            {form.includeDeposit ? (
              <FormModalField label="Deposit (£)" className="sm:col-span-2">
                <input
                  className="rph-input w-full"
                  value={form.depositGbp}
                  disabled={busy || contractTermsLocked}
                  onChange={(e) => patchForm({ depositGbp: e.target.value })}
                />
              </FormModalField>
            ) : null}
            <FormModalField label="Payment account (shown to hirer)" className="sm:col-span-2">
              <FormModalSelect
                value={form.defaultPaymentAccountId || PAYMENT_ACCOUNT_NONE}
                disabled={busy || contractTermsLocked}
                placeholder="— Select —"
                onValueChange={(value) =>
                  patchForm({
                    defaultPaymentAccountId: value === PAYMENT_ACCOUNT_NONE ? "" : value,
                  })
                }
                options={[
                  { value: PAYMENT_ACCOUNT_NONE, label: "— Select —" },
                  ...bankAccounts.map((a) => ({ value: a.id, label: a.label })),
                ]}
              />
            </FormModalField>
            <FormModalField label="Who provides insurance?" className="sm:col-span-2">
              <FormModalSelect
                value={form.insuranceProvidedBy || "__none__"}
                disabled={busy || contractTermsLocked}
                placeholder="— Select —"
                onValueChange={(value) =>
                  patchForm({
                    insuranceProvidedBy:
                      value === "driver" || value === "company" ? value : "",
                  })
                }
                options={[
                  { value: "__none__", label: "— Select —" },
                  { value: "driver", label: HIRE_INSURANCE_PROVIDED_BY_LABELS.driver },
                  { value: "company", label: HIRE_INSURANCE_PROVIDED_BY_LABELS.company },
                ]}
              />
              <p className="rph-meta mt-1 text-xs">
                The responsible party uploads the certificate during the hire. Both you and the driver can view it once
                uploaded.
              </p>
            </FormModalField>
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-xs font-medium text-rph-fg-muted">Contract lengths</legend>
              {(Object.keys(LENGTH_LABELS) as ContractLengthKind[]).map((kind) => (
                <label key={kind} className="flex items-center gap-2 text-sm text-rph-fg-secondary">
                  <input
                    type="checkbox"
                    checked={form.contractLengths[kind]}
                    disabled={busy || contractTermsLocked}
                    onChange={() =>
                      patchForm({ contractLengths: { ...form.contractLengths, [kind]: !form.contractLengths[kind] } })
                    }
                  />
                  {LENGTH_LABELS[kind]}
                </label>
              ))}
              {form.contractLengths.custom ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormModalField label="Custom end date">
                    <input
                      type="date"
                      className="rph-input w-full"
                      value={form.customEndDate}
                      disabled={busy || contractTermsLocked}
                      onChange={(e) => patchForm({ customEndDate: e.target.value })}
                    />
                  </FormModalField>
                  <FormModalField label="End time">
                    <input
                      type="time"
                      className="rph-input w-full"
                      value={form.endTime}
                      disabled={busy || contractTermsLocked}
                      onChange={(e) => patchForm({ endTime: e.target.value })}
                    />
                  </FormModalField>
                </div>
              ) : null}
            </fieldset>
          </div>
        ) : null}

        {!draftLoading && step === 3 ? (
          <div className="space-y-4">
            <p className="rph-meta text-sm">Published hire terms are included in the contract.</p>
            {terms.map((t) => (
              <label
                key={t.id}
                className="rph-card flex cursor-pointer items-start gap-3 p-3"
              >
                <input
                  type="radio"
                  name="terms"
                  checked={form.hireTermsVersionId === t.id}
                  disabled={busy || contractTermsLocked}
                  onChange={() => patchForm({ hireTermsVersionId: t.id })}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-rph-fg">{t.title}</span>
                  <span className="block text-xs text-rph-fg-muted">{t.version_label}</span>
                </span>
                <button
                  type="button"
                  className="rph-btn-ghost h-9 shrink-0 px-3 text-xs"
                  disabled={termsPreviewLoading}
                  onClick={(e) => {
                    e.preventDefault();
                    void openTermsPreview(t.id);
                  }}
                >
                  Preview
                </button>
              </label>
            ))}
            {termsPreviewId ? (
              termsPreviewLoading ? (
                <div className="flex items-center gap-2 rounded-xl border border-rph-border bg-rph-page p-4 text-sm text-rph-fg-muted">
                  <InlineSpinner small />
                  Loading preview…
                </div>
              ) : termsPreviewHtml ? (
                <div
                  className="max-h-[min(32vh,16rem)] overflow-y-auto rounded-xl border border-rph-border bg-rph-page p-4 text-sm prose prose-sm dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(termsPreviewHtml) }}
                />
              ) : null
            ) : null}
          </div>
        ) : null}

        {!draftLoading && step === 4 ? (
          <div className="space-y-4">
            <FormModalField label="Driving licence number">
              <input
                className="rph-input w-full uppercase"
                value={form.driverLicenceNumber}
                disabled={busy || contractTermsLocked}
                onChange={(e) => patchForm({ driverLicenceNumber: e.target.value })}
              />
            </FormModalField>
            <FormModalField label="Driver email (if not on profile)">
              <input
                className="rph-input w-full"
                value={form.driverEmail}
                disabled={busy || contractTermsLocked}
                onChange={(e) => patchForm({ driverEmail: e.target.value })}
              />
            </FormModalField>
            <DriverAccessStatusPanel
              status={driverAccessStatus}
              resendReason={driverAccessResendReason}
              sending={requestingDriverAccess}
              refreshing={accessStatusRefreshing}
              message={accessMessage}
            />
            <div className="flex flex-wrap gap-2">
              {showRequestAccessButton ? (
                <button
                  type="button"
                  className={`${formModalBtnContinue} inline-flex items-center gap-2`}
                  disabled={busy}
                  onClick={requestAccess}
                >
                  {requestingDriverAccess ? (
                    <>
                      <InlineSpinner onDark />
                      Sending request…
                    </>
                  ) : driverAccessStatus === "rejected" || driverAccessResendReason ? (
                    "Send new access link"
                  ) : (
                    "Request driver access"
                  )}
                </button>
              ) : null}
              {driverAccessStatus === "awaiting_registration" ? (
                <button type="button" className={formModalBtnGhost} disabled={busy} onClick={sendRegistrationInvite}>
                  Send registration link
                </button>
              ) : null}
              {driverAccessStatus === "pending" || driverAccessStatus === "approved" ? (
                <button
                  type="button"
                  className={`${formModalBtnGhost} inline-flex items-center gap-2`}
                  disabled={busy}
                  onClick={() => activeId && loadDraft(activeId, { refreshStatus: true })}
                >
                  {accessStatusRefreshing ? (
                    <>
                      <InlineSpinner small />
                      Refreshing…
                    </>
                  ) : (
                    "Refresh status"
                  )}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {!draftLoading && step === 5 ? (
          <HireDriverReviewPanel
            profile={
              driverProfile ?? {
                fullName: "—",
                email: null,
                dateOfBirth: "",
                phone: "—",
                address: "—",
                drivingLicenceNumber: null,
                drivingLicenceExpiry: null,
                phvLicenceNumber: null,
                phvLicensingAuthority: null,
                phvLicenceExpiry: null,
                documents: [],
              }
            }
            loading={driverProfileLoading}
            error={driverProfileError}
            busy={busy}
            profileConfirmed={driverProfileConfirmed}
            onConfirm={confirmProfile}
          />
        ) : null}

        {!draftLoading && step === 6 ? (
          <div className="space-y-4">
            <p className="text-sm text-rph-fg-secondary">
              This will generate contract PDFs, place signature fields, and open the e-sign designer. After you sign as
              the lessor (if required), the hirer receives the agreement by email.
            </p>
            <ul className="rph-card list-inside list-disc space-y-1 p-4 text-sm text-rph-fg-muted">
              <li>Vehicle selected · {form.vehicleId ? "Yes" : "No"}</li>
              <li>
                Start{" "}
                {form.startDate
                  ? formatHireContractStartLabel(form.startDate, form.startTime)
                  : "—"}
              </li>
              <li>
                End time ·{" "}
                {hireWizardUsesCustomEndTime(form)
                  ? resolveHireWizardEndTime(form) || "—"
                  : `Same as start (${form.startTime || "—"})`}
              </li>
              <li>Driver access approved · {driverAccessStatus === "approved" ? "Yes" : "No"}</li>
            </ul>
          </div>
        ) : null}
      </FormModalShell>

      <ConfirmDialog
        open={amendConfirmOpen}
        title="Amend hire contract?"
        description={hireAmendContractConfirmCopy()}
        confirmLabel="Amend contract"
        cancelLabel="Keep locked"
        variant="danger"
        pending={busy}
        onConfirm={amendContract}
        onCancel={() => setAmendConfirmOpen(false)}
      />

      <ActionStatusOverlay state={overlay} onDismiss={() => setOverlay(null)} />
    </>
  );
}

function InlineSpinner({ small, onDark }: { small?: boolean; onDark?: boolean }) {
  return (
    <span
      className={`inline-block shrink-0 animate-spin rounded-full border-[2px] ${
        onDark ? "border-white/40 border-t-white" : "border-rph-border border-t-rph-rail"
      } ${small ? "h-3.5 w-3.5" : "h-4 w-4"}`}
      aria-hidden
    />
  );
}

const DRIVER_ACCESS_STATUS_COPY: Record<
  string,
  { title: string; detail: string; tone: "neutral" | "pending" | "success" | "warning" | "error" }
> = {
  not_requested: {
    title: "No access request sent",
    detail: "Enter the licence number and send a request when you are ready.",
    tone: "neutral",
  },
  pending: {
    title: "Pending driver approval",
    detail: "The driver has been emailed. This page updates live when they approve or reject.",
    tone: "pending",
  },
  awaiting_registration: {
    title: "Driver not registered",
    detail: "No profile exists for this licence. Send a registration link or register the driver first.",
    tone: "warning",
  },
  approved: {
    title: "Driver access approved",
    detail: "Continue to review the driver profile on the next step.",
    tone: "success",
  },
  rejected: {
    title: "Driver access rejected",
    detail: "The driver declined access. Update details and send a new request if needed.",
    tone: "error",
  },
};

function DriverAccessStatusPanel({
  status,
  resendReason,
  sending,
  refreshing,
  message,
}: {
  status: string;
  resendReason?: DriverAccessResendReason | null;
  sending: boolean;
  refreshing: boolean;
  message: string | null;
}) {
  if (sending) {
    return (
      <div
        className="flex items-start gap-3 rounded-xl border border-rph-border bg-rph-chrome/50 p-4"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <StatusSpinner />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-rph-fg">Sending access request…</p>
          <p className="mt-0.5 text-sm text-rph-fg-secondary">
            Saving the draft and emailing the driver. This may take a few seconds.
          </p>
        </div>
      </div>
    );
  }

  const copy = DRIVER_ACCESS_STATUS_COPY[status] ?? {
    title: status.replace(/_/g, " "),
    detail: "Status updates live when the driver responds.",
    tone: "neutral" as const,
  };
  const resendNote = driverAccessResendReasonCopy(resendReason);
  const title =
    status === "not_requested" && resendReason ? "New driver access link required" : copy.title;
  const detail = message?.trim() || resendNote || copy.detail;
  const toneClass = resendReason
    ? "border-amber-300/80 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30"
    : copy.tone === "pending"
      ? "border-amber-300/80 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30"
      : copy.tone === "success"
        ? "border-emerald-300/80 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30"
        : copy.tone === "warning"
          ? "border-amber-300/80 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30"
          : copy.tone === "error"
            ? "border-red-300/80 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30"
            : "border-rph-border bg-rph-chrome/40";

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-4 ${toneClass}`}
      role="status"
      aria-live="polite"
      aria-busy={refreshing || status === "pending"}
    >
      {status === "pending" || refreshing ? <StatusSpinner /> : null}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold capitalize text-rph-fg">{title}</p>
        <p className="mt-0.5 text-sm text-rph-fg-secondary">{detail}</p>
        {status === "pending" ? (
          <p className="mt-2 text-xs font-medium text-rph-fg-muted">
            {refreshing ? "Checking for driver response…" : "Waiting for driver response · updates live"}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function StatusSpinner() {
  return (
    <span
      className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-[3px] border-rph-border border-t-rph-rail"
      aria-hidden
    />
  );
}
