import { NextRequest, NextResponse } from "next/server";

import { requireMaterialTransferView } from "@/lib/material-transfer/auth";
import { MaterialTransferError } from "@/lib/material-transfer/erp";
import {
  createShopItemRequest,
  listShopItemRequests,
  resolveListScope,
} from "@/lib/material-transfer/shop-item-request-store";
import {
  shopItemRequestCreateSchema,
  shopItemRequestListQuerySchema,
} from "@/lib/validation/material-transfer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requireMaterialTransferView();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = shopItemRequestListQuerySchema.safeParse({
    status: request.nextUrl.searchParams.get("status") ?? undefined,
    scope: request.nextUrl.searchParams.get("scope") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const scope = resolveListScope({
    canWrite: auth.canWrite,
    outletName: auth.scope.outletName,
    scope: parsed.data.scope,
  });
  if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: scope.status });

  try {
    const requests = await listShopItemRequests({
      companyId: auth.companyId,
      status: parsed.data.status ?? "pending",
      scope: scope.scope,
      outletName: auth.scope.outletName,
    });
    return NextResponse.json({ requests });
  } catch (error) {
    console.error("[shop-requests]", error);
    return NextResponse.json({ error: "Could not load requests" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireMaterialTransferView();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.scope.outletName) {
    return NextResponse.json({ error: "Assign an outlet on your staff profile" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = shopItemRequestCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const userId = auth.context.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const created = await createShopItemRequest({
      companyId: auth.companyId,
      userId,
      outletName: auth.scope.outletName,
      lines: parsed.data.lines,
    });
    return NextResponse.json({ request: created }, { status: 201 });
  } catch (error) {
    if (error instanceof MaterialTransferError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message.startsWith("Duplicate item ")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[shop-requests]", error);
    return NextResponse.json({ error: "Could not save the request" }, { status: 500 });
  }
}
