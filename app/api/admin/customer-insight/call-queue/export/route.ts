import { NextRequest, NextResponse } from "next/server";

import { buildCallQueueAssignmentsWorkbook } from "@/lib/customer-insight/call-queue-export";
import { hasInsightAdminView } from "@/lib/customer-insight/ownership";
import { requirePermission } from "@/lib/rbac";
import { customerInsightCallQueueExportQuerySchema } from "@/lib/validation/customer-insight";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("contacts.insight.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const roleNames = (auth.context!.roleNames as string[]) ?? [];
  const permissionKeys = (auth.context!.permissionKeys as string[]) ?? [];
  if (!hasInsightAdminView({ roleNames, permissionKeys })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const parsed = customerInsightCallQueueExportQuerySchema.safeParse({
    assignedMerchant: request.nextUrl.searchParams.get("assignedMerchant") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { buffer, filename } = await buildCallQueueAssignmentsWorkbook({
    companyId,
    assignedMerchant: parsed.data.assignedMerchant,
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
