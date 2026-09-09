"use client";

import { FormEvent, useEffect, useState } from "react";
import { Eye, Loader2, PackageSearch, Plus, RefreshCw, Search, Trash2, Truck, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FulfillmentOrderReference } from "@/components/molecules/fulfillment-order-reference";
import { PrintCitypakWaybillButton } from "@/components/molecules/print-citypak-waybill-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { notify } from "@/lib/notify";
import { formatAppDateTime } from "@/lib/format-datetime";
import {
  CITYPAK_WAYBILL_SOURCE,
  readCitypakWaybillStatus,
  type CitypakShipmentStatus,
  type CitypakTrackingCheckpoint,
} from "@/lib/citypak-api";
import type {
  WaybillLookupPageData,
  WaybillPendingRow,
} from "@/lib/page-data/waybill-lookup-types";

type LookupWaybill = {
  id: string;
  invoiceNumber: string;
  waybillNo: string;
  courierName: string | null;
  source: string;
  rawPayload: Record<string, unknown> | null;
  uploadedAt: string | null;
  uploadFileName: string | null;
  createdAt: string;
};

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
  waybills: LookupWaybill[];
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
      waybill: LookupWaybill;
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

const STATUS_TONE: Record<CitypakShipmentStatus, string> = {
  booked: "bg-muted text-muted-foreground",
  in_transit: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  out_for_delivery: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  attempt_failed: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  delivered: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  returned: "bg-red-500/15 text-red-600 dark:text-red-400",
  unknown: "bg-muted text-muted-foreground",
};

function CitypakStatusBadge({
  rawPayload,
}: {
  rawPayload: Record<string, unknown> | null;
}) {
  const snapshot = readCitypakWaybillStatus(rawPayload);
  if (!snapshot.status) {
    return <span className="text-xs text-muted-foreground">Not checked</span>;
  }
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span
        className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[snapshot.status]}`}
      >
        {snapshot.statusLabel ?? snapshot.status}
      </span>
      {snapshot.checkedAt && (
        <span className="text-[11px] text-muted-foreground">
          {formatDate(snapshot.checkedAt)}
        </span>
      )}
    </span>
  );
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
  const [uploadsPage, setUploadsPage] = useState(initialData?.uploadsPagination.page ?? 1);
  const [rematching, setRematching] = useState(false);
  const [deletingUploadId, setDeletingUploadId] = useState<string | null>(null);
  const [refreshingStatusId, setRefreshingStatusId] = useState<string | null>(null);
  const [checkingAllStatuses, setCheckingAllStatuses] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<DetailsTarget | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "uploads">("pending");

  const isBusy =
    loading ||
    saving ||
    importing ||
    pageLoading ||
    rematching ||
    Boolean(deletingUploadId) ||
    Boolean(refreshingStatusId) ||
    checkingAllStatuses;

  async function loadPageData(options?: { page?: number; uploadsPage?: number }) {
    const page = options?.page ?? pendingPage;
    const nextUploadsPage = options?.uploadsPage ?? uploadsPage;
    setPageLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageData?.pagination.limit ?? 50),
        uploadsPage: String(nextUploadsPage),
        uploadsLimit: String(pageData?.uploadsPagination.limit ?? 20),
      });
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
      setUploadsPage(data.uploadsPagination.page);
    } catch {
      notify.error("Could not load waybill queue.");
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    if (initialData) return;
    void loadPageData({ page: 1, uploadsPage: 1 });
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
      await loadPageData({ page: 1, uploadsPage: 1 });
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
      await loadPageData({ page: pendingPage, uploadsPage });
    } catch {
      notify.error("Could not delete upload.");
    } finally {
      setDeletingUploadId(null);
    }
  }

  async function handleRefreshStatus(waybillId: string) {
    setRefreshingStatusId(waybillId);
    try {
      const response = await fetch(`/api/admin/waybills/${waybillId}/citypak-status`, {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as
        | { statusLabel?: string; error?: string }
        | null;
      if (!response.ok) {
        notify.error(data?.error ?? "Could not refresh CityPak status.");
        return;
      }
      notify.success(`CityPak status: ${data?.statusLabel ?? "updated"}.`);
      await Promise.all([
        loadPageData({ page: pendingPage, uploadsPage }),
        result ? searchInvoice(invoice) : Promise.resolve(),
      ]);
    } catch {
      notify.error("Could not refresh CityPak status.");
    } finally {
      setRefreshingStatusId(null);
    }
  }

  /** Poll CityPak once for every CityPak row on this page — no row-by-row clicking. */
  async function handleCheckAllStatuses(waybillIds: string[]) {
    if (waybillIds.length === 0) {
      notify.error("No CityPak waybills on this page to check.");
      return;
    }

    setCheckingAllStatuses(true);
    try {
      const response = await fetch("/api/admin/waybills/citypak-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waybillIds }),
      });
      const data = (await response.json().catch(() => null)) as
        | { checked?: number; updated?: number; delivered?: number; failed?: number; skipped?: number; error?: string }
        | null;
      if (!response.ok || data?.checked == null) {
        notify.error(data?.error ?? "Could not check CityPak statuses.");
        return;
      }
      notify.success(
        `Checked ${data.checked} waybill(s): ${data.updated ?? 0} updated, ${data.delivered ?? 0} delivered` +
          (data.failed ? `, ${data.failed} failed` : "") +
          (data.skipped ? `, ${data.skipped} already final` : "") +
          "."
      );
      await loadPageData({ page: pendingPage, uploadsPage });
    } catch {
      notify.error("Could not check CityPak statuses.");
    } finally {
      setCheckingAllStatuses(false);
    }
  }

  const matchedOrder = result?.order ?? null;
  const waybills = result?.waybills ?? [];
  const pending = pageData?.pending ?? [];
  const uploads = pageData?.uploads ?? [];
  const pendingCitypakIds = pending
    .filter((row) => row.source === CITYPAK_WAYBILL_SOURCE)
    .map((row) => row.id);
  const pagination = pageData?.pagination;
  const uploadsPagination = pageData?.uploadsPagination;
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.limit)) : 1;
  const uploadsTotalPages = uploadsPagination
    ? Math.max(1, Math.ceil(uploadsPagination.total / uploadsPagination.limit))
    : 1;

  const selectedRawEntries = selectedDetails
    ? Object.entries(selectedDetails.waybill.rawPayload ?? {}).filter(([, value]) =>
        hasDisplayValue(value)
      )
    : [];
  const selectedStatus = selectedDetails
    ? readCitypakWaybillStatus(selectedDetails.waybill.rawPayload)
    : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <PackageSearch className="size-6 text-muted-foreground" aria-hidden />
          Waybill Lookup
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Search invoice or waybill numbers for delivery details, work the pending queue, and review
          upload history. CityPak API waybills carry live courier status.
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
          <CardTitle>Search</CardTitle>
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
                <div className="overflow-x-auto rounded-md border border-border/70">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Waybill No</th>
                        <th className="px-3 py-2 font-medium">Invoice</th>
                        <th className="px-3 py-2 font-medium">Delivery status</th>
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
                          onClick={() => setSelectedDetails({ kind: "search", waybill })}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedDetails({ kind: "search", waybill });
                            }
                          }}
                        >
                          <td className="px-3 py-2 font-medium">{waybill.waybillNo}</td>
                          <td className="px-3 py-2">{waybill.invoiceNumber}</td>
                          <td className="px-3 py-2">
                            {waybill.source === CITYPAK_WAYBILL_SOURCE ? (
                              <CitypakStatusBadge rawPayload={waybill.rawPayload} />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex justify-end gap-2">
                              {waybill.source === CITYPAK_WAYBILL_SOURCE && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="gap-2"
                                  disabled={isBusy}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleRefreshStatus(waybill.id);
                                  }}
                                >
                                  {refreshingStatusId === waybill.id ? (
                                    <Loader2 className="size-4 animate-spin" aria-hidden />
                                  ) : (
                                    <Truck className="size-4" aria-hidden />
                                  )}
                                  Status
                                </Button>
                              )}
                              {waybill.source === CITYPAK_WAYBILL_SOURCE && matchedOrder?.id && (
                                <span onClick={(event) => event.stopPropagation()}>
                                  <PrintCitypakWaybillButton
                                    orderId={matchedOrder.id}
                                    tracking={waybill.waybillNo}
                                  />
                                </span>
                              )}
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
                            </div>
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
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "pending" | "uploads")}>
        <TabsList>
          <TabsTrigger value="pending">Pending Waybills</TabsTrigger>
          <TabsTrigger value="uploads">Upload History</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card className="border-border/70 shadow-xs">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border/50">
              <CardTitle>Pending Waybills</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={isBusy || pendingCitypakIds.length === 0}
                  onClick={() => void handleCheckAllStatuses(pendingCitypakIds)}
                >
                  {checkingAllStatuses ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Truck className="size-4" aria-hidden />
                  )}
                  {checkingAllStatuses
                    ? "Checking statuses..."
                    : `Check all statuses (${pendingCitypakIds.length})`}
                </Button>
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
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <div className="overflow-x-auto rounded-md border border-border/70">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Waybill No</th>
                        <th className="px-3 py-2 font-medium">Invoice</th>
                        <th className="px-3 py-2 font-medium">Courier</th>
                        <th className="px-3 py-2 font-medium">Match</th>
                        <th className="px-3 py-2 font-medium">OS order</th>
                        <th className="px-3 py-2 font-medium">Delivery status</th>
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
                            {row.source === CITYPAK_WAYBILL_SOURCE ? (
                              <div className="flex items-center gap-2">
                                <CitypakStatusBadge rawPayload={row.rawPayload} />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-7"
                                  disabled={isBusy}
                                  aria-label="Refresh CityPak status"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleRefreshStatus(row.id);
                                  }}
                                >
                                  {refreshingStatusId === row.id ? (
                                    <Loader2 className="size-4 animate-spin" aria-hidden />
                                  ) : (
                                    <RefreshCw className="size-4" aria-hidden />
                                  )}
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
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
        </TabsContent>

        <TabsContent value="uploads">
          <Card className="border-border/70 shadow-xs">
            <CardHeader className="border-b border-border/50">
              <CardTitle>Upload History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {pageLoading && !pageData ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Loading upload history...
                </p>
              ) : uploads.length === 0 ? (
                <p className="text-sm text-muted-foreground">No waybill files uploaded yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-border/70">
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

              {uploadsPagination && uploadsPagination.total > uploadsPagination.limit && (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <p className="text-muted-foreground">
                    Page {uploadsPagination.page} of {uploadsTotalPages} ({uploadsPagination.total}{" "}
                    uploads)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isBusy || uploadsPage <= 1}
                      onClick={() => void loadPageData({ uploadsPage: uploadsPage - 1 })}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isBusy || uploadsPage >= uploadsTotalPages}
                      onClick={() => void loadPageData({ uploadsPage: uploadsPage + 1 })}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
                  <p className="font-medium">{formatDate(selectedDetails.waybill.uploadedAt)}</p>
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

              {selectedStatus?.status && (
                <div className="space-y-3 rounded-md border border-border/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">CityPak delivery status</p>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[selectedStatus.status]}`}
                    >
                      {selectedStatus.statusLabel ?? selectedStatus.status}
                    </span>
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-muted-foreground">Last checked</p>
                      <p className="font-medium">{formatDate(selectedStatus.checkedAt)}</p>
                    </div>
                    {selectedStatus.deliveredAt && (
                      <div>
                        <p className="text-muted-foreground">Delivered</p>
                        <p className="font-medium">{formatDate(selectedStatus.deliveredAt)}</p>
                      </div>
                    )}
                  </div>
                  {selectedStatus.podImageUrl && (
                    <a
                      href={selectedStatus.podImageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary underline"
                    >
                      View proof of delivery
                    </a>
                  )}
                  {selectedStatus.checkpoints.length > 0 && (
                    <ol className="space-y-2 border-l border-border/60 pl-4 text-sm">
                      {selectedStatus.checkpoints.map((checkpoint: CitypakTrackingCheckpoint, index) => (
                        <li key={`${checkpoint.at}-${index}`} className="relative">
                          <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-border" />
                          <p className="font-medium">{checkpoint.label || checkpoint.status}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(checkpoint.at)}
                            {checkpoint.location ? ` · ${checkpoint.location}` : ""}
                            {checkpoint.description ? ` · ${checkpoint.description}` : ""}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}

              {selectedRawEntries.length > 0 ? (
                <div className="overflow-hidden rounded-md border border-border/70">
                  <table className="w-full text-sm">
                    <tbody>
                      {selectedRawEntries.map(([key, value]) => (
                        <tr key={key} className="border-t border-border/60 first:border-t-0">
                          <td className="w-2/5 bg-muted/35 px-3 py-2 font-medium">{key}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {typeof value === "object" ? JSON.stringify(value) : String(value ?? "-")}
                          </td>
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
