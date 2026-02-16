"use client";

import { useState, useEffect } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

type Department = {
  id: string;
  name: string;
};

interface DepartmentsSettingsFormProps {
  canEdit: boolean;
  initialDepartments?: Department[];
}

export function DepartmentsSettingsForm({ canEdit, initialDepartments }: DepartmentsSettingsFormProps) {
  const [departments, setDepartments] = useState<Department[]>(initialDepartments ?? []);
  const [loading, setLoading] = useState(initialDepartments === undefined);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  async function fetchDepartments() {
    const res = await fetch("/api/admin/company/departments");
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load departments");
      return;
    }
    const data = (await res.json()) as Department[];
    setDepartments(data);
  }

  useEffect(() => {
    if (initialDepartments !== undefined) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        await fetchDepartments();
      } catch {
        notify.error("Failed to load departments");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [initialDepartments]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !newName.trim()) return;

    setBusyKey("add");
    try {
      const res = await fetch("/api/admin/company/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });

      const data = (await res.json()) as Department & { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to add department");
        return;
      }

      setDepartments((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      notify.success("Department added.");
    } catch {
      notify.error("Failed to add department");
    } finally {
      setBusyKey(null);
    }
  }

  function startEdit(d: Department) {
    setEditingId(d.id);
    setEditName(d.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function handleUpdate(id: string) {
    if (!canEdit) return;

    setBusyKey(`update-${id}`);
    try {
      const res = await fetch(`/api/admin/company/departments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });

      const data = (await res.json()) as Department & { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to update department");
        return;
      }

      setDepartments((prev) =>
        prev.map((d) => (d.id === id ? data : d)).sort((a, b) => a.name.localeCompare(b.name))
      );
      cancelEdit();
      notify.success("Department updated.");
    } catch {
      notify.error("Failed to update department");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!canEdit) return;
    if (!window.confirm(`Delete department "${name}"?`)) return;

    setBusyKey(`delete-${id}`);
    try {
      const res = await fetch(`/api/admin/company/departments/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        notify.error(data.error ?? "Failed to delete department");
        return;
      }

      setDepartments((prev) => prev.filter((d) => d.id !== id));
      if (editingId === id) cancelEdit();
      notify.success("Department deleted.");
    } catch {
      notify.error("Failed to delete department");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Departments</CardTitle>
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
        <CardTitle>Departments</CardTitle>
        <p className="text-muted-foreground text-sm">
          Manage departments (e.g. HR, Finance).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit && (
          <form onSubmit={handleAdd} className="flex gap-2">
            <Input
              placeholder="Department name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={isBusy}
              maxLength={100}
              className="max-w-xs"
            />
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
          {departments.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              {editingId === d.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    disabled={isBusy}
                    maxLength={100}
                    className="max-w-xs"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleUpdate(d.id)}
                    disabled={isBusy || !editName.trim()}
                  >
                    {busyKey === `update-${d.id}` ? (
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
                  <p className="font-medium">{d.name}</p>
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEdit(d)}
                        disabled={isBusy}
                      >
                        <Pencil className="size-4" aria-hidden />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(d.id, d.name)}
                        disabled={isBusy}
                      >
                        {busyKey === `delete-${d.id}` ? (
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

        {departments.length === 0 && (
          <p className="text-muted-foreground text-sm">No departments added yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
