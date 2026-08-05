import { NextRequest, NextResponse } from "next/server";

import { searchContactsByPhone } from "@/lib/customer-insight/search";
import { requirePermission } from "@/lib/rbac";
import { customerInsightSearchQuerySchema } from "@/lib/validation/customer-insight";

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

  const parsed = customerInsightSearchQuerySchema.safeParse({
    phone: request.nextUrl.searchParams.get("phone") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await searchContactsByPhone(companyId, parsed.data.phone);
  return NextResponse.json(result);
}
