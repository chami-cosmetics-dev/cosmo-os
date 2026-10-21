import { NextRequest, NextResponse } from "next/server";

import { NEW_ITEM_REQUESTS_PERMISSIONS } from "@/lib/new-item-requests/permissions";
import { NewItemRequestError, setNewItemRequestStatus } from "@/lib/new-item-requests/store";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";
import { newItemRequestStatusBodySchema } from "@/lib/validation/new-item-requests";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission(NEW_ITEM_REQUESTS_PERMISSIONS.admin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const idParsed = cuidSchema.safeParse(id);
  if (!idParsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = newItemRequestStatusBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const updated = await setNewItemRequestStatus(auth.context!, idParsed.data, parsed.data.status);
    return NextResponse.json({ request: updated });
  } catch (error) {
    if (error instanceof NewItemRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[new-item-requests/status]", error);
    return NextResponse.json({ error: "Could not update status" }, { status: 500 });
  }
}
