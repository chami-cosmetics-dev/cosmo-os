import { NextRequest, NextResponse } from "next/server";

import { resolveOsfColumns } from "@/lib/osf/column-config";
import { applyRopImport } from "@/lib/osf/rop-import";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";

export async function POST(request: NextRequest) {
  const auth = await requirePermission("purchasing.osf.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file upload (field: file)" }, { status: 400 });
  }

  const filename = file.name || "rop-import.xlsx";
  const buffer = Buffer.from(await file.arrayBuffer());
  const columns = await resolveOsfColumns(companyId);

  try {
    const result = await applyRopImport({
      companyId,
      buffer,
      filename,
      ropColumns: columns,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to import ROP file" },
      { status: 400 },
    );
  }
}
