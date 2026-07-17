"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  completeRentalOnboardingAction,
  saveRentalOnboardingStepAction,
  updateParentCompanyProfileFieldsAction,
  updatePrimarySubcompanyOnboardingAction,
  uploadParentCompanyLogoAction,
} from "@/app/actions/rental-onboarding";
import { inviteRentalStaffAction } from "@/app/actions/rental-staff";
import type { CompanyMembershipRole } from "@/lib/auth/profile";
import { CompanyStepProgress } from "@/components/forms/company-step-progress";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";

/** Short labels for the orange step rail (same pattern as super-admin registration). */
const STEP_LABELS = ["Legal", "Logo", "Primary", "Locations", "Invite", "Finish"] as const;

const btnContinue =
  "flex h-11 min-w-[7rem] items-center justify-center rounded-lg bg-rph-rail px-4 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50";
const btnGhost =
  "flex h-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";
const btnSkip =
  "flex h-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

function inputClass(invalid?: boolean) {
  return [
    "w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100",
    invalid
      ? "border-red-500 focus:border-red-500 focus:ring-red-500/25"
      : "border-zinc-300 focus:border-rph-rail focus:ring-rph-rail/20",
  ].join(" ");
}

const fileInputClass = [
  inputClass(),
  "py-2",
  "file:mr-3 file:rounded-lg file:border-0 file:bg-rph-rail file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-rph-rail-hover dark:file:bg-rph-rail-soft",
].join(" ");

type CompanyRow = {
  id: string;
  name: string;
  legal_name: string | null;
  company_number: string | null;
  registered_address_line1: string | null;
  registered_address_line2: string | null;
  registered_town: string | null;
  registered_county: string | null;
  registered_postcode: string | null;
  country: string | null;
  entity_type: string | null;
  trading_name: string | null;
  billing_email: string | null;
  logo_storage_path: string | null;
};

type PrimaryRow = { id: string; name: string; display_name: string | null } | null;

export function RentalOnboardingWizard({
  initialStep,
  company,
  primarySubcompany,
}: {
  initialStep: number;
  company: CompanyRow;
  primarySubcompany: PrimaryRow;
}) {
  const router = useRouter();
  const [step, setStep] = useState(() => Math.min(Math.max(0, initialStep), STEP_LABELS.length - 1));
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<ActionStatusOverlayState | null>(null);
  const pending = overlay?.phase === "pending";

  const [entityType, setEntityType] = useState(company.entity_type ?? "");
  const [tradingName, setTradingName] = useState(company.trading_name ?? "");
  const [billingEmail, setBillingEmail] = useState(company.billing_email ?? "");

  const [opName, setOpName] = useState(primarySubcompany?.name ?? company.name);
  const [displayName, setDisplayName] = useState(primarySubcompany?.display_name ?? "");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteRole, setInviteRole] = useState<CompanyMembershipRole>("operations");

  const addrBlock = useMemo(() => {
    return [
      company.registered_address_line1,
      company.registered_address_line2,
      [company.registered_town, company.registered_county].filter(Boolean).join(", "),
      company.registered_postcode,
    ]
      .map((x) => (x ?? "").trim())
      .filter(Boolean)
      .join("\n");
  }, [company]);

  const runBusy = useCallback(async (title: string, detail: string, work: () => Promise<void>) => {
    setError(null);
    setOverlay({ phase: "pending", title, detail });
    try {
      await work();
      setOverlay(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      setError(message);
      setOverlay({ phase: "error", title: "Could not continue", detail: message });
    }
  }, []);

  const persistStep = useCallback(async (next: number) => {
    const res = await saveRentalOnboardingStepAction(next);
    if (!res.ok) {
      throw new Error(res.error);
    }
    setStep(next);
    setError(null);
  }, []);

  const goNext = useCallback(async () => {
    const next = Math.min(step + 1, STEP_LABELS.length - 1);
    await runBusy("Saving…", "Moving to the next step. Please wait.", async () => {
      await persistStep(next);
    });
  }, [step, persistStep, runBusy]);

  const goBack = useCallback(async () => {
    const prev = Math.max(step - 1, 0);
    await runBusy("Saving…", "Going back. Please wait.", async () => {
      await persistStep(prev);
    });
  }, [step, persistStep, runBusy]);

  const saveStep0 = useCallback(async () => {
    await runBusy("Saving company details…", "Please wait while we save your legal profile.", async () => {
      const fd = new FormData();
      fd.set("entity_type", entityType);
      fd.set("trading_name", tradingName);
      fd.set("billing_email", billingEmail);
      const res = await updateParentCompanyProfileFieldsAction(fd);
      if (!res.ok) throw new Error(res.error);
      await persistStep(Math.min(step + 1, STEP_LABELS.length - 1));
    });
  }, [entityType, tradingName, billingEmail, step, persistStep, runBusy]);

  const skipLogo = useCallback(async () => {
    await goNext();
  }, [goNext]);

  const uploadLogo = useCallback(
    async (file: File | null) => {
      if (!file) {
        setError("Choose a logo file or use Skip for now.");
        return;
      }
      await runBusy("Uploading logo…", "Please wait while we save your company logo.", async () => {
        const fd = new FormData();
        fd.set("logo", file);
        const res = await uploadParentCompanyLogoAction(fd);
        if (!res.ok) throw new Error(res.error);
        await persistStep(Math.min(step + 1, STEP_LABELS.length - 1));
      });
    },
    [step, persistStep, runBusy],
  );

  const savePrimary = useCallback(async () => {
    await runBusy("Saving primary unit…", "Please wait while we save your operational unit.", async () => {
      const fd = new FormData();
      fd.set("trading_name", opName.trim());
      fd.set("display_name", displayName.trim());
      const res = await updatePrimarySubcompanyOnboardingAction(fd);
      if (!res.ok) throw new Error(res.error);
      await persistStep(Math.min(step + 1, STEP_LABELS.length - 1));
    });
  }, [opName, displayName, step, persistStep, runBusy]);

  const sendInvite = useCallback(async () => {
    const em = inviteEmail.trim();
    if (!em) {
      await goNext();
      return;
    }
    if (!inviteFirstName.trim()) {
      setError("First name is required to send an invite.");
      return;
    }
    if (!inviteLastName.trim()) {
      setError("Last name is required to send an invite.");
      return;
    }
    await runBusy("Sending invite…", "Creating the staff invite. Please wait.", async () => {
      const res = await inviteRentalStaffAction(em, inviteRole, inviteFirstName, inviteLastName);
      if (!res.ok) throw new Error(res.error);
      setInviteEmail("");
      setInviteFirstName("");
      setInviteLastName("");
      await persistStep(Math.min(step + 1, STEP_LABELS.length - 1));
    });
  }, [inviteEmail, inviteFirstName, inviteLastName, inviteRole, step, goNext, persistStep, runBusy]);

  const finish = useCallback(async () => {
    await runBusy("Finishing setup…", "Opening your rental dashboard. Please wait.", async () => {
      const res = await completeRentalOnboardingAction();
      if (!res.ok) throw new Error(res.error);
      router.replace("/rental");
      router.refresh();
    });
  }, [router, runBusy]);

  return (
    <div className="relative mx-auto w-full max-w-3xl pb-6">
      <ActionStatusOverlay state={overlay} onDismiss={() => setOverlay(null)} />
      <div className="flex max-h-[min(90vh,52rem)] flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
        <div className="shrink-0 border-b border-zinc-200/90 px-6 pb-4 pt-6 dark:border-zinc-700 sm:px-10 sm:pt-10">
          <h2 id="rental-onboarding-title" className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Rental company setup
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Confirm your legal profile, branding, primary operational unit, team, then finish — same flow style as company
            registration.
          </p>
          <CompanyStepProgress step={step} labels={STEP_LABELS} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 sm:px-10">
          {error && overlay?.phase !== "error" ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          ) : null}

          {step === 0 ? (
            <div className="space-y-4 pt-1">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Parent company (legal)</h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  The parent company holds the contract. Confirm what we have on file; use the contract amendment flow if
                  legal details need to change later.
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900/60">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">On file</p>
                <dl className="mt-2 space-y-2 text-zinc-600 dark:text-zinc-400">
                  <div>
                    <dt className="font-medium text-zinc-700 dark:text-zinc-300">Registered name</dt>
                    <dd className="mt-0.5 text-zinc-900 dark:text-zinc-100">{company.name}</dd>
                  </div>
                  {company.legal_name ? (
                    <div>
                      <dt className="font-medium text-zinc-700 dark:text-zinc-300">Legal name</dt>
                      <dd className="mt-0.5">{company.legal_name}</dd>
                    </div>
                  ) : null}
                  {company.company_number ? (
                    <div>
                      <dt className="font-medium text-zinc-700 dark:text-zinc-300">Company number</dt>
                      <dd className="mt-0.5 font-mono text-xs">{company.company_number}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="font-medium text-zinc-700 dark:text-zinc-300">Registered office</dt>
                    <dd className="mt-0.5 whitespace-pre-line">{addrBlock || "—"}</dd>
                  </div>
                </dl>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="onb-entity-type" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Entity type (optional)
                  </label>
                  <input
                    id="onb-entity-type"
                    className={inputClass()}
                    value={entityType}
                    onChange={(e) => setEntityType(e.target.value)}
                    placeholder="e.g. Limited company"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="onb-trading" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Trading name (optional)
                  </label>
                  <input
                    id="onb-trading"
                    className={inputClass()}
                    value={tradingName}
                    onChange={(e) => setTradingName(e.target.value)}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="onb-billing" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Billing email (optional)
                  </label>
                  <input
                    id="onb-billing"
                    type="email"
                    autoComplete="email"
                    className={inputClass()}
                    value={billingEmail}
                    onChange={(e) => setBillingEmail(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4 pt-1">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Company logo</h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Optional but recommended. PNG, JPEG, or WebP up to 2&nbsp;MB. Images are resized for storage (max
                  800×400px). On contracts the logo is capped so the header stays compact (about 140×36pt).
                </p>
              </div>
              {company.logo_storage_path ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/35 dark:text-emerald-100">
                  A logo is already on file. Upload a new file to replace it.
                </p>
              ) : null}
              <div className="space-y-1">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Logo file</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={pending}
                  className={fileInputClass}
                  onChange={(e) => uploadLogo(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4 pt-1">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Primary operational unit</h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Default branch for day-to-day work. It does not replace the parent company as the contract holder.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="onb-op-name" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Trading / operational name *
                  </label>
                  <input
                    id="onb-op-name"
                    className={inputClass()}
                    value={opName}
                    onChange={(e) => setOpName(e.target.value)}
                    autoComplete="organization"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="onb-display" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Display label (optional)
                  </label>
                  <input
                    id="onb-display"
                    className={inputClass()}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Shown in lists"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4 pt-1">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Additional locations</h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Register more subcompanies anytime from <span className="font-semibold text-zinc-700 dark:text-zinc-300">Subcompany</span>{" "}
                  in the sidebar. No separate logins for branches.
                </p>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4 pt-1">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Invite staff</h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Send an email invite, or skip and use <span className="font-semibold text-zinc-700 dark:text-zinc-300">Staff</span>{" "}
                  later.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="onb-invite-first" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    First name
                  </label>
                  <input
                    id="onb-invite-first"
                    type="text"
                    autoComplete="given-name"
                    className={inputClass()}
                    value={inviteFirstName}
                    onChange={(e) => setInviteFirstName(e.target.value)}
                    placeholder="If sending invite"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="onb-invite-last" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Last name
                  </label>
                  <input
                    id="onb-invite-last"
                    type="text"
                    autoComplete="family-name"
                    className={inputClass()}
                    value={inviteLastName}
                    onChange={(e) => setInviteLastName(e.target.value)}
                    placeholder="If sending invite"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="onb-invite-email" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Email (optional)
                  </label>
                  <input
                    id="onb-invite-email"
                    type="email"
                    autoComplete="email"
                    className={inputClass()}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                  />
                </div>
                <div className="space-y-1 sm:max-w-xs">
                  <label htmlFor="onb-invite-role" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Role
                  </label>
                  <select
                    id="onb-invite-role"
                    className={inputClass()}
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as CompanyMembershipRole)}
                  >
                    <option value="admin">Admin</option>
                    <option value="operations">Operations</option>
                    <option value="finance">Finance</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-4 pt-1">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">You&apos;re ready</h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Manage roles and subcompany access under Staff; request legal amendments from the dashboard when needed.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700 sm:px-10">
          <button type="button" className={btnGhost} disabled={pending || step === 0} onClick={() => void goBack()}>
            Back
          </button>
          <div className="flex flex-wrap gap-3">
            {step === 0 ? (
              <button type="button" className={btnContinue} disabled={pending} onClick={() => void saveStep0()}>
                {pending ? "Please wait…" : "Continue"}
              </button>
            ) : null}
            {step === 1 ? (
              <button type="button" className={btnSkip} disabled={pending} onClick={() => void skipLogo()}>
                {pending ? "Please wait…" : "Skip for now"}
              </button>
            ) : null}
            {step === 2 ? (
              <button
                type="button"
                className={btnContinue}
                disabled={pending || !opName.trim()}
                onClick={() => void savePrimary()}
              >
                {pending ? "Please wait…" : "Continue"}
              </button>
            ) : null}
            {step === 3 ? (
              <button type="button" className={btnContinue} disabled={pending} onClick={() => void goNext()}>
                {pending ? "Please wait…" : "Continue"}
              </button>
            ) : null}
            {step === 4 ? (
              <>
                <button type="button" className={btnSkip} disabled={pending} onClick={() => void goNext()}>
                  {pending ? "Please wait…" : "Skip"}
                </button>
                <button type="button" className={btnContinue} disabled={pending} onClick={() => void sendInvite()}>
                  {pending ? "Please wait…" : inviteEmail.trim() ? "Send invite & continue" : "Continue"}
                </button>
              </>
            ) : null}
            {step === 5 ? (
              <button type="button" className={btnContinue} disabled={pending} onClick={() => void finish()}>
                {pending ? "Please wait…" : "Go to dashboard"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
