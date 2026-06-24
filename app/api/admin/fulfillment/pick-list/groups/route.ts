import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createPickListGroup, PICK_LIST_GROUP_MAX_ORDERS } from "@/lib/pick-list-groups";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const createGroupSchema = z.object({
  orderIds: z.array(cuidSchema).min(1).max(PICK_LIST_GROUP_MAX_ORDERS),
});

export async function POST(request: NextRequest) {
  const auth = await requireAnyPermission(["fulfillment.order_print.print"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context?.user?.companyId;
  const userId = auth.context?.user?.id;
  if (!companyId || !userId) {
    return NextResponse.json({ error: "No company" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createGroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid order list" }, { status: 400 });
  }

  try {
    const group = await createPickListGroup(companyId, userId, parsed.data.orderIds);
    return NextResponse.json(group);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create pick list group";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
