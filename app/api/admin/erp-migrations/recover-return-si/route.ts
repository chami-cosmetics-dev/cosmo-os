import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { recoverErpReturnSalesInvoiceIds } from "@/lib/erp-return-si-recover";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  orderId: cuidSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  dryRun: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAnyPermission(["orders.manage"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  let body: z.infer<typeof bodySchema> = {};
  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    // empty body ok — use defaults
  }

  const result = await recoverErpReturnSalesInvoiceIds({
    companyId,
    orderId: body.orderId ?? null,
    limit: body.limit,
    dryRun: body.dryRun ?? false,
  });

  return NextResponse.json(result);
}
