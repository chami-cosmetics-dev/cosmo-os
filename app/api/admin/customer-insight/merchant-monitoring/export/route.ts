import { NextRequest, NextResponse } from "next/server";

import {
  buildMerchantMonitoringReport,
  MerchantMonitoringPeriodError,
} from "@/lib/customer-insight/merchant-monitoring";
import { generateMerchantMonitoringPdf } from "@/lib/customer-insight/merchant-monitoring-pdf";
import { hasInsightAdminView } from "@/lib/customer-insight/ownership";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { customerInsightMerchantMonitoringQuerySchema } from "@/lib/validation/customer-insight";

function queryParam(value: string | null): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed || undefined;
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("contacts.insight.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const roleNames = (auth.context!.roleNames as string[]) ?? [];
  const permissionKeys = (auth.context!.permissionKeys as string[]) ?? [];
  if (!hasInsightAdminView({ roleNames, permissionKeys })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const parsed = customerInsightMerchantMonitoringQuerySchema.safeParse({
    fromYmd: queryParam(sp.get("fromYmd")),
    toYmd: queryParam(sp.get("toYmd")),
    assignedMerchant: queryParam(sp.get("assignedMerchant")),
    preset: queryParam(sp.get("preset")),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const [report, company] = await Promise.all([
      buildMerchantMonitoringReport(companyId, parsed.data),
      prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      }),
    ]);
    const pdf = await generateMerchantMonitoringPdf(report, company?.name);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          'attachment; filename="insight-merchant-monitoring.pdf"',
      },
    });
  } catch (error) {
    if (error instanceof MerchantMonitoringPeriodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
