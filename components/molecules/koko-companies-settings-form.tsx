"use client";

import { useState, useEffect } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirmationDialog } from "@/components/providers/confirmation-dialog-provider";
import { notify } from "@/lib/notify";

type KokoCompany = {
  id: string;
  label: string;
  kokoName: string;
  invoicePrefix: string;
  createdAt: string;
};

interface KokoCompaniesSettingsFormProps {
  canEdit: boolean;
}

const EMPTY_FORM = { label: "", kokoName: "", invoicePrefix: "" };

export function KokoCompaniesSettingsForm({
  canEdit,
}: KokoCompaniesSettingsFormProps) {
  const { confirm } = useConfirmationDialog();
  const [items, setItems] = useState<KokoCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [newForm, setNewForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  async function fetchItems() {
    const res = await fetch("/api/admin/settings/koko-companies");
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load Koko companies");
      return;
    }
    const data = (await res.json()) as KokoCompany[];
    setItems(data);
  }

  useEffect(() => {
    async function load() {
      try {
        await fetchItems();
      } catch {
        notify.error("Failed to load Koko companies");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !newForm.label.trim() || !newForm.kokoName.trim() || !newForm.invoicePrefix.trim()) return;

    setBusyKey("add");
    try {
      const res = await fetch("/api/admin/settings/koko-companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newForm.label.trim(),
          kokoName: newForm.kokoName.trim(),
          invoicePrefix: newForm.invoicePrefix.trim(),
        }),
      });

      const data = (await res.json()) as KokoCompany & { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to add company");
        return;
      }

      setItems((prev) => [...prev, data].sort((a, b) => a.label.localeCompare(b.label)));
      setNewForm(EMPTY_FORM);
      notify.success("Koko company added.");
    } catch {
      notify.error("Failed to add company");
    } finally {
      setBusyKey(null);
    }
  }

  function startEdit(item: KokoCompany) {
    setEditingId(item.id);
    setEditForm({ label: item.label, kokoName: item.kokoName, invoicePrefix: item.invoicePrefix });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  }

  async function handleUpdate(id: string) {
    if (!canEdit) return;

    setBusyKey(`update-${id}`);
    try {
      const res = await fetch(`/api/admin/settings/koko-companies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: editForm.label.trim(),
          kokoName: editForm.kokoName.trim(),
          invoicePrefix: editForm.invoicePrefix.trim(),
        }),
      });

      const data = (await res.json()) as KokoCompany & { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to update company");
        return;
      }

      setItems((prev) =>
        prev.map((item) => (item.id === id ? data : item)).sort((a, b) => a.label.localeCompare(b.label))
      );
      cancelEdit();
      notify.success("Koko company updated.");
    } catch {
      notify.error("Failed to update company");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!canEdit) return;
    const confirmed = await confirm({
      title: "Delete Koko company?",
      description: `Delete "${label}"? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!confirmed) return;

    setBusyKey(`delete-${id}`);
    try {
      const res = await fetch(`/api/admin/settings/koko-companies/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        notify.error(data.error ?? "Failed to delete company");
        return;
      }

      setItems((prev) => prev.filter((item) => item.id !== id));
      if (editingId === id) cancelEdit();
      notify.success("Koko company deleted.");
    } catch {
      notify.error("Failed to delete company");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent))]">
          <CardTitle>Koko Companies</CardTitle>
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
    <Card className="overflow-hidden border-border/70 shadow-xs">
      <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
        <CardTitle>Koko Companies</CardTitle>
        <p className="text-muted-foreground text-sm">
          Define companies used in the Koko Tally reconciliation tool. Each entry maps a display label to the Koko branch name and invoice number prefix.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {canEdit && (
          <form
            onSubmit={handleAdd}
            className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))] p-4 shadow-xs space-y-3"
          >
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add new company</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor="kc-label" className="text-xs font-medium text-muted-foreground">Display Label</label>
                <Input
                  id="kc-label"
                  placeholder="e.g. Cosmetics LK"
                  value={newForm.label}
                  onChange={(e) => setNewForm((f) => ({ ...f, label: e.target.value }))}
                  disabled={isBusy}
                  maxLength={100}
                  className="border-border/70 bg-background/90"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="kc-koko-name" className="text-xs font-medium text-muted-foreground">Koko Branch Name</label>
                <Input
                  id="kc-koko-name"
                  placeholder="e.g. Cosmetics LK"
                  value={newForm.kokoName}
                  onChange={(e) => setNewForm((f) => ({ ...f, kokoName: e.target.value }))}
                  disabled={isBusy}
                  maxLength={200}
                  className="border-border/70 bg-background/90"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="kc-prefix" className="text-xs font-medium text-muted-foreground">Invoice Prefix</label>
                <Input
                  id="kc-prefix"
                  placeholder="e.g. 600"
                  value={newForm.invoicePrefix}
                  onChange={(e) => setNewForm((f) => ({ ...f, invoicePrefix: e.target.value }))}
                  disabled={isBusy}
                  maxLength={50}
                  className="border-border/70 bg-background/90"
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={isBusy || !newForm.label.trim() || !newForm.kokoName.trim() || !newForm.invoicePrefix.trim()}
              className="shadow-[0_10px_24px_-18px_var(--primary)]"
            >
              {busyKey === "add" ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Adding…
                </>
              ) : (
                <>
                  <Plus className="mr-2 size-4" aria-hidden />
                  Add Company
                </>
              )}
            </Button>
          </form>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Koko companies configured yet.</p>
        ) : (
          <div className="space-y-2">
            {/* Header row */}
            <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <span>Label</span>
              <span>Koko Branch Name</span>
              <span>Invoice Prefix</span>
              <span />
            </div>
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-border/70 bg-background/80 p-3"
              >
                {editingId === item.id ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input
                      value={editForm.label}
                      onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                      disabled={isBusy}
                      maxLength={100}
                      placeholder="Display Label"
                      className="border-border/70 bg-background/90"
                    />
                    <Input
                      value={editForm.kokoName}
                      onChange={(e) => setEditForm((f) => ({ ...f, kokoName: e.target.value }))}
                      disabled={isBusy}
                      maxLength={200}
                      placeholder="Koko Branch Name"
                      className="border-border/70 bg-background/90"
                    />
                    <div className="flex gap-2">
                      <Input
                        value={editForm.invoicePrefix}
                        onChange={(e) => setEditForm((f) => ({ ...f, invoicePrefix: e.target.value }))}
                        disabled={isBusy}
                        maxLength={50}
                        placeholder="Invoice Prefix"
                        className="border-border/70 bg-background/90"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleUpdate(item.id)}
                        disabled={isBusy || !editForm.label.trim() || !editForm.kokoName.trim() || !editForm.invoicePrefix.trim()}
                      >
                        {busyKey === `update-${item.id}` ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          "Save"
                        )}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={isBusy}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="grid flex-1 gap-0.5 sm:grid-cols-3 text-sm">
                      <span className="font-medium">{item.label}</span>
                      <span className="text-muted-foreground">{item.kokoName}</span>
                      <span className="font-mono text-muted-foreground">{item.invoicePrefix}</span>
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          onClick={() => startEdit(item)}
                          disabled={isBusy}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(item.id, item.label)}
                          disabled={isBusy}
                        >
                          {busyKey === `delete-${item.id}` ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="size-3.5" aria-hidden />
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
