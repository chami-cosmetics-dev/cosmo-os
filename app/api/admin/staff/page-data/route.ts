import { NextRequest, NextResponse } from "next/server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { limitSchema, pageSchema, sortOrderSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("staff.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const roleNames = auth.context!.roleNames as string[];
  const isSuperAdmin = roleNames.includes("super_admin");

  let companyId: string | null = null;
  if (!isSuperAdmin) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });
    companyId = user?.companyId ?? null;
    if (!companyId) {
      return NextResponse.json(
        { error: "No company associated with your account" },
        { status: 404 }
      );
    }
  }

  const searchParams = request.nextUrl.searchParams;
  const statusFilter = searchParams.get("status");
  const search = searchParams.get("search")?.trim() ?? "";

  const pageResult = pageSchema.safeParse(searchParams.get("page"));
  const limitResult = limitSchema.safeParse(searchParams.get("limit"));
  const sortBy = searchParams.get("sort_by")?.trim();
  const sortOrderResult = sortOrderSchema.safeParse(searchParams.get("sort_order"));
  const page = pageResult.success ? pageResult.data : 1;
  const limit = limitResult.success ? limitResult.data : 10;
  const sortOrder = sortOrderResult.success ? sortOrderResult.data : "asc";
  const skip = (page - 1) * limit;

  const SORT_FIELDS: Record<string, Prisma.UserOrderByWithRelationInput> = {
    name: { name: sortOrder },
    email: { email: sortOrder },
    employee_number: { employeeProfile: { employeeNumber: sortOrder } },
    department: { employeeProfile: { department: { name: sortOrder } } },
    designation: { employeeProfile: { designation: { name: sortOrder } } },
    location: { employeeProfile: { location: { name: sortOrder } } },
    appointment: { employeeProfile: { appointmentDate: sortOrder } },
    status: { employeeProfile: { status: sortOrder } },
  };
  const orderBy: Prisma.UserOrderByWithRelationInput =
    sortBy && sortBy in SORT_FIELDS ? SORT_FIELDS[sortBy]! : { name: "asc" };

  const andConditions: Prisma.UserWhereInput[] = [];
  if (companyId) andConditions.push({ companyId });
  if (search) {
    andConditions.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        {
          employeeProfile: {
            employeeNumber: { contains: search, mode: "insensitive" },
          },
        },
      ],
    });
  }
  if (statusFilter === "active") {
    andConditions.push({
      OR: [
        { employeeProfile: null },
        { employeeProfile: { status: "active" } },
      ],
    });
  } else if (statusFilter === "resigned") {
    andConditions.push({ employeeProfile: { status: "resigned" } });
  }

  const where: Prisma.UserWhereInput =
    andConditions.length === 0
      ? {}
      : andConditions.length === 1
        ? andConditions[0]!
        : { AND: andConditions };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
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
      orderBy,
      skip,
      take: limit,
    }),
  ]);

  const staff = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      nicNo: u.nicNo,
      gender: u.gender,
      dateOfBirth: u.dateOfBirth,
      mobile: u.mobile,
      knownName: u.knownName,
      shopifyUserIds: u.shopifyUserIds,
      couponCodes: u.couponCodes,
      userRoles: u.userRoles.map((ur) => ur.role),
      employeeProfile: u.employeeProfile
        ? {
            id: u.employeeProfile.id,
            employeeNumber: u.employeeProfile.employeeNumber,
            epfNumber: u.employeeProfile.epfNumber,
            locationId: u.employeeProfile.locationId,
            location: u.employeeProfile.location,
            departmentId: u.employeeProfile.departmentId,
            department: u.employeeProfile.department,
            designationId: u.employeeProfile.designationId,
            designation: u.employeeProfile.designation,
            appointmentDate: u.employeeProfile.appointmentDate,
            status: u.employeeProfile.status,
            resignedAt: u.employeeProfile.resignedAt,
            isRider: u.employeeProfile.isRider,
          }
        : null,
  }));

  const lookupsPromise = companyId
    ? Promise.all([
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
      : Promise.resolve([[], [], []] as const);

  const [locations, departments, designations] = await lookupsPromise;

  return NextResponse.json({
    staff,
    total,
    page,
    limit,
    locations,
    departments,
    designations,
  });
}
