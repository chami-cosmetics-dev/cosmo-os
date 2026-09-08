"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  CITYPAK_DEFAULT_WEIGHT_G,
  getCitypakSender,
  toCitypakPhone,
  type CitypakShipmentOverride,
} from "@/lib/citypak-api";

export type CitypakAccountOption = {
  id: string;
  label: string;
  invoicePrefix: string;
  accountId: string;
};

export type CitypakReviewRow = {
  orderId: string;
  ref: string;
  draft: CitypakShipmentOverride;
};

export type CitypakManualConfirm = CitypakShipmentOverride & {
  reference: string;
  citypakAccountDbId: string;
};

export type CitypakReviewConfirm = {
  orderShipments: Array<CitypakShipmentOverride & { orderId: string }>;
  manualShipments: CitypakManualConfirm[];
};

type ManualRow = {
  id: string;
  reference: string;
  citypakAccountDbId: string;
  draft: CitypakShipmentOverride;
};

function emptyDraft(): CitypakShipmentOverride {
  return {
    receiverName: "",
    receiverAddress1: "",
    receiverAddress2: "",
    receiverCity: "",
    receiverPhone: "",
    cashOnDeliveryAmount: 0,
  };
}

function shipmentValid(row: CitypakShipmentOverride) {
  return (
    row.receiverName.trim().length > 0 &&
    row.receiverAddress1.trim().length > 0 &&
    row.receiverCity.trim().length > 0 &&
    toCitypakPhone(row.receiverPhone).length >= 9
  );
}

function formatCod(amount?: number) {
  const value = amount ?? 0;
  if (value === 0) return "0 (prepaid / no COD)";
  return value.toLocaleString("en-LK", { minimumFractionDigits: 2 });
}

function displayOrMissing(value: string) {
  return value.trim() ? value.trim() : "—";
}

export function CitypakShipmentReview({
  rows,
  accounts = [],
  allowManual = false,
  confirming,
  onConfirm,
  onCancel,
}: {
  rows: CitypakReviewRow[];
  accounts?: CitypakAccountOption[];
  allowManual?: boolean;
  confirming?: boolean;
  onConfirm: (payload: CitypakReviewConfirm) => void;
  onCancel?: () => void;
}) {
  const [edits, setEdits] = useState<Record<string, CitypakShipmentOverride>>({});
  const [manuals, setManuals] = useState<ManualRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const sender = getCitypakSender();
  const rowKey = useMemo(() => rows.map((row) => row.orderId).join(","), [rows]);

  useEffect(() => {
    setEdits(Object.fromEntries(rows.map((row) => [row.orderId, { ...row.draft }])));
    setEditingId(null);
  }, [rowKey]);

  const invalidOrderIds = new Set(
    rows
      .filter((row) => {
        const edit = edits[row.orderId];
        return !edit || !shipmentValid(edit);
      })
      .map((row) => row.orderId)
  );

  const invalidManualIds = new Set(
    manuals
      .filter(
        (row) =>
          !row.reference.trim() ||
          !row.citypakAccountDbId ||
          !shipmentValid(row.draft)
      )
      .map((row) => row.id)
  );

  function patch(orderId: string, next: Partial<CitypakShipmentOverride>) {
    setEdits((prev) => {
      const current = prev[orderId];
      if (!current) return prev;
      return { ...prev, [orderId]: { ...current, ...next } };
    });
  }

  function patchManual(id: string, next: Partial<ManualRow> | { draft: Partial<CitypakShipmentOverride> }) {
    setManuals((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        if ("draft" in next && next.draft) {
          return { ...row, draft: { ...row.draft, ...next.draft } };
        }
        return { ...row, ...(next as Partial<ManualRow>) };
      })
    );
  }

  function addManual() {
    const id = `manual-${Date.now()}`;
    setManuals((prev) => [
      ...prev,
      {
        id,
        reference: "",
        citypakAccountDbId: accounts[0]?.id ?? "",
        draft: emptyDraft(),
      },
    ]);
    setEditingId(id);
  }

  function confirm() {
    onConfirm({
      orderShipments: rows.flatMap((row) => {
        const edit = edits[row.orderId];
        return edit ? [{ orderId: row.orderId, ...edit }] : [];
      }),
      manualShipments: manuals.map((row) => ({
        ...row.draft,
        reference: row.reference.trim(),
        citypakAccountDbId: row.citypakAccountDbId,
      })),
    });
  }

  const totalCount = rows.length + manuals.length;
  const canSend =
    totalCount > 0 &&
    invalidOrderIds.size === 0 &&
    invalidManualIds.size === 0 &&
    editingId === null &&
    !confirming;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">CityPak payload — inspect before send</p>
        <p className="text-xs text-muted-foreground">
          From {sender.name}, {sender.city} · {sender.description} · {CITYPAK_DEFAULT_WEIGHT_G}g · 1 piece.
          Order rows come from selected SIs. Add a manual row for shop-to-shop (no invoice).
        </p>
      </div>
      <div className="overflow-x-auto rounded-md border border-border/70">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Invoice / ref</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Address</th>
              <th className="px-3 py-2 font-medium">City</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium text-right">COD</th>
              <th className="px-3 py-2 font-medium text-right"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const edit = edits[row.orderId];
              if (!edit) return null;
              const missing = invalidOrderIds.has(row.orderId);
              const isEditing = editingId === row.orderId;
              return (
                <tr
                  key={row.orderId}
                  className={`border-t border-border/60 align-top ${missing ? "bg-amber-500/10" : "bg-background"}`}
                >
                  {isEditing ? (
                    <td colSpan={7} className="px-3 py-3">
                      <p className="mb-2 text-sm font-medium">{row.ref}</p>
                      <ReceiverFields
                        value={edit}
                        onChange={(next) => patch(row.orderId, next)}
                      />
                      <div className="mt-3 flex justify-end">
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)}>
                          Done
                        </Button>
                      </div>
                    </td>
                  ) : (
                    <InspectCells
                      refLabel={row.ref}
                      draft={edit}
                      confirming={confirming}
                      onEdit={() => setEditingId(row.orderId)}
                    />
                  )}
                </tr>
              );
            })}
            {manuals.map((row) => {
              const missing = invalidManualIds.has(row.id);
              const isEditing = editingId === row.id;
              const accountLabel =
                accounts.find((account) => account.id === row.citypakAccountDbId)?.label ?? "Account";
              return (
                <tr
                  key={row.id}
                  className={`border-t border-border/60 align-top ${missing ? "bg-amber-500/10" : "bg-background"}`}
                >
                  {isEditing ? (
                    <td colSpan={7} className="px-3 py-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">Manual CityPak (no SI)</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => {
                            setManuals((prev) => prev.filter((item) => item.id !== row.id));
                            setEditingId(null);
                          }}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                          Remove
                        </Button>
                      </div>
                      <div className="mb-2 grid gap-2 sm:grid-cols-2">
                        <label className="space-y-1 text-xs text-muted-foreground">
                          Reference
                          <Input
                            value={row.reference}
                            placeholder="e.g. Shop transfer Nugegoda"
                            onChange={(event) => patchManual(row.id, { reference: event.target.value })}
                            maxLength={64}
                          />
                        </label>
                        <label className="space-y-1 text-xs text-muted-foreground">
                          CityPak account
                          <select
                            value={row.citypakAccountDbId}
                            onChange={(event) => patchManual(row.id, { citypakAccountDbId: event.target.value })}
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                          >
                            <option value="">Select account…</option>
                            {accounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.label} ({account.invoicePrefix})
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <ReceiverFields
                        value={row.draft}
                        onChange={(next) => patchManual(row.id, { draft: next })}
                      />
                      <div className="mt-3 flex justify-end">
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)}>
                          Done
                        </Button>
                      </div>
                    </td>
                  ) : (
                    <InspectCells
                      refLabel={`${row.reference || "Manual"} · ${accountLabel}`}
                      draft={row.draft}
                      confirming={confirming}
                      onEdit={() => setEditingId(row.id)}
                    />
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && manuals.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  No CityPak rows yet. Add a manual row for shop-to-shop, or select orders first.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {allowManual && (
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addManual} disabled={confirming}>
          <Plus className="size-3.5" aria-hidden />
          Add manual CityPak row
        </Button>
      )}
      {(invalidOrderIds.size > 0 || invalidManualIds.size > 0) && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Fix missing name, address, city, phone
          {allowManual ? ", reference, or CityPak account" : ""}.
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={confirming}>
            Back
          </Button>
        )}
        <Button type="button" disabled={!canSend} onClick={confirm}>
          Send {totalCount} to CityPak
        </Button>
      </div>
    </div>
  );
}

function ReceiverFields({
  value,
  onChange,
}: {
  value: CitypakShipmentOverride;
  onChange: (next: Partial<CitypakShipmentOverride>) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="space-y-1 text-xs text-muted-foreground">
        Name
        <Input
          value={value.receiverName}
          onChange={(event) => onChange({ receiverName: event.target.value })}
          maxLength={80}
        />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Phone
        <Input
          value={value.receiverPhone}
          onChange={(event) => onChange({ receiverPhone: event.target.value })}
          maxLength={20}
        />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
        Address
        <Input
          value={value.receiverAddress1}
          onChange={(event) => onChange({ receiverAddress1: event.target.value })}
          maxLength={120}
        />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Address 2
        <Input
          value={value.receiverAddress2}
          onChange={(event) => onChange({ receiverAddress2: event.target.value })}
          maxLength={120}
        />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        City
        <Input
          value={value.receiverCity}
          onChange={(event) => onChange({ receiverCity: event.target.value })}
          maxLength={80}
        />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        COD amount
        <Input
          type="number"
          min={0}
          step="0.01"
          value={value.cashOnDeliveryAmount ?? 0}
          onChange={(event) =>
            onChange({ cashOnDeliveryAmount: Number.parseFloat(event.target.value) || 0 })
          }
        />
      </label>
    </div>
  );
}

function InspectCells({
  refLabel,
  draft,
  confirming,
  onEdit,
}: {
  refLabel: string;
  draft: CitypakShipmentOverride;
  confirming?: boolean;
  onEdit: () => void;
}) {
  return (
    <>
      <td className="px-3 py-2 font-medium whitespace-nowrap">{refLabel}</td>
      <td className={`px-3 py-2 ${draft.receiverName.trim() ? "" : "text-destructive"}`}>
        {displayOrMissing(draft.receiverName)}
      </td>
      <td className={`px-3 py-2 ${draft.receiverAddress1.trim() ? "" : "text-destructive"}`}>
        {[draft.receiverAddress1, draft.receiverAddress2].filter((part) => part.trim()).join(", ") || "—"}
      </td>
      <td className={`px-3 py-2 ${draft.receiverCity.trim() ? "" : "text-destructive"}`}>
        {displayOrMissing(draft.receiverCity)}
      </td>
      <td className={`px-3 py-2 whitespace-nowrap ${toCitypakPhone(draft.receiverPhone).length >= 9 ? "" : "text-destructive"}`}>
        {displayOrMissing(draft.receiverPhone)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
        {formatCod(draft.cashOnDeliveryAmount)}
      </td>
      <td className="px-3 py-2 text-right">
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={onEdit} disabled={confirming}>
          <Pencil className="size-3.5" aria-hidden />
          Edit
        </Button>
      </td>
    </>
  );
}

export function CitypakShipmentReviewDialog({
  open,
  rows,
  confirming,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  rows: CitypakReviewRow[];
  confirming?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (shipments: Array<CitypakShipmentOverride & { orderId: string }>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review CityPak shipments</DialogTitle>
          <DialogDescription>
            Check the payload, edit a row if needed, then send. Nothing goes to CityPak until you confirm.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <CitypakShipmentReview
            rows={rows}
            confirming={confirming}
            onCancel={() => onOpenChange(false)}
            onConfirm={(payload) => onConfirm(payload.orderShipments)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
