import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

/** Brands available for Customer Insight filters (Vendor names). */
export async function GET() {
  const auth = await requirePermission("contacts.insight.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const vendors = await prisma.vendor.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: { name: true },
  });

  const seen = new Set<string>();
  const brands: string[] = [];
  for (const v of vendors) {
    const name = v.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    brands.push(name);
  }

  return NextResponse.json({ brands });
}
