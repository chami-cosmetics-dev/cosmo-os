import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { logReportDownload } from "@/lib/report-download-log";
import { CONTACT_DUMP_PARTS, type ContactDumpPartKey, buildContactDumpCsv } from "@/lib/reports/contact-dump";
import { getContactDumpPermission } from "@/lib/report-permissions";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function getRequestedPart(value: string | null): ContactDumpPartKey {
  if (!value) return "1";
  return value in CONTACT_DUMP_PARTS ? (value as ContactDumpPartKey) : "1";
}

export async function GET(request: NextRequest) {
  const part = getRequestedPart(request.nextUrl.searchParams.get("part"));
  const auth = await requirePermission(getContactDumpPermission(part));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const config = CONTACT_DUMP_PARTS[part];

  const contacts = await prisma.contactMaster.findMany({
    where: { companyId },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    skip: config.start,
    ...(part === "all" ? {} : { take: config.size }),
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      recentMerchant: true,
      lastPurchaseAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const csv = buildContactDumpCsv(contacts);
  const today = new Date().toISOString().slice(0, 10);
  const suffix = part === "all" ? "all" : part.replace("_", "-");
  const fileName = `contact-dump-${suffix}-${today}.csv`;

  await logReportDownload({
    companyId,
    userId: auth.context?.user?.id,
    reportKey: `contact-dump:${part}`,
    reportLabel: part === "all" ? "Contact Number List with details (All)" : `Contact Number List with details Part ${part}`,
    filters: `part=${part}`,
    fileName,
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
