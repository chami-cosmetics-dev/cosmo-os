import { NextRequest, NextResponse } from "next/server";

import { fetchErpPrivateFile } from "@/lib/book-notes/erp-issues";
import { requirePermission } from "@/lib/rbac";
import { bookNoteErpReceiptQuerySchema } from "@/lib/validation/book-notes";

export const dynamic = "force-dynamic";

/**
 * Stream a private ERP receipt file for finance users.
 * Path must be `/private/files/...` or `/files/...` on the given instance.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission("book_notes.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = bookNoteErpReceiptQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await fetchErpPrivateFile({
    companyId,
    instanceId: parsed.data.instanceId,
    path: parsed.data.path,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return new NextResponse(result.body, {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
