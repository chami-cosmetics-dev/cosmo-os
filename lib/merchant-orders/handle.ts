import { NextResponse } from "next/server";

import { merchantOrdersApiKey, merchantOrdersApiKeyMatches } from "@/lib/merchant-orders/auth";
import { listMerchantOrders, resolveMerchantOrdersCompanyId } from "@/lib/merchant-orders/lookup";
import { presentMerchantOrdersPage } from "@/lib/merchant-orders/present";
import { merchantOrdersQuerySchema } from "@/lib/validation/merchant-orders";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Customer order history for the mobile app in the Merchant API guide.
 * Auth is the X-API-Key header, not a logged-in Cosmo user.
 */
export async function handleMerchantOrdersGet(request: Request) {
  if (!merchantOrdersApiKey()) {
    return json({ error: "Merchant orders API is not configured" }, 503);
  }
  if (!merchantOrdersApiKeyMatches(request.headers.get("x-api-key"))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const url = new URL(request.url);
  const parsed = merchantOrdersQuerySchema.safeParse({
    email: url.searchParams.get("email") ?? "",
    phone: url.searchParams.get("phone") ?? "",
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid query";
    return json({ error: message }, 400);
  }

  const companyId = await resolveMerchantOrdersCompanyId();
  if (!companyId) {
    return json({ error: "Merchant orders API is not configured" }, 503);
  }

  const { total, orders } = await listMerchantOrders({
    companyId,
    email: parsed.data.email,
    phone: parsed.data.phone,
    page: parsed.data.page,
    limit: parsed.data.limit,
  });

  return json(
    presentMerchantOrdersPage({
      page: parsed.data.page,
      limit: parsed.data.limit,
      total,
      orders,
    }),
  );
}
