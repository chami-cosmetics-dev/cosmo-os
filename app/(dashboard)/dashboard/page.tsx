import { prisma } from "@/lib/prisma";
import { auth0 } from "@/lib/auth0";
import { DashboardStats } from "@/components/organisms/dashboard-stats";
import { RecentItemsList } from "@/components/organisms/recent-items-list";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth0.getSession();
  const user = session?.user ? await prisma.user.findUnique({
    where: { auth0Id: session.user.sub! },
    select: { companyId: true },
  }) : null;

  let items: Array<{ id: string; name: string; createdAt?: string }> = [];
  if (user?.companyId) {
    try {
      const productItems = await prisma.productItem.findMany({
        where: { companyId: user.companyId },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          productTitle: true,
          variantTitle: true,
          updatedAt: true,
        },
      });
      items = productItems.map((i) => ({
        id: i.id,
        name: i.variantTitle ? `${i.productTitle} (${i.variantTitle})` : i.productTitle,
        createdAt: i.updatedAt.toISOString(),
      }));
    } catch {
      // Database may not be set up yet
    }
  }

  const stats = getDummyStats();

  return (
    <div className="space-y-6">
      <DashboardStats stats={stats} />
      <RecentItemsList
        items={items}
      />
    </div>
  );
}

function getDummyStats() {
  return [
    { title: "Total Users", value: "2,350", description: "+180 from last month" },
    { title: "Revenue", value: "$12,234", description: "+19% from last month" },
    { title: "Orders", value: "573", description: "+201 since last hour" },
  ];
}
