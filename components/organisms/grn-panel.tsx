"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronsUpDown,
  Circle,
  Eye,
  ExternalLink,
  FileDown,
  Link2,
  Loader2,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notify } from "@/lib/notify";

type UserRef = {
  id: string;
  name: string | null;
  email: string | null;
};

type PurchaseInvoiceRef = {
  name: string;
  erpUrl: string | null;
  postingDate: string | null;
  docstatus: number | null;
  status: string | null;
  items: {
    name: string;
    itemCode: string;
    itemName: string | null;
    qty: number;
    rate: number;
    amount: number;
    purchaseReceipt: string | null;
    purchaseReceiptItem: string | null;
    supplierStockReturn: string | null;
    supplierStockReturnItem: string | null;
    stockUom: string | null;
  }[];
};

type PurchaseReceiptRow = {
  companyId: string;
  companyLocationId: string | null;
  companyName: string;
  name: string;
  erpUrl: string | null;
  adjustmentNo: string | null;
  adjustmentNos: string[];
  adjustmentDocstatus: number | null;
  grnDate: string | null;
  grnBy: string | null;
  supplier: string;
  supplierName: string | null;
  docstatus: number | null;
  isCancelled: boolean;
  isBackfill: boolean;
  amendedFrom: string | null;
  handoverAt: string | null;
  handoverBy: UserRef | null;
  handoverRevertedAt: string | null;
  handoverRevertedBy: UserRef | null;
  handoverReceivedAt: string | null;
  handoverReceivedBy: UserRef | null;
  notReceivedAt: string | null;
  notReceivedBy: UserRef | null;
  valuedAt: string | null;
  valuedBy: UserRef | null;
  valuedRevertedAt: string | null;
  valuedRevertedBy: UserRef | null;
  receivedAt: string | null;
  receivedBy: UserRef | null;
  receivedRevertedAt: string | null;
  receivedRevertedBy: UserRef | null;
  canMarkReceived: boolean;
  itemCount: number;
  items: {
    name: string;
    itemCode: string;
    itemName: string | null;
    qty: number;
    stockQty: number | null;
    warehouse: string | null;
    stockUom: string | null;
  }[];
  tallyStatus: "not_linked" | "matched" | "issue";
  tallyPercentage: number | null;
  tallyIssueItems: string[];
  tallyIssues: {
    itemCode: string;
    itemName: string | null;
    prQty: number;
    ssrQty: number;
  }[];
  purchaseInvoice: PurchaseInvoiceRef | null;
  supplierStockReturnPurchaseInvoice: PurchaseInvoiceRef | null;
};

type SupplierStockReturnRow = {
  companyId: string;
  companyName: string;
  name: string;
  erpUrl: string | null;
  supplier: string;
  supplierName: string | null;
  returnDate: string | null;
  owner: string | null;
  creation: string | null;
  purchaseReceiptName: string | null;
  purchaseReceiptNames: string[];
  docstatus: number | null;
  isCancelled: boolean;
  isBackfill: boolean;
  amendedFrom: string | null;
  canTally: boolean;
  itemCount: number;
  matchRecommendation: {
    companyId: string;
    name: string;
    percentage: number;
  } | null;
  conflictMatches: {
    companyId: string;
    name: string;
    percentage: number;
  }[];
  matchReviewStatus: "matched" | "review" | "conflict" | "waiting" | null;
  items: {
    name: string;
    itemCode: string;
    itemName: string | null;
    qty: number;
    stockUom: string | null;
  }[];
};

type PageData = {
  purchaseReceipts: PurchaseReceiptRow[];
  supplierStockReturns: SupplierStockReturnRow[];
  intercompanySuppliers: IntercompanySupplierRow[];
};

type IntercompanySupplierRow = {
  id: string;
  supplier: string;
  supplierName: string | null;
};

type GrnPanelPermissions = {
  canMatchSsr: boolean;
  canViewHandover: boolean;
  canMarkHandover: boolean;
  canViewValued: boolean;
  canMarkValued: boolean;
  canViewReceived: boolean;
  canMarkReceived: boolean;
};

type GrnActionStage = "handover" | "valued" | "received";
type GrnStageStatusFilter = "all" | "pending" | "completed" | "mismatch" | "verify";
type SsrStatusFilter = "all" | "waiting" | "partial" | "conflict";
type GrnStageFilter = {
  stage: GrnActionStage;
  status: GrnStageStatusFilter;
};
type PrDialogFocus = "item-mismatch" | "price-mismatch" | "missing-ssr" | null;

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: PageSize = 20;
const SSR_STATUS_FILTERS: { key: SsrStatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "waiting", label: "Waiting" },
  { key: "partial", label: "Partial match" },
  { key: "conflict", label: "Conflict" },
];

function firstAllowedStage(permissions: GrnPanelPermissions): GrnActionStage {
  if (permissions.canViewHandover) return "handover";
  if (permissions.canViewValued) return "valued";
  if (permissions.canViewReceived) return "received";
  return "handover";
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-LK", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentMonthRange() {
  const now = new Date();
  return {
    from: dateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: dateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

function userLabel(user: UserRef | null) {
  return user?.name?.trim() || user?.email?.trim() || null;
}

function ssrStatusForFilter(row: SupplierStockReturnRow): Exclude<SsrStatusFilter, "all"> {
  if (row.matchReviewStatus === "conflict") return "conflict";
  const percentage = row.matchRecommendation?.percentage ?? 0;
  if (percentage <= 0) return "waiting";
  return "partial";
}

function CancelledBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
      Cancelled
    </span>
  );
}

function buildPriceTallyRows(
  ssr: SupplierStockReturnRow | null,
  pr: PurchaseReceiptRow | PurchaseReceiptRow[] | null,
) {
  const purchaseReceipts = pr ? (Array.isArray(pr) ? pr : [pr]) : [];
  const purchaseInvoiceItems = purchaseReceipts.flatMap((receipt) =>
    receipt.purchaseInvoice?.items.filter((item) => item.purchaseReceipt === receipt.name) ?? [],
  );
  const supplierStockReturnPurchaseInvoice = purchaseReceipts.find(
    (receipt) => receipt.supplierStockReturnPurchaseInvoice,
  )?.supplierStockReturnPurchaseInvoice ?? null;
  const supplierStockReturnName = ssr?.name ?? purchaseReceipts.find((receipt) => receipt.adjustmentNo)?.adjustmentNo ?? null;
  if (!purchaseInvoiceItems.length && !supplierStockReturnPurchaseInvoice) return [];

  const groupItems = (items: PurchaseInvoiceRef["items"]) => {
    const grouped = new Map<string, { itemName: string | null; qty: number; amount: number; uom: string | null }>();
    for (const item of items) {
      const current = grouped.get(item.itemCode);
      grouped.set(item.itemCode, {
        itemName: current?.itemName ?? item.itemName,
        qty: (current?.qty ?? 0) + item.qty,
        amount: (current?.amount ?? 0) + item.amount,
        uom: current?.uom ?? item.stockUom,
      });
    }
    return grouped;
  };

  const prByItem = groupItems(purchaseInvoiceItems);
  const ssrByItem = groupItems(
    supplierStockReturnPurchaseInvoice?.items.filter(
      (item) => !supplierStockReturnName || item.supplierStockReturn === supplierStockReturnName,
    ) ?? [],
  );

  return Array.from(new Set([...prByItem.keys(), ...ssrByItem.keys()]))
    .map((itemCode) => {
      const prItem = prByItem.get(itemCode);
      const ssrItem = ssrByItem.get(itemCode);
      const prRate = prItem?.qty ? prItem.amount / prItem.qty : null;
      const ssrRate = ssrItem?.qty ? Math.abs(ssrItem.amount / ssrItem.qty) : null;
      return {
        itemCode,
        itemName: prItem?.itemName ?? ssrItem?.itemName ?? null,
        prQty: prItem?.qty ?? 0,
        ssrQty: ssrItem?.qty ?? 0,
        prRate,
        ssrRate,
        prAmount: prItem?.amount ?? 0,
        ssrAmount: ssrItem?.amount ?? 0,
        uom: prItem?.uom ?? ssrItem?.uom ?? null,
        issue: prRate == null || ssrRate == null || Math.abs(prRate - ssrRate) > 0.000001,
      };
    })
    .sort((a, b) => Number(a.issue) - Number(b.issue) || a.itemCode.localeCompare(b.itemCode));
}

function hasPriceMismatch(row: PurchaseReceiptRow) {
  if (!row.purchaseInvoice || !row.supplierStockReturnPurchaseInvoice) return false;
  return buildPriceTallyRows(null, row).some((priceRow) => priceRow.issue);
}

function purchaseInvoiceTotal(row: PurchaseReceiptRow) {
  return row.purchaseInvoice?.items
    .filter((item) => item.purchaseReceipt === row.name)
    .reduce((total, item) => total + item.amount, 0) ?? 0;
}

function itemIssueCount(row: PurchaseReceiptRow) {
  return row.tallyIssues.length || row.tallyIssueItems.length;
}

function priceIssueCount(row: PurchaseReceiptRow) {
  if (!row.purchaseInvoice || !row.supplierStockReturnPurchaseInvoice) return 0;
  return buildPriceTallyRows(null, row).filter((priceRow) => priceRow.issue).length;
}

function linkModeLabel(ssr: SupplierStockReturnRow | null, pr: PurchaseReceiptRow | null) {
  if (!ssr || !pr) return null;
  const rec = ssr.matchRecommendation;
  return rec && rec.companyId === pr.companyId && rec.name === pr.name && rec.percentage >= 100
    ? "Auto matched"
    : "Manually linked";
}

function PurchaseInvoiceStatusBadge({ row }: { row: PurchaseReceiptRow | null | undefined }) {
  if (!row?.purchaseInvoice && !row?.supplierStockReturnPurchaseInvoice) {
    return <span className="text-xs text-muted-foreground">No PI prices</span>;
  }

  const hasPrPi = Boolean(row.purchaseInvoice);
  const hasSsrPi = Boolean(row.supplierStockReturnPurchaseInvoice);
  const label = row.adjustmentNo
    ? hasPrPi && hasSsrPi
      ? "PI linked"
      : hasPrPi
        ? "PR PI linked"
        : "SSR PI linked"
    : "PI linked";
  const complete = !row.adjustmentNo || (hasPrPi && hasSsrPi);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
        complete
          ? "bg-emerald-50 text-emerald-700"
          : "bg-amber-50 text-amber-700"
      }`}
    >
      <CheckCircle2 className="size-3.5" />
      {label}
    </span>
  );
}

function PurchaseInvoicePriceTallyDetails({
  row,
  priceRows,
  defaultOpen = false,
}: {
  row: PurchaseReceiptRow | PurchaseReceiptRow[];
  priceRows: ReturnType<typeof buildPriceTallyRows>;
  defaultOpen?: boolean;
}) {
  const purchaseReceipts = Array.isArray(row) ? row : [row];
  const purchaseInvoice = purchaseReceipts.find((receipt) => receipt.purchaseInvoice)?.purchaseInvoice ?? null;
  const supplierStockReturnPurchaseInvoice = purchaseReceipts.find(
    (receipt) => receipt.supplierStockReturnPurchaseInvoice,
  )?.supplierStockReturnPurchaseInvoice ?? null;

  return (
    <details className="rounded-lg border bg-background/50 p-3" open={defaultOpen}>
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold">Purchase invoice price tally</div>
          <div className="text-xs text-muted-foreground">
            {!purchaseInvoice
              ? "No linked purchase receipt invoice stored yet."
              : !supplierStockReturnPurchaseInvoice
                ? "No linked supplier stock return invoice stored yet."
                : `${purchaseReceipts.map((receipt) => receipt.name).join(", ")} vs ${supplierStockReturnPurchaseInvoice.name}`}
          </div>
        </div>
      </summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-3">
          {purchaseInvoice?.erpUrl && (
            <a
              href={purchaseInvoice.erpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-2 text-sm text-primary hover:underline"
            >
              <ExternalLink className="size-4" />
              Open PR PI
            </a>
          )}
          {supplierStockReturnPurchaseInvoice?.erpUrl && (
            <a
              href={supplierStockReturnPurchaseInvoice.erpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-2 text-sm text-primary hover:underline"
            >
              <ExternalLink className="size-4" />
              Open SSR PI
            </a>
          )}
        </div>
        {(purchaseInvoice || supplierStockReturnPurchaseInvoice) && (
          <div className="overflow-x-auto rounded-md border bg-background/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Item Name</TableHead>
                    <TableHead className="text-right">PR Price</TableHead>
                    <TableHead className="text-right">SSR Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {priceRows.length === 0 ? (
                  <TableRow>
                      <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                      No price rows found.
                    </TableCell>
                  </TableRow>
                ) : (
                  priceRows.map((item) => (
                    <TableRow key={item.itemCode} className={item.issue ? "bg-amber-500/10" : undefined}>
                      <TableCell className="font-medium">{item.itemCode}</TableCell>
                      <TableCell>{item.itemName ?? "-"}</TableCell>
                      <TableCell className="text-right">{item.prRate == null ? "-" : item.prRate.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{item.ssrRate == null ? "-" : item.ssrRate.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </details>
  );
}

function buildItemMatchRows(pr: PurchaseReceiptRow | PurchaseReceiptRow[], ssr: SupplierStockReturnRow | null) {
  if (!ssr) return [];
  const purchaseReceipts = Array.isArray(pr) ? pr : [pr];
  const prTotals = new Map<string, { itemName: string | null; qty: number }>();
  const ssrTotals = new Map<string, { itemName: string | null; qty: number }>();

  for (const purchaseReceipt of purchaseReceipts) {
    for (const item of purchaseReceipt.items) {
      const current = prTotals.get(item.itemCode);
      prTotals.set(item.itemCode, {
        itemName: current?.itemName ?? item.itemName,
        qty: (current?.qty ?? 0) + (item.stockQty ?? item.qty),
      });
    }
  }
  for (const item of ssr.items) {
    const current = ssrTotals.get(item.itemCode);
    ssrTotals.set(item.itemCode, {
      itemName: current?.itemName ?? item.itemName,
      qty: (current?.qty ?? 0) + item.qty,
    });
  }

  return Array.from(new Set([...prTotals.keys(), ...ssrTotals.keys()]))
    .map((itemCode) => {
      const prItem = prTotals.get(itemCode);
      const ssrItem = ssrTotals.get(itemCode);
      const prQty = prItem?.qty ?? 0;
      const ssrQty = ssrItem?.qty ?? 0;
      return {
        itemCode,
        itemName: prItem?.itemName ?? ssrItem?.itemName ?? null,
        prQty,
        ssrQty,
        matched: Math.abs(prQty - ssrQty) <= 0.000001,
      };
    })
    .sort((a, b) => Number(a.matched) - Number(b.matched) || a.itemCode.localeCompare(b.itemCode));
}
function GrnStageTimeline({
  row,
  permissions,
  busyKey,
  onRevert,
  onHandoverReceived,
  onNotReceived,
}: {
  row: PurchaseReceiptRow;
  permissions: GrnPanelPermissions;
  busyKey: string | null;
  onRevert: (row: PurchaseReceiptRow, field: "handoverAt" | "valuedAt" | "receivedAt") => void;
  onHandoverReceived: (row: PurchaseReceiptRow) => void;
  onNotReceived: (row: PurchaseReceiptRow) => void;
}) {
  const stages = [
    {
      label: "Handover",
      field: "handoverAt" as const,
      at: row.handoverAt,
      by: row.handoverBy,
      fallbackBy: null,
      revertedAt: row.handoverRevertedAt,
      revertedBy: row.handoverRevertedBy,
      handoverReceivedAt: row.handoverReceivedAt,
      handoverReceivedBy: row.handoverReceivedBy,
      notReceivedAt: row.notReceivedAt,
      notReceivedBy: row.notReceivedBy,
      canRevert: permissions.canMarkHandover,
      canMarkNotReceived: permissions.canMarkValued,
    },
    {
      label: "Valued",
      field: "valuedAt" as const,
      at: row.valuedAt,
      by: row.valuedBy,
      fallbackBy: "Cosmo API",
      revertedAt: row.valuedRevertedAt,
      revertedBy: row.valuedRevertedBy,
      handoverReceivedAt: null,
      handoverReceivedBy: null,
      notReceivedAt: null,
      notReceivedBy: null,
      canRevert: permissions.canMarkValued,
      canMarkNotReceived: false,
    },
    {
      label: "GRN Received",
      field: "receivedAt" as const,
      at: row.receivedAt,
      by: row.receivedBy,
      fallbackBy: null,
      revertedAt: row.receivedRevertedAt,
      revertedBy: row.receivedRevertedBy,
      handoverReceivedAt: null,
      handoverReceivedBy: null,
      notReceivedAt: null,
      notReceivedBy: null,
      canRevert: permissions.canMarkReceived,
      canMarkNotReceived: false,
    },
  ];

  return (
    <div className="rounded-lg border bg-background/50 p-4">
      <h3 className="mb-3 text-sm font-semibold">GRN stages</h3>
      <div className="space-y-0">
        {stages.map((stage, index) => {
          const complete = Boolean(stage.at);
          return (
            <div key={stage.label} className="relative grid grid-cols-[2rem_1fr_auto] gap-3 pb-5 last:pb-0">
              {index < stages.length - 1 && (
                <span className="absolute left-4 top-8 h-[calc(100%-2rem)] w-px bg-border" />
              )}
              <span
                className={
                  complete
                    ? "relative z-10 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    : "relative z-10 flex size-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground"
                }
              >
                {complete ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
              </span>
              <div>
                <div className="font-semibold">{stage.label}</div>
                <div className="text-sm text-muted-foreground">
                  {userLabel(stage.by)
                    ? `Marked by ${userLabel(stage.by)}`
                    : complete && stage.fallbackBy
                      ? `Marked by ${stage.fallbackBy}`
                      : "-"}
                </div>
                {stage.revertedAt && (
                  <div className="text-xs text-amber-300">
                    Reverted by {userLabel(stage.revertedBy) ?? "Unknown"} on {formatDate(stage.revertedAt)}
                  </div>
                )}
                {stage.handoverReceivedAt && (
                  <div className="text-xs text-emerald-300">
                    Purchasing received by {userLabel(stage.handoverReceivedBy) ?? "Unknown"} on {formatDate(stage.handoverReceivedAt)}
                  </div>
                )}
                {stage.notReceivedAt && (
                  <div className="text-xs text-amber-300">
                    Marked not received by {userLabel(stage.notReceivedBy) ?? "Unknown"} on {formatDate(stage.notReceivedAt)}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 text-right text-sm text-muted-foreground">
                <span>{formatDate(stage.at)}</span>
                {complete && stage.canRevert && (
                  <div className="flex flex-wrap justify-end gap-2">
                    {stage.canMarkNotReceived && !row.receivedAt && !row.handoverReceivedAt && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={row.isBackfill || row.isCancelled || busyKey === `${row.companyId}:${row.name}:${stage.field}:handover_received`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onHandoverReceived(row);
                        }}
                      >
                        Received
                      </Button>
                    )}
                    {stage.canMarkNotReceived && !row.receivedAt && row.handoverReceivedAt && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={row.isBackfill || row.isCancelled || busyKey === `${row.companyId}:${row.name}:${stage.field}:not_received`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onNotReceived(row);
                        }}
                      >
                        Not received
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={row.isBackfill || row.isCancelled || busyKey === `${row.companyId}:${row.name}:${stage.field}:revert`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRevert(row, stage.field);
                      }}
                    >
                      Revert
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function TallyBadge({
  row,
  missingSsrLink = false,
}: {
  row: PurchaseReceiptRow;
  missingSsrLink?: boolean;
}) {
  if (missingSsrLink) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-300 ring-1 ring-amber-400/25">
        <TriangleAlert className="size-3.5" />
        Issue - missing SSR
      </span>
    );
  }
  if (row.tallyStatus === "matched") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="size-3.5" />
        Matched {row.tallyPercentage == null ? "" : `${row.tallyPercentage.toFixed(2)}%`}
      </span>
    );
  }
  if (row.tallyStatus === "issue") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800"
        title={row.tallyIssueItems.join(", ")}
      >
        <TriangleAlert className="size-3.5" />
        Issue {row.tallyPercentage == null ? "" : `${row.tallyPercentage.toFixed(2)}%`}
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">Not linked</span>;
}

function PaginationControls({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: PageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSize) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-2 border-t bg-background/35 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <div>
        Showing {start}-{end} of {total}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value) as PageSize)}
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option} / page
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            Previous
          </Button>
          <span className="min-w-20 text-center">
            Page {page} of {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function PurchaseReceiptPicker({
  value,
  disabled,
  purchaseReceipts,
  onChange,
}: {
  value: string;
  disabled: boolean;
  purchaseReceipts: PurchaseReceiptRow[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = purchaseReceipts.find((row) => `${row.companyId}:${row.name}` === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-auto min-h-9 w-full justify-between gap-2 px-3 py-2 text-left font-normal"
        >
          <span className="min-w-0">
            {selected ? (
              <>
                <span className="block truncate font-medium">{selected.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {selected.supplierName ?? selected.supplier} - {selected.companyName}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Search purchase receipt</span>
            )}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(520px,calc(100vw-2rem))] border-border/70 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search PR, supplier, user..." />
          <CommandList>
            <CommandEmpty>No purchase receipt found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__ no purchase receipt"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <span className="text-muted-foreground">No purchase receipt</span>
              </CommandItem>
              {purchaseReceipts.map((pr) => (
                <CommandItem
                  key={`${pr.companyId}:${pr.name}`}
                  value={[pr.name, pr.supplier, pr.supplierName, pr.grnBy, pr.companyName].filter(Boolean).join(" ")}
                  onSelect={() => {
                    onChange(`${pr.companyId}:${pr.name}`);
                    setOpen(false);
                  }}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{pr.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {pr.supplierName ?? pr.supplier} - {pr.companyName}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
export function GrnPanel({ permissions }: { permissions: GrnPanelPermissions }) {
  const [data, setData] = useState<PageData>({
    purchaseReceipts: [],
    supplierStockReturns: [],
    intercompanySuppliers: [],
  });
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [ssrSearch, setSsrSearch] = useState("");
  const [ssrStatusFilter, setSsrStatusFilter] = useState<SsrStatusFilter>("all");
  const [stageFilter, setStageFilter] = useState<GrnStageFilter>(() => ({
    stage: firstAllowedStage(permissions),
    status: "pending",
  }));
  const [activeTab, setActiveTab] = useState("grn");
  const [prPage, setPrPage] = useState(1);
  const [ssrPage, setSsrPage] = useState(1);
  const [prPageSize, setPrPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [ssrPageSize, setSsrPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [dateRange, setDateRange] = useState(() => getCurrentMonthRange());
  const [selectedPrBySsr, setSelectedPrBySsr] = useState<Record<string, string>>({});
  const [additionalPrBySsr, setAdditionalPrBySsr] = useState<Record<string, string>>({});
  const [selectedPr, setSelectedPr] = useState<PurchaseReceiptRow | null>(null);
  const [selectedPrFocus, setSelectedPrFocus] = useState<PrDialogFocus>(null);
  const [selectedSsr, setSelectedSsr] = useState<SupplierStockReturnRow | null>(null);
  const [selectedBulkPrKeys, setSelectedBulkPrKeys] = useState<Set<string>>(() => new Set());
  const loadDataRequestId = useRef(0);
  const loadDataAbortController = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    const requestId = loadDataRequestId.current + 1;
    loadDataRequestId.current = requestId;
    loadDataAbortController.current?.abort();
    const controller = new AbortController();
    loadDataAbortController.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateRange.from) params.set("from", dateRange.from);
      if (dateRange.to) params.set("to", dateRange.to);
      const res = await fetch(`/api/admin/purchasing/grn/page-data?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load GRN data");
      }
      const json = (await res.json()) as PageData;
      if (requestId !== loadDataRequestId.current) return;
      const purchaseReceiptKeyByName = new Map(
        json.purchaseReceipts.map((row) => [row.name, `${row.companyId}:${row.name}`]),
      );
      setData(json);
      setSelectedPrBySsr(
        Object.fromEntries(
          json.supplierStockReturns.map((row) => [
            `${row.companyId}:${row.name}`,
            row.purchaseReceiptName
              ? purchaseReceiptKeyByName.get(row.purchaseReceiptName) ?? row.purchaseReceiptName
              : row.matchRecommendation && row.matchRecommendation.percentage > 0
                ? `${row.matchRecommendation.companyId}:${row.matchRecommendation.name}`
                : "",
          ]),
        ),
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      notify.error(error instanceof Error ? error.message : "Failed to load GRN data");
    } finally {
      if (requestId === loadDataRequestId.current) {
        setLoading(false);
      }
    }
  }, [dateRange.from, dateRange.to]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(
    () => () => {
      loadDataAbortController.current?.abort();
    },
    [],
  );

  useEffect(() => {
    setStageFilter((current) => {
      const allowedStages: GrnActionStage[] = [
        ...(permissions.canViewHandover ? (["handover"] as const) : []),
        ...(permissions.canViewValued ? (["valued"] as const) : []),
        ...(permissions.canViewReceived ? (["received"] as const) : []),
      ];
      if (allowedStages.length === 0 || allowedStages.includes(current.stage)) return current;
      return { stage: allowedStages[0], status: "pending" };
    });
  }, [permissions.canViewHandover, permissions.canViewReceived, permissions.canViewValued]);

  const activePurchaseReceipts = useMemo(
    () => data.purchaseReceipts.filter((row) => !row.isCancelled),
    [data.purchaseReceipts],
  );

  const intercompanySupplierPrefixes = useMemo(
    () =>
      data.intercompanySuppliers
        .map((row) => ({
          locationId: row.id,
          supplier: row.supplier,
          key: row.supplier.trim().toLowerCase(),
        }))
        .filter((row) => row.key.length > 0),
    [data.intercompanySuppliers],
  );
  const intercompanySupplierRuleForSupplier = useCallback(
    (supplier: string | null | undefined, supplierName?: string | null) => {
      const values = [supplier, supplierName]
        .map((value) => value?.trim().toLowerCase() ?? "")
        .filter(Boolean);
      return intercompanySupplierPrefixes.find((row) => values.some((value) => value.includes(row.key))) ?? null;
    },
    [intercompanySupplierPrefixes],
  );

  const activeIntercompanyPurchaseReceipts = useMemo(
    () =>
      activePurchaseReceipts.filter(
        (row) =>
          !row.adjustmentNo &&
          intercompanySupplierPrefixes.some((rule) => rule.locationId === row.companyLocationId),
      ),
    [activePurchaseReceipts, intercompanySupplierPrefixes],
  );

  const purchaseReceiptByKey = useMemo(
    () => new Map(data.purchaseReceipts.map((row) => [`${row.companyId}:${row.name}`, row])),
    [data.purchaseReceipts],
  );

  const purchaseReceiptOptionsForSsr = useCallback(
    (row: SupplierStockReturnRow) => {
      const rule = intercompanySupplierRuleForSupplier(row.supplier, row.supplierName);
      if (!rule) return [];
      const options = activeIntercompanyPurchaseReceipts.filter(
        (receipt) => receipt.companyLocationId === rule.locationId,
      );
      const linkedNames = new Set(row.purchaseReceiptNames);
      const availableOptions = options.filter((receipt) => !linkedNames.has(receipt.name));
      if (row.matchReviewStatus !== "conflict" || row.conflictMatches.length === 0) return availableOptions;
      const optionByKey = new Map(availableOptions.map((receipt) => [`${receipt.companyId}:${receipt.name}`, receipt]));
      for (const match of row.conflictMatches) {
        const receipt = purchaseReceiptByKey.get(`${match.companyId}:${match.name}`);
        if (receipt) optionByKey.set(`${receipt.companyId}:${receipt.name}`, receipt);
      }
      return [...optionByKey.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
    [activeIntercompanyPurchaseReceipts, intercompanySupplierRuleForSupplier, purchaseReceiptByKey],
  );

  const purchaseReceiptByName = useMemo(
    () => new Map(data.purchaseReceipts.map((row) => [row.name, row])),
    [data.purchaseReceipts],
  );

  const supplierStockReturnByName = useMemo(
    () => new Map(data.supplierStockReturns.map((row) => [row.name, row])),
    [data.supplierStockReturns],
  );



  const selectedPrStockReturn = selectedPr?.adjustmentNo
    ? supplierStockReturnByName.get(selectedPr.adjustmentNo) ?? null
    : null;
  const selectedPrMatchRows = selectedPr
    ? buildItemMatchRows(selectedPr, selectedPrStockReturn)
    : [];
  const selectedPrPriceRows = selectedPr && selectedPrStockReturn
    ? buildPriceTallyRows(selectedPrStockReturn, selectedPr)
    : [];

  const selectedSsrPurchaseReceipt = selectedSsr?.purchaseReceiptName
    ? purchaseReceiptByName.get(selectedSsr.purchaseReceiptName) ?? null
    : null;
  const selectedSsrLinkedPurchaseReceipts = selectedSsr
    ? selectedSsr.purchaseReceiptNames
      .map((name) => purchaseReceiptByName.get(name) ?? null)
      .filter((receipt): receipt is PurchaseReceiptRow => Boolean(receipt))
    : [];

  const selectedSsrKey = selectedSsr ? `${selectedSsr.companyId}:${selectedSsr.name}` : "";
  const selectedSsrPickerValue = selectedSsrKey ? selectedPrBySsr[selectedSsrKey] ?? "" : "";
  const selectedSsrPickerPurchaseReceipt = selectedSsrPickerValue
    ? purchaseReceiptByKey.get(selectedSsrPickerValue) ?? purchaseReceiptByName.get(selectedSsrPickerValue) ?? null
    : null;
  const selectedSsrSuggestedPurchaseReceipt = selectedSsr?.matchRecommendation
    ? purchaseReceiptByKey.get(`${selectedSsr.matchRecommendation.companyId}:${selectedSsr.matchRecommendation.name}`) ?? null
    : null;
  const selectedSsrComparisonPurchaseReceipts = selectedSsrLinkedPurchaseReceipts.length > 0
    ? selectedSsrLinkedPurchaseReceipts
    : [selectedSsrPurchaseReceipt ?? selectedSsrPickerPurchaseReceipt ?? selectedSsrSuggestedPurchaseReceipt].filter(
        (receipt): receipt is PurchaseReceiptRow => Boolean(receipt),
      );
  const selectedSsrComparisonPurchaseReceipt = selectedSsrComparisonPurchaseReceipts[0] ?? null;
  const selectedSsrMatchRows = selectedSsrComparisonPurchaseReceipts.length > 0
    ? buildItemMatchRows(selectedSsrComparisonPurchaseReceipts, selectedSsr)
    : [];

  const selectedSsrPriceRows = selectedSsr
    ? buildPriceTallyRows(selectedSsr, selectedSsrComparisonPurchaseReceipts)
    : [];

  const allowedStageFilters = useMemo(
    () =>
      [
        permissions.canViewHandover ? { key: "handover" as const, label: "Handover marking" } : null,
        permissions.canViewValued ? { key: "valued" as const, label: "Valued marking" } : null,
        permissions.canViewReceived ? { key: "received" as const, label: "GRN received" } : null,
      ].filter((row): row is { key: GrnActionStage; label: string } => Boolean(row)),
    [permissions.canViewHandover, permissions.canViewReceived, permissions.canViewValued],
  );
  const visibleStageColumnCount =
    (permissions.canViewHandover ? 1 : 0) +
    (permissions.canViewValued ? 1 : 0) +
    (permissions.canViewReceived ? 1 : 0);
  const prTableColumnCount = 8 + visibleStageColumnCount;
  const isFinanceStage = stageFilter.stage === "received";
  const companyOptions = useMemo(
    () => [...new Map(data.purchaseReceipts.map((row) => [row.companyName, row.companyName])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1])),
    [data.purchaseReceipts],
  );

  const rowBelongsToStage = useCallback((row: PurchaseReceiptRow, stage: GrnActionStage) => {
    if (row.isCancelled) return false;
    if (stage === "handover") return true;
    if (stage === "valued") return Boolean(row.valuedAt || (row.handoverAt && row.handoverReceivedAt));
    return Boolean(row.valuedAt);
  }, []);

  const rowCompletedForStage = useCallback((row: PurchaseReceiptRow, stage: GrnActionStage) => {
    if (stage === "handover") return Boolean(row.handoverAt);
    if (stage === "valued") return Boolean(row.valuedAt);
    return Boolean(row.receivedAt);
  }, []);

  const rowNeedsVerification = useCallback((row: PurchaseReceiptRow, stage: GrnActionStage) => {
    if (row.isCancelled) return false;
    if (stage === "handover") return Boolean(row.notReceivedAt) && !row.handoverAt;
    if (stage === "valued") return Boolean(row.handoverAt) && !row.handoverReceivedAt && !row.valuedAt;
    return false;
  }, []);

  const rowMissingIntercompanySsr = useCallback(
    (row: PurchaseReceiptRow) => {
      return (
        !row.isCancelled &&
        Boolean(intercompanySupplierRuleForSupplier(row.supplier, row.supplierName)) &&
        !row.adjustmentNo
      );
    },
    [intercompanySupplierRuleForSupplier],
  );

  const rowMismatchedForStage = useCallback((row: PurchaseReceiptRow, stage: GrnActionStage) => {
    if (stage === "handover") return row.tallyStatus === "issue" || rowMissingIntercompanySsr(row);
    if (stage === "valued") return hasPriceMismatch(row);
    return false;
  }, [rowMissingIntercompanySsr]);

  const stageCardCounts = useMemo(
    () =>
      Object.fromEntries(
        allowedStageFilters.map(({ key }) => {
          const rows = data.purchaseReceipts.filter(
            (row) => (companyFilter === "all" || row.companyName === companyFilter) && rowBelongsToStage(row, key),
          );
          const completed = rows.filter((row) => rowCompletedForStage(row, key)).length;
          const mismatch = rows.filter((row) => rowMismatchedForStage(row, key)).length;
          const verify = data.purchaseReceipts.filter(
            (row) => (companyFilter === "all" || row.companyName === companyFilter) && rowNeedsVerification(row, key),
          ).length;
          return [
            key,
            {
              all: rows.length,
              pending: rows.length - completed,
              completed,
              mismatch,
              verify,
            },
          ];
        }),
      ) as Record<GrnActionStage, Record<GrnStageStatusFilter, number>>,
    [allowedStageFilters, companyFilter, data.purchaseReceipts, rowBelongsToStage, rowCompletedForStage, rowMismatchedForStage, rowNeedsVerification],
  );

  const filteredPrs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.purchaseReceipts.filter((row) => {
      if (companyFilter !== "all" && row.companyName !== companyFilter) return false;
      if (term) {
        const matchesSearch = [row.name, row.adjustmentNo, row.supplier, row.supplierName, row.grnBy, row.companyName]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(term));
        return matchesSearch && !row.isCancelled;
      }
      const matchesStage =
        allowedStageFilters.length === 0
          ? !row.isCancelled
          : stageFilter.status === "verify"
            ? rowNeedsVerification(row, stageFilter.stage)
            : rowBelongsToStage(row, stageFilter.stage) &&
        (stageFilter.status === "all" ||
          (stageFilter.status === "pending" && !rowCompletedForStage(row, stageFilter.stage)) ||
          (stageFilter.status === "completed" && rowCompletedForStage(row, stageFilter.stage)) ||
          (stageFilter.status === "mismatch" && rowMismatchedForStage(row, stageFilter.stage)));
      return matchesStage;
    });
  }, [allowedStageFilters.length, companyFilter, data.purchaseReceipts, rowBelongsToStage, rowCompletedForStage, rowMismatchedForStage, rowNeedsVerification, search, stageFilter.stage, stageFilter.status]);

  const fieldForStage = useCallback((stage: GrnActionStage): "handoverAt" | "valuedAt" | "receivedAt" => {
    if (stage === "handover") return "handoverAt";
    if (stage === "valued") return "valuedAt";
    return "receivedAt";
  }, []);

  const isPurchasingReceiveBulk = stageFilter.stage === "valued" && stageFilter.status === "verify";

  const canBulkMarkRow = useCallback(
    (row: PurchaseReceiptRow) => {
      if (row.isBackfill || row.isCancelled || rowCompletedForStage(row, stageFilter.stage)) return false;
      if (isPurchasingReceiveBulk) {
        return permissions.canMarkValued && Boolean(row.handoverAt) && !row.handoverReceivedAt && !row.valuedAt;
      }
      if (stageFilter.stage === "handover") {
        return permissions.canMarkHandover && row.tallyStatus !== "issue" && !rowMissingIntercompanySsr(row);
      }
      if (stageFilter.stage === "valued") {
        return permissions.canMarkValued && Boolean(row.handoverAt && row.handoverReceivedAt) && !hasPriceMismatch(row);
      }
      return permissions.canMarkReceived && Boolean(row.handoverAt) && Boolean(row.valuedAt);
    },
    [
      isPurchasingReceiveBulk,
      permissions.canMarkHandover,
      permissions.canMarkReceived,
      permissions.canMarkValued,
      rowCompletedForStage,
      rowMissingIntercompanySsr,
      stageFilter.stage,
    ],
  );

  const bulkMarkablePrs = useMemo(
    () => filteredPrs.filter((row) => canBulkMarkRow(row)),
    [canBulkMarkRow, filteredPrs],
  );
  const bulkActionLabel = isPurchasingReceiveBulk ? "Mark received" : "Mark all";
  const bulkRowsLabel = isPurchasingReceiveBulk ? "handovered row" : "clean pending row";
  const bulkBusyKey = isPurchasingReceiveBulk
    ? "bulk:handoverAt:handover_received"
    : `bulk:${fieldForStage(stageFilter.stage)}:mark`;

  const bulkMarkableKeys = useMemo(
    () => new Set(bulkMarkablePrs.map((row) => `${row.companyId}:${row.name}`)),
    [bulkMarkablePrs],
  );

  const ssrMatchesSearch = useCallback(
    (row: SupplierStockReturnRow) => {
      const term = ssrSearch.trim().toLowerCase();
      if (!term) return true;
      return [row.name, row.supplier, row.supplierName, row.purchaseReceiptName, row.owner, row.companyName, row.matchRecommendation?.name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    },
    [ssrSearch],
  );

  const ssrReviewBaseRows = useMemo(
    () =>
      data.supplierStockReturns.filter(
        (row) =>
          row.docstatus === 1 &&
          (!row.purchaseReceiptName || (row.matchRecommendation?.percentage ?? 0) < 100) &&
          (!permissions.canMatchSsr || Boolean(intercompanySupplierRuleForSupplier(row.supplier, row.supplierName))),
      ),
    [data.supplierStockReturns, intercompanySupplierRuleForSupplier, permissions.canMatchSsr],
  );

  const ssrStatusCounts = useMemo(
    () => {
      const counts: Record<SsrStatusFilter, number> = {
        all: ssrReviewBaseRows.length,
        waiting: 0,
        partial: 0,
        conflict: 0,
      };
      for (const row of ssrReviewBaseRows) {
        counts[ssrStatusForFilter(row)] += 1;
      }
      return counts;
    },
    [ssrReviewBaseRows],
  );

  const filteredSsrs = useMemo(
    () =>
      ssrReviewBaseRows.filter(
        (row) =>
          (ssrStatusFilter === "all" || ssrStatusForFilter(row) === ssrStatusFilter) &&
          ssrMatchesSearch(row),
      ),
    [ssrMatchesSearch, ssrReviewBaseRows, ssrStatusFilter],
  );

  const filteredMatchedSsrs = useMemo(
    () =>
      data.supplierStockReturns.filter(
        (row) =>
          row.docstatus === 1 &&
          Boolean(row.purchaseReceiptName) &&
          (row.matchRecommendation?.percentage ?? 0) >= 100 &&
          (!permissions.canMatchSsr || Boolean(intercompanySupplierRuleForSupplier(row.supplier, row.supplierName))) &&
          ssrMatchesSearch(row),
      ),
    [data.supplierStockReturns, intercompanySupplierRuleForSupplier, permissions.canMatchSsr, ssrMatchesSearch],
  );

  const multiLinkSsrs = useMemo(
    () =>
      data.supplierStockReturns.filter(
        (row) =>
          row.docstatus === 1 &&
          (row.matchRecommendation?.percentage ?? 0) < 100 &&
          (!permissions.canMatchSsr || Boolean(intercompanySupplierRuleForSupplier(row.supplier, row.supplierName))) &&
          ssrMatchesSearch(row),
      ),
    [data.supplierStockReturns, intercompanySupplierRuleForSupplier, permissions.canMatchSsr, ssrMatchesSearch],
  );

  const prPageCount = Math.max(1, Math.ceil(filteredPrs.length / prPageSize));
  const ssrPageCount = Math.max(1, Math.ceil(filteredSsrs.length / ssrPageSize));
  const paginatedPrs = useMemo(
    () => filteredPrs.slice((prPage - 1) * prPageSize, prPage * prPageSize),
    [filteredPrs, prPage, prPageSize],
  );
  const paginatedSsrs = useMemo(
    () => filteredSsrs.slice((ssrPage - 1) * ssrPageSize, ssrPage * ssrPageSize),
    [filteredSsrs, ssrPage, ssrPageSize],
  );

  useEffect(() => {
    setPrPage(1);
  }, [companyFilter, search, stageFilter.stage, stageFilter.status, dateRange.from, dateRange.to, prPageSize]);

  useEffect(() => {
    setSsrPage(1);
  }, [ssrSearch, ssrStatusFilter, dateRange.from, dateRange.to, ssrPageSize]);

  useEffect(() => {
    if (prPage > prPageCount) setPrPage(prPageCount);
  }, [prPage, prPageCount]);

  useEffect(() => {
    if (ssrPage > ssrPageCount) setSsrPage(ssrPageCount);
  }, [ssrPage, ssrPageCount]);

  useEffect(() => {
    setSelectedBulkPrKeys((current) => {
      const next = new Set([...current].filter((key) => bulkMarkableKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [bulkMarkableKeys]);

  function openPurchaseReceipt(row: PurchaseReceiptRow, focus: PrDialogFocus = null) {
    setSelectedPrFocus(focus);
    setSelectedPr(row);
  }

  function focusForCurrentMismatchFilter(row: PurchaseReceiptRow): PrDialogFocus {
    if (stageFilter.status !== "mismatch") return null;
    if (stageFilter.stage === "handover" && row.tallyStatus === "issue") return "item-mismatch";
    if (stageFilter.stage === "handover" && rowMissingIntercompanySsr(row)) return "missing-ssr";
    if (stageFilter.stage === "valued" && hasPriceMismatch(row)) return "price-mismatch";
    return null;
  }

  async function mark(
    row: PurchaseReceiptRow,
    field: "handoverAt" | "valuedAt" | "receivedAt",
    action: "mark" | "revert" | "not_received" | "handover_received" = "mark",
  ) {
    if (row.isBackfill) {
      notify.error("Backfilled GRN rows are read-only");
      return;
    }
    const key = `${row.companyId}:${row.name}:${field}:${action}`;
    setBusyKey(key);
    try {
      const res = await fetch(
        `/api/admin/purchasing/grn/purchase-receipts/${encodeURIComponent(row.name)}/mark`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, action, companyId: row.companyId }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error ||
            (action === "revert"
              ? "Failed to revert GRN row"
              : action === "not_received"
                ? "Failed to mark GRN row as not received"
                : "Failed to mark GRN row"),
        );
      }
      await loadData();
    } catch (error) {
      notify.error(
        error instanceof Error
          ? error.message
          : action === "revert"
            ? "Failed to revert GRN row"
            : action === "not_received"
              ? "Failed to mark GRN row as not received"
              : "Failed to mark GRN row",
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function markSelectedRows() {
    const rows = bulkMarkablePrs.filter((row) => selectedBulkPrKeys.has(`${row.companyId}:${row.name}`));
    if (rows.length === 0) {
      notify.error("Select at least one clean pending row first");
      return;
    }
    const field = isPurchasingReceiveBulk ? "handoverAt" : fieldForStage(stageFilter.stage);
    const action = isPurchasingReceiveBulk ? "handover_received" : "mark";
    const bulkKey = `bulk:${field}:${action}`;
    setBusyKey(bulkKey);
    try {
      const results = await Promise.all(
        rows.map((row) =>
          fetch(`/api/admin/purchasing/grn/purchase-receipts/${encodeURIComponent(row.name)}/mark`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ field, action, companyId: row.companyId }),
          }),
        ),
      );
      const failed = results.filter((res) => !res.ok).length;
      if (failed > 0) {
        notify.error(`${failed} row${failed === 1 ? "" : "s"} could not be marked`);
      } else if (isPurchasingReceiveBulk) {
        notify.success(`${rows.length} row${rows.length === 1 ? "" : "s"} marked received`);
      }
      setSelectedBulkPrKeys(new Set());
      await loadData();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to mark selected rows");
    } finally {
      setBusyKey(null);
    }
  }

  async function linkSsr(row: SupplierStockReturnRow) {
    if (!permissions.canMatchSsr) {
      notify.error("You do not have permission to match SSRs");
      return;
    }
    const key = `${row.companyId}:${row.name}`;
    const selectedPrKey = selectedPrBySsr[key] || "";
    const separatorIndex = selectedPrKey.indexOf(":");
    const purchaseReceiptCompanyId = separatorIndex >= 0 ? selectedPrKey.slice(0, separatorIndex) : undefined;
    const purchaseReceiptName = separatorIndex >= 0 ? selectedPrKey.slice(separatorIndex + 1) : selectedPrKey || null;
    setBusyKey(`link:${key}`);
    try {
      const res = await fetch(
        `/api/admin/purchasing/grn/supplier-stock-returns/${encodeURIComponent(row.name)}/link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchaseReceiptName, companyId: row.companyId, purchaseReceiptCompanyId }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to link SSR");
      }
      await loadData();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to link SSR");
    } finally {
      setBusyKey(null);
    }
  }

  async function appendSsrPurchaseReceipt(row: SupplierStockReturnRow) {
    if (!permissions.canMatchSsr) {
      notify.error("You do not have permission to match SSRs");
      return;
    }
    const key = `${row.companyId}:${row.name}`;
    const selectedPrKey = additionalPrBySsr[key] || "";
    const separatorIndex = selectedPrKey.indexOf(":");
    const purchaseReceiptCompanyId = separatorIndex >= 0 ? selectedPrKey.slice(0, separatorIndex) : undefined;
    const purchaseReceiptName = separatorIndex >= 0 ? selectedPrKey.slice(separatorIndex + 1) : selectedPrKey;
    if (!purchaseReceiptName) {
      notify.error("Select another purchase receipt first");
      return;
    }
    setBusyKey(`append-link:${key}`);
    try {
      const res = await fetch(
        `/api/admin/purchasing/grn/supplier-stock-returns/${encodeURIComponent(row.name)}/link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "append",
            purchaseReceiptName,
            companyId: row.companyId,
            purchaseReceiptCompanyId,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to add purchase receipt link");
      }
      setAdditionalPrBySsr((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
      await loadData();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to add purchase receipt link");
    } finally {
      setBusyKey(null);
    }
  }

  async function removeSsrPurchaseReceipt(row: SupplierStockReturnRow, purchaseReceiptName: string) {
    if (!permissions.canMatchSsr) {
      notify.error("You do not have permission to match SSRs");
      return;
    }
    const purchaseReceipt = data.purchaseReceipts.find((candidate) => candidate.name === purchaseReceiptName);
    if (!purchaseReceipt) {
      notify.error("Purchase receipt not found in the current data range");
      return;
    }
    const key = `${row.companyId}:${row.name}`;
    setBusyKey(`remove-link:${key}:${purchaseReceiptName}`);
    try {
      const res = await fetch(
        `/api/admin/purchasing/grn/supplier-stock-returns/${encodeURIComponent(row.name)}/link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "remove",
            purchaseReceiptName,
            companyId: row.companyId,
            purchaseReceiptCompanyId: purchaseReceipt.companyId,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to remove purchase receipt link");
      }
      await loadData();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to remove purchase receipt link");
    } finally {
      setBusyKey(null);
    }
  }

  async function unlinkSsr(row: SupplierStockReturnRow) {
    if (!permissions.canMatchSsr) {
      notify.error("You do not have permission to match SSRs");
      return;
    }
    const key = `${row.companyId}:${row.name}`;
    setBusyKey(`unlink:${key}`);
    try {
      const res = await fetch(
        `/api/admin/purchasing/grn/supplier-stock-returns/${encodeURIComponent(row.name)}/link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchaseReceiptName: null, companyId: row.companyId }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to unlink SSR");
      }
      setSelectedPrBySsr((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await loadData();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to unlink SSR");
    } finally {
      setBusyKey(null);
    }
  }

  function downloadGrnExport(format: "xlsx" | "pdf") {
    const params = new URLSearchParams({ format });
    if (dateRange.from) params.set("from", dateRange.from);
    if (dateRange.to) params.set("to", dateRange.to);
    window.location.href = `/api/admin/purchasing/grn/export?${params.toString()}`;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">GRN</h1>
          <p className="text-sm text-muted-foreground">
            Purchase receipt handover, valuation, receiving, and supplier stock return matching.
          </p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Refresh
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          className="sm:w-40"
          type="date"
          value={dateRange.from}
          onChange={(event) =>
            setDateRange((current) => ({ ...current, from: event.target.value }))
          }
        />
        <Input
          className="sm:w-40"
          type="date"
          value={dateRange.to}
          onChange={(event) =>
            setDateRange((current) => ({ ...current, to: event.target.value }))
          }
        />

      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
        <TabsList className="h-auto w-full justify-start gap-1 sm:w-fit">
          <TabsTrigger value="grn">GRN table</TabsTrigger>
          <TabsTrigger value="ssr">SSR matcher</TabsTrigger>
          <TabsTrigger value="multi">Multiple PR links</TabsTrigger>
        </TabsList>

        <TabsContent value="grn" className="space-y-4 rounded-lg border bg-card/60 p-4 md:p-6">
          {allowedStageFilters.length > 0 && (
            <div className="grid gap-3 xl:grid-cols-3">
              {allowedStageFilters.map(({ key, label }) => (
                <div key={key} className="rounded-lg border bg-background/45 p-3">
                  <div className="mb-2 text-sm font-semibold">{label}</div>
                  <div
                    className={
                      key === "received"
                        ? "grid grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-2"
                        : "grid grid-cols-[repeat(auto-fit,minmax(104px,1fr))] gap-2"
                    }
                  >
                    {(
                      key === "received"
                        ? (["all", "pending", "completed"] as const)
                        : (["all", "pending", "completed", "mismatch", "verify"] as const)
                    ).map((status) => {
                      const active = stageFilter.stage === key && stageFilter.status === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          className={[
                            "min-w-0 rounded-md border px-3 py-2 text-left transition-colors",
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-card hover:bg-muted/60",
                          ].join(" ")}
                          onClick={() => setStageFilter({ stage: key, status })}
                        >
                          <div className="truncate text-xs font-medium capitalize text-muted-foreground">
                            {status}
                          </div>
                          <div className="text-xl font-semibold leading-tight">
                            {stageCardCounts[key]?.[status] ?? 0}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-lg font-semibold">Purchase receipts</h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={companyFilter}
                onChange={(event) => setCompanyFilter(event.target.value)}
                aria-label="Filter by company"
              >
                <option value="all">All companies</option>
                {companyOptions.map(([companyName]) => (
                  <option key={companyName} value={companyName}>
                    {companyName}
                  </option>
                ))}
              </select>
              <Input
                className="sm:w-72"
                placeholder="Search PR, adjustment, supplier"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Button type="button" variant="outline" onClick={() => downloadGrnExport("xlsx")}>
                <FileDown className="size-4" />
                Excel
              </Button>
              <Button type="button" variant="outline" onClick={() => downloadGrnExport("pdf")}>
                <FileDown className="size-4" />
                PDF
              </Button>
            </div>
          </div>
          {allowedStageFilters.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border bg-background/45 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                {selectedBulkPrKeys.size} selected from {bulkMarkablePrs.length} {bulkRowsLabel}{bulkMarkablePrs.length === 1 ? "" : "s"}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={bulkMarkablePrs.length === 0}
                  onClick={() => setSelectedBulkPrKeys(new Set(bulkMarkablePrs.map((row) => `${row.companyId}:${row.name}`)))}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={selectedBulkPrKeys.size === 0}
                  onClick={() => setSelectedBulkPrKeys(new Set())}
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={selectedBulkPrKeys.size === 0 || busyKey === bulkBusyKey}
                  onClick={markSelectedRows}
                >
                  {busyKey === bulkBusyKey && <Loader2 className="size-4 animate-spin" />}
                  {bulkActionLabel}
                </Button>
              </div>
            </div>
          )}
          <div className="overflow-hidden rounded-lg border bg-background/45">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    aria-label={`Select all ${bulkRowsLabel}s`}
                    checked={bulkMarkablePrs.length > 0 && selectedBulkPrKeys.size === bulkMarkablePrs.length}
                    disabled={bulkMarkablePrs.length === 0}
                    onChange={(event) =>
                      setSelectedBulkPrKeys(
                        event.target.checked
                          ? new Set(bulkMarkablePrs.map((row) => `${row.companyId}:${row.name}`))
                          : new Set(),
                      )
                    }
                  />
                </TableHead>
                <TableHead>PR No</TableHead>
                <TableHead className="w-28 whitespace-normal leading-tight">Adjustment<br />No</TableHead>
                <TableHead>GRN Date</TableHead>
                <TableHead>GRN By</TableHead>
                <TableHead>Supplier</TableHead>
                {permissions.canViewHandover && (
                  <TableHead className="w-24 whitespace-normal leading-tight">Handover<br />Date</TableHead>
                )}
                {permissions.canViewValued && <TableHead>Valued</TableHead>}
                <TableHead className="w-20 whitespace-normal leading-tight">PI<br />Prices</TableHead>
                {permissions.canViewReceived && (
                  <TableHead className="w-24 whitespace-normal leading-tight">GRN<br />Received</TableHead>
                )}
                <TableHead>{isFinanceStage ? "Total" : "Tally"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={prTableColumnCount} className="h-24 text-center text-muted-foreground">
                    Loading GRN data...
                  </TableCell>
                </TableRow>
              ) : filteredPrs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={prTableColumnCount} className="h-24 text-center text-muted-foreground">
                    No purchase receipts found.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedPrs.map((row) => (
                  <TableRow key={`${row.companyId}:${row.name}`} className="cursor-pointer" onClick={() => openPurchaseReceipt(row, focusForCurrentMismatchFilter(row))}>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.name}`}
                        checked={selectedBulkPrKeys.has(`${row.companyId}:${row.name}`)}
                        disabled={!canBulkMarkRow(row)}
                        onChange={(event) =>
                          setSelectedBulkPrKeys((current) => {
                            const next = new Set(current);
                            const key = `${row.companyId}:${row.name}`;
                            if (event.target.checked) next.add(key);
                            else next.delete(key);
                            return next;
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="text-left text-primary underline-offset-4 hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            openPurchaseReceipt(row, focusForCurrentMismatchFilter(row));
                          }}
                        >
                          {row.name}
                        </button>
                        {row.isCancelled && <CancelledBadge />}
                      </div>
                      {row.amendedFrom && (
                        <div className="text-xs text-muted-foreground">Amended from {row.amendedFrom}</div>
                      )}
                      {(itemIssueCount(row) > 0 || priceIssueCount(row) > 0 || rowMissingIntercompanySsr(row)) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {rowMissingIntercompanySsr(row) && (
                            <button
                              type="button"
                              className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-300 ring-1 ring-amber-400/25 underline-offset-4 hover:underline"
                              onClick={(event) => {
                                event.stopPropagation();
                                openPurchaseReceipt(row, "missing-ssr");
                              }}
                            >
                              Missing SSR link
                            </button>
                          )}
                          {itemIssueCount(row) > 0 && (
                            <button
                              type="button"
                              className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-800"
                              onClick={(event) => {
                                event.stopPropagation();
                                openPurchaseReceipt(row, "item-mismatch");
                              }}
                            >
                              {itemIssueCount(row)} item issue{itemIssueCount(row) === 1 ? "" : "s"}
                            </button>
                          )}
                          {priceIssueCount(row) > 0 && (
                            <button
                              type="button"
                              className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-800"
                              onClick={(event) => {
                                event.stopPropagation();
                                openPurchaseReceipt(row, "price-mismatch");
                              }}
                            >
                              {priceIssueCount(row)} price issue{priceIssueCount(row) === 1 ? "" : "s"}
                            </button>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{row.adjustmentNo ?? "-"}</span>
                        {row.adjustmentDocstatus === 2 && <CancelledBadge />}
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(row.grnDate)}</TableCell>
                    <TableCell>{row.grnBy ?? "-"}</TableCell>
                    <TableCell>
                      <div>{row.supplier}</div>
                      {row.supplierName && (
                        <div className="text-xs text-muted-foreground">{row.supplierName}</div>
                      )}
                    </TableCell>
                    {permissions.canViewHandover && (
                      <TableCell>
                        {row.handoverAt ? (
                          formatDate(row.handoverAt)
                        ) : permissions.canMarkHandover ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={row.isBackfill || row.isCancelled || busyKey === `${row.companyId}:${row.name}:handoverAt:mark`}
                            onClick={(event) => {
                              event.stopPropagation();
                              mark(row, "handoverAt");
                            }}
                          >
                            Mark
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                    {permissions.canViewValued && (
                      <TableCell>
                        {row.valuedAt ? (
                          formatDate(row.valuedAt)
                        ) : permissions.canMarkValued ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={row.isBackfill || row.isCancelled || !row.handoverAt || !row.handoverReceivedAt || busyKey === `${row.companyId}:${row.name}:valuedAt:mark`}
                            onClick={(event) => {
                              event.stopPropagation();
                              mark(row, "valuedAt");
                            }}
                          >
                            Mark
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <PurchaseInvoiceStatusBadge row={row} />
                    </TableCell>
                    {permissions.canViewReceived && (
                      <TableCell>
                        {row.receivedAt ? (
                          formatDate(row.receivedAt)
                        ) : permissions.canMarkReceived ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={row.isBackfill || row.isCancelled || !row.handoverAt || !row.valuedAt || busyKey === `${row.companyId}:${row.name}:receivedAt:mark`}
                            onClick={(event) => {
                              event.stopPropagation();
                              mark(row, "receivedAt");
                            }}
                          >
                            Mark
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      {isFinanceStage ? (
                        row.purchaseInvoice ? (
                          purchaseInvoiceTotal(row).toLocaleString("en-LK", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )
                      ) : (
                        <TallyBadge row={row} missingSsrLink={rowMissingIntercompanySsr(row)} />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <PaginationControls
            page={prPage}
            pageCount={prPageCount}
            total={filteredPrs.length}
            pageSize={prPageSize}
            onPageChange={setPrPage}
            onPageSizeChange={setPrPageSize}
          />
          </div>
        </TabsContent>

        <TabsContent value="ssr" className="space-y-4 rounded-lg border bg-card/60 p-4 md:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-lg font-semibold">SSR review queue</h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                className="sm:w-72"
                placeholder="Search SSR, supplier, PR"
                value={ssrSearch}
                onChange={(event) => setSsrSearch(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveTab("multi")}
              >
                <Link2 className="size-4" />
                Multiple PR links
              </Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {SSR_STATUS_FILTERS.map((option) => {
              const active = ssrStatusFilter === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`rounded-lg border px-4 py-3 text-left transition ${
                    active
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-background/45 text-muted-foreground hover:border-primary/60 hover:text-foreground"
                  }`}
                  onClick={() => setSsrStatusFilter(option.key)}
                >
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-1 block text-2xl font-semibold text-foreground">
                    {ssrStatusCounts[option.key]}
                  </span>
                </button>
              );
            })}
          </div>
        <div className="overflow-hidden rounded-lg border bg-background/45">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SSR No</TableHead>
                <TableHead>Return Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Suggested PR</TableHead>
                <TableHead>Match</TableHead>
                <TableHead className="w-20 whitespace-normal leading-tight">PI<br />Prices</TableHead>
                <TableHead>Purchase Receipt</TableHead>
                <TableHead className="w-24">Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSsrs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                    No supplier stock returns waiting for review.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedSsrs.map((row) => {
                  const rowKey = `${row.companyId}:${row.name}`;
                  const suggestedPr = row.matchRecommendation && row.matchRecommendation.percentage > 0
                    ? purchaseReceiptByKey.get(`${row.matchRecommendation.companyId}:${row.matchRecommendation.name}`) ?? null
                    : null;
                  return (
                  <TableRow key={rowKey} className="cursor-pointer" onClick={() => setSelectedSsr(row)}>
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="text-left text-primary underline-offset-4 hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedSsr(row);
                          }}
                        >
                          {row.name}
                        </button>
                        {row.docstatus === 2 && <CancelledBadge />}
                      </div>
                      {row.amendedFrom && (
                        <div className="text-xs text-muted-foreground">Amended from {row.amendedFrom}</div>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(row.returnDate ?? row.creation)}</TableCell>
                    <TableCell>
                      <div>{row.supplier}</div>
                      {row.supplierName && (
                        <div className="text-xs text-muted-foreground">{row.supplierName}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedSsr(row);
                        }}
                      >
                        <Eye className="size-4" />
                        View
                      </Button>
                    </TableCell>
                    <TableCell>
                      {suggestedPr ? (
                        <div className="space-y-1">
                          <button
                            type="button"
                            className="text-left text-primary underline-offset-4 hover:underline"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedPr(suggestedPr);
                            }}
                          >
                            <span className="block font-medium">{suggestedPr.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {suggestedPr.supplierName ?? suggestedPr.supplier}
                            </span>
                          </button>
                          {row.matchReviewStatus === "conflict" && row.conflictMatches.length > 1 && (
                            <div className="text-xs text-amber-300">
                              Also matches {row.conflictMatches.filter((match) => match.name !== suggestedPr.name).map((match) => match.name).join(", ")}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Waiting</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.matchRecommendation && row.matchRecommendation.percentage > 0 ? (
                        <div>
                          <div className="font-medium">{row.matchRecommendation.percentage.toFixed(2)}%</div>
                          <div className="text-xs text-muted-foreground">
                            {row.matchReviewStatus === "matched"
                              ? "Matched"
                              : row.matchReviewStatus === "conflict"
                                ? "Conflict"
                              : row.matchReviewStatus === "review"
                                ? row.matchRecommendation.percentage >= 100
                                  ? "Ready to link"
                                  : "Partial match"
                                : row.matchRecommendation.percentage === 0
                                  ? "Waiting - no SKU/qty overlap"
                                  : "Waiting"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No candidate</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <PurchaseInvoiceStatusBadge row={suggestedPr} />
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <PurchaseReceiptPicker
                        value={selectedPrBySsr[rowKey] ?? ""}
                        disabled={row.docstatus === 2 || !permissions.canMatchSsr}
                        purchaseReceipts={purchaseReceiptOptionsForSsr(row)}
                        onChange={(value) =>
                          setSelectedPrBySsr((prev) => ({
                            ...prev,
                            [rowKey]: value,
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={row.docstatus === 2 || !permissions.canMatchSsr || busyKey === `link:${rowKey}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          linkSsr(row);
                        }}
                      >
                        <Link2 className="size-4" />
                        Save
                      </Button>
                      {row.purchaseReceiptName && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={row.docstatus === 2 || !permissions.canMatchSsr || busyKey === `unlink:${rowKey}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            unlinkSsr(row);
                          }}
                        >
                          <Trash2 className="size-4" />
                          Unlink
                        </Button>
                      )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <PaginationControls
            page={ssrPage}
            pageCount={ssrPageCount}
            total={filteredSsrs.length}
            pageSize={ssrPageSize}
            onPageChange={setSsrPage}
            onPageSizeChange={setSsrPageSize}
          />
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-semibold">Linked SSR records</h3>
          <div className="overflow-hidden rounded-lg border bg-background/45">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SSR No</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Current PR</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead className="w-20 whitespace-normal leading-tight">PI<br />Prices</TableHead>
                  <TableHead>Replace primary PR</TableHead>
                  <TableHead className="w-24">Save</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMatchedSsrs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                      No linked SSR records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMatchedSsrs.map((row) => {
                    const rowKey = `${row.companyId}:${row.name}`;
                    const linkedPr = row.purchaseReceiptName
                      ? purchaseReceiptByName.get(row.purchaseReceiptName) ?? null
                      : row.matchRecommendation
                        ? purchaseReceiptByKey.get(`${row.matchRecommendation.companyId}:${row.matchRecommendation.name}`) ?? null
                        : null;
                    const linkedPrKey = linkedPr ? `${linkedPr.companyId}:${linkedPr.name}` : "";
                    const selectedPrChanged =
                      Boolean(selectedPrBySsr[rowKey]) &&
                      selectedPrBySsr[rowKey] !== linkedPrKey &&
                      selectedPrBySsr[rowKey] !== row.purchaseReceiptName;
                    const matchedPercentage = row.matchRecommendation?.percentage ?? 0;
                    const isCleanMatch = matchedPercentage >= 100;
                    return (
                      <TableRow key={`matched:${rowKey}`} className="cursor-pointer" onClick={() => setSelectedSsr(row)}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>
                          <div>{row.supplier}</div>
                          {row.supplierName && (
                            <div className="text-xs text-muted-foreground">{row.supplierName}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.purchaseReceiptNames.length > 0
                            ? row.purchaseReceiptNames.map((name) => <div key={name}>{name}</div>)
                            : linkedPr?.name ?? "-"}
                        </TableCell>
                        <TableCell>
                          {row.matchRecommendation ? (
                            <div>
                              <div className="font-medium">{row.matchRecommendation.percentage.toFixed(2)}%</div>
                              <div className="text-xs text-muted-foreground">
                                {row.matchReviewStatus === "conflict"
                                  ? "Conflict"
                                  : isCleanMatch
                                    ? "Matched"
                                    : matchedPercentage <= 0
                                      ? "Issue - no SKU/qty overlap"
                                      : "Issue - needs review"}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <PurchaseInvoiceStatusBadge row={linkedPr} />
                        </TableCell>
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <PurchaseReceiptPicker
                            value={selectedPrBySsr[rowKey] ?? ""}
                            disabled={row.docstatus === 2 || !permissions.canMatchSsr}
                            purchaseReceipts={purchaseReceiptOptionsForSsr(row)}
                            onChange={(value) =>
                              setSelectedPrBySsr((prev) => ({
                                ...prev,
                                [rowKey]: value,
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                          {selectedPrChanged ? (
                            <Button
                              size="sm"
                              disabled={row.docstatus === 2 || !permissions.canMatchSsr || busyKey === `link:${rowKey}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                linkSsr(row);
                              }}
                            >
                              <Link2 className="size-4" />
                              Save
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                          {row.purchaseReceiptName && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={row.docstatus === 2 || !permissions.canMatchSsr || busyKey === `unlink:${rowKey}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                unlinkSsr(row);
                              }}
                            >
                              <Trash2 className="size-4" />
                              Unlink
                            </Button>
                          )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        </TabsContent>

        <TabsContent value="multi" className="space-y-4 rounded-lg border bg-card/60 p-4 md:p-6">
        <div id="multiple-pr-links" className="space-y-3 scroll-mt-4">
          <div>
            <h3 className="text-base font-semibold">Multiple PR links</h3>
            <p className="text-sm text-muted-foreground">
              Add or remove PRs for an SSR here. The combined tally uses every linked PR.
            </p>
          </div>
          <div className="overflow-hidden rounded-lg border bg-background/45">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SSR No</TableHead>
                  <TableHead>Linked PRs</TableHead>
                  <TableHead>Combined tally</TableHead>
                  <TableHead>Price tally</TableHead>
                  <TableHead>Add another PR</TableHead>
                  <TableHead className="w-28">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {multiLinkSsrs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                      No pending or mismatched SSR records available for multiple PR matching.
                    </TableCell>
                  </TableRow>
                ) : (
                  multiLinkSsrs.map((row) => {
                    const rowKey = `${row.companyId}:${row.name}`;
                    const linkedReceipts = row.purchaseReceiptNames
                      .map((name) => purchaseReceiptByName.get(name) ?? null)
                      .filter((receipt): receipt is PurchaseReceiptRow => Boolean(receipt));
                    const percentage = row.matchRecommendation?.percentage ?? 0;
                    const priceRows = buildPriceTallyRows(row, linkedReceipts);
                    const combinedPrTotal = priceRows.reduce((total, item) => total + item.prAmount, 0);
                    const ssrTotal = priceRows.reduce((total, item) => total + Math.abs(item.ssrAmount), 0);
                    const priceIssueCount = priceRows.filter((item) => item.issue).length;
                    return (
                      <TableRow key={`multi-link:${rowKey}`}>
                        <TableCell className="font-medium">
                          <button
                            type="button"
                            className="text-left text-primary underline-offset-4 hover:underline"
                            onClick={() => setSelectedSsr(row)}
                          >
                            {row.name}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {row.purchaseReceiptNames.map((name) => (
                              <div key={name} className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="text-primary underline-offset-4 hover:underline"
                                  onClick={() => {
                                    const receipt = linkedReceipts.find((candidate) => candidate.name === name);
                                    if (receipt) setSelectedPr(receipt);
                                  }}
                                >
                                  {name}
                                </button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="size-7"
                                  title={`Remove ${name}`}
                                  aria-label={`Remove ${name}`}
                                  disabled={busyKey === `remove-link:${rowKey}:${name}`}
                                  onClick={() => removeSsrPurchaseReceipt(row, name)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{percentage.toFixed(2)}%</div>
                          <div className="text-xs text-muted-foreground">
                            {linkedReceipts.length} PR{linkedReceipts.length === 1 ? "" : "s"} combined
                          </div>
                        </TableCell>
                        <TableCell>
                          {priceRows.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No PI prices</span>
                          ) : (
                            <div className={priceIssueCount > 0 ? "text-amber-300" : "text-emerald-300"}>
                              <div className="font-medium">
                                {combinedPrTotal.toFixed(2)} / {ssrTotal.toFixed(2)}
                              </div>
                              <div className="text-xs">
                                {priceIssueCount > 0 ? `${priceIssueCount} price issue${priceIssueCount === 1 ? "" : "s"}` : "Prices match"}
                              </div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <PurchaseReceiptPicker
                            value={additionalPrBySsr[rowKey] ?? ""}
                            disabled={row.docstatus === 2 || !permissions.canMatchSsr}
                            purchaseReceipts={purchaseReceiptOptionsForSsr(row)}
                            onChange={(value) =>
                              setAdditionalPrBySsr((previous) => ({
                                ...previous,
                                [rowKey]: value,
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <Button
                            type="button"
                            size="sm"
                            disabled={
                              row.docstatus === 2 ||
                              !permissions.canMatchSsr ||
                              !additionalPrBySsr[rowKey] ||
                              busyKey === `append-link:${rowKey}`
                            }
                            onClick={() => appendSsrPurchaseReceipt(row)}
                          >
                            <Link2 className="size-4" />
                            Add PR
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        </TabsContent>
      </Tabs>

      <Dialog
        open={Boolean(selectedPr)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPr(null);
            setSelectedPrFocus(null);
          }
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-4xl overflow-y-auto overscroll-contain border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_94%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))]">
          <DialogHeader>
            <div className="flex flex-col gap-2 pr-10">
              <div>
                <DialogTitle>{selectedPr?.name ?? "Purchase receipt"}</DialogTitle>
                <DialogDescription>
                  {selectedPr
                    ? `${selectedPr.supplierName ?? selectedPr.supplier} - ${formatDate(selectedPr.grnDate)}`
                    : "Purchase receipt details"}
                </DialogDescription>
              </div>
              {selectedPr?.erpUrl && (
                <a
                  href={selectedPr.erpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="size-4" />
                  Open in ERP
                </a>
              )}
            </div>
          </DialogHeader>
          {selectedPr && (
            <>
              <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">Supplier</div>
                <div className="font-medium">{selectedPr.supplier}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">GRN By</div>
                <div className="font-medium">{selectedPr.grnBy ?? "-"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Adjustment No</div>
                <div className="font-medium">{selectedPrStockReturn ? (
                  <button
                    type="button"
                    className="text-primary underline-offset-4 hover:underline"
                    onClick={() => {
                      setSelectedPr(null);
                      setSelectedSsr(selectedPrStockReturn);
                    }}
                  >
                    {selectedPrStockReturn.name}
                  </button>
                ) : (
                  selectedPr.adjustmentNo ?? "-"
                )}</div>
                {linkModeLabel(selectedPrStockReturn, selectedPr) && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {linkModeLabel(selectedPrStockReturn, selectedPr)}
                  </div>
                )}
              </div>
            </div>
              <GrnStageTimeline
                row={selectedPr}
                permissions={permissions}
                busyKey={busyKey}
                onRevert={(row, field) => mark(row, field, "revert")}
                onHandoverReceived={(row) => mark(row, "handoverAt", "handover_received")}
                onNotReceived={(row) => mark(row, "handoverAt", "not_received")}
              />
              {rowMissingIntercompanySsr(selectedPr) && (
                <details
                  className="rounded-lg border border-amber-400/35 bg-amber-500/10 p-3"
                  open={selectedPrFocus === "missing-ssr"}
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-start gap-2">
                      <TriangleAlert className="mt-0.5 size-4 text-amber-300" />
                      <div className="flex flex-col gap-1">
                        <div className="text-sm font-semibold">Missing SSR link</div>
                        <div className="text-xs text-amber-100/80">
                          This purchase receipt is from an intercompany supplier, but no supplier stock return is linked yet.
                        </div>
                      </div>
                    </div>
                  </summary>
                </details>
              )}
              {selectedPrStockReturn && (
                <details className="rounded-lg border bg-background/50 p-3" open={selectedPrFocus === "item-mismatch"}>
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-col gap-1">
                      <div className="text-sm font-semibold">
                        SSR/PR matched products {selectedPr.tallyPercentage == null ? "" : `(${selectedPr.tallyPercentage.toFixed(2)}%)`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        100% means every SKU and quantity matches. Lower percentages mean missing, extra, or different quantities.
                      </div>
                    </div>
                  </summary>
                  <div className="mt-3 overflow-x-auto rounded-md border bg-background/70">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>Item Name</TableHead>
                          <TableHead className="text-right">PR Qty</TableHead>
                          <TableHead className="text-right">SSR Qty</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPrMatchRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="h-16 text-center text-muted-foreground">
                              No linked SSR items found.
                            </TableCell>
                          </TableRow>
                        ) : (
                          selectedPrMatchRows.map((item) => (
                            <TableRow key={item.itemCode} className={item.matched ? undefined : "bg-amber-500/10"}>
                              <TableCell className="font-medium">{item.itemCode}</TableCell>
                              <TableCell>{item.itemName ?? "-"}</TableCell>
                              <TableCell className="text-right">{item.prQty}</TableCell>
                              <TableCell className="text-right">{item.ssrQty}</TableCell>
                              <TableCell>{item.matched ? "Matched" : "Mismatch"}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </details>
              )}
              {selectedPrStockReturn && (
                <PurchaseInvoicePriceTallyDetails
                  row={selectedPr}
                  priceRows={selectedPrPriceRows}
                  defaultOpen={selectedPrFocus === "price-mismatch"}
                />
              )}
            </>
          )}
          <details className="rounded-lg border bg-background/50 p-3">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-semibold">Purchase receipt items</div>
                <div className="text-xs text-muted-foreground">{selectedPr?.items.length ?? 0} items</div>
              </div>
            </summary>
            <div className="mt-3 overflow-x-auto rounded-lg border bg-background/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Stock Qty</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>UOM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!selectedPr || selectedPr.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                        No items found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    selectedPr.items.map((item) => (
                      <TableRow key={item.name}>
                        <TableCell className="font-medium">{item.itemCode}</TableCell>
                        <TableCell>{item.itemName ?? "-"}</TableCell>
                        <TableCell className="text-right">{item.qty}</TableCell>
                        <TableCell className="text-right">{item.stockQty ?? "-"}</TableCell>
                        <TableCell>{item.warehouse ?? "-"}</TableCell>
                        <TableCell>{item.stockUom ?? "-"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </details>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedSsr)} onOpenChange={(open) => !open && setSelectedSsr(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-4xl overflow-y-auto overscroll-contain border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_94%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))]">
          <DialogHeader>
            <div className="flex flex-col gap-2 pr-10">
              <div>
                <DialogTitle>{selectedSsr?.name ?? "Supplier stock return"}</DialogTitle>
                <DialogDescription>
                  {selectedSsr
                    ? `${selectedSsr.supplierName ?? selectedSsr.supplier} - ${formatDate(selectedSsr.returnDate ?? selectedSsr.creation)}`
                    : "Supplier stock return details"}
                </DialogDescription>
              </div>
              {selectedSsr?.erpUrl && (
                <a
                  href={selectedSsr.erpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="size-4" />
                  Open in ERP
                </a>
              )}
              {selectedSsrPurchaseReceipt && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => {
                    setSelectedSsr(null);
                    setSelectedPr(selectedSsrPurchaseReceipt);
                  }}
                >
                  Back to PR
                </Button>
              )}
            </div>
          </DialogHeader>
          {selectedSsrComparisonPurchaseReceipts.length > 0 && selectedSsr && (
            <div className="rounded-lg border bg-background/50 p-3">
              <div className="text-sm font-semibold">
                {selectedSsrLinkedPurchaseReceipts.length > 1 ? "Linked purchase receipts" : "Linked purchase receipt"}
              </div>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <div className="text-xs text-muted-foreground">Linked PRs</div>
                  <div className="space-y-1">
                    {selectedSsrComparisonPurchaseReceipts.map((receipt) => (
                      <button
                        key={receipt.name}
                        type="button"
                        className="block font-medium text-primary underline-offset-4 hover:underline"
                        onClick={() => setSelectedPr(receipt)}
                      >
                        {receipt.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Supplier</div>
                  <div className="font-medium">{selectedSsrComparisonPurchaseReceipt?.supplierName ?? selectedSsrComparisonPurchaseReceipt?.supplier}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Combined tally</div>
                  <div className="mt-1 font-medium">
                    {selectedSsr.matchRecommendation?.percentage == null
                      ? "-"
                      : `${selectedSsr.matchRecommendation.percentage.toFixed(2)}%`}
                  </div>
                </div>
              </div>
            </div>
          )}
          {selectedSsrMatchRows.some((item) => !item.matched) && (
            <details className="rounded-lg border border-amber-400/60 bg-amber-500/10 p-3">
              <summary className="cursor-pointer list-none">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                  <TriangleAlert className="size-4" />
                  Tally mismatch
                </div>
              </summary>
              <div className="mt-3 overflow-x-auto rounded-md border border-amber-400/40 bg-background/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Item Name</TableHead>
                      <TableHead className="text-right">PR Qty</TableHead>
                      <TableHead className="text-right">SSR Qty</TableHead>
                      <TableHead className="text-right">Difference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedSsrMatchRows.filter((item) => !item.matched).map((item) => (
                      <TableRow key={item.itemCode}>
                        <TableCell className="font-medium">{item.itemCode}</TableCell>
                        <TableCell>{item.itemName ?? "-"}</TableCell>
                        <TableCell className="text-right">{item.prQty}</TableCell>
                        <TableCell className="text-right">{item.ssrQty}</TableCell>
                        <TableCell className="text-right">{item.prQty - item.ssrQty}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
          )}
          {selectedSsr && selectedSsrComparisonPurchaseReceipt && (
            <div className="rounded-lg border bg-background/50 p-3">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-semibold">
                  SSR/PR matched products{" "}
                  {selectedSsr.matchRecommendation ? `(${selectedSsr.matchRecommendation.percentage.toFixed(2)}%)` : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  Comparing against {selectedSsrComparisonPurchaseReceipts.map((receipt) => receipt.name).join(", ")}. 100% means every SKU and quantity matches.
                </div>
              </div>
              <div className="mt-3 overflow-x-auto rounded-md border bg-background/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Item Name</TableHead>
                      <TableHead className="text-right">PR Qty</TableHead>
                      <TableHead className="text-right">SSR Qty</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedSsrMatchRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-16 text-center text-muted-foreground">
                          No comparable items found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      selectedSsrMatchRows.map((item) => (
                        <TableRow key={item.itemCode} className={item.matched ? undefined : "bg-amber-500/10"}>
                          <TableCell className="font-medium">{item.itemCode}</TableCell>
                          <TableCell>{item.itemName ?? "-"}</TableCell>
                          <TableCell className="text-right">{item.prQty}</TableCell>
                          <TableCell className="text-right">{item.ssrQty}</TableCell>
                          <TableCell>{item.matched ? "Matched" : "Mismatch"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          {selectedSsrComparisonPurchaseReceipts.length > 0 && (
            <PurchaseInvoicePriceTallyDetails row={selectedSsrComparisonPurchaseReceipts} priceRows={selectedSsrPriceRows} />
          )}
          <details className="rounded-lg border bg-background/50 p-3">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-semibold">Supplier stock return items</div>
                <div className="text-xs text-muted-foreground">{selectedSsr?.items.length ?? 0} items</div>
              </div>
            </summary>
            <div className="mt-3 overflow-x-auto rounded-lg border bg-background/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Code</TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>UOM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!selectedSsr || selectedSsr.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      No items found.
                    </TableCell>
                  </TableRow>
                ) : (
                  selectedSsr.items.map((item) => (
                    <TableRow key={item.name}>
                      <TableCell className="font-medium">{item.itemCode}</TableCell>
                      <TableCell>{item.itemName ?? "-"}</TableCell>
                      <TableCell className="text-right">{item.qty}</TableCell>
                      <TableCell>{item.stockUom ?? "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          </details>
        </DialogContent>
      </Dialog>    </div>
  );
}

