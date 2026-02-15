import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface CardSkeletonProps {
  title?: boolean;
  description?: boolean;
  contentLines?: number;
}

export function CardSkeleton({
  title = true,
  description = false,
  contentLines = 3,
}: CardSkeletonProps) {
  return (
    <Card>
      <CardHeader className="space-y-2">
        {title && <Skeleton className="h-5 w-32" />}
        {description && <Skeleton className="h-4 w-full max-w-md" />}
      </CardHeader>
      <CardContent className="space-y-2">
        {Array.from({ length: contentLines }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-4"
            style={{ width: i === contentLines - 1 ? "75%" : "100%" }}
          />
        ))}
      </CardContent>
    </Card>
  );
}
