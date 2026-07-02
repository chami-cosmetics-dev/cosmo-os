import { NextResponse } from "next/server";

import { previewContactBackfill } from "@/lib/contact-master-backfill";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

export async function GET() {
  const auth = await requireAnyPermission(["contacts.master.manage", "contacts.manage"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.context!.user!.id },
    select: { companyId: true },
  });
  const companyId = user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const preview = await previewContactBackfill(companyId);
  return NextResponse.json(preview);
}
