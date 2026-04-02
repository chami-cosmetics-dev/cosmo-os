"use client";

import { useEffect } from "react";

function isDashboardPerfEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_DASHBOARD_PERF === "true";
}

type DashboardClientPerfProps = {
  initialDataSource: "server-prefetch" | "client-fetch";
};

export function DashboardClientPerf({ initialDataSource }: DashboardClientPerfProps) {
  useEffect(() => {
    if (!isDashboardPerfEnabled() || typeof window === "undefined") {
      return;
    }

    const navigation = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const paints = performance.getEntriesByType("paint");
    const paintMap = new Map(paints.map((entry) => [entry.name, Math.round(entry.startTime)]));

    const snapshot = {
      route: window.location.pathname,
      initialDataSource,
      domContentLoadedMs: navigation
        ? Math.round(
            navigation.domContentLoadedEventEnd - navigation.startTime,
          )
        : null,
      loadEventMs: navigation
        ? Math.round(navigation.loadEventEnd - navigation.startTime)
        : null,
      responseStartMs: navigation
        ? Math.round(navigation.responseStart - navigation.startTime)
        : null,
      responseEndMs: navigation
        ? Math.round(navigation.responseEnd - navigation.startTime)
        : null,
      firstPaintMs: paintMap.get("first-paint") ?? null,
      firstContentfulPaintMs: paintMap.get("first-contentful-paint") ?? null,
      mountedAtMs: Math.round(performance.now()),
    };

    console.groupCollapsed("[Perf] dashboard.client");
    console.table(snapshot);
    console.groupEnd();
  }, [initialDataSource]);

  return null;
}
