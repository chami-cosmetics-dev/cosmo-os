import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("staff.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const roleNames = auth.context!.roleNames as string[];
  const isSuperAdmin = roleNames.includes("super_admin");
  const hasCompanyAccess = hasPermission(auth.context, "settings.company");

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

  const staffPromise = (async () => {
    const users = await prisma.user.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                {
                  employeeProfile: {
                    employeeNumber: { contains: search, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
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

    let filtered = users;
    if (statusFilter === "active" || statusFilter === "resigned") {
      filtered = users.filter((u) => {
        const profile = u.employeeProfile;
        if (!profile) return statusFilter === "active";
        return profile.status === statusFilter;
      });
    }

    return filtered.map((u) => ({
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
  })();

  const lookupsPromise =
    companyId && hasCompanyAccess
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

  const [staff, [locations, departments, designations]] = await Promise.all([
    staffPromise,
    lookupsPromise,
  ]);

  return NextResponse.json({
    staff,
    locations,
    departments,
    designations,
  });
}
