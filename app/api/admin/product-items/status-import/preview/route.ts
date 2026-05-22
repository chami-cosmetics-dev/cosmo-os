import { NextRequest, NextResponse } from "next/server";

import {
  buildProductItemStatusImportPreview,
  parseProductItemStatusImportFile,
} from "@/lib/product-item-status-import";
import { requirePermission } from "@/lib/rbac";

export async function POST(request: NextRequest) {
  const auth = await requirePermission("products.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Priority file is required" }, { status: 400 });
  }

  const filename = file.name.toLowerCase();
  if (!filename.endsWith(".xlsx") && !filename.endsWith(".xls") && !filename.endsWith(".csv")) {
    return NextResponse.json({ error: "Only XLSX, XLS, and CSV files are supported" }, { status: 400 });
  }

  try {
    const parsed = parseProductItemStatusImportFile(Buffer.from(await file.arrayBuffer()), file.name);
    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: "No usable SKU rows were found in the file" }, { status: 400 });
    }
    if (parsed.rows.length > 10000) {
      return NextResponse.json({ error: "Priority import row limit is 10,000 per upload" }, { status: 400 });
    }

    const preview = await buildProductItemStatusImportPreview(companyId, parsed.rows);
    return NextResponse.json({
      ...preview,
      totalRows: parsed.totalRows,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read priority file" },
      { status: 400 }
    );
  }
}
