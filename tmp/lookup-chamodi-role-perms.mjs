import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const roles = await p.role.findMany({
  where: { name: { in: ["ba-level-02", "beauty-consult", "ba_level_2"] } },
  select: {
    name: true,
    rolePermissions: {
      select: { permission: { select: { key: true } } },
    },
  },
});

for (const r of roles) {
  const keys = r.rolePermissions.map((rp) => rp.permission.key).sort();
  const merchantish = keys.filter(
    (k) =>
      k.includes("merchant") ||
      k.startsWith("dashboard.merchant") ||
      k.includes("book_notes") ||
      k.includes("contact"),
  );
  console.log("\nROLE:", r.name);
  console.log("merchant-ish:", merchantish);
  console.log("all count:", keys.length);
}

const profile = await p.employeeProfile.findFirst({
  where: { user: { email: "chamodi.cosmetics@outlook.com" } },
  select: {
    isShopMerchant: true,
    outletId: true,
    department: { select: { name: true } },
    designation: { select: { name: true } },
    location: { select: { name: true, shortName: true } },
  },
});
console.log("\nPROFILE:", JSON.stringify(profile, null, 2));

await p.$disconnect();
