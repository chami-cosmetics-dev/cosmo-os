const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const group = await p.merchantGroup.findFirst({
    where: { name: "DM General" },
    select: {
      name: true,
      members: {
        select: {
          user: {
            select: {
              id: true,
              knownName: true,
              name: true,
              email: true,
              couponCodes: true,
            },
          },
        },
      },
    },
  });
  console.log(
    "DM General members",
    (group?.members ?? []).map((m) => ({
      knownName: m.user.knownName,
      name: m.user.name,
      coupons: m.user.couponCodes,
    }))
  );

  const staff = await p.merchantGroup.findFirst({
    where: { name: "Staff Sales" },
    select: {
      members: {
        select: {
          user: { select: { knownName: true, name: true, couponCodes: true } },
        },
      },
    },
  });
  console.log(
    "Staff Sales members",
    (staff?.members ?? []).map((m) => ({
      knownName: m.user.knownName,
      coupons: m.user.couponCodes,
    }))
  );

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
