import { NextRequest, NextResponse } from "next/server";

import { ingestParsedErpSalesInvoice } from "@/lib/erp-sales-invoice-ingest";
import { unwrapErpWebhookPayload } from "@/lib/erpnext-customer-display-name";
import { prisma } from "@/lib/prisma";
import { erpnextSalesInvoiceWebhookSchema } from "@/lib/validation/erpnext-sales-invoice";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function resolveInstanceSecret(company: string): Promise<{
  secret: string;
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  label: string | null;
} | null> {
  const location = await prisma.companyLocation.findFirst({
    where: { erpnextCompany: company },
    select: {
      erpnextInstance: {
        select: {
          incomingWebhookSecret: true,
          baseUrl: true,
          apiKey: true,
          apiSecret: true,
          label: true,
        },
      },
    },
  });

  const instance = location?.erpnextInstance;
  if (instance) {
    return {
      secret:
        instance.incomingWebhookSecret ??
        process.env.ERPNEXT_INCOMING_WEBHOOK_SECRET ??
        "",
      baseUrl: instance.baseUrl.replace(/\/$/, ""),
      apiKey: instance.apiKey,
      apiSecret: instance.apiSecret,
      label: instance.label,
    };
  }

  const envSecret = process.env.ERPNEXT_INCOMING_WEBHOOK_SECRET ?? "";
  const envBaseUrl = (process.env.ERPNEXT_BASE_URL ?? "").replace(/\/$/, "");
  if (!envSecret && !envBaseUrl) return null;
  return {
    secret: envSecret,
    baseUrl: envBaseUrl,
    apiKey: process.env.ERPNEXT_API_KEY ?? "",
    apiSecret: process.env.ERPNEXT_API_SECRET ?? "",
    label: null,
  };
}

export async function POST(request: NextRequest) {
  const incomingSecret = request.headers.get("x-erpnext-secret") ?? "";

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const topLevel = rawPayload as Record<string, unknown>;
  console.log("[ERPNext webhook] top-level keys:", Object.keys(topLevel));
  if (topLevel?.data && typeof topLevel.data === "object") {
    console.log(
      "[ERPNext webhook] data keys:",
      Object.keys(topLevel.data as object),
    );
  }

  const unwrapped = unwrapErpWebhookPayload(rawPayload) ?? topLevel;
  const companyRaw = unwrapped?.company;
  const company = typeof companyRaw === "string" ? companyRaw : "";
  console.log("[ERPNext webhook] resolved company:", JSON.stringify(company));

  const instanceCreds = await resolveInstanceSecret(company);
  if (
    !instanceCreds ||
    !instanceCreds.secret ||
    incomingSecret !== instanceCreds.secret
  ) {
    console.error(
      "[ERPNext webhook] Invalid or missing secret for company:",
      company,
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = erpnextSalesInvoiceWebhookSchema.safeParse(unwrapped);
  if (!parsed.success) {
    console.error(
      "[ERPNext webhook] Validation failed",
      parsed.error.flatten(),
    );
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await ingestParsedErpSalesInvoice({
    data: parsed.data,
    rawPayload,
    instanceCreds: {
      baseUrl: instanceCreds.baseUrl,
      apiKey: instanceCreds.apiKey,
      apiSecret: instanceCreds.apiSecret,
      label: instanceCreds.label,
    },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
