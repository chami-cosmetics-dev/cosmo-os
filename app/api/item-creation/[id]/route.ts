import { NextResponse } from "next/server";

import {
  deleteItemRequest,
  getItemRequest,
  ITEM_CREATION_PERMISSIONS,
  updateItemRequestDetails,
} from "@/lib/item-creation/workflow";
import { requireAnyPermission } from "@/lib/rbac";

const ADMIN_ITEM_CREATION_PERMISSIONS = [
  ITEM_CREATION_PERMISSIONS.admin,
  ITEM_CREATION_PERMISSIONS.manageAll,
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAnyPermission(ADMIN_ITEM_CREATION_PERMISSIONS);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await params;
    const item = await getItemRequest(auth.context!, id);
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAnyPermission(ADMIN_ITEM_CREATION_PERMISSIONS);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await params;
    const item = await updateItemRequestDetails(auth.context!, id, await request.json());
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json(
      { error: message },
      { status: message === "Permission denied" ? 403 : 400 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAnyPermission(ADMIN_ITEM_CREATION_PERMISSIONS);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await params;
    await deleteItemRequest(auth.context!, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json(
      { error: message },
      { status: message === "Permission denied" ? 403 : 400 }
    );
  }
}
