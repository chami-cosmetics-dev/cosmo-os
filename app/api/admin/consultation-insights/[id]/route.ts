import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireConsultationAccess } from "@/lib/consultation-insights/auth";
import { deleteConsultationEntry, updateConsultationReview } from "@/lib/consultation-insights/server";

const updateSchema = z.object({
  physicalReview: z.string().max(5000).nullable(),
});

/** Only the Physical Review Update is editable once a customer is logged (applies to all their invoices). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireConsultationAccess();
  if (!access.ok) return access.response;

  const { id } = await params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid review" }, { status: 400 });
  }

  const rows = await updateConsultationReview({
    companyId: access.companyId,
    userId: access.userId,
    id,
    physicalReview: parsed.data.physicalReview?.trim() || null,
  });
  if (!rows) {
    return NextResponse.json({ error: "Row not found" }, { status: 404 });
  }
  return NextResponse.json({ rows });
}

/** Removes the whole customer (every invoice row added with it). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireConsultationAccess();
  if (!access.ok) return access.response;

  const { id } = await params;
  const deleted = await deleteConsultationEntry({ companyId: access.companyId, id });
  if (deleted === 0) {
    return NextResponse.json({ error: "Row not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted });
}
