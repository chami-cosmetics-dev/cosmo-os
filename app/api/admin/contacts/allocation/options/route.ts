import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  const auth = await requirePermission("contacts.read");
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

  const rows = await prisma.contactAllocationOption.findMany({
    where: { companyId },
    orderBy: { value: "asc" },
    select: { type: true, value: true },
  });

  const grouped: Record<string, string[]> = {
    serviceProvider: [],
    district: [],
    town: [],
    origin: [],
    customerType: [],
    category: [],
  };

  for (const row of rows) {
    if (row.type in grouped) {
      grouped[row.type]!.push(row.value);
    }
  }

  return NextResponse.json(grouped);
}
