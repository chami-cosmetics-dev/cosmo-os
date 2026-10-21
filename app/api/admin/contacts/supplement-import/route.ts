import { NextResponse } from "next/server";

import {
  SupplementImportError,
  importSupplementPurchases,
} from "@/lib/vault-supplement-import/import-run";
import { readUploadedXlsx, requireSupplementStaff } from "@/lib/vault-supplement-import/http";

export const maxDuration = 300;

export async function POST(request: Request) {
  const access = await requireSupplementStaff();
  if (!access.ok) return access.response;

  const uploaded = await readUploadedXlsx(request);
  if (!uploaded.ok) return uploaded.response;

  try {
    const summary = await importSupplementPurchases({
      companyId: access.companyId,
      file: uploaded.file,
    });
    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof SupplementImportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Supplement import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
