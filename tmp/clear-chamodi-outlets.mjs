import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const u = await p.user.findFirst({
  where: { email: "chamodi.cosmetics@outlook.com" },
  select: {
    id: true,
    name: true,
    employeeProfile: {
      select: {
        id: true,
        isShopMerchant: true,
        outletId: true,
        activeOutletDateKey: true,
        outlet: { select: { name: true } },
        outletAssignments: { select: { outlet: { select: { name: true } } } },
      },
    },
  },
});

if (!u?.employeeProfile) {
  console.log("No profile found");
  await p.$disconnect();
  process.exit(1);
}

const before = {
  isShopMerchant: u.employeeProfile.isShopMerchant,
  outlet: u.employeeProfile.outlet?.name ?? null,
  assignments: u.employeeProfile.outletAssignments.map((a) => a.outlet.name),
  activeOutletDateKey: u.employeeProfile.activeOutletDateKey,
};
console.log("BEFORE", before);

await p.employeeProfileOutlet.deleteMany({
  where: { employeeProfileId: u.employeeProfile.id },
});
await p.employeeProfile.update({
  where: { id: u.employeeProfile.id },
  data: {
    outletId: null,
    activeOutletDateKey: null,
    isShopMerchant: false,
  },
});

const after = await p.employeeProfile.findUnique({
  where: { id: u.employeeProfile.id },
  select: {
    isShopMerchant: true,
    outletId: true,
    activeOutletDateKey: true,
    outletAssignments: { select: { outlet: { select: { name: true } } } },
  },
});
console.log("AFTER", after);

await p.$disconnect();
