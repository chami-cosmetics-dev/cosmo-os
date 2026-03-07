import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { fetchStaffPageData } from "@/lib/page-data/staff";
import { requirePermission } from "@/lib/rbac";
import { limitSchema, pageSchema, sortOrderSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("staff.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const roleNames = auth.context!.roleNames as string[];
  const isSuperAdmin = roleNames.includes("super_admin");

  let companyId: string | null = null;
  if (!isSuperAdmin) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });
    companyId = user?.companyId ?? null;
    if (!companyId) {
      return NextResponse.json(
        { error: "No company associated with your account" },
        { status: 404 }
      );
    }
  }

  const searchParams = request.nextUrl.searchParams;
  const pageResult = pageSchema.safeParse(searchParams.get("page"));
  const limitResult = limitSchema.safeParse(searchParams.get("limit"));
  const sortOrderResult = sortOrderSchema.safeParse(searchParams.get("sort_order"));

  const data = await fetchStaffPageData(companyId, {
    page: pageResult.success ? pageResult.data : 1,
    limit: limitResult.success ? limitResult.data : 10,
    sortBy: searchParams.get("sort_by")?.trim() ?? undefined,
    sortOrder: sortOrderResult.success ? sortOrderResult.data : "asc",
    status: searchParams.get("status") ?? undefined,
    search: searchParams.get("search")?.trim() ?? undefined,
  });

  return NextResponse.json(data);
}
