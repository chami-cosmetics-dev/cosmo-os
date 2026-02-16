"use client";

import { useState } from "react";
import { Loader2, Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordStrengthIndicator } from "@/components/molecules/password-strength-indicator";
import { notify } from "@/lib/notify";
import { isPasswordStrong } from "@/lib/password-strength";
import { LIMITS } from "@/lib/validation";

interface PasswordChangeFormProps {
  onSuccess?: () => void;
}

export function PasswordChangeForm({ onSuccess }: PasswordChangeFormProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;
  const newPasswordStrong = isPasswordStrong(newPassword);
  const canSubmit =
    currentPassword.length > 0 &&
    newPasswordStrong &&
    newPassword === confirmPassword &&
    currentPassword !== newPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      notify.error("Passwords do not match");
      return;
    }

    if (currentPassword === newPassword) {
      notify.error("New password must be different from current password");
      return;
    }

    setBusyKey("change");
    try {
      const res = await fetch("/api/profile/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to change password");
        return;
      }

      notify.success("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onSuccess?.();
    } catch {
      notify.error("Failed to change password");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="space-y-2">
        <label
          htmlFor="current-password"
          className="text-sm font-medium"
        >
          Current password
        </label>
        <div className="relative">
          <Input
            id="current-password"
            type={showCurrent ? "text" : "password"}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={isBusy}
            required
            maxLength={LIMITS.password.max}
            autoComplete="current-password"
            placeholder="Enter your current password"
            className="pr-9"
          />
          <button
            type="button"
            onClick={() => setShowCurrent((v) => !v)}
            disabled={isBusy}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
            aria-label={showCurrent ? "Hide password" : "Show password"}
          >
            {showCurrent ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <label htmlFor="new-password" className="text-sm font-medium">
          New password
        </label>
        <div className="relative">
          <Input
            id="new-password"
            type={showNew ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={isBusy}
            required
            minLength={LIMITS.password.min}
            maxLength={LIMITS.password.max}
            autoComplete="new-password"
            placeholder="Create a strong password"
            className="pr-9"
          />
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            disabled={isBusy}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
            aria-label={showNew ? "Hide password" : "Show password"}
          >
            {showNew ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
        <PasswordStrengthIndicator password={newPassword} />
      </div>
      <div className="space-y-2">
        <label
          htmlFor="confirm-password"
          className="text-sm font-medium"
        >
          Confirm new password
        </label>
        <div className="relative">
          <Input
            id="confirm-password"
            type={showConfirm ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isBusy}
            required
            minLength={LIMITS.password.min}
            maxLength={LIMITS.password.max}
            autoComplete="new-password"
            placeholder="Re-enter your new password"
            className="pr-9"
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            disabled={isBusy}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
            aria-label={showConfirm ? "Hide password" : "Show password"}
          >
            {showConfirm ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
      </div>
      <Button type="submit" disabled={isBusy || !canSubmit} variant="secondary">
        {busyKey === "change" ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Changing...
          </>
        ) : (
          "Change password"
        )}
      </Button>
    </form>
  );
}
