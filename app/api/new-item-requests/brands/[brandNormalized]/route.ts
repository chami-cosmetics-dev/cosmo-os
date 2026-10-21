import { NextRequest, NextResponse } from "next/server";

import { NEW_ITEM_REQUESTS_PERMISSIONS } from "@/lib/new-item-requests/permissions";
import { listRequestsForBrand, NewItemRequestError } from "@/lib/new-item-requests/store";
import { requirePermission } from "@/lib/rbac";
import { newItemRequestListQueryFromSearch } from "@/lib/validation/new-item-requests";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brandNormalized: string }> },
) {
  const auth = await requirePermission(NEW_ITEM_REQUESTS_PERMISSIONS.admin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = newItemRequestListQueryFromSearch(request.nextUrl.searchParams);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { brandNormalized } = await params;
  try {
    const result = await listRequestsForBrand(auth.context!, brandNormalized, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof NewItemRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[new-item-requests/brands]", error);
    return NextResponse.json({ error: "Could not load brand requests" }, { status: 500 });
  }
}
