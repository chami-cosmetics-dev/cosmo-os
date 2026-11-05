import { NextResponse } from "next/server";

import { requireConsultationAccess } from "@/lib/consultation-insights/auth";
import { listConsultationHistory } from "@/lib/consultation-insights/server";

/** Who added, re-reviewed or deleted what, and when (latest 100). */
export async function GET() {
  const access = await requireConsultationAccess();
  if (!access.ok) return access.response;

  const entries = await listConsultationHistory(access.companyId);
  return NextResponse.json({ entries });
}
