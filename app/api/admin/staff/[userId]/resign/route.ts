import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { sendResignationNotice } from "@/lib/maileroo";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, LIMITS, trimmedString } from "@/lib/validation";

const resignSchema = z.object({
  resignedAt: z.string().optional(),
  reason: trimmedString(0, LIMITS.resignationReason.max).optional(),
  offboardingAcknowledged: z.literal(true),
});

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requirePermission("staff.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { userId } = await params;
  const idResult = cuidSchema.safeParse(userId);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const currentUserCompanyId = await getCompanyId(auth.context!.user!.id);
  const roleNames = auth.context!.roleNames as string[];
  const isSuperAdmin = roleNames.includes("super_admin");

  const targetUser = await prisma.user.findUnique({
    where: { id: idResult.data },
    include: {
      employeeProfile: {
        include: {
          department: true,
          designation: true,
          location: true,
        },
      },
    },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!isSuperAdmin && currentUserCompanyId && targetUser.companyId !== currentUserCompanyId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = resignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const resignedAt = parsed.data.resignedAt?.trim()
    ? new Date(parsed.data.resignedAt)
    : new Date();
  const validResignedAt =
    !Number.isNaN(resignedAt.getTime()) ? resignedAt : new Date();
  const reason = parsed.data.reason?.trim() || null;

  const companyId = targetUser.companyId;

  await prisma.$transaction(async (tx) => {
    if (targetUser.employeeProfile) {
      await tx.employeeProfile.update({
        where: { id: targetUser.employeeProfile.id },
        data: {
          status: "resigned",
          resignedAt: validResignedAt,
          resignationReason: reason,
          offboardingAcknowledgedAt: new Date(),
        },
      });
    } else if (companyId) {
      await tx.employeeProfile.create({
        data: {
          userId: idResult.data,
          companyId,
          status: "resigned",
          resignedAt: validResignedAt,
          resignationReason: reason,
          offboardingAcknowledgedAt: new Date(),
        },
      });
    }

    await tx.user.update({
      where: { id: idResult.data },
      data: { companyId: null },
    });
  });

  if (companyId) {
    const template = await prisma.emailTemplate.findUnique({
      where: {
        companyId_key: { companyId, key: "resignation_notice" },
      },
    });

    if (template?.recipients?.trim()) {
      const recipients = template.recipients
        .split(/[,;\s]+/)
        .map((e) => e.trim())
        .filter((e) => e && e.includes("@"));

      if (recipients.length > 0) {
        const staffName =
          targetUser.knownName ?? targetUser.name ?? targetUser.email ?? "Unknown";
        const staffData = {
          staffName,
          resignationDate: validResignedAt.toLocaleDateString(),
          reason: reason ?? "Not provided",
          employeeNumber:
            targetUser.employeeProfile?.employeeNumber ?? "—",
          department:
            targetUser.employeeProfile?.department?.name ?? "—",
          designation:
            targetUser.employeeProfile?.designation?.name ?? "—",
          location:
            targetUser.employeeProfile?.location?.name ?? "—",
        };

        const emailResult = await sendResignationNotice(
          recipients,
          { subject: template.subject, bodyHtml: template.bodyHtml },
          staffData
        );

        if (!emailResult.success) {
          console.error("Resignation notice email failed:", emailResult.message);
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}
