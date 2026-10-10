"use client";

import { useEffect, useRef, useState } from "react";

import { ExternalLink, Mail, Package, Phone, Plus, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { formatAppDateTime } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  STOCK_LOOKUP_STATUS_LABELS,
  STOCK_REQUEST_STATUSES,
  STOCK_REQUEST_STATUS_LABELS,
  type StockLookupStatus,
  type StockRequestStatus,
} from "@/lib/wishlist-buddy/constants";
import type { StockSource } from "@/lib/wishlist-buddy/stock-sources";
import type { StockRequestItem, StockRequestListResponse } from "@/lib/wishlist-buddy/types";

const SOLD_FROM_NONE = "__none__";

function statusBorderClass(status: StockRequestStatus) {
  switch (status) {
    case "contacted":
      return "border-amber-500 bg-amber-500/[0.04]";
    case "order_placed":
      return "border-emerald-500 bg-emerald-500/[0.04]";
    case "not_interested":
      return "border-border bg-muted/30";
    default:
      return "border-slate-400 bg-secondary/10";
  }
}

function lookupBadgeClass(status: StockLookupStatus) {
  switch (status) {
    case "found":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
    case "error":
    case "no_sku":
      return "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200";
    default:
      return "border-border bg-muted/60 text-muted-foreground";
  }
}

function soldFromKey(instanceId: string | null, warehouse: string | null): string {
  return warehouse ? `${instanceId ?? ""}::${warehouse}` : SOLD_FROM_NONE;
}

function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Stock sources grouped by ERP company, keeping the server's order (ERP1 shops first). */
function groupByCompany(sources: StockSource[]): Array<{ key: string; label: string; rows: StockSource[] }> {
  const groups: Array<{ key: string; label: string; rows: StockSource[] }> = [];
  for (const s of sources) {
    const key = `${s.instanceId}::${s.erpCompany}`;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: s.erpCompany, rows: [] };
      groups.push(group);
    }
    group.rows.push(s);
  }
  return groups;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{children}</div>
  );
}

export type StockRequestsViewerProps = {
  userId: string;
  isAdmin: boolean;
  canViewWeb: boolean;
  canManageWeb: boolean;
  canCreate: boolean;
};

type Scope = "web" | "mine";

const SCOPE_COPY: Record<Scope, { title: string; description: string; restockedLabel: string }> = {
  web: {
    title: "Website requests",
    description:
      "Customers who asked to be notified about sold-out products on Shopify. Call those with stock in another warehouse. Open requests (New and Contacted) get a back-in-stock email when Shopify restocks; Order placed and Not interested do not.",
    restockedLabel: "Back in stock on Shopify",
  },
  mine: {
    title: "My requests",
    description:
      "Wishlist requests you created for customers. When an item with no stock anywhere comes back in any warehouse, you get a reminder and the customer gets an email (if they gave one).",
    restockedLabel: "Back in stock",
  },
};

function StockRequestsList({
  scope,
  initialData,
  viewer,
}: {
  scope: Scope;
  /** Null when this tab was not pre-loaded by the server: it loads on first open. */
  initialData: StockRequestListResponse | null;
  viewer: StockRequestsViewerProps;
}) {
  const copy = SCOPE_COPY[scope];
  const canEdit = (item: StockRequestItem) =>
    scope === "web" ? viewer.canManageWeb : viewer.isAdmin || item.createdBy?.id === viewer.userId;
  const [creating, setCreating] = useState(false);
  const [data, setData] = useState<StockRequestListResponse>(
    initialData ?? { items: [], total: 0, page: 1, limit: 25 },
  );
  const [status, setStatus] = useState<string>("open");
  const [stock, setStock] = useState<string>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(initialData?.page ?? 1);
  const [limit, setLimit] = useState(initialData?.limit ?? 25);
  const [loading, setLoading] = useState(initialData === null);
  const [recheckingId, setRecheckingId] = useState<string | null>(null);

  const [editing, setEditing] = useState<StockRequestItem | null>(null);
  const [formStatus, setFormStatus] = useState<StockRequestStatus>("new");
  const [formSoldFrom, setFormSoldFrom] = useState<string>(SOLD_FROM_NONE);
  const [formRemark, setFormRemark] = useState("");
  const [saving, setSaving] = useState(false);

  const firstLoad = useRef(initialData !== null);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    // initialData already matches the default filters.
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("scope", scope);
        if (status !== "all") params.set("status", status);
        if (stock !== "all") params.set("stock", stock);
        if (search) params.set("search", search);
        params.set("page", String(page));
        params.set("limit", String(limit));
        const res = await fetch(`/api/admin/stock-requests?${params.toString()}`);
        const body = (await res.json().catch(() => ({}))) as StockRequestListResponse & { error?: string };
        if (!res.ok) {
          if (!cancelled) notify.error(body.error ?? "Failed to load stock requests");
          return;
        }
        if (!cancelled) setData(body);
      } catch (e) {
        if (!cancelled) notify.error(e instanceof Error ? e.message : "Failed to load stock requests");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [scope, status, stock, search, page, limit]);

  function replaceItem(item: StockRequestItem) {
    setData((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? item : i)) }));
  }

  async function recheckStock(id: string) {
    setRecheckingId(id);
    try {
      const res = await fetch(`/api/admin/stock-requests/${id}/stock-lookup`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { item?: StockRequestItem; error?: string };
      if (!res.ok || !body.item) {
        notify.error(body.error ?? "Stock check failed");
        return;
      }
      replaceItem(body.item);
      notify.success("Stock re-checked");
    } finally {
      setRecheckingId(null);
    }
  }

  function openEditor(item: StockRequestItem) {
    setEditing(item);
    setFormStatus(item.status);
    setFormSoldFrom(soldFromKey(item.soldFromInstanceId, item.soldFromWarehouse));
    setFormRemark(item.remark ?? "");
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const [instanceId, warehouse] =
        formSoldFrom === SOLD_FROM_NONE ? [null, null] : (formSoldFrom.split("::") as [string, string]);
      const res = await fetch(`/api/admin/stock-requests/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: formStatus,
          remark: formRemark.trim() || null,
          soldFromInstanceId: instanceId || null,
          soldFromWarehouse: warehouse || null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { item?: StockRequestItem; error?: string };
      if (!res.ok || !body.item) {
        notify.error(body.error ?? "Failed to save");
        return;
      }
      replaceItem(body.item);
      setEditing(null);
      notify.success("Stock request updated");
    } finally {
      setSaving(false);
    }
  }

  const soldFromOptions: Array<{ key: string; label: string }> = editing
    ? editing.stockSources.map((s) => ({
        key: soldFromKey(s.instanceId, s.warehouse),
        label: `${s.warehouse} (${s.erpCompany}) · ${formatQty(s.availableQty)} available`,
      }))
    : [];
  if (editing?.soldFromWarehouse && !soldFromOptions.some((o) => o.key === formSoldFrom)) {
    soldFromOptions.push({
      key: soldFromKey(editing.soldFromInstanceId, editing.soldFromWarehouse),
      label: editing.soldFromWarehouse,
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="min-w-0 flex-1 space-y-1.5">
            <CardTitle>{copy.title}</CardTitle>
            <p className="text-sm text-muted-foreground">{copy.description}</p>
          </div>
          {scope === "mine" && viewer.canCreate && (
            <Button type="button" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 size-4" aria-hidden />
              New request
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[220px_220px_minmax(0,1fr)]">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor={`stock-requests-status-${scope}`}>
                Status
              </label>
              <Select
                value={status}
                onValueChange={(v) => {
                  setPage(1);
                  setStatus(v);
                }}
              >
                <SelectTrigger id={`stock-requests-status-${scope}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open (New + Contacted)</SelectItem>
                  {STOCK_REQUEST_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STOCK_REQUEST_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor={`stock-requests-stock-${scope}`}>
                Stock
              </label>
              <Select
                value={stock}
                onValueChange={(v) => {
                  setPage(1);
                  setStock(v);
                }}
              >
                <SelectTrigger id={`stock-requests-stock-${scope}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="found">{STOCK_LOOKUP_STATUS_LABELS.found}</SelectItem>
                  <SelectItem value="restocked">{copy.restockedLabel}</SelectItem>
                  <SelectItem value="none">{STOCK_LOOKUP_STATUS_LABELS.none}</SelectItem>
                  <SelectItem value="error">{STOCK_LOOKUP_STATUS_LABELS.error}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2 lg:col-span-1">
              <label className="text-sm font-medium" htmlFor={`stock-requests-search-${scope}`}>
                Search
              </label>
              <Input
                id={`stock-requests-search-${scope}`}
                placeholder="Name, phone, email, SKU or product"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={8} />
          ) : data.items.length === 0 ? (
            <div className="rounded-md border border-border/70 p-4 text-muted-foreground">
              No stock requests found for the selected filters.
            </div>
          ) : (
            <div className="space-y-2">
              {data.items.map((item) => (
                <div
                  key={item.id}
                  className={cn("rounded-md border-2 p-3", statusBorderClass(item.status))}
                >
                  <div className="grid gap-3 lg:grid-cols-[150px_minmax(0,1fr)_auto]">
                    <div className="min-w-0 space-y-1 border-b border-border/40 pb-2 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-3">
                      <SectionLabel>Requested</SectionLabel>
                      <div className="text-sm font-medium leading-snug">
                        {formatAppDateTime(new Date(item.createdAt))}
                      </div>
                      <div className="text-sm font-medium">{STOCK_REQUEST_STATUS_LABELS[item.status]}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.source === "import" && (
                          <span
                            className="inline-flex items-center rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                            title="Imported from the previous back-in-stock app"
                          >
                            Imported
                          </span>
                        )}
                        {item.restockedAt && (
                          <span
                            className="inline-flex items-center rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-200"
                            title={`${copy.restockedLabel} ${formatAppDateTime(new Date(item.restockedAt))}${item.restockedWarehouse ? ` (${item.restockedWarehouse})` : ""}`}
                          >
                            Back in stock
                          </span>
                        )}
                        {scope === "mine" && item.awaitingStock && !item.restockedAt && (
                          <span
                            className="inline-flex items-center rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-800 dark:text-sky-200"
                            title="No stock anywhere yet. You'll get a reminder when it comes back."
                          >
                            Watching
                          </span>
                        )}
                      </div>
                      {scope === "mine" && viewer.isAdmin && item.createdBy && (
                        <div className="text-xs leading-snug text-muted-foreground">
                          Created by {item.createdBy.name ?? item.createdBy.email ?? "staff"}
                        </div>
                      )}
                      {(item.lastActionBy?.name || item.lastActionAt) && (
                        <div className="text-xs leading-snug text-muted-foreground">
                          Updated
                          {item.lastActionBy?.name ? ` by ${item.lastActionBy.name}` : ""}
                          {item.lastActionAt ? ` · ${formatAppDateTime(new Date(item.lastActionAt))}` : ""}
                        </div>
                      )}
                    </div>

                    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
                      <div className="min-w-0 space-y-1">
                        <SectionLabel>Customer</SectionLabel>
                        <div className="font-medium break-words">{item.customerName}</div>
                        {item.customerPhone ? (
                          <a
                            href={`tel:${item.customerPhone}`}
                            className="inline-flex items-center gap-1.5 font-medium hover:underline"
                          >
                            <Phone className="size-3.5 shrink-0" aria-hidden />
                            <span className="break-all">{item.customerPhone}</span>
                          </a>
                        ) : (
                          <div className="text-sm text-muted-foreground">Phone: —</div>
                        )}
                        {item.customerEmail ? (
                          <a
                            href={`mailto:${item.customerEmail}`}
                            className="flex items-center gap-1.5 break-all text-sm hover:underline"
                          >
                            <Mail className="size-3.5 shrink-0" aria-hidden />
                            {item.customerEmail}
                          </a>
                        ) : (
                          <div className="text-sm text-muted-foreground">Email: — (call only)</div>
                        )}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <SectionLabel>Product</SectionLabel>
                        <div className="font-medium break-words leading-snug">
                          {item.productUrl ? (
                            <a
                              href={item.productUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-start gap-1 hover:underline"
                            >
                              {item.productTitle}
                              <ExternalLink className="mt-1 size-3 shrink-0" aria-hidden />
                            </a>
                          ) : (
                            item.productTitle
                          )}
                        </div>
                        {item.variantTitle && <div className="text-sm">{item.variantTitle}</div>}
                        <div className="font-mono text-xs text-muted-foreground">SKU: {item.sku ?? "—"}</div>
                        <div className="space-y-0.5 pt-1 text-xs text-muted-foreground">
                          {item.availabilityEmailSentAt && (
                            <div>
                              &ldquo;Will call you&rdquo; email:{" "}
                              {formatAppDateTime(new Date(item.availabilityEmailSentAt))}
                            </div>
                          )}
                          {item.restockEmailSentAt && (
                            <div>Back-in-stock email: {formatAppDateTime(new Date(item.restockEmailSentAt))}</div>
                          )}
                          {item.restockEmailError && (
                            <div className="text-red-700 dark:text-red-300">
                              Back-in-stock email failed: {item.restockEmailError}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="min-w-0 space-y-1 sm:col-span-2 xl:col-span-1">
                        <div className="flex items-center justify-between gap-2">
                          <SectionLabel>Stock elsewhere</SectionLabel>
                          <span
                            className={cn(
                              "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                              lookupBadgeClass(item.stockLookupStatus),
                            )}
                          >
                            {STOCK_LOOKUP_STATUS_LABELS[item.stockLookupStatus]}
                          </span>
                        </div>
                        {item.stockSources.length > 0 && (
                          <div className="space-y-1.5">
                            {groupByCompany(item.stockSources).map((group) => (
                              <div key={group.key}>
                                <div className="text-xs font-medium">{group.label}</div>
                                <ul className="space-y-0.5">
                                  {group.rows.map((s) => {
                                    const isSoldFrom =
                                      item.soldFromWarehouse === s.warehouse &&
                                      (item.soldFromInstanceId ?? "") === s.instanceId;
                                    return (
                                      <li
                                        key={`${s.instanceId}::${s.warehouse}`}
                                        className="flex justify-between gap-2 text-sm"
                                      >
                                        <span className="min-w-0 break-words">
                                          {s.warehouse}
                                          {isSoldFrom && (
                                            <span className="ml-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                                              sold from here
                                            </span>
                                          )}
                                        </span>
                                        <span className="shrink-0 tabular-nums font-medium">
                                          {formatQty(s.availableQty)}
                                        </span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            ))}
                          </div>
                        )}
                        {item.stockLookupError && (
                          <div className="text-xs break-words text-red-700 dark:text-red-300">
                            {item.stockLookupError}
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
                          <span>
                            {item.stockLookupAt
                              ? `Checked ${formatAppDateTime(new Date(item.stockLookupAt))}`
                              : "Not checked yet"}
                          </span>
                          {item.sku && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              disabled={recheckingId === item.id}
                              onClick={() => void recheckStock(item.id)}
                            >
                              <RefreshCw
                                className={cn("mr-1 size-3.5", recheckingId === item.id && "animate-spin")}
                                aria-hidden
                              />
                              Re-check
                            </Button>
                          )}
                        </div>
                      </div>

                      {item.remark && (
                        <div className="min-w-0 space-y-1 sm:col-span-2 xl:col-span-3">
                          <SectionLabel>Remark</SectionLabel>
                          <div className="text-sm break-words whitespace-pre-wrap">{item.remark}</div>
                        </div>
                      )}
                    </div>

                    {canEdit(item) && (
                      <div className="flex items-start justify-end lg:pl-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => openEditor(item)}>
                          Update
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-4">
            <Pagination
              page={data.page}
              limit={data.limit}
              total={data.total}
              onPageChange={(p) => setPage(p)}
              onLimitChange={(newLimit) => {
                setLimit(newLimit);
                setPage(1);
              }}
            />
          </div>

          {scope === "web" && !viewer.canManageWeb && (
            <div className="text-xs text-muted-foreground">
              View-only: updating website requests is not available for your role.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Update stock request</DialogTitle>
            <DialogDescription>
              {editing
                ? `${editing.customerName} · ${editing.productTitle}${editing.variantTitle ? ` (${editing.variantTitle})` : ""}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="stock-request-status">
                  Status
                </label>
                <Select value={formStatus} onValueChange={(v) => setFormStatus(v as StockRequestStatus)}>
                  <SelectTrigger id="stock-request-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STOCK_REQUEST_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STOCK_REQUEST_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(formStatus === "order_placed" || formStatus === "not_interested") && (
                  <p className="text-xs text-muted-foreground">
                    This closes the request: the customer will not get a back-in-stock email.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="stock-request-sold-from">
                  Sold from warehouse
                </label>
                <Select value={formSoldFrom} onValueChange={setFormSoldFrom}>
                  <SelectTrigger id="stock-request-sold-from" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SOLD_FROM_NONE}>Not set</SelectItem>
                    {soldFromOptions.map((o) => (
                      <SelectItem key={o.key} value={o.key}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="stock-request-remark">
                  Remark
                </label>
                <Textarea
                  id="stock-request-remark"
                  rows={3}
                  maxLength={2000}
                  value={formRemark}
                  onChange={(e) => setFormRemark(e.target.value)}
                  placeholder="Call notes, order number, etc."
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void save()} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {scope === "mine" && (
        <NewStockRequestDialog
          open={creating}
          onOpenChange={setCreating}
          onCreated={(item, duplicate) => {
            setData((d) => ({
              ...d,
              items: [item, ...d.items.filter((i) => i.id !== item.id)],
              total: duplicate ? d.total : d.total + 1,
            }));
          }}
        />
      )}
    </div>
  );
}

type ProductHit = {
  sku: string;
  title: string;
  variantTitle: string | null;
  imageUrl: string | null;
  onWebsite: boolean;
  inErp: boolean;
};

function NewStockRequestDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (item: StockRequestItem, duplicate: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [erpWarning, setErpWarning] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductHit | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      setProduct(null);
      setCustomerName("");
      setCustomerPhone("");
      setCustomerEmail("");
      setRemark("");
      setErpWarning(null);
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (product || q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/stock-requests/product-search?q=${encodeURIComponent(q)}`);
        const body = (await res.json().catch(() => ({}))) as {
          hits?: ProductHit[];
          erpErrors?: string[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          notify.error(body.error ?? "Product search failed");
          return;
        }
        setHits(body.hits ?? []);
        setErpWarning(body.erpErrors?.length ? "Some ERP item lists could not be searched." : null);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, product]);

  async function submit() {
    if (!product) {
      notify.error("Pick a product first");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/stock-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: product.sku,
          productTitle: product.title,
          customerName,
          customerPhone,
          customerEmail: customerEmail.trim() || undefined,
          remark: remark.trim() || undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        item?: StockRequestItem;
        duplicate?: boolean;
        error?: string;
      };
      if (!res.ok || !body.item) {
        notify.error(body.error ?? "Could not create the request");
        return;
      }
      onCreated(body.item, Boolean(body.duplicate));
      notify.success(
        body.duplicate
          ? "This customer already has an open request for this item."
          : body.item.stockLookupStatus === "found"
            ? "Request saved. This item is in stock now; see where below."
            : "Request saved. You'll get a reminder when it's back in stock.",
      );
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New stock request</DialogTitle>
          <DialogDescription>
            Add a customer to the wishlist for an item. We check every warehouse now and remind you when it comes back.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="new-stock-request-product">
              Product
            </label>
            {product ? (
              <div className="flex items-center gap-3 rounded-md border border-border p-2">
                <ProductThumb hit={product} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{product.title}</div>
                  <div className="font-mono text-xs text-muted-foreground">{product.sku}</div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setProduct(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    id="new-stock-request-product"
                    className="pl-8"
                    placeholder="Search by SKU or product name"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoComplete="off"
                    autoFocus
                  />
                </div>
                {searching && <div className="text-xs text-muted-foreground">Searching…</div>}
                {!searching && query.trim().length >= 2 && hits.length === 0 && (
                  <div className="text-xs text-muted-foreground">No products found.</div>
                )}
                {erpWarning && <div className="text-xs text-amber-700 dark:text-amber-300">{erpWarning}</div>}
                {hits.length > 0 && (
                  <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
                    {hits.map((hit) => (
                      <li key={hit.sku}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 p-2 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                          onClick={() => setProduct(hit)}
                        >
                          <ProductThumb hit={hit} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{hit.title}</div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-mono">{hit.sku}</span>
                              <span
                                className={cn(
                                  "rounded px-1 py-px text-[10px] font-medium uppercase tracking-wide",
                                  hit.onWebsite
                                    ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                                    : "bg-muted text-muted-foreground",
                                )}
                              >
                                {hit.onWebsite ? "Website" : "ERP only"}
                              </span>
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="new-stock-request-name">
                Customer name
              </label>
              <Input id="new-stock-request-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="new-stock-request-phone">
                Phone
              </label>
              <Input
                id="new-stock-request-phone"
                type="tel"
                inputMode="tel"
                placeholder="07X XXX XXXX"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="new-stock-request-email">
                Email <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="new-stock-request-email"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="new-stock-request-remark">
                Remark <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                id="new-stock-request-remark"
                rows={2}
                maxLength={2000}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            With an email, the customer is emailed automatically when the item is back in stock.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={saving || !product}>
              {saving ? "Saving and checking stock…" : "Save request"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProductThumb({ hit }: { hit: ProductHit }) {
  return hit.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={hit.imageUrl} alt="" className="size-10 shrink-0 rounded object-cover" loading="lazy" />
  ) : (
    <div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
      <Package className="size-4" aria-hidden />
    </div>
  );
}

/**
 * Stock Requests: "Website requests" (stock_requests.read) and "My requests"
 * (stock_requests.create). Users with both, and admins, see both tabs.
 */
export function StockRequestsPanel({
  viewer,
  initialTab,
  initialData,
}: {
  viewer: StockRequestsViewerProps;
  initialTab: Scope;
  initialData: StockRequestListResponse;
}) {
  const tabs: Scope[] = [
    ...(viewer.canViewWeb ? (["web"] as const) : []),
    ...(viewer.canCreate ? (["mine"] as const) : []),
  ];
  const [tab, setTab] = useState<Scope>(initialTab);

  if (tabs.length <= 1) {
    return <StockRequestsList scope={initialTab} initialData={initialData} viewer={viewer} />;
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        const next = value as Scope;
        setTab(next);
        const url = new URL(window.location.href);
        url.searchParams.set("tab", next);
        window.history.replaceState(null, "", url);
      }}
      className="space-y-4"
    >
      <TabsList>
        <TabsTrigger value="web">Website requests</TabsTrigger>
        <TabsTrigger value="mine">My requests</TabsTrigger>
      </TabsList>
      {tabs.map((scope) => (
        <TabsContent key={scope} value={scope}>
          <StockRequestsList scope={scope} initialData={scope === initialTab ? initialData : null} viewer={viewer} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
