"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

type ColumnMeta = { id: string; label: string };

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  columnKeys: string[];
};

function AccessMultiSelect({
  columns,
  selected,
  onChange,
  disabled,
  userLabel,
}: {
  columns: ColumnMeta[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
  userLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const count = selected.size;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={`Access columns for ${userLabel}`}
          className="w-full max-w-md justify-between font-normal"
          disabled={disabled}
        >
          <span className="truncate">
            {count === 0 ? "Access — none selected" : `Access — ${count} column${count === 1 ? "" : "s"}`}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,90vw)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search column name…" />
          <CommandList>
            <CommandEmpty>No column found.</CommandEmpty>
            <CommandGroup>
              {columns.map((col) => {
                const checked = selected.has(col.id);
                return (
                  <CommandItem
                    key={col.id}
                    value={`${col.label} ${col.id}`}
                    onSelect={() => {
                      const next = new Set(selected);
                      if (next.has(col.id)) next.delete(col.id);
                      else next.add(col.id);
                      onChange(next);
                    }}
                  >
                    <Check
                      className={cn("mr-2 size-4", checked ? "opacity-100" : "opacity-0")}
                    />
                    <span className="truncate">{col.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function OsfColumnAccessPanel() {
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
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
        setColumns(json.columns ?? []);
        const nextUsers: UserRow[] = json.users ?? [];
        setUsers(nextUsers);
        const nextDraft: Record<string, Set<string>> = {};
        for (const u of nextUsers) {
          nextDraft[u.id] = new Set(u.columnKeys ?? []);
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

  const sortedColumns = useMemo(
    () => [...columns].sort((a, b) => a.label.localeCompare(b.label)),
    [columns],
  );

  async function save() {
    setSaving(true);
    try {
      const assignments = users.map((u) => ({
        userId: u.id,
        columnKeys: [...(draft[u.id] ?? [])],
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
            For each purchasing user, open Access and search/mark which OSF columns they may
            receive on download. Unmarked columns are omitted (identity columns such as SKU
            and barcode always remain). Users with OSF manage or OSF permission always get
            the full column set on their own downloads.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No users with purchasing permissions found.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[28rem] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2">User</th>
                <th className="p-2">Access</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const label = u.name ?? u.email ?? u.id;
                return (
                  <tr key={u.id} className="border-t">
                    <td className="p-2 align-top">
                      <div className="font-medium">{label}</div>
                      {u.name && u.email && (
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      )}
                    </td>
                    <td className="p-2">
                      <AccessMultiSelect
                        columns={sortedColumns}
                        selected={draft[u.id] ?? new Set()}
                        userLabel={label}
                        disabled={saving}
                        onChange={(next) =>
                          setDraft((prev) => ({ ...prev, [u.id]: next }))
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
