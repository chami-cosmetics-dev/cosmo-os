import { NextRequest, NextResponse } from "next/server";

import { importContactAllocations } from "@/lib/contacts/allocation-import";
import { requireAnyPermission } from "@/lib/rbac";

export async function POST(request: NextRequest) {
  const auth = await requireAnyPermission(["contacts.allocation.manage", "contacts.manage"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  const actorUserId = auth.context!.user?.id ?? null;
  if (!companyId || !actorUserId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: "Only CSV files are supported" }, { status: 400 });
  }

  try {
    const summary = await importContactAllocations({
      companyId,
      actorUserId,
      csvText: await file.text(),
      fileName: file.name,
    });
    return NextResponse.json({
      message: "Import completed",
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
