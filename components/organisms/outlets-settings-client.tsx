"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirmationDialog } from "@/components/providers/confirmation-dialog-provider";
import { notify } from "@/lib/notify";

type Outlet = {
  id: string;
  name: string;
};

type OutletsSettingsClientProps = {
  embedded?: boolean;
};

export function OutletsSettingsClient({ embedded = false }: OutletsSettingsClientProps) {
  const { confirm } = useConfirmationDialog();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/outlets/list");
      const data = (await res.json()) as { outlets?: Outlet[]; error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to load outlets");
        return;
      }
      setOutlets(data.outlets ?? []);
    } catch {
      notify.error("Failed to load outlets");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;

    setBusyKey("create");
    try {
      const res = await fetch("/api/admin/outlets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as { outlet?: Outlet; error?: string };
      if (!res.ok || !data.outlet) {
        notify.error(data.error ?? "Failed to create outlet");
        return;
      }
      setOutlets((prev) => [...prev, data.outlet!].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      notify.success("Outlet created");
    } catch {
      notify.error("Failed to create outlet");
    } finally {
      setBusyKey(null);
    }
  }

  function startEdit(outlet: Outlet) {
    setEditingId(outlet.id);
    setEditName(outlet.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function handleUpdate(id: string) {
    const name = editName.trim();
    if (!name) return;

    setBusyKey(`update-${id}`);
    try {
      const res = await fetch("/api/admin/outlets/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outletId: id, name }),
      });
      const data = (await res.json()) as { outlet?: Outlet; error?: string };
      if (!res.ok || !data.outlet) {
        notify.error(data.error ?? "Failed to update outlet");
        return;
      }
      setOutlets((prev) => prev.map((outlet) => (outlet.id === id ? data.outlet! : outlet)));
      cancelEdit();
      notify.success("Outlet updated");
    } catch {
      notify.error("Failed to update outlet");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDelete(outlet: Outlet) {
    const confirmed = await confirm({
      title: "Delete outlet?",
      description: `Delete outlet "${outlet.name}"? Existing outlet review records for this outlet will also be deleted by the database relation.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!confirmed) return;

    setBusyKey(`delete-${outlet.id}`);
    try {
      const res = await fetch("/api/admin/outlets/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outletId: outlet.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to delete outlet");
        return;
      }
      setOutlets((prev) => prev.filter((item) => item.id !== outlet.id));
      if (editingId === outlet.id) cancelEdit();
      notify.success("Outlet deleted");
    } catch {
      notify.error("Failed to delete outlet");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))]">
          <CardTitle>Outlets</CardTitle>
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
    <div className="space-y-4">
      {!embedded && (
        <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
          <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">Settings</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Outlets</h1>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
            Create and rename outlets. Staff outlet assignment is handled in Staff Details.
          </p>
        </section>
      )}

      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent))]">
          <CardTitle>Outlets</CardTitle>
          <p className="text-muted-foreground text-sm">
            Manage outlet names. Assign each staff member to an outlet from Staff Details.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleCreate} className="flex gap-2">
            <Input
              placeholder="Outlet name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={isBusy}
              maxLength={100}
              className="max-w-xs rounded-lg border-border/80 bg-background/80"
            />
            <Button type="submit" disabled={isBusy || !newName.trim()}>
              {busyKey === "create" ? (
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

          <ul className="space-y-2">
            {outlets.map((outlet) => (
              <li key={outlet.id} className="flex items-center justify-between rounded-xl border border-border/70 bg-background/70 p-3">
                {editingId === outlet.id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      disabled={isBusy}
                      maxLength={100}
                      className="max-w-xs rounded-lg border-border/80 bg-background/80"
                    />
                    <Button
                      size="sm"
                      onClick={() => void handleUpdate(outlet.id)}
                      disabled={isBusy || !editName.trim() || editName.trim() === outlet.name}
                    >
                      {busyKey === `update-${outlet.id}` ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        "Save"
                      )}
                    </Button>
                    <Button size="sm" variant="outline" className="border-border/70 bg-background/70 hover:bg-secondary/15" onClick={cancelEdit} disabled={isBusy}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="font-medium">{outlet.name}</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-border/70 bg-background/70 hover:bg-secondary/15"
                        onClick={() => startEdit(outlet)}
                        disabled={isBusy}
                      >
                        <Pencil className="size-4" aria-hidden />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void handleDelete(outlet)}
                        disabled={isBusy}
                      >
                        {busyKey === `delete-${outlet.id}` ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="size-4" aria-hidden />
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>

          {outlets.length === 0 && !loading && (
            <p className="text-muted-foreground text-sm">No outlets added yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
