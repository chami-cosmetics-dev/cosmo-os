"use client";

import { FormEvent, useState } from "react";
import { Eye, Loader2, PackageSearch, Plus, Search, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FulfillmentOrderReference } from "@/components/molecules/fulfillment-order-reference";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { formatAppDateTime } from "@/lib/format-datetime";

type LookupResult = {
  order: {
    id: string;
    name: string | null;
    orderNumber: string | null;
    shopifyOrderId: string;
    erpnextInvoiceId: string | null;
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
    rawPayload: Record<string, unknown> | null;
    uploadedAt: string | null;
    uploadFileName: string | null;
    createdAt: string;
  }>;
};

type ImportSummary = {
  totalRows: number;
  imported: number;
  invalidRows: number;
};

function formatDate(value: string | null) {
  return formatAppDateTime(value, "-");
}

function stageLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function hasDisplayValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export function WaybillLookupFulfillmentPage({
  canImportWaybills,
}: {
  canImportWaybills: boolean;
}) {
  const [invoice, setInvoice] = useState("");
  const [waybillNo, setWaybillNo] = useState("");
  const [courierName, setCourierName] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [selectedWaybill, setSelectedWaybill] = useState<LookupResult["waybills"][number] | null>(null);

  async function searchInvoice(nextInvoice = invoice) {
    const trimmed = nextInvoice.trim();
    if (!trimmed) {
      notify.error("Enter an invoice or waybill number.");
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ q: trimmed });
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
      if (!data?.order && !data?.waybills?.length) {
        notify.error("No waybill or order matched that number.");
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

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importFile) {
      notify.error("Choose a CSV or Excel file.");
      return;
    }

    setImporting(true);
    setImportSummary(null);
    try {
      const formData = new FormData();
      formData.set("file", importFile);
      const response = await fetch("/api/admin/waybills/import", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as
        | { summary?: ImportSummary; error?: string }
        | null;

      if (!response.ok || !data?.summary) {
        notify.error(data?.error ?? "Could not import waybill file.");
        return;
      }

      setImportSummary(data.summary);
      setImportFile(null);
      notify.success(`Imported ${data.summary.imported} waybill(s).`);
    } catch {
      notify.error("Could not import waybill file.");
    } finally {
      setImporting(false);
    }
  }

  const matchedOrder = result?.order ?? null;
  const waybills = result?.waybills ?? [];
  const selectedRawEntries = selectedWaybill?.rawPayload
    ? Object.entries(selectedWaybill.rawPayload).filter(([, value]) => hasDisplayValue(value))
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <PackageSearch className="size-6 text-muted-foreground" aria-hidden />
          Waybill Lookup
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Upload courier files, then search invoice or waybill numbers when customers ask for delivery details.
        </p>
      </div>

      {canImportWaybills && (
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="border-b border-border/50">
          <CardTitle>Waybill File Upload</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleImport} className="grid gap-3 md:grid-cols-[1fr_auto]">
              <Input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                className="h-11"
              />
              <Button type="submit" disabled={importing || !importFile} className="h-11 gap-2">
                {importing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
                Upload File
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Upload CSV, XLSX, or XLS files. The importer saves invoice and waybill numbers for search and keeps the full row for the details popup.
            </p>
            {importSummary && (
              <div className="grid gap-3 rounded-md border border-border/70 bg-muted/20 p-3 text-sm md:grid-cols-3">
                <div>
                  <p className="text-muted-foreground">Rows</p>
                  <p className="font-semibold">{importSummary.totalRows}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Imported</p>
                  <p className="font-semibold">{importSummary.imported}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Invalid</p>
                  <p className="font-semibold">{importSummary.invalidRows}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                placeholder="Invoice or waybill number"
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
                <p className="text-muted-foreground">Order</p>
                <FulfillmentOrderReference order={matchedOrder} variant="labeled" className="text-sm" />
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

      {result && !matchedOrder && waybills.length === 0 && (
        <Card className="border-border/70 shadow-xs">
          <CardContent>
            <p className="text-sm text-muted-foreground">No waybill or order matched this number.</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="border-b border-border/50">
            <CardTitle>Waybill Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {waybills.length > 0 ? (
              <div className="overflow-hidden rounded-md border border-border/70">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Waybill No</th>
                      <th className="px-3 py-2 font-medium">Invoice</th>
                      <th className="px-3 py-2 font-medium text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waybills.map((waybill) => (
                      <tr
                        key={waybill.id}
                        tabIndex={0}
                        role="button"
                        className="border-t border-border/60 transition-colors hover:bg-muted/35 focus:bg-muted/35 focus:outline-none focus:ring-2 focus:ring-ring/60"
                        onClick={() => setSelectedWaybill(waybill)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedWaybill(waybill);
                          }
                        }}
                      >
                        <td className="px-3 py-2 font-medium">{waybill.waybillNo}</td>
                        <td className="px-3 py-2">{waybill.invoiceNumber}</td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedWaybill(waybill);
                            }}
                          >
                            <Eye className="size-4" aria-hidden />
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No waybill saved for this number yet.</p>
            )}

            {canImportWaybills && matchedOrder && (
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
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={Boolean(selectedWaybill)} onOpenChange={(open) => !open && setSelectedWaybill(null)}>
        <DialogContent className="flex max-h-[86vh] flex-col overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Waybill Details</DialogTitle>
            <DialogDescription>
              Full uploaded row for invoice {selectedWaybill?.invoiceNumber ?? "-"}.
            </DialogDescription>
          </DialogHeader>
          {selectedWaybill && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div className="grid gap-3 rounded-md border border-border/70 bg-muted/20 p-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Invoice number</p>
                  <p className="font-medium">{selectedWaybill.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Waybill number</p>
                  <p className="font-medium">{selectedWaybill.waybillNo}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Courier</p>
                  <p className="font-medium">{selectedWaybill.courierName ?? "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Saved</p>
                  <p className="font-medium">{formatDate(selectedWaybill.createdAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Uploaded</p>
                  <p className="font-medium">{formatDate(selectedWaybill.uploadedAt)}</p>
                </div>
              </div>

              {selectedRawEntries.length > 0 ? (
                <div className="overflow-hidden rounded-md border border-border/70">
                  <table className="w-full text-sm">
                    <tbody>
                      {selectedRawEntries.map(([key, value]) => (
                        <tr key={key} className="border-t border-border/60 first:border-t-0">
                          <td className="w-2/5 bg-muted/35 px-3 py-2 font-medium">{key}</td>
                          <td className="px-3 py-2 text-muted-foreground">{String(value ?? "-")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-md border border-border/70 p-3 text-sm text-muted-foreground">
                  No uploaded row details are available for this manually saved waybill.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
