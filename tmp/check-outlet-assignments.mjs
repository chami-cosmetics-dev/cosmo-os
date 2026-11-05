import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Simulate serialize for users that look like shop merchants
const profiles = await prisma.employeeProfile.findMany({
  where: { outletId: { not: null } },
  take: 5,
  select: {
    id: true,
    outletId: true,
    outlet: { select: { id: true, name: true } },
    outletAssignments: {
      select: { outlet: { select: { id: true, name: true } } },
    },
    user: { select: { email: true, name: true } },
  },
});

const companyOutlets = await prisma.outlet.findMany({
  select: { id: true, name: true },
  orderBy: { name: "asc" },
});

for (const p of profiles) {
  const byId = new Map();
  for (const row of p.outletAssignments) byId.set(row.outlet.id, row.outlet);
  if (p.outlet) byId.set(p.outlet.id, p.outlet);
  const assigned = [...byId.values()];
  console.log({
    email: p.user.email,
    outletId: p.outletId,
    assignedCount: assigned.length,
    assignedNames: assigned.map((o) => o.name),
    companyCount: companyOutlets.length,
  });
}

await prisma.$disconnect();
