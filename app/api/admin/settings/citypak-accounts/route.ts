import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { LIMITS, trimmedString } from "@/lib/validation";

const createSchema = z.object({
  label: trimmedString(1, LIMITS.citypakAccountLabel.max),
  accountId: trimmedString(1, LIMITS.citypakAccountId.max),
  invoicePrefix: trimmedString(1, LIMITS.citypakInvoicePrefix.max),
  apiToken: trimmedString(LIMITS.citypakApiToken.min, LIMITS.citypakApiToken.max),
});

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

function maskToken(token: string) {
  if (token.length <= 8) return "••••••••";
  return `${token.slice(0, 4)}••••••••${token.slice(-4)}`;
}

function toPublicAccount(row: {
  id: string;
  label: string;
  accountId: string;
  invoicePrefix: string;
  apiToken: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    label: row.label,
    accountId: row.accountId,
    invoicePrefix: row.invoicePrefix,
    createdAt: row.createdAt,
    hasApiToken: row.apiToken.length > 0,
    apiTokenMasked: maskToken(row.apiToken),
  };
}

export async function GET() {
  const auth = await requirePermission("settings.fulfillment");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const items = await prisma.citypakAccount.findMany({
    where: { companyId },
    orderBy: { invoicePrefix: "asc" },
  });

  return NextResponse.json(items.map(toPublicAccount));
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.fulfillment");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { label, accountId, invoicePrefix, apiToken } = parsed.data;

  const conflict = await prisma.citypakAccount.findFirst({
    where: {
      companyId,
      OR: [{ label }, { accountId }, { invoicePrefix }],
    },
    select: { label: true, accountId: true, invoicePrefix: true },
  });
  if (conflict) {
    if (conflict.label === label) {
      return NextResponse.json({ error: "A CityPak account with this label already exists" }, { status: 409 });
    }
    if (conflict.accountId === accountId) {
      return NextResponse.json({ error: "This CityPak account ID is already configured" }, { status: 409 });
    }
    return NextResponse.json({ error: "This invoice prefix already has a CityPak token" }, { status: 409 });
  }

  const item = await prisma.citypakAccount.create({
    data: { companyId, label, accountId, invoicePrefix, apiToken },
  });

  await writeAuditLog({
    companyId,
    actorUserId: auth.context!.user!.id,
    module: "settings",
    action: "setting_created",
    entityType: "CitypakAccount",
    entityId: item.id,
    summary: `Created CityPak account "${item.label}" (${item.accountId} / ${item.invoicePrefix})`,
    afterData: { label: item.label, accountId: item.accountId, invoicePrefix: item.invoicePrefix },
  });

  return NextResponse.json(toPublicAccount(item));
}
