"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notify } from "@/lib/notify";
import {
  PRIORITY_WAREHOUSE_SLOTS,
  type PriorityWarehouseSlot,
  type WarehousePriority,
} from "@/lib/order-availability/types";

const NONE = "__none";

type WarehouseOption = { name: string; company: string };

type Payload = {
  warehouses?: WarehouseOption[];
  slots?: PriorityWarehouseSlot[];
  error?: string;
};

function emptySlots(): PriorityWarehouseSlot[] {
  return PRIORITY_WAREHOUSE_SLOTS.map((priority) => ({
    priority,
    warehouse: null,
    company: null,
  }));
}

function labelWarehouse(row: WarehouseOption): string {
  return row.company ? `${row.name} · ${row.company}` : row.name;
}

export function OrderAvailabilityPriorityEditor() {
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [slots, setSlots] = useState<PriorityWarehouseSlot[]>(emptySlots);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>("load");
  const isBusy = busyKey !== null;

  function applyPayload(data: Payload) {
    const nextWarehouses = data.warehouses ?? [];
    const nextSlots = data.slots?.length === PRIORITY_WAREHOUSE_SLOTS.length ? data.slots : emptySlots();
    setWarehouses(nextWarehouses);
    setSlots(nextSlots);
    setLoadError(data.error ?? null);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBusyKey("load");
      try {
        const res = await fetch("/api/admin/products/order-availability/priority-warehouses");
        const data = (await res.json()) as Payload;
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Failed to load warehouses");
        applyPayload(data);
      } catch (error) {
        if (cancelled) return;
        notify.error(error instanceof Error ? error.message : "Failed to load warehouses");
      } finally {
        if (!cancelled) setBusyKey(null);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function setSlot(priority: WarehousePriority, warehouse: string | null) {
    const company = warehouse ? (warehouses.find((row) => row.name === warehouse)?.company ?? null) : null;
    setSlots((current) =>
      current.map((slot) => (slot.priority === priority ? { ...slot, warehouse, company } : slot)),
    );
  }

  async function save() {
    setBusyKey("save");
    try {
      const res = await fetch("/api/admin/products/order-availability/priority-warehouses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slots: slots.map((slot) => ({ priority: slot.priority, warehouse: slot.warehouse })),
        }),
      });
      const data = (await res.json()) as Payload;
      if (!res.ok) throw new Error(data.error ?? "Could not save priority warehouses");
      applyPayload(data);
      notify.success("Priority warehouses saved.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not save priority warehouses");
    } finally {
      setBusyKey(null);
    }
  }

  const options = [...warehouses];
  for (const slot of slots) {
    if (slot.warehouse && !options.some((row) => row.name === slot.warehouse)) {
      options.push({ name: slot.warehouse, company: slot.company ?? "" });
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Priority warehouses</CardTitle>
        <CardDescription>
          Pin up to 4 ERP2 main warehouses. They rank first in search results and skip the monthly cap.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {PRIORITY_WAREHOUSE_SLOTS.map((priority) => {
          const current = slots.find((slot) => slot.priority === priority)?.warehouse ?? null;
          return (
            <div key={priority} className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor={`priority-warehouse-${priority}`}>
                Priority {priority}
              </label>
              <Select
                value={current ?? NONE}
                onValueChange={(value) => setSlot(priority, value === NONE ? null : value)}
                disabled={isBusy}
              >
                <SelectTrigger id={`priority-warehouse-${priority}`} className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {options.map((row) => (
                    <SelectItem
                      key={row.name}
                      value={row.name}
                      disabled={Boolean(row.name !== current && slots.some((slot) => slot.warehouse === row.name))}
                    >
                      {labelWarehouse(row)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
        {loadError ? <p className="text-destructive text-sm">{loadError}</p> : null}
        <Button type="button" onClick={() => void save()} disabled={isBusy}>
          {busyKey === "save" ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Saving...
            </>
          ) : busyKey === "load" ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Loading...
            </>
          ) : (
            "Save"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
