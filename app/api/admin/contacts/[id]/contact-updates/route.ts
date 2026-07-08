import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().max(255).nullable().optional(),
  remarks: z.string().max(2000).nullable().optional(),
  gender: z.string().max(50).nullable().optional(),
  workPlace: z.string().max(255).nullable().optional(),
  occupation: z.string().max(255).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  birthYear: z.number().int().min(1900).max(2100).nullable().optional(),
  birthMonth: z.number().int().min(0).max(12).nullable().optional(),
  birthDay: z.number().int().min(0).max(31).nullable().optional(),
  mainProfileNo: z.string().max(30).nullable().optional(),
  serviceProvider: z.string().max(100).nullable().optional(),
  district: z.string().max(100).nullable().optional(),
  town: z.string().max(100).nullable().optional(),
  origin: z.string().max(100).nullable().optional(),
  customerType: z.string().max(100).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  contactSaved: z.boolean().nullable().optional(),
  whatsappAllowed: z.boolean().nullable().optional(),
  remindAt: z.string().datetime().nullable().optional(),
  remindTime: z.string().max(20).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAnyPermission(["contacts.updates.manage", "contacts.manage"]);
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

  const { id } = await params;

  const existing = await prisma.contactMaster.findFirst({
    where: { id, companyId },
    // category is fetched so we can record the effective value in the update log
    select: { id: true, category: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  await prisma.contactMaster.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.remarks !== undefined && { remarks: data.remarks }),
      ...(data.gender !== undefined && { gender: data.gender }),
      ...(data.workPlace !== undefined && { workPlace: data.workPlace }),
      ...(data.occupation !== undefined && { occupation: data.occupation }),
      ...(data.address !== undefined && { address: data.address }),
      ...(data.birthYear !== undefined && { birthYear: data.birthYear }),
      ...(data.birthMonth !== undefined && { birthMonth: data.birthMonth }),
      ...(data.birthDay !== undefined && { birthDay: data.birthDay }),
      ...(data.mainProfileNo !== undefined && { phoneNumber: data.mainProfileNo }),
      ...(data.serviceProvider !== undefined && { serviceProvider: data.serviceProvider }),
      ...(data.district !== undefined && { district: data.district }),
      ...(data.town !== undefined && { town: data.town }),
      ...(data.origin !== undefined && { origin: data.origin }),
      ...(data.customerType !== undefined && { customerType: data.customerType }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.contactSaved !== undefined && { contactSaved: data.contactSaved }),
      ...(data.whatsappAllowed !== undefined && { whatsappAllowed: data.whatsappAllowed }),
      ...(data.remindAt !== undefined && {
        remindAt: data.remindAt ? new Date(data.remindAt) : null,
      }),
      ...(data.remindTime !== undefined && { remindTime: data.remindTime }),
    },
  });

  // Record this update for the Call Center Performance Analysis dashboard chart.
  // Uses the new category value if it was changed in this request, otherwise
  // falls back to the contact's existing category before the update.
  const effectiveCategory =
    data.category !== undefined ? data.category : existing.category;

  await prisma.contactAllocationUpdate.create({
    data: {
      companyId,
      contactId: id,
      merchantId: auth.context!.user?.id ?? null,
      merchantName: auth.context!.user?.name ?? null,
      category: effectiveCategory,
    },
  });

  return NextResponse.json({ success: true });
}
