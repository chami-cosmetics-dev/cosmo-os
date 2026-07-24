"use client";

import { FormEvent, useEffect, useState } from "react";
import { Eye, Loader2, PackageSearch, Plus, RefreshCw, Search, Trash2, Upload } from "lucide-react";

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
import type {
  WaybillLookupPageData,
  WaybillPendingRow,
} from "@/lib/page-data/waybill-lookup-types";

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
  unmatchedRows?: number;
};

type DetailsTarget =
  | {
      kind: "search";
      waybill: LookupResult["waybills"][number];
      matchStatus?: undefined;
      order?: undefined;
    }
  | {
      kind: "pending";
      waybill: WaybillPendingRow;
      matchStatus: WaybillPendingRow["matchStatus"];
      order: WaybillPendingRow["order"];
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
  initialData = null,
}: {
  canImportWaybills: boolean;
  initialData?: WaybillLookupPageData | null;
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
  const [pageData, setPageData] = useState<WaybillLookupPageData | null>(initialData);
  const [pageLoading, setPageLoading] = useState(!initialData);
  const [pendingPage, setPendingPage] = useState(initialData?.pagination.page ?? 1);
  const [rematching, setRematching] = useState(false);
  const [deletingUploadId, setDeletingUploadId] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<DetailsTarget | null>(null);

  const isBusy = loading || saving || importing || pageLoading || rematching || Boolean(deletingUploadId);

  async function loadPageData(options?: { page?: number; rematch?: boolean }) {
    const page = options?.page ?? pendingPage;
    setPageLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageData?.pagination.limit ?? 50),
      });
      if (options?.rematch) params.set("rematch", "1");
      const response = await fetch(`/api/admin/waybills/page-data?${params.toString()}`);
      const data = (await response.json().catch(() => null)) as
        | (WaybillLookupPageData & { error?: string })
        | null;
      if (!response.ok || !data) {
        notify.error(data?.error ?? "Could not load waybill queue.");
        return;
      }
      setPageData(data);
      setPendingPage(data.pagination.page);
      if (options?.rematch && data.rematch) {
        notify.success(
          `Re-checked ${data.rematch.attempted} unmatched waybill(s); matched ${data.rematch.matched}.`
        );
      }
    } catch {
      notify.error("Could not load waybill queue.");
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    if (initialData) return;
    void loadPageData({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial fetch only when no server data
  }, [initialData]);

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
      await loadPageData({ page: pendingPage });
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
      const unmatched = data.summary.unmatchedRows ?? 0;
      notify.success(
        `Imported ${data.summary.imported} waybill(s)` +
          (unmatched > 0 ? ` (${unmatched} unmatched).` : ".")
      );
      await loadPageData({ page: 1 });
    } catch {
      notify.error("Could not import waybill file.");
    } finally {
      setImporting(false);
    }
  }

  async function handleRematch() {
    setRematching(true);
    try {
      const response = await fetch("/api/admin/waybills/rematch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json().catch(() => null)) as
        | { attempted?: number; matched?: number; error?: string }
        | null;
      if (!response.ok || data?.attempted == null) {
        notify.error(data?.error ?? "Could not re-check matches.");
        return;
      }
      notify.success(`Re-checked ${data.attempted} unmatched waybill(s); matched ${data.matched ?? 0}.`);
      await loadPageData({ page: pendingPage });
    } catch {
      notify.error("Could not re-check matches.");
    } finally {
      setRematching(false);
    }
  }

  async function handleDeleteUpload(uploadId: string, fileName: string) {
    if (
      !window.confirm(
        `Delete upload "${fileName}"? Waybills still linked to this file will be removed from the queue.`
      )
    ) {
      return;
    }

    setDeletingUploadId(uploadId);
    try {
      const response = await fetch(`/api/admin/waybills/uploads/${uploadId}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => null)) as
        | { deletedWaybills?: number; error?: string }
        | null;
      if (!response.ok) {
        notify.error(data?.error ?? "Could not delete upload.");
        return;
      }
      notify.success(
        `Deleted ${fileName}` +
          (data?.deletedWaybills != null ? ` (${data.deletedWaybills} waybill row(s)).` : ".")
      );
      await loadPageData({ page: pendingPage });
    } catch {
      notify.error("Could not delete upload.");
    } finally {
      setDeletingUploadId(null);
    }
  }

  const matchedOrder = result?.order ?? null;
  const waybills = result?.waybills ?? [];
  const pending = pageData?.pending ?? [];
  const uploads = pageData?.uploads ?? [];
  const pagination = pageData?.pagination;
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.limit)) : 1;

  const selectedRawEntries = selectedDetails
    ? Object.entries(
        selectedDetails.kind === "pending"
          ? selectedDetails.waybill.rawPayload ?? {}
          : selectedDetails.waybill.rawPayload ?? {}
      ).filter(([, value]) => hasDisplayValue(value))
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <PackageSearch className="size-6 text-muted-foreground" aria-hidden />
          Waybill Lookup
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Upload courier files (each upload adds to the queue — prior files are kept), work pending
          waybills, and search invoice or waybill numbers when customers ask for delivery details.
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
                disabled={isBusy}
              />
              <Button type="submit" disabled={isBusy || !importFile} className="h-11 gap-2">
                {importing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
                {importing ? "Uploading..." : "Upload File"}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Upload CSV, XLSX, or XLS files. New uploads add to (or update) the waybill queue — they do
              not replace earlier files wholesale. The importer maps invoice references to OS orders and
              keeps the full row for the details popup.
            </p>
            {importSummary && (
              <div className="grid gap-3 rounded-md border border-border/70 bg-muted/20 p-3 text-sm md:grid-cols-4">
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
                <div>
                  <p className="text-muted-foreground">Unmatched</p>
                  <p className="font-semibold">{importSummary.unmatchedRows ?? 0}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50">
          <CardTitle>Upload History</CardTitle>
        </CardHeader>
        <CardContent>
          {pageLoading && !pageData ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading upload history...
            </p>
          ) : uploads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No waybill files uploaded yet.</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-border/70">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">File</th>
                    <th className="px-3 py-2 font-medium">Uploaded</th>
                    <th className="px-3 py-2 font-medium">By</th>
                    <th className="px-3 py-2 font-medium">Total</th>
                    <th className="px-3 py-2 font-medium">Imported</th>
                    <th className="px-3 py-2 font-medium">Invalid</th>
                    <th className="px-3 py-2 font-medium">Unmatched</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    {canImportWaybills && (
                      <th className="px-3 py-2 font-medium text-right">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((upload) => (
                    <tr key={upload.id} className="border-t border-border/60">
                      <td className="px-3 py-2 font-medium">{upload.fileName}</td>
                      <td className="px-3 py-2">{formatDate(upload.createdAt)}</td>
                      <td className="px-3 py-2">
                        {upload.uploadedBy?.name || upload.uploadedBy?.email || "—"}
                      </td>
                      <td className="px-3 py-2">{upload.totalRows}</td>
                      <td className="px-3 py-2">{upload.importedRows}</td>
                      <td className="px-3 py-2">{upload.invalidRows}</td>
                      <td className="px-3 py-2">{upload.unmatchedRows}</td>
                      <td className="px-3 py-2 capitalize">{upload.status}</td>
                      {canImportWaybills && (
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2 text-destructive hover:text-destructive"
                            disabled={isBusy}
                            onClick={() => void handleDeleteUpload(upload.id, upload.fileName)}
                          >
                            {deletingUploadId === upload.id ? (
                              <Loader2 className="size-4 animate-spin" aria-hidden />
                            ) : (
                              <Trash2 className="size-4" aria-hidden />
                            )}
                            {deletingUploadId === upload.id ? "Deleting..." : "Delete"}
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/50">
          <CardTitle>Pending Waybills</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={isBusy}
            onClick={() => void handleRematch()}
          >
            {rematching ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
            {rematching ? "Re-checking..." : "Re-check matches"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={invoice}
                onChange={(event) => setInvoice(event.target.value)}
                placeholder="Invoice or waybill number"
                className="h-11 pl-9"
                disabled={isBusy}
              />
            </div>
            <Button type="submit" disabled={isBusy} className="h-11 gap-2">
              {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
              {loading ? "Searching..." : "Search"}
            </Button>
          </form>

          {matchedOrder && (
            <div className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-3">
              <p className="text-sm font-medium">Matched Order</p>
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
            </div>
          )}

          {result && !matchedOrder && waybills.length === 0 && (
            <p className="text-sm text-muted-foreground">No waybill or order matched this number.</p>
          )}

          {result && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Waybill Results</p>
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
                          onClick={() =>
                            setSelectedDetails({ kind: "search", waybill })
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedDetails({ kind: "search", waybill });
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
                              disabled={isBusy}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedDetails({ kind: "search", waybill });
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
                    disabled={isBusy}
                  />
                  <Input
                    value={courierName}
                    onChange={(event) => setCourierName(event.target.value)}
                    placeholder="Courier name"
                    className="h-11"
                    disabled={isBusy}
                  />
                  <Button type="submit" disabled={isBusy} className="h-11 gap-2">
                    {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </form>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Shows unmatched waybills and matched orders that are not delivery-complete. Completed
            deliveries leave this list but remain findable via Search.
          </p>
          {pageLoading && !pageData ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading pending waybills...
            </p>
          ) : pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending waybills.</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-border/70">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Waybill No</th>
                    <th className="px-3 py-2 font-medium">Invoice</th>
                    <th className="px-3 py-2 font-medium">Courier</th>
                    <th className="px-3 py-2 font-medium">Match</th>
                    <th className="px-3 py-2 font-medium">OS order</th>
                    <th className="px-3 py-2 font-medium">Upload</th>
                    <th className="px-3 py-2 font-medium text-right">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((row) => (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      role="button"
                      className="border-t border-border/60 transition-colors hover:bg-muted/35 focus:bg-muted/35 focus:outline-none focus:ring-2 focus:ring-ring/60"
                      onClick={() =>
                        setSelectedDetails({
                          kind: "pending",
                          waybill: row,
                          matchStatus: row.matchStatus,
                          order: row.order,
                        })
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedDetails({
                            kind: "pending",
                            waybill: row,
                            matchStatus: row.matchStatus,
                            order: row.order,
                          });
                        }
                      }}
                    >
                      <td className="px-3 py-2 font-medium">{row.waybillNo}</td>
                      <td className="px-3 py-2">{row.invoiceNumber}</td>
                      <td className="px-3 py-2">{row.courierName ?? "—"}</td>
                      <td className="px-3 py-2 capitalize">{row.matchStatus}</td>
                      <td className="px-3 py-2">{row.order?.displayId ?? "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col">
                          <span>{row.uploadFileName ?? "—"}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(row.uploadedAt)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          disabled={isBusy}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedDetails({
                              kind: "pending",
                              waybill: row,
                              matchStatus: row.matchStatus,
                              order: row.order,
                            });
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
          )}

          {pagination && pagination.total > pagination.limit && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="text-muted-foreground">
                Page {pagination.page} of {totalPages} ({pagination.total} pending)
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBusy || pendingPage <= 1}
                  onClick={() => void loadPageData({ page: pendingPage - 1 })}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBusy || pendingPage >= totalPages}
                  onClick={() => void loadPageData({ page: pendingPage + 1 })}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedDetails)}
        onOpenChange={(open) => !open && setSelectedDetails(null)}
      >
        <DialogContent className="flex max-h-[86vh] flex-col overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Waybill Details</DialogTitle>
            <DialogDescription>
              Full uploaded row for invoice{" "}
              {selectedDetails?.waybill.invoiceNumber ?? "-"}.
            </DialogDescription>
          </DialogHeader>
          {selectedDetails && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div className="grid gap-3 rounded-md border border-border/70 bg-muted/20 p-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Invoice number</p>
                  <p className="font-medium">{selectedDetails.waybill.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Waybill number</p>
                  <p className="font-medium">{selectedDetails.waybill.waybillNo}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Courier</p>
                  <p className="font-medium">{selectedDetails.waybill.courierName ?? "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Uploaded</p>
                  <p className="font-medium">
                    {formatDate(
                      selectedDetails.kind === "pending"
                        ? selectedDetails.waybill.uploadedAt
                        : selectedDetails.waybill.uploadedAt
                    )}
                  </p>
                </div>
                {selectedDetails.kind === "pending" && (
                  <>
                    <div>
                      <p className="text-muted-foreground">Match status</p>
                      <p className="font-medium capitalize">{selectedDetails.matchStatus}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">OS order</p>
                      {selectedDetails.order ? (
                        <p className="font-medium">
                          {selectedDetails.order.displayId}
                          {selectedDetails.order.deliveryCompleteAt
                            ? " (delivery complete)"
                            : " (not delivery complete)"}
                        </p>
                      ) : (
                        <p className="font-medium text-muted-foreground">No OS order match found</p>
                      )}
                    </div>
                  </>
                )}
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
