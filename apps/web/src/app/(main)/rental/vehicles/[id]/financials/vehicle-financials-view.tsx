"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  saveVehicleOwnershipEventAction,
  type VehicleFinancialsPageData,
} from "@/app/actions/rental-vehicle-financials";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormModalSelect } from "@/components/forms/form-modal-select";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { VehiclePurchaseFormFields } from "@/components/fleet/vehicle-purchase-form-fields";
import { formatUkDate, formatUkDateTextLong } from "@/lib/datetime/uk";
import { formatGbp, paymentMethodRequiresAccount } from "@/lib/fleet/maintenance";
import { OWNERSHIP_EVENT_LABELS } from "@/lib/fleet/vehicles";
import {
  emptyPurchaseForm,
  purchaseFormFromEvent,
  purchaseFormsEqual,
  validatePurchaseEventForm,
  type PurchaseEventForm,
} from "@/lib/fleet/vehicle-purchase";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-rph-fg-muted">{label}</span>
      {children}
    </label>
  );
}

function pnlTone(value: number | null): string {
  if (value == null) return "text-rph-fg";
  if (value > 0) return "text-emerald-700 dark:text-emerald-300";
  if (value < 0) return "text-red-700 dark:text-red-300";
  return "text-rph-fg";
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "neutral" | "warn";
}) {
  const cls =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-200"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200"
        : "border-rph-border bg-rph-chrome text-rph-fg-secondary";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function PnlRow({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string | null;
  tone?: "income" | "cost" | "neutral";
}) {
  const valueClass =
    tone === "income"
      ? "text-rph-fg"
      : tone === "cost"
        ? "text-rph-fg-secondary"
        : "text-rph-fg";
  return (
    <div className="flex items-start justify-between gap-3 border-b border-rph-border py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-rph-fg-secondary">{label}</p>
        {hint ? <p className="mt-0.5 text-[11px] text-rph-fg-muted">{hint}</p> : null}
      </div>
      <p className={`shrink-0 text-sm font-semibold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function OwnershipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <dt className="text-sm text-rph-fg-muted">{label}</dt>
      <dd className="max-w-[65%] text-right text-sm font-medium text-rph-fg">{children}</dd>
    </div>
  );
}

function signedCostGbp(amount: number): string {
  if (amount <= 0.005) return formatGbp(0);
  return `−${formatGbp(amount)}`;
}

function hireIncomeHint(pnl: VehicleFinancialsPageData["pnl"]): string | null {
  const bits: string[] = [];
  if (pnl.rentalGrossIncomeGbp > pnl.rentalIncomeGbp + 0.005) {
    bits.push(`Rent ${formatGbp(pnl.rentalGrossIncomeGbp)}`);
  }
  if (pnl.rentalCollectionsGbp > 0.005) {
    bits.push(`${formatGbp(pnl.rentalCollectionsGbp)} settlement collected`);
  }
  if (pnl.rentalPrepaidExcludedGbp > 0.005) {
    bits.push(`${formatGbp(pnl.rentalPrepaidExcludedGbp)} prepaid after end excluded`);
  }
  if (pnl.rentalRefundsGbp > 0.005) {
    bits.push(`${formatGbp(pnl.rentalRefundsGbp)} refunded`);
  }
  if (pnl.rentalWriteOffsGbp > 0.005) {
    bits.push(`${formatGbp(pnl.rentalWriteOffsGbp)} written off`);
  }
  if (pnl.rentalDepositRetentionGbp > 0.005) {
    bits.push(`${formatGbp(pnl.rentalDepositRetentionGbp)} deposit retained`);
  }
  if (pnl.driverChargeIncomeGbp > 0.005) {
    bits.push(`${formatGbp(pnl.driverChargeIncomeGbp)} driver charges`);
  }
  return bits.length ? bits.join(" · ") : null;
}

export function VehicleFinancialsView({
  initial,
  onDataChange,
}: {
  initial: VehicleFinancialsPageData;
  onDataChange?: () => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [overlay, setOverlay] = useState<ActionStatusOverlayState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [saleConfirmOpen, setSaleConfirmOpen] = useState(false);
  const [purchaseDiscardConfirm, setPurchaseDiscardConfirm] = useState(false);
  const [saleDiscardConfirm, setSaleDiscardConfirm] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState<PurchaseEventForm>(() =>
    initial.purchase
      ? purchaseFormFromEvent(initial.purchase, initial.methods, initial.accounts)
      : emptyPurchaseForm(initial.methods, initial.accounts),
  );
  const [purchaseBaseline, setPurchaseBaseline] = useState<PurchaseEventForm | null>(null);
  const [saleForm, setSaleForm] = useState<PurchaseEventForm>(() => emptyPurchaseForm(initial.methods, initial.accounts));
  const [saleBaseline, setSaleBaseline] = useState<PurchaseEventForm | null>(null);

  const activeMethods = useMemo(() => initial.methods.filter((m) => m.is_active), [initial.methods]);
  const activeAccounts = useMemo(() => initial.accounts.filter((a) => a.is_active), [initial.accounts]);
  const purchaseMethod = useMemo(
    () => activeMethods.find((m) => m.id === purchaseForm.payment_method_id) ?? null,
    [activeMethods, purchaseForm.payment_method_id],
  );
  const saleMethod = useMemo(
    () => activeMethods.find((m) => m.id === saleForm.payment_method_id) ?? null,
    [activeMethods, saleForm.payment_method_id],
  );
  const purchaseDirty = purchaseBaseline ? !purchaseFormsEqual(purchaseForm, purchaseBaseline) : false;
  const saleDirty = saleBaseline ? !purchaseFormsEqual(saleForm, saleBaseline) : false;
  const busy = pending || overlay?.phase === "pending";
  const isSold = initial.vehicle.status === "sold" || initial.sale != null;
  const { pnl } = initial;

  const headlineValue = pnl.isSold ? pnl.netPnlGbp : pnl.bookPositionGbp;
  const headlineLabel = pnl.isSold ? "Net P&L" : "Book position";
  /** Pill: net/operating positive is good; book position negative (recovered) is good. */
  const contributionSign = pnl.isSold
    ? pnl.netPnlGbp
    : pnl.hasPurchase
      ? pnl.bookPositionGbp == null
        ? null
        : -pnl.bookPositionGbp
      : pnl.operatingResultGbp;
  const statusPill =
    contributionSign == null
      ? { label: "Incomplete", tone: "neutral" as const }
      : contributionSign > 0.005
        ? { label: "Positive", tone: "success" as const }
        : contributionSign < -0.005
          ? { label: "Negative", tone: "warn" as const }
          : { label: "Break even", tone: "neutral" as const };

  function openPurchase() {
    setError(null);
    const next = initial.purchase
      ? purchaseFormFromEvent(initial.purchase, initial.methods, initial.accounts)
      : emptyPurchaseForm(initial.methods, initial.accounts);
    setPurchaseForm(next);
    setPurchaseBaseline(next);
    setPurchaseOpen(true);
  }

  function openSale() {
    setError(null);
    const next = emptyPurchaseForm(initial.methods, initial.accounts);
    setSaleForm(next);
    setSaleBaseline(next);
    setSaleOpen(true);
  }

  function requestClosePurchase() {
    if (purchaseBaseline && !purchaseFormsEqual(purchaseForm, purchaseBaseline)) {
      setPurchaseDiscardConfirm(true);
      return;
    }
    setPurchaseOpen(false);
  }

  function requestCloseSale() {
    if (saleBaseline && !purchaseFormsEqual(saleForm, saleBaseline)) {
      setSaleDiscardConfirm(true);
      return;
    }
    setSaleOpen(false);
  }

  function submitPurchase() {
    setError(null);
    const validationError = validatePurchaseEventForm(purchaseForm, purchaseMethod);
    if (validationError) {
      setError(validationError);
      return;
    }
    startTransition(async () => {
      setOverlay({ phase: "pending", title: "Saving purchase…", detail: "Please wait." });
      const res = await saveVehicleOwnershipEventAction({
        vehicleId: initial.vehicle.id,
        eventType: "purchase",
        occurred_on: purchaseForm.occurred_on,
        amount_gbp: purchaseForm.amount_gbp,
        counterparty: purchaseForm.counterparty,
        payment_method_id: purchaseForm.payment_method_id || null,
        payment_account_id: purchaseForm.payment_account_id || null,
        payment_reference: purchaseForm.payment_reference,
        notes: purchaseForm.notes,
      });
      if (!res.ok) {
        setOverlay(null);
        setError(res.error);
        return;
      }
      setOverlay({ phase: "success", title: "Purchase saved", detail: "" });
      setPurchaseOpen(false);
      setPurchaseBaseline(null);
      await onDataChange?.();
    });
  }

  function submitSale() {
    setError(null);
    const validationError = validatePurchaseEventForm(saleForm, saleMethod);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (initial.vehicle.status === "on_rent") {
      setSaleConfirmOpen(true);
      return;
    }
    runSale();
  }

  function runSale() {
    setError(null);
    setSaleConfirmOpen(false);
    startTransition(async () => {
      setOverlay({ phase: "pending", title: "Recording sale…", detail: "Please wait." });
      const res = await saveVehicleOwnershipEventAction({
        vehicleId: initial.vehicle.id,
        eventType: "sale",
        occurred_on: saleForm.occurred_on,
        amount_gbp: saleForm.amount_gbp,
        counterparty: saleForm.counterparty,
        payment_method_id: saleForm.payment_method_id || null,
        payment_account_id: saleForm.payment_account_id || null,
        payment_reference: saleForm.payment_reference,
        notes: saleForm.notes,
      });
      if (!res.ok) {
        setOverlay(null);
        setError(res.error);
        return;
      }
      setOverlay({ phase: "success", title: "Vehicle marked as sold", detail: "" });
      setSaleOpen(false);
      setSaleBaseline(null);
      await onDataChange?.();
    });
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rph-card flex flex-col overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-rph-border px-4 py-4 sm:px-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-rph-link">
                Profit &amp; loss
              </p>
              <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-rph-fg">Lifetime summary</h2>
            </div>
            <StatusPill label={statusPill.label} tone={statusPill.tone} />
          </div>

          <div className="flex-1 px-4 sm:px-5">
            <PnlRow
              label="Hire income"
              value={formatGbp(pnl.rentalIncomeGbp)}
              hint={hireIncomeHint(pnl)}
              tone="income"
            />
            <PnlRow
              label="Purchase"
              value={pnl.purchaseGbp != null ? signedCostGbp(pnl.purchaseGbp) : "—"}
              tone="cost"
            />
            <PnlRow
              label="Maintenance"
              value={signedCostGbp(pnl.maintenanceTotalGbp)}
              tone="cost"
            />
            {pnl.isSold && pnl.saleGbp != null ? (
              <PnlRow label="Sale proceeds" value={formatGbp(pnl.saleGbp)} tone="income" />
            ) : null}
            {pnl.isSold && pnl.capitalGainGbp != null ? (
              <PnlRow
                label="Capital gain / loss"
                value={formatGbp(pnl.capitalGainGbp)}
                tone={pnl.capitalGainGbp >= 0 ? "income" : "cost"}
              />
            ) : null}
            <PnlRow
              label="Operating result"
              value={formatGbp(pnl.operatingResultGbp)}
              hint="Hire income − costs"
              tone={pnl.operatingResultGbp >= 0 ? "income" : "cost"}
            />
          </div>

          <div className="mt-auto border-t border-rph-border px-4 py-4 sm:px-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-rph-fg-muted">{headlineLabel}</p>
                <p className="mt-0.5 text-[11px] text-rph-fg-muted">
                  {pnl.isSold
                    ? "Sale − purchase − costs + hire income"
                    : pnl.hasPurchase
                      ? "Purchase + costs − hire income"
                      : "Record a purchase to see book position"}
                </p>
              </div>
              <p className={`text-xl font-semibold tabular-nums ${pnlTone(headlineValue)}`}>
                {headlineValue != null ? formatGbp(headlineValue) : "—"}
              </p>
            </div>
          </div>
        </section>

        <section className="rph-card flex flex-col overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-rph-border px-4 py-4 sm:px-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-rph-link">Ownership</p>
              <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-rph-fg">Purchase &amp; sale</h2>
            </div>
            {initial.canWrite && !isSold ? (
              <button
                type="button"
                className="text-sm font-medium text-rph-link hover:text-rph-link-hover"
                disabled={busy}
                onClick={openPurchase}
              >
                {initial.purchase ? "Edit purchase" : "Record purchase"}
              </button>
            ) : null}
          </div>

          <dl className="flex-1 px-4 py-2 sm:px-5">
            <OwnershipRow label="Purchase date">
              {initial.purchase ? formatUkDateTextLong(initial.purchase.occurred_on) : "—"}
            </OwnershipRow>
            <OwnershipRow label="Purchase price">
              {initial.purchase ? formatGbp(initial.purchase.amount_gbp) : "—"}
            </OwnershipRow>
            {initial.purchase?.counterparty ? (
              <OwnershipRow label="Seller">{initial.purchase.counterparty}</OwnershipRow>
            ) : null}
            {initial.purchase?.payment_method_name ? (
              <OwnershipRow label="Payment">
                {initial.purchase.payment_method_name}
                {initial.purchase.payment_account_name
                  ? ` · ${initial.purchase.payment_account_name}`
                  : ""}
              </OwnershipRow>
            ) : null}
            <OwnershipRow label="Sale status">
              {initial.sale ? (
                <>
                  Sold
                  <span className="mt-0.5 block text-xs font-normal text-rph-fg-muted">
                    {formatUkDateTextLong(initial.sale.occurred_on)} · {formatGbp(initial.sale.amount_gbp)}
                    {initial.sale.counterparty ? ` · ${initial.sale.counterparty}` : ""}
                  </span>
                </>
              ) : (
                "Not sold"
              )}
            </OwnershipRow>
          </dl>

          {initial.canWrite && !isSold ? (
            <div className="mt-auto flex flex-wrap justify-end gap-2 border-t border-rph-border px-4 py-3 sm:px-5">
              <button type="button" className="rph-btn-primary" disabled={busy || !!initial.sale} onClick={openSale}>
                Sell vehicle
              </button>
            </div>
          ) : null}
        </section>
      </div>

      {(initial.purchase || initial.sale) && (
        <section className="rph-card overflow-hidden">
          <p className="border-b border-rph-border px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-rph-link sm:px-5">
            Ownership history
          </p>
          <ul className="divide-y divide-rph-border text-sm">
            {[initial.purchase, initial.sale]
              .filter(Boolean)
              .map((ev) => (
                <li
                  key={ev!.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5"
                >
                  <span className="font-medium text-rph-fg">{OWNERSHIP_EVENT_LABELS[ev!.event_type]}</span>
                  <span className="text-rph-fg-muted">{formatUkDate(ev!.occurred_on)}</span>
                  <span className="font-semibold tabular-nums">{formatGbp(ev!.amount_gbp)}</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <FormModalShell
        open={purchaseOpen}
        titleId="purchase-form-title"
        title={initial.purchase ? "Edit purchase" : "Record purchase"}
        description="When your company bought this vehicle."
        showDraftActions={false}
        pending={busy}
        isDirty={purchaseDirty}
        maxWidthClass="max-w-2xl"
        onRequestClose={requestClosePurchase}
        discardConfirmOpen={purchaseDiscardConfirm}
        onConfirmDiscard={() => {
          setPurchaseDiscardConfirm(false);
          setPurchaseOpen(false);
          setPurchaseBaseline(null);
        }}
        onCancelDiscard={() => setPurchaseDiscardConfirm(false)}
        footer={
          <div className="rph-btn-modal-footer">
            <button type="button" className="rph-btn-primary" onClick={submitPurchase} disabled={busy}>
              Save purchase
            </button>
          </div>
        }
      >
        <VehiclePurchaseFormFields
          form={purchaseForm}
          onChange={setPurchaseForm}
          methods={initial.methods}
          accounts={initial.accounts}
          amountRequired
        />
      </FormModalShell>

      <FormModalShell
        open={saleOpen}
        titleId="sale-form-title"
        title="Sell vehicle"
        description="Records the sale and sets status to Sold."
        showDraftActions={false}
        pending={busy}
        isDirty={saleDirty}
        maxWidthClass="max-w-2xl"
        onRequestClose={requestCloseSale}
        discardConfirmOpen={saleDiscardConfirm}
        onConfirmDiscard={() => {
          setSaleDiscardConfirm(false);
          setSaleOpen(false);
          setSaleBaseline(null);
        }}
        onCancelDiscard={() => setSaleDiscardConfirm(false)}
        footer={
          <div className="rph-btn-modal-footer">
            <button type="button" className="rph-btn-primary" onClick={submitSale} disabled={busy}>
              Confirm sale
            </button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sale date">
            <input
              type="date"
              className="rph-input"
              value={saleForm.occurred_on}
              onChange={(e) => setSaleForm((f) => ({ ...f, occurred_on: e.target.value }))}
              required
            />
          </Field>
          <Field label="Amount (£)">
            <input
              type="number"
              min={0}
              step="0.01"
              className="rph-input"
              value={saleForm.amount_gbp}
              onChange={(e) => setSaleForm((f) => ({ ...f, amount_gbp: e.target.value }))}
              required
            />
          </Field>
          <Field label="Buyer (optional)">
            <input
              className="rph-input sm:col-span-2"
              value={saleForm.counterparty}
              onChange={(e) => setSaleForm((f) => ({ ...f, counterparty: e.target.value }))}
            />
          </Field>
          <Field label="Payment method (optional)">
            <FormModalSelect
              value={saleForm.payment_method_id || "__none__"}
              aria-label="Payment method"
              options={[
                { value: "__none__", label: "—" },
                ...activeMethods.map((m) => ({ value: m.id, label: m.name })),
              ]}
              onValueChange={(value) =>
                setSaleForm((f) => ({ ...f, payment_method_id: value === "__none__" ? "" : value }))
              }
            />
          </Field>
          {paymentMethodRequiresAccount(saleMethod) ? (
            <Field label="Payment account">
              <FormModalSelect
                value={saleForm.payment_account_id}
                aria-label="Payment account"
                options={activeAccounts.map((a) => ({ value: a.id, label: a.name }))}
                onValueChange={(value) =>
                  setSaleForm((f) => ({ ...f, payment_account_id: value }))
                }
              />
            </Field>
          ) : null}
          <Field label="Reference (optional)">
            <input
              className="rph-input"
              value={saleForm.payment_reference}
              onChange={(e) => setSaleForm((f) => ({ ...f, payment_reference: e.target.value }))}
            />
          </Field>
          <Field label="Notes (optional)">
            <textarea
              className="rph-input min-h-[4rem] sm:col-span-2"
              value={saleForm.notes}
              onChange={(e) => setSaleForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </Field>
        </div>
      </FormModalShell>

      <ConfirmDialog
        open={saleConfirmOpen}
        title="Vehicle is on rent"
        description="This vehicle is currently marked as on rent. Continue with the sale anyway?"
        confirmLabel="Sell anyway"
        onConfirm={runSale}
        onCancel={() => setSaleConfirmOpen(false)}
      />

      <ActionStatusOverlay state={overlay} onDismiss={() => setOverlay(null)} />
    </div>
  );
}
