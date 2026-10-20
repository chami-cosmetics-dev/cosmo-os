import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireConsultationAccess } from "@/lib/consultation-insights/auth";
import {
  createConsultationEntry,
  findCancelledInvoices,
  listConsultations,
} from "@/lib/consultation-insights/server";
import {
  CONSULTATION_MONTH_PATTERN,
  CONSULTATION_PHONE_PATTERN,
  cleanConsultationPhone,
  findConsultationMerchant,
  isValidConsultationDate,
  splitInvoiceNumbers,
  todayConsultationDate,
} from "@/lib/consultation-insights/shared";

export async function GET(request: NextRequest) {
  const access = await requireConsultationAccess();
  if (!access.ok) return access.response;

  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!CONSULTATION_MONTH_PATTERN.test(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  const rows = await listConsultations(access.companyId, month);
  return NextResponse.json({ month, rows });
}

const createSchema = z.object({
  consultationDate: z.string().trim(),
  contactNumber: z.string(),
  invoiceNumbers: z.array(z.string()).max(50),
  customerName: z.string().trim().min(1, "Customer name is required").max(200),
  merchant: z.string().trim().min(1, "Select a merchant"),
  physicalReview: z.string().trim().max(5000).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const access = await requireConsultationAccess();
  if (!access.ok) return access.response;

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const body = parsed.data;

  if (!isValidConsultationDate(body.consultationDate)) {
    return NextResponse.json({ error: "Select a valid date" }, { status: 400 });
  }
  if (body.consultationDate > todayConsultationDate()) {
    return NextResponse.json({ error: "Date cannot be in the future" }, { status: 400 });
  }

  const contactNumber = cleanConsultationPhone(body.contactNumber);
  if (!CONSULTATION_PHONE_PATTERN.test(contactNumber)) {
    return NextResponse.json(
      { error: "Contact number must be 10 digits starting with 0 (e.g. 0771234567)" },
      { status: 400 },
    );
  }

  const invoiceNumbers = splitInvoiceNumbers(body.invoiceNumbers.join(" "));
  if (invoiceNumbers.length === 0) {
    return NextResponse.json({ error: "Add at least one invoice number" }, { status: 400 });
  }

  const cancelled = await findCancelledInvoices(access.companyId, invoiceNumbers);
  if (cancelled.length > 0) {
    return NextResponse.json(
      { error: `Cancelled invoice${cancelled.length === 1 ? "" : "s"} can't be added: ${cancelled.join(", ")}` },
      { status: 400 },
    );
  }

  const merchant = findConsultationMerchant(body.merchant);
  if (!merchant) {
    return NextResponse.json({ error: "Select a merchant from the list" }, { status: 400 });
  }

  const rows = await createConsultationEntry({
    companyId: access.companyId,
    userId: access.userId,
    consultationDate: body.consultationDate,
    contactNumber,
    invoiceNumbers,
    customerName: body.customerName.replace(/\s+/g, " "),
    merchant,
    physicalReview: body.physicalReview?.trim() || null,
  });
  return NextResponse.json({ rows }, { status: 201 });
}
