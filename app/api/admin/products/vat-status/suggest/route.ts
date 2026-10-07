import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { VAT_STATUS_PERMISSION } from "@/lib/vat-status/types";
import { vatStatusSuggestQuerySchema } from "@/lib/validation/vat-status";

export const dynamic = "force-dynamic";

const SUGGEST_LIMIT = 12;

export async function GET(request: NextRequest) {
  const auth = await requirePermission(VAT_STATUS_PERMISSION);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "Company not found" }, { status: 400 });
  }

  const parsed = vatStatusSuggestQuerySchema.safeParse({
    q: request.nextUrl.searchParams.get("q") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ suggestions: [] });
  }

  const q = parsed.data.q;
  const rows = await prisma.productItem.findMany({
    where: {
      companyId,
      sku: { contains: q, mode: "insensitive" },
      status: { not: "archived" },
    },
    select: {
      sku: true,
      productTitle: true,
      variantTitle: true,
    },
    orderBy: { sku: "asc" },
    take: 40,
  });

  const seen = new Set<string>();
  const suggestions: Array<{ sku: string; title: string }> = [];
  for (const row of rows) {
    const sku = row.sku?.trim();
    if (!sku) continue;
    const key = sku.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const title = [row.productTitle, row.variantTitle].filter(Boolean).join(" — ");
    suggestions.push({ sku, title });
    if (suggestions.length >= SUGGEST_LIMIT) break;
  }

  return NextResponse.json({ suggestions });
}
