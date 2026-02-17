import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, LIMITS } from "@/lib/validation";

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

const shopifyUserIdSchema = z
  .string()
  .trim()
  .max(LIMITS.shopifyUserId.max)
  .refine((s) => s.length > 0, "Shopify User ID cannot be empty");

const couponCodeSchema = z
  .string()
  .trim()
  .max(LIMITS.couponCode.max)
  .refine((s) => s.length > 0, "Coupon code cannot be empty");

const updateStaffSchema = z.object({
  name: z.string().max(LIMITS.name.max).optional(),
  knownName: z.string().max(LIMITS.knownName.max).optional(),
  nicNo: z.string().max(LIMITS.nicNo.max).optional(),
  gender: z.string().max(LIMITS.gender.max).optional(),
  dateOfBirth: z.string().optional(),
  mobile: z.string().max(LIMITS.mobile.max).optional(),
  employeeNumber: z.string().max(LIMITS.employeeNumber.max).optional(),
  epfNumber: z.string().max(LIMITS.epfNumber.max).optional(),
  locationId: cuidSchema.nullable().optional(),
  departmentId: cuidSchema.nullable().optional(),
  designationId: cuidSchema.nullable().optional(),
  appointmentDate: z.string().optional(),
  isRider: z.boolean().optional(),
  shopifyUserIds: z
    .array(shopifyUserIdSchema)
    .max(20)
    .optional()
    .transform((v) => v ?? []),
  couponCodes: z
    .array(couponCodeSchema)
    .max(20)
    .optional()
    .transform((v) => v ?? []),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requirePermission("staff.read");
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

  const user = await prisma.user.findUnique({
    where: { id: idResult.data },
    include: {
      userRoles: { include: { role: true } },
      employeeProfile: {
        include: {
          location: true,
          department: true,
          designation: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!isSuperAdmin && currentUserCompanyId && user.companyId !== currentUserCompanyId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const companyId = user.companyId;
  const lookups =
    companyId && isSuperAdmin
      ? await Promise.all([
          prisma.companyLocation.findMany({
            where: { companyId },
            orderBy: { name: "asc" },
            select: { id: true, name: true, address: true },
          }),
          prisma.department.findMany({
            where: { companyId },
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          }),
          prisma.designation.findMany({
            where: { companyId },
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          }),
        ])
      : null;

  const [locations, departments, designations] = lookups ?? [[], [], []];

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    nicNo: user.nicNo,
    gender: user.gender,
    dateOfBirth: user.dateOfBirth,
    mobile: user.mobile,
    knownName: user.knownName,
    shopifyUserIds: user.shopifyUserIds,
    couponCodes: user.couponCodes,
    companyId: user.companyId,
    userRoles: user.userRoles.map((ur) => ur.role),
    employeeProfile: user.employeeProfile,
    ...(lookups && {
      locations,
      departments,
      designations,
    }),
  });
}

export async function PATCH(
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
    include: { employeeProfile: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!isSuperAdmin && currentUserCompanyId && targetUser.companyId !== currentUserCompanyId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const companyId = targetUser.companyId ?? currentUserCompanyId;
  if (!companyId) {
    return NextResponse.json(
      { error: "User has no company association" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = updateStaffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const parsedDob = data.dateOfBirth?.trim() ? new Date(data.dateOfBirth) : null;
  const validDob =
    parsedDob && !Number.isNaN(parsedDob.getTime()) ? parsedDob : undefined;
  const parsedAppointment =
    data.appointmentDate?.trim() ? new Date(data.appointmentDate) : null;
  const validAppointment =
    parsedAppointment && !Number.isNaN(parsedAppointment.getTime())
      ? parsedAppointment
      : undefined;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: idResult.data },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() || null }),
        ...(data.knownName !== undefined && { knownName: data.knownName?.trim() || null }),
        ...(data.nicNo !== undefined && { nicNo: data.nicNo?.trim() || null }),
        ...(data.gender !== undefined && { gender: data.gender?.trim() || null }),
        ...(data.dateOfBirth !== undefined && { dateOfBirth: validDob ?? null }),
        ...(data.mobile !== undefined && { mobile: data.mobile?.trim() || null }),
        ...(data.shopifyUserIds !== undefined && { shopifyUserIds: data.shopifyUserIds }),
        ...(data.couponCodes !== undefined && { couponCodes: data.couponCodes }),
      },
    });

    const profileData = {
      employeeNumber: data.employeeNumber?.trim() || null,
      epfNumber: data.epfNumber?.trim() || null,
      locationId: data.locationId ?? undefined,
      departmentId: data.departmentId ?? undefined,
      designationId: data.designationId ?? undefined,
      appointmentDate: validAppointment ?? undefined,
      ...(data.isRider !== undefined && { isRider: data.isRider }),
    };

    if (targetUser.employeeProfile) {
      await tx.employeeProfile.update({
        where: { id: targetUser.employeeProfile.id },
        data: profileData,
      });
    } else {
      await tx.employeeProfile.create({
        data: {
          userId: idResult.data,
          companyId,
          ...profileData,
        },
      });
    }
  });

  const updated = await prisma.user.findUnique({
    where: { id: idResult.data },
    include: {
      userRoles: { include: { role: true } },
      employeeProfile: {
        include: {
          location: true,
          department: true,
          designation: true,
        },
      },
    },
  });

  return NextResponse.json(updated);
}
