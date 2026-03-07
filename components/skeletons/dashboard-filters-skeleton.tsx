import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardFiltersSkeleton() {
  return (
    <Card className="border-border/70 bg-card/95 py-0 shadow-sm">
      <CardContent className="px-4 py-5">
        <div className="grid gap-5 xl:grid-cols-[1.1fr_1.1fr_1.6fr_1.7fr_auto] xl:items-center">
          <div className="space-y-2">
            <Skeleton className="mx-auto h-4 w-24" />
            <Skeleton className="h-11 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="mx-auto h-4 w-20" />
            <Skeleton className="h-11 w-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="mx-auto h-4 w-24" />
            <div className="flex justify-center gap-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-32" />
            </div>
          </div>
          <div className="space-y-3">
            <Skeleton className="mx-auto h-4 w-28" />
            <div className="flex justify-center gap-4">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-36" />
            </div>
          </div>
          <div className="flex justify-center xl:justify-end">
            <Skeleton className="h-11 w-11" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
