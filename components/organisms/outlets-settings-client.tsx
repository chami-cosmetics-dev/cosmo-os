"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";

type OutletUser = {
  userId: string;
  couponCodes: string[];
  user: {
    id: string;
    name: string | null;
    email: string | null;
    knownName?: string | null;
  };
};

type Outlet = {
  id: string;
  name: string;
  users: OutletUser[];
};

type AvailableUser = {
  id: string;
  name: string | null;
  email: string | null;
  knownName?: string | null;
  couponCodes: string[];
};

function userDisplayName(u: { id?: string; name?: string | null; email?: string | null; knownName?: string | null }) {
  return u.knownName ?? u.name ?? u.email ?? u.id ?? "Unknown";
}

export function OutletsSettingsClient() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [removeUserId, setRemoveUserId] = useState<string | null>(null);

  // Form state
  const [createName, setCreateName] = useState("");
  const [editName, setEditName] = useState("");
  const [assignUserId, setAssignUserId] = useState("__none");
  const [assignCoupons, setAssignCoupons] = useState("");

  const selectedOutlet = outlets.find((o) => o.id === selectedOutletId) ?? null;
  const selectedAssignUser = availableUsers.find((u) => u.id === assignUserId) ?? null;

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [outletRes, usersRes] = await Promise.all([
        fetch("/api/admin/outlets/list"),
        fetch("/api/admin/outlets/available-users"),
      ]);
      const outletData = (await outletRes.json()) as { outlets?: Outlet[]; error?: string };
      const usersData = (await usersRes.json()) as { users?: AvailableUser[]; error?: string };
      if (!outletRes.ok) {
        notify.error(outletData.error ?? "Failed to load outlets");
      } else {
        setOutlets(outletData.outlets ?? []);
      }
      if (!usersRes.ok) {
        notify.error(usersData.error ?? "Failed to load users");
      } else {
        setAvailableUsers(usersData.users ?? []);
      }
    } catch {
      notify.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!createName.trim()) { notify.error("Name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/outlets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim() }),
      });
      const data = (await res.json()) as { outlet?: Outlet; error?: string };
      if (!res.ok) { notify.error(data.error ?? "Failed to create outlet"); return; }
      setOutlets((prev) => [...prev, data.outlet!].sort((a, b) => a.name.localeCompare(b.name)));
      setCreateName("");
      setCreateOpen(false);
      notify.success("Outlet created");
    } catch { notify.error("Failed to create outlet"); }
    finally { setSaving(false); }
  }

  async function handleEdit() {
    if (!selectedOutlet || !editName.trim()) { notify.error("Name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/outlets/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outletId: selectedOutlet.id, name: editName.trim() }),
      });
      const data = (await res.json()) as { outlet?: Outlet; error?: string };
      if (!res.ok) { notify.error(data.error ?? "Failed to update outlet"); return; }
      setOutlets((prev) => prev.map((o) => o.id === selectedOutlet.id ? data.outlet! : o));
      setSelectedOutletId(data.outlet!.id);
      setEditOpen(false);
      notify.success("Outlet updated");
    } catch { notify.error("Failed to update outlet"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!selectedOutlet) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/outlets/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outletId: selectedOutlet.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) { notify.error(data.error ?? "Failed to delete outlet"); return; }
      setOutlets((prev) => prev.filter((o) => o.id !== selectedOutlet.id));
      setSelectedOutletId(null);
      setDeleteOpen(false);
      notify.success("Outlet deleted");
    } catch { notify.error("Failed to delete outlet"); }
    finally { setSaving(false); }
  }

  async function handleAssignUser() {
    if (!selectedOutlet || assignUserId === "__none") { notify.error("Select a user"); return; }
    const codes =
      selectedAssignUser?.couponCodes.length
        ? selectedAssignUser.couponCodes
        : assignCoupons.split(",").map((c) => c.trim()).filter(Boolean);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/outlets/assign-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outletId: selectedOutlet.id, userId: assignUserId, couponCodes: codes }),
      });
      const data = (await res.json()) as { outlet?: Outlet; error?: string };
      if (!res.ok) { notify.error(data.error ?? "Failed to assign user"); return; }
      setOutlets((prev) => prev.map((o) => o.id === selectedOutlet.id ? data.outlet! : o));
      setSelectedOutletId(selectedOutlet.id);
      setAssignUserId("__none");
      setAssignCoupons("");
      setAssignOpen(false);
      notify.success("User assigned");
    } catch { notify.error("Failed to assign user"); }
    finally { setSaving(false); }
  }

  async function handleRemoveUser(userId: string) {
    if (!selectedOutlet) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/outlets/remove-user", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outletId: selectedOutlet.id, userId }),
      });
      const data = (await res.json()) as { outlet?: Outlet; error?: string };
      if (!res.ok) { notify.error(data.error ?? "Failed to remove user"); return; }
      setOutlets((prev) => prev.map((o) => o.id === selectedOutlet.id ? data.outlet! : o));
      setRemoveUserId(null);
      notify.success("User removed");
    } catch { notify.error("Failed to remove user"); }
    finally { setSaving(false); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">Settings</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Outlets</h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
          Manage outlets and assign users with their coupon codes.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left: Outlet list */}
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-3">
            <CardTitle className="text-sm font-medium">Outlets ({outlets.length})</CardTitle>
            <Button size="sm" onClick={() => { setCreateName(""); setCreateOpen(true); }}>
              <Plus className="mr-1 size-3.5" /> Add Outlet
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {outlets.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No outlets yet.</p>
            )}
            {outlets.map((outlet) => (
              <button
                key={outlet.id}
                type="button"
                onClick={() => setSelectedOutletId(outlet.id)}
                className={`w-full border-b border-border/40 px-4 py-3 text-left transition-colors last:border-0 hover:bg-secondary/10 ${
                  selectedOutletId === outlet.id ? "bg-secondary/20" : ""
                }`}
              >
                <p className="text-sm font-medium">{outlet.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {outlet.users.length} user{outlet.users.length !== 1 ? "s" : ""} assigned
                </p>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Right: Selected outlet details */}
        <Card className="border-border/70 shadow-xs">
          {!selectedOutlet ? (
            <CardContent className="flex items-center justify-center py-20">
              <p className="text-sm text-muted-foreground">Select an outlet to manage</p>
            </CardContent>
          ) : (
            <>
              <CardHeader className="flex flex-row items-start justify-between border-b border-border/50 pb-3">
                <div>
                  <CardTitle className="text-base">{selectedOutlet.name}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedOutlet.users.length} user{selectedOutlet.users.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setEditName(selectedOutlet.name); setEditOpen(true); }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    Delete
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Assigned Users</p>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setAssignUserId("__none"); setAssignCoupons(""); setAssignOpen(true); }}
                  >
                    <UserPlus className="mr-1 size-3.5" /> Assign User
                  </Button>
                </div>
                {selectedOutlet.users.length === 0 && (
                  <p className="text-xs text-muted-foreground">No users assigned yet.</p>
                )}
                {selectedOutlet.users.map((assignment) => (
                  <div
                    key={assignment.userId}
                    className="flex items-start justify-between gap-2 rounded-lg border border-border/60 bg-secondary/5 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{userDisplayName(assignment.user)}</p>
                      <p className="text-xs text-muted-foreground truncate">{assignment.user.email}</p>
                      {assignment.couponCodes.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Coupons: {assignment.couponCodes.join(", ")}
                        </p>
                      )}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => setRemoveUserId(assignment.userId)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </>
          )}
        </Card>
      </div>

      {/* Create Outlet Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Outlet</DialogTitle>
            <DialogDescription>Enter a name for the new outlet.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Outlet Name</label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Colombo 03 Outlet"
                onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void handleCreate()} disabled={saving}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Outlet Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Outlet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Outlet Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleEdit()}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void handleEdit()} disabled={saving}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Outlet Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Outlet</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{selectedOutlet?.name}&rdquo;? This will also remove all user assignments.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign User Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign User to {selectedOutlet?.name}</DialogTitle>
            <DialogDescription>Select a user. Coupon codes are pulled from Staff Management.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="mb-1 block text-sm font-medium">User</label>
              <Select
                value={assignUserId}
                onValueChange={(userId) => {
                  setAssignUserId(userId);
                  const user = availableUsers.find((u) => u.id === userId);
                  setAssignCoupons(user?.couponCodes.join(", ") ?? "");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select user..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none" disabled>Select user...</SelectItem>
                  {availableUsers
                    .filter((u) => !selectedOutlet?.users.some((a) => a.userId === u.id))
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {userDisplayName(u)} {u.email ? `(${u.email})` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Coupon Codes</label>
              <Textarea
                value={assignCoupons}
                readOnly
                placeholder="No coupon codes assigned in Staff Management"
                rows={3}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Update these in Staff Management if they need to change.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void handleAssignUser()} disabled={saving || assignUserId === "__none"}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Assign
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove User Confirmation */}
      <Dialog open={!!removeUserId} onOpenChange={(open) => { if (!open) setRemoveUserId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove User</DialogTitle>
            <DialogDescription>Remove this user from the outlet?</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setRemoveUserId(null)} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeUserId && void handleRemoveUser(removeUserId)}
              disabled={saving}
            >
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
