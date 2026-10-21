import { NextRequest, NextResponse } from "next/server";

import { NEW_ITEM_REQUESTS_ANY_PERMISSION } from "@/lib/new-item-requests/permissions";
import { NewItemRequestError, suggestBrands } from "@/lib/new-item-requests/store";
import { requireAnyPermission } from "@/lib/rbac";
import { newItemRequestSuggestQuerySchema } from "@/lib/validation/new-item-requests";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission([...NEW_ITEM_REQUESTS_ANY_PERMISSION]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = newItemRequestSuggestQuerySchema.safeParse({
    q: request.nextUrl.searchParams.get("q") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const companyId = auth.context!.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  try {
    const hits = await suggestBrands(companyId, parsed.data.q);
    return NextResponse.json({ hits });
  } catch (error) {
    if (error instanceof NewItemRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[new-item-requests/suggest]", error);
    return NextResponse.json({ error: "Could not suggest brands" }, { status: 500 });
  }
}
