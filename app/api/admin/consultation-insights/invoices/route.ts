import { NextRequest, NextResponse } from "next/server";

import { requireConsultationAccess } from "@/lib/consultation-insights/auth";
import { lookupConsultationInvoices } from "@/lib/consultation-insights/server";
import {
  CONSULTATION_PHONE_PATTERN,
  cleanConsultationPhone,
  isValidConsultationDate,
} from "@/lib/consultation-insights/shared";

export async function GET(request: NextRequest) {
  const access = await requireConsultationAccess();
  if (!access.ok) return access.response;

  const { searchParams } = request.nextUrl;
  const phone = cleanConsultationPhone(searchParams.get("phone") ?? "");
  const date = searchParams.get("date") ?? "";
  if (!CONSULTATION_PHONE_PATTERN.test(phone) || !isValidConsultationDate(date)) {
    return NextResponse.json({ error: "Valid phone and date are required" }, { status: 400 });
  }

  const invoices = await lookupConsultationInvoices({ companyId: access.companyId, phone, date });
  return NextResponse.json({ invoices });
}
