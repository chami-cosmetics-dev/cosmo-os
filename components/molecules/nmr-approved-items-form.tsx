"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";

import { useConfirmationDialog } from "@/components/providers/confirmation-dialog-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

type NmrApprovedItem = {
  id: string;
  itemCode: string;
  createdAt: string;
};

export function NmrApprovedItemsForm({ canEdit }: { canEdit: boolean }) {
  const { confirm } = useConfirmationDialog();
  const [items, setItems] = useState<NmrApprovedItem[]>([]);
  const [itemCode, setItemCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/admin/product-items/nmr-approved");
        const data = (await response.json()) as NmrApprovedItem[] & { error?: string };
        if (!response.ok) {
          notify.error(data.error ?? "Failed to load NMRA-approved items");
          return;
        }
        setItems(data);
      } catch {
        notify.error("Failed to load NMRA-approved items");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!canEdit || !itemCode.trim()) return;
    setBusyKey("add");
    try {
      const response = await fetch("/api/admin/product-items/nmr-approved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemCode }),
      });
      const data = (await response.json()) as NmrApprovedItem & { error?: string };
      if (!response.ok) {
        notify.error(data.error ?? "Failed to add NMRA-approved item");
        return;
      }
      setItems((current) =>
        [...current, data].sort((a, b) => a.itemCode.localeCompare(b.itemCode)),
      );
      setItemCode("");
      notify.success(`${data.itemCode} added to NMRA-approved items.`);
    } catch {
      notify.error("Failed to add NMRA-approved item");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRemove(item: NmrApprovedItem) {
    if (!canEdit) return;
    const confirmed = await confirm({
      title: "Remove NMRA approval?",
      description: `${item.itemCode} stickers will no longer show "NMRA approved".`,
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!confirmed) return;

    setBusyKey(item.id);
    try {
      const response = await fetch(`/api/admin/product-items/nmr-approved/${item.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        notify.error(data.error ?? "Failed to remove NMRA-approved item");
        return;
      }
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      notify.success(`${item.itemCode} removed from NMRA-approved items.`);
    } catch {
      notify.error("Failed to remove NMRA-approved item");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Card className="overflow-hidden border-border/70 shadow-xs">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-emerald-600" />
          NMRA-approved items
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Only item codes in this list show “NMRA approved” on Cosmo stickers.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {canEdit ? (
          <form onSubmit={handleAdd} className="flex max-w-md gap-2">
            <Input
              value={itemCode}
              onChange={(event) => setItemCode(event.target.value)}
              placeholder="Item code, e.g. CB004_1"
              maxLength={100}
              disabled={busyKey !== null}
              className="uppercase"
            />
            <Button type="submit" disabled={busyKey !== null || !itemCode.trim()}>
              {busyKey === "add" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="size-4" aria-hidden />
              )}
              Add
            </Button>
          </form>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading...
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No NMRA-approved items.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-md border border-emerald-600/30 bg-emerald-500/10 px-2.5 py-1.5 font-mono text-sm"
              >
                {item.itemCode}
                {canEdit ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-6 text-muted-foreground hover:text-destructive"
                    disabled={busyKey !== null}
                    onClick={() => void handleRemove(item)}
                    aria-label={`Remove ${item.itemCode}`}
                  >
                    {busyKey === item.id ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="size-3.5" aria-hidden />
                    )}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
