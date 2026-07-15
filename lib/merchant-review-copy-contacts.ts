import type { MerchantReviewStatus } from "@/lib/merchant-order-reviews";

export type CopyContactQueueRow = {
  orderId: string;
  customerPhone: string | null;
  reviewStatus: MerchantReviewStatus;
};

export type CopyContactSkipCounts = {
  missingPhone: number;
  terminalStatus: number;
};

export type CopyContactBatch = {
  clipboardText: string;
  clipboardPhones: string[];
  /** Order IDs with phone that are pending — sent to bulk mark API */
  markOrderIds: string[];
  /** Order IDs included on clipboard (pending + follow_up with phone) */
  clipboardOrderIds: string[];
  skips: CopyContactSkipCounts;
};

const TERMINAL_STATUSES = new Set<MerchantReviewStatus>(["reviewed", "no_response"]);

function trimPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Build clipboard text and mark-candidate IDs from the current filtered queue.
 * - Clipboard: pending + follow_up with a usable phone (one line per order)
 * - Mark: pending subset of clipboard candidates only
 * - Terminal reviewed/no_response never contribute phones or mark IDs
 */
export function buildCopyContactBatch(rows: CopyContactQueueRow[]): CopyContactBatch {
  const clipboardPhones: string[] = [];
  const clipboardOrderIds: string[] = [];
  const markOrderIds: string[] = [];
  const skips: CopyContactSkipCounts = {
    missingPhone: 0,
    terminalStatus: 0,
  };

  for (const row of rows) {
    if (TERMINAL_STATUSES.has(row.reviewStatus)) {
      skips.terminalStatus += 1;
      continue;
    }

    if (row.reviewStatus !== "pending" && row.reviewStatus !== "follow_up") {
      skips.terminalStatus += 1;
      continue;
    }

    const phone = trimPhone(row.customerPhone);
    if (!phone) {
      skips.missingPhone += 1;
      continue;
    }

    clipboardPhones.push(phone);
    clipboardOrderIds.push(row.orderId);

    if (row.reviewStatus === "pending") {
      markOrderIds.push(row.orderId);
    }
  }

  return {
    clipboardText: clipboardPhones.join("\n"),
    clipboardPhones,
    markOrderIds,
    clipboardOrderIds,
    skips,
  };
}

export function formatCopyContactToastSummary(input: {
  copied: number;
  updated: number;
  skips: CopyContactSkipCounts;
  alreadyFollowUp?: number;
  notFound?: number;
}): string {
  const parts = [`Copied ${input.copied} number(s)`, `marked ${input.updated} Follow up`];
  if (input.alreadyFollowUp && input.alreadyFollowUp > 0) {
    parts.push(`${input.alreadyFollowUp} already Follow up`);
  }
  if (input.skips.missingPhone > 0) {
    parts.push(`${input.skips.missingPhone} skipped (no phone)`);
  }
  if (input.skips.terminalStatus > 0) {
    parts.push(`${input.skips.terminalStatus} skipped (reviewed/no response)`);
  }
  if (input.notFound && input.notFound > 0) {
    parts.push(`${input.notFound} not found`);
  }
  return `${parts.join("; ")}.`;
}
