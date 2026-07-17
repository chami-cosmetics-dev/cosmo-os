"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit2, Loader2, Plus, Save, Trash2, Users } from "lucide-react";

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
import { notify } from "@/lib/notify";

type Merchant = {
  id: string;
  displayName: string;
  email: string | null;
  couponCodes: string[];
  groupId: string | null;
  groupName: string | null;
};

type MerchantGroup = {
  id: string;
  name: string;
  members: Merchant[];
};

type MerchantGroupPayload = {
  merchants?: Merchant[];
  groups?: MerchantGroup[];
  error?: string;
};

function sortByName<T extends { displayName?: string; name?: string }>(items: T[]) {
  return [...items].sort((a, b) => (a.displayName ?? a.name ?? "").localeCompare(b.displayName ?? b.name ?? ""));
}

export function MerchantsSettingsClient() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [groups, setGroups] = useState<MerchantGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [editGroupName, setEditGroupName] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;
  const ungroupedMerchants = useMemo(
    () => sortByName(merchants.filter((merchant) => !merchant.groupId)),
    [merchants],
  );

  const applyPayload = useCallback((data: MerchantGroupPayload) => {
    const nextMerchants = data.merchants ?? [];
    const nextGroups = data.groups ?? [];
    setMerchants(nextMerchants);
    setGroups(nextGroups);
    if (selectedGroupId && !nextGroups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(null);
    }
  }, [selectedGroupId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/merchant-groups/list");
      const data = (await res.json()) as MerchantGroupPayload;
      if (!res.ok) {
        notify.error(data.error ?? "Failed to load merchants");
      } else {
        applyPayload(data);
      }
    } catch {
      notify.error("Failed to load merchants");
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function openGroup(group: MerchantGroup) {
    setSelectedGroupId(group.id);
    setEditGroupName(group.name);
    setSelectedMemberIds(new Set(group.members.map((member) => member.id)));
  }

  async function submitJson(url: string, method: string, body: unknown, success: string) {
    setSaving(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as MerchantGroupPayload;
      if (!res.ok) {
        notify.error(data.error ?? "Request failed");
        return false;
      }
      applyPayload(data);
      notify.success(success);
      return true;
    } catch {
      notify.error("Request failed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    const name = newGroupName.trim();
    if (!name) {
      notify.error("Group name is required");
      return;
    }
    const ok = await submitJson("/api/admin/merchant-groups/create", "POST", { name }, "Merchant group created");
    if (ok) {
      setNewGroupName("");
      setCreateOpen(false);
    }
  }

  async function handleRename() {
    if (!selectedGroup) return;
    const name = editGroupName.trim();
    if (!name) {
      notify.error("Group name is required");
      return;
    }
    await submitJson(
      "/api/admin/merchant-groups/update",
      "PUT",
      { groupId: selectedGroup.id, name },
      "Merchant group updated",
    );
  }

  async function handleSaveMembers() {
    if (!selectedGroup) return;
    await submitJson(
      "/api/admin/merchant-groups/members",
      "PUT",
      { groupId: selectedGroup.id, userIds: Array.from(selectedMemberIds) },
      "Group members updated",
    );
  }

  async function handleDelete() {
    if (!selectedGroup) return;
    const ok = await submitJson(
      "/api/admin/merchant-groups/delete",
      "DELETE",
      { groupId: selectedGroup.id },
      "Merchant group deleted",
    );
    if (ok) {
      setSelectedGroupId(null);
      setDeleteOpen(false);
    }
  }

  function toggleMember(userId: string) {
    setSelectedMemberIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
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
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Merchants</h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
          Manage coupon merchants and merge them into reporting groups.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-3">
            <CardTitle className="text-sm font-medium">Groups ({groups.length})</CardTitle>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 size-3.5" /> Add Group
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {groups.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No merchant groups yet.</p>
            )}
            {sortByName(groups).map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => openGroup(group)}
                className={`w-full border-b border-border/40 px-4 py-3 text-left transition-colors last:border-0 hover:bg-secondary/10 ${
                  selectedGroupId === group.id ? "bg-secondary/20" : ""
                }`}
              >
                <p className="text-sm font-medium">{group.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {group.members.length} merchant{group.members.length !== 1 ? "s" : ""}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-xs">
          {!selectedGroup ? (
            <CardContent className="space-y-4 py-6">
              <div>
                <p className="text-sm font-medium">Ungrouped coupon merchants</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  These merchants still show by their own name until added to a group.
                </p>
              </div>
              <MerchantList merchants={ungroupedMerchants} />
            </CardContent>
          ) : (
            <>
              <CardHeader className="space-y-3 border-b border-border/50 pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <Users className="size-4 shrink-0 text-muted-foreground" />
                    <CardTitle className="truncate text-base">{selectedGroup.name}</CardTitle>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => void handleRename()} disabled={saving}>
                      <Edit2 className="mr-1 size-3.5" /> Rename
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDeleteOpen(true)} disabled={saving}>
                      <Trash2 className="mr-1 size-3.5" /> Delete
                    </Button>
                  </div>
                </div>
                <Input value={editGroupName} onChange={(event) => setEditGroupName(event.target.value)} />
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Group members</p>
                    <p className="mt-1 text-xs text-muted-foreground">A merchant can be in one group only.</p>
                  </div>
                  <Button size="sm" onClick={() => void handleSaveMembers()} disabled={saving}>
                    <Save className="mr-1 size-3.5" /> Save
                  </Button>
                </div>
                <div className="space-y-2">
                  {sortByName(merchants).map((merchant) => {
                    const checked = selectedMemberIds.has(merchant.id);
                    const lockedByOtherGroup = !!merchant.groupId && merchant.groupId !== selectedGroup.id;
                    return (
                      <label
                        key={merchant.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 px-3 py-2 ${
                          lockedByOtherGroup ? "bg-muted/40 text-muted-foreground" : "bg-secondary/5"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 size-4"
                          checked={checked}
                          disabled={lockedByOtherGroup}
                          onChange={() => toggleMember(merchant.id)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{merchant.displayName}</span>
                          <span className="block truncate text-xs text-muted-foreground">{merchant.email ?? ""}</span>
                          <span className="block text-xs text-muted-foreground">
                            {merchant.couponCodes.join(", ")}
                            {lockedByOtherGroup ? ` | in ${merchant.groupName}` : ""}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Merchant Group</DialogTitle>
            <DialogDescription>The group name is shown in reports and dashboards.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              placeholder="e.g. Colombo Team"
              onKeyDown={(event) => event.key === "Enter" && void handleCreate()}
            />
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

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Merchant Group</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{selectedGroup?.name}&rdquo;? Merchants will go back to showing their own names.
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
    </div>
  );
}

function MerchantList({ merchants }: { merchants: Merchant[] }) {
  if (merchants.length === 0) {
    return <p className="text-xs text-muted-foreground">No merchants to show.</p>;
  }

  return (
    <div className="space-y-2">
      {merchants.map((merchant) => (
        <div key={merchant.id} className="rounded-lg border border-border/60 bg-secondary/5 px-3 py-2">
          <p className="truncate text-sm font-medium">{merchant.displayName}</p>
          <p className="truncate text-xs text-muted-foreground">{merchant.email ?? ""}</p>
          <p className="text-xs text-muted-foreground">{merchant.couponCodes.join(", ")}</p>
        </div>
      ))}
    </div>
  );
}
