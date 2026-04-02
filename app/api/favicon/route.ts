import { NextResponse } from "next/server";

import { isDatabaseUnavailableError } from "@/lib/dbObservability";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext } from "@/lib/rbac";

/**
 * Returns the current user's company favicon.
 * Used as the browser tab icon (favicon) when the user is logged in.
 * Returns 404 when not authenticated or no favicon is set.
 */
export async function GET() {
  try {
    const context = await getCurrentUserContext();
    const companyId = context?.user?.companyId ?? null;
    if (!companyId) {
      return new NextResponse(null, { status: 404 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { faviconUrl: true },
    });

    if (!company?.faviconUrl) {
      return new NextResponse(null, { status: 404 });
    }

    return NextResponse.redirect(company.faviconUrl, {
      status: 302,
      headers: {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    if (!isDatabaseUnavailableError(error)) {
      console.error("Failed to load favicon redirect:", error);
    }
    return new NextResponse(null, { status: 404 });
  }
}
