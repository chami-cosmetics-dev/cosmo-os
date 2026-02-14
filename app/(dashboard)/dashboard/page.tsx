import { prisma } from "@/lib/prisma";
import { DashboardStats } from "@/components/organisms/dashboard-stats";
import { RecentItemsList } from "@/components/organisms/recent-items-list";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let items: Awaited<ReturnType<typeof prisma.item.findMany>> = [];
  try {
    items = await prisma.item.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
    });
  } catch {
    // Database may not be set up yet
  }

  const stats = getDummyStats();

  return (
    <div className="space-y-6">
      <DashboardStats stats={stats} />
      <RecentItemsList
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          createdAt: i.createdAt.toISOString(),
        }))}
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
