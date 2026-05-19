"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirmationDialog } from "@/components/providers/confirmation-dialog-provider";
import { notify } from "@/lib/notify";

type OptionItem = {
  id: string;
  type: string;
  value: string;
  createdAt: string;
};

const OPTION_TYPES = [
  { key: "serviceProvider", label: "Service Provider" },
  { key: "district", label: "District" },
  { key: "town", label: "Town" },
  { key: "origin", label: "Origin" },
  { key: "customerType", label: "Customer Type" },
  { key: "category", label: "Category" },
] as const;

type OptionTypeKey = (typeof OPTION_TYPES)[number]["key"];

interface ContactAllocationOptionsSettingsFormProps {
  canEdit: boolean;
}

export function ContactAllocationOptionsSettingsForm({
  canEdit,
}: ContactAllocationOptionsSettingsFormProps) {
  const { confirm } = useConfirmationDialog();
  const [items, setItems] = useState<OptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newType, setNewType] = useState<OptionTypeKey>("serviceProvider");
  const [newValue, setNewValue] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/settings/contact-allocation-options");
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          notify.error(data.error ?? "Failed to load options");
          return;
        }
        const data = (await res.json()) as OptionItem[];
        setItems(data);
      } catch {
        notify.error("Failed to load options");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !newValue.trim()) return;

    setBusyKey("add");
    try {
      const res = await fetch("/api/admin/settings/contact-allocation-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: newType, value: newValue.trim() }),
      });

      const data = (await res.json()) as OptionItem & { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to add option");
        return;
      }

      setItems((prev) =>
        [...prev, data].sort((a, b) =>
          a.type.localeCompare(b.type) || a.value.localeCompare(b.value)
        )
      );
      setNewValue("");
      notify.success("Option added.");
    } catch {
      notify.error("Failed to add option");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDelete(item: OptionItem) {
    const confirmed = await confirm({
      title: "Delete option",
      description: `Remove "${item.value}" from ${OPTION_TYPES.find((t) => t.key === item.type)?.label ?? item.type}?`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!confirmed) return;

    setBusyKey(`delete-${item.id}`);
    try {
      const res = await fetch(
        `/api/admin/settings/contact-allocation-options/${item.id}`,
        { method: "DELETE" }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to delete option");
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      notify.success("Option deleted.");
    } catch {
      notify.error("Failed to delete option");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Add Option</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="flex flex-col gap-3 sm:grid sm:grid-cols-[auto_1fr_auto] sm:gap-x-3 sm:gap-y-1.5">
              {/* Desktop-only label row */}
              <label className="hidden text-sm font-medium sm:block">Field</label>
              <label className="hidden text-sm font-medium sm:block">Value</label>
              <div className="hidden sm:block" aria-hidden="true" />

              {/* Field control — div is layout-transparent to grid on sm */}
              <div className="space-y-1.5 sm:contents">
                <label className="text-sm font-medium sm:hidden">Field</label>
                <Select
                  value={newType}
                  onValueChange={(v) => setNewType(v as OptionTypeKey)}
                  disabled={isBusy}
                >
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPTION_TYPES.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Value control */}
              <div className="space-y-1.5 sm:contents">
                <label className="text-sm font-medium sm:hidden">Value</label>
                <Input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="e.g. Dialog, Colombo, Website…"
                  disabled={isBusy}
                  maxLength={100}
                />
              </div>

              <Button
                type="submit"
                disabled={isBusy || !newValue.trim()}
                className="w-full sm:w-auto"
              >
                {busyKey === "add" ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 size-4" />
                )}
                Add
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {OPTION_TYPES.map((optType) => {
        const typeItems = items.filter((i) => i.type === optType.key);
        return (
          <Card key={optType.key}>
            <CardHeader>
              <CardTitle>{optType.label}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </div>
              ) : typeItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No options configured. Add one above.
                </p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {typeItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between px-4 py-2.5 text-sm"
                    >
                      <span>{item.value}</span>
                      {canEdit && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(item)}
                          disabled={busyKey === `delete-${item.id}`}
                        >
                          {busyKey === `delete-${item.id}` ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
