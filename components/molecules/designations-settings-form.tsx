"use client";

import { useState, useEffect } from "react";
import { BriefcaseBusiness, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

type Designation = {
  id: string;
  name: string;
};

interface DesignationsSettingsFormProps {
  canEdit: boolean;
  initialDesignations?: Designation[];
}

export function DesignationsSettingsForm({ canEdit, initialDesignations }: DesignationsSettingsFormProps) {
  const [designations, setDesignations] = useState<Designation[]>(initialDesignations ?? []);
  const [loading, setLoading] = useState(initialDesignations === undefined);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  async function fetchDesignations() {
    const res = await fetch("/api/admin/company/designations");
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load designations");
      return;
    }
    const data = (await res.json()) as Designation[];
    setDesignations(data);
  }

  useEffect(() => {
    if (initialDesignations !== undefined) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        await fetchDesignations();
      } catch {
        notify.error("Failed to load designations");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [initialDesignations]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !newName.trim()) return;

    setBusyKey("add");
    try {
      const res = await fetch("/api/admin/company/designations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });

      const data = (await res.json()) as Designation & { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to add designation");
        return;
      }

      setDesignations((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      notify.success("Designation added.");
    } catch {
      notify.error("Failed to add designation");
    } finally {
      setBusyKey(null);
    }
  }

  function startEdit(d: Designation) {
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
      const res = await fetch(`/api/admin/company/designations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });

      const data = (await res.json()) as Designation & { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to update designation");
        return;
      }

      setDesignations((prev) =>
        prev.map((d) => (d.id === id ? data : d)).sort((a, b) => a.name.localeCompare(b.name))
      );
      cancelEdit();
      notify.success("Designation updated.");
    } catch {
      notify.error("Failed to update designation");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!canEdit) return;
    if (!window.confirm(`Delete designation "${name}"?`)) return;

    setBusyKey(`delete-${id}`);
    try {
      const res = await fetch(`/api/admin/company/designations/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        notify.error(data.error ?? "Failed to delete designation");
        return;
      }

      setDesignations((prev) => prev.filter((d) => d.id !== id));
      if (editingId === id) cancelEdit();
      notify.success("Designation deleted.");
    } catch {
      notify.error("Failed to delete designation");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <Card className="border-border/70 bg-card/95 shadow-sm">
        <CardHeader>
          <CardTitle>Designations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading designation settings...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-violet-800 dark:bg-violet-900/30 dark:text-violet-300">
          <BriefcaseBusiness className="size-3.5" aria-hidden />
          Role Titles
        </div>
        <div>
          <CardTitle>Designations</CardTitle>
          <p className="text-muted-foreground text-sm">
            Manage the job titles used in staff profiles, approvals, and role-based reporting.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border bg-background/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Active Designations
          </p>
          <p className="mt-2 text-2xl font-semibold">{designations.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Examples: Manager, Executive, Coordinator, Rider, or Cashier.
          </p>
        </div>

        {canEdit && (
          <div className="rounded-xl border bg-background/80 p-4 sm:p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Add Designation
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Create job titles that will appear consistently across staff records.
              </p>
            </div>
            <form onSubmit={handleAdd} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="w-full max-w-md space-y-1.5">
                <label htmlFor="designation-name" className="text-sm font-medium">
                  Designation name
                </label>
                <Input
                  id="designation-name"
                  placeholder="Enter designation name"
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
                    Add Designation
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
                Designation List
              </h3>
              <p className="text-sm text-muted-foreground">
                Keep titles concise so they stay readable across forms and approvals.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {designations.length === 0 ? "No designations saved" : `${designations.length} designations saved`}
            </p>
          </div>

          <ul className="space-y-3">
            {designations.map((d) => (
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
                        Used as the staff member's official job title.
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

        {designations.length === 0 && (
          <div className="rounded-xl border border-dashed px-4 py-8 text-center">
            <p className="text-sm font-medium">No designations added yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a designation so staff profiles can use consistent job titles.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
