import { NextRequest, NextResponse } from "next/server";

import {
  canAdminNewItemRequests,
  NEW_ITEM_REQUESTS_ANY_PERMISSION,
} from "@/lib/new-item-requests/permissions";
import {
  createNewItemRequest,
  listBrandGroups,
  listCompanyRequests,
  NewItemRequestError,
} from "@/lib/new-item-requests/store";
import { requireAnyPermission } from "@/lib/rbac";
import { LIMITS } from "@/lib/validation";
import {
  newItemRequestCreateFieldsSchema,
  newItemRequestListQueryFromSearch,
} from "@/lib/validation/new-item-requests";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function jsonError(error: unknown) {
  if (error instanceof NewItemRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[new-item-requests]", error);
  return NextResponse.json({ error: "Request failed" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission([...NEW_ITEM_REQUESTS_ANY_PERMISSION]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = newItemRequestListQueryFromSearch(request.nextUrl.searchParams);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const requests = await listCompanyRequests(auth.context, parsed.data);
    if (canAdminNewItemRequests(auth.context)) {
      const brands = await listBrandGroups(auth.context, parsed.data);
      return NextResponse.json({ brands, requests });
    }
    return NextResponse.json({ requests });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAnyPermission([...NEW_ITEM_REQUESTS_ANY_PERMISSION]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const image = form.get("image");
  if (image instanceof File && image.size > LIMITS.newItemRequestImageMaxBytes) {
    return NextResponse.json({ error: "File too large. Maximum size is 5MB" }, { status: 413 });
  }

  const parsed = newItemRequestCreateFieldsSchema.safeParse({
    brandName: form.get("brandName") ?? "",
    productName: form.get("productName") ?? "",
    description: form.get("description") ?? "",
    storeUrl: form.get("storeUrl") ?? "",
    customerName: form.get("customerName") ?? "",
    customerPhone: form.get("customerPhone") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const created = await createNewItemRequest(auth.context!, {
      brandName: parsed.data.brandName,
      productName: parsed.data.productName,
      description: parsed.data.description,
      storeUrl: parsed.data.storeUrl,
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone,
      image: image instanceof File && image.size > 0 ? image : undefined,
    });
    return NextResponse.json({ request: created });
  } catch (error) {
    return jsonError(error);
  }
}
