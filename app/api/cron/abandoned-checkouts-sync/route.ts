import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { syncAbandonedCheckoutsForCompany } from "@/lib/shopify-abandoned-checkouts";

export const dynamic = "force-dynamic";
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

  const companies = await prisma.companyLocation.findMany({
    where: {
      shopifyAdminStoreHandle: { not: null },
    },
    select: { companyId: true },
    distinct: ["companyId"],
  });

  let companiesProcessed = 0;
  let upserted = 0;
  let updated = 0;
  let recoveredDetected = 0;
  const errors: Array<{ companyId: string; error: string }> = [];

  for (const c of companies) {
    companiesProcessed += 1;
    try {
      const r = await syncAbandonedCheckoutsForCompany(c.companyId);
      upserted += r.upserted;
      updated += r.updated;
      recoveredDetected += r.recoveredDetected;
    } catch (e) {
      errors.push({
        companyId: c.companyId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    companiesProcessed,
    upserted,
    updated,
    recoveredDetected,
    errors,
  });
}

