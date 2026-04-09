import { NextRequest } from "next/server";

import { verifyAuth0Password } from "@/lib/auth0-management";
import { mobileError, mobileSessionResponse } from "@/lib/mobile/api";
import { createRiderMobileSession } from "@/lib/mobile/auth";
import { mobileLoginSchema } from "@/lib/mobile/validation";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = mobileLoginSchema.safeParse(body);

  if (!parsed.success) {
    return mobileError("Invalid login payload", 400);
  }

  const rider = await prisma.user.findFirst({
    where: {
      email: parsed.data.email,
      employeeProfile: {
        isRider: true,
        status: "active",
      },
    },
    include: {
      company: {
        select: { id: true, name: true },
      },
      employeeProfile: true,
    },
  });

  if (!rider?.email) {
    return mobileError("Invalid rider credentials", 401);
  }

  const valid = await verifyAuth0Password(rider.email, parsed.data.password).catch(() => false);
  if (!valid) {
    return mobileError("Invalid rider credentials", 401);
  }

  const { token, session } = await createRiderMobileSession({
    userId: rider.id,
    deviceName: parsed.data.deviceName,
  });

  return mobileSessionResponse({
    token,
    session,
    user: {
      id: rider.id,
      name: rider.name,
      email: rider.email,
      mobile: rider.mobile,
      company: rider.company,
    },
  });
}
