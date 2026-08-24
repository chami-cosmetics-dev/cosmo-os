import { describe, expect, it } from "vitest";

import {
  getStickerBatchRetentionCutoff,
  STICKER_BATCH_RETENTION_DAYS,
} from "@/lib/sticker-batch-retention";

describe("sticker batch retention", () => {
  it("keeps a rolling three-day window", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    expect(STICKER_BATCH_RETENTION_DAYS).toBe(3);
    expect(getStickerBatchRetentionCutoff(now).toISOString()).toBe(
      "2026-08-21T12:00:00.000Z",
    );
  });
});
