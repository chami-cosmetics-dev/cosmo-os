"use client";

import { useState, useEffect } from "react";
import { ChevronsUpDown, Loader2, Package } from "lucide-react";

import { useFulfillmentPermissions } from "@/components/contexts/fulfillment-permissions-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import type { FulfillmentOrder } from "./fulfillment-order-selector";

interface FulfillmentSampleFreeIssuePanelProps {
  orderId: string | null;
  order: FulfillmentOrder | null;
  onRefresh: (clearSelection?: boolean) => void;
}

export function FulfillmentSampleFreeIssuePanel({
  orderId,
  order,
  onRefresh,
}: FulfillmentSampleFreeIssuePanelProps) {
  const perms = useFulfillmentPermissions();
  const [lookups, setLookups] = useState<{
    samplesFreeIssues: Array<{ id: string; name: string; type: string }>;
  } | null>(null);
  const [selectedSamples, setSelectedSamples] = useState<Array<{ id: string; qty: number }>>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const isBusy = busyKey !== null;

  useEffect(() => {
    fetch("/api/admin/orders/fulfillment-lookups")
      .then((r) => r.json())
      .then((data) => setLookups(data))
      .catch(() => setLookups(null));
  }, []);

  async function doAction(action: string, body?: Record<string, unknown>) {
    if (!orderId) return;
    setBusyKey(action);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? { action }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Action failed");
        return;
      }
      notify.success("Updated.");
      setSelectedSamples([]);
      onRefresh(action === "add_samples" ? false : true);
    } catch {
      notify.error("Action failed");
    } finally {
      setBusyKey(null);
    }
  }

  if (!orderId || !order) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="size-5" />
          Sample / Free Issue — Order {order.name ?? order.orderNumber ?? order.id}
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          Add samples or free issues. No print option here.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {lookups && perms.canManageSampleFreeIssue && (
          <>
            <div className="flex flex-wrap gap-2">
              <Popover open={addOpen} onOpenChange={setAddOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={addOpen}
                    className="w-[240px] justify-between"
                  >
                    Add item
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[240px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search samples..." />
                    <CommandList>
                      <CommandEmpty>No item found.</CommandEmpty>
                      <CommandGroup>
                        {lookups.samplesFreeIssues.map((item) => (
                          <CommandItem
                            key={item.id}
                            value={`${item.name} ${item.type}`}
                            onSelect={() => {
                              if (!selectedSamples.some((x) => x.id === item.id)) {
                                setSelectedSamples((prev) => [...prev, { id: item.id, qty: 1 }]);
                              }
                              setAddOpen(false);
                            }}
                            disabled={selectedSamples.some((x) => x.id === item.id)}
                          >
                            {item.name} ({item.type})
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedSamples.map((s) => (
                <div key={s.id} className="flex items-center gap-1">
                  <span className="text-sm">
                    {lookups.samplesFreeIssues.find((x) => x.id === s.id)?.name} ×
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    value={s.qty}
                    onChange={(e) =>
                      setSelectedSamples((prev) =>
                        prev.map((x) =>
                          x.id === s.id ? { ...x, qty: parseInt(e.target.value, 10) || 1 } : x
                        )
                      )
                    }
                    className="w-14"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setSelectedSamples((prev) => prev.filter((x) => x.id !== s.id))
                    }
                  >
                    ×
                  </Button>
                </div>
              ))}
              {selectedSamples.length > 0 && (
                <Button
                  onClick={() =>
                    doAction("add_samples", {
                      action: "add_samples",
                      samples: selectedSamples.map((s) => ({
                        sampleFreeIssueItemId: s.id,
                        quantity: s.qty,
                      })),
                    })
                  }
                  disabled={isBusy}
                >
                  {busyKey === "add_samples" ? <Loader2 className="size-4 animate-spin" /> : "Add"}
                </Button>
              )}
            </div>
            <div className="flex items-center justify-between border-t pt-4">
              <p className="text-muted-foreground text-sm">
                Done with samples? Move order to next stage.
              </p>
              <Button
                variant="outline"
                onClick={() => doAction("advance_to_print")}
                disabled={isBusy}
              >
                {busyKey === "advance_to_print" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Finish Samples & Extras"
                )}
              </Button>
            </div>
          </>
        )}
        {lookups && !perms.canManageSampleFreeIssue && (
          <p className="text-muted-foreground text-sm">
            You do not have permission to add samples or advance orders.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
