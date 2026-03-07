"use client";

import { useState, useEffect } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

type Merchant = { id: string; name: string | null; email: string | null };

type Location = {
  id: string;
  name: string;
  logoUrl: string | null;
  address: string | null;
  shortName: string | null;
  invoiceHeader: string | null;
  invoiceSubHeader: string | null;
  invoiceFooter: string | null;
  invoicePhone: string | null;
  invoiceEmail: string | null;
  shopifyLocationId: string | null;
  shopifyShopName: string | null;
  shopifyAdminStoreHandle: string | null;
  defaultMerchantUserId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

const emptyForm = (): Partial<Location> => ({
  name: "",
  logoUrl: null,
  address: "",
  shortName: "",
  invoiceHeader: "",
  invoiceSubHeader: "",
  invoiceFooter: "",
  invoicePhone: "",
  invoiceEmail: "",
  shopifyLocationId: "",
  shopifyShopName: "",
  shopifyAdminStoreHandle: "",
  defaultMerchantUserId: null,
});

interface LocationsSettingsFormProps {
  canEdit: boolean;
  initialLocations?: Location[];
  merchants?: Merchant[];
}

export function LocationsSettingsForm({ canEdit, initialLocations, merchants: initialMerchants = [] }: LocationsSettingsFormProps) {
  const [locations, setLocations] = useState<Location[]>(initialLocations ?? []);
  const [merchants, setMerchants] = useState<Merchant[]>(initialMerchants);
  const [loading, setLoading] = useState(initialLocations === undefined);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Location>>(emptyForm());
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  async function fetchLocations() {
    const res = await fetch("/api/admin/company/locations");
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load locations");
      return;
    }
    const data = (await res.json()) as { locations: Location[]; merchants: Merchant[] };
    setLocations(data.locations);
    setMerchants(data.merchants ?? []);
  }

  useEffect(() => {
    if (initialLocations !== undefined) {
      setLoading(false);
      setMerchants(initialMerchants);
      return;
    }
    async function load() {
      try {
        await fetchLocations();
      } catch {
        notify.error("Failed to load locations");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [initialLocations, initialMerchants]);

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

      setLocations((prev) =>
        [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
      );
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
      invoiceHeader: loc.invoiceHeader ?? "",
      invoiceSubHeader: loc.invoiceSubHeader ?? "",
      invoiceFooter: loc.invoiceFooter ?? "",
      invoicePhone: loc.invoicePhone ?? "",
      invoiceEmail: loc.invoiceEmail ?? "",
      shopifyLocationId: loc.shopifyLocationId ?? "",
      shopifyShopName: loc.shopifyShopName ?? "",
      shopifyAdminStoreHandle: loc.shopifyAdminStoreHandle ?? "",
      defaultMerchantUserId: loc.defaultMerchantUserId ?? null,
    });
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingId(null);
    setForm(emptyForm());
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
          (form.invoiceHeader?.trim() ?? "") !== (editingLocation.invoiceHeader ?? "").trim() ||
          (form.invoiceSubHeader?.trim() ?? "") !== (editingLocation.invoiceSubHeader ?? "").trim() ||
          (form.invoiceFooter?.trim() ?? "") !== (editingLocation.invoiceFooter ?? "").trim() ||
          (form.invoicePhone?.trim() ?? "") !== (editingLocation.invoicePhone ?? "").trim() ||
          (form.invoiceEmail?.trim() ?? "") !== (editingLocation.invoiceEmail ?? "").trim() ||
          (form.shopifyLocationId?.trim() ?? "") !== (editingLocation.shopifyLocationId ?? "").trim() ||
          (form.shopifyShopName?.trim() ?? "") !== (editingLocation.shopifyShopName ?? "").trim() ||
          (form.shopifyAdminStoreHandle?.trim() ?? "") !== (editingLocation.shopifyAdminStoreHandle ?? "").trim() ||
          (form.defaultMerchantUserId ?? null) !== (editingLocation.defaultMerchantUserId ?? null)
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
        invoiceHeader: form.invoiceHeader?.trim() || undefined,
        invoiceSubHeader: form.invoiceSubHeader?.trim() || undefined,
        invoiceFooter: form.invoiceFooter?.trim() || undefined,
        invoicePhone: form.invoicePhone?.trim() || undefined,
        invoiceEmail: form.invoiceEmail?.trim() || undefined,
        shopifyLocationId: form.shopifyLocationId?.trim() || undefined,
        shopifyShopName: form.shopifyShopName?.trim() || undefined,
        shopifyAdminStoreHandle: form.shopifyAdminStoreHandle?.trim() || undefined,
        defaultMerchantUserId: form.defaultMerchantUserId || null,
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
      invoiceHeader: form.invoiceHeader?.trim() || undefined,
      invoiceSubHeader: form.invoiceSubHeader?.trim() || undefined,
      invoiceFooter: form.invoiceFooter?.trim() || undefined,
      invoicePhone: form.invoicePhone?.trim() || undefined,
      invoiceEmail: form.invoiceEmail?.trim() || undefined,
      shopifyLocationId: form.shopifyLocationId?.trim() || undefined,
      shopifyShopName: form.shopifyShopName?.trim() || undefined,
      shopifyAdminStoreHandle: form.shopifyAdminStoreHandle?.trim() || undefined,
      defaultMerchantUserId: form.defaultMerchantUserId || null,
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
          <p className="text-muted-foreground text-sm">
            Manage office branches, Shopify links, and invoice details per
            location.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {canEdit && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <form
                onSubmit={handleAdd}
                className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end"
              >
                <div className="flex-1 space-y-2">
                  <Input
                    placeholder="Location name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={isBusy}
                    maxLength={200}
                  />
                  <Input
                    placeholder="Address (optional)"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    disabled={isBusy}
                    maxLength={500}
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={isBusy || !newName.trim()}>
                    {busyKey === "add" ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Adding...
                      </>
                    ) : (
                      "Add"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openAddSheet}
                    disabled={isBusy}
                  >
                    <Plus className="size-4" aria-hidden />
                    Add with details
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

          {locations.length === 0 && (
            <p className="text-muted-foreground text-sm">No locations added yet.</p>
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
              <p className="text-muted-foreground text-sm">
                Add a logo after creating the location.
              </p>
            )}
            {!canEdit && form.logoUrl && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Location logo</label>
                <div className="flex size-20 overflow-hidden rounded-lg border bg-muted">
                  <CloudinaryLogo src={form.logoUrl} alt="Location logo" className="size-full object-contain" />
                </div>
              </div>
            )}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Basic</h4>
              <Input
                placeholder="Location name *"
                value={form.name ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                disabled={isBusy}
                maxLength={200}
              />
              <Input
                placeholder="Address"
                value={form.address ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                disabled={isBusy}
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

            <div className="space-y-3">
              <h4 className="text-sm font-medium">Invoice Details</h4>
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

            <div className="space-y-3">
              <h4 className="text-sm font-medium">Shopify Link Details</h4>
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
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Order Assignment</h4>
                <div className="space-y-2">
                  <label htmlFor="location-defaultMerchant" className="text-sm">
                    Default merchant (web orders)
                  </label>
                  <select
                    id="location-defaultMerchant"
                    value={form.defaultMerchantUserId ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        defaultMerchantUserId: e.target.value || null,
                      }))
                    }
                    disabled={isBusy}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  >
                    <option value="">None</option>
                    {merchants.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.email || m.id}
                      </option>
                    ))}
                  </select>
                  <p className="text-muted-foreground text-xs">
                    Web orders without a coupon match will be assigned to this merchant.
                  </p>
                </div>
              </div>
            )}
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
