import { Loader2 } from "lucide-react";

/**
 * Shown when the dashboard layout is loading (auth check, getCurrentUserContext).
 * Gives users immediate feedback that navigation is in progress.
 */
export default function DashboardLayoutLoading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-8 animate-spin" aria-hidden />
      <p className="text-sm">Loading...</p>
    </div>
  );
}
