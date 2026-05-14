import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { LIMITS, trimmedString } from "@/lib/validation";

const createSchema = z.object({
  label: trimmedString(1, LIMITS.kokoCompanyLabel.max),
  kokoName: trimmedString(1, LIMITS.kokoCompanyName.max),
  invoicePrefix: trimmedString(1, LIMITS.kokoCompanyPrefix.max),
});

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function GET() {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const items = await prisma.kokoCompany.findMany({
    where: { companyId },
    orderBy: { label: "asc" },
    select: { id: true, label: true, kokoName: true, invoicePrefix: true, createdAt: true },
  });

  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const existing = await prisma.kokoCompany.findFirst({
    where: { companyId, label: parsed.data.label },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A company with this label already exists" },
      { status: 409 }
    );
  }

  const item = await prisma.kokoCompany.create({
    data: {
      companyId,
      label: parsed.data.label,
      kokoName: parsed.data.kokoName,
      invoicePrefix: parsed.data.invoicePrefix,
    },
    select: { id: true, label: true, kokoName: true, invoicePrefix: true, createdAt: true },
  });

  await writeAuditLog({
    companyId,
    actorUserId: auth.context!.user!.id,
    module: "settings",
    action: "setting_created",
    entityType: "KokoCompany",
    entityId: item.id,
    summary: `Created Koko company "${item.label}"`,
    afterData: { label: item.label, kokoName: item.kokoName, invoicePrefix: item.invoicePrefix },
  });

  return NextResponse.json(item);
}
