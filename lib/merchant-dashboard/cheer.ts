export type MerchantCheerBand = "start" | "halfway" | "almost" | "done" | "none";

export function getMerchantTargetPercent(achieved: number, target: number): number | null {
  if (!Number.isFinite(target) || target <= 0) return null;
  if (!Number.isFinite(achieved) || achieved < 0) return 0;
  return Math.round((achieved / target) * 1000) / 10;
}

export function getMerchantCheerBand(percent: number | null): MerchantCheerBand {
  if (percent == null) return "none";
  if (percent >= 100) return "done";
  if (percent >= 80) return "almost";
  if (percent >= 50) return "halfway";
  return "start";
}

export function getMerchantCheerMessage(band: MerchantCheerBand, displayName: string): string {
  const name = displayName.trim() || "Merchant";
  switch (band) {
    case "done":
      return `Outstanding, ${name}! Target smashed — keep the momentum.`;
    case "almost":
      return `So close, ${name}! One more push and the target is yours.`;
    case "halfway":
      return `Strong pace, ${name}. You're over halfway — finish strong.`;
    case "start":
      return `Let's go, ${name}! Every order counts toward this month's target.`;
    default:
      return `Set a monthly target to track your progress, ${name}.`;
  }
}
