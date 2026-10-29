import "server-only";

import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac";

import { CONSULTATION_ACCESS_PERMISSION } from "./shared";

type ConsultationAccess =
  | { ok: true; companyId: string; userId: string }
  | { ok: false; status: number; error: string };

/** Single on/off access — no further restrictions inside the feature. */
export async function getConsultationAccess(): Promise<ConsultationAccess> {
  const auth = await requirePermission(CONSULTATION_ACCESS_PERMISSION);
  if (!auth.ok) return { ok: false, status: auth.status, error: auth.error };

  const companyId = auth.context.user?.companyId ?? null;
  const userId = auth.context.user?.id ?? null;
  if (!companyId || !userId) {
    return { ok: false, status: 404, error: "No company associated with your account" };
  }
  return { ok: true, companyId, userId };
}

/** API flavour of `getConsultationAccess`: failures come back as a ready JSON response. */
export async function requireConsultationAccess() {
  const access = await getConsultationAccess();
  if (!access.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: access.error }, { status: access.status }),
    };
  }
  return access;
}
