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
  RefreshCw,
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

type PurchaseReceiptRow = {
  name: string;
  erpUrl: string | null;
  adjustmentNo: string | null;
  grnDate: string | null;
  grnBy: string | null;
  supplier: string;
  supplierName: string | null;
  docstatus: number | null;
  amendedFrom: string | null;
  handoverAt: string | null;
  handoverBy: UserRef | null;
  valuedAt: string | null;
  valuedBy: UserRef | null;
  receivedAt: string | null;
  receivedBy: UserRef | null;
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
  tallyIssueItems: string[];
  tallyIssues: {
    itemCode: string;
    itemName: string | null;
    prQty: number;
    ssrQty: number;
  }[];
};

type SupplierStockReturnRow = {
  name: string;
  erpUrl: string | null;
  supplier: string;
  returnDate: string | null;
  owner: string | null;
  creation: string | null;
  purchaseReceiptName: string | null;
  docstatus: number | null;
  amendedFrom: string | null;
  canTally: boolean;
  itemCount: number;
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
};

type GrnPanelPermissions = {
  canMarkHandover: boolean;
  canMarkValued: boolean;
  canMarkReceived: boolean;
};

type GrnStageFilter = "all" | "not_handover" | "not_valued" | "not_received" | "completed" | "cancelled";

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

function GrnStageTimeline({ row }: { row: PurchaseReceiptRow }) {
  const stages = [
    { label: "Handover", at: row.handoverAt, by: row.handoverBy },
    { label: "Valued", at: row.valuedAt, by: row.valuedBy },
    { label: "GRN Received", at: row.receivedAt, by: row.receivedBy },
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
                <div className="text-sm text-muted-foreground">{userLabel(stage.by) ? `by ${userLabel(stage.by)}` : "-"}</div>
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
        Matched
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
        Issue
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">Not linked</span>;
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
  const selected = purchaseReceipts.find((row) => row.name === value) ?? null;

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
                  {selected.supplierName ?? selected.supplier}
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
                  key={pr.name}
                  value={[pr.name, pr.supplier, pr.supplierName, pr.grnBy].filter(Boolean).join(" ")}
                  onSelect={() => {
                    onChange(pr.name);
                    setOpen(false);
                  }}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{pr.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {pr.supplierName ?? pr.supplier}
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
  const [data, setData] = useState<PageData>({ purchaseReceipts: [], supplierStockReturns: [] });
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [ssrSearch, setSsrSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<GrnStageFilter>("all");
  const [activeTab, setActiveTab] = useState("grn");
  const [dateRange, setDateRange] = useState(() => getCurrentMonthRange());
  const [selectedPrBySsr, setSelectedPrBySsr] = useState<Record<string, string>>({});
  const [selectedPr, setSelectedPr] = useState<PurchaseReceiptRow | null>(null);
  const [selectedSsr, setSelectedSsr] = useState<SupplierStockReturnRow | null>(null);

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
      setData(json);
      setSelectedPrBySsr(
        Object.fromEntries(
          json.supplierStockReturns.map((row) => [row.name, row.purchaseReceiptName ?? ""]),
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
    () => data.purchaseReceipts.filter((row) => row.docstatus !== 2),
    [data.purchaseReceipts],
  );

  const purchaseReceiptByName = useMemo(
    () => new Map(data.purchaseReceipts.map((row) => [row.name, row])),
    [data.purchaseReceipts],
  );

  const selectedSsrPurchaseReceipt = selectedSsr?.purchaseReceiptName
    ? purchaseReceiptByName.get(selectedSsr.purchaseReceiptName) ?? null
    : null;

  const filteredPrs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.purchaseReceipts.filter((row) => {
      const matchesStage =
        stageFilter === "all" ||
        (stageFilter === "not_handover" && row.docstatus !== 2 && !row.handoverAt) ||
        (stageFilter === "not_valued" && row.docstatus !== 2 && !row.valuedAt) ||
        (stageFilter === "not_received" && row.docstatus !== 2 && !row.receivedAt) ||
        (stageFilter === "completed" && row.docstatus !== 2 && Boolean(row.receivedAt)) ||
        (stageFilter === "cancelled" && row.docstatus === 2);
      if (!matchesStage) return false;
      if (!term) return true;
      return [row.name, row.adjustmentNo, row.supplier, row.supplierName, row.grnBy]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
  }, [data.purchaseReceipts, search, stageFilter]);

  const filteredSsrs = useMemo(() => {
    const term = ssrSearch.trim().toLowerCase();
    if (!term) return data.supplierStockReturns;
    return data.supplierStockReturns.filter((row) =>
      [row.name, row.supplier, row.purchaseReceiptName, row.owner]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term)),
    );
  }, [data.supplierStockReturns, ssrSearch]);

  async function mark(name: string, field: "handoverAt" | "valuedAt" | "receivedAt") {
    const key = `${name}:${field}`;
    setBusyKey(key);
    try {
      const res = await fetch(
        `/api/admin/purchasing/grn/purchase-receipts/${encodeURIComponent(name)}/mark`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field }),
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

  async function linkSsr(ssrName: string) {
    if (!permissions.canMatchSsr) {
      notify.error("You do not have permission to match SSRs");
      return;
    }
    const purchaseReceiptName = selectedPrBySsr[ssrName] || null;
    setBusyKey(`link:${ssrName}`);
    try {
      const res = await fetch(
        `/api/admin/purchasing/grn/supplier-stock-returns/${encodeURIComponent(ssrName)}/link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchaseReceiptName }),
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
                <TableHead>Adjustment No</TableHead>
                <TableHead>GRN Date</TableHead>
                <TableHead>GRN By</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Handover Date</TableHead>
                <TableHead>Valued</TableHead>
                <TableHead>GRN Received</TableHead>
                <TableHead>Tally</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    Loading GRN data...
                  </TableCell>
                </TableRow>
              ) : filteredPrs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    No purchase receipts found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredPrs.map((row) => (
                  <TableRow key={row.name} className="cursor-pointer" onClick={() => setSelectedPr(row)}>
                    <TableCell className="font-medium">
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
                      {row.docstatus === 2 && <div className="text-xs text-destructive">Cancelled</div>}
                      {row.amendedFrom && (
                        <div className="text-xs text-muted-foreground">Amended from {row.amendedFrom}</div>
                      )}
                    </TableCell>
                    <TableCell>{row.adjustmentNo ?? "-"}</TableCell>
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
                          disabled={row.docstatus === 2 || busyKey === `${row.name}:handoverAt`}
                          onClick={(event) => {
                            event.stopPropagation();
                            mark(row.name, "handoverAt");
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
                          disabled={row.docstatus === 2 || !row.handoverAt || busyKey === `${row.name}:valuedAt`}
                          onClick={(event) => {
                            event.stopPropagation();
                            mark(row.name, "valuedAt");
                          }}
                        >
                          Mark
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.receivedAt ? (
                        formatDate(row.receivedAt)
                      ) : permissions.canMarkReceived ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={row.docstatus === 2 || !row.handoverAt || !row.valuedAt || busyKey === `${row.name}:receivedAt`}
                          onClick={(event) => {
                            event.stopPropagation();
                            mark(row.name, "receivedAt");
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
          </div>
        </TabsContent>

        <TabsContent value="ssr" className="space-y-4 rounded-lg border bg-card/60 p-4 md:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-lg font-semibold">Supplier stock return matching</h2>
            <Input
              className="sm:w-72"
              placeholder="Search SSR, supplier, PR"
              value={ssrSearch}
              onChange={(event) => setSsrSearch(event.target.value)}
            />
          </div>
        <div className="overflow-hidden rounded-lg border bg-background/45">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SSR No</TableHead>
                <TableHead>Return Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Purchase Receipt</TableHead>
                <TableHead>Tally</TableHead>
                <TableHead className="w-24">Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSsrs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No supplier stock returns found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredSsrs.map((row) => {
                  const linkedPr = row.purchaseReceiptName
                    ? purchaseReceiptByName.get(row.purchaseReceiptName) ?? null
                    : null;
                  return (
                  <TableRow key={row.name} className="cursor-pointer" onClick={() => setSelectedSsr(row)}>
                    <TableCell className="font-medium">
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
                      {row.docstatus === 2 && <div className="text-xs text-destructive">Cancelled</div>}
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
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <PurchaseReceiptPicker
                        value={selectedPrBySsr[row.name] ?? ""}
                        disabled={row.docstatus === 2}
                        purchaseReceipts={activePurchaseReceipts}
                        onChange={(value) =>
                          setSelectedPrBySsr((prev) => ({
                            ...prev,
                            [row.name]: value,
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell>{linkedPr ? <TallyBadge row={linkedPr} /> : <span className="text-xs text-muted-foreground">Not linked</span>}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        disabled={row.docstatus === 2 || !permissions.canMatchSsr || busyKey === `link:${row.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          linkSsr(row.name);
                        }}
                      >
                        <Link2 className="size-4" />
                        Save
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(selectedPr)} onOpenChange={(open) => !open && setSelectedPr(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col overflow-hidden border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_94%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))]">
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
                <div className="font-medium">{selectedPr.adjustmentNo ?? "-"}</div>
              </div>
            </div>
              <GrnStageTimeline row={selectedPr} />
            </>
          )}
          <div className="overflow-auto rounded-lg border bg-background/60">
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
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedSsr)} onOpenChange={(open) => !open && setSelectedSsr(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col overflow-hidden border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_94%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))]">
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
            </div>
          </DialogHeader>
          {selectedSsrPurchaseReceipt && (
            <div className="grid gap-3 rounded-lg border bg-background/50 p-3 text-sm sm:grid-cols-3">
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
          )}
          {selectedSsrPurchaseReceipt?.tallyStatus === "issue" && selectedSsrPurchaseReceipt.tallyIssues.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-amber-950">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <TriangleAlert className="size-4" />
                Tally mismatch
              </div>
              <div className="overflow-auto rounded-md border border-amber-200 bg-background/80">
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
            </div>
          )}
          <div className="overflow-auto rounded-lg border bg-background/60">
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
        </DialogContent>
      </Dialog>    </div>
  );
}
















