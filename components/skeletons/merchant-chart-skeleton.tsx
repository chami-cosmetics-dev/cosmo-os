import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface MerchantChartSkeletonProps {
  count?: number;
}

export function MerchantChartSkeleton({
  count = 8,
}: MerchantChartSkeletonProps) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader className="items-center space-y-2 px-5 pt-4 pb-2 text-center">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-6 w-24" />
          </CardHeader>
          <CardContent className="px-5 pb-5 pt-3">
            <div className="mx-auto flex flex-col items-center">
              <Skeleton className="h-52 w-52 rounded-full" />
              <div className="mt-4 flex flex-col items-center gap-2">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
