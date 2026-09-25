"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronsUpDown,
  Circle,
  Eye,
  ExternalLink,
  FileDown,
  Link2,
  Loader2,
  Pencil,
  Plus,
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
  companyName: string;
  name: string;
  erpUrl: string | null;
  adjustmentNo: string | null;
  adjustmentDocstatus: number | null;
  grnDate: string | null;
  grnBy: string | null;
  supplier: string;
  supplierName: string | null;
  docstatus: number | null;
  isCancelled: boolean;
  amendedFrom: string | null;
  handoverAt: string | null;
  handoverBy: UserRef | null;
  valuedAt: string | null;
  valuedBy: UserRef | null;
  receivedAt: string | null;
  receivedBy: UserRef | null;
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
  returnDate: string | null;
  owner: string | null;
  creation: string | null;
  purchaseReceiptName: string | null;
  docstatus: number | null;
  isCancelled: boolean;
  amendedFrom: string | null;
  canTally: boolean;
  itemCount: number;
  matchRecommendation: {
    companyId: string;
    name: string;
    percentage: number;
  } | null;
  matchReviewStatus: "matched" | "review" | "waiting" | null;
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
  canMarkHandover: boolean;
  canMarkValued: boolean;
  canMarkReceived: boolean;
};

type GrnStageFilter = "all" | "not_handover" | "not_valued" | "not_received" | "completed" | "cancelled";

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: PageSize = 20;

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

function CancelledBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
      Cancelled
    </span>
  );
}

function buildPriceTallyRows(_ssr: SupplierStockReturnRow, pr: PurchaseReceiptRow | null) {
  if (!pr?.purchaseInvoice && !pr?.supplierStockReturnPurchaseInvoice) return [];

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

  const prByItem = groupItems(pr.purchaseInvoice?.items.filter((item) => item.purchaseReceipt === pr.name) ?? []);
  const ssrByItem = groupItems(
    pr.supplierStockReturnPurchaseInvoice?.items.filter((item) => item.supplierStockReturn === pr.adjustmentNo) ?? [],
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
        issue:
          Math.abs(Math.abs(prItem?.qty ?? 0) - Math.abs(ssrItem?.qty ?? 0)) > 0.000001 ||
          Math.abs((prItem?.amount ?? 0) + (ssrItem?.amount ?? 0)) > 0.000001,
      };
    })
    .sort((a, b) => Number(a.issue) - Number(b.issue) || a.itemCode.localeCompare(b.itemCode));
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
  row: PurchaseReceiptRow;
  priceRows: ReturnType<typeof buildPriceTallyRows>;
  defaultOpen?: boolean;
}) {
  return (
    <details className="rounded-lg border bg-background/50 p-3" open={defaultOpen}>
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold">Purchase invoice price tally</div>
          <div className="text-xs text-muted-foreground">
            {!row.purchaseInvoice
              ? "No linked purchase receipt invoice stored yet."
              : !row.supplierStockReturnPurchaseInvoice
                ? "No linked supplier stock return invoice stored yet."
                : `${row.purchaseInvoice.name} vs ${row.supplierStockReturnPurchaseInvoice.name}`}
          </div>
        </div>
      </summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-3">
          {row.purchaseInvoice?.erpUrl && (
            <a
              href={row.purchaseInvoice.erpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-2 text-sm text-primary hover:underline"
            >
              <ExternalLink className="size-4" />
              Open PR PI
            </a>
          )}
          {row.supplierStockReturnPurchaseInvoice?.erpUrl && (
            <a
              href={row.supplierStockReturnPurchaseInvoice.erpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-2 text-sm text-primary hover:underline"
            >
              <ExternalLink className="size-4" />
              Open SSR PI
            </a>
          )}
        </div>
        {(row.purchaseInvoice || row.supplierStockReturnPurchaseInvoice) && (
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

function buildItemMatchRows(pr: PurchaseReceiptRow, ssr: SupplierStockReturnRow | null) {
  if (!ssr) return [];
  const prTotals = new Map<string, { itemName: string | null; qty: number }>();
  const ssrTotals = new Map<string, { itemName: string | null; qty: number }>();

  for (const item of pr.items) {
    const current = prTotals.get(item.itemCode);
    prTotals.set(item.itemCode, {
      itemName: current?.itemName ?? item.itemName,
      qty: (current?.qty ?? 0) + (item.stockQty ?? item.qty),
    });
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
function GrnStageTimeline({ row }: { row: PurchaseReceiptRow }) {
  const stages = [
    { label: "Handover", at: row.handoverAt, by: row.handoverBy, fallbackBy: null },
    { label: "Valued", at: row.valuedAt, by: row.valuedBy, fallbackBy: "Cosmo API" },
    { label: "GRN Received", at: row.receivedAt, by: row.receivedBy, fallbackBy: null },
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
                  {userLabel(stage.by) ? `by ${userLabel(stage.by)}` : complete && stage.fallbackBy ? `by ${stage.fallbackBy}` : "-"}
                </div>
              </div>
              <div className="text-right text-sm text-muted-foreground">{formatDate(stage.at)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function TallyBadge({ row }: { row: PurchaseReceiptRow }) {
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
  const [ssrSearch, setSsrSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<GrnStageFilter>("all");
  const [activeTab, setActiveTab] = useState("grn");
  const [prPage, setPrPage] = useState(1);
  const [ssrPage, setSsrPage] = useState(1);
  const [prPageSize, setPrPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [ssrPageSize, setSsrPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [dateRange, setDateRange] = useState(() => getCurrentMonthRange());
  const [selectedPrBySsr, setSelectedPrBySsr] = useState<Record<string, string>>({});
  const [selectedPr, setSelectedPr] = useState<PurchaseReceiptRow | null>(null);
  const [selectedSsr, setSelectedSsr] = useState<SupplierStockReturnRow | null>(null);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ id: "", supplier: "", supplierName: "" });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateRange.from) params.set("from", dateRange.from);
      if (dateRange.to) params.set("to", dateRange.to);
      const res = await fetch(`/api/admin/purchasing/grn/page-data?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load GRN data");
      }
      const json = (await res.json()) as PageData;
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
      notify.error(error instanceof Error ? error.message : "Failed to load GRN data");
    } finally {
      setLoading(false);
    }
  }, [dateRange.from, dateRange.to]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activePurchaseReceipts = useMemo(
    () => data.purchaseReceipts.filter((row) => !row.isCancelled),
    [data.purchaseReceipts],
  );

  const intercompanySupplierSet = useMemo(
    () => new Set(data.intercompanySuppliers.map((row) => row.supplier)),
    [data.intercompanySuppliers],
  );

  const activeIntercompanyPurchaseReceipts = useMemo(
    () =>
      activePurchaseReceipts.filter(
        (row) => !row.adjustmentNo && intercompanySupplierSet.has(row.supplier),
      ),
    [activePurchaseReceipts, intercompanySupplierSet],
  );

  const purchaseReceiptByName = useMemo(
    () => new Map(data.purchaseReceipts.map((row) => [row.name, row])),
    [data.purchaseReceipts],
  );

  const supplierStockReturnByName = useMemo(
    () => new Map(data.supplierStockReturns.map((row) => [row.name, row])),
    [data.supplierStockReturns],
  );



  const purchaseReceiptByKey = useMemo(
    () => new Map(data.purchaseReceipts.map((row) => [`${row.companyId}:${row.name}`, row])),
    [data.purchaseReceipts],
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

  const selectedSsrKey = selectedSsr ? `${selectedSsr.companyId}:${selectedSsr.name}` : "";
  const selectedSsrPickerValue = selectedSsrKey ? selectedPrBySsr[selectedSsrKey] ?? "" : "";
  const selectedSsrPickerPurchaseReceipt = selectedSsrPickerValue
    ? purchaseReceiptByKey.get(selectedSsrPickerValue) ?? purchaseReceiptByName.get(selectedSsrPickerValue) ?? null
    : null;
  const selectedSsrSuggestedPurchaseReceipt = selectedSsr?.matchRecommendation
    ? purchaseReceiptByKey.get(`${selectedSsr.matchRecommendation.companyId}:${selectedSsr.matchRecommendation.name}`) ?? null
    : null;
  const selectedSsrComparisonPurchaseReceipt =
    selectedSsrPurchaseReceipt ?? selectedSsrPickerPurchaseReceipt ?? selectedSsrSuggestedPurchaseReceipt;
  const selectedSsrMatchRows = selectedSsrComparisonPurchaseReceipt
    ? buildItemMatchRows(selectedSsrComparisonPurchaseReceipt, selectedSsr)
    : [];

  const selectedSsrPriceRows = selectedSsr
    ? buildPriceTallyRows(selectedSsr, selectedSsrPurchaseReceipt)
    : [];

  const filteredPrs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.purchaseReceipts.filter((row) => {
      const matchesStage =
        stageFilter === "all" ||
        (stageFilter === "not_handover" && !row.isCancelled && !row.handoverAt) ||
        (stageFilter === "not_valued" && !row.isCancelled && !row.valuedAt) ||
        (stageFilter === "not_received" && !row.isCancelled && !row.receivedAt) ||
        (stageFilter === "completed" && !row.isCancelled && Boolean(row.receivedAt)) ||
        (stageFilter === "cancelled" && row.isCancelled);
      if (!matchesStage) return false;
      if (!term) return true;
      return [row.name, row.adjustmentNo, row.supplier, row.supplierName, row.grnBy, row.companyName]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
  }, [data.purchaseReceipts, search, stageFilter]);

  const ssrMatchesSearch = useCallback(
    (row: SupplierStockReturnRow) => {
      const term = ssrSearch.trim().toLowerCase();
      if (!term) return true;
      return [row.name, row.supplier, row.purchaseReceiptName, row.owner, row.companyName, row.matchRecommendation?.name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    },
    [ssrSearch],
  );

  const filteredSsrs = useMemo(
    () =>
      data.supplierStockReturns.filter(
        (row) =>
          row.docstatus !== 2 &&
          (!row.purchaseReceiptName || (row.matchRecommendation?.percentage ?? 0) < 100) &&
          intercompanySupplierSet.has(row.supplier) &&
          ssrMatchesSearch(row),
      ),
    [data.supplierStockReturns, intercompanySupplierSet, ssrMatchesSearch],
  );

  const filteredMatchedSsrs = useMemo(
    () =>
      data.supplierStockReturns.filter(
        (row) =>
          row.docstatus !== 2 &&
          Boolean(row.purchaseReceiptName) &&
          (row.matchRecommendation?.percentage ?? 0) >= 100 &&
          intercompanySupplierSet.has(row.supplier) &&
          ssrMatchesSearch(row),
      ),
    [data.supplierStockReturns, intercompanySupplierSet, ssrMatchesSearch],
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
  }, [search, stageFilter, dateRange.from, dateRange.to, prPageSize]);

  useEffect(() => {
    setSsrPage(1);
  }, [ssrSearch, dateRange.from, dateRange.to, ssrPageSize]);

  useEffect(() => {
    if (prPage > prPageCount) setPrPage(prPageCount);
  }, [prPage, prPageCount]);

  useEffect(() => {
    if (ssrPage > ssrPageCount) setSsrPage(ssrPageCount);
  }, [ssrPage, ssrPageCount]);

  async function mark(row: PurchaseReceiptRow, field: "handoverAt" | "valuedAt" | "receivedAt") {
    const key = `${row.companyId}:${row.name}:${field}`;
    setBusyKey(key);
    try {
      const res = await fetch(
        `/api/admin/purchasing/grn/purchase-receipts/${encodeURIComponent(row.name)}/mark`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, companyId: row.companyId }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to mark GRN row");
      }
      await loadData();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to mark GRN row");
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

  async function saveIntercompanySupplier() {
    if (!permissions.canMatchSsr) {
      notify.error("You do not have permission to manage matching suppliers");
      return;
    }
    const supplier = supplierForm.supplier.trim();
    if (!supplier) {
      notify.error("Enter a supplier id");
      return;
    }
    const editing = Boolean(supplierForm.id);
    setBusyKey(editing ? `supplier:${supplierForm.id}` : "supplier:new");
    try {
      const res = await fetch(
        editing
          ? `/api/admin/purchasing/grn/intercompany-suppliers/${encodeURIComponent(supplierForm.id)}`
          : "/api/admin/purchasing/grn/intercompany-suppliers",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ supplier, supplierName: supplierForm.supplierName }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save supplier");
      }
      setSupplierForm({ id: "", supplier: "", supplierName: "" });
      await loadData();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to save supplier");
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteIntercompanySupplier(row: IntercompanySupplierRow) {
    if (!permissions.canMatchSsr) {
      notify.error("You do not have permission to manage matching suppliers");
      return;
    }
    setBusyKey(`supplier:${row.id}`);
    try {
      const res = await fetch(
        `/api/admin/purchasing/grn/intercompany-suppliers/${encodeURIComponent(row.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to delete supplier");
      }
      if (supplierForm.id === row.id) setSupplierForm({ id: "", supplier: "", supplierName: "" });
      await loadData();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to delete supplier");
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
        </TabsList>

        <TabsContent value="grn" className="space-y-4 rounded-lg border bg-card/60 p-4 md:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-lg font-semibold">Purchase receipts</h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                className="sm:w-72"
                placeholder="Search PR, adjustment, supplier"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={stageFilter}
                onChange={(event) => setStageFilter(event.target.value as GrnStageFilter)}
              >
                <option value="all">All stages</option>
                <option value="not_handover">Not handed over</option>
                <option value="not_valued">Not valued</option>
                <option value="not_received">Not GRN received</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
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
          <div className="overflow-hidden rounded-lg border bg-background/45">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PR No</TableHead>
                <TableHead className="w-28 whitespace-normal leading-tight">Adjustment<br />No</TableHead>
                <TableHead>GRN Date</TableHead>
                <TableHead>GRN By</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="w-24 whitespace-normal leading-tight">Handover<br />Date</TableHead>
                <TableHead>Valued</TableHead>
                <TableHead className="w-20 whitespace-normal leading-tight">PI<br />Prices</TableHead>
                <TableHead className="w-24 whitespace-normal leading-tight">GRN<br />Received</TableHead>
                <TableHead>Tally</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                    Loading GRN data...
                  </TableCell>
                </TableRow>
              ) : filteredPrs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                    No purchase receipts found.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedPrs.map((row) => (
                  <TableRow key={`${row.companyId}:${row.name}`} className="cursor-pointer" onClick={() => setSelectedPr(row)}>
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="text-left text-primary underline-offset-4 hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedPr(row);
                          }}
                        >
                          {row.name}
                        </button>
                        {row.isCancelled && <CancelledBadge />}
                      </div>
                      {row.amendedFrom && (
                        <div className="text-xs text-muted-foreground">Amended from {row.amendedFrom}</div>
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
                    <TableCell>
                      {row.handoverAt ? (
                        formatDate(row.handoverAt)
                      ) : permissions.canMarkHandover ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={row.isCancelled || busyKey === `${row.companyId}:${row.name}:handoverAt`}
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
                    <TableCell>
                      {row.valuedAt ? (
                        formatDate(row.valuedAt)
                      ) : permissions.canMarkValued ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={row.isCancelled || !row.handoverAt || busyKey === `${row.companyId}:${row.name}:valuedAt`}
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
                    <TableCell>
                      <PurchaseInvoiceStatusBadge row={row} />
                    </TableCell>
                    <TableCell>
                      {row.receivedAt ? (
                        formatDate(row.receivedAt)
                      ) : permissions.canMarkReceived ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={row.isCancelled || !row.handoverAt || !row.valuedAt || busyKey === `${row.companyId}:${row.name}:receivedAt`}
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
                    <TableCell>
                      <TallyBadge row={row} />
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
              {permissions.canMatchSsr && (
                <Button type="button" variant="outline" onClick={() => setSupplierDialogOpen(true)}>
                  <Plus className="size-4" />
                  Intercompany suppliers
                </Button>
              )}
            </div>
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
                    <TableCell>{row.supplier}</TableCell>
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
                              : row.matchReviewStatus === "review"
                                ? "Review"
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
                        disabled={row.docstatus === 2}
                        purchaseReceipts={activeIntercompanyPurchaseReceipts}
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
                  <TableHead>Change Purchase Receipt</TableHead>
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
                        <TableCell>{row.supplier}</TableCell>
                        <TableCell>{linkedPr?.name ?? row.purchaseReceiptName ?? "-"}</TableCell>
                        <TableCell>
                          {row.matchRecommendation ? (
                            <div>
                              <div className="font-medium">{row.matchRecommendation.percentage.toFixed(2)}%</div>
                              <div className="text-xs text-muted-foreground">
                                {isCleanMatch ? "Matched" : matchedPercentage <= 0 ? "Issue - no SKU/qty overlap" : "Issue - needs review"}
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
                            disabled={row.docstatus === 2}
                            purchaseReceipts={activeIntercompanyPurchaseReceipts}
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
      </Tabs>

      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto overscroll-contain">
          <DialogHeader>
            <DialogTitle>Intercompany suppliers</DialogTitle>
            <DialogDescription>
              These suppliers narrow which PRs and SSRs enter automated matching.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <Input
              placeholder="Supplier id"
              value={supplierForm.supplier}
              onChange={(event) =>
                setSupplierForm((current) => ({ ...current, supplier: event.target.value }))
              }
            />
            <Input
              placeholder="Supplier name"
              value={supplierForm.supplierName}
              onChange={(event) =>
                setSupplierForm((current) => ({ ...current, supplierName: event.target.value }))
              }
            />
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={saveIntercompanySupplier}
                disabled={busyKey === "supplier:new" || (supplierForm.id ? busyKey === `supplier:${supplierForm.id}` : false)}
              >
                {supplierForm.id ? <Pencil className="size-4" /> : <Plus className="size-4" />}
                {supplierForm.id ? "Update" : "Add"}
              </Button>
              {supplierForm.id && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSupplierForm({ id: "", supplier: "", supplierName: "" })}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Supplier Name</TableHead>
                  <TableHead className="w-28 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.intercompanySuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-16 text-center text-muted-foreground">
                      No intercompany suppliers added.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.intercompanySuppliers.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.supplier}</TableCell>
                      <TableCell>{row.supplierName ?? "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            onClick={() =>
                              setSupplierForm({
                                id: row.id,
                                supplier: row.supplier,
                                supplierName: row.supplierName ?? "",
                              })
                            }
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            disabled={busyKey === `supplier:${row.id}`}
                            onClick={() => deleteIntercompanySupplier(row)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(selectedPr)} onOpenChange={(open) => !open && setSelectedPr(null)}>
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
              </div>
            </div>
              <GrnStageTimeline row={selectedPr} />
              {selectedPrStockReturn && (
                <details className="rounded-lg border bg-background/50 p-3">
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
                <PurchaseInvoicePriceTallyDetails row={selectedPr} priceRows={selectedPrPriceRows} />
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
                    ? `${selectedSsr.supplier} - ${formatDate(selectedSsr.returnDate ?? selectedSsr.creation)}`
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
          {selectedSsrPurchaseReceipt && (
            <div className="rounded-lg border bg-background/50 p-3">
              <div className="text-sm font-semibold">Linked purchase receipt</div>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <div className="text-xs text-muted-foreground">Linked PR</div>
                  <button
                    type="button"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                    onClick={() => setSelectedPr(selectedSsrPurchaseReceipt)}
                  >
                    {selectedSsrPurchaseReceipt.name}
                  </button>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Supplier</div>
                  <div className="font-medium">{selectedSsrPurchaseReceipt.supplierName ?? selectedSsrPurchaseReceipt.supplier}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Tally</div>
                  <div className="mt-1"><TallyBadge row={selectedSsrPurchaseReceipt} /></div>
                </div>
              </div>
            </div>
          )}
          {selectedSsrPurchaseReceipt?.tallyStatus === "issue" && selectedSsrPurchaseReceipt.tallyIssues.length > 0 && (
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
                    {selectedSsrPurchaseReceipt.tallyIssues.map((item) => (
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
                  Comparing against {selectedSsrComparisonPurchaseReceipt.name}. 100% means every SKU and quantity matches.
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
          {selectedSsrPurchaseReceipt && (
            <PurchaseInvoicePriceTallyDetails row={selectedSsrPurchaseReceipt} priceRows={selectedSsrPriceRows} />
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























































