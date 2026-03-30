import { NextRequest, NextResponse } from "next/server";

import { requireRiderMobileSession } from "@/lib/mobile/api";
import { toMobileHandoverDto } from "@/lib/mobile/dto";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireRiderMobileSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const handover = await prisma.riderCashHandover.findFirst({
    where: { riderId: auth.session.userId },
    include: {
      items: {
        include: {
          companyLocation: {
            select: { id: true, name: true },
          },
        },
      },
    },
    orderBy: [{ handoverDate: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    handover: handover ? toMobileHandoverDto({ handover, items: handover.items }) : null,
  });
}
