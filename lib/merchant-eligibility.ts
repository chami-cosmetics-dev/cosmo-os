import type { Prisma } from "@prisma/client";

const ELIGIBLE_DEPARTMENT_KEYS = new Set([
  "digitalmarketing",
  "salesmarketing",
  "salsemarketing",
]);

function normalizeDepartmentName(name: string | null | undefined) {
  return (name ?? "").toLowerCase().replace(/[^a-z]/g, "");
}

export function isEligibleMerchantDepartmentName(name: string | null | undefined) {
  return ELIGIBLE_DEPARTMENT_KEYS.has(normalizeDepartmentName(name));
}

export function eligibleMerchantUserWhere(companyId?: string | null): Prisma.UserWhereInput {
  return {
    ...(companyId ? { companyId } : {}),
    employeeProfile: {
      is: {
        department: {
          is: {
            OR: [
              { name: { contains: "Digital Marketing", mode: "insensitive" } },
              {
                AND: [
                  { name: { contains: "Sales", mode: "insensitive" } },
                  { name: { contains: "Marketing", mode: "insensitive" } },
                ],
              },
              {
                AND: [
                  { name: { contains: "Salse", mode: "insensitive" } },
                  { name: { contains: "Marketing", mode: "insensitive" } },
                ],
              },
            ],
          },
        },
      },
    },
  };
}

export async function assertEligibleMerchantUser(
  prisma: Pick<Prisma.TransactionClient, "user">,
  input: { userId: string; companyId: string }
) {
  const user = await prisma.user.findFirst({
    where: {
      id: input.userId,
      companyId: input.companyId,
    },
    select: {
      id: true,
      employeeProfile: {
        select: {
          department: { select: { name: true } },
        },
      },
    },
  });

  if (!user) return false;
  return isEligibleMerchantDepartmentName(user.employeeProfile?.department?.name);
}
