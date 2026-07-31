"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

type RiderPaydaySettingsFormProps = {
  canEdit: boolean;
  initialPaydayDayOfMonth?: number | null;
};

export function RiderPaydaySettingsForm({
  canEdit,
  initialPaydayDayOfMonth = null,
}: RiderPaydaySettingsFormProps) {
  const [paydayDayOfMonth, setPaydayDayOfMonth] = useState<string>(
    initialPaydayDayOfMonth != null ? String(initialPaydayDayOfMonth) : ""
  );
  const [savedValue, setSavedValue] = useState<number | null>(initialPaydayDayOfMonth);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const isBusy = busyKey !== null;

  useEffect(() => {
    setPaydayDayOfMonth(initialPaydayDayOfMonth != null ? String(initialPaydayDayOfMonth) : "");
    setSavedValue(initialPaydayDayOfMonth);
  }, [initialPaydayDayOfMonth]);

  const parsedInput =
    paydayDayOfMonth.trim() === "" ? null : Number.parseInt(paydayDayOfMonth.trim(), 10);
  const hasChanges =
    (parsedInput === null && savedValue !== null) ||
    (parsedInput !== null && parsedInput !== savedValue);

  async function handleSave() {
    if (!canEdit) return;

    if (parsedInput !== null && (Number.isNaN(parsedInput) || parsedInput < 1 || parsedInput > 31)) {
      notify.error("Payday must be a day from 1 to 31, or empty to clear.");
      return;
    }

    setBusyKey("save-payday");
    try {
      const res = await fetch("/api/admin/settings/rider-payday", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paydayDayOfMonth: parsedInput }),
      });
      const data = (await res.json()) as { paydayDayOfMonth?: number | null; error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to save payday");
        return;
      }
      const next = data.paydayDayOfMonth ?? null;
      setSavedValue(next);
      setPaydayDayOfMonth(next != null ? String(next) : "");
      notify.success(
        next != null
          ? `Rider payday set to day ${next} (all companies).`
          : "Rider payday cleared."
      );
    } catch {
      notify.error("Failed to save payday");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
          Rider payday
        </CardTitle>
        <CardDescription>
          One day of the month for all companies. Pay periods run from that day through the day
          before the next payday. Use 1–31; shorter months use that month’s last day (e.g. 31 in
          February → 28/29).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="space-y-2 flex-1 max-w-xs">
          <label htmlFor="rider-payday-day" className="text-sm font-medium">
            Day of month
          </label>
          <Input
            id="rider-payday-day"
            type="number"
            min={1}
            max={31}
            placeholder="e.g. 25"
            value={paydayDayOfMonth}
            disabled={!canEdit || isBusy}
            onChange={(e) => setPaydayDayOfMonth(e.target.value)}
          />
        </div>
        {canEdit ? (
          <Button disabled={isBusy || !hasChanges} onClick={() => void handleSave()}>
            {busyKey === "save-payday" ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Saving...
              </>
            ) : (
              <>
                <Save aria-hidden />
                Save payday
              </>
            )}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
