"use client";

import { Fragment, useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteRentalStaffAction } from "@/app/actions/rental-staff";
import type { CompanyMembershipRole } from "@/lib/auth/profile";

const STEP_LABELS = ["Details", "Role & access", "Review"] as const;

type SubcompanyOption = { id: string; name: string; is_primary: boolean };

const btnContinue =
  "flex h-11 min-w-[7rem] items-center justify-center rounded-lg bg-rph-rail px-4 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50";
const btnGhost =
  "flex h-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

function inputClass() {
  return "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-rph-rail focus:ring-2 focus:ring-rph-rail/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";
}

function StepProgress({ step }: { step: number }) {
  const displayStep = step + 1;
  return (
    <nav className="mb-2" aria-label="Add staff steps">
      <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Step {displayStep} of {STEP_LABELS.length}
      </p>
      <ol className="flex w-full items-center px-0.5 sm:px-2">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const done = n < displayStep;
          const active = n === displayStep;
          const segmentBeforeOrange = i > 0 && displayStep > i;
          return (
            <Fragment key={label}>
              {i > 0 ? (
                <li className="mx-1 h-1 min-w-[8px] flex-1 list-none sm:mx-2" aria-hidden>
                  <div
                    className={[
                      "h-full w-full rounded-full transition-colors duration-300",
                      segmentBeforeOrange ? "bg-orange-500" : "bg-zinc-200 dark:bg-zinc-700",
                    ].join(" ")}
                  />
                </li>
              ) : null}
              <li className="flex list-none flex-col items-center">
                <div
                  className={[
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-all",
                    done && "border-orange-500 bg-orange-500 text-white shadow-md shadow-orange-500/25",
                    active &&
                      "border-orange-500 bg-white text-orange-600 shadow-md ring-4 ring-orange-100 dark:bg-zinc-950 dark:text-orange-500 dark:ring-orange-950/40",
                    !done &&
                      !active &&
                      "border-zinc-200 bg-white text-zinc-400 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-500",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  title={`${n}. ${label}`}
                >
                  {done ? "✓" : n}
                </div>
                <span
                  className={[
                    "mt-2 hidden max-w-[6rem] text-center text-[11px] font-semibold leading-tight sm:block",
                    active ? "text-orange-700 dark:text-orange-400" : done ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-400",
                  ].join(" ")}
                >
                  {label}
                </span>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

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

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setError(null);
    setFirstName("");
    setLastName("");
    setEmail("");
    setRole("operations");
    setAccessScope("all");
    setSelectedSubIds([]);
  }, [open]);

  useEffect(() => {
    if (role === "admin") {
      setAccessScope("all");
      setSelectedSubIds([]);
    }
  }, [role]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onOpenChange]);

  const close = useCallback(() => {
    if (!pending) onOpenChange(false);
  }, [pending, onOpenChange]);

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
    if (role === "admin") return "All locations (admins always have full access).";
    if (accessScope === "all") return "All subcompany locations.";
    if (selectedSubIds.length === 0) return "—";
    const names = subcompanies.filter((s) => selectedSubIds.includes(s.id)).map((s) => s.name);
    return names.length ? names.join(", ") : `${selectedSubIds.length} location(s)`;
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
        onInvited?.();
        router.refresh();
        onOpenChange(false);
      })();
    });
  }, [email, firstName, lastName, role, accessScope, selectedSubIds, onOpenChange, onInvited, router]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[310] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
        aria-label="Close dialog"
        disabled={pending}
        onMouseDown={() => close()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-staff-title"
        className="relative z-[1] flex max-h-[min(90vh,52rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-zinc-200/90 px-6 pb-4 pt-6 dark:border-zinc-700 sm:px-10 sm:pt-10">
          <h2 id="invite-staff-title" className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Add staff
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Invite by email, choose their role, and set which locations they can see after they sign in.
          </p>
          <StepProgress step={step} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 sm:px-10">
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
                <select
                  id="invite-staff-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as CompanyMembershipRole)}
                  className={inputClass()}
                >
                  <option value="admin">Admin</option>
                  <option value="operations">Operations</option>
                  <option value="finance">Finance</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>

              {role === "admin" ? (
                <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-400">
                  Admins always have access to <span className="font-semibold text-zinc-800 dark:text-zinc-200">all</span>{" "}
                  subcompany locations.
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Subcompany access</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    They only see data for the locations you allow. You can change this later on the Staff page.
                  </p>
                  <fieldset className="space-y-2">
                    <legend className="sr-only">Location access</legend>
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
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">All locations</span>
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
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">Selected locations only</span>
                        <span className="block text-xs text-zinc-500 dark:text-zinc-400">Pick one or more subcompanies.</span>
                      </span>
                    </label>
                  </fieldset>
                  {accessScope === "explicit" ? (
                    <div className="border-l-2 border-zinc-200 pl-3 dark:border-zinc-600">
                      {subcompanies.length === 0 ? (
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                          No subcompanies exist yet. Register locations under Subcompany first, or choose &quot;All
                          locations&quot;.
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
                    <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Location access</dt>
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
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700 sm:px-10">
          <button type="button" className={btnGhost} disabled={pending} onClick={close}>
            Cancel
          </button>
          <div className="flex flex-wrap gap-3">
            {step > 0 ? (
              <button type="button" className={btnGhost} disabled={pending} onClick={() => setStep((s) => s - 1)}>
                Back
              </button>
            ) : null}
            {step < STEP_LABELS.length - 1 ? (
              <button
                type="button"
                className={btnContinue}
                disabled={pending || !canGoNext()}
                onClick={() => setStep((s) => Math.min(STEP_LABELS.length - 1, s + 1))}
              >
                Continue
              </button>
            ) : (
              <button type="button" className={btnContinue} disabled={pending} onClick={sendInvite}>
                {pending ? "Sending…" : "Send invite"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
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
