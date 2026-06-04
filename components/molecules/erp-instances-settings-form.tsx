"use client";

import { useState, useEffect } from "react";
import { Loader2, Pencil, Plug, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useConfirmationDialog } from "@/components/providers/confirmation-dialog-provider";
import { notify } from "@/lib/notify";

type ErpInstance = {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  incomingWebhookSecret: string | null;
  cashMop: string | null;
  codMop: string | null;
  cardDeliveryMop: string | null;
  bankTransferMop: string | null;
  kokoMop: string | null;
  webxpayMop: string | null;
  taxesAndCharges: string | null;
  shippingRule: string | null;
  shippingItem: string | null;
  shippingChargeAccount: string | null;
  createdAt: string;
  _count: { locations: number };
};

type InstanceForm = {
  label: string;
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  incomingWebhookSecret: string;
  cashMop: string;
  codMop: string;
  cardDeliveryMop: string;
  bankTransferMop: string;
  kokoMop: string;
  webxpayMop: string;
  taxesAndCharges: string;
  shippingRule: string;
  shippingItem: string;
  shippingChargeAccount: string;
};

const emptyForm = (): InstanceForm => ({
  label: "",
  baseUrl: "",
  apiKey: "",
  apiSecret: "",
  incomingWebhookSecret: "",
  cashMop: "Cash",
  codMop: "Cash On Delivery",
  cardDeliveryMop: "Credit Card",
  bankTransferMop: "Wire Transfer",
  kokoMop: "Koko",
  webxpayMop: "",
  taxesAndCharges: "",
  shippingRule: "",
  shippingItem: "",
  shippingChargeAccount: "",
});

interface ErpInstancesSettingsFormProps {
  canEdit: boolean;
}

export function ErpInstancesSettingsForm({ canEdit }: ErpInstancesSettingsFormProps) {
  const { confirm } = useConfirmationDialog();
  const [instances, setInstances] = useState<ErpInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const isBusy = busyKey !== null;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InstanceForm>(emptyForm());
  const [savedForm, setSavedForm] = useState<InstanceForm>(emptyForm());

  const sheetHasChanges =
    form.label.trim() !== savedForm.label.trim() ||
    form.baseUrl.trim() !== savedForm.baseUrl.trim() ||
    form.apiKey.trim() !== savedForm.apiKey.trim() ||
    form.apiSecret.trim() !== "" ||
    form.incomingWebhookSecret.trim() !== savedForm.incomingWebhookSecret.trim() ||
    form.cashMop.trim() !== savedForm.cashMop.trim() ||
    form.codMop.trim() !== savedForm.codMop.trim() ||
    form.cardDeliveryMop.trim() !== savedForm.cardDeliveryMop.trim() ||
    form.bankTransferMop.trim() !== savedForm.bankTransferMop.trim() ||
    form.kokoMop.trim() !== savedForm.kokoMop.trim() ||
    form.webxpayMop.trim() !== savedForm.webxpayMop.trim() ||
    form.taxesAndCharges.trim() !== savedForm.taxesAndCharges.trim() ||
    form.shippingRule.trim() !== savedForm.shippingRule.trim() ||
    form.shippingItem.trim() !== savedForm.shippingItem.trim() ||
    form.shippingChargeAccount.trim() !== savedForm.shippingChargeAccount.trim();

  function setField(key: keyof InstanceForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    fetchInstances();
  }, []);

  async function fetchInstances() {
    try {
      const res = await fetch("/api/admin/company/erp-instances");
      if (!res.ok) {
        notify.error("Failed to load ERP instances");
        return;
      }
      const data = (await res.json()) as ErpInstance[];
      setInstances(data);
    } catch {
      notify.error("Failed to load ERP instances");
    } finally {
      setLoading(false);
    }
  }

  function openAddSheet() {
    const f = emptyForm();
    setForm(f);
    setSavedForm(f);
    setSheetMode("add");
    setEditingId(null);
    setSheetOpen(true);
  }

  function openEditSheet(instance: ErpInstance) {
    const f: InstanceForm = {
      label: instance.label,
      baseUrl: instance.baseUrl,
      apiKey: instance.apiKey,
      apiSecret: "",
      incomingWebhookSecret: instance.incomingWebhookSecret ?? "",
      cashMop: instance.cashMop ?? "Cash",
      codMop: instance.codMop ?? "Cash On Delivery",
      cardDeliveryMop: instance.cardDeliveryMop ?? "Credit Card",
      bankTransferMop: instance.bankTransferMop ?? "Wire Transfer",
      kokoMop: instance.kokoMop ?? "Koko",
      webxpayMop: instance.webxpayMop ?? "",
      taxesAndCharges: instance.taxesAndCharges ?? "",
      shippingRule: instance.shippingRule ?? "",
      shippingItem: instance.shippingItem ?? "",
      shippingChargeAccount: instance.shippingChargeAccount ?? "",
    };
    setForm(f);
    setSavedForm(f);
    setSheetMode("edit");
    setEditingId(instance.id);
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!canEdit || isBusy) return;
    if (!form.label.trim() || !form.baseUrl.trim() || !form.apiKey.trim()) {
      notify.error("Label, Base URL, and API Key are required");
      return;
    }
    if (sheetMode === "add" && !form.apiSecret.trim()) {
      notify.error("API Secret is required when creating an instance");
      return;
    }

    setBusyKey("save");
    try {
      const body: Record<string, string | null> = {
        label: form.label.trim(),
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey.trim(),
        incomingWebhookSecret: form.incomingWebhookSecret.trim() || null,
        cashMop: form.cashMop.trim() || null,
        codMop: form.codMop.trim() || null,
        cardDeliveryMop: form.cardDeliveryMop.trim() || null,
        bankTransferMop: form.bankTransferMop.trim() || null,
        kokoMop: form.kokoMop.trim() || null,
        webxpayMop: form.webxpayMop.trim() || null,
        taxesAndCharges: form.taxesAndCharges.trim() || null,
        shippingRule: form.shippingRule.trim() || null,
        shippingItem: form.shippingItem.trim() || null,
        shippingChargeAccount: form.shippingChargeAccount.trim() || null,
      };
      if (form.apiSecret.trim()) body.apiSecret = form.apiSecret.trim();

      const url =
        sheetMode === "add"
          ? "/api/admin/company/erp-instances"
          : `/api/admin/company/erp-instances/${editingId}`;
      const method = sheetMode === "add" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        notify.error(data.error ?? "Failed to save");
        return;
      }

      notify.success(sheetMode === "add" ? "ERP instance created." : "ERP instance updated.");
      setSheetOpen(false);
      await fetchInstances();
    } catch {
      notify.error("Failed to save ERP instance");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDelete(instance: ErpInstance) {
    const confirmed = await confirm({
      title: "Delete ERP Instance",
      description: `Delete "${instance.label}"? This will unlink ${instance._count.locations} location(s). This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!confirmed) return;

    setBusyKey(`delete-${instance.id}`);
    try {
      const res = await fetch(`/api/admin/company/erp-instances/${instance.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        notify.error(data.error ?? "Failed to delete");
        return;
      }
      notify.success("ERP instance deleted.");
      await fetchInstances();
    } catch {
      notify.error("Failed to delete ERP instance");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <Card className="border-border/70 shadow-xs">
        <CardHeader>
          <CardTitle>ERP Instances</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent))]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">ERP Instances</CardTitle>
              <CardDescription className="mt-1">
                Each ERP instance stores a separate set of ERPNext credentials and configuration. Assign instances to locations in Location Settings.
              </CardDescription>
            </div>
            {canEdit && (
              <Button size="sm" onClick={openAddSheet} disabled={isBusy}>
                <Plus className="size-4" aria-hidden />
                Add Instance
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {instances.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Plug className="size-8 text-muted-foreground/40" aria-hidden />
              <p className="text-sm text-muted-foreground">No ERP instances configured yet.</p>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={openAddSheet}>
                  <Plus className="size-4" aria-hidden />
                  Add your first instance
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {instances.map((instance) => (
                <li
                  key={instance.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{instance.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{instance.baseUrl}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {instance._count.locations === 0
                        ? "No locations assigned"
                        : `${instance._count.locations} location${instance._count.locations === 1 ? "" : "s"} assigned`}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => openEditSheet(instance)}
                        disabled={isBusy}
                        aria-label={`Edit ${instance.label}`}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(instance)}
                        disabled={isBusy}
                        aria-label={`Delete ${instance.label}`}
                      >
                        {busyKey === `delete-${instance.id}` ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="size-3.5" aria-hidden />
                        )}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {sheetMode === "add" ? "Add ERP Instance" : "Edit ERP Instance"}
            </SheetTitle>
            <SheetDescription>
              {sheetMode === "add"
                ? "Connect a new ERPNext instance. All fields except API Secret can be updated later."
                : "Update credentials and configuration for this ERP instance."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-6 py-4">
            {/* Connection */}
            <div className="space-y-3 rounded-xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))] p-4">
              <h4 className="text-sm font-medium">Connection</h4>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Label</label>
                <Input
                  value={form.label}
                  onChange={(e) => setField("label", e.target.value)}
                  disabled={!canEdit || isBusy}
                  placeholder="e.g. Main ERP, Branch ERP"
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Base URL</label>
                <Input
                  type="url"
                  value={form.baseUrl}
                  onChange={(e) => setField("baseUrl", e.target.value)}
                  disabled={!canEdit || isBusy}
                  placeholder="https://yoursite.frappe.cloud"
                  maxLength={500}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">API Key</label>
                <Input
                  value={form.apiKey}
                  onChange={(e) => setField("apiKey", e.target.value)}
                  disabled={!canEdit || isBusy}
                  placeholder="From Settings → API Access → Generate Keys"
                  maxLength={500}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  API Secret {sheetMode === "edit" && <span className="text-muted-foreground">(leave blank to keep current)</span>}
                </label>
                <Input
                  type="password"
                  value={form.apiSecret}
                  onChange={(e) => setField("apiSecret", e.target.value)}
                  disabled={!canEdit || isBusy}
                  placeholder={sheetMode === "edit" ? "Leave blank to keep current" : "API Secret"}
                  maxLength={500}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Incoming Webhook Secret</label>
                <Input
                  value={form.incomingWebhookSecret}
                  onChange={(e) => setField("incomingWebhookSecret", e.target.value)}
                  disabled={!canEdit || isBusy}
                  placeholder="Must match x-erpnext-secret header in ERPNext webhooks"
                  maxLength={500}
                />
              </div>
            </div>

            {/* Mode of Payment */}
            <div className="space-y-3 rounded-xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))] p-4">
              <h4 className="text-sm font-medium">Mode of Payment Names</h4>
              <p className="text-xs text-muted-foreground">Must match exactly as configured in ERPNext → Accounts → Mode of Payment.</p>
              {(
                [
                  { key: "cashMop", label: "Cash" },
                  { key: "codMop", label: "Cash On Delivery" },
                  { key: "cardDeliveryMop", label: "Card on Delivery" },
                  { key: "bankTransferMop", label: "Bank Transfer" },
                  { key: "kokoMop", label: "Koko" },
                  { key: "webxpayMop", label: "WebXPay" },
                ] as { key: keyof InstanceForm; label: string }[]
              ).map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{label}</label>
                  <Input
                    value={form[key]}
                    onChange={(e) => setField(key, e.target.value)}
                    disabled={!canEdit || isBusy}
                    placeholder={label}
                    maxLength={200}
                  />
                </div>
              ))}
            </div>

            {/* Invoice Config */}
            <div className="space-y-3 rounded-xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))] p-4">
              <h4 className="text-sm font-medium">Invoice Configuration</h4>
              <p className="text-xs text-muted-foreground">Optional — applied to Sales Invoices created in ERPNext.</p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Taxes and Charges Template</label>
                <Input
                  value={form.taxesAndCharges}
                  onChange={(e) => setField("taxesAndCharges", e.target.value)}
                  disabled={!canEdit || isBusy}
                  placeholder="e.g. Bag Fees - SV1"
                  maxLength={200}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Shipping Rule</label>
                <Input
                  value={form.shippingRule}
                  onChange={(e) => setField("shippingRule", e.target.value)}
                  disabled={!canEdit || isBusy}
                  placeholder="e.g. nugegoda"
                  maxLength={200}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Shipping Item Code</label>
                <Input
                  value={form.shippingItem}
                  onChange={(e) => setField("shippingItem", e.target.value)}
                  disabled={!canEdit || isBusy}
                  placeholder="e.g. DELIVERY-CHARGES"
                  maxLength={200}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Shipping Charge Account</label>
                <Input
                  value={form.shippingChargeAccount}
                  onChange={(e) => setField("shippingChargeAccount", e.target.value)}
                  disabled={!canEdit || isBusy}
                  placeholder="e.g. Freight and Forwarding Charges - SV-1"
                  maxLength={200}
                />
                <p className="text-xs text-muted-foreground">
                  ERPNext account head for shipping. When set, the exact Shopify shipping amount is added to Taxes &amp; Charges dynamically (overrides Shipping Rule).
                </p>
              </div>
            </div>
          </div>

          <SheetFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={isBusy}>
              Cancel
            </Button>
            {canEdit && (
              <Button onClick={handleSave} disabled={isBusy || (sheetMode === "edit" && !sheetHasChanges)}>
                {busyKey === "save" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Saving...
                  </>
                ) : sheetMode === "add" ? (
                  "Create Instance"
                ) : (
                  "Save Changes"
                )}
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
