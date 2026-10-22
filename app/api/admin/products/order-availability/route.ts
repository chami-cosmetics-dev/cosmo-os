import { NextRequest, NextResponse } from "next/server";

import { checkOrderAvailability, OrderAvailabilityInputError } from "@/lib/order-availability/lookup";
import { ORDER_AVAILABILITY_PERMISSION } from "@/lib/order-availability/types";
import { requirePermission } from "@/lib/rbac";
import { orderAvailabilityRequestSchema } from "@/lib/validation/order-availability";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requirePermission(ORDER_AVAILABILITY_PERMISSION);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "Company not found" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = orderAvailabilityRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter SKUs with whole-number quantities", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await checkOrderAvailability(companyId, parsed.data.lines);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OrderAvailabilityInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "ERP fetch failed";
    console.error("[order-availability] check failed", error);
    return NextResponse.json(
      { error: `Could not read ERP2 stock: ${message.slice(0, 300)}` },
      { status: 502 },
    );
  }
}
