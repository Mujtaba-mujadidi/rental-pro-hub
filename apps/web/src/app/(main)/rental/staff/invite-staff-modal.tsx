"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteRentalStaffAction } from "@/app/actions/rental-staff";
import type { CompanyMembershipRole } from "@/lib/auth/profile";
import { formModalBtnContinue, formModalBtnGhost } from "@/components/forms/form-modal-actions";
import { FormModalSelect } from "@/components/forms/form-modal-select";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { FormModalStepProgress } from "@/components/forms/form-modal-step-progress";
import { useFormModalDraft } from "@/hooks/use-form-modal-draft";

const STEP_LABELS = ["Details", "Role & access", "Review"] as const;

type SubcompanyOption = { id: string; name: string; is_primary: boolean };

function inputClass() {
  return "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-rph-rail focus:ring-2 focus:ring-rph-rail/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";
}

type InviteSnapshot = {
  step: number;
  firstName: string;
  lastName: string;
  email: string;
  role: CompanyMembershipRole;
  accessScope: "all" | "explicit";
  selectedSubIds: string[];
};

const INVITE_DRAFT_KEY = "invite-staff";
const inviteBaseline: InviteSnapshot = {
  step: 0,
  firstName: "",
  lastName: "",
  email: "",
  role: "operations",
  accessScope: "all",
  selectedSubIds: [],
};

export function InviteStaffModal({
  open,
  onOpenChange,
  onInvited,
  subcompanies,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited?: () => void;
  subcompanies: SubcompanyOption[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CompanyMembershipRole>("operations");
  const [accessScope, setAccessScope] = useState<"all" | "explicit">("all");
  const [selectedSubIds, setSelectedSubIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const snapshot = useMemo<InviteSnapshot>(
    () => ({ step, firstName, lastName, email, role, accessScope, selectedSubIds }),
    [step, firstName, lastName, email, role, accessScope, selectedSubIds],
  );

  const applySnapshot = useCallback((s: InviteSnapshot) => {
    setStep(s.step);
    setFirstName(s.firstName);
    setLastName(s.lastName);
    setEmail(s.email);
    setRole(s.role);
    setAccessScope(s.accessScope);
    setSelectedSubIds(s.selectedSubIds);
    setError(null);
  }, []);

  const {
    saveNotice,
    hasStoredDraft,
    isDirty,
    saveProgress,
    saveProgressAndClose,
    requestClose,
    requestStartFresh,
    discardConfirmOpen,
    confirmDiscardClose,
    cancelDiscardClose,
    startFreshConfirmOpen,
    confirmStartFresh,
    cancelStartFresh,
    clearAfterSuccess,
  } = useFormModalDraft({
    draftKey: INVITE_DRAFT_KEY,
    open,
    snapshot,
    baseline: inviteBaseline,
    pending,
    applySnapshot,
    onClose: () => onOpenChange(false),
  });

  useEffect(() => {
    if (role === "admin") {
      setAccessScope("all");
      setSelectedSubIds([]);
    }
  }, [role]);

  const step1Valid = useCallback(() => {
    if (role === "admin") return true;
    if (accessScope === "all") return true;
    return selectedSubIds.length > 0;
  }, [role, accessScope, selectedSubIds]);

  const canGoNext = useCallback(() => {
    if (step === 0) {
      const em = email.trim();
      return firstName.trim().length > 0 && lastName.trim().length > 0 && em.length > 0 && em.includes("@");
    }
    if (step === 1) return step1Valid();
    return true;
  }, [step, firstName, lastName, email, step1Valid]);

  function toggleSub(id: string) {
    setSelectedSubIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const accessSummary = useCallback(() => {
    if (role === "admin") return "All subcompanies (admins always have full access).";
    if (accessScope === "all") return "All subcompanies.";
    if (selectedSubIds.length === 0) return "—";
    const names = subcompanies.filter((s) => selectedSubIds.includes(s.id)).map((s) => s.name);
    return names.length ? names.join(", ") : `${selectedSubIds.length} subcompan${selectedSubIds.length === 1 ? "y" : "ies"}`;
  }, [role, accessScope, selectedSubIds, subcompanies]);

  const sendInvite = useCallback(() => {
    setError(null);
    const em = email.trim().toLowerCase();
    if (!em || !em.includes("@")) {
      setError("Valid email is required.");
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    const access =
      role === "admin"
        ? undefined
        : accessScope === "explicit"
          ? { scope: "explicit" as const, subcompanyIds: selectedSubIds }
          : { scope: "all" as const, subcompanyIds: [] as string[] };

    startTransition(() => {
      void (async () => {
        const res = await inviteRentalStaffAction(em, role, firstName, lastName, access);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        clearAfterSuccess();
        onInvited?.();
        router.refresh();
        onOpenChange(false);
      })();
    });
  }, [email, firstName, lastName, role, accessScope, selectedSubIds, onOpenChange, onInvited, router, clearAfterSuccess]);

  return (
    <FormModalShell
      open={open}
      titleId="invite-staff-title"
      title="Add staff"
      description="Invite by email, choose their role, and set which subcompanies they can see after they sign in."
      headerExtra={<FormModalStepProgress step={step} labels={STEP_LABELS} ariaLabel="Add staff steps" />}
      pending={pending}
      maxWidthClass="max-w-2xl"
      saveNotice={saveNotice}
      hasStoredDraft={hasStoredDraft}
      isDirty={isDirty}
      onSaveProgress={saveProgress}
      onSaveAndClose={saveProgressAndClose}
      onRequestClose={requestClose}
      onRequestStartFresh={requestStartFresh}
      discardConfirmOpen={discardConfirmOpen}
      onConfirmDiscard={confirmDiscardClose}
      onCancelDiscard={cancelDiscardClose}
      startFreshConfirmOpen={startFreshConfirmOpen}
      onConfirmStartFresh={confirmStartFresh}
      onCancelStartFresh={cancelStartFresh}
      footer={
        <>
          <button type="button" className={formModalBtnGhost} disabled={pending} onClick={requestClose}>
            Cancel
          </button>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:gap-3">
            {step > 0 ? (
              <button
                type="button"
                className={formModalBtnGhost}
                disabled={pending}
                onClick={() => setStep((s) => s - 1)}
              >
                Back
              </button>
            ) : null}
            {step < STEP_LABELS.length - 1 ? (
              <button
                type="button"
                className={formModalBtnContinue}
                disabled={pending || !canGoNext()}
                onClick={() => setStep((s) => Math.min(STEP_LABELS.length - 1, s + 1))}
              >
                Continue
              </button>
            ) : (
              <button type="button" className={formModalBtnContinue} disabled={pending} onClick={sendInvite}>
                {pending ? "Sending…" : "Send invite"}
              </button>
            )}
          </div>
        </>
      }
    >
      {error ? <p className="mb-4 rph-alert-error text-sm">{error}</p> : null}

      {step === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="invite-staff-first" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              First name *
            </label>
            <input
              id="invite-staff-first"
              type="text"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputClass()}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="invite-staff-last" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Last name *
            </label>
            <input
              id="invite-staff-last"
              type="text"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={inputClass()}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="invite-staff-email" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Email *
            </label>
            <input
              id="invite-staff-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass()}
              placeholder="colleague@company.com"
            />
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-5">
          <div className="space-y-1">
            <label htmlFor="invite-staff-role" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Role
            </label>
            <FormModalSelect
              value={role}
              aria-label="Role"
              options={[
                { value: "admin", label: "Admin" },
                { value: "operations", label: "Operations" },
                { value: "finance", label: "Finance" },
                { value: "viewer", label: "Viewer" },
              ]}
              onValueChange={(v) => setRole(v as CompanyMembershipRole)}
            />
          </div>

          {role === "admin" ? (
            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-400">
              Admins always have access to <span className="font-semibold text-zinc-800 dark:text-zinc-200">all</span>{" "}
              subcompanies.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Subcompany access</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                They only see data for the subcompanies you allow. You can change this later on the Staff page.
              </p>
              <fieldset className="space-y-2">
                <legend className="sr-only">Subcompany access</legend>
                <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="radio"
                    name="invite-access-scope"
                    className="mt-0.5"
                    checked={accessScope === "all"}
                    onChange={() => {
                      setAccessScope("all");
                      setSelectedSubIds([]);
                    }}
                  />
                  <span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">All subcompanies</span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">Same as company-wide access.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="radio"
                    name="invite-access-scope"
                    className="mt-0.5"
                    checked={accessScope === "explicit"}
                    onChange={() => setAccessScope("explicit")}
                  />
                  <span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">Selected subcompanies only</span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">Pick one or more subcompanies.</span>
                  </span>
                </label>
              </fieldset>
              {accessScope === "explicit" ? (
                <div className="border-l-2 border-zinc-200 pl-3 dark:border-zinc-600">
                  {subcompanies.length === 0 ? (
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      No subcompanies exist yet. Register subcompanies under Subcompany first, or choose &quot;All
                      subcompanies&quot;.
                    </p>
                  ) : (
                    <ul className="flex max-h-48 flex-col gap-2 overflow-y-auto pr-1">
                      {subcompanies.map((s) => (
                        <li key={s.id}>
                          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                            <input
                              type="checkbox"
                              checked={selectedSubIds.includes(s.id)}
                              onChange={() => toggleSub(s.id)}
                            />
                            <span>
                              {s.name}
                              {s.is_primary ? (
                                <span className="ml-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/35 dark:text-indigo-100">
                                  Main
                                </span>
                              ) : null}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900/60">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">Review invite</p>
            <dl className="mt-3 space-y-2 text-zinc-600 dark:text-zinc-400">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Name</dt>
                <dd className="text-zinc-900 dark:text-zinc-100">
                  {[firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Email</dt>
                <dd className="font-mono text-xs text-zinc-900 dark:text-zinc-100">{email.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Role</dt>
                <dd className="capitalize text-zinc-900 dark:text-zinc-100">{role}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Subcompany access</dt>
                <dd className="text-zinc-900 dark:text-zinc-100">{accessSummary()}</dd>
              </div>
            </dl>
          </div>
          <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            If they already have an account with this email, they should sign in instead; this flow is for new accounts
            on that address.
          </p>
        </div>
      ) : null}
    </FormModalShell>
  );
}

export function StaffInviteTrigger({ subcompanies }: { subcompanies: SubcompanyOption[] }) {
  const [open, setOpen] = useState(false);
  const btnClass =
    "inline-flex shrink-0 items-center justify-center rounded-lg bg-rph-rail px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer";

  return (
    <>
      <button type="button" className={btnClass} onClick={() => setOpen(true)}>
        Add staff
      </button>
      <InviteStaffModal open={open} onOpenChange={setOpen} subcompanies={subcompanies} />
    </>
  );
}
