"use client";

import { useMemo, useState, useTransition } from "react";
import {
  saveVehicleOwnershipEventAction,
  type VehicleFinancialsPageData,
} from "@/app/actions/rental-vehicle-financials";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { VehiclePurchaseFormFields } from "@/components/fleet/vehicle-purchase-form-fields";
import { formatUkDate } from "@/lib/datetime/uk";
import { formatGbp, paymentMethodRequiresAccount, type PaymentMethodRow } from "@/lib/fleet/maintenance";
import { OWNERSHIP_EVENT_LABELS } from "@/lib/fleet/vehicles";
import {
  emptyPurchaseForm,
  purchaseFormFromEvent,
  purchaseFormsEqual,
  validatePurchaseEventForm,
  type PurchaseEventForm,
} from "@/lib/fleet/vehicle-purchase";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="rph-h1">Financials</h1>
          <p className="rph-muted mt-1 text-sm">
            Purchase and sale for capital P&L. Maintenance costs are included; hire income is not yet.
          </p>
        </div>
        {initial.canWrite && !isSold ? (
          <div className="rph-btn-toolbar">
            {!initial.purchase ? (
              <button type="button" className="rph-btn-ghost" onClick={openPurchase} disabled={busy}>
                Record purchase
              </button>
            ) : (
              <button type="button" className="rph-btn-ghost" onClick={openPurchase} disabled={busy}>
                Edit purchase
              </button>
            )}
            <button type="button" className="rph-btn-primary" onClick={openSale} disabled={busy || !!initial.sale}>
              Sell vehicle
            </button>
          </div>
        ) : null}
      </div>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      <div className="rph-card p-4">
        <p className="rph-meta font-semibold uppercase tracking-wide">Profit &amp; loss</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs text-rph-fg-muted">Purchase</dt>
            <dd className="mt-0.5 font-semibold text-rph-fg">
              {pnl.purchaseGbp != null ? formatGbp(pnl.purchaseGbp) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-rph-fg-muted">Sale</dt>
            <dd className="mt-0.5 font-semibold text-rph-fg">{pnl.saleGbp != null ? formatGbp(pnl.saleGbp) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-rph-fg-muted">Maintenance (total)</dt>
            <dd className="mt-0.5 font-semibold text-rph-fg">{formatGbp(pnl.maintenanceTotalGbp)}</dd>
          </div>
          <div>
            <dt className="text-xs text-rph-fg-muted">Hire income (approved)</dt>
            <dd className="mt-0.5 font-semibold text-rph-fg">{formatGbp(pnl.rentalIncomeGbp)}</dd>
          </div>
          <div>
            <dt className="text-xs text-rph-fg-muted">{pnl.isSold ? "Net P&L" : "Book position"}</dt>
            <dd className={`mt-0.5 text-lg font-semibold ${pnlTone(pnl.isSold ? pnl.netPnlGbp : pnl.bookPositionGbp)}`}>
              {pnl.isSold && pnl.netPnlGbp != null
                ? formatGbp(pnl.netPnlGbp)
                : pnl.bookPositionGbp != null
                  ? formatGbp(pnl.bookPositionGbp)
                  : "—"}
            </dd>
          </div>
          {pnl.isSold && pnl.capitalGainGbp != null ? (
            <div>
              <dt className="text-xs text-rph-fg-muted">Capital gain / loss</dt>
              <dd className={`mt-0.5 font-semibold ${pnlTone(pnl.capitalGainGbp)}`}>{formatGbp(pnl.capitalGainGbp)}</dd>
            </div>
          ) : null}
        </dl>
        <p className="rph-meta mt-3 text-xs">Operating P&amp;L excludes hire income until the rentals module ships.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rph-card p-4">
          <p className="rph-meta font-semibold uppercase tracking-wide">Purchase</p>
          {initial.purchase ? (
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-rph-fg-muted">Date</dt>
                <dd>{formatUkDate(initial.purchase.occurred_on)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-rph-fg-muted">Amount</dt>
                <dd className="font-semibold">{formatGbp(initial.purchase.amount_gbp)}</dd>
              </div>
              {initial.purchase.counterparty ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-rph-fg-muted">Seller</dt>
                  <dd>{initial.purchase.counterparty}</dd>
                </div>
              ) : null}
              {initial.purchase.payment_method_name ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-rph-fg-muted">Payment</dt>
                  <dd>
                    {initial.purchase.payment_method_name}
                    {initial.purchase.payment_account_name ? ` · ${initial.purchase.payment_account_name}` : ""}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="rph-muted mt-2 text-sm">No purchase recorded yet.</p>
          )}
        </div>

        <div className="rph-card p-4">
          <p className="rph-meta font-semibold uppercase tracking-wide">Sale</p>
          {initial.sale ? (
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-rph-fg-muted">Date</dt>
                <dd>{formatUkDate(initial.sale.occurred_on)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-rph-fg-muted">Amount</dt>
                <dd className="font-semibold">{formatGbp(initial.sale.amount_gbp)}</dd>
              </div>
              {initial.sale.counterparty ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-rph-fg-muted">Buyer</dt>
                  <dd>{initial.sale.counterparty}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="rph-muted mt-2 text-sm">{isSold ? "—" : "Not sold yet."}</p>
          )}
        </div>
      </div>

      {(initial.purchase || initial.sale) && (
        <div className="rph-card overflow-hidden">
          <p className="border-b border-rph-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">
            Ownership history
          </p>
          <ul className="divide-y divide-rph-border text-sm">
            {[initial.purchase, initial.sale]
              .filter(Boolean)
              .map((ev) => (
                <li key={ev!.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="font-medium text-rph-fg">{OWNERSHIP_EVENT_LABELS[ev!.event_type]}</span>
                  <span className="text-rph-fg-muted">{formatUkDate(ev!.occurred_on)}</span>
                  <span className="font-semibold">{formatGbp(ev!.amount_gbp)}</span>
                </li>
              ))}
          </ul>
        </div>
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
            <select
              className="rph-input"
              value={saleForm.payment_method_id}
              onChange={(e) => setSaleForm((f) => ({ ...f, payment_method_id: e.target.value }))}
            >
              <option value="">—</option>
              {activeMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          {paymentMethodRequiresAccount(saleMethod) ? (
            <Field label="Payment account">
              <select
                className="rph-input"
                value={saleForm.payment_account_id}
                onChange={(e) => setSaleForm((f) => ({ ...f, payment_account_id: e.target.value }))}
                required
              >
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
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
