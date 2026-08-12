import { NextRequest, NextResponse } from "next/server";

import { mergeContactMasters } from "@/lib/customer-insight/merge";
import { requirePermission } from "@/lib/rbac";
import { customerInsightMergeBodySchema } from "@/lib/validation/customer-insight";

export async function POST(request: NextRequest) {
  const auth = await requirePermission("contacts.merge");
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
  const parsed = customerInsightMergeBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await mergeContactMasters({
      companyId,
      sourceContactId: parsed.data.sourceContactId,
      targetContactId: parsed.data.targetContactId,
      actorUserId: auth.context!.user?.id,
    });
    return NextResponse.json({ contactId: result.contactId, merged: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "MERGE_FAILED";
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    if (msg === "SOURCE_EQUALS_TARGET") {
      return NextResponse.json({ error: "Source and target must differ" }, { status: 400 });
    }
    console.error("merge contact failed", err);
    return NextResponse.json({ error: "Merge failed" }, { status: 500 });
  }
}
