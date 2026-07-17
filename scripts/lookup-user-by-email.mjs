import { PrismaClient } from "@prisma/client";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/lookup-user-by-email.mjs email@example.com");
  process.exit(1);
}

const prisma = new PrismaClient();

const user = await prisma.user.findUnique({
  where: { email },
  select: {
    id: true,
    email: true,
    name: true,
    auth0Id: true,
    companyId: true,
    createdAt: true,
    userRoles: { select: { role: { select: { name: true } } } },
  },
});

const invites = await prisma.invite.findMany({
  where: { email },
  select: {
    id: true,
    usedAt: true,
    createdAt: true,
    expiresAt: true,
    companyId: true,
    roleId: true,
  },
  orderBy: { createdAt: "desc" },
  take: 10,
});

console.log(
  JSON.stringify(
    {
      user: user
        ? {
            ...user,
            roles: user.userRoles.map((ur) => ur.role.name),
            userRoles: undefined,
          }
        : null,
      invites,
    },
    null,
    2,
  ),
);
await prisma.$disconnect();
