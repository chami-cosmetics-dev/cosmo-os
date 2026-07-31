export type AdaptCsvRow = Record<string, string | undefined>;

export type AdaptSkipReason =
  | "cancelled_or_deleted"
  | "no_identifier"
  | "bad_amount_or_date";

export type AdaptClassifyResult =
  | { status: "skip"; reason: AdaptSkipReason }
  | {
      status: "ok";
      phone: string | null;
      email: string | null;
      name: string | null;
      invoiceDate: Date;
      ttlAmount: string;
      salesInvoiceNo: string;
      salesInvoiceMasterId: string | null;
      locationName: string | null;
      salesLocationId: string | null;
      paymentMethod: string | null;
      merchantKnownName: string | null;
      adaptMerchantId: string | null;
      adaptCustomerMasterId: string | null;
      address: string | null;
      postCode: string | null;
      district: string | null;
      zone: string | null;
      nearestOutlet: string | null;
      remarks: string | null;
      cashAmount: string | null;
      cardAmount: string | null;
      enrichOnly: boolean;
    };

export type AdaptLocationMapEntry = {
  salesLocationId?: string;
  locationName?: string;
  companyLocationId: string;
};

export type AdaptImportReport = {
  companyId: string;
  dryRun: boolean;
  rowsRead: number;
  contactsCreated: number;
  contactsEnriched: number;
  contactsWouldCreate: number;
  contactsWouldEnrich: number;
  purchasesUpserted: number;
  purchasesWouldUpsert: number;
  skipped: number;
  failed: number;
  ambiguous: number;
  skipReasons: Record<AdaptSkipReason | "ambiguous", number>;
};

export function emptyAdaptImportReport(
  companyId: string,
  dryRun: boolean
): AdaptImportReport {
  return {
    companyId,
    dryRun,
    rowsRead: 0,
    contactsCreated: 0,
    contactsEnriched: 0,
    contactsWouldCreate: 0,
    contactsWouldEnrich: 0,
    purchasesUpserted: 0,
    purchasesWouldUpsert: 0,
    skipped: 0,
    failed: 0,
    ambiguous: 0,
    skipReasons: {
      cancelled_or_deleted: 0,
      no_identifier: 0,
      bad_amount_or_date: 0,
      ambiguous: 0,
    },
  };
}

export type ContactFillBlanksPatch = {
  name?: string;
  email?: string;
  phoneNumber?: string;
  address?: string;
  district?: string;
  zone?: string;
  town?: string;
  remarks?: string;
  source?: string;
};
