import { NextRequest, NextResponse } from "next/server";

import { createManualOrder } from "@/lib/manual-order-create";
import { requirePermission } from "@/lib/rbac";
import { createManualOrderBodySchema } from "@/lib/validation/manual-order";

export async function POST(request: NextRequest) {
  const auth = await requirePermission("orders.create_manual");
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

  const body = await request.json().catch(() => ({}));
  const parsed = createManualOrderBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await createManualOrder(companyId, parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create order";
    const status =
      message.includes("not found") ||
      message.includes("not configured") ||
      message.includes("invalid")
        ? 400
        : 500;
    if (status === 500) {
      console.error("[manual order]", e);
    }
    return NextResponse.json({ error: message }, { status });
  }
}
