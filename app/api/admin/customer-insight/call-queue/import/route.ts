import { NextRequest, NextResponse } from "next/server";

import { assignCallQueueFromPhones } from "@/lib/customer-insight/call-queue";
import { parseCallQueueImportPhones } from "@/lib/customer-insight/call-queue-import";
import { hasInsightAdminView } from "@/lib/customer-insight/ownership";
import { requirePermission } from "@/lib/rbac";
import { customerInsightCallQueueImportBodySchema } from "@/lib/validation/customer-insight";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
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
  const user = auth.context!.user;
  if (!companyId || !user) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const parsed = customerInsightCallQueueImportBodySchema.safeParse({
    assignedMerchant: formData.get("assignedMerchant"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No Excel file uploaded" }, { status: 400 });
  }

  const blob = file as File;
  const filename = blob.name || "import.xlsx";
  const lower = filename.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls") && !lower.endsWith(".csv")) {
    return NextResponse.json(
      { error: "Upload an .xlsx, .xls, or .csv file" },
      { status: 400 }
    );
  }

  if (typeof blob.size === "number" && blob.size > MAX_IMPORT_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await blob.arrayBuffer());
    const { phones, skippedBlank } = parseCallQueueImportPhones(buffer, filename);
    const result = await assignCallQueueFromPhones({
      companyId,
      merchantValue: parsed.data.assignedMerchant,
      phones,
      skippedBlank,
      assignedByUserId: user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import queue";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
