"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirmationDialog } from "@/components/providers/confirmation-dialog-provider";
import { notify } from "@/lib/notify";

type CitypakAccount = {
  id: string;
  label: string;
  accountId: string;
  invoicePrefix: string;
  hasApiToken: boolean;
  apiTokenMasked: string;
  createdAt: string;
};

interface CitypakAccountsSettingsFormProps {
  canEdit: boolean;
}

const EMPTY_FORM = { label: "", accountId: "", invoicePrefix: "", apiToken: "" };

export function CitypakAccountsSettingsForm({ canEdit }: CitypakAccountsSettingsFormProps) {
  const { confirm } = useConfirmationDialog();
  const [items, setItems] = useState<CitypakAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [newForm, setNewForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  async function fetchItems() {
    const res = await fetch("/api/admin/settings/citypak-accounts");
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load CityPak accounts");
      return;
    }
    const data = (await res.json()) as CitypakAccount[];
    setItems(data);
  }

  useEffect(() => {
    async function load() {
      try {
        await fetchItems();
      } catch {
        notify.error("Failed to load CityPak accounts");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (
      !canEdit ||
      !newForm.label.trim() ||
      !newForm.accountId.trim() ||
      !newForm.invoicePrefix.trim() ||
      !newForm.apiToken.trim()
    ) {
      return;
    }

    setBusyKey("add");
    try {
      const res = await fetch("/api/admin/settings/citypak-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newForm.label.trim(),
          accountId: newForm.accountId.trim(),
          invoicePrefix: newForm.invoicePrefix.trim(),
          apiToken: newForm.apiToken.trim(),
        }),
      });
      const data = (await res.json()) as CitypakAccount & { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to add CityPak account");
        return;
      }
      setItems((prev) => [...prev, data].sort((a, b) => a.invoicePrefix.localeCompare(b.invoicePrefix)));
      setNewForm(EMPTY_FORM);
      notify.success("CityPak account added.");
    } catch {
      notify.error("Failed to add CityPak account");
    } finally {
      setBusyKey(null);
    }
  }

  function startEdit(item: CitypakAccount) {
    setEditingId(item.id);
    setEditForm({
      label: item.label,
      accountId: item.accountId,
      invoicePrefix: item.invoicePrefix,
      apiToken: "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  }

  async function handleUpdate(id: string) {
    if (!canEdit || !editForm.label.trim() || !editForm.accountId.trim() || !editForm.invoicePrefix.trim()) {
      return;
    }

    setBusyKey(`update-${id}`);
    try {
      const res = await fetch(`/api/admin/settings/citypak-accounts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: editForm.label.trim(),
          accountId: editForm.accountId.trim(),
          invoicePrefix: editForm.invoicePrefix.trim(),
          apiToken: editForm.apiToken.trim(),
        }),
      });
      const data = (await res.json()) as CitypakAccount & { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to update CityPak account");
        return;
      }
      setItems((prev) =>
        prev
          .map((item) => (item.id === id ? data : item))
          .sort((a, b) => a.invoicePrefix.localeCompare(b.invoicePrefix))
      );
      cancelEdit();
      notify.success("CityPak account updated.");
    } catch {
      notify.error("Failed to update CityPak account");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!canEdit) return;
    const ok = await confirm({
      title: "Delete CityPak account?",
      description: `Remove ${label}? City Pack dispatch for this invoice prefix will fail until you add it again.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    setBusyKey(`delete-${id}`);
    try {
      const res = await fetch(`/api/admin/settings/citypak-accounts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        notify.error(data.error ?? "Failed to delete CityPak account");
        return;
      }
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (editingId === id) cancelEdit();
      notify.success("CityPak account deleted.");
    } catch {
      notify.error("Failed to delete CityPak account");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent))]">
          <CardTitle>CityPak API</CardTitle>
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
      <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent))]">
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" aria-hidden />
          CityPak API
        </CardTitle>
        <p className="text-muted-foreground text-sm font-normal">
          One token per brand. Invoice prefix is the order series (100, 110, 600, SV200). City Pack
          dispatch creates the waybill with this token.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {canEdit && (
          <form
            onSubmit={handleAdd}
            className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))] p-4 shadow-xs space-y-3"
          >
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Add account
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label htmlFor="cp-label" className="text-xs font-medium text-muted-foreground">
                  Company
                </label>
                <Input
                  id="cp-label"
                  placeholder="e.g. Cosmetics.lk Pvt Ltd"
                  value={newForm.label}
                  onChange={(e) => setNewForm((f) => ({ ...f, label: e.target.value }))}
                  disabled={isBusy}
                  maxLength={100}
                  className="border-border/70 bg-background/90"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="cp-account" className="text-xs font-medium text-muted-foreground">
                  CityPak account ID
                </label>
                <Input
                  id="cp-account"
                  placeholder="e.g. 5218"
                  value={newForm.accountId}
                  onChange={(e) => setNewForm((f) => ({ ...f, accountId: e.target.value }))}
                  disabled={isBusy}
                  maxLength={32}
                  className="border-border/70 bg-background/90"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="cp-prefix" className="text-xs font-medium text-muted-foreground">
                  Invoice prefix
                </label>
                <Input
                  id="cp-prefix"
                  placeholder="e.g. 600 or SV200"
                  value={newForm.invoicePrefix}
                  onChange={(e) => setNewForm((f) => ({ ...f, invoicePrefix: e.target.value }))}
                  disabled={isBusy}
                  maxLength={20}
                  className="border-border/70 bg-background/90"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="cp-token" className="text-xs font-medium text-muted-foreground">
                  API token
                </label>
                <Input
                  id="cp-token"
                  type="password"
                  autoComplete="off"
                  placeholder="Live API token"
                  value={newForm.apiToken}
                  onChange={(e) => setNewForm((f) => ({ ...f, apiToken: e.target.value }))}
                  disabled={isBusy}
                  maxLength={200}
                  className="border-border/70 bg-background/90"
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={
                isBusy ||
                !newForm.label.trim() ||
                !newForm.accountId.trim() ||
                !newForm.invoicePrefix.trim() ||
                !newForm.apiToken.trim()
              }
              className="shadow-[0_10px_24px_-18px_var(--primary)]"
            >
              {busyKey === "add" ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="mr-2 size-4" aria-hidden />
                  Add account
                </>
              )}
            </Button>
          </form>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No CityPak accounts yet. Add the 12 company tokens before dispatching City Pack.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="hidden lg:grid lg:grid-cols-[1.4fr_0.8fr_0.8fr_1.2fr_auto] gap-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <span>Company</span>
              <span>Account ID</span>
              <span>Prefix</span>
              <span>Token</span>
              <span />
            </div>
            {items.map((item) => (
              <div key={item.id} className="rounded-xl border border-border/70 bg-background/80 p-3">
                {editingId === item.id ? (
                  <div className="grid gap-2 lg:grid-cols-4">
                    <Input
                      value={editForm.label}
                      onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                      disabled={isBusy}
                      maxLength={100}
                      placeholder="Company"
                      className="border-border/70 bg-background/90"
                    />
                    <Input
                      value={editForm.accountId}
                      onChange={(e) => setEditForm((f) => ({ ...f, accountId: e.target.value }))}
                      disabled={isBusy}
                      maxLength={32}
                      placeholder="Account ID"
                      className="border-border/70 bg-background/90"
                    />
                    <Input
                      value={editForm.invoicePrefix}
                      onChange={(e) => setEditForm((f) => ({ ...f, invoicePrefix: e.target.value }))}
                      disabled={isBusy}
                      maxLength={20}
                      placeholder="Prefix"
                      className="border-border/70 bg-background/90"
                    />
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        autoComplete="off"
                        value={editForm.apiToken}
                        onChange={(e) => setEditForm((f) => ({ ...f, apiToken: e.target.value }))}
                        disabled={isBusy}
                        maxLength={200}
                        placeholder="Leave blank to keep token"
                        className="border-border/70 bg-background/90"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleUpdate(item.id)}
                        disabled={
                          isBusy ||
                          !editForm.label.trim() ||
                          !editForm.accountId.trim() ||
                          !editForm.invoicePrefix.trim()
                        }
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
                    <div className="grid flex-1 gap-0.5 lg:grid-cols-4 text-sm">
                      <span className="font-medium">{item.label}</span>
                      <span className="font-mono text-muted-foreground">{item.accountId}</span>
                      <span className="font-mono text-muted-foreground">{item.invoicePrefix}</span>
                      <span className="font-mono text-muted-foreground">{item.apiTokenMasked}</span>
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
