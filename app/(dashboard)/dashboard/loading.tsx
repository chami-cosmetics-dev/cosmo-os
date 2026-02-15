import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown when navigating between dashboard pages (staff, settings, products, etc.).
 * Renders inside the dashboard layout so sidebar/topbar stay visible.
 */
export default function DashboardPageLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin" aria-hidden />
          <p className="text-sm">Loading...</p>
        </div>
      </div>
    </div>
  );
}
