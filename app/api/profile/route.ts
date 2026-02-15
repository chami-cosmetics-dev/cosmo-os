import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext } from "@/lib/rbac";
import { profileUpdateSchema } from "@/lib/validation";

export async function GET(_request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.sessionUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!context.user) {
    return NextResponse.json(
      { error: "RBAC database is not initialized" },
      { status: 503 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: context.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      picture: true,
      nicNo: true,
      gender: true,
      dateOfBirth: true,
      mobile: true,
      knownName: true,
      userRoles: {
        include: {
          role: { select: { id: true, name: true } },
        },
      },
      employeeProfile: {
        include: {
          location: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
          designation: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    picture: user.picture,
    nicNo: user.nicNo,
    gender: user.gender,
    dateOfBirth: user.dateOfBirth,
    mobile: user.mobile,
    knownName: user.knownName,
    roles: user.userRoles.map((ur) => ur.role),
    employeeProfile: user.employeeProfile
      ? {
          employeeNumber: user.employeeProfile.employeeNumber,
          epfNumber: user.employeeProfile.epfNumber,
          location: user.employeeProfile.location,
          department: user.employeeProfile.department,
          designation: user.employeeProfile.designation,
          appointmentDate: user.employeeProfile.appointmentDate,
        }
      : null,
  });
}

export async function PATCH(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.sessionUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!context.user) {
    return NextResponse.json(
      { error: "RBAC database is not initialized" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { name, knownName, nicNo, gender, dateOfBirth, mobile } = parsed.data;

  const parsedDob = dateOfBirth?.trim()
    ? new Date(dateOfBirth)
    : null;
  const validDob =
    parsedDob && !Number.isNaN(parsedDob.getTime()) ? parsedDob : null;

  await prisma.user.update({
    where: { id: context.user.id },
    data: {
      name: name.trim(),
      knownName: knownName?.trim() || null,
      nicNo: nicNo?.trim() || null,
      gender: gender?.trim() || null,
      dateOfBirth: validDob,
      mobile: mobile?.trim() || null,
    },
  });

  return NextResponse.json({ success: true });
}
