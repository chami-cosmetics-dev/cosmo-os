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

type ZoneSampleRow = {
  zoneLabel: string;
  districtLabel: string;
};

type UploadResult = {
  imported?: number;
  created?: number;
  updated?: number;
  skippedBlank?: number;
  sheetName?: string;
  removedZoneChargeKeys?: number;
  error?: string;
  warnings?: string[];
};

type ZoneUploadResult = {
  imported?: number;
  skippedBlank?: number;
  sheetName?: string;
  error?: string;
  warnings?: string[];
};

export function RiderDeliveryChargesForm({ canEdit }: RiderDeliveryChargesFormProps) {
  const [count, setCount] = useState(0);
  const [sample, setSample] = useState<SampleRow[]>([]);
  const [zoneCount, setZoneCount] = useState(0);
  const [zoneSample, setZoneSample] = useState<ZoneSampleRow[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const isBusy = busyKey !== null;

  async function reloadCharges() {
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

  async function reloadZones() {
    try {
      const res = await fetch("/api/admin/settings/rider-delivery-zones");
      const data = (await res.json()) as {
        count?: number;
        sample?: ZoneSampleRow[];
        error?: string;
      };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to load zone districts map");
        return;
      }
      setZoneCount(data.count ?? 0);
      setZoneSample(data.sample ?? []);
    } catch {
      notify.error("Failed to load zone districts map");
    }
  }

  useEffect(() => {
    void reloadCharges();
    void reloadZones();
  }, []);

  async function handleChargeUpload(file: File | null) {
    if (!canEdit || !file) return;
    setBusyKey("charges");
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/admin/settings/rider-delivery-charges", {
        method: "POST",
        body,
      });
      const data = (await res.json()) as UploadResult;
      if (!res.ok) {
        notify.error(data.error ?? "Upload failed");
        return;
      }
      const parts = [
        `Imported ${data.imported ?? 0}`,
        data.created != null ? `${data.created} created` : null,
        data.updated != null ? `${data.updated} updated` : null,
        data.skippedBlank != null ? `${data.skippedBlank} blank rider-charge rows skipped` : null,
        data.removedZoneChargeKeys
          ? `${data.removedZoneChargeKeys} Zone A/B charge keys removed`
          : null,
        data.sheetName ? `sheet “${data.sheetName}”` : null,
      ].filter(Boolean);
      notify.success(`${parts.join(" · ")}. Labels not in the file were kept.`);
      if (data.warnings?.length) {
        notify.error(`${data.warnings.length} row warning(s) — check sheet amounts.`);
      }
      await reloadCharges();
    } catch {
      notify.error("Upload failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleZoneUpload(file: File | null) {
    if (!canEdit || !file) return;
    setBusyKey("zones");
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/admin/settings/rider-delivery-zones", {
        method: "POST",
        body,
      });
      const data = (await res.json()) as ZoneUploadResult;
      if (!res.ok) {
        notify.error(data.error ?? "Zone map upload failed");
        return;
      }
      const parts = [
        `Imported ${data.imported ?? 0} zone→city rows`,
        data.skippedBlank != null ? `${data.skippedBlank} blank rows skipped` : null,
        data.sheetName ? `sheet “${data.sheetName}”` : null,
      ].filter(Boolean);
      notify.success(`${parts.join(" · ")}. Replaced previous zone map.`);
      if (data.warnings?.length) {
        notify.error(`${data.warnings.length} row warning(s).`);
      }
      await reloadZones();
    } catch {
      notify.error("Zone map upload failed");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden />
            Rider delivery charges
          </CardTitle>
          <CardDescription>
            Upload <strong>Shipping Rule New</strong> Excel. Prefers the{" "}
            <strong>Final (2)</strong> sheet — Shipping Rule Label + Delivery Charges for riders.
            Zone A/B pay keys are removed on upload. Blank rider-charge cells are skipped. Upload
            upserts by label and keeps rules not in the file.
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
                  {busyKey === "charges" ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload aria-hidden />
                      Upload charge sheet
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
                      void handleChargeUpload(file);
                    }}
                  />
                </label>
              </Button>
              <p className="text-xs text-muted-foreground">
                Upserts by label; keeps rules not in file.
              </p>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden />
            Zone districts map
          </CardTitle>
          <CardDescription>
            Upload <strong>Riders Delivery charges- Updated</strong> Excel. Uses the{" "}
            <strong>Final Working</strong> sheet for Zone Name → City membership only. Amounts and
            Delivery Person Charges on that sheet are ignored — rider pay comes from the Shipping
            Rule sheet above. Shopify Zone A/B orders match via shipping city.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Zone→city rows: <span className="font-semibold text-foreground">{zoneCount}</span>
          </p>
          {canEdit ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild disabled={isBusy} variant="secondary">
                <label className="cursor-pointer">
                  {busyKey === "zones" ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload aria-hidden />
                      Upload zone map
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
                      void handleZoneUpload(file);
                    }}
                  />
                </label>
              </Button>
              <p className="text-xs text-muted-foreground">Full replace of zone membership table.</p>
            </div>
          ) : null}
          {zoneSample.length > 0 ? (
            <div className="rounded-md border text-sm overflow-x-auto">
              <table className="w-full min-w-[360px]">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-2 font-medium">Zone</th>
                    <th className="p-2 font-medium">City / district</th>
                  </tr>
                </thead>
                <tbody>
                  {zoneSample.map((row) => (
                    <tr key={`${row.zoneLabel}::${row.districtLabel}`} className="border-t">
                      <td className="p-2">{row.zoneLabel}</td>
                      <td className="p-2">{row.districtLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {zoneCount > zoneSample.length ? (
                <p className="p-2 text-xs text-muted-foreground border-t">
                  Showing first {zoneSample.length} of {zoneCount}
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
