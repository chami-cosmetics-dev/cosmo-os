"use client";

import { useState, useEffect } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card>
        <CardHeader>
          <CardTitle>Samples & Free Issue Items</CardTitle>
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
    <Card>
      <CardHeader>
        <CardTitle>Samples & Free Issue Items</CardTitle>
        <p className="text-muted-foreground text-sm">
          Manage items that can be added to orders as samples or free issues.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit && (
          <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
            <Input
              placeholder="Item name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={isBusy}
              maxLength={200}
              className="max-w-xs"
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as "sample" | "free_issue")}
              disabled={isBusy}
              className="h-9 w-[140px] rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="sample">Sample</option>
              <option value="free_issue">Free Issue</option>
            </select>
            <Button type="submit" disabled={isBusy || !newName.trim()}>
              {busyKey === "add" ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="size-4" aria-hidden />
                  Add
                </>
              )}
            </Button>
          </form>
        )}

        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              {editingId === item.id ? (
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    disabled={isBusy}
                    maxLength={200}
                    className="max-w-xs"
                  />
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as "sample" | "free_issue")}
                    disabled={isBusy}
                    className="h-9 w-[140px] rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="sample">Sample</option>
                    <option value="free_issue">Free Issue</option>
                  </select>
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
              ) : (
                <>
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-muted-foreground text-xs capitalize">
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

        {items.length === 0 && (
          <p className="text-muted-foreground text-sm">No items added yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
