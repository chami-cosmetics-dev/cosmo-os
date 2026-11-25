"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";

import { SELECT_CLASS } from "@/components/organisms/sales-budget-table-ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { WEEKDAY_LABELS } from "@/lib/discontinued-items/active-again";
import { formatAppDateTimeShort } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";

const API = "/api/admin/discontinued-items/active-again-settings";

type Settings = {
  weekday: number;
  time: string;
  label: string;
  lastRunWeek: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  templateName: string;
};

/** Manager: day / time of the weekly "active again" mail (recipients are on the Email Template). */
export function ItemDraftingActiveAgainSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [open, setOpen] = useState(false);
  const [weekday, setWeekday] = useState(1);
  const [time, setTime] = useState("09:30");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(API, { cache: "no-store" });
        if (res.ok && active) setSettings((await res.json()) as Settings);
      } catch {
        // The button still opens the dialog with the defaults.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function openDialog() {
    setWeekday(settings?.weekday ?? 1);
    setTime(settings?.time ?? "09:30");
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekday, time }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to save");
      setSettings(body as Settings);
      setOpen(false);
      notify.success(`"Active again" mail: ${body.label}.`);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={openDialog} title="Weekly mail of drafted items that became active again">
        <CalendarClock className="mr-2 h-4 w-4" aria-hidden />
        Active-again mail{settings ? `: ${settings.label}` : ""}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Weekly &quot;active again&quot; mail</DialogTitle>
            <DialogDescription>
              Once a week, every done item (drafted and verified) is checked in Shopify (read only). Items
              that are active again are mailed once; no mail when there are none.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Day</span>
              <select
                className={SELECT_CLASS}
                value={weekday}
                onChange={(e) => setWeekday(Number(e.target.value))}
              >
                {WEEKDAY_LABELS.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Time (Sri Lanka)</span>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9" />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Recipients (To / CC): Settings → Email Templates → <strong>{settings?.templateName ?? "Drafted items that became active again"}</strong>.
            Nothing is sent until a To address is added there.
          </p>
          {settings?.updatedAt && (
            <p className="text-xs text-muted-foreground">
              Last changed by {settings.updatedBy ?? "-"}, {formatAppDateTimeShort(settings.updatedAt)}.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving || !/^\d{2}:\d{2}$/.test(time)}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
