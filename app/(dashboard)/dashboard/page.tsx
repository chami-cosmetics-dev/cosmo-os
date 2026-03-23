import { prisma } from "@/lib/prisma";
import { auth0 } from "@/lib/auth0";
import { DashboardStats } from "@/components/organisms/dashboard-stats";
import { getCurrentUserContext } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [session, context] = await Promise.all([
    auth0.getSession(),
    getCurrentUserContext(),
  ]);
  const companyId = context?.user?.companyId ?? null;

  let items: Array<{ id: string; name: string; createdAt?: string }> = [];
  if (session?.user && companyId) {
    try {
      const productItems = await prisma.productItem.findMany({
        where: { companyId },
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

  const stats = getDashboardCards(items.length);

  return (
    <section className="from-primary/10 to-background relative overflow-hidden rounded-2xl border bg-gradient-to-r p-5 sm:p-6">
      <div className="max-w-3xl space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
          Dashboard
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Overview</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Adjust filters and explore sales by location below. Other tools are in the sidebar.
        </p>
      </div>
    </section>
  );
}
