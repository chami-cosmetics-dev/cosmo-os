import { PageSkeleton } from "@/components/skeletons/page-skeletons";

/**
 * Shown when navigating between dashboard pages (staff, settings, products, etc.).
 * Renders a skeleton that matches the target page layout.
 */
export default function DashboardPageLoading() {
  return <PageSkeleton />;
}
