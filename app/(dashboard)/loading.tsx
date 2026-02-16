import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown when the dashboard layout is loading (auth check, getCurrentUserContext).
 * Mimics the dashboard layout: sidebar area + main content skeleton.
 */
export default function DashboardLayoutLoading() {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar skeleton */}
      <div className="hidden w-64 shrink-0 border-r bg-muted/30 md:block">
        <div className="space-y-4 p-4">
          <Skeleton className="h-8 w-32" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </div>
      </div>
      {/* Main content skeleton */}
      <div className="flex-1 p-4">
        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
