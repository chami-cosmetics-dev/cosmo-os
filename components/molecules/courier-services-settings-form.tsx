"use client";

import { useState, useEffect } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

type CourierService = {
  id: string;
  name: string;
  createdAt: string;
};

interface CourierServicesSettingsFormProps {
  canEdit: boolean;
}

export function CourierServicesSettingsForm({
  canEdit,
}: CourierServicesSettingsFormProps) {
  const [services, setServices] = useState<CourierService[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  async function fetchServices() {
    const res = await fetch("/api/admin/settings/courier-services");
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load services");
      return;
    }
    const data = (await res.json()) as CourierService[];
    setServices(data);
  }

  useEffect(() => {
    async function load() {
      try {
        await fetchServices();
      } catch {
        notify.error("Failed to load services");
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
      const res = await fetch("/api/admin/settings/courier-services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });

      const data = (await res.json()) as CourierService & { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to add service");
        return;
      }

      setServices((prev) =>
        [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
      );
      setNewName("");
      notify.success("Service added.");
    } catch {
      notify.error("Failed to add service");
    } finally {
      setBusyKey(null);
    }
  }

  function startEdit(s: CourierService) {
    setEditingId(s.id);
    setEditName(s.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function handleUpdate(id: string) {
    if (!canEdit) return;

    setBusyKey(`update-${id}`);
    try {
      const res = await fetch(`/api/admin/settings/courier-services/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });

      const data = (await res.json()) as CourierService & { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to update service");
        return;
      }

      setServices((prev) =>
        prev.map((s) => (s.id === id ? data : s)).sort((a, b) => a.name.localeCompare(b.name))
      );
      cancelEdit();
      notify.success("Service updated.");
    } catch {
      notify.error("Failed to update service");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!canEdit) return;
    if (!window.confirm(`Delete "${name}"?`)) return;

    setBusyKey(`delete-${id}`);
    try {
      const res = await fetch(`/api/admin/settings/courier-services/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        notify.error(data.error ?? "Failed to delete service");
        return;
      }

      setServices((prev) => prev.filter((s) => s.id !== id));
      if (editingId === id) cancelEdit();
      notify.success("Service deleted.");
    } catch {
      notify.error("Failed to delete service");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Courier Services</CardTitle>
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
        <CardTitle>Courier Services</CardTitle>
        <p className="text-muted-foreground text-sm">
          External courier services for order dispatch.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit && (
          <form onSubmit={handleAdd} className="flex gap-2">
            <Input
              placeholder="Service name"
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
          {services.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              {editingId === s.id ? (
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
                    onClick={() => handleUpdate(s.id)}
                    disabled={isBusy || !editName.trim() || editName.trim() === s.name}
                  >
                    {busyKey === `update-${s.id}` ? (
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
                  <p className="font-medium">{s.name}</p>
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEdit(s)}
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
                </>
              )}
            </li>
          ))}
        </ul>

        {services.length === 0 && (
          <p className="text-muted-foreground text-sm">No services added yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
