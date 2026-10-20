"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { ShopRequestLines } from "@/components/organisms/shop-request-lines";
import { Button } from "@/components/ui/button";
import type { ShopRequestView } from "@/lib/material-transfer/shop-item-request";
import { notify } from "@/lib/notify";

type StatusFilter = "pending" | "done";

export function MaterialTransferRequestQueue() {
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [rows, setRows] = useState<ShopRequestView[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<"load" | string | null>("load");
  const isBusy = busyKey !== null;

  const load = useCallback(async (next: StatusFilter) => {
    setBusyKey("load");
    try {
      const res = await fetch(`/api/admin/store/material-transfer/shop-requests?status=${next}&scope=all`);
      const json = (await res.json()) as { requests?: ShopRequestView[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Could not load requests");
      setRows(json.requests ?? []);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not load requests");
    } finally {
      setBusyKey(null);
    }
  }, []);

  useEffect(() => {
    void load(status);
  }, [load, status]);

  async function markDone(id: string) {
    if (isBusy) return;
    setBusyKey(id);
    try {
      const res = await fetch(`/api/admin/store/material-transfer/shop-requests/${id}/done`, { method: "POST" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not mark the request done");
      notify.success("Request marked done");
      await load(status);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not mark the request done");
      await load(status);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button type="button" variant={status === "pending" ? "default" : "outline"} disabled={isBusy} onClick={() => setStatus("pending")}>
          Pending
        </Button>
        <Button type="button" variant={status === "done" ? "default" : "outline"} disabled={isBusy} onClick={() => setStatus("done")}>
          Done
        </Button>
      </div>
      {busyKey === "load" ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="animate-spin" aria-hidden />
          Loading...
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No {status} requests.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((request) => (
            <li key={request.id} className="rounded-md border p-3">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setOpenId(openId === request.id ? null : request.id)}
              >
                <span className="font-medium">{request.createdByName ?? "Unknown"}</span>
                <span className="text-muted-foreground"> · {request.outletName}</span>
                <span className="text-muted-foreground"> · {new Date(request.createdAt).toLocaleString()}</span>
              </button>
              {openId === request.id ? (
                <div className="mt-2 flex flex-col gap-2">
                  <ShopRequestLines lines={request.lines} />
                  {request.status === "pending" ? (
                    <Button type="button" disabled={isBusy} onClick={() => void markDone(request.id)}>
                      {busyKey === request.id ? (
                        <>
                          <Loader2 className="animate-spin" aria-hidden />
                          Marking...
                        </>
                      ) : (
                        "Mark done"
                      )}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
