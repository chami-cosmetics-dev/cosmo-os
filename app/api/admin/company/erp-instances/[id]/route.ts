import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, trimmedString } from "@/lib/validation";

const updateErpInstanceSchema = z.object({
  label: trimmedString(1, 100).optional(),
  baseUrl: z.string().url().max(500).optional(),
  apiKey: trimmedString(1, 500).optional(),
  apiSecret: trimmedString(1, 500).optional(),
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
});

async function resolveInstance(id: string, companyId: string) {
  const instance = await prisma.erpnextInstance.findUnique({ where: { id } });
  if (!instance || instance.companyId !== companyId) return null;
  return instance;
}

// GET /api/admin/company/erp-instances/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 404 });

  const { id } = await params;
  if (!cuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const instance = await resolveInstance(id, companyId);
  if (!instance) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(instance);
}

// PATCH /api/admin/company/erp-instances/[id]
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 404 });

  const { id } = await params;
  if (!cuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const existing = await resolveInstance(id, companyId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = updateErpInstanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.erpnextInstance.update({
    where: { id },
    data: parsed.data,
    select: { id: true, label: true },
  });

  return NextResponse.json(updated);
}

// DELETE /api/admin/company/erp-instances/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 404 });

  const { id } = await params;
  if (!cuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const existing = await resolveInstance(id, companyId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Unlink all locations before deleting
  await prisma.companyLocation.updateMany({
    where: { erpnextInstanceId: id },
    data: { erpnextInstanceId: null },
  });

  await prisma.erpnextInstance.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
