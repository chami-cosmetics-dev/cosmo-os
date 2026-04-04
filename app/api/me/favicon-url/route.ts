import { NextResponse } from "next/server";

import { isDatabaseUnavailableError } from "@/lib/dbObservability";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext } from "@/lib/rbac";

/**
 * Returns the current user's company favicon URL as JSON.
 * Used by FaviconUpdater to set the browser tab icon dynamically.
 */
export async function GET() {
  try {
    const context = await getCurrentUserContext();
    const companyId = context?.user?.companyId ?? null;
    if (!companyId) {
      return NextResponse.json({ url: null }, { status: 404 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { faviconUrl: true },
    });

    if (!company?.faviconUrl) {
      return NextResponse.json({ url: null }, { status: 404 });
    }

    return NextResponse.json(
      { url: company.faviconUrl },
      {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    if (!isDatabaseUnavailableError(error)) {
      console.error("Failed to load favicon URL:", error);
    }
    return NextResponse.json({ url: null }, { status: 404 });
  }
}
