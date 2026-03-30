import "server-only";

import { createHash, randomBytes } from "crypto";
import { addDays } from "@/lib/mobile/dates";
import { MOBILE_SESSION_TTL_DAYS } from "@/lib/mobile/constants";
import { prisma } from "@/lib/prisma";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createMobileAccessToken() {
  return randomBytes(32).toString("hex");
}

export async function createRiderMobileSession(params: {
  userId: string;
  deviceName?: string | null;
}) {
  const token = createMobileAccessToken();
  const session = await prisma.riderMobileSession.create({
    data: {
      userId: params.userId,
      tokenHash: hashToken(token),
      deviceName: params.deviceName?.trim() || null,
      expiresAt: addDays(new Date(), MOBILE_SESSION_TTL_DAYS),
    },
  });

  return {
    token,
    session,
  };
}

export async function getRiderMobileSessionFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization")?.trim() ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return null;
  }

  const session = await prisma.riderMobileSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          employeeProfile: true,
          company: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  if (session.status !== "active" || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  if (!session.user.employeeProfile?.isRider || session.user.employeeProfile.status !== "active") {
    return null;
  }

  await prisma.riderMobileSession.update({
    where: { id: session.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => null);

  return session;
}
