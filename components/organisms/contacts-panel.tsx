"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, FileUp, Loader2, Plus, Search, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { notify } from "@/lib/notify";

type ContactItem = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  status: "active" | "inactive" | "never_purchased";
  lastPurchaseAt: string | null;
  recentMerchant: string | null;
  updatedAt: string;
  createdAt: string;
};

type ContactPurchaseOrder = {
  id: string;
  shopifyOrderId: string;
  orderNumber: string | null;
  name: string | null;
  totalPrice: string;
  currency: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  createdAt: string;
};

type ContactsPanelInitialData = {
  contacts: ContactItem[];
  total: number;
  page: number;
  limit: number;
  counts: {
    all: number;
    active: number;
    inactive: number;
    neverPurchased: number;
  };
};

type CreateContactInput = {
  name: string;
  email: string;
  phoneNumber: string;
  recentMerchant: string;
};

function toDateTimeLabel(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-LK");
}

function statusLabel(status: ContactItem["status"]) {
  if (status === "active") return "Active";
  if (status === "inactive") return "Inactive";
  return "Never Purchased";
}

function statusPillClass(status: ContactItem["status"]) {
  if (status === "active") {
    return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  }
  if (status === "inactive") {
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  }
  return "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase() || "NA";
}

function formatAmount(value: string, currency?: string | null) {
  const n = Number.parseFloat(value);
  if (Number.isNaN(n)) return value;
  const formatted = n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${formatted} ${currency}` : formatted;
}

export function ContactsPanel({
  initialData,
  canManage,
}: {
  initialData: ContactsPanelInitialData;
  canManage: boolean;
}) {
  const [contacts, setContacts] = useState<ContactItem[]>(initialData.contacts);
  const [total, setTotal] = useState(initialData.total);
  const [counts, setCounts] = useState(initialData.counts);
  const [page, setPage] = useState(initialData.page);
  const [limit, setLimit] = useState(initialData.limit);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<"__all" | "active" | "inactive" | "never_purchased">("__all");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewingContact, setViewingContact] = useState<ContactItem | null>(null);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [contactPurchases, setContactPurchases] = useState<ContactPurchaseOrder[]>([]);
  const [createForm, setCreateForm] = useState<CreateContactInput>({
    name: "",
    email: "",
    phoneNumber: "",
    recentMerchant: "",
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const skippedInitialFetch = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status]);

  const fetchPageData = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    params.set("sort_by", "updated");
    params.set("sort_order", "desc");
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (status !== "__all") params.set("status", status);

    const res = await fetch(`/api/admin/contacts/page-data?${params.toString()}`);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error ?? "Failed to fetch contacts");
    }
    const data = (await res.json()) as ContactsPanelInitialData;
    setContacts(data.contacts);
    setTotal(data.total);
    setCounts(data.counts);
  }, [debouncedSearch, page, limit, status]);

  useEffect(() => {
    if (!skippedInitialFetch.current) {
      skippedInitialFetch.current = true;
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchPageData()
      .catch((error) => {
        if (!cancelled) notify.error(error instanceof Error ? error.message : "Failed to fetch contacts");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPageData]);

  async function onImportCsv(file: File) {
    try {
      setImporting(true);
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/contacts/import", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as {
        error?: string;
        summary?: { totalRows: number; created: number; updated: number; skipped: number };
      };
      if (!res.ok) {
        notify.error(data.error ?? "Import failed");
        return;
      }
      notify.success(
        `Import complete. Created ${data.summary?.created ?? 0}, updated ${data.summary?.updated ?? 0}, skipped ${data.summary?.skipped ?? 0}.`
      );
      await fetchPageData();
    } catch {
      notify.error("Import failed");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onCreateContact() {
    if (!createForm.name.trim()) {
      notify.error("Name is required");
      return;
    }

    try {
      setCreating(true);
      const res = await fetch("/api/admin/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createForm,
          email: createForm.email.trim() || null,
          phoneNumber: createForm.phoneNumber.trim() || null,
          recentMerchant: createForm.recentMerchant.trim() || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to add contact");
        return;
      }
      notify.success("Contact added");
      setCreateDialogOpen(false);
      setCreateForm({
        name: "",
        email: "",
        phoneNumber: "",
        recentMerchant: "",
      });
      await fetchPageData();
    } catch {
      notify.error("Failed to add contact");
    } finally {
      setCreating(false);
    }
  }

  async function onViewPurchases(contact: ContactItem) {
    setViewingContact(contact);
    setContactPurchases([]);
    setPurchasesLoading(true);
    try {
      const res = await fetch(`/api/admin/contacts/${contact.id}/orders`);
      const data = (await res.json()) as { error?: string; orders?: ContactPurchaseOrder[] };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to fetch purchases");
        return;
      }
      setContactPurchases(data.orders ?? []);
    } catch {
      notify.error("Failed to fetch purchases");
    } finally {
      setPurchasesLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent))]">
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5" />
            Contact Master
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Maintain all customer contacts in one place. Import from CSV or add contacts manually.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              className={`rounded-xl border p-3 text-left transition-all ${
                status === "__all"
                  ? "border-primary/40 bg-primary/8 shadow-[0_10px_22px_-18px_var(--primary)]"
                  : "border-border/70 bg-background/70 hover:bg-secondary/10"
              }`}
              onClick={() => setStatus("__all")}
            >
              <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">All Contacts</p>
              <p className="text-xl font-semibold">{counts.all}</p>
            </button>
            <button
              type="button"
              className={`rounded-xl border p-3 text-left transition-all ${
                status === "active"
                  ? "border-primary/40 bg-primary/8 shadow-[0_10px_22px_-18px_var(--primary)]"
                  : "border-border/70 bg-background/70 hover:bg-secondary/10"
              }`}
              onClick={() => setStatus("active")}
            >
              <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Active</p>
              <p className="text-xl font-semibold">{counts.active}</p>
            </button>
            <button
              type="button"
              className={`rounded-xl border p-3 text-left transition-all ${
                status === "inactive"
                  ? "border-primary/40 bg-primary/8 shadow-[0_10px_22px_-18px_var(--primary)]"
                  : "border-border/70 bg-background/70 hover:bg-secondary/10"
              }`}
              onClick={() => setStatus("inactive")}
            >
              <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Inactive</p>
              <p className="text-xl font-semibold">{counts.inactive}</p>
            </button>
            <button
              type="button"
              className={`rounded-xl border p-3 text-left transition-all ${
                status === "never_purchased"
                  ? "border-primary/40 bg-primary/8 shadow-[0_10px_22px_-18px_var(--primary)]"
                  : "border-border/70 bg-background/70 hover:bg-secondary/10"
              }`}
              onClick={() => setStatus("never_purchased")}
            >
              <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Never Purchased</p>
              <p className="text-xl font-semibold">{counts.neverPurchased}</p>
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {canManage && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="border-border/70 bg-background/70 hover:bg-secondary/15"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                >
                  <FileUp className="mr-2 size-4" />
                  {importing ? "Importing..." : "Import CSV"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void onImportCsv(file);
                  }}
                />

                  <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                      <Plus className="mr-2 size-4" />
                      Add Contact
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-xl border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_94%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))]">
                    <DialogHeader>
                      <DialogTitle>Add Contact</DialogTitle>
                      <DialogDescription>Create a contact manually for your contact master table.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        placeholder="Name *"
                        value={createForm.name}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                        className="rounded-lg border-border/80 bg-background/80"
                      />
                      <Input
                        placeholder="Email"
                        value={createForm.email}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                        className="rounded-lg border-border/80 bg-background/80"
                      />
                      <Input
                        placeholder="Phone number"
                        value={createForm.phoneNumber}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, phoneNumber: e.target.value }))}
                        className="rounded-lg border-border/80 bg-background/80"
                      />
                      <Input
                        placeholder="Recent merchant"
                        value={createForm.recentMerchant}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, recentMerchant: e.target.value }))}
                        className="rounded-lg border-border/80 bg-background/80"
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={creating}>
                        Cancel
                      </Button>
                      <Button onClick={onCreateContact} disabled={creating}>
                        {creating ? "Saving..." : "Save Contact"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}

            <div className="relative sm:ml-auto sm:max-w-sm sm:flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                placeholder="Search name, email, phone, merchant..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-lg border-border/80 bg-background/80 pl-9"
              />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="w-full border-border/80 bg-background/80 sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="never_purchased">Never Purchased</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              className="hover:bg-secondary/15"
              onClick={() => {
                setSearch("");
                setStatus("__all");
              }}
            >
              Reset
            </Button>
          </div>

          {loading ? (
            <TableSkeleton columns={7} rows={6} />
          ) : contacts.length === 0 ? (
            <div className="rounded-md border border-dashed py-10 text-center">
              <p className="text-sm font-medium">No contacts found</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Try changing filters, or import/add contacts to build your contact master.
              </p>
            </div>
          ) : (
            <>
              <p className="text-muted-foreground text-sm">
                Showing {contacts.length} of {total} contacts
              </p>
              <div className="overflow-x-auto rounded-xl border border-border/70">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-[linear-gradient(180deg,color-mix(in_srgb,var(--secondary)_14%,transparent),transparent)]">
                      <th className="px-4 py-2 text-left font-medium">Contact</th>
                      <th className="px-4 py-2 text-left font-medium">Phone</th>
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                      <th className="px-4 py-2 text-left font-medium">Last Purchase</th>
                      <th className="px-4 py-2 text-left font-medium">Recent Merchant</th>
                      <th className="px-4 py-2 text-left font-medium">Updated</th>
                      <th className="px-4 py-2 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((contact) => (
                      <tr key={contact.id} className="border-b last:border-0 hover:bg-secondary/10">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex size-8 items-center justify-center rounded-full bg-secondary/20 text-muted-foreground text-xs font-semibold">
                              {initials(contact.name)}
                            </span>
                            <div>
                              <p className="font-medium">{contact.name}</p>
                              <p className="text-muted-foreground text-xs">{contact.email || "No email"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2">{contact.phoneNumber || "N/A"}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${statusPillClass(contact.status)}`}>
                            {statusLabel(contact.status)}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{toDateTimeLabel(contact.lastPurchaseAt)}</td>
                        <td className="px-4 py-2">{contact.recentMerchant || "N/A"}</td>
                        <td className="px-4 py-2 text-muted-foreground">{toDateTimeLabel(contact.updatedAt)}</td>
                        <td className="px-4 py-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-border/70 bg-background/70 hover:bg-secondary/15"
                            onClick={() => {
                              void onViewPurchases(contact);
                            }}
                          >
                            <Eye className="mr-1 size-4" />
                            View Purchases
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {total > 0 && (
                <Pagination
                  page={page}
                  limit={limit}
                  total={total}
                  onPageChange={setPage}
                  onLimitChange={(newLimit) => {
                    setLimit(newLimit);
                    setPage(1);
                  }}
                  limitOptions={[10, 25, 50, 100]}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!viewingContact}
        onOpenChange={(open) => {
          if (!open) {
            setViewingContact(null);
            setContactPurchases([]);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_94%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))]">
            <DialogHeader>
              <DialogTitle>Purchases - {viewingContact?.name ?? "Contact"}</DialogTitle>
              <DialogDescription>
              Order history linked by this contact&apos;s email/phone.
              </DialogDescription>
            </DialogHeader>

          {purchasesLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : contactPurchases.length === 0 ? (
            <div className="rounded-md border border-dashed py-10 text-center">
              <p className="text-sm font-medium">No purchases found</p>
              <p className="text-muted-foreground mt-1 text-sm">
                This contact has no matching orders yet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-muted-foreground text-sm">
                {contactPurchases.length} order(s) found
              </p>
              <div className="overflow-x-auto rounded-xl border border-border/70">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-[linear-gradient(180deg,color-mix(in_srgb,var(--secondary)_14%,transparent),transparent)]">
                      <th className="px-4 py-2 text-left font-medium">Order</th>
                      <th className="px-4 py-2 text-left font-medium">Date</th>
                      <th className="px-4 py-2 text-right font-medium">Total</th>
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                      <th className="px-4 py-2 text-left font-medium">Invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contactPurchases.map((order) => (
                      <tr key={order.id} className="border-b last:border-0 hover:bg-secondary/10">
                        <td className="px-4 py-2">
                          <p className="font-medium">{order.name ?? order.orderNumber ?? order.shopifyOrderId}</p>
                          <p className="text-muted-foreground text-xs">{order.orderNumber ?? "N/A"}</p>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{toDateTimeLabel(order.createdAt)}</td>
                        <td className="px-4 py-2 text-right">{formatAmount(order.totalPrice, order.currency)}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {order.financialStatus ?? "N/A"} / {order.fulfillmentStatus ?? "N/A"}
                        </td>
                        <td className="px-4 py-2">
                          <a
                            href={`/api/admin/orders/${order.id}/invoice`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            View Invoice
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
