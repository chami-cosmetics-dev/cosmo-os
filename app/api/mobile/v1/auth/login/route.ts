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
      email: {
        equals: parsed.data.email,
        mode: "insensitive",
      },
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

  const passwordCheck = await verifyAuth0Password(rider.email, parsed.data.password);
  if (!passwordCheck.valid) {
    if (passwordCheck.reason === "grant_not_enabled") {
      return mobileError(
        "Mobile sign-in is not enabled on the server. Ask an admin to enable Auth0 Password grant.",
        503
      );
    }
    if (passwordCheck.reason === "misconfigured") {
      console.error("[mobile login] Auth0 env vars missing on server");
      return mobileError("Authentication service unavailable", 503);
    }
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
