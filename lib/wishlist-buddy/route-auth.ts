import "server-only";

import { NextResponse } from "next/server";

import { requireAnyPermission } from "@/lib/rbac";
import { viewerFromPermissions, type StockRequestViewer } from "@/lib/wishlist-buddy/access";
import { StockRequestForbiddenError } from "@/lib/wishlist-buddy/requests";

export type StockRequestRouteAuth =
  | { ok: true; companyId: string; viewer: StockRequestViewer }
  | { ok: false; response: NextResponse };

/** Signed-in user with any of `permissionKeys` (admins always pass), as a stock request viewer. */
export async function requireStockRequestViewer(permissionKeys: string[]): Promise<StockRequestRouteAuth> {
  const auth = await requireAnyPermission(permissionKeys);
  if (!auth.ok) {
    return { ok: false, response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }
  const user = auth.context.user;
  if (!user?.companyId || !user.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No company associated with your account" }, { status: 404 }),
    };
  }
  return {
    ok: true,
    companyId: user.companyId,
    viewer: viewerFromPermissions({
      userId: user.id,
      roleNames: auth.context.roleNames as string[],
      permissionKeys: auth.context.permissionKeys as string[],
    }),
  };
}

/** Maps service errors to responses: Forbidden → 403, Not found → 404, anything else → 400. */
export function stockRequestErrorResponse(error: unknown): NextResponse {
  if (error instanceof StockRequestForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status: message === "Not found" ? 404 : 400 });
}
