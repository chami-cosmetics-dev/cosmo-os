import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

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
  const statusFilter = searchParams.get("status"); // "active" | "resigned" | null (all)
  const search = searchParams.get("search")?.trim() ?? "";

  const where = {
    ...(companyId ? { companyId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            {
              employeeProfile: {
                employeeNumber: { contains: search, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {}),
    ...(statusFilter === "active"
      ? {
          OR: [
            { employeeProfile: null },
            { employeeProfile: { status: "active" as const } },
          ],
        }
      : {}),
    ...(statusFilter === "resigned"
      ? { employeeProfile: { status: "resigned" as const } }
      : {}),
  };

  const users = await prisma.user.findMany({
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
    orderBy: { name: "asc" },
  });

  const staff = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    nicNo: u.nicNo,
    gender: u.gender,
    dateOfBirth: u.dateOfBirth,
    mobile: u.mobile,
    knownName: u.knownName,
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
        }
      : null,
  }));

  return NextResponse.json(staff);
}
