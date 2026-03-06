"use client";

import * as React from "react";

import { PageSkeleton } from "@/components/skeletons/page-skeletons";

export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isHydrated, setIsHydrated] = React.useState(false);

  React.useEffect(() => {
    setIsHydrated(true);
  }, []);

  if (!isHydrated) {
    return <PageSkeleton />;
  }

  return <>{children}</>;
}
