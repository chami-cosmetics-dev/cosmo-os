"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatAppDateTime } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import type {
  NewItemRequestBrandGroup,
  NewItemRequestStatusValue,
  NewItemRequestView,
} from "@/lib/new-item-requests/types";

const FILTERS: { id: NewItemRequestStatusValue; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "already_have", label: "Already have" },
  { id: "closed", label: "Closed" },
];

function statusLabel(status: NewItemRequestStatusValue) {
  if (status === "already_have") return "Already have";
  if (status === "closed") return "Closed";
  return "Open";
}

type NewItemRequestBrandBoardProps = {
  initialBrands: NewItemRequestBrandGroup[];
};

export function NewItemRequestBrandBoard({ initialBrands }: NewItemRequestBrandBoardProps) {
  const [status, setStatus] = useState<NewItemRequestStatusValue>("open");
  const [brands, setBrands] = useState(initialBrands);
  const [activeBrand, setActiveBrand] = useState<string | null>(null);
  const [requests, setRequests] = useState<NewItemRequestView[]>([]);
  const [priorityCount, setPriorityCount] = useState<number | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const isBusy = busyKey !== null;

  async function loadBrands(nextStatus: NewItemRequestStatusValue) {
    const response = await fetch(`/api/new-item-requests?status=${nextStatus}`, { cache: "no-store" });
    const data = (await response.json()) as { brands?: NewItemRequestBrandGroup[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not load brands");
    setBrands(data.brands ?? []);
  }

  async function loadBrand(brandNormalized: string, nextStatus = status) {
    const response = await fetch(
      `/api/new-item-requests/brands/${encodeURIComponent(brandNormalized)}?status=${nextStatus}`,
      { cache: "no-store" },
    );
    const data = (await response.json()) as {
      brand?: NewItemRequestBrandGroup;
      requests?: NewItemRequestView[];
      error?: string;
    };
    if (!response.ok) throw new Error(data.error ?? "Could not load brand");
    setActiveBrand(brandNormalized);
    setRequests(data.requests ?? []);
  }

  async function loadPriorityMeta() {
    const response = await fetch("/api/new-item-requests/priority", { cache: "no-store" });
    const data = (await response.json()) as { count?: number; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not load priority list");
    setPriorityCount(data.count ?? 0);
  }

  useEffect(() => {
    void loadPriorityMeta().catch((error: unknown) => {
      notify.error(error instanceof Error ? error.message : "Could not load priority list");
    });
  }, []);

  async function changeFilter(nextStatus: NewItemRequestStatusValue) {
    try {
      setBusyKey("filter");
      setStatus(nextStatus);
      await loadBrands(nextStatus);
      if (activeBrand) await loadBrand(activeBrand, nextStatus);
      else setRequests([]);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not load requests");
    } finally {
      setBusyKey(null);
    }
  }

  async function markStatus(id: string, nextStatus: "already_have" | "closed") {
    try {
      setBusyKey(id);
      const response = await fetch(`/api/new-item-requests/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not update status");
      await loadBrands(status);
      if (activeBrand) await loadBrand(activeBrand, status);
      notify.success(nextStatus === "already_have" ? "Marked already have." : "Marked closed.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not update status");
      await loadBrands(status).catch(() => undefined);
    } finally {
      setBusyKey(null);
    }
  }

  async function uploadPriority(file: File) {
    try {
      setBusyKey("priority");
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/new-item-requests/priority", { method: "POST", body: form });
      const data = (await response.json()) as { count?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not upload priority file");
      setPriorityCount(data.count ?? 0);
      await loadBrands(status);
      if (activeBrand) await loadBrand(activeBrand, status);
      notify.success(`Saved ${data.count ?? 0} brand priorities.`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not upload priority file");
    } finally {
      setBusyKey(null);
    }
  }

  async function exportView() {
    try {
      setBusyKey("export");
      const params = new URLSearchParams({ status });
      if (activeBrand) params.set("brand", activeBrand);
      const response = await fetch(`/api/new-item-requests/export?${params.toString()}`);
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Could not export");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const match = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "");
      link.href = url;
      link.download = match?.[1] ?? `new-item-requests-${status}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not export");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Purchasing board</CardTitle>
        <CardDescription>Open demand grouped by brand. Already have is a status only.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((filter) => (
            <Button
              key={filter.id}
              type="button"
              size="sm"
              variant={status === filter.id ? "default" : "outline"}
              disabled={isBusy}
              onClick={() => void changeFilter(filter.id)}
            >
              {filter.label}
            </Button>
          ))}
          <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={() => void exportView()}>
            {busyKey === "export" ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Exporting...
              </>
            ) : (
              "Export"
            )}
          </Button>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="brand-priority-file">
            Brand priority file
          </label>
          <Input
            id="brand-priority-file"
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            disabled={isBusy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void uploadPriority(file);
            }}
          />
          <p className="text-muted-foreground text-xs">
            {priorityCount == null ? "Loading count..." : `${priorityCount} brands on the current list`}
          </p>
        </div>
        {brands.length === 0 ? (
          <p className="text-muted-foreground text-sm">No brands in this filter.</p>
        ) : (
          <ul className="space-y-2">
            {brands.map((brand) => (
              <li key={brand.brandNameNormalized}>
                <button
                  type="button"
                  className="hover:bg-secondary/30 w-full rounded-lg border px-3 py-2 text-left"
                  disabled={isBusy}
                  onClick={() => {
                    setBusyKey("brand");
                    void loadBrand(brand.brandNameNormalized)
                      .catch((error: unknown) => {
                        notify.error(error instanceof Error ? error.message : "Could not load brand");
                      })
                      .finally(() => setBusyKey(null));
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{brand.brandName}</span>
                    <span className="text-muted-foreground text-xs">{brand.requestCount} requests</span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {brand.isExisting ? "Existing" : "New"}
                    {brand.priority ? ` · ${brand.priority}` : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
        {requests.length > 0 ? (
          <ul className="space-y-3">
            {requests.map((row) => (
              <li key={row.id} className="space-y-2 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{row.createdByName ?? "Unknown"}</span>
                  <span className="text-muted-foreground text-xs">{formatAppDateTime(row.createdAt)}</span>
                </div>
                <p>{row.description}</p>
                <p className="text-muted-foreground text-xs">
                  {row.brandIsExisting ? "Existing at submit" : "New at submit"}
                  {row.priority ? ` · ${row.priority}` : ""}
                  {` · ${statusLabel(row.status)}`}
                </p>
                {row.storeUrl ? (
                  <a className="text-primary underline" href={row.storeUrl} target="_blank" rel="noreferrer">
                    Other-store link
                  </a>
                ) : null}
                {row.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.imageUrl} alt="" className="max-h-48 rounded-md" />
                ) : null}
                {row.status === "open" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => void markStatus(row.id, "already_have")}
                    >
                      {busyKey === row.id ? (
                        <>
                          <Loader2 className="animate-spin" aria-hidden />
                          Saving...
                        </>
                      ) : (
                        "Already have"
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isBusy}
                      onClick={() => void markStatus(row.id, "closed")}
                    >
                      Closed
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
