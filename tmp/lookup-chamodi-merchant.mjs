import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const u = await p.user.findFirst({
  where: {
    OR: [
      { email: "chamodi.cosmetics@outlook.com" },
      { name: { contains: "Chamodi", mode: "insensitive" } },
    ],
  },
  select: {
    id: true,
    name: true,
    email: true,
    couponCodes: true,
    wholesaleCouponCodes: true,
    userRoles: {
      select: {
        role: {
          select: {
            name: true,
            rolePermissions: {
              select: { permission: { select: { key: true } } },
            },
          },
        },
      },
    },
    employeeProfile: {
      select: {
        isShopMerchant: true,
        outletId: true,
        outlet: { select: { name: true } },
        outletAssignments: {
          select: { outlet: { select: { name: true } } },
        },
      },
    },
  },
});

const roles = (u?.userRoles ?? []).map((ur) => ur.role.name);
const perms = [
  ...new Set(
    (u?.userRoles ?? []).flatMap((ur) =>
      ur.role.rolePermissions.map((rp) => rp.permission.key),
    ),
  ),
].sort();
const merchantPerms = perms.filter(
  (k) =>
    k.includes("merchant") ||
    k === "dashboard.merchant_view" ||
    k === "book_notes.write" ||
    k === "book_notes.read",
);

console.log(
  JSON.stringify(
    {
      id: u?.id,
      name: u?.name,
      email: u?.email,
      roles,
      couponCodes: u?.couponCodes,
      wholesaleCouponCodes: u?.wholesaleCouponCodes,
      isShopMerchant: u?.employeeProfile?.isShopMerchant ?? null,
      outlet: u?.employeeProfile?.outlet?.name ?? null,
      outletAssignments:
        u?.employeeProfile?.outletAssignments?.map((a) => a.outlet.name) ?? [],
      merchantRelatedPermissions: merchantPerms,
    },
    null,
    2,
  ),
);

await p.$disconnect();
