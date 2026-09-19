import { NextResponse } from "next/server";

import { cancelKokoDuplicateOrder } from "@/lib/koko-duplicate-cancel";
import { FINANCE_CANCEL_KOKO_DUPLICATE_PERMISSION } from "@/lib/koko-order";
import { requirePermission } from "@/lib/rbac";
import { cancelKokoDuplicateBodySchema, cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const auth = await requirePermission(FINANCE_CANCEL_KOKO_DUPLICATE_PERMISSION);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context?.user?.companyId;
  const userId = auth.context?.user?.id;
  if (!companyId || !userId) {
    return NextResponse.json({ error: "No company" }, { status: 404 });
  }

  const { id } = await params;
  const idParsed = cuidSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid approval id" }, { status: 400 });
  }

  const body = cancelKokoDuplicateBodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid body", details: body.error.flatten() }, { status: 400 });
  }

  const result = await cancelKokoDuplicateOrder({
    companyId,
    actorUserId: userId,
    approvalId: idParsed.data,
    reason: body.data.reason,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true, erpOutcome: result.erpOutcome });
}
