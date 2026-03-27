import type { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export type StaffPageParams = {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  status?: string | null;
  search?: string | null;
};

const getStaffPageLookups = unstable_cache(
  async (companyId: string) => {
    const [locations, departments, designations] = await Promise.all([
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
    ]);

    return {
      locations,
      departments,
      designations,
    };
  },
  ["staff-page-lookups"],
  { revalidate: 60 }
);

export async function fetchStaffPageData(
  companyId: string | null,
  params: StaffPageParams = {}
) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 10;
  const sortOrder = params.sortOrder ?? "asc";
  const sortBy = params.sortBy?.trim();
  const statusFilter = params.status;
  const search = params.search?.trim() ?? "";
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
    dateOfBirth: u.dateOfBirth?.toISOString() ?? null,
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
          appointmentDate: u.employeeProfile.appointmentDate?.toISOString() ?? null,
          status: u.employeeProfile.status,
          resignedAt: u.employeeProfile.resignedAt?.toISOString() ?? null,
          isRider: u.employeeProfile.isRider,
        }
      : null,
  }));

  const lookupsPromise = companyId
    ? getStaffPageLookups(companyId)
    : Promise.resolve([
        [] as { id: string; name: string; address: string | null }[],
        [] as { id: string; name: string }[],
        [] as { id: string; name: string }[],
      ] as const).then(([locations, departments, designations]) => ({
        locations,
        departments,
        designations,
      }));

  const { locations, departments, designations } = await lookupsPromise;

  return {
    staff,
    total,
    page,
    limit,
    locations: locations.map((loc) => {
      const l = loc as { id: string; name: string; address?: string | null };
      return { id: l.id, name: l.name, address: l.address ?? null };
    }),
    departments: [...departments],
    designations: [...designations],
  };
}
