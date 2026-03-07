"use client";

import { usePathname } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatsSkeleton } from "./stats-skeleton";
import { TableSkeleton } from "./table-skeleton";
import { CardSkeleton } from "./card-skeleton";

/**
 * Renders a skeleton that matches the layout of the target page.
 * Uses pathname to show the appropriate skeleton during navigation.
 */
export function PageSkeleton() {
  const pathname = usePathname();

  // Dashboard home: stats + recent items card
  if (pathname === "/dashboard" || pathname === "/dashboard/") {
    return (
      <div className="space-y-6">
        <StatsSkeleton count={3} />
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between rounded-md border p-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Staff: card with search, filters, table
  if (pathname.startsWith("/dashboard/staff")) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 w-64" />
              <Skeleton className="h-9 w-28" />
            </div>
            <TableSkeleton columns={6} rows={6} />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Users: card with tabs/table
  if (pathname.startsWith("/dashboard/users")) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-80" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-20" />
            </div>
            <TableSkeleton columns={4} rows={6} />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Settings: multiple cards
  if (pathname.startsWith("/dashboard/settings") && !pathname.includes("email-templates") && !pathname.includes("sms-portal")) {
    return (
      <div className="space-y-6">
        <CardSkeleton title description contentLines={4} />
        <CardSkeleton title description contentLines={2} />
        <CardSkeleton title description contentLines={2} />
      </div>
    );
  }

  // Email templates / SMS portal
  if (pathname.includes("email-templates") || pathname.includes("sms-portal")) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full max-w-lg" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Product items: card with search, filters, table
  if (pathname.startsWith("/dashboard/products/items")) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 flex-1 min-w-[200px]" />
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-32" />
            </div>
            <TableSkeleton columns={8} rows={6} />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Vendors & categories: tabs + table
  if (pathname.startsWith("/dashboard/products/vendors-categories")) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-80" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-24" />
            </div>
            <TableSkeleton columns={3} rows={8} />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Profile
  if (pathname.startsWith("/dashboard/profile")) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-4 w-24 shrink-0" />
                <Skeleton className="h-9 flex-1" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Default: generic card + table
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <TableSkeleton columns={5} rows={6} />
        </CardContent>
      </Card>
    </div>
  );
}
