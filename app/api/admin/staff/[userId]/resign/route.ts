import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { deleteAuth0User } from "@/lib/auth0-management";
import { prisma } from "@/lib/prisma";
import { sendResignationNotice } from "@/lib/maileroo";
import { formatAppDate } from "@/lib/format-datetime";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, LIMITS, trimmedString } from "@/lib/validation";

/** Placeholder auth0Id after resign — frees email for re-invite + blocks login sync. */
function resignedAuth0Id(userId: string): string {
  return `resigned:${userId}`;
}

function isAlreadyResignedAuth0Id(auth0Id: string): boolean {
  return auth0Id.startsWith("resigned:");
}

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
  const originalEmail = targetUser.email;
  const originalAuth0Id = targetUser.auth0Id;

  if (targetUser.employeeProfile?.status === "resigned") {
    return NextResponse.json(
      { error: "Staff member is already resigned" },
      { status: 400 }
    );
  }

  // Remove Auth0 first so same email can get a brand-new Auth0 user on re-invite.
  if (!isAlreadyResignedAuth0Id(originalAuth0Id)) {
    try {
      await deleteAuth0User(originalAuth0Id);
    } catch (error) {
      console.error("Failed to delete resigned user from Auth0:", error);
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to delete user from Auth0",
        },
        { status: 500 }
      );
    }
  }

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

    // Free email + roles so re-invite creates a new OS user (no email repair path).
    await tx.userRole.deleteMany({ where: { userId: idResult.data } });
    await tx.user.update({
      where: { id: idResult.data },
      data: {
        companyId: null,
        email: null,
        auth0Id: resignedAuth0Id(idResult.data),
      },
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
          resignationDate: formatAppDate(validResignedAt),
          reason: reason ?? "Not provided",
          employeeNumber:
            targetUser.employeeProfile?.employeeNumber ?? "-",
          department:
            targetUser.employeeProfile?.department?.name ?? "-",
          designation:
            targetUser.employeeProfile?.designation?.name ?? "-",
          location:
            targetUser.employeeProfile?.location?.name ?? "-",
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

  await writeAuditLog({
    companyId,
    actorUserId: auth.context!.user!.id,
    module: "staff",
    action: "staff_resigned",
    entityType: "Staff",
    entityId: targetUser.id,
    summary: `Marked ${targetUser.name ?? targetUser.email ?? targetUser.id} as resigned`,
    beforeData: {
      companyId: targetUser.companyId,
      email: originalEmail,
      auth0Id: originalAuth0Id,
      employeeProfile: targetUser.employeeProfile,
    },
    afterData: {
      resignedAt: validResignedAt,
      reason,
      companyId: null,
      email: null,
      auth0Id: resignedAuth0Id(targetUser.id),
      auth0Deleted: !isAlreadyResignedAuth0Id(originalAuth0Id),
    },
  });

  return NextResponse.json({ success: true });
}
