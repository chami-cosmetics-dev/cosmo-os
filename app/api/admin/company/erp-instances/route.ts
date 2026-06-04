import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { trimmedString } from "@/lib/validation";

const erpInstanceSchema = z.object({
  label: trimmedString(1, 100),
  baseUrl: z.string().url().max(500),
  apiKey: trimmedString(1, 500),
  apiSecret: trimmedString(1, 500),
  incomingWebhookSecret: z.string().max(500).optional().nullable(),
  cashMop: z.string().max(200).optional().nullable(),
  codMop: z.string().max(200).optional().nullable(),
  cardDeliveryMop: z.string().max(200).optional().nullable(),
  bankTransferMop: z.string().max(200).optional().nullable(),
  kokoMop: z.string().max(200).optional().nullable(),
  webxpayMop: z.string().max(200).optional().nullable(),
  taxesAndCharges: z.string().max(200).optional().nullable(),
  shippingRule: z.string().max(200).optional().nullable(),
  shippingItem: z.string().max(200).optional().nullable(),
  shippingChargeAccount: z.string().max(200).optional().nullable(),
});

// GET /api/admin/company/erp-instances — list all instances for the company
export async function GET(request: NextRequest) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 404 });

  const instances = await prisma.erpnextInstance.findMany({
    where: { companyId },
    select: {
      id: true,
      label: true,
      baseUrl: true,
      apiKey: true,
      incomingWebhookSecret: true,
      cashMop: true,
      codMop: true,
      cardDeliveryMop: true,
      bankTransferMop: true,
      kokoMop: true,
      webxpayMop: true,
      taxesAndCharges: true,
      shippingRule: true,
      shippingItem: true,
      createdAt: true,
      _count: { select: { locations: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(instances);
}

// POST /api/admin/company/erp-instances — create a new instance
export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = erpInstanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const instance = await prisma.erpnextInstance.create({
    data: { companyId, ...parsed.data },
    select: { id: true, label: true },
  });

  return NextResponse.json(instance, { status: 201 });
}
