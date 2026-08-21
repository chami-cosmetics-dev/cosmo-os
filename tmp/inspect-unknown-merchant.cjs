const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const groups = await p.merchantGroup.findMany({ select: { id: true, name: true } });
  console.log("groups", groups);

  const unknownNamed = await p.user.findMany({
    where: {
      OR: [
        { knownName: { equals: "Unknown", mode: "insensitive" } },
        { name: { equals: "Unknown", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      knownName: true,
      name: true,
      email: true,
      couponCodes: true,
    },
    take: 20,
  });
  console.log("users named Unknown", unknownNamed);

  const noDisplay = await p.user.findMany({
    where: {
      AND: [
        { OR: [{ knownName: null }, { knownName: "" }] },
        { OR: [{ name: null }, { name: "" }] },
        { OR: [{ email: null }, { email: "" }] },
        { couponCodes: { isEmpty: false } },
      ],
    },
    select: { id: true, knownName: true, name: true, email: true, couponCodes: true },
    take: 20,
  });
  console.log("coupon users with blank display", noDisplay);

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
