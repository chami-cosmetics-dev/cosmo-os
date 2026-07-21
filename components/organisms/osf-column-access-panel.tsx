"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";

type GroupMeta = { id: string; label: string };

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  columnGroups: string[];
};

export function OsfColumnAccessPanel() {
  const [groups, setGroups] = useState<GroupMeta[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/osf/column-access");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load column access");
        if (cancelled) return;
        setGroups(json.groups ?? []);
        const nextUsers: UserRow[] = json.users ?? [];
        setUsers(nextUsers);
        const nextDraft: Record<string, Set<string>> = {};
        for (const u of nextUsers) {
          nextDraft[u.id] = new Set(u.columnGroups ?? []);
        }
        setDraft(nextDraft);
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Failed to load column access");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(userId: string, groupId: string) {
    setDraft((prev) => {
      const set = new Set(prev[userId] ?? []);
      if (set.has(groupId)) set.delete(groupId);
      else set.add(groupId);
      return { ...prev, [userId]: set };
    });
  }

  async function save() {
    setSaving(true);
    try {
      const assignments = users.map((u) => ({
        userId: u.id,
        columnGroups: [...(draft[u.id] ?? [])],
      }));
      const res = await fetch("/api/admin/osf/column-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      notify.success("OSF column access saved");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading column access…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="max-w-2xl space-y-1">
          <h3 className="font-medium">Excel column access</h3>
          <p className="text-sm text-muted-foreground">
            Choose which column groups each purchasing user receives when they download
            OSF or reorder-only files. Users with OSF manage or OSF permission always get
            the full column set on their own downloads.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Save
        </Button>
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No users with purchasing permissions found.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2">User</th>
                {groups.map((g) => (
                  <th key={g.id} className="p-2 text-center">
                    {g.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="p-2">
                    <div className="font-medium">{u.name ?? u.email ?? u.id}</div>
                    {u.name && u.email && (
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    )}
                  </td>
                  {groups.map((g) => (
                    <td key={g.id} className="p-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${g.label} for ${u.name ?? u.email}`}
                        checked={draft[u.id]?.has(g.id) ?? false}
                        onChange={() => toggle(u.id, g.id)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
