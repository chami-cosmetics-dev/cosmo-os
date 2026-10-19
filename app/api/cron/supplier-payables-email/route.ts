import { NextRequest, NextResponse } from "next/server";

import { SUPPLIER_PAYABLE_OUTSTANDING_DAILY_KEY } from "@/lib/email-templates/catalog";
import { runSupplierPayablesDailyEmail } from "@/lib/supplier-payables-email";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
function authorized(request: NextRequest) { const secret = process.env.CRON_SECRET; return !secret ? process.env.NODE_ENV !== "production" : request.headers.get("authorization") === `Bearer ${secret}`; }
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const companies = await prisma.emailTemplate.findMany({ where: { key: SUPPLIER_PAYABLE_OUTSTANDING_DAILY_KEY, recipients: { not: "" } }, select: { companyId: true } });
  const results = [];
  for (const row of companies) { try { results.push({ companyId: row.companyId, status: await runSupplierPayablesDailyEmail(row.companyId) }); } catch (error) { results.push({ companyId: row.companyId, status: "failed", error: error instanceof Error ? error.message : String(error) }); } }
  return NextResponse.json({ ok: true, results });
}
