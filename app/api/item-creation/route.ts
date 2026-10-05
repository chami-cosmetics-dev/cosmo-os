import { NextRequest, NextResponse } from "next/server";

import {
  createItemRequest,
  createItemRequests,
  ITEM_CREATION_PERMISSIONS,
  listItemRequests,
} from "@/lib/item-creation/workflow";
import { requireAnyPermission, requirePermission } from "@/lib/rbac";

const ANY_ITEM_CREATION_PERMISSION = Object.values(ITEM_CREATION_PERMISSIONS);

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed";
  return NextResponse.json(
    { error: message },
    { status: message === "Permission denied" ? 403 : 400 }
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission(ANY_ITEM_CREATION_PERMISSION);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const filters = Object.fromEntries(request.nextUrl.searchParams.entries());
    const items = await listItemRequests(auth.context!, filters);
    return NextResponse.json({ items });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(ITEM_CREATION_PERMISSIONS.admin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    if (Array.isArray(body.items)) {
      const items = await createItemRequests(auth.context!, body.items);
      return NextResponse.json({ items }, { status: 201 });
    }
    const item = await createItemRequest(auth.context!, body);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
