"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, Link2, Loader2, RefreshCw, TriangleAlert } from "lucide-react";

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

type PurchaseReceiptRow = {
  name: string;
  adjustmentNo: string | null;
  grnDate: string | null;
  grnBy: string | null;
  supplier: string;
  supplierName: string | null;
  docstatus: number | null;
  amendedFrom: string | null;
  handoverAt: string | null;
  valuedAt: string | null;
  receivedAt: string | null;
  itemCount: number;
  tallyStatus: "not_linked" | "matched" | "issue";
  tallyIssueItems: string[];
};

type SupplierStockReturnRow = {
  name: string;
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

export function GrnPanel() {
  const [data, setData] = useState<PageData>({ purchaseReceipts: [], supplierStockReturns: [] });
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("grn");
  const [dateRange, setDateRange] = useState(() => getCurrentMonthRange());
  const [selectedPrBySsr, setSelectedPrBySsr] = useState<Record<string, string>>({});
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

  const filteredPrs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data.purchaseReceipts;
    return data.purchaseReceipts.filter((row) =>
      [row.name, row.adjustmentNo, row.supplier, row.supplierName, row.grnBy]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term)),
    );
  }, [data.purchaseReceipts, search]);

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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">Purchase receipts</h2>
            <Input
              className="sm:w-72"
              placeholder="Search PR, adjustment, supplier"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
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
                  <TableRow key={row.name}>
                    <TableCell className="font-medium">
                      <div>{row.name}</div>
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
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={row.docstatus === 2 || busyKey === `${row.name}:handoverAt`}
                          onClick={() => mark(row.name, "handoverAt")}
                        >
                          Mark
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.valuedAt ? (
                        formatDate(row.valuedAt)
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={row.docstatus === 2 || busyKey === `${row.name}:valuedAt`}
                          onClick={() => mark(row.name, "valuedAt")}
                        >
                          Mark
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.receivedAt ? (
                        formatDate(row.receivedAt)
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={row.docstatus === 2 || busyKey === `${row.name}:receivedAt`}
                          onClick={() => mark(row.name, "receivedAt")}
                        >
                          Mark
                        </Button>
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
          <h2 className="text-lg font-semibold">Supplier stock return matching</h2>
        <div className="overflow-hidden rounded-lg border bg-background/45">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SSR No</TableHead>
                <TableHead>Return Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Purchase Receipt</TableHead>
                <TableHead className="w-24">Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.supplierStockReturns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No supplier stock returns found.
                  </TableCell>
                </TableRow>
              ) : (
                data.supplierStockReturns.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="font-medium">
                      <div>{row.name}</div>
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
                        onClick={() => setSelectedSsr(row)}
                      >
                        <Eye className="size-4" />
                        View
                      </Button>
                    </TableCell>
                    <TableCell>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={selectedPrBySsr[row.name] ?? ""}
                        disabled={row.docstatus === 2}
                        onChange={(event) =>
                          setSelectedPrBySsr((prev) => ({
                            ...prev,
                            [row.name]: event.target.value,
                          }))
                        }
                      >
                        <option value="">No purchase receipt</option>
                        {activePurchaseReceipts.map((pr) => (
                          <option key={pr.name} value={pr.name}>
                            {pr.name} - {pr.supplier}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        disabled={row.docstatus === 2 || busyKey === `link:${row.name}`}
                        onClick={() => linkSsr(row.name)}
                      >
                        <Link2 className="size-4" />
                        Save
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(selectedSsr)} onOpenChange={(open) => !open && setSelectedSsr(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_94%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))]">
          <DialogHeader>
            <DialogTitle>{selectedSsr?.name ?? "Supplier stock return"}</DialogTitle>
            <DialogDescription>
              {selectedSsr
                ? `${selectedSsr.supplier} · ${formatDate(selectedSsr.returnDate ?? selectedSsr.creation)}`
                : "Supplier stock return details"}
            </DialogDescription>
          </DialogHeader>
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
      </Dialog>
    </div>
  );
}
