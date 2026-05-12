"use client";

import { FormEvent, useState } from "react";
import { Loader2, PackageSearch, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

type LookupResult = {
  order: {
    id: string;
    name: string | null;
    orderNumber: string | null;
    shopifyOrderId: string;
    customerEmail: string | null;
    customerPhone: string | null;
    financialStatus: string | null;
    fulfillmentStatus: string | null;
    fulfillmentStage: string;
    dispatchedAt: string | null;
    deliveryCompleteAt: string | null;
    invoiceCompleteAt: string | null;
    courierName: string | null;
    locationName: string;
  } | null;
  waybills: Array<{
    id: string;
    invoiceNumber: string;
    waybillNo: string;
    courierName: string | null;
    source: string;
    uploadedAt: string | null;
    createdAt: string;
  }>;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function stageLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function orderLabel(order: NonNullable<LookupResult["order"]>) {
  return order.name ?? order.orderNumber ?? order.shopifyOrderId;
}

export function WaybillLookupFulfillmentPage() {
  const [invoice, setInvoice] = useState("");
  const [waybillNo, setWaybillNo] = useState("");
  const [courierName, setCourierName] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function searchInvoice(nextInvoice = invoice) {
    const trimmed = nextInvoice.trim();
    if (!trimmed) {
      notify.error("Enter an invoice number.");
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ invoice: trimmed });
      const response = await fetch(`/api/admin/waybills/search?${params.toString()}`);
      const data = (await response.json().catch(() => null)) as LookupResult & { error?: string } | null;

      if (!response.ok) {
        notify.error(data?.error ?? "Could not search waybill.");
        setResult(null);
        return;
      }

      setResult(data);
      setWaybillNo("");
      setCourierName(data?.order?.courierName ?? "");
      if (!data?.order) {
        notify.error("No order matched that invoice number.");
      }
    } catch {
      notify.error("Could not search waybill.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await searchInvoice();
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!result?.order) return;
    if (!waybillNo.trim()) {
      notify.error("Enter a waybill number.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/waybills/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: invoice.trim(),
          waybillNo: waybillNo.trim(),
          courierName: courierName.trim() || result.order.courierName,
        }),
      });
      const data = (await response.json().catch(() => null)) as LookupResult & { error?: string } | null;

      if (!response.ok) {
        notify.error(data?.error ?? "Could not save waybill.");
        return;
      }

      setResult(data);
      setWaybillNo("");
      setCourierName(data?.order?.courierName ?? "");
      notify.success("Waybill saved.");
    } catch {
      notify.error("Could not save waybill.");
    } finally {
      setSaving(false);
    }
  }

  const matchedOrder = result?.order ?? null;
  const waybills = result?.waybills ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <PackageSearch className="size-6 text-muted-foreground" aria-hidden />
          Waybill Lookup
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Find courier waybill numbers from invoice numbers, and save missing waybill numbers against matched orders.
        </p>
      </div>

      <Card className="border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50">
          <CardTitle>Search</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={invoice}
                onChange={(event) => setInvoice(event.target.value)}
                placeholder="Invoice number"
                className="h-11 pl-9"
              />
            </div>
            <Button type="submit" disabled={loading} className="h-11 gap-2">
              {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {matchedOrder && (
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="border-b border-border/50">
            <CardTitle>Matched Order</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <div>
                <p className="text-muted-foreground">Invoice</p>
                <p className="font-medium">{orderLabel(matchedOrder)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Courier</p>
                <p className="font-medium">{matchedOrder.courierName ?? "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Stage</p>
                <p className="font-medium">{stageLabel(matchedOrder.fulfillmentStage)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Customer</p>
                <p className="font-medium">{matchedOrder.customerPhone ?? matchedOrder.customerEmail ?? "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Location</p>
                <p className="font-medium">{matchedOrder.locationName}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Dispatched</p>
                <p className="font-medium">{formatDate(matchedOrder.dispatchedAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {result && !matchedOrder && (
        <Card className="border-border/70 shadow-xs">
          <CardContent>
            <p className="text-sm text-muted-foreground">No order matched this invoice number.</p>
          </CardContent>
        </Card>
      )}

      {matchedOrder && (
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="border-b border-border/50">
            <CardTitle>Waybills</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {waybills.length > 0 ? (
              <div className="overflow-hidden rounded-md border border-border/70">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Waybill No</th>
                      <th className="px-3 py-2 font-medium">Invoice</th>
                      <th className="px-3 py-2 font-medium">Courier</th>
                      <th className="px-3 py-2 font-medium">Source</th>
                      <th className="px-3 py-2 font-medium">Saved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waybills.map((waybill) => (
                      <tr key={waybill.id} className="border-t border-border/60">
                        <td className="px-3 py-2 font-medium">{waybill.waybillNo}</td>
                        <td className="px-3 py-2">{waybill.invoiceNumber}</td>
                        <td className="px-3 py-2">{waybill.courierName ?? "-"}</td>
                        <td className="px-3 py-2">{waybill.source}</td>
                        <td className="px-3 py-2 text-muted-foreground">{formatDate(waybill.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No waybill saved for this invoice yet.</p>
            )}

            <form onSubmit={handleSave} className="grid gap-3 border-t border-border/60 pt-4 md:grid-cols-[1fr_1fr_auto]">
              <Input
                value={waybillNo}
                onChange={(event) => setWaybillNo(event.target.value)}
                placeholder="Waybill number"
                className="h-11"
              />
              <Input
                value={courierName}
                onChange={(event) => setCourierName(event.target.value)}
                placeholder="Courier name"
                className="h-11"
              />
              <Button type="submit" disabled={saving} className="h-11 gap-2">
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                Save
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
