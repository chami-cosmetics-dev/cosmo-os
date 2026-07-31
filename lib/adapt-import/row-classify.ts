import { ADAPT_FIELD, cell } from "@/lib/adapt-import/columns";
import type { AdaptClassifyResult, AdaptCsvRow } from "@/lib/adapt-import/types";

/** Parse Adapt dates like `8/8/2019` or `17/8/2019 10:34:48`. */
export function parseAdaptDate(raw: string | null | undefined): Date | null {
  const t = raw?.trim();
  if (!t) return null;

  const m = t.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );
  if (!m) {
    const iso = new Date(t);
    return Number.isNaN(iso.getTime()) ? null : iso;
  }

  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const hour = m[4] != null ? Number(m[4]) : 0;
  const minute = m[5] != null ? Number(m[5]) : 0;
  const second = m[6] != null ? Number(m[6]) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseAdaptAmount(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  const cleaned = t.replace(/,/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return cleaned;
}

function isTruthyFlag(value: string | null): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "y";
}

function isInactiveOrCancelled(row: AdaptCsvRow): boolean {
  if (cell(row, ADAPT_FIELD.deletedOn)) return true;
  const active = cell(row, ADAPT_FIELD.activeFlag);
  if (active != null && !isTruthyFlag(active)) return true;
  const cancel = cell(row, ADAPT_FIELD.cancelComent);
  if (cancel && /cancel/i.test(cancel)) return true;
  return false;
}

export function classifyAdaptRow(row: AdaptCsvRow): AdaptClassifyResult {
  if (isInactiveOrCancelled(row)) {
    return { status: "skip", reason: "cancelled_or_deleted" };
  }

  const phone =
    cell(row, ADAPT_FIELD.customerTp) ?? cell(row, ADAPT_FIELD.customerTpRaw);
  const email = cell(row, ADAPT_FIELD.customerEmail)?.toLowerCase() ?? null;
  if (!phone && !email) {
    return { status: "skip", reason: "no_identifier" };
  }

  const invoiceDate = parseAdaptDate(cell(row, ADAPT_FIELD.invoiceDate));
  const ttlAmount = parseAdaptAmount(cell(row, ADAPT_FIELD.ttlAmount));
  const salesInvoiceNo = cell(row, ADAPT_FIELD.salesInvoiceNo);
  const enrichOnly = !invoiceDate || !ttlAmount || !salesInvoiceNo;

  if (enrichOnly) {
    // Still return ok with enrichOnly so contact blanks can fill; purchase skipped by caller.
    if (!invoiceDate || !ttlAmount || !salesInvoiceNo) {
      return {
        status: "ok",
        phone,
        email,
        name: cell(row, ADAPT_FIELD.attentionName),
        invoiceDate: invoiceDate ?? new Date(0),
        ttlAmount: ttlAmount ?? "0",
        salesInvoiceNo: salesInvoiceNo ?? "",
        salesInvoiceMasterId: cell(row, ADAPT_FIELD.salesInvoiceMasterId),
        locationName: cell(row, ADAPT_FIELD.locationName),
        salesLocationId: cell(row, ADAPT_FIELD.salesLocationId),
        paymentMethod:
          cell(row, ADAPT_FIELD.inPaymentTypeName) ??
          cell(row, ADAPT_FIELD.paymentMethode),
        merchantKnownName: cell(row, ADAPT_FIELD.knownName),
        adaptMerchantId: cell(row, ADAPT_FIELD.merchentId),
        adaptCustomerMasterId: cell(row, ADAPT_FIELD.customerMasterId),
        address: cell(row, ADAPT_FIELD.customerShippingAddress),
        postCode: cell(row, ADAPT_FIELD.postCode),
        district: cell(row, ADAPT_FIELD.district),
        zone: cell(row, ADAPT_FIELD.zone),
        nearestOutlet: cell(row, ADAPT_FIELD.nearestOutlet),
        remarks:
          cell(row, ADAPT_FIELD.customerNote) ?? cell(row, ADAPT_FIELD.specialNote),
        cashAmount: cell(row, ADAPT_FIELD.cashAmount),
        cardAmount: cell(row, ADAPT_FIELD.cardAmount),
        enrichOnly: true,
      };
    }
  }

  return {
    status: "ok",
    phone,
    email,
    name: cell(row, ADAPT_FIELD.attentionName),
    invoiceDate: invoiceDate!,
    ttlAmount: ttlAmount!,
    salesInvoiceNo: salesInvoiceNo!,
    salesInvoiceMasterId: cell(row, ADAPT_FIELD.salesInvoiceMasterId),
    locationName: cell(row, ADAPT_FIELD.locationName),
    salesLocationId: cell(row, ADAPT_FIELD.salesLocationId),
    paymentMethod:
      cell(row, ADAPT_FIELD.inPaymentTypeName) ?? cell(row, ADAPT_FIELD.paymentMethode),
    merchantKnownName: cell(row, ADAPT_FIELD.knownName),
    adaptMerchantId: cell(row, ADAPT_FIELD.merchentId),
    adaptCustomerMasterId: cell(row, ADAPT_FIELD.customerMasterId),
    address: cell(row, ADAPT_FIELD.customerShippingAddress),
    postCode: cell(row, ADAPT_FIELD.postCode),
    district: cell(row, ADAPT_FIELD.district),
    zone: cell(row, ADAPT_FIELD.zone),
    nearestOutlet: cell(row, ADAPT_FIELD.nearestOutlet),
    remarks: cell(row, ADAPT_FIELD.customerNote) ?? cell(row, ADAPT_FIELD.specialNote),
    cashAmount: cell(row, ADAPT_FIELD.cashAmount),
    cardAmount: cell(row, ADAPT_FIELD.cardAmount),
    enrichOnly: false,
  };
}
