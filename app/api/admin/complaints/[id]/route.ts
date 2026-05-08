import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { isMissingComplaintTableError } from "@/lib/page-data/complaints";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const updateComplaintSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved"]),
  resolution: z.string().trim().max(1000).optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("complaints.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const idParsed = cuidSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid complaint ID" }, { status: 400 });
  }

  const companyId = auth.context.user?.companyId ?? null;
  const userId = auth.context.user?.id ?? null;
  if (!companyId || !userId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = updateComplaintSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  let existing: Array<{ id: string; status: string; title: string }>;
  try {
    existing = await prisma.$queryRaw(
      Prisma.sql`
        SELECT "id", "status", "title"
        FROM "Complaint"
        WHERE "id" = ${idParsed.data}
          AND "companyId" = ${companyId}
        LIMIT 1
      `
    );
  } catch (error) {
    if (isMissingComplaintTableError(error)) {
      return NextResponse.json(
        { error: "Complaint table is missing. Run the latest Prisma migration." },
        { status: 503 }
      );
    }
    throw error;
  }
  if (!existing[0]) {
    return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
  }

  const resolved = parsed.data.status === "resolved";
  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "Complaint"
      SET
        "status" = ${parsed.data.status},
        "resolution" = ${parsed.data.resolution?.trim() || null},
        "resolvedById" = ${resolved ? userId : null},
        "resolvedAt" = ${resolved ? new Date() : null},
        "updatedAt" = ${new Date()}
      WHERE "id" = ${idParsed.data}
        AND "companyId" = ${companyId}
    `
  );

  await writeAuditLog({
    companyId,
    actorUserId: userId,
    module: "complaints",
    action: "complaint_updated",
    entityType: "Complaint",
    entityId: idParsed.data,
    summary: `Updated complaint: ${existing[0].title}`,
    beforeData: { status: existing[0].status },
    afterData: parsed.data,
  });

  return NextResponse.json({ ok: true });
}
