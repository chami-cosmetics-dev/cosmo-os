import { NextResponse } from "next/server";

import { runContactBackfill } from "@/lib/contact-master-backfill";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

export async function POST() {
  const auth = await requireAnyPermission(["contacts.master.manage", "contacts.manage"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  const companyId = user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const summary = await runContactBackfill(companyId, userId);
  return NextResponse.json({
    message: "Contact backfill completed",
    summary,
  });
}
