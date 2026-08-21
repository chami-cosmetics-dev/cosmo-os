import { prisma } from "../lib/prisma";
import { fetchDashboardSalesByLocation } from "../lib/page-data/dashboard-sales";

async function main() {
  const company = await prisma.company.findFirst({ select: { id: true } });
  if (!company) throw new Error("no company");
  const result = await fetchDashboardSalesByLocation(company.id, {
    fromYmd: "2026-01-01",
    toYmd: "2026-08-21",
    dateType: "all_orders",
  });
  const totals = new Map<string, number>();
  for (const loc of result.locations) {
    for (const m of loc.merchants) {
      totals.set(m.merchantName, (totals.get(m.merchantName) ?? 0) + m.total);
    }
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  console.log(JSON.stringify(sorted.slice(0, 25), null, 2));
  console.log(
    "Unknown rows",
    JSON.stringify(
      sorted.filter((x) => /unknown/i.test(x[0])),
      null,
      2
    )
  );
  const grand = sorted.reduce((s, [, v]) => s + v, 0);
  console.log("grand", grand);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
