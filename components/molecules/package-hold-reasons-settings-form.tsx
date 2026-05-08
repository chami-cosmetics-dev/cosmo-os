"use client";

import { useState, useEffect } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

type PackageHoldReason = {
  id: string;
  name: string;
  createdAt: string;
};

interface PackageHoldReasonsSettingsFormProps {
  canEdit: boolean;
}

export function PackageHoldReasonsSettingsForm({
  canEdit,
}: PackageHoldReasonsSettingsFormProps) {
  const [reasons, setReasons] = useState<PackageHoldReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  async function fetchReasons() {
    const res = await fetch("/api/admin/settings/package-hold-reasons");
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load reasons");
      return;
    }
    const data = (await res.json()) as PackageHoldReason[];
    setReasons(data);
  }

  useEffect(() => {
    async function load() {
      try {
        await fetchReasons();
      } catch {
        notify.error("Failed to load reasons");
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
      const res = await fetch("/api/admin/settings/package-hold-reasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });

      const data = (await res.json()) as PackageHoldReason & { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to add reason");
        return;
      }

      setReasons((prev) =>
        [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
      );
      setNewName("");
      notify.success("Reason added.");
    } catch {
      notify.error("Failed to add reason");
    } finally {
      setBusyKey(null);
    }
  }

  function startEdit(r: PackageHoldReason) {
    setEditingId(r.id);
    setEditName(r.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function handleUpdate(id: string) {
    if (!canEdit) return;

    setBusyKey(`update-${id}`);
    try {
      const res = await fetch(`/api/admin/settings/package-hold-reasons/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });

      const data = (await res.json()) as PackageHoldReason & { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to update reason");
        return;
      }

      setReasons((prev) =>
        prev.map((r) => (r.id === id ? data : r)).sort((a, b) => a.name.localeCompare(b.name))
      );
      cancelEdit();
      notify.success("Reason updated.");
    } catch {
      notify.error("Failed to update reason");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!canEdit) return;
    if (!window.confirm(`Delete "${name}"?`)) return;

    setBusyKey(`delete-${id}`);
    try {
      const res = await fetch(`/api/admin/settings/package-hold-reasons/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        notify.error(data.error ?? "Failed to delete reason");
        return;
      }

      setReasons((prev) => prev.filter((r) => r.id !== id));
      if (editingId === id) cancelEdit();
      notify.success("Reason deleted.");
    } catch {
      notify.error("Failed to delete reason");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Package Hold Reasons</CardTitle>
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
        <CardTitle>Package Hold Reasons</CardTitle>
        <p className="text-muted-foreground text-sm">
          Reasons for putting packages on hold (e.g. stock unavailability).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit && (
          <form onSubmit={handleAdd} className="flex gap-2">
            <Input
              placeholder="Reason name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={isBusy}
              maxLength={200}
              className="max-w-xs"
            />
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
          {reasons.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              {editingId === r.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    disabled={isBusy}
                    maxLength={200}
                    className="max-w-xs"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleUpdate(r.id)}
                    disabled={isBusy || !editName.trim() || editName.trim() === r.name}
                  >
                    {busyKey === `update-${r.id}` ? (
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
                  <p className="font-medium">{r.name}</p>
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEdit(r)}
                        disabled={isBusy}
                      >
                        <Pencil className="size-4" aria-hidden />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(r.id, r.name)}
                        disabled={isBusy}
                      >
                        {busyKey === `delete-${r.id}` ? (
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

        {reasons.length === 0 && (
          <p className="text-muted-foreground text-sm">No reasons added yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
