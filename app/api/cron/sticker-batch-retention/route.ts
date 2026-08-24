import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getStickerBatchRetentionCutoff } from "@/lib/sticker-batch-retention";

export const maxDuration = 60;

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = getStickerBatchRetentionCutoff();
  const result = await prisma.stickerBatch.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  return NextResponse.json({
    deletedBatches: result.count,
    cutoff: cutoff.toISOString(),
  });
}
