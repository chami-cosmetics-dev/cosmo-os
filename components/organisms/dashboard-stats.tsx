import { StatCard } from "@/components/molecules/stat-card";

interface DashboardStatsProps {
  stats: {
    title: string;
    value: string | number;
    description?: string;
  }[];
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {stats.map((stat) => (
        <StatCard
          key={stat.title}
          title={stat.title}
          value={stat.value}
          description={stat.description}
        />
      ))}
    </div>
  );
}
