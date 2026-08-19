"use client";

import { useEffect, useState } from "react";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { notify } from "@/lib/notify";

type RiderDeliveryChargesFormProps = {
  canEdit: boolean;
};

type SampleRow = {
  label: string;
  district: string | null;
  shippingAmount: string;
  riderDeliveryCharge: string;
};

export function RiderDeliveryChargesForm({ canEdit }: RiderDeliveryChargesFormProps) {
  const [count, setCount] = useState(0);
  const [sample, setSample] = useState<SampleRow[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const isBusy = busyKey !== null;

  async function reload() {
    try {
      const res = await fetch("/api/admin/settings/rider-delivery-charges");
      const data = (await res.json()) as {
        count?: number;
        sample?: SampleRow[];
        error?: string;
      };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to load rider delivery charges");
        return;
      }
      setCount(data.count ?? 0);
      setSample(data.sample ?? []);
    } catch {
      notify.error("Failed to load rider delivery charges");
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function handleUpload(file: File | null) {
    if (!canEdit || !file) return;
    setBusyKey("upload");
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/admin/settings/rider-delivery-charges", {
        method: "POST",
        body,
      });
      const data = (await res.json()) as {
        imported?: number;
        created?: number;
        updated?: number;
        skippedBlank?: number;
        error?: string;
        warnings?: string[];
      };
      if (!res.ok) {
        notify.error(data.error ?? "Upload failed");
        return;
      }
      const parts = [
        `Imported ${data.imported ?? 0}`,
        data.created != null ? `${data.created} created` : null,
        data.updated != null ? `${data.updated} updated` : null,
        data.skippedBlank != null ? `${data.skippedBlank} blank rider-charge rows skipped` : null,
      ].filter(Boolean);
      notify.success(`${parts.join(" · ")}. Labels not in the file were kept.`);
      if (data.warnings?.length) {
        notify.error(`${data.warnings.length} row warning(s) — check sheet amounts.`);
      }
      await reload();
    } catch {
      notify.error("Upload failed");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden />
          Rider delivery charges
        </CardTitle>
        <CardDescription>
          Upload the shipping rules Excel (Shipping Rule Label + Delivery Charges for riders). Blank
          rider-charge cells are skipped (non-rider areas). Upload upserts by label and keeps rules
          that are not in the file. Rider incentives match the rider charge column by shipping rule
          label — not the customer shipping amount when they differ.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Rules loaded: <span className="font-semibold text-foreground">{count}</span>
        </p>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild disabled={isBusy} variant="secondary">
              <label className="cursor-pointer">
                {busyKey === "upload" ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload aria-hidden />
                    Upload Excel
                  </>
                )}
                <input
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="sr-only"
                  disabled={isBusy}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    void handleUpload(file);
                  }}
                />
              </label>
            </Button>
            <p className="text-xs text-muted-foreground">Replaces all existing rules.</p>
          </div>
        ) : null}
        {sample.length > 0 ? (
          <div className="rounded-md border text-sm overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-2 font-medium">Label</th>
                  <th className="p-2 font-medium">District</th>
                  <th className="p-2 font-medium">Shipping</th>
                  <th className="p-2 font-medium">Rider pay</th>
                </tr>
              </thead>
              <tbody>
                {sample.map((row) => (
                  <tr key={row.label} className="border-t">
                    <td className="p-2">{row.label}</td>
                    <td className="p-2">{row.district ?? "—"}</td>
                    <td className="p-2">{row.shippingAmount}</td>
                    <td className="p-2 font-semibold">{row.riderDeliveryCharge}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {count > sample.length ? (
              <p className="p-2 text-xs text-muted-foreground border-t">
                Showing first {sample.length} of {count}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
