import { NextRequest, NextResponse } from "next/server";

import { loadCustomerInsight } from "@/lib/customer-insight/load";
import { requirePermission } from "@/lib/rbac";
import {
  customerInsightContactParamsSchema,
  customerInsightInvoicesQuerySchema,
} from "@/lib/validation/customer-insight";

type Params = { params: Promise<{ contactId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requirePermission("contacts.insight.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const { contactId } = await params;
  const idParsed = customerInsightContactParamsSchema.safeParse({ contactId });
  if (!idParsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: idParsed.error.flatten() },
      { status: 400 }
    );
  }

  const queryParsed = customerInsightInvoicesQuerySchema.safeParse({
    invoicesPage: request.nextUrl.searchParams.get("invoicesPage") ?? undefined,
    invoicesPageSize: request.nextUrl.searchParams.get("invoicesPageSize") ?? undefined,
  });
  if (!queryParsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: queryParsed.error.flatten() },
      { status: 400 }
    );
  }

  const insight = await loadCustomerInsight({
    companyId,
    contactId: idParsed.data.contactId,
    invoicesPage: queryParsed.data.invoicesPage,
    invoicesPageSize: queryParsed.data.invoicesPageSize,
  });
  if (!insight) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  return NextResponse.json(insight);
}
