import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserContext } from "@/lib/rbac";

/**
 * Returns the current user's company favicon URL as JSON.
 * Used by FaviconUpdater to set the browser tab icon dynamically.
 */
export async function GET() {
  try {
    const context = await getCurrentUserContext();
    if (!context?.user?.id) {
      return NextResponse.json({ url: null }, { status: 404 });
    }

    const user = await prisma.user.findUnique({
      where: { id: context.user.id },
      select: { companyId: true },
    });

    if (!user?.companyId) {
      return NextResponse.json({ url: null }, { status: 404 });
    }

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { faviconUrl: true },
    });

    if (!company?.faviconUrl) {
      return NextResponse.json({ url: null }, { status: 404 });
    }

    return NextResponse.json({ url: company.faviconUrl });
  } catch {
    return NextResponse.json({ url: null }, { status: 404 });
  }
}
