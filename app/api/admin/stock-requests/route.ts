import { NextRequest, NextResponse } from "next/server";

import {
  STOCK_REQUEST_CREATE_PERMISSIONS,
  STOCK_REQUEST_LIST_PERMISSIONS,
} from "@/lib/wishlist-buddy/access";
import { createStaffStockRequest, listStockRequests } from "@/lib/wishlist-buddy/requests";
import { requireStockRequestViewer, stockRequestErrorResponse } from "@/lib/wishlist-buddy/route-auth";
import {
  staffStockRequestCreateBodySchema,
  stockRequestListQuerySchema,
  stockRequestScopeSchema,
} from "@/lib/wishlist-buddy/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** List a tab: `scope=web` (stock_requests.read), `scope=mine` (stock_requests.create), or `scope=staff` (stock_requests.read_all). */
export async function GET(request: NextRequest) {
  const auth = await requireStockRequestViewer([...STOCK_REQUEST_LIST_PERMISSIONS]);
  if (!auth.ok) return auth.response;

  const sp = request.nextUrl.searchParams;
  const scope = stockRequestScopeSchema.safeParse(sp.get("scope") || undefined);
  if (!scope.success) {
    return NextResponse.json({ error: "Invalid tab" }, { status: 400 });
  }
  const parsed = stockRequestListQuerySchema.safeParse({
    status: sp.get("status") || undefined,
    stock: sp.get("stock") || undefined,
    search: sp.get("search") || undefined,
    createdBy: sp.get("createdBy") || undefined,
    page: sp.get("page") || undefined,
    limit: sp.get("limit") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid query" }, { status: 400 });
  }

  try {
    const { createdBy, ...filters } = parsed.data;
    const data = await listStockRequests({
      companyId: auth.companyId,
      viewer: auth.viewer,
      scope: scope.data,
      createdById: scope.data === "staff" ? createdBy : undefined,
      ...filters,
    });
    return NextResponse.json(data);
  } catch (error) {
    return stockRequestErrorResponse(error);
  }
}

/** New staff request (My requests tab). */
export async function POST(request: NextRequest) {
  const auth = await requireStockRequestViewer([...STOCK_REQUEST_CREATE_PERMISSIONS]);
  if (!auth.ok) return auth.response;

  const body = staffStockRequestCreateBodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  try {
    const result = await createStaffStockRequest({ companyId: auth.companyId, viewer: auth.viewer, body: body.data });
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return stockRequestErrorResponse(error);
  }
}
