import { NextResponse } from "next/server";

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
    if (!context?.user?.id) {
      return new NextResponse(null, { status: 404 });
    }

    const user = await prisma.user.findUnique({
      where: { id: context.user.id },
      select: { companyId: true },
    });

    if (!user?.companyId) {
      return new NextResponse(null, { status: 404 });
    }

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { faviconUrl: true },
    });

    if (!company?.faviconUrl) {
      return new NextResponse(null, { status: 404 });
    }

    return NextResponse.redirect(company.faviconUrl, 302);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
