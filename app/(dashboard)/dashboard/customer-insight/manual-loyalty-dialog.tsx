"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

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
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

type Template = { id: string; label: string; seeded: boolean };

export function ManualLoyaltyDialog({
  open,
  onOpenChange,
  contactId,
  tiers,
  disabled,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  tiers: Array<"gold" | "platinum">;
  disabled?: boolean;
  onAssigned: () => Promise<void>;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tier, setTier] = useState<"gold" | "platinum" | "">("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTier(tiers[0] ?? "");
    setReason("");
    void (async () => {
      const res = await fetch("/api/admin/customer-insight/loyalty-reason-templates");
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        templates?: Template[];
      };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to load reasons.");
        return;
      }
      setTemplates(data.templates ?? []);
    })();
  }, [open, tiers]);

  async function save() {
    const chosenTier = tier === "gold" || tier === "platinum" ? tier : null;
    const text = reason.trim();
    if (!chosenTier || !text) {
      notify.error("Pick Gold or Platinum and enter a reason.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/customer-insight/contact/${encodeURIComponent(contactId)}/loyalty-override`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier: chosenTier, reason: text }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        peerError?: string | null;
        peerSynced?: boolean;
      };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to mark loyalty.");
        return;
      }
      if (data.peerSynced === false && data.peerError) {
        notify.error(`Saved here. Other OS template copy failed: ${data.peerError}`);
      } else {
        notify.success("Loyalty marked.");
      }
      onOpenChange(false);
      await onAssigned();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark loyalty</DialogTitle>
          <DialogDescription>
            Gold or Platinum for a contact who does not meet the spend limit. Reason
            is required.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {tiers.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={tier === option ? "default" : "outline"}
                disabled={saving || disabled}
                onClick={() => setTier(option)}
              >
                {option === "platinum" ? "Platinum" : "Gold"}
              </Button>
            ))}
          </div>
          {templates.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-muted-foreground text-xs">Saved reasons</p>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((row) => (
                  <Button
                    key={row.id}
                    type="button"
                    size="sm"
                    variant={reason === row.label ? "secondary" : "outline"}
                    className={cn("h-7 text-xs")}
                    disabled={saving || disabled}
                    onClick={() => setReason(row.label)}
                  >
                    {row.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (or type a new one)"
            maxLength={200}
            disabled={saving || disabled}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving || disabled || !tier || !reason.trim()}
            onClick={() => void save()}
          >
            {saving ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
