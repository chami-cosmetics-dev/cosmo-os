"use client";

import { Check, X } from "lucide-react";

import {
  getPasswordRequirements,
  getPasswordStrengthScore,
  PASSWORD_REQUIREMENTS,
} from "@/lib/password-strength";
import { cn } from "@/lib/utils";

interface PasswordStrengthIndicatorProps {
  password: string;
  className?: string;
  /** Show only the bar, not the requirement hints */
  compact?: boolean;
}

const STRENGTH_LABELS = ["Weak", "Fair", "Good", "Strong"] as const;

export function PasswordStrengthIndicator({
  password,
  className,
  compact = false,
}: PasswordStrengthIndicatorProps) {
  const requirements = getPasswordRequirements(password);
  const score = getPasswordStrengthScore(password);
  const requiredReqs = requirements.slice(0, 4);
  const optionalReq = requirements[4];

  if (!password) {
    return (
      <div className={cn("space-y-2", className)}>
        <p className="text-muted-foreground text-xs">
          Password must include:
        </p>
        <ul className="space-y-1 text-muted-foreground text-xs">
          {requiredReqs.map((r) => (
            <li key={r.key} className="flex items-center gap-2">
              <X className="size-3 shrink-0 opacity-50" />
              {r.label}
            </li>
          ))}
          <li className="flex items-center gap-2 text-muted-foreground/80">
            <span className="size-3 shrink-0" aria-hidden />
            {optionalReq.label}
          </li>
        </ul>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-0.5" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={4} aria-label={`Password strength: ${STRENGTH_LABELS[Math.min(score, 3)]}`}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i < score
                  ? score <= 1
                    ? "bg-destructive"
                    : score <= 2
                      ? "bg-amber-500"
                      : score <= 3
                        ? "bg-lime-500"
                        : "bg-green-600"
                  : "bg-muted"
              )}
            />
          ))}
        </div>
        <span
          className={cn(
            "shrink-0 text-xs font-medium",
            score <= 1 && "text-destructive",
            score === 2 && "text-amber-600",
            score === 3 && "text-lime-600",
            score >= 4 && "text-green-600"
          )}
        >
          {STRENGTH_LABELS[Math.min(score, 3)]}
        </span>
      </div>

      {!compact && (
        <ul className="space-y-1 text-xs">
          {requiredReqs.map((r) => (
            <li
              key={r.key}
              className={cn(
                "flex items-center gap-2",
                r.met ? "text-green-600" : "text-muted-foreground"
              )}
            >
              {r.met ? (
                <Check className="size-3 shrink-0" aria-hidden />
              ) : (
                <X className="size-3 shrink-0 opacity-50" aria-hidden />
              )}
              {r.label}
            </li>
          ))}
          <li
            className={cn(
              "flex items-center gap-2",
              optionalReq.met ? "text-green-600" : "text-muted-foreground/80"
            )}
          >
            {optionalReq.met ? (
              <Check className="size-3 shrink-0" aria-hidden />
            ) : (
              <span className="size-3 shrink-0" aria-hidden />
            )}
            {optionalReq.label}
          </li>
        </ul>
      )}

      {password.length > PASSWORD_REQUIREMENTS.maxLength && (
        <p className="text-destructive text-xs">
          Password must be at most {PASSWORD_REQUIREMENTS.maxLength} characters
        </p>
      )}
    </div>
  );
}
