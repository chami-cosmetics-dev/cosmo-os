import { prisma } from "@/lib/prisma";
import { getCompanyLocationInvoiceFields } from "@/lib/company-location-invoice-fields";
import { eligibleMerchantUserWhere } from "@/lib/merchant-eligibility";

const LOCATIONS_PAGE_SIZE = 10;

/** Serializable location row for Settings → Locations (matches API + client `Location` shape). */
export type LocationsSettingsLocation = {
  id: string;
  name: string;
  logoUrl: string | null;
  address: string | null;
  shadowParentLocationId: string | null;
  shadowParentLocation: { id: string; name: string } | null;
  shortName: string | null;
  invoiceHeader: string | null;
  invoiceSubHeader: string | null;
  invoiceFooter: string | null;
  invoicePhone: string | null;
  invoiceEmail: string | null;
  shopifyLocationId: string | null;
  shopifyShopName: string | null;
  shopifyAdminStoreHandle: string | null;
  locationReference: string | null;
  defaultMerchantUserId: string | null;
  defaultOrderPrintFormatId: string | null;
  manualInvoicePrefix: string | null;
  manualInvoiceNextSeq: number;
  manualInvoiceSeqPadding: number;
  erpnextCompany: string | null;
  erpnextWarehouse: string | null;
  fulfillmentBlocked: boolean;
  isMainCompany: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LocationsSettingsInitialData = {
  locations: LocationsSettingsLocation[];
  merchants: Array<{ id: string; name: string | null; email: string | null }>;
  total: number;
  page: number;
  limit: number;
};

export async function getLocationsSettingsInitialData(
  companyId: string
): Promise<LocationsSettingsInitialData> {
  const page = 1;
  const limit = LOCATIONS_PAGE_SIZE;
  const skip = 0;

  const [total, rows, merchants] = await Promise.all([
    prisma.companyLocation.count({ where: { companyId } }),
    prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        logoUrl: true,
        address: true,
        shadowParentLocationId: true,
        shadowParentLocation: {
          select: { id: true, name: true },
        },
        shortName: true,
        invoiceHeader: true,
        invoiceSubHeader: true,
        invoiceFooter: true,
        invoicePhone: true,
        invoiceEmail: true,
        shopifyLocationId: true,
        shopifyShopName: true,
        shopifyAdminStoreHandle: true,
        locationReference: true,
        defaultMerchantUserId: true,
        defaultOrderPrintFormatId: true,
        erpnextCompany: true,
        erpnextWarehouse: true,
        fulfillmentBlocked: true,
        isMainCompany: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.user.findMany({
      where: eligibleMerchantUserWhere(companyId),
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const invoiceFields = await getCompanyLocationInvoiceFields(rows.map((row) => row.id));

  const locations: LocationsSettingsLocation[] = rows.map((l) => ({
    ...l,
    manualInvoicePrefix: invoiceFields.get(l.id)?.manualInvoicePrefix ?? null,
    manualInvoiceNextSeq: invoiceFields.get(l.id)?.manualInvoiceNextSeq ?? 0,
    manualInvoiceSeqPadding: invoiceFields.get(l.id)?.manualInvoiceSeqPadding ?? 3,
    erpnextCompany: l.erpnextCompany,
    erpnextWarehouse: l.erpnextWarehouse,
    fulfillmentBlocked: l.fulfillmentBlocked,
    isMainCompany: l.isMainCompany,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  }));

  return {
    locations,
    merchants,
    total,
    page,
    limit,
  };
}
