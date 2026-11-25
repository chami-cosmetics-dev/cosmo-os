import { NextRequest, NextResponse } from "next/server";

import { DISCONTINUED_ITEMS_PERMISSIONS } from "@/lib/discontinued-items/config";
import { PurchasingApprovalError } from "@/lib/discontinued-items/purchasing-approval.server";
import {
  removeSearchConsoleReport,
  saveSearchConsoleReport,
} from "@/lib/discontinued-items/shopify-draft.server";
import { hasPermission, requireUserContext } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Upload the Search Console Pages export (multipart field "file"). */
export async function POST(request: NextRequest) {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasPermission(auth.context, DISCONTINUED_ITEMS_PERMISSIONS.shopifyDraft)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  const companyId = auth.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach the Excel file." }, { status: 400 });

  try {
    const data = await saveSearchConsoleReport({
      companyId,
      fileName: file.name || "search-console.xlsx",
      bytes: await file.arrayBuffer(),
      userName: auth.user.name?.trim() || auth.user.email || "Unknown user",
    });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof PurchasingApprovalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Discontinued Items: Search Console upload failed:", error);
    return NextResponse.json({ error: "Failed to process the file" }, { status: 500 });
  }
}

/** Remove the uploaded report: Draft is disabled until a new one is uploaded. */
export async function DELETE() {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasPermission(auth.context, DISCONTINUED_ITEMS_PERMISSIONS.shopifyDraft)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  const companyId = auth.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }
  try {
    return NextResponse.json(await removeSearchConsoleReport(companyId));
  } catch (error) {
    console.error("Discontinued Items: removing the Search Console report failed:", error);
    return NextResponse.json({ error: "Failed to remove the report" }, { status: 500 });
  }
}
