const { PrismaClient } = require("@prisma/client");
const url = process.env.DATABASE_URL || "";
const p = new PrismaClient({
  datasources: { db: { url: url.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || url } },
});
const KEEP_ID = "cms8tkvdd004ejy04nkwtd7wz";
function digits(v) {
  let d = String(v||"").replace(/\D/g,"");
  if (d.startsWith("94") && d.length >= 11) d = d.slice(2);
  if (d.length === 9) d = "0"+d;
  return d;
}
(async () => {
  const c = await p.contactMaster.findUnique({
    where: { id: KEEP_ID },
    select: { phoneNumber: true, assignedMerchant: true, lastPurchaseAt: true, phones: true },
  });
  console.log("before", JSON.stringify(c, null, 2));
  const primaryKey = digits(c.phoneNumber);
  const seen = new Set([primaryKey]);
  for (const ph of c.phones) {
    const k = digits(ph.phoneNumber);
    if (seen.has(k)) {
      await p.contactPhone.delete({ where: { id: ph.id } });
      console.log("deleted duplicate secondary", ph.phoneNumber);
    } else {
      seen.add(k);
    }
  }
  const after = await p.contactMaster.findUnique({
    where: { id: KEEP_ID },
    select: { phoneNumber: true, assignedMerchant: true, lastPurchaseAt: true, phones: true },
  });
  console.log("after", JSON.stringify(after, null, 2));
  await p.$disconnect();
})().catch(e=>{console.error(e);process.exit(1);});
