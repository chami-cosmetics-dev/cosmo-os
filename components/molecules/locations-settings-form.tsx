"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Check,
  ChevronsUpDown,
  Link2,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Store,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export function LocationsSettingsForm({
  canEdit,
  initialLocations,
  merchants: initialMerchants = [],
}: LocationsSettingsFormProps) {
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
  const linkedShopifyCount = locations.filter(
    (location) =>
      location.shopifyLocationId || location.shopifyShopName || location.shopifyAdminStoreHandle
  ).length;
  const assignedMerchantCount = locations.filter((location) => location.defaultMerchantUserId).length;

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

      setLocations((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
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

  const editingLocation = editingId ? locations.find((location) => location.id === editingId) : null;
  const sheetHasChanges =
    sheetMode === "add"
      ? (form.name?.trim() ?? "") !== ""
      : editingLocation
        ? (form.name?.trim() ?? "") !== editingLocation.name.trim() ||
          (form.logoUrl ?? null) !== (editingLocation.logoUrl ?? null) ||
          (form.address?.trim() ?? "") !== (editingLocation.address ?? "").trim() ||
          (form.shortName?.trim() ?? "") !== (editingLocation.shortName ?? "").trim() ||
          (form.invoiceHeader?.trim() ?? "") !== (editingLocation.invoiceHeader ?? "").trim() ||
          (form.invoiceSubHeader?.trim() ?? "") !==
            (editingLocation.invoiceSubHeader ?? "").trim() ||
          (form.invoiceFooter?.trim() ?? "") !== (editingLocation.invoiceFooter ?? "").trim() ||
          (form.invoicePhone?.trim() ?? "") !== (editingLocation.invoicePhone ?? "").trim() ||
          (form.invoiceEmail?.trim() ?? "") !== (editingLocation.invoiceEmail ?? "").trim() ||
          (form.shopifyLocationId?.trim() ?? "") !==
            (editingLocation.shopifyLocationId ?? "").trim() ||
          (form.shopifyShopName?.trim() ?? "") !==
            (editingLocation.shopifyShopName ?? "").trim() ||
          (form.shopifyAdminStoreHandle?.trim() ?? "") !==
            (editingLocation.shopifyAdminStoreHandle ?? "").trim() ||
          (form.defaultMerchantUserId ?? null) !==
            (editingLocation.defaultMerchantUserId ?? null)
        : false;

  async function handleLocationLogoChange(url: string | null) {
    setForm((current) => ({ ...current, logoUrl: url }));
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
        prev.map((location) => (location.id === editingId ? data : location)).sort((a, b) => a.name.localeCompare(b.name))
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

        setLocations((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        closeSheet();
        notify.success("Location added.");
      } catch {
        notify.error("Failed to add location");
      } finally {
        setBusyKey(null);
      }
      return;
    }

    if (!editingId) return;

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
        prev.map((location) => (location.id === editingId ? data : location)).sort((a, b) => a.name.localeCompare(b.name))
      );
      closeSheet();
      notify.success("Location updated.");
    } catch {
      notify.error("Failed to update location");
    } finally {
      setBusyKey(null);
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

      setLocations((prev) => prev.filter((location) => location.id !== id));
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
      <Card className="border-border/70 bg-card/95 shadow-sm">
        <CardHeader>
          <CardTitle>Company Locations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading location settings...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
            <Store className="size-3.5" aria-hidden />
            Branch Management
          </div>
          <div>
            <CardTitle>Company Locations</CardTitle>
            <p className="text-sm text-muted-foreground">
              Manage office branches, Shopify links, and invoice details for each location.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Total Branches
              </p>
              <p className="mt-2 text-2xl font-semibold">{locations.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Offices and stores configured for this company.
              </p>
            </div>
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Shopify Linked
              </p>
              <p className="mt-2 text-2xl font-semibold">{linkedShopifyCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Locations with a Shopify connection already saved.
              </p>
            </div>
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Default Merchants
              </p>
              <p className="mt-2 text-2xl font-semibold">{assignedMerchantCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Branches with a default web-order assignment.
              </p>
            </div>
          </div>

          {canEdit ? (
            <div className="rounded-xl border bg-background/80 p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <Plus className="size-4 text-sky-700" aria-hidden />
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Add Location
                </h3>
              </div>
              <form onSubmit={handleAdd} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <div className="space-y-1.5">
                    <label htmlFor="new-location-name" className="text-sm font-medium">
                      Location name
                    </label>
                    <Input
                      id="new-location-name"
                      placeholder="Enter branch or office name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      disabled={isBusy}
                      maxLength={200}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="new-location-address" className="text-sm font-medium">
                      Address
                    </label>
                    <Input
                      id="new-location-address"
                      placeholder="Optional street or office address"
                      value={newAddress}
                      onChange={(e) => setNewAddress(e.target.value)}
                      disabled={isBusy}
                      maxLength={500}
                    />
                  </div>
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
          ) : null}

          <div className="rounded-xl border bg-background/80 p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Configured Locations
                </h3>
                <p className="text-sm text-muted-foreground">
                  Review each branch, its invoice identity, and linked Shopify store details.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {locations.length === 0 ? "No saved locations yet" : `${locations.length} locations saved`}
              </p>
            </div>

            <ul className="space-y-3">
            {locations.map((location) => (
              <li
                key={location.id}
                className="flex flex-col gap-4 rounded-xl border bg-background/80 p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                    {location.logoUrl ? (
                      <CloudinaryLogo
                        src={location.logoUrl}
                        alt=""
                        width={40}
                        height={40}
                        className="size-full object-contain"
                      />
                    ) : (
                      <Building2 className="size-5 text-muted-foreground" aria-hidden />
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium">{location.name}</p>
                    {location.shortName ? (
                      <p className="text-xs text-muted-foreground">
                        <span className="rounded-full bg-muted px-2 py-0.5">
                          SMS: {location.shortName}
                        </span>
                      </p>
                    ) : null}
                    {location.address ? (
                      <p className="flex items-start gap-1 text-sm text-muted-foreground">
                        <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span>{location.address}</span>
                      </p>
                    ) : null}
                    {location.shopifyLocationId ||
                    location.shopifyShopName ||
                    location.shopifyAdminStoreHandle ? (
                      <p className="flex items-start gap-1 text-xs text-muted-foreground">
                        <Link2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span>
                          Shopify:{" "}
                          {location.shopifyAdminStoreHandle ?? location.shopifyShopName ?? "-"} (
                          {location.shopifyLocationId ?? "-"})
                        </span>
                      </p>
                    ) : null}
                  </div>
                </div>

                {canEdit ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditSheet(location)}
                      disabled={isBusy}
                    >
                      <Pencil className="size-4" aria-hidden />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(location.id, location.name)}
                      disabled={isBusy}
                    >
                      {busyKey === `delete-${location.id}` ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="size-4" aria-hidden />
                      )}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
            </ul>

            {locations.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-8 text-center">
                <p className="text-sm font-medium">No locations added yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add your first branch to configure invoicing, Shopify links, and merchant assignment.
                </p>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{sheetMode === "add" ? "Add Location" : "Edit Location"}</SheetTitle>
            <SheetDescription>
              {sheetMode === "add"
                ? "Add a new company location with Shopify and invoice details."
                : "Update location details including invoice and Shopify settings."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-6 py-4">
            {sheetMode === "edit" && editingLocation ? (
              <div className="rounded-xl border bg-muted/20 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Editing location
                </p>
                <p className="mt-1 text-sm font-medium">{editingLocation.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Update branch identity, invoice presentation, Shopify link, and order assignment.
                </p>
              </div>
            ) : null}

            {canEdit && editingId ? (
              <LogoUpload
                value={form.logoUrl ?? null}
                onChange={handleLocationLogoChange}
                uploadType="location"
                locationId={editingId}
                disabled={isBusy}
                label="Location logo"
              />
            ) : null}
            {canEdit && sheetMode === "add" ? (
              <p className="text-sm text-muted-foreground">
                Add a logo after creating the location.
              </p>
            ) : null}
            {!canEdit && form.logoUrl ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Location logo</label>
                <div className="flex size-20 overflow-hidden rounded-lg border bg-muted">
                  <CloudinaryLogo
                    src={form.logoUrl}
                    alt="Location logo"
                    width={80}
                    height={80}
                    className="size-full object-contain"
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-4 rounded-xl border bg-background/70 p-4">
              <div>
                <h4 className="text-sm font-semibold">Basic Details</h4>
                <p className="text-xs text-muted-foreground">
                  Set the name customers and staff will recognize for this branch.
                </p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="location-name" className="text-sm font-medium">
                  Location name
                </label>
                <Input
                  id="location-name"
                  placeholder="Location name"
                  value={form.name ?? ""}
                  onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                  disabled={isBusy}
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="location-address" className="text-sm font-medium">
                  Address
                </label>
                <Input
                  id="location-address"
                  placeholder="Street, floor, or branch address"
                  value={form.address ?? ""}
                  onChange={(e) => setForm((current) => ({ ...current, address: e.target.value }))}
                  disabled={isBusy}
                  maxLength={500}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="location-short-name" className="text-sm font-medium">
                  Short name for SMS
                </label>
                <Input
                  id="location-short-name"
                  placeholder="Short name used in SMS messages"
                  value={form.shortName ?? ""}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, shortName: e.target.value }))
                  }
                  disabled={isBusy}
                  maxLength={50}
                />
              </div>
            </div>

            <div className="space-y-4 rounded-xl border bg-background/70 p-4">
              <div>
                <h4 className="text-sm font-semibold">Invoice Details</h4>
                <p className="text-xs text-muted-foreground">
                  These details appear on printed invoices for this branch.
                </p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="location-invoice-header" className="text-sm font-medium">
                  Invoice header
                </label>
                <Input
                  id="location-invoice-header"
                  placeholder="Main heading printed on invoices"
                  value={form.invoiceHeader ?? ""}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, invoiceHeader: e.target.value }))
                  }
                  disabled={isBusy}
                  maxLength={500}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="location-invoice-sub-header" className="text-sm font-medium">
                  Invoice sub header
                </label>
                <Input
                  id="location-invoice-sub-header"
                  placeholder="Supporting line under invoice header"
                  value={form.invoiceSubHeader ?? ""}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, invoiceSubHeader: e.target.value }))
                  }
                  disabled={isBusy}
                  maxLength={500}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="location-invoice-footer" className="text-sm font-medium">
                  Invoice footer
                </label>
                <Input
                  id="location-invoice-footer"
                  placeholder="Footer text shown at the bottom of invoices"
                  value={form.invoiceFooter ?? ""}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, invoiceFooter: e.target.value }))
                  }
                  disabled={isBusy}
                  maxLength={500}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="location-invoice-phone" className="text-sm font-medium">
                    Invoice phone
                  </label>
                  <Input
                    id="location-invoice-phone"
                    placeholder="Phone number shown on invoice"
                    value={form.invoicePhone ?? ""}
                    onChange={(e) =>
                      setForm((current) => ({ ...current, invoicePhone: e.target.value }))
                    }
                    disabled={isBusy}
                    maxLength={100}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="location-invoice-email" className="text-sm font-medium">
                    Invoice email
                  </label>
                  <Input
                    id="location-invoice-email"
                    placeholder="Email shown on invoice"
                    type="email"
                    value={form.invoiceEmail ?? ""}
                    onChange={(e) =>
                      setForm((current) => ({ ...current, invoiceEmail: e.target.value }))
                    }
                    disabled={isBusy}
                    maxLength={254}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border bg-background/70 p-4">
              <div>
                <h4 className="text-sm font-semibold">Shopify Link Details</h4>
                <p className="text-xs text-muted-foreground">
                  Connect this location to the correct Shopify store and location ID.
                </p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="location-shopify-id" className="text-sm font-medium">
                  Shopify location ID
                </label>
                <Input
                  id="location-shopify-id"
                  placeholder="Numeric location ID from Shopify"
                  value={form.shopifyLocationId ?? ""}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, shopifyLocationId: e.target.value }))
                  }
                  disabled={isBusy}
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="location-shopify-shop-name" className="text-sm font-medium">
                  Shop domain
                </label>
                <Input
                  id="location-shopify-shop-name"
                  placeholder="example-store.myshopify.com"
                  value={form.shopifyShopName ?? ""}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, shopifyShopName: e.target.value }))
                  }
                  disabled={isBusy}
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="location-shopify-handle" className="text-sm font-medium">
                  Admin store handle
                </label>
                <Input
                  id="location-shopify-handle"
                  placeholder="e.g. u71ajc-11"
                  value={form.shopifyAdminStoreHandle ?? ""}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      shopifyAdminStoreHandle: e.target.value,
                    }))
                  }
                  disabled={isBusy}
                  maxLength={100}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Use the store handle from your Shopify admin URL. Example:
                ` admin.shopify.com/store/u71ajc-11/orders `
              </p>
            </div>

            {merchants.length > 0 ? (
              <div className="space-y-4 rounded-xl border bg-background/70 p-4">
                <div>
                  <h4 className="text-sm font-semibold">Order Assignment</h4>
                  <p className="text-xs text-muted-foreground">
                    Choose who receives unmatched web orders for this location.
                  </p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="location-defaultMerchant" className="text-sm">
                    Default merchant (web orders)
                  </label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        id="location-defaultMerchant"
                        type="button"
                        disabled={isBusy}
                        className="border-input bg-background hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-ring/50 flex h-10 w-full items-center justify-between rounded-lg border px-3 text-sm outline-none transition-colors focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30"
                      >
                        <span>
                          {(() => {
                            const selectedMerchant = merchants.find(
                              (merchant) => merchant.id === form.defaultMerchantUserId,
                            );
                            return (
                              selectedMerchant?.name ||
                              selectedMerchant?.email ||
                              selectedMerchant?.id ||
                              "None"
                            );
                          })()}
                        </span>
                        <ChevronsUpDown className="text-muted-foreground size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-72 overflow-y-auto"
                    >
                      <DropdownMenuItem
                        onSelect={() =>
                          setForm((current) => ({ ...current, defaultMerchantUserId: null }))
                        }
                        className="justify-between"
                      >
                        <span>None</span>
                        {!form.defaultMerchantUserId ? (
                          <Check className="size-4" aria-hidden />
                        ) : null}
                      </DropdownMenuItem>
                      {merchants.map((merchant) => {
                        const label = merchant.name || merchant.email || merchant.id;
                        const isSelected = form.defaultMerchantUserId === merchant.id;
                        return (
                          <DropdownMenuItem
                            key={merchant.id}
                            onSelect={() =>
                              setForm((current) => ({
                                ...current,
                                defaultMerchantUserId: merchant.id,
                              }))
                            }
                            className="justify-between"
                          >
                            <span>{label}</span>
                            {isSelected ? <Check className="size-4" aria-hidden /> : null}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <p className="text-xs text-muted-foreground">
                    Web orders without a coupon match will be assigned to this merchant.
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <SheetFooter className="sticky bottom-0 z-10 border-t bg-background/95 py-3 backdrop-blur">
            <Button variant="outline" onClick={closeSheet} disabled={isBusy}>
              Cancel
            </Button>
            <Button
              onClick={handleSheetSubmit}
              disabled={
                isBusy ||
                !form.name?.trim() ||
                (sheetMode === "edit" && !sheetHasChanges)
              }
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
