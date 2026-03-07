"use client";

import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Gift, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

type SampleFreeIssueItem = {
  id: string;
  name: string;
  productItemId: string | null;
  type: "sample" | "free_issue";
  productItem?: { productTitle: string; variantTitle: string | null } | null;
  createdAt: string;
};

interface SamplesFreeIssuesSettingsFormProps {
  canEdit: boolean;
}

const TYPE_OPTIONS: Array<{ value: "sample" | "free_issue"; label: string }> = [
  { value: "sample", label: "Sample" },
  { value: "free_issue", label: "Free Issue" },
];

export function SamplesFreeIssuesSettingsForm({
  canEdit,
}: SamplesFreeIssuesSettingsFormProps) {
  const [items, setItems] = useState<SampleFreeIssueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"sample" | "free_issue">("sample");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"sample" | "free_issue">("sample");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  async function fetchItems() {
    const res = await fetch("/api/admin/settings/samples-free-issues");
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load items");
      return;
    }
    const data = (await res.json()) as SampleFreeIssueItem[];
    setItems(data);
  }

  useEffect(() => {
    async function load() {
      try {
        await fetchItems();
      } catch {
        notify.error("Failed to load items");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !newName.trim()) return;

    setBusyKey("add");
    try {
      const res = await fetch("/api/admin/settings/samples-free-issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), type: newType }),
      });

      const data = (await res.json()) as SampleFreeIssueItem & { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to add item");
        return;
      }

      setItems((prev) =>
        [...prev, data].sort((a, b) =>
          a.type === b.type ? a.name.localeCompare(b.name) : a.type.localeCompare(b.type)
        )
      );
      setNewName("");
      notify.success("Item added.");
    } catch {
      notify.error("Failed to add item");
    } finally {
      setBusyKey(null);
    }
  }

  function startEdit(item: SampleFreeIssueItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditType(item.type);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function handleUpdate(id: string) {
    if (!canEdit) return;

    setBusyKey(`update-${id}`);
    try {
      const res = await fetch(`/api/admin/settings/samples-free-issues/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), type: editType }),
      });

      const data = (await res.json()) as SampleFreeIssueItem & { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to update item");
        return;
      }

      setItems((prev) =>
        prev.map((i) => (i.id === id ? data : i)).sort((a, b) =>
          a.type === b.type ? a.name.localeCompare(b.name) : a.type.localeCompare(b.type)
        )
      );
      cancelEdit();
      notify.success("Item updated.");
    } catch {
      notify.error("Failed to update item");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!canEdit) return;
    if (!window.confirm(`Delete "${name}"?`)) return;

    setBusyKey(`delete-${id}`);
    try {
      const res = await fetch(`/api/admin/settings/samples-free-issues/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        notify.error(data.error ?? "Failed to delete item");
        return;
      }

      setItems((prev) => prev.filter((i) => i.id !== id));
      if (editingId === id) cancelEdit();
      notify.success("Item deleted.");
    } catch {
      notify.error("Failed to delete item");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <Card className="border-border/70 bg-card/95 shadow-sm">
        <CardHeader>
          <CardTitle>Samples & Free Issue Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading samples and free issue settings...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
          <Gift className="size-3.5" aria-hidden />
          Order Extras
        </div>
        <div>
          <CardTitle>Samples & Free Issue Items</CardTitle>
          <p className="text-muted-foreground text-sm">
            Manage the extra items your team can attach to orders as samples or free issues.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border bg-background/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Available Extras
          </p>
          <p className="mt-2 text-2xl font-semibold">{items.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            These items appear during the fulfillment workflow.
          </p>
        </div>

        {canEdit && (
          <div className="rounded-xl border bg-background/80 p-4 sm:p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Add Extra Item
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Define which sample or free issue options staff can add during fulfillment.
              </p>
            </div>
            <form onSubmit={handleAdd} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="w-full max-w-md space-y-1.5">
                <label htmlFor="sample-item-name" className="text-sm font-medium">
                  Item name
                </label>
                <Input
                  id="sample-item-name"
                  placeholder="Enter item name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={isBusy}
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="sample-item-type" className="text-sm font-medium">
                  Item type
                </label>
                <TypeMenuSelect
                  id="sample-item-type"
                  value={newType}
                  onChange={setNewType}
                  disabled={isBusy}
                  className="w-[180px]"
                />
              </div>
              <Button type="submit" disabled={isBusy || !newName.trim()}>
                {busyKey === "add" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="size-4" aria-hidden />
                    Add Item
                  </>
                )}
              </Button>
            </form>
          </div>
        )}

        <div className="rounded-xl border bg-background/80 p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Item List
              </h3>
              <p className="text-sm text-muted-foreground">
                Review which extra items can be attached to eligible orders.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {items.length === 0 ? "No items saved" : `${items.length} items saved`}
            </p>
          </div>

          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 rounded-xl border bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                {editingId === item.id ? (
                  <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      disabled={isBusy}
                      maxLength={200}
                      className="w-full max-w-md"
                    />
                    <TypeMenuSelect
                      value={editType}
                      onChange={setEditType}
                      disabled={isBusy}
                      className="w-[180px]"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleUpdate(item.id)}
                        disabled={isBusy || !editName.trim() || (editName.trim() === item.name && editType === item.type)}
                      >
                        {busyKey === `update-${item.id}` ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          "Save"
                        )}
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit} disabled={isBusy}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="mt-1 text-xs capitalize text-muted-foreground">
                        {item.type.replace("_", " ")}
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(item)}
                          disabled={isBusy}
                        >
                          <Pencil className="size-4" aria-hidden />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(item.id, item.name)}
                          disabled={isBusy}
                        >
                          {busyKey === `delete-${item.id}` ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="size-4" aria-hidden />
                          )}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>

        {items.length === 0 && (
          <div className="rounded-xl border border-dashed px-4 py-8 text-center">
            <p className="text-sm font-medium">No extra items added yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a sample or free issue item so your fulfillment team can attach it to orders.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TypeMenuSelect({
  id,
  value,
  onChange,
  disabled,
  className,
}: {
  id?: string;
  value: "sample" | "free_issue";
  onChange: (value: "sample" | "free_issue") => void;
  disabled?: boolean;
  className?: string;
}) {
  const selectedLabel = TYPE_OPTIONS.find((option) => option.value === value)?.label ?? "Sample";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={`border-input bg-background/90 hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-ring/50 flex h-11 items-center justify-between rounded-xl border border-border/70 px-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 dark:bg-input/40 ${className ?? ""}`}
        >
          <span>{selectedLabel}</span>
          <ChevronsUpDown className="text-muted-foreground size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)]"
      >
        {TYPE_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => onChange(option.value)}
            className="justify-between"
          >
            <span>{option.label}</span>
            {value === option.value ? <Check className="size-4" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
