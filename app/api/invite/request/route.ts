import { NextResponse } from "next/server";
import { z } from "zod";

import { sendInviteEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";
import { ensureDefaultRbacSetup, requirePermission } from "@/lib/rbac";
import { generateInviteToken, getInviteExpiresAt } from "@/lib/invite-utils";
import { emailSchema, cuidSchema } from "@/lib/validation";

const requestSchema = z.object({
  email: emailSchema,
  roleId: cuidSchema.optional(),
  employeeNumber: z.string().max(50).optional(),
  epfNumber: z.string().max(50).optional(),
  locationId: cuidSchema.optional(),
  departmentId: cuidSchema.optional(),
  designationId: cuidSchema.optional(),
  appointmentDate: z.string().optional(),
});

export async function POST(request: Request) {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

  const userCount = await prisma.user.count();

  if (userCount === 0) {
    const body = await request.json().catch(() => ({}));
    const parsed = z.object({ email: emailSchema }).safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      );
    }
    const { email } = parsed.data;

    await ensureDefaultRbacSetup();
    const superAdminRole = await prisma.role.findUnique({
      where: { name: "super_admin" },
      select: { id: true },
    });
    if (!superAdminRole) {
      return NextResponse.json(
        { error: "Super admin role not configured" },
        { status: 503 }
      );
    }

    const token = generateInviteToken();
    const expiresAt = getInviteExpiresAt();

    await prisma.invite.create({
      data: {
        email,
        token,
        expiresAt,
        roleId: superAdminRole.id,
        isSuperAdmin: true,
      },
    });

    const activationUrl = `${baseUrl}/invite/activate?token=${token}`;
    const result = await sendInviteEmail(email, activationUrl);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message ?? "Failed to send invite email" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  }

  const auth = await requirePermission("users.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  await ensureDefaultRbacSetup();

  const body = await request.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Valid email and roleId are required" },
      { status: 400 }
    );
  }
  const {
    email,
    roleId,
    employeeNumber,
    epfNumber,
    locationId,
    departmentId,
    designationId,
    appointmentDate,
  } = parsed.data;

  if (!roleId) {
    return NextResponse.json(
      { error: "roleId is required for staff invites" },
      { status: 400 }
    );
  }

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { id: true, name: true },
  });
  if (!role) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  if (role.name === "super_admin") {
    return NextResponse.json(
      { error: "Super Admin role cannot be assigned via invite" },
      { status: 403 }
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existingUser) {
    return NextResponse.json(
      { error: "User with this email already exists" },
      { status: 400 }
    );
  }

  const inviter = await prisma.user.findUnique({
    where: { id: auth.context!.user!.id },
    select: { companyId: true },
  });
  if (!inviter?.companyId) {
    return NextResponse.json(
      { error: "No company associated with your account. Staff invites require a company." },
      { status: 400 }
    );
  }

  if (locationId || departmentId || designationId) {
    const [loc, dept, des] = await Promise.all([
      locationId
        ? prisma.companyLocation.findFirst({
            where: { id: locationId, companyId: inviter.companyId },
          })
        : null,
      departmentId
        ? prisma.department.findFirst({
            where: { id: departmentId, companyId: inviter.companyId },
          })
        : null,
      designationId
        ? prisma.designation.findFirst({
            where: { id: designationId, companyId: inviter.companyId },
          })
        : null,
    ]);
    if (locationId && !loc) {
      return NextResponse.json({ error: "Invalid location" }, { status: 400 });
    }
    if (departmentId && !dept) {
      return NextResponse.json({ error: "Invalid department" }, { status: 400 });
    }
    if (designationId && !des) {
      return NextResponse.json({ error: "Invalid designation" }, { status: 400 });
    }
  }

  const token = generateInviteToken();
  const expiresAt = getInviteExpiresAt();

  const parsedAppointment = appointmentDate?.trim()
    ? new Date(appointmentDate)
    : null;
  const validAppointment =
    parsedAppointment && !Number.isNaN(parsedAppointment.getTime())
      ? parsedAppointment
      : null;

  await prisma.invite.create({
    data: {
      email,
      token,
      expiresAt,
      invitedById: auth.context!.user!.id,
      companyId: inviter.companyId,
      roleId: role.id,
      isSuperAdmin: false,
      employeeNumber: employeeNumber?.trim() || null,
      epfNumber: epfNumber?.trim() || null,
      locationId: locationId || null,
      departmentId: departmentId || null,
      designationId: designationId || null,
      appointmentDate: validAppointment,
    },
  });

  const activationUrl = `${baseUrl}/invite/activate?token=${token}`;
  const result = await sendInviteEmail(email, activationUrl);

  if (!result.success) {
    return NextResponse.json(
      { error: result.message ?? "Failed to send invite email" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
