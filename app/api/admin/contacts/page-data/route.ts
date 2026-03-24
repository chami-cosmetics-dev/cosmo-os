import { NextRequest, NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac";
import { fetchContactsPageData } from "@/lib/page-data/contacts";
import { limitSchema, pageSchema, sortOrderSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user!.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const pageResult = pageSchema.safeParse(searchParams.get("page"));
  const limitResult = limitSchema.safeParse(searchParams.get("limit"));
  const sortOrderResult = sortOrderSchema.safeParse(searchParams.get("sort_order"));

  const data = await fetchContactsPageData(companyId, {
    page: pageResult.success ? pageResult.data : 1,
    limit: limitResult.success ? limitResult.data : 10,
    sortBy: searchParams.get("sort_by")?.trim() ?? undefined,
    sortOrder: sortOrderResult.success ? sortOrderResult.data : "desc",
    status:
      searchParams.get("status") === "active" ||
      searchParams.get("status") === "inactive" ||
      searchParams.get("status") === "never_purchased"
        ? (searchParams.get("status") as "active" | "inactive" | "never_purchased")
        : undefined,
    search: searchParams.get("search")?.trim() ?? undefined,
  });

  return NextResponse.json(data);
}
