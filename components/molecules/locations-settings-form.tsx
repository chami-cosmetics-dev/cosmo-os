"use client";

import { useState, useEffect } from "react";
import {
  FileText,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  ShoppingCart,
  Store,
  Ticket,
  Trash2,
  Truck,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CloudinaryLogo } from "@/components/molecules/cloudinary-logo";
import { LogoUpload } from "@/components/molecules/logo-upload";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { notify } from "@/lib/notify";
import type { LocationsSettingsInitialData } from "@/lib/page-data/locations-settings";

type Merchant = { id: string; name: string | null; email: string | null };

type Location = {
  id: string;
  name: string;
  logoUrl: string | null;
  address: string | null;
  shortName: string | null;
  locationReference: string | null;
  invoiceHeader: string | null;
  invoiceSubHeader: string | null;
  invoiceFooter: string | null;
  invoicePhone: string | null;
  invoiceEmail: string | null;
  shopifyLocationId: string | null;
  shopifyShopName: string | null;
  shopifyAdminStoreHandle: string | null;
  defaultMerchantUserId?: string | null;
  manualInvoicePrefix?: string | null;
  manualInvoiceNextSeq?: number;
  manualInvoiceSeqPadding?: number;
  createdAt?: string;
  updatedAt?: string;
};

type ShippingChargeRow = {
  id: string;
  label: string;
  amount: string;
  sortOrder: number;
};

const emptyForm = (): Partial<Location> => ({
  name: "",
  logoUrl: null,
  address: "",
  shortName: "",
  locationReference: "",
  invoiceHeader: "",
  invoiceSubHeader: "",
  invoiceFooter: "",
  invoicePhone: "",
  invoiceEmail: "",
  shopifyLocationId: "",
  shopifyShopName: "",
  shopifyAdminStoreHandle: "",
  defaultMerchantUserId: null,
  manualInvoicePrefix: "",
  manualInvoiceSeqPadding: 3,
});

interface LocationsSettingsFormProps {
  canEdit: boolean;
  /** From server (Settings page) so the list renders even if the client fetch fails. */
  initialLocationsData?: LocationsSettingsInitialData | null;
}

export function LocationsSettingsForm({
  canEdit,
  initialLocationsData = null,
}: LocationsSettingsFormProps) {
  const [locations, setLocations] = useState<Location[]>(
    initialLocationsData?.locations ?? []
  );
  const [merchants, setMerchants] = useState<Merchant[]>(
    initialLocationsData?.merchants ?? []
  );
  const [loading, setLoading] = useState(initialLocationsData == null);
  const [page, setPage] = useState(initialLocationsData?.page ?? 1);
  const [limit, setLimit] = useState(initialLocationsData?.limit ?? 10);
  const [total, setTotal] = useState(initialLocationsData?.total ?? 0);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Location>>(emptyForm());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [shippingCharges, setShippingCharges] = useState<ShippingChargeRow[]>([]);
  const [newShipLabel, setNewShipLabel] = useState("");
  const [newShipAmount, setNewShipAmount] = useState("");
  const [newShipSort, setNewShipSort] = useState("0");

  const isBusy = busyKey !== null;

  async function fetchLocations() {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    const res = await fetch(`/api/admin/company/locations?${params}`);
    if (!res.ok) {
      let message = "Failed to load locations";
      try {
        const data = (await res.json()) as { error?: string };
        message = data.error ?? message;
      } catch {
        /* non-JSON error body */
      }
      notify.error(message);
      return;
    }
    const data = (await res.json()) as {
      locations: Location[];
      merchants: Merchant[];
      total: number;
      page: number;
      limit: number;
    };
    setLocations(data.locations);
    setMerchants(data.merchants ?? []);
    setTotal(data.total);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const initialPage = initialLocationsData?.page ?? 1;
      const initialLimit = initialLocationsData?.limit ?? 10;
      const showSpinner =
        initialLocationsData == null ||
        page !== initialPage ||
        limit !== initialLimit;
      if (showSpinner) {
        setLoading(true);
      }
      try {
        await fetchLocations();
      } catch {
        if (!cancelled) notify.error("Failed to load locations");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [page, limit, initialLocationsData]);

  useEffect(() => {
    if (!sheetOpen || sheetMode !== "edit" || !editingId) {
      setShippingCharges([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `/api/admin/company/locations/${editingId}/shipping-charges`
      );
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as {
        shippingCharges: ShippingChargeRow[];
      };
      if (!cancelled) setShippingCharges(data.shippingCharges ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [sheetOpen, sheetMode, editingId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !newName.trim()) return;

    setBusyKey("add");
    try {
      const res = await fetch("/api/admin/company/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          address: newAddress.trim() || undefined,
        }),
      });

      const data = (await res.json()) as Location & { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to add location");
        return;
      }

      await fetchLocations();
      setNewName("");
      setNewAddress("");
      notify.success("Location added.");
    } catch {
      notify.error("Failed to add location");
    } finally {
      setBusyKey(null);
    }
  }

  function openAddSheet() {
    setSheetMode("add");
    setEditingId(null);
    setForm(emptyForm());
    setSheetOpen(true);
  }

  function openEditSheet(loc: Location) {
    setSheetMode("edit");
    setEditingId(loc.id);
    setForm({
      name: loc.name,
      logoUrl: loc.logoUrl ?? null,
      address: loc.address ?? "",
      shortName: loc.shortName ?? "",
      locationReference: loc.locationReference ?? "",
      invoiceHeader: loc.invoiceHeader ?? "",
      invoiceSubHeader: loc.invoiceSubHeader ?? "",
      invoiceFooter: loc.invoiceFooter ?? "",
      invoicePhone: loc.invoicePhone ?? "",
      invoiceEmail: loc.invoiceEmail ?? "",
      shopifyLocationId: loc.shopifyLocationId ?? "",
      shopifyShopName: loc.shopifyShopName ?? "",
      shopifyAdminStoreHandle: loc.shopifyAdminStoreHandle ?? "",
      defaultMerchantUserId: loc.defaultMerchantUserId ?? null,
      manualInvoicePrefix: loc.manualInvoicePrefix ?? "",
      manualInvoiceSeqPadding: loc.manualInvoiceSeqPadding ?? 3,
    });
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    setNewShipLabel("");
    setNewShipAmount("");
    setNewShipSort("0");
  }

  async function handleAddShippingCharge(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId || !canEdit || !newShipLabel.trim()) return;
    const amount = parseFloat(newShipAmount);
    if (Number.isNaN(amount) || amount < 0) {
      notify.error("Enter a valid shipping amount");
      return;
    }
    setBusyKey("ship-add");
    try {
      const res = await fetch(
        `/api/admin/company/locations/${editingId}/shipping-charges`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: newShipLabel.trim(),
            amount,
            sortOrder: parseInt(newShipSort, 10) || 0,
          }),
        }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to add shipping charge");
        return;
      }
      const listRes = await fetch(
        `/api/admin/company/locations/${editingId}/shipping-charges`
      );
      if (listRes.ok) {
        const list = (await listRes.json()) as {
          shippingCharges: ShippingChargeRow[];
        };
        setShippingCharges(list.shippingCharges ?? []);
      }
      setNewShipLabel("");
      setNewShipAmount("");
      setNewShipSort("0");
      notify.success("Shipping option added.");
    } catch {
      notify.error("Failed to add shipping charge");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDeleteShippingCharge(id: string) {
    if (!editingId || !canEdit) return;
    if (!window.confirm("Remove this shipping option?")) return;
    setBusyKey(`ship-del-${id}`);
    try {
      const res = await fetch(
        `/api/admin/company/locations/${editingId}/shipping-charges/${id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        notify.error(data.error ?? "Failed to remove");
        return;
      }
      setShippingCharges((prev) => prev.filter((s) => s.id !== id));
      notify.success("Removed.");
    } catch {
      notify.error("Failed to remove");
    } finally {
      setBusyKey(null);
    }
  }

  const editingLocation = editingId ? locations.find((l) => l.id === editingId) : null;
  const sheetHasChanges =
    sheetMode === "add"
      ? (form.name?.trim() ?? "") !== "" // Add: at least name required
      : editingLocation
        ? (form.name?.trim() ?? "") !== (editingLocation.name ?? "").trim() ||
          (form.logoUrl ?? null) !== (editingLocation.logoUrl ?? null) ||
          (form.address?.trim() ?? "") !== (editingLocation.address ?? "").trim() ||
          (form.shortName?.trim() ?? "") !== (editingLocation.shortName ?? "").trim() ||
          (form.locationReference?.trim() ?? "") !== (editingLocation.locationReference ?? "").trim() ||
          (form.invoiceHeader?.trim() ?? "") !== (editingLocation.invoiceHeader ?? "").trim() ||
          (form.invoiceSubHeader?.trim() ?? "") !== (editingLocation.invoiceSubHeader ?? "").trim() ||
          (form.invoiceFooter?.trim() ?? "") !== (editingLocation.invoiceFooter ?? "").trim() ||
          (form.invoicePhone?.trim() ?? "") !== (editingLocation.invoicePhone ?? "").trim() ||
          (form.invoiceEmail?.trim() ?? "") !== (editingLocation.invoiceEmail ?? "").trim() ||
          (form.shopifyLocationId?.trim() ?? "") !== (editingLocation.shopifyLocationId ?? "").trim() ||
          (form.shopifyShopName?.trim() ?? "") !== (editingLocation.shopifyShopName ?? "").trim() ||
          (form.shopifyAdminStoreHandle?.trim() ?? "") !== (editingLocation.shopifyAdminStoreHandle ?? "").trim() ||
          (form.defaultMerchantUserId ?? null) !== (editingLocation.defaultMerchantUserId ?? null) ||
          (form.manualInvoicePrefix?.trim() ?? "") !== (editingLocation.manualInvoicePrefix ?? "").trim() ||
          (form.manualInvoiceSeqPadding ?? 3) !== (editingLocation.manualInvoiceSeqPadding ?? 3)
        : false;

  async function handleLocationLogoChange(url: string | null) {
    setForm((f) => ({ ...f, logoUrl: url }));
    if (!editingId || !form.name?.trim()) return;

    setBusyKey(`save-logo-${editingId}`);
    try {
      const payload = {
        name: form.name.trim(),
        logoUrl: url,
        address: form.address?.trim() || undefined,
        shortName: form.shortName?.trim() || undefined,
        locationReference: form.locationReference?.trim() || undefined,
        invoiceHeader: form.invoiceHeader?.trim() || undefined,
        invoiceSubHeader: form.invoiceSubHeader?.trim() || undefined,
        invoiceFooter: form.invoiceFooter?.trim() || undefined,
        invoicePhone: form.invoicePhone?.trim() || undefined,
        invoiceEmail: form.invoiceEmail?.trim() || undefined,
        shopifyLocationId: form.shopifyLocationId?.trim() || undefined,
        shopifyShopName: form.shopifyShopName?.trim() || undefined,
        shopifyAdminStoreHandle: form.shopifyAdminStoreHandle?.trim() || undefined,
        defaultMerchantUserId: form.defaultMerchantUserId || null,
        manualInvoicePrefix:
          form.manualInvoicePrefix?.trim() === ""
            ? null
            : form.manualInvoicePrefix?.trim(),
        manualInvoiceSeqPadding: form.manualInvoiceSeqPadding ?? 3,
      };
      const res = await fetch(`/api/admin/company/locations/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as Location & { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to save logo");
        return;
      }
      setLocations((prev) =>
        prev
          .map((l) => (l.id === editingId ? data : l))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch {
      notify.error("Failed to save logo");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSheetSubmit() {
    if (!form.name?.trim()) {
      notify.error("Location name is required");
      return;
    }

    const payload = {
      name: form.name.trim(),
      logoUrl: form.logoUrl,
      address: form.address?.trim() || undefined,
      shortName: form.shortName?.trim() || undefined,
      locationReference: form.locationReference?.trim() || undefined,
      invoiceHeader: form.invoiceHeader?.trim() || undefined,
      invoiceSubHeader: form.invoiceSubHeader?.trim() || undefined,
      invoiceFooter: form.invoiceFooter?.trim() || undefined,
      invoicePhone: form.invoicePhone?.trim() || undefined,
      invoiceEmail: form.invoiceEmail?.trim() || undefined,
      shopifyLocationId: form.shopifyLocationId?.trim() || undefined,
      shopifyShopName: form.shopifyShopName?.trim() || undefined,
      shopifyAdminStoreHandle: form.shopifyAdminStoreHandle?.trim() || undefined,
      defaultMerchantUserId: form.defaultMerchantUserId || null,
      manualInvoicePrefix:
        form.manualInvoicePrefix?.trim() === ""
          ? null
          : form.manualInvoicePrefix?.trim(),
      manualInvoiceSeqPadding: form.manualInvoiceSeqPadding ?? 3,
    };

    if (sheetMode === "add") {
      setBusyKey("add");
      try {
        const res = await fetch("/api/admin/company/locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as Location & { error?: string };
        if (!res.ok) {
          notify.error(data.error ?? "Failed to add location");
          return;
        }
        setLocations((prev) =>
          [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
        );
        closeSheet();
        notify.success("Location added.");
      } catch {
        notify.error("Failed to add location");
      } finally {
        setBusyKey(null);
      }
    } else if (editingId) {
      setBusyKey(`update-${editingId}`);
      try {
        const res = await fetch(`/api/admin/company/locations/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as Location & { error?: string };
        if (!res.ok) {
          notify.error(data.error ?? "Failed to update location");
          return;
        }
        setLocations((prev) =>
          prev
            .map((l) => (l.id === editingId ? data : l))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        closeSheet();
        notify.success("Location updated.");
      } catch {
        notify.error("Failed to update location");
      } finally {
        setBusyKey(null);
      }
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!canEdit) return;
    if (!window.confirm(`Delete location "${name}"?`)) return;

    setBusyKey(`delete-${id}`);
    try {
      const res = await fetch(`/api/admin/company/locations/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        notify.error(data.error ?? "Failed to delete location");
        return;
      }

      setLocations((prev) => prev.filter((l) => l.id !== id));
      if (editingId === id) closeSheet();
      notify.success("Location deleted.");
    } catch {
      notify.error("Failed to delete location");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Company Locations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Company Locations</CardTitle>
          <CardDescription>
            Manage office branches, Shopify links, and invoice details per
            location.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canEdit && (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Quick Add Location</p>
                  <p className="text-muted-foreground text-xs">
                    Add basic location details quickly, or open full form for invoice and Shopify settings.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={openAddSheet}
                  disabled={isBusy}
                >
                  <Plus className="size-4" aria-hidden />
                  Full form
                </Button>
              </div>
              <form
                onSubmit={handleAdd}
                className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
              >
                <div className="space-y-2">
                  <label className="text-sm font-medium">Location name</label>
                  <Input
                    placeholder="Location name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={isBusy}
                    maxLength={200}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Address (optional)</label>
                  <Input
                    placeholder="Address (optional)"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    disabled={isBusy}
                    maxLength={500}
                  />
                </div>
                <div>
                  <Button type="submit" className="w-full md:w-auto" disabled={isBusy || !newName.trim()}>
                    {busyKey === "add" ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Adding...
                      </>
                    ) : (
                      "Add location"
                    )}
                  </Button>
                </div>
              </form>
            </div>
          )}

          <ul className="space-y-2">
            {locations.map((loc) => (
              <li
                key={loc.id}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
                    {loc.logoUrl ? (
                      <CloudinaryLogo src={loc.logoUrl} alt="" width={40} height={40} className="size-full object-contain" />
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{loc.name}</p>
                  {loc.shortName && (
                    <p className="text-muted-foreground text-xs">
                      Short name: {loc.shortName} (for SMS)
                    </p>
                  )}
                  {loc.address && (
                    <p className="text-muted-foreground text-sm">
                      {loc.address}
                    </p>
                  )}
                  {(loc.shopifyLocationId || loc.shopifyShopName || loc.shopifyAdminStoreHandle) && (
                    <p className="text-muted-foreground text-xs">
                      Shopify: {loc.shopifyAdminStoreHandle ?? loc.shopifyShopName ?? "—"} (
                      {loc.shopifyLocationId ?? "—"})
                    </p>
                  )}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditSheet(loc)}
                      disabled={isBusy}
                    >
                      <Pencil className="size-4" aria-hidden />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(loc.id, loc.name)}
                      disabled={isBusy}
                    >
                      {busyKey === `delete-${loc.id}` ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="size-4" aria-hidden />
                      )}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {locations.length === 0 && !loading && (
            <p className="text-muted-foreground text-sm">No locations added yet.</p>
          )}

          {total > 0 && (
            <Pagination
              page={page}
              limit={limit}
              total={total}
              onPageChange={setPage}
              onLimitChange={(l) => {
                setLimit(l);
                setPage(1);
              }}
            />
          )}
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col overflow-y-auto sm:max-w-lg"
        >
          <SheetHeader>
            <SheetTitle>
              {sheetMode === "add" ? "Add Location" : "Edit Location"}
            </SheetTitle>
            <SheetDescription>
              {sheetMode === "add"
                ? "Add a new company location with Shopify and invoice details."
                : "Update location details including invoice and Shopify settings."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-6 py-4">
            {canEdit && editingId && (
              <LogoUpload
                value={form.logoUrl ?? null}
                onChange={handleLocationLogoChange}
                uploadType="location"
                locationId={editingId}
                disabled={isBusy}
                label="Location logo"
              />
            )}
            {canEdit && sheetMode === "add" && (
              <div className="rounded-lg border border-dashed bg-muted/20 p-3">
                <p className="text-muted-foreground text-sm">
                  Add a logo after creating the location.
                </p>
              </div>
            )}
            {!canEdit && form.logoUrl && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Location logo</label>
                <div className="flex size-20 overflow-hidden rounded-lg border bg-muted">
                  <CloudinaryLogo src={form.logoUrl} alt="Location logo" className="size-full object-contain" />
                </div>
              </div>
            )}
            <div className="space-y-3 rounded-lg border bg-muted/10 p-4">
              <h4 className="flex items-center gap-2 text-sm font-medium">
                <MapPin className="size-4 text-muted-foreground" aria-hidden />
                Basic
              </h4>
              <Input
                placeholder="Location name *"
                value={form.name ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                disabled={isBusy}
                maxLength={200}
              />
              <Textarea
                placeholder="Address"
                value={form.address ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                disabled={isBusy}
                rows={3}
                maxLength={500}
              />
              <Input
                placeholder="Short name (for SMS)"
                value={form.shortName ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, shortName: e.target.value }))
                }
                disabled={isBusy}
                maxLength={50}
              />
            </div>

            <div className="space-y-3 rounded-lg border bg-muted/10 p-4">
              <h4 className="flex items-center gap-2 text-sm font-medium">
                <FileText className="size-4 text-muted-foreground" aria-hidden />
                Invoice Details
              </h4>
              <Input
                placeholder="Invoice header"
                value={form.invoiceHeader ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, invoiceHeader: e.target.value }))
                }
                disabled={isBusy}
                maxLength={500}
              />
              <Input
                placeholder="Invoice sub header"
                value={form.invoiceSubHeader ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, invoiceSubHeader: e.target.value }))
                }
                disabled={isBusy}
                maxLength={500}
              />
              <Input
                placeholder="Invoice footer"
                value={form.invoiceFooter ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, invoiceFooter: e.target.value }))
                }
                disabled={isBusy}
                maxLength={500}
              />
              <Input
                placeholder="Phone number"
                value={form.invoicePhone ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, invoicePhone: e.target.value }))
                }
                disabled={isBusy}
                maxLength={100}
              />
              <Input
                placeholder="Email"
                type="email"
                value={form.invoiceEmail ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, invoiceEmail: e.target.value }))
                }
                disabled={isBusy}
                maxLength={254}
              />
            </div>

            <div className="space-y-3 rounded-lg border bg-muted/10 p-4">
              <h4 className="flex items-center gap-2 text-sm font-medium">
                <ShoppingCart className="size-4 text-muted-foreground" aria-hidden />
                Manual orders (invoice prefix)
              </h4>
              <p className="text-muted-foreground text-xs">
                Non-Shopify orders use this prefix plus a sequential number (e.g. prefix{" "}
                <strong>900</strong> → 900001, 900002).
              </p>
              <Input
                placeholder="Invoice number prefix (digits only, e.g. 900)"
                value={form.manualInvoicePrefix ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, manualInvoicePrefix: e.target.value }))
                }
                disabled={isBusy}
                maxLength={12}
                inputMode="numeric"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Sequence padding</label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={form.manualInvoiceSeqPadding ?? 3}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        manualInvoiceSeqPadding: Math.min(
                          12,
                          Math.max(1, parseInt(e.target.value, 10) || 0)
                        ),
                      }))
                    }
                    disabled={isBusy}
                  />
                </div>
                {sheetMode === "edit" && editingLocation?.manualInvoiceNextSeq != null && (
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Last issued sequence</label>
                    <Input
                      readOnly
                      value={String(editingLocation.manualInvoiceNextSeq ?? 0)}
                      className="bg-muted"
                    />
                  </div>
                )}
              </div>
            </div>

            {sheetMode === "edit" && editingId && (
              <div className="space-y-3 rounded-lg border bg-muted/10 p-4">
                <h4 className="flex items-center gap-2 text-sm font-medium">
                  <Truck className="size-4 text-muted-foreground" aria-hidden />
                  Shipping charges (manual orders)
                </h4>
                <p className="text-muted-foreground text-xs">
                  Preset options appear when creating a manual order for this location.
                </p>
                {shippingCharges.length > 0 && (
                  <ul className="space-y-2">
                    {shippingCharges.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-2 rounded border bg-background px-3 py-2 text-sm"
                      >
                        <span>
                          {s.label}{" "}
                          <span className="text-muted-foreground">
                            ({Number(s.amount).toLocaleString("en-LK", { minimumFractionDigits: 2 })})
                          </span>
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0"
                          onClick={() => handleDeleteShippingCharge(s.id)}
                          disabled={isBusy}
                          aria-label="Remove"
                        >
                          {busyKey === `ship-del-${s.id}` ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="size-4" aria-hidden />
                          )}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {canEdit && (
                  <form
                    onSubmit={handleAddShippingCharge}
                    className="grid gap-2 sm:grid-cols-[1fr_100px_80px_auto] sm:items-end"
                  >
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Label</label>
                      <Input
                        value={newShipLabel}
                        onChange={(e) => setNewShipLabel(e.target.value)}
                        disabled={isBusy}
                        placeholder="e.g. Standard delivery"
                        maxLength={120}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Amount (LKR)</label>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={newShipAmount}
                        onChange={(e) => setNewShipAmount(e.target.value)}
                        disabled={isBusy}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Sort</label>
                      <Input
                        type="number"
                        value={newShipSort}
                        onChange={(e) => setNewShipSort(e.target.value)}
                        disabled={isBusy}
                      />
                    </div>
                    <Button type="submit" disabled={isBusy || !newShipLabel.trim()}>
                      {busyKey === "ship-add" ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <Plus className="size-4" aria-hidden />
                      )}
                    </Button>
                  </form>
                )}
              </div>
            )}

            <div className="space-y-3 rounded-lg border bg-muted/10 p-4">
              <h4 className="flex items-center gap-2 text-sm font-medium">
                <Store className="size-4 text-muted-foreground" aria-hidden />
                Shopify Link Details
              </h4>
              <Input
                placeholder="Shopify location ID"
                value={form.shopifyLocationId ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, shopifyLocationId: e.target.value }))
                }
                disabled={isBusy}
                maxLength={100}
              />
              <Input
                placeholder="Shop name (myshopify.com domain)"
                value={form.shopifyShopName ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, shopifyShopName: e.target.value }))
                }
                disabled={isBusy}
                maxLength={200}
              />
              <Input
                placeholder="Admin store handle (e.g. u71ajc-11) *"
                value={form.shopifyAdminStoreHandle ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, shopifyAdminStoreHandle: e.target.value }))
                }
                disabled={isBusy}
                maxLength={100}
              />
              <p className="text-muted-foreground text-xs">
                Use the store handle from your Shopify admin URL. Example: admin.shopify.com/store/
                <strong>u71ajc-11</strong>/orders
              </p>
            </div>

            {merchants.length > 0 && (
              <div className="space-y-3 rounded-lg border bg-muted/10 p-4">
                <h4 className="flex items-center gap-2 text-sm font-medium">
                  <UserRound className="size-4 text-muted-foreground" aria-hidden />
                  Order Assignment
                </h4>
                <div className="space-y-2">
                  <label htmlFor="location-defaultMerchant" className="text-sm">
                    Default merchant (web orders)
                  </label>
                  <Select
                    value={form.defaultMerchantUserId ?? "__none"}
                    onValueChange={(value) =>
                      setForm((f) => ({
                        ...f,
                        defaultMerchantUserId: value === "__none" ? null : value,
                      }))
                    }
                    disabled={isBusy}
                  >
                    <SelectTrigger id="location-defaultMerchant" className="w-full bg-background">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None</SelectItem>
                      {merchants.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name || m.email || m.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">
                    Web orders without a coupon match will be assigned to this merchant.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-3 rounded-lg border bg-muted/10 p-4">
              <h4 className="flex items-center gap-2 text-sm font-medium">
                <Ticket className="size-4 text-muted-foreground" aria-hidden />
                Sticker Related Details
              </h4>
              <Input
                placeholder="Location reference"
                value={form.locationReference ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, locationReference: e.target.value }))
                }
                disabled={isBusy}
                maxLength={100}
              />
            </div>
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={closeSheet} disabled={isBusy}>
              Cancel
            </Button>
            <Button
              onClick={handleSheetSubmit}
              disabled={isBusy || !form.name?.trim() || (sheetMode === "edit" && !sheetHasChanges)}
            >
              {busyKey?.startsWith("add")
                ? "Adding..."
                : busyKey?.startsWith("update")
                  ? "Saving..."
                  : sheetMode === "add"
                    ? "Add Location"
                    : "Save"}
              {(busyKey === "add" || busyKey?.startsWith("update-")) && (
                <Loader2 className="ml-2 size-4 animate-spin" aria-hidden />
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
