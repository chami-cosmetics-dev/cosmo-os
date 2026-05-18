import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { applyProductItemStatusImport } from "@/lib/product-item-status-import";
import { requirePermission } from "@/lib/rbac";

const importRowSchema = z.object({
  sku: z.string().trim().min(1).max(255),
  itemStatusLabel: z.string().max(255).optional().default(""),
  itemStatusCategory: z.string().max(100).optional().default("UNCATEGORIZED"),
});

const applySchema = z.object({
  rows: z.array(importRowSchema).min(1).max(10000),
});

export async function POST(request: NextRequest) {
  const auth = await requirePermission("products.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid priority import payload" }, { status: 400 });
  }

  const result = await applyProductItemStatusImport(companyId, parsed.data.rows);
  return NextResponse.json(result);
}
