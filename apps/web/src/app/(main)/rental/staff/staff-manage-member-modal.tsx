"use client";

import * as Select from "@radix-ui/react-select";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  setMembershipSubcompanyScopeAction,
  updateMembershipRoleAction,
  updateMembershipStatusAction,
} from "@/app/actions/rental-staff";
import type { CompanyMembershipRole } from "@/lib/auth/profile";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { useFormModalDraft } from "@/hooks/use-form-modal-draft";

export type StaffMember = {
  id: string;
  user_id: string;
  role: CompanyMembershipRole;
  subcompany_scope: "all" | "explicit";
  display_name: string | null;
  email: string | null;
  status: "active" | "invited" | "suspended";
  created_at: string;
};

const ROLES: CompanyMembershipRole[] = ["owner", "admin", "operations", "finance", "viewer"];

const STATUSES: { value: StaffMember["status"]; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "suspended", label: "Suspended" },
];

/** Popper below trigger, trailing edges aligned; z above modal (280) and confirm (300). */
const modalSelectTriggerClass =
  "flex h-10 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 shadow-sm outline-none transition-colors hover:border-slate-400 hover:bg-slate-50/80 focus:border-rph-rail focus:ring-2 focus:ring-rph-rail/20 data-[state=open]:border-rph-rail/70 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-800/80 dark:focus:border-rph-rail-softer dark:focus:ring-rph-rail-soft/30 dark:data-[state=open]:border-rph-rail-softer";

const modalSelectContentClass =
  "z-[320] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-900";

const modalSelectItemClass =
  "relative flex cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-3 text-sm text-slate-800 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800 dark:data-[highlighted]:text-slate-100";

const modalSelectItemIndicatorWrap =
  "absolute left-2 flex h-4 w-4 items-center justify-center text-slate-600 dark:text-slate-400";

function IconChevronDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

const btnPrimary =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-rph-rail bg-rph-rail px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-rph-rail-hover disabled:opacity-50 dark:border-rph-rail-soft dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer";

const tabBtn =
  "border-b-2 px-1 pb-2 text-sm font-medium transition-colors border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200";
const tabBtnActive =
  "border-b-2 px-1 pb-2 text-sm font-semibold transition-colors border-rph-rail text-rph-rail dark:border-rph-rail-soft dark:text-rph-rail-soft";

const btnSm =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

type Sub = { id: string; name: string; is_primary: boolean };

type RoleConfirmState = {
  membershipId: string;
  prevRole: CompanyMembershipRole;
  nextRole: CompanyMembershipRole;
  displayName: string;
  isSelf: boolean;
  confirmLastOwner: boolean;
};

function roleChangeDescription(
  prev: CompanyMembershipRole,
  next: CompanyMembershipRole,
  displayName: string,
  isSelf: boolean,
  ownerCount: number,
): { title: string; description: string; variant: "default" | "danger"; confirmLabel: string } {
  const who = isSelf ? "your" : `${displayName || "This user"}’s`;
  if (prev === "owner" && next !== "owner") {
    return {
      title: isSelf ? "Remove owner role from yourself?" : `Change ${displayName || "member"} from owner?`,
      description: isSelf
        ? ownerCount <= 1
          ? "You are the only owner. After this change, no one will have the owner role until you or support promotes someone again. Admins cannot assign the owner role to others—only owners can (or you can restore your own role to owner)."
          : "You will lose owner-only permissions (such as assigning the owner role to others) unless another owner grants them back."
        : `They will no longer be an owner. ${ownerCount <= 1 ? "This is the only owner account—confirm carefully." : ""}`,
      variant: ownerCount <= 1 ? "danger" : "default",
      confirmLabel: "Change role",
    };
  }
  if (next === "owner") {
    return {
      title: isSelf ? "Restore owner role?" : `Make ${displayName || "this user"} an owner?`,
      description: isSelf
        ? "You will have full owner permissions again, including assigning the owner role to others."
        : "Owners have full access to the company, all locations, and sensitive actions. Confirm this is intended.",
      variant: "default",
      confirmLabel: "Assign owner",
    };
  }
  return {
    title: `Change ${who} role?`,
    description: `Role will change from ${prev} to ${next}. This affects what they can see and do in this company.`,
    variant: "default",
    confirmLabel: "Update role",
  };
}

function subcompanyLine(s: Sub) {
  return (
    <span className="flex flex-wrap items-center gap-x-1.5">
      <span className="font-medium">{s.name}</span>
      {s.is_primary ? (
        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0 text-[10px] font-semibold text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/35 dark:text-indigo-100">
          Main
        </span>
      ) : null}
    </span>
  );
}

/** What is saved in the database right now (not the in-progress editor state). */
function CurrentAccessCallout({
  member,
  savedSubIds,
  subcompanies,
}: {
  member: StaffMember;
  savedSubIds: string[];
  subcompanies: Sub[];
}) {
  const byId = new Map(subcompanies.map((s) => [s.id, s]));
  const uniqueSaved = [...new Set(savedSubIds)];

  if (member.role === "owner" || member.role === "admin") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/50">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Current access</p>
        <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">Full access to every location (owner / admin).</p>
        {subcompanies.length > 0 ? (
          <>
            <p className="mt-3 text-xs font-medium text-slate-600 dark:text-slate-400">Locations in this company</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {subcompanies.map((s) => (
                <li key={s.id} className="text-sm text-slate-800 dark:text-slate-200">
                  {subcompanyLine(s)}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No subcompanies registered yet.</p>
        )}
      </div>
    );
  }

  if (member.subcompany_scope === "all") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/50">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Current access</p>
        <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">All locations — can open every subcompany below.</p>
        {subcompanies.length > 0 ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {subcompanies.map((s) => (
              <li key={s.id} className="text-sm text-slate-800 dark:text-slate-200">
                {subcompanyLine(s)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  if (uniqueSaved.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200/80 bg-amber-50/60 px-4 py-3 dark:border-amber-900/45 dark:bg-amber-950/25">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">Current access</p>
        <p className="mt-1 text-sm text-amber-950 dark:text-amber-100">
          No specific locations are saved yet. Their scope is set to selected locations only — choose at least one below and
          save.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-200">Current access</p>
      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">They can open these locations after sign-in:</p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {uniqueSaved.map((id) => {
          const s = byId.get(id);
          return (
            <li key={id} className="text-sm text-slate-900 dark:text-slate-100">
              {s ? subcompanyLine(s) : <span className="font-medium text-amber-800 dark:text-amber-200">Unknown location ({id.slice(0, 8)}…)</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type TabId = "status" | "role" | "access";

export function StaffManageMemberModal({
  open,
  onOpenChange,
  member,
  savedSubcompanyIds,
  subcompanies,
  currentUserId,
  ownerCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: StaffMember | null;
  savedSubcompanyIds: string[];
  subcompanies: Sub[];
  currentUserId: string;
  ownerCount: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("access");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [localStatus, setLocalStatus] = useState<StaffMember["status"]>("active");
  const [localRole, setLocalRole] = useState<CompanyMembershipRole>("viewer");
  const [accessMode, setAccessMode] = useState<"all" | "explicit">("all");
  const [selectedSubs, setSelectedSubs] = useState<string[]>([]);

  const [roleConfirm, setRoleConfirm] = useState<RoleConfirmState | null>(null);
  const [lastOwnerConfirm, setLastOwnerConfirm] = useState<RoleConfirmState | null>(null);

  type ManageSnapshot = {
    tab: TabId;
    localStatus: StaffMember["status"];
    accessMode: "all" | "explicit";
    selectedSubs: string[];
  };

  const baseline = useMemo<ManageSnapshot>(() => {
    if (!member) {
      return { tab: "access", localStatus: "active", accessMode: "all", selectedSubs: [] };
    }
    const explicit = [...new Set(savedSubcompanyIds)].sort();
    const hasExplicit = explicit.length > 0;
    return {
      tab: "access",
      localStatus: member.status,
      accessMode: member.subcompany_scope === "explicit" || hasExplicit ? "explicit" : "all",
      selectedSubs: explicit,
    };
  }, [member, savedSubcompanyIds]);

  const snapshot = useMemo<ManageSnapshot>(
    () => ({
      tab,
      localStatus,
      accessMode,
      selectedSubs: [...selectedSubs].sort(),
    }),
    [tab, localStatus, accessMode, selectedSubs],
  );

  const applySnapshot = useCallback((s: ManageSnapshot) => {
    setTab(s.tab);
    setLocalStatus(s.localStatus);
    setAccessMode(s.accessMode);
    setSelectedSubs(s.selectedSubs);
    setError(null);
    setOk(null);
    setRoleConfirm(null);
    setLastOwnerConfirm(null);
  }, []);

  const draftKey = member ? `staff-manage:${member.id}` : "staff-manage:none";

  const {
    saveNotice,
    hasStoredDraft,
    isDirty,
    saveProgress,
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
    draftKey,
    open: open && Boolean(member),
    snapshot,
    baseline,
    pending,
    applySnapshot,
    onClose: () => onOpenChange(false),
  });

  useEffect(() => {
    if (!open) return;
    setRoleConfirm(null);
    setLastOwnerConfirm(null);
  }, [open, member?.id]);

  // Keep localRole synced to server member (role edits go through confirm, not draft).
  useEffect(() => {
    if (!member) return;
    setLocalRole(member.role);
  }, [member]);

  const runRoleUpdate = useCallback(
    (state: RoleConfirmState) => {
      setError(null);
      setOk(null);
      startTransition(() => {
        void (async () => {
          const res = await updateMembershipRoleAction(state.membershipId, state.nextRole, {
            confirmDemoteLastOwner: state.confirmLastOwner,
          });
          if (!res.ok) {
            if ("code" in res && res.code === "LAST_OWNER_CONFIRM") {
              setRoleConfirm(null);
              setLastOwnerConfirm({ ...state, confirmLastOwner: false });
              return;
            }
            setError(res.error);
            setRoleConfirm(null);
            setLastOwnerConfirm(null);
            return;
          }
          setOk("Role updated.");
          setRoleConfirm(null);
          setLastOwnerConfirm(null);
          router.refresh();
        })();
      });
    },
    [router],
  );

  const onRoleSelectChange = useCallback(
    (next: CompanyMembershipRole) => {
      if (!member || next === member.role) return;
      setError(null);
      setOk(null);
      setLocalRole(member.role);
      setRoleConfirm({
        membershipId: member.id,
        prevRole: member.role,
        nextRole: next,
        displayName: member.display_name?.trim() || "User",
        isSelf: member.user_id === currentUserId,
        confirmLastOwner: false,
      });
    },
    [member, currentUserId],
  );

  const saveStatus = useCallback(() => {
    if (!member || localStatus === member.status) return;
    setError(null);
    setOk(null);
    startTransition(() => {
      void (async () => {
        const res = await updateMembershipStatusAction(member.id, localStatus);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setOk("Status updated.");
        clearAfterSuccess();
        router.refresh();
      })();
    });
  }, [member, localStatus, router, clearAfterSuccess]);

  const saveAccess = useCallback(() => {
    if (!member || member.role === "owner" || member.role === "admin") return;
    setError(null);
    setOk(null);
    const explicitIds = accessMode === "all" ? [] : [...new Set(selectedSubs)];
    const scope: "all" | "explicit" = accessMode === "all" ? "all" : "explicit";
    startTransition(() => {
      void (async () => {
        const res = await setMembershipSubcompanyScopeAction(member.id, scope, explicitIds);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setOk("Access updated.");
        clearAfterSuccess();
        router.refresh();
      })();
    });
  }, [member, accessMode, selectedSubs, router, clearAfterSuccess]);

  const toggleSub = useCallback((subId: string) => {
    setSelectedSubs((cur) => {
      const has = cur.includes(subId);
      const next = has ? cur.filter((x) => x !== subId) : [...cur, subId];
      return [...new Set(next)];
    });
  }, []);

  if (!member) return null;

  const roleBlocked = member.role === "owner" && member.user_id !== currentUserId;
  const roleDialogMeta =
    roleConfirm &&
    roleChangeDescription(
      roleConfirm.prevRole,
      roleConfirm.nextRole,
      roleConfirm.displayName,
      roleConfirm.isSelf,
      ownerCount,
    );

  const statusDirty = localStatus !== member.status;
  const accessReadOnly = member.role === "owner" || member.role === "admin";

  return (
    <>
      <FormModalShell
        open={open}
        titleId="staff-manage-title"
        title={member.display_name?.trim() || "Team member"}
        description={
          <>
            {member.email ?? "Email unavailable"}
            <span className="mx-2 text-slate-400">·</span>
            <span className="capitalize">{member.role}</span>
            <span className="mx-2 text-slate-400">·</span>
            <span className="capitalize">{member.status}</span>
          </>
        }
        headerExtra={
          <div className="mt-4 flex gap-4">
            <button type="button" className={tab === "status" ? tabBtnActive : tabBtn} onClick={() => setTab("status")}>
              Status
            </button>
            <button type="button" className={tab === "role" ? tabBtnActive : tabBtn} onClick={() => setTab("role")}>
              Role
            </button>
            <button type="button" className={tab === "access" ? tabBtnActive : tabBtn} onClick={() => setTab("access")}>
              Access
            </button>
          </div>
        }
        pending={pending}
        zClass="z-[280]"
        maxWidthClass="max-w-2xl"
        panelClassName="relative z-[1] flex h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        saveNotice={saveNotice}
        hasStoredDraft={hasStoredDraft}
        isDirty={isDirty}
        onSaveProgress={saveProgress}
        onRequestClose={requestClose}
        onRequestStartFresh={requestStartFresh}
        discardConfirmOpen={discardConfirmOpen}
        onConfirmDiscard={confirmDiscardClose}
        onCancelDiscard={cancelDiscardClose}
        startFreshConfirmOpen={startFreshConfirmOpen}
        onConfirmStartFresh={confirmStartFresh}
        onCancelStartFresh={cancelStartFresh}
        footer={
          <button
            type="button"
            className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            disabled={pending}
            onClick={requestClose}
          >
            Close
          </button>
        }
      >
              {error ? <p className="rph-alert-error mb-3 text-sm">{error}</p> : null}
              {ok ? (
                <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/35 dark:text-emerald-100">
                  {ok}
                </p>
              ) : null}

              {tab === "status" ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Active members can sign in. Invited accounts are pending acceptance. Suspended members cannot access this
                    company.
                  </p>
                  <div className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200">Membership status</span>
                    <Select.Root
                      value={localStatus}
                      disabled={pending || roleBlocked}
                      onValueChange={(v) => setLocalStatus(v as StaffMember["status"])}
                    >
                      <Select.Trigger
                        className={modalSelectTriggerClass}
                        title={roleBlocked ? "You cannot change another owner’s status." : undefined}
                        aria-label="Membership status"
                      >
                        <Select.Value />
                        <Select.Icon className="shrink-0 text-slate-500 dark:text-slate-400">
                          <IconChevronDown />
                        </Select.Icon>
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content
                          className={modalSelectContentClass}
                          position="popper"
                          side="bottom"
                          align="end"
                          sideOffset={6}
                          alignOffset={0}
                          collisionPadding={12}
                        >
                          <Select.Viewport className="px-1">
                            {STATUSES.map((s) => (
                              <Select.Item key={s.value} value={s.value} className={modalSelectItemClass}>
                                <span className={modalSelectItemIndicatorWrap}>
                                  <Select.ItemIndicator>
                                    <IconCheck />
                                  </Select.ItemIndicator>
                                </span>
                                <Select.ItemText>{s.label}</Select.ItemText>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  </div>
                  <button type="button" className={btnPrimary} disabled={pending || !statusDirty || roleBlocked} onClick={saveStatus}>
                    Save status
                  </button>
                </div>
              ) : null}

              {tab === "role" ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Role changes take effect immediately after you confirm. Owners and admins always have access to all
                    locations.
                  </p>
                  <div className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200">Role</span>
                    <Select.Root
                      value={roleBlocked ? member.role : localRole}
                      disabled={pending || roleBlocked}
                      onValueChange={(v) => onRoleSelectChange(v as CompanyMembershipRole)}
                    >
                      <Select.Trigger
                        className={modalSelectTriggerClass}
                        title={
                          roleBlocked ? "Only that user (or an owner) can change their owner role." : undefined
                        }
                        aria-label="Role"
                      >
                        <Select.Value className="capitalize" />
                        <Select.Icon className="shrink-0 text-slate-500 dark:text-slate-400">
                          <IconChevronDown />
                        </Select.Icon>
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content
                          className={modalSelectContentClass}
                          position="popper"
                          side="bottom"
                          align="end"
                          sideOffset={6}
                          alignOffset={0}
                          collisionPadding={12}
                        >
                          <Select.Viewport className="px-1">
                            {ROLES.map((r) => (
                              <Select.Item key={r} value={r} className={modalSelectItemClass}>
                                <span className={modalSelectItemIndicatorWrap}>
                                  <Select.ItemIndicator>
                                    <IconCheck />
                                  </Select.ItemIndicator>
                                </span>
                                <Select.ItemText className="capitalize">{r}</Select.ItemText>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  </div>
                </div>
              ) : null}

              {tab === "access" ? (
                <div className="space-y-4">
                  {accessReadOnly ? (
                    <CurrentAccessCallout member={member} savedSubIds={savedSubcompanyIds} subcompanies={subcompanies} />
                  ) : (
                    <>
                      <CurrentAccessCallout member={member} savedSubIds={savedSubcompanyIds} subcompanies={subcompanies} />
                      <div className="border-t border-slate-200 pt-4 dark:border-slate-600">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Change access</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Choose all locations or pick specific subcompanies. Save applies your full selection.
                        </p>
                      </div>
                      <fieldset className="space-y-2">
                        <legend className="sr-only">Location access</legend>
                        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <input
                            type="radio"
                            className="mt-1"
                            checked={accessMode === "all"}
                            onChange={() => {
                              setAccessMode("all");
                              setSelectedSubs([]);
                            }}
                          />
                          <span>
                            <span className="font-medium text-slate-900 dark:text-slate-100">All locations</span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400">Company-wide visibility.</span>
                          </span>
                        </label>
                        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <input
                            type="radio"
                            className="mt-1"
                            checked={accessMode === "explicit"}
                            onChange={() => setAccessMode("explicit")}
                          />
                          <span>
                            <span className="font-medium text-slate-900 dark:text-slate-100">Selected locations only</span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400">Tick subcompanies below, then save.</span>
                          </span>
                        </label>
                      </fieldset>
                      {accessMode === "explicit" ? (
                        <div className="grid gap-2 border-l-2 border-slate-200 pl-3 sm:grid-cols-2 dark:border-slate-600">
                          {subcompanies.length === 0 ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400 sm:col-span-2">No subcompanies yet.</p>
                          ) : (
                            subcompanies.map((s) => (
                              <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                                <input type="checkbox" checked={selectedSubs.includes(s.id)} onChange={() => toggleSub(s.id)} />
                                <span>{subcompanyLine(s)}</span>
                              </label>
                            ))
                          )}
                        </div>
                      ) : null}
                      <button type="button" disabled={pending} onClick={saveAccess} className={btnSm}>
                        Save access
                      </button>
                    </>
                  )}
                </div>
              ) : null}
      </FormModalShell>

      {roleConfirm && roleDialogMeta ? (
        <ConfirmDialog
          open
          title={roleDialogMeta.title}
          description={roleDialogMeta.description}
          confirmLabel={roleDialogMeta.confirmLabel}
          variant={roleDialogMeta.variant}
          pending={pending}
          onCancel={() => setRoleConfirm(null)}
          onConfirm={() => {
            if (!roleConfirm) return;
            runRoleUpdate(roleConfirm);
          }}
        />
      ) : null}

      {lastOwnerConfirm ? (
        <ConfirmDialog
          open
          title="Leave the company without any owner?"
          description="You confirmed changing the only owner’s role. After this, no active user will have the owner role. You can still restore your own account to owner from the role menu if you are demoting yourself, or contact support. Proceed only if you understand this."
          confirmLabel="Demote last owner"
          variant="danger"
          pending={pending}
          onCancel={() => setLastOwnerConfirm(null)}
          onConfirm={() => {
            const s = lastOwnerConfirm;
            setLastOwnerConfirm(null);
            runRoleUpdate({ ...s, confirmLastOwner: true });
          }}
        />
      ) : null}
    </>
  );
}
