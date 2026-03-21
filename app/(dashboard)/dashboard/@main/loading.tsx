import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardMainLoading() {
  return (
    <Card className="border-border/70 bg-card shadow-xs">
      <CardContent className="space-y-4 py-10">
        <Skeleton className="mx-auto h-4 w-48" />
        <Skeleton className="h-[280px] w-full rounded-md" />
      </CardContent>
    </Card>
  );
}
