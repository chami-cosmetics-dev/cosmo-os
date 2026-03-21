import { DashboardStats } from "@/components/organisms/dashboard-stats";
import { getCurrentUserContext } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await getCurrentUserContext();
  const stats = getDashboardCards();

  return (
    <div className="space-y-6">
      <section className="from-primary/10 to-background relative overflow-hidden rounded-2xl border bg-gradient-to-r p-5 sm:p-6">
        <div className="max-w-3xl space-y-2">
          <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
            Dashboard
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Sales performance overview
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Monitor branch and merchant activity with live snapshots, filters, and chart-based comparisons.
          </p>
        </div>
      </section>
      <DashboardStats stats={stats} />
    </div>
  );
}

function getDashboardCards() {
  return [
    {
      shop: "Chami Trading Web",
      total: "99,415",
      agent: "DM - General",
      agentValue: "46,295",
      orderDate: "2026-02-26",
      completedDate: "2026-02-26",
      segments: [
        { value: 48, color: "#4f95bf" },
        { value: 26, color: "#06b06c" },
        { value: 26, color: "#f06a57" },
      ],
      footer: "Synced recent items",
    },
    {
      shop: "Cool Planet - Nugegoda",
      total: "22,450",
      agent: "Lihini",
      agentValue: "22,450",
      orderDate: "2026-02-25",
      completedDate: "2026-02-26",
      segments: [{ value: 100, color: "#4f95bf" }],
    },
    {
      shop: "Cosmetics.lk - Maharagama",
      total: "40,810",
      agent: "Kavishka",
      agentValue: "40,810",
      orderDate: "2026-02-24",
      completedDate: "2026-02-26",
      segments: [{ value: 100, color: "#4f95bf" }],
    },
    {
      shop: "Cosmetics.lk New Web",
      total: "47,205",
      agent: "DM - General",
      agentValue: "26,205",
      orderDate: "2026-02-26",
      completedDate: "2026-02-27",
      segments: [
        { value: 52, color: "#4f95bf" },
        { value: 28, color: "#06b06c" },
        { value: 20, color: "#f06a57" },
      ],
    },
    {
      shop: "Kiribathgoda Showroom",
      total: "14,800",
      agent: "Naduni",
      agentValue: "14,800",
      orderDate: "2026-02-23",
      completedDate: "2026-02-24",
      segments: [{ value: 100, color: "#4f95bf" }],
    },
    {
      shop: "Pepiliyana Shop",
      total: "55,345",
      agent: "Pepiliyana Outlet",
      agentValue: "51,600",
      orderDate: "2026-02-26",
      completedDate: "2026-02-28",
      segments: [
        { value: 84, color: "#f06a57" },
        { value: 16, color: "#4f95bf" },
      ],
    },
    {
      shop: "Pevi Trading Web",
      total: "114,918",
      agent: "Maheshi Priyadarshani",
      agentValue: "42,672.5",
      orderDate: "2026-02-27",
      completedDate: "2026-02-28",
      segments: [
        { value: 48, color: "#06b06c" },
        { value: 14, color: "#4f95bf" },
        { value: 38, color: "#f06a57" },
      ],
    },
    {
      shop: "SPK Trading Web",
      total: "18,340",
      agent: "Ishadi",
      agentValue: "10,500",
      orderDate: "2026-02-22",
      completedDate: "2026-02-25",
      segments: [
        { value: 44, color: "#f06a57" },
        { value: 56, color: "#4f95bf" },
      ],
    },
  ];
}
