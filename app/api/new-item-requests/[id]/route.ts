import { NextRequest, NextResponse } from "next/server";

import { NEW_ITEM_REQUESTS_ANY_PERMISSION } from "@/lib/new-item-requests/permissions";
import { getRequest, NewItemRequestError } from "@/lib/new-item-requests/store";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAnyPermission([...NEW_ITEM_REQUESTS_ANY_PERMISSION]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const parsed = cuidSchema.safeParse(id);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const request = await getRequest(auth.context!, parsed.data);
    return NextResponse.json({ request });
  } catch (error) {
    if (error instanceof NewItemRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[new-item-requests/id]", error);
    return NextResponse.json({ error: "Could not load the request" }, { status: 500 });
  }
}
