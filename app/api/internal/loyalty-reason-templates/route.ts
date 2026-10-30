import { NextRequest, NextResponse } from "next/server";

import {
  isLoyaltyReasonSyncAuthorized,
  peerCompanyId,
  saveLoyaltyReasonTemplate,
} from "@/lib/customer-insight/loyalty-reason-templates";
import { loyaltyReasonTemplateReplicaBodySchema } from "@/lib/validation/customer-insight";

export async function POST(request: NextRequest) {
  if (!isLoyaltyReasonSyncAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = loyaltyReasonTemplateReplicaBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const companyId = await peerCompanyId();
  if (!companyId) {
    return NextResponse.json({ error: "No company on this OS" }, { status: 404 });
  }

  const result = await saveLoyaltyReasonTemplate({
    companyId,
    label: parsed.data.label,
    syncKey: parsed.data.syncKey,
    replica: true,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, created: result.created });
}
