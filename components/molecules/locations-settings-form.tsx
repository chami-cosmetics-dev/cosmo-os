"use client";

import { useState, useEffect } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

type Location = {
  id: string;
  name: string;
  address: string | null;
};

interface LocationsSettingsFormProps {
  canEdit: boolean;
}

export function LocationsSettingsForm({ canEdit }: LocationsSettingsFormProps) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  async function fetchLocations() {
    const res = await fetch("/api/admin/company/locations");
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load locations");
      return;
    }
    const data = (await res.json()) as Location[];
    setLocations(data);
  }

  useEffect(() => {
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
  }, []);

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

  function startEdit(loc: Location) {
    setEditingId(loc.id);
    setEditName(loc.name);
    setEditAddress(loc.address ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditAddress("");
  }

  async function handleUpdate(id: string) {
    if (!canEdit) return;

    setBusyKey(`update-${id}`);
    try {
      const res = await fetch(`/api/admin/company/locations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          address: editAddress.trim() || undefined,
        }),
      });

      const data = (await res.json()) as Location & { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to update location");
        return;
      }

      setLocations((prev) =>
        prev.map((l) => (l.id === id ? data : l)).sort((a, b) => a.name.localeCompare(b.name))
      );
      cancelEdit();
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

      setLocations((prev) => prev.filter((l) => l.id !== id));
      if (editingId === id) cancelEdit();
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
    <Card>
      <CardHeader>
        <CardTitle>Company Locations</CardTitle>
        <p className="text-muted-foreground text-sm">
          Manage office branches and locations.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit && (
          <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row sm:items-end">
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
          </form>
        )}

        <ul className="space-y-2">
          {locations.map((loc) => (
            <li
              key={loc.id}
              className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              {editingId === loc.id ? (
                <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    disabled={isBusy}
                    maxLength={200}
                  />
                  <Input
                    placeholder="Address"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    disabled={isBusy}
                    maxLength={500}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleUpdate(loc.id)}
                      disabled={isBusy || !editName.trim()}
                    >
                      {busyKey === `update-${loc.id}` ? (
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
                    <p className="font-medium">{loc.name}</p>
                    {loc.address && (
                      <p className="text-muted-foreground text-sm">{loc.address}</p>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEdit(loc)}
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
                </>
              )}
            </li>
          ))}
        </ul>

        {locations.length === 0 && (
          <p className="text-muted-foreground text-sm">No locations added yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
