"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { LIMITS } from "@/lib/validation";

type StaffMember = {
  id: string;
  name: string | null;
  email: string | null;
  knownName: string | null;
  employeeProfile: {
    employeeNumber: string | null;
    department: { name: string } | null;
    designation: { name: string } | null;
    location: { name: string } | null;
  } | null;
};

interface ResignationFormProps {
  member: StaffMember;
  onSuccess: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

function formatDateForInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function ResignationForm({
  member,
  onSuccess,
  onCancel,
  disabled = false,
}: ResignationFormProps) {
  const [resignedAt, setResignedAt] = useState(formatDateForInput(new Date()));
  const [reason, setReason] = useState("");
  const [offboardingAcknowledged, setOffboardingAcknowledged] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!offboardingAcknowledged || disabled || isBusy) return;

    setBusyKey("submit");
    try {
      const res = await fetch(`/api/admin/staff/${member.id}/resign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resignedAt: resignedAt.trim() || undefined,
          reason: reason.trim() || undefined,
          offboardingAcknowledged: true,
        }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to process resignation");
        return;
      }

      notify.success("Staff member marked as resigned.");
      onSuccess();
    } catch {
      notify.error("Failed to process resignation");
    } finally {
      setBusyKey(null);
    }
  }

  const staffName = member.knownName ?? member.name ?? member.email ?? "Staff member";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Mark <strong>{staffName}</strong> as resigned. They will lose access to the system.
      </p>

      <div className="space-y-2">
        <label htmlFor="resign-date" className="text-sm font-medium">
          Resignation date
        </label>
        <Input
          id="resign-date"
          type="date"
          value={resignedAt}
          onChange={(e) => setResignedAt(e.target.value)}
          disabled={disabled || isBusy}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="resign-reason" className="text-sm font-medium">
          Reason <span className="text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="resign-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={disabled || isBusy}
          placeholder="e.g. Personal reasons, career change..."
          maxLength={LIMITS.resignationReason.max}
          rows={3}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="flex items-start gap-2">
        <input
          id="resign-acknowledge"
          type="checkbox"
          checked={offboardingAcknowledged}
          onChange={(e) => setOffboardingAcknowledged(e.target.checked)}
          disabled={disabled || isBusy}
          className="mt-1 size-4 rounded border-input"
        />
        <label htmlFor="resign-acknowledge" className="text-sm leading-tight">
          I confirm the offboarding process is complete
        </label>
      </div>

      <div className="flex gap-2">
        <Button
          type="submit"
          variant="destructive"
          disabled={!offboardingAcknowledged || disabled || isBusy}
        >
          {busyKey === "submit" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Processing...
            </>
          ) : (
            "Confirm resignation"
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={disabled || isBusy}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
