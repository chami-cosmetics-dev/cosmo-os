import type { MerchantPeerBand } from "@/lib/merchant-dashboard/motivation-types";

export type MerchantCheerBand = "start" | "halfway" | "almost" | "done" | "none";

export type { MerchantPeerBand };

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

/** Peer-relative copy — encourage / celebrate / nudge, never punitive. */
export function getMerchantPeerCheerMessage(
  band: MerchantPeerBand,
  displayName: string,
): string {
  const name = displayName.trim() || "Merchant";
  switch (band) {
    case "solo":
      return `You're flying solo, ${name} — set the pace and own the board.`;
    case "leader":
      return `You're #1 right now, ${name}! Keep the lead with every order.`;
    case "chasing":
      return `You're close to the top, ${name}. One strong push and you can take the lead.`;
    case "mid":
      return `Solid mid-pack pace, ${name}. Climb a few spots — you've got this.`;
    case "behind":
      return `Plenty of runway left, ${name}. Focus on the next win and climb the board.`;
    case "no_sales":
      return `Fresh start, ${name}. Your first sale today puts you on the board.`;
    default:
      return `Keep going, ${name} — every order moves you up.`;
  }
}
