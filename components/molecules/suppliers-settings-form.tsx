"use client";

import { useState, useEffect } from "react";
import { Building2, Hash, Loader2, Mail, MapPin, Pencil, Phone, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";

type Supplier = {
  id: string;
  name: string;
  code: string;
  contactNumber: string | null;
  email: string | null;
  address: string | null;
};

const emptyForm = (): Partial<Supplier> => ({
  name: "",
  code: "",
  contactNumber: "",
  email: "",
  address: "",
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(value: string): boolean {
  if (!value || !value.trim()) return true; // empty is valid (optional field)
  return EMAIL_REGEX.test(value.trim());
}

interface SuppliersSettingsFormProps {
  canEdit: boolean;
  initialSuppliers?: Supplier[];
}

export function SuppliersSettingsForm({ canEdit }: SuppliersSettingsFormProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [quickName, setQuickName] = useState("");
  const [quickCode, setQuickCode] = useState("");
  const [form, setForm] = useState<Partial<Supplier>>(emptyForm());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  async function fetchSuppliers() {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    const res = await fetch(`/api/admin/company/suppliers?${params}`);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load suppliers");
      return;
    }
    const data = (await res.json()) as { items: Supplier[]; total: number; page: number; limit: number };
    setSuppliers(data.items);
    setTotal(data.total);
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        await fetchSuppliers();
      } catch {
        notify.error("Failed to load suppliers");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [page, limit]);

  function openAddSheet() {
    setSheetMode("add");
    setEditingId(null);
    setForm(emptyForm());
    setEmailError(null);
    setSheetOpen(true);
  }

  function openEditSheet(s: Supplier) {
    setSheetMode("edit");
    setEditingId(s.id);
    setForm({
      name: s.name,
      code: s.code,
      contactNumber: s.contactNumber ?? "",
      email: s.email ?? "",
      address: s.address ?? "",
    });
    setEmailError(null);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    setEmailError(null);
  }

  const editingSupplier = editingId ? suppliers.find((s) => s.id === editingId) : null;
  const sheetHasChanges =
    sheetMode === "add"
      ? (form.name?.trim() ?? "") !== "" && (form.code?.trim() ?? "") !== ""
      : editingSupplier
        ? (form.name?.trim() ?? "") !== (editingSupplier.name ?? "").trim() ||
          (form.code?.trim() ?? "") !== (editingSupplier.code ?? "").trim() ||
          (form.contactNumber ?? "") !== (editingSupplier.contactNumber ?? "") ||
          (form.email ?? "") !== (editingSupplier.email ?? "") ||
          (form.address ?? "") !== (editingSupplier.address ?? "")
        : false;

  async function handleSheetSubmit() {
    if (!form.name?.trim()) {
      notify.error("Supplier name is required");
      return;
    }
    if (!form.code?.trim()) {
      notify.error("Supplier code is required");
      return;
    }
    if (form.email?.trim() && !isValidEmail(form.email)) {
      const msg = "Please enter a valid email address";
      setEmailError(msg);
      notify.error(msg);
      return;
    }
    setEmailError(null);

    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      contactNumber: form.contactNumber?.trim() || null,
      email: form.email?.trim() || null,
      address: form.address?.trim() || null,
    };

    if (sheetMode === "add") {
      setBusyKey("add");
      try {
        const res = await fetch("/api/admin/company/suppliers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as Supplier & { error?: string };
        if (!res.ok) {
          notify.error(data.error ?? "Failed to add supplier");
          return;
        }
        await fetchSuppliers();
        closeSheet();
        notify.success("Supplier added.");
      } catch {
        notify.error("Failed to add supplier");
      } finally {
        setBusyKey(null);
      }
    } else if (editingId) {
      setBusyKey(`update-${editingId}`);
      try {
        const res = await fetch(`/api/admin/company/suppliers/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as Supplier & { error?: string };
        if (!res.ok) {
          notify.error(data.error ?? "Failed to update supplier");
          return;
        }
        await fetchSuppliers();
        closeSheet();
        notify.success("Supplier updated.");
      } catch {
        notify.error("Failed to update supplier");
      } finally {
        setBusyKey(null);
      }
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!canEdit) return;
    if (!window.confirm(`Delete supplier "${name}"?`)) return;

    setBusyKey(`delete-${id}`);
    try {
      const res = await fetch(`/api/admin/company/suppliers/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        notify.error(data.error ?? "Failed to delete supplier");
        return;
      }

      await fetchSuppliers();
      if (editingId === id) closeSheet();
      notify.success("Supplier deleted.");
    } catch {
      notify.error("Failed to delete supplier");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !quickName.trim() || !quickCode.trim()) return;

    setBusyKey("add");
    try {
      const res = await fetch("/api/admin/company/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: quickName.trim(),
          code: quickCode.trim(),
          contactNumber: null,
          email: null,
          address: null,
        }),
      });

      const data = (await res.json()) as Supplier & { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to add supplier");
        return;
      }

      await fetchSuppliers();
      setQuickName("");
      setQuickCode("");
      notify.success("Supplier added.");
    } catch {
      notify.error("Failed to add supplier");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Suppliers</CardTitle>
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
          <CardTitle>Suppliers</CardTitle>
          <CardDescription>
            Manage suppliers with name, code, contact details, and address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canEdit && (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Quick Add Supplier</p>
                  <p className="text-muted-foreground text-xs">
                    Add using name and code, or open full form for contact details.
                  </p>
                </div>
                <Button onClick={openAddSheet} variant="outline" disabled={isBusy}>
                  <Plus className="mr-2 size-4" aria-hidden />
                  Full form
                </Button>
              </div>
              <form onSubmit={handleQuickAdd} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Supplier name</label>
                  <Input
                    placeholder="Supplier name"
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    disabled={isBusy}
                    maxLength={200}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Supplier code</label>
                  <Input
                    placeholder="Supplier code"
                    value={quickCode}
                    onChange={(e) => setQuickCode(e.target.value)}
                    disabled={isBusy}
                    maxLength={100}
                  />
                </div>
                <div>
                  <Button type="submit" className="w-full md:w-auto" disabled={isBusy || !quickName.trim() || !quickCode.trim()}>
                    {busyKey === "add" ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Adding...
                      </>
                    ) : (
                      "Add supplier"
                    )}
                  </Button>
                </div>
              </form>
            </div>
          )}

          <ul className="space-y-2">
            {suppliers.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <p className="flex items-center gap-2 font-medium">
                    <Building2 className="size-4 text-muted-foreground" aria-hidden />
                    {s.name}
                  </p>
                  <p className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Hash className="size-3.5" aria-hidden />
                    Code: {s.code}
                  </p>
                  {s.contactNumber && (
                    <p className="text-muted-foreground flex items-center gap-2 text-sm">
                      <Phone className="size-3.5" aria-hidden />
                      {s.contactNumber}
                    </p>
                  )}
                  {s.email && (
                    <p className="text-muted-foreground flex items-center gap-2 text-sm">
                      <Mail className="size-3.5" aria-hidden />
                      {s.email}
                    </p>
                  )}
                  {s.address && (
                    <p className="text-muted-foreground flex items-center gap-2 text-sm">
                      <MapPin className="size-3.5" aria-hidden />
                      {s.address}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditSheet(s)}
                      disabled={isBusy}
                    >
                      <Pencil className="size-4" aria-hidden />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(s.id, s.name)}
                      disabled={isBusy}
                    >
                      {busyKey === `delete-${s.id}` ? (
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

          {suppliers.length === 0 && !loading && (
            <p className="text-muted-foreground text-sm">No suppliers added yet.</p>
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

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) closeSheet();
          else setSheetOpen(true);
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col overflow-y-auto sm:max-w-lg"
        >
          <SheetHeader>
            <SheetTitle>
              {sheetMode === "add" ? "Add Supplier" : "Edit Supplier"}
            </SheetTitle>
            <SheetDescription>
              {sheetMode === "add"
                ? "Add a new supplier with contact details and address."
                : "Update supplier details."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-6 py-4">
            <div className="space-y-3 rounded-lg border bg-muted/10 p-4">
              <h4 className="text-sm font-semibold">Basic Details</h4>
              <Input
                placeholder="Supplier Name *"
                value={form.name ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                disabled={isBusy}
                maxLength={200}
              />
              <Input
                placeholder="Supplier Code *"
                value={form.code ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                disabled={isBusy}
                maxLength={100}
              />
            </div>
            <div className="space-y-3 rounded-lg border bg-muted/10 p-4">
              <h4 className="text-sm font-semibold">Contact Details</h4>
              <Input
                placeholder="Supplier Contact Number"
                value={form.contactNumber ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, contactNumber: e.target.value }))
                }
                disabled={isBusy}
                maxLength={100}
              />
              <div className="space-y-1">
                <Input
                  placeholder="Supplier Email"
                  type="email"
                  value={form.email ?? ""}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, email: e.target.value }));
                    setEmailError(null);
                  }}
                  onBlur={() => {
                    if (form.email?.trim() && !isValidEmail(form.email ?? "")) {
                      setEmailError("Please enter a valid email address");
                    } else {
                      setEmailError(null);
                    }
                  }}
                  disabled={isBusy}
                  maxLength={254}
                  aria-invalid={!!emailError}
                />
                {emailError && (
                  <p className="text-destructive text-sm">{emailError}</p>
                )}
              </div>
            </div>
            <div className="space-y-3 rounded-lg border bg-muted/10 p-4">
              <h4 className="text-sm font-semibold">Address</h4>
              <Textarea
                placeholder="Supplier Address"
                value={form.address ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address: e.target.value }))
                }
                disabled={isBusy}
                maxLength={500}
                rows={3}
              />
            </div>
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={closeSheet} disabled={isBusy}>
              Cancel
            </Button>
            <Button
              onClick={handleSheetSubmit}
              disabled={
                isBusy ||
                !form.name?.trim() ||
                !form.code?.trim() ||
                (sheetMode === "edit" && !sheetHasChanges)
              }
            >
              {busyKey?.startsWith("add")
                ? "Adding..."
                : busyKey?.startsWith("update")
                  ? "Saving..."
                  : sheetMode === "add"
                    ? "Add Supplier"
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
