"use client";

import { useState, useEffect } from "react";
import { BriefcaseBusiness, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

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
      <Card className="border-border/70 bg-card/95 shadow-sm">
        <CardHeader>
          <CardTitle>Departments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading department settings...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          <BriefcaseBusiness className="size-3.5" aria-hidden />
          Team Structure
        </div>
        <div>
          <CardTitle>Departments</CardTitle>
          <p className="text-muted-foreground text-sm">
            Organize staff by department so reporting and staff records stay easy to manage.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border bg-background/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Active Departments
          </p>
          <p className="mt-2 text-2xl font-semibold">{departments.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add business units like HR, Finance, Operations, or Sales.
          </p>
        </div>

        {canEdit && (
          <div className="rounded-xl border bg-background/80 p-4 sm:p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Add Department
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Create the department names staff will use across profiles and reports.
              </p>
            </div>
            <form onSubmit={handleAdd} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="w-full max-w-md space-y-1.5">
                <label htmlFor="department-name" className="text-sm font-medium">
                  Department name
                </label>
                <Input
                  id="department-name"
                  placeholder="Enter department name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={isBusy}
                  maxLength={100}
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
                    Add Department
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
                Department List
              </h3>
              <p className="text-sm text-muted-foreground">
                Keep naming consistent so staff records and filters remain clear.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {departments.length === 0 ? "No departments saved" : `${departments.length} departments saved`}
            </p>
          </div>

          <ul className="space-y-3">
            {departments.map((d) => (
              <li
                key={d.id}
                className="flex flex-col gap-3 rounded-xl border bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                {editingId === d.id ? (
                  <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      disabled={isBusy}
                      maxLength={100}
                      className="w-full max-w-md"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleUpdate(d.id)}
                        disabled={isBusy || !editName.trim() || editName.trim() === d.name}
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
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="font-medium">{d.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Used for staff assignment and reporting groups.
                      </p>
                    </div>
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
        </div>

        {departments.length === 0 && (
          <div className="rounded-xl border border-dashed px-4 py-8 text-center">
            <p className="text-sm font-medium">No departments added yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first department to organize staff and internal reporting.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
