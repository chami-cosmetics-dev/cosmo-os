import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardFiltersLoading() {
  return (
    <Card className="border-border/70 bg-card shadow-xs">
      <CardHeader className="space-y-1 border-b pb-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-full max-w-md" />
      </CardHeader>
      <CardContent className="border-primary/55 grid gap-4 border-t-4 p-4 md:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}
