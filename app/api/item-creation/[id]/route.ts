import { NextResponse } from "next/server";

import {
  deleteItemRequest,
  getItemRequest,
  ITEM_CREATION_PERMISSIONS,
  updateItemRequestDetails,
} from "@/lib/item-creation/workflow";
import { syncItemCreationItemFields, syncItemCreationSourceChanges } from "@/lib/item-creation/automation";
import { requireAnyPermission } from "@/lib/rbac";

const ADMIN_ITEM_CREATION_PERMISSIONS = [
  ITEM_CREATION_PERMISSIONS.admin,
  ITEM_CREATION_PERMISSIONS.manageAll,
];

const ITEM_CREATION_VIEW_PERMISSIONS = [
  ...ADMIN_ITEM_CREATION_PERMISSIONS,
  ITEM_CREATION_PERMISSIONS.adminViewer,
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAnyPermission(ITEM_CREATION_VIEW_PERMISSIONS);
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
    const body = await request.json();
    const before = await getItemRequest(auth.context!, id);
    const item = await updateItemRequestDetails(auth.context!, id, body);
    await syncItemCreationSourceChanges(auth.context!, id, before.creationSources);
    await syncItemCreationItemFields(auth.context!, id);
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
