import { NextResponse } from "next/server";

import { listMerchantCallQueue } from "@/lib/customer-insight/call-queue";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  const auth = await requirePermission("contacts.insight.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  const user = auth.context!.user;
  if (!companyId || !user) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { couponCodes: true },
  });

  const result = await listMerchantCallQueue({
    companyId,
    viewer: {
      id: user.id,
      knownName: user.knownName ?? null,
      name: user.name ?? null,
      email: user.email ?? null,
      couponCodes: dbUser?.couponCodes ?? null,
    },
  });
  return NextResponse.json(result);
}
