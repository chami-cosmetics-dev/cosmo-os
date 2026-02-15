import { NextResponse } from "next/server";
import { z } from "zod";

import { createAuth0User } from "@/lib/auth0-management";
import { prisma } from "@/lib/prisma";
import { ensureDefaultRbacSetup } from "@/lib/rbac";
import { isPasswordStrong } from "@/lib/invite-utils";
import {
  inviteTokenSchema,
  passwordSchema,
  trimmedString,
  LIMITS,
} from "@/lib/validation";

const activateSchema = z.object({
  token: inviteTokenSchema,
  firstName: trimmedString(1, LIMITS.name.max),
  lastName: trimmedString(1, LIMITS.name.max),
  password: passwordSchema,
  confirmPassword: z.string(),
  nicNo: z.string().max(LIMITS.nicNo.max).optional(),
  gender: z.string().max(LIMITS.gender.max).optional(),
  dateOfBirth: z.string().optional(),
  mobile: z.string().max(LIMITS.mobile.max).optional(),
  knownName: z.string().max(LIMITS.knownName.max).optional(),
  companyName: z.string().max(LIMITS.companyName.max).optional(),
  employeeSize: z.string().max(LIMITS.employeeSize.max).optional(),
  address: z.string().max(LIMITS.address.max).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = activateSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const {
    token,
    firstName,
    lastName,
    password,
    confirmPassword,
    nicNo,
    gender,
    dateOfBirth,
    mobile,
    knownName,
    companyName,
    employeeSize,
    address,
  } = parsed.data;

  const parsedDob = dateOfBirth?.trim()
    ? new Date(dateOfBirth)
    : null;
  const validDob =
    parsedDob && !Number.isNaN(parsedDob.getTime()) ? parsedDob : null;

  if (password !== confirmPassword) {
    return NextResponse.json(
      { error: "Passwords do not match" },
      { status: 400 }
    );
  }

  if (!isPasswordStrong(password)) {
    return NextResponse.json(
      {
        error:
          "Password must be at least 8 characters with uppercase, lowercase, and a number",
      },
      { status: 400 }
    );
  }

  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { role: true },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  if (invite.usedAt) {
    return NextResponse.json({ error: "Invite already used" }, { status: 400 });
  }

  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invite expired" }, { status: 400 });
  }

  if (invite.isSuperAdmin && (!companyName?.trim() || !address?.trim())) {
    return NextResponse.json(
      {
        error: "Company name and address are required for Super Admin setup",
      },
      { status: 400 }
    );
  }

  try {
    const { userId: auth0Id } = await createAuth0User({
      email: invite.email,
      password,
      givenName: firstName,
      familyName: lastName,
    });

    await ensureDefaultRbacSetup();

    const user = await prisma.user.create({
      data: {
        auth0Id,
        email: invite.email,
        name: `${firstName} ${lastName}`.trim(),
        nicNo: nicNo?.trim() || null,
        gender: gender?.trim() || null,
        dateOfBirth: validDob,
        mobile: mobile?.trim() || null,
        knownName: knownName?.trim() || null,
        companyId: !invite.isSuperAdmin && invite.companyId ? invite.companyId : undefined,
      },
    });

    if (invite.isSuperAdmin && companyName && address) {
      const company = await prisma.company.create({
        data: {
          name: companyName,
          employeeSize: employeeSize ?? null,
          address,
          createdById: user.id,
        },
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { companyId: company.id },
      });
    }

    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: invite.roleId,
      },
    });

    const companyIdForProfile =
      invite.isSuperAdmin && companyName && address
        ? (await prisma.company.findFirst({
            where: { createdById: user.id },
            select: { id: true },
          }))?.id
        : invite.companyId;

    if (
      companyIdForProfile &&
      (invite.employeeNumber ||
        invite.epfNumber ||
        invite.locationId ||
        invite.departmentId ||
        invite.designationId ||
        invite.appointmentDate)
    ) {
      await prisma.employeeProfile.create({
        data: {
          userId: user.id,
          companyId: companyIdForProfile,
          employeeNumber: invite.employeeNumber?.trim() || null,
          epfNumber: invite.epfNumber?.trim() || null,
          locationId: invite.locationId || null,
          departmentId: invite.departmentId || null,
          designationId: invite.designationId || null,
          appointmentDate: invite.appointmentDate || null,
        },
      });
    }

    await prisma.invite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Activation failed:", error);
    const message =
      error instanceof Error ? error.message : "Activation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
