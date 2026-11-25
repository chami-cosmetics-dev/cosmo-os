import { NextRequest, NextResponse } from "next/server";

import { INVENTORY_AGEING_SUMMARY_DAILY_KEY } from "@/lib/email-templates/catalog";
import { runInventoryAgeingDailyEmail } from "@/lib/inventory-ageing-email";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return !secret ? process.env.NODE_ENV !== "production" : request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const companies = await prisma.emailTemplate.findMany({
    where: { key: INVENTORY_AGEING_SUMMARY_DAILY_KEY, recipients: { not: "" } },
    select: { companyId: true },
  });
  const results = [];
  for (const row of companies) {
    try {
      results.push({ companyId: row.companyId, status: await runInventoryAgeingDailyEmail(row.companyId) });
    } catch (error) {
      results.push({ companyId: row.companyId, status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }
  return NextResponse.json({ ok: true, results });
}
