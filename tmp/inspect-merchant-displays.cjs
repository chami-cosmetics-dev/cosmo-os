const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

function getMerchantDisplayName(user) {
  return (
    user?.knownName?.trim() ||
    user?.name?.trim() ||
    user?.email?.trim() ||
    user?.id?.trim() ||
    "Unknown"
  );
}

(async () => {
  const users = await p.user.findMany({
    where: { couponCodes: { isEmpty: false } },
    select: {
      id: true,
      knownName: true,
      name: true,
      email: true,
      couponCodes: true,
      merchantGroupMembership: { select: { group: { select: { name: true } } } },
    },
  });

  const rows = users.map((u) => ({
    display: getMerchantDisplayName(u),
    knownName: u.knownName,
    name: u.name,
    email: u.email,
    group: u.merchantGroupMembership?.group?.name ?? null,
    coupons: u.couponCodes,
  }));

  const unknownish = rows.filter(
    (r) =>
      r.display === "Unknown" ||
      !r.knownName ||
      r.display.startsWith("cm") ||
      r.display.includes("@")
  );
  console.log("suspicious displays", JSON.stringify(unknownish, null, 2));
  console.log(
    "all displays sample",
    rows.map((r) => r.display).sort()
  );

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
