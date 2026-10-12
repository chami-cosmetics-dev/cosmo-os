import { handleMerchantOrdersGet } from "@/lib/merchant-orders/handle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/merchant/orders?email=&phone=&page=&limit= with header X-API-Key. */
export async function GET(request: Request) {
  return handleMerchantOrdersGet(request);
}
