export const STICKER_BATCH_RETENTION_DAYS = 3;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function getStickerBatchRetentionCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - STICKER_BATCH_RETENTION_DAYS * DAY_IN_MS);
}
