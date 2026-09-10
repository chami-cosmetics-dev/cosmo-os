import { NextRequest, NextResponse } from "next/server";

import {
  applyImportCommitToken,
  parseRawImportCsv,
  validateImportRows,
} from "@/lib/market-prices/import";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requirePermission("purchasing.market_prices.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  const userId = context?.user?.id;
  if (!companyId || !userId) {
    return NextResponse.json(
      { error: "No user or company associated with your account" },
      { status: 404 },
    );
  }

  const contentType = request.headers.get("content-type") || "";

  // 1. Commit Phase (commitToken provided via JSON)
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));

    if (body.commitToken) {
      try {
        const result = await applyImportCommitToken(
          companyId,
          userId,
          body.commitToken,
        );
        return NextResponse.json(result, { status: 200 });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to apply import";
        return NextResponse.json({ error: message }, { status: 409 });
      }
    }

    // JSON upload with "csv" text string
    if (body.csv) {
      const { records } = parseRawImportCsv(body.csv);
      const { preview } = await validateImportRows(companyId, userId, records);
      return NextResponse.json(preview, { status: 200 });
    }

    return NextResponse.json(
      { error: "Expected 'commitToken' or 'csv' in JSON payload" },
      { status: 400 },
    );
  }

  // 2. Multipart file upload (Preview)
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No CSV file uploaded" }, { status: 400 });
    }

    const text = await (file as Blob).text();
    const { records } = parseRawImportCsv(text);
    const { preview } = await validateImportRows(companyId, userId, records);
    return NextResponse.json(preview, { status: 200 });
  }

  return NextResponse.json(
    { error: "Unsupported Content-Type: expected multipart/form-data or application/json" },
    { status: 400 },
  );
}
