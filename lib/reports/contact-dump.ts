import type { Prisma } from "@prisma/client";
import { buildCsv } from "@/lib/reports/csv";
import {
  contactEmails,
  contactPhones,
  dumpDate,
  dumpDateTime,
  dumpText,
  dumpYesNo,
} from "@/lib/reports/contact-csv";

export type ContactDumpSource = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  recentMerchant: string | null;
  assignedMerchant: string | null;
  source: string | null;
  country: string | null;
  zone: string | null;
  area: string | null;
  exWebCustomer: boolean | null;
  exOffCustomer: boolean | null;
  remarks: string | null;
  gender: string | null;
  language: string | null;
  workPlace: string | null;
  occupation: string | null;
  address: string | null;
  city: string | null;
  birthYear: number | null;
  birthMonth: number | null;
  birthDay: number | null;
  serviceProvider: string | null;
  district: string | null;
  town: string | null;
  origin: string | null;
  customerType: string | null;
  category: string | null;
  loyaltyAssignedTier: string | null;
  loyaltyAssignedAt: Date | null;
  loyaltyOutreachStatus: string | null;
  contactSaved: boolean | null;
  whatsappAllowed: boolean | null;
  lastPurchaseAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  emails: { email: string }[];
  phones: { phoneNumber: string }[];
  allocationUpdates: { merchantName: string | null }[];
};

export const CONTACT_DUMP_SELECT = {
  id: true,
  name: true,
  email: true,
  phoneNumber: true,
  recentMerchant: true,
  assignedMerchant: true,
  source: true,
  country: true,
  zone: true,
  area: true,
  exWebCustomer: true,
  exOffCustomer: true,
  remarks: true,
  gender: true,
  language: true,
  workPlace: true,
  occupation: true,
  address: true,
  city: true,
  birthYear: true,
  birthMonth: true,
  birthDay: true,
  serviceProvider: true,
  district: true,
  town: true,
  origin: true,
  customerType: true,
  category: true,
  loyaltyAssignedTier: true,
  loyaltyAssignedAt: true,
  loyaltyOutreachStatus: true,
  contactSaved: true,
  whatsappAllowed: true,
  lastPurchaseAt: true,
  createdAt: true,
  updatedAt: true,
  emails: { select: { email: true }, orderBy: { createdAt: "asc" as const } },
  phones: { select: { phoneNumber: true }, orderBy: { createdAt: "asc" as const } },
  allocationUpdates: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { merchantName: true },
  },
} satisfies Prisma.ContactMasterSelect;

export const CONTACT_DUMP_HEADERS = [
  "id",
  "tp_number",
  "service_provider_name",
  "source_name",
  "country_name",
  "district_name",
  "zone_name",
  "town_name",
  "nearest_outlet",
  "gender_name",
  "contact_orgin_master_name",
  "dob_year",
  "dob_month",
  "dob_day",
  "k_name",
  "work_place",
  "occupation",
  "address",
  "city",
  "language",
  "remarks",
  "email",
  "extra_emails",
  "extra_phones",
  "category_name",
  "Customer Type",
  "updated_on",
  "last_updated_by",
  "uploaded_date",
  "outlet",
  "ba_name",
  "Called By",
  "Exsisting Web Customer",
  "Offline Customer",
  "Recent Merchent",
  "NEW ALLOCATION",
  "Contact Saved By Customer",
  "Allowed to Whatsapp Msg",
  "Last Purchased Date",
  "Main Profile No",
  "loyalty_tier",
  "loyalty_assigned_at",
  "loyalty_outreach_status",
] as const;

export const CONTACT_DUMP_PARTS = {
  "1": { label: "Part 1", start: 0, size: 5000 },
  "1_1": { label: "Part 1_1", start: 5000, size: 5000 },
  "2": { label: "Part 2", start: 10000, size: 5000 },
  all: { label: "All Contacts", start: 0, size: Number.MAX_SAFE_INTEGER },
} as const;

export type ContactDumpPartKey = keyof typeof CONTACT_DUMP_PARTS;

function lastUpdatedBy(contact: ContactDumpSource) {
  return dumpText(contact.allocationUpdates[0]?.merchantName);
}

export function buildContactDumpRow(contact: ContactDumpSource) {
  const emails = contactEmails(contact);
  const phones = contactPhones(contact);
  const area = dumpText(contact.area);
  const assigned = dumpText(contact.assignedMerchant);
  const updatedBy = lastUpdatedBy(contact);

  return {
    id: contact.id,
    tp_number: phones.primary,
    service_provider_name: dumpText(contact.serviceProvider),
    source_name: dumpText(contact.source),
    country_name: dumpText(contact.country),
    district_name: dumpText(contact.district),
    zone_name: dumpText(contact.zone),
    town_name: dumpText(contact.town),
    nearest_outlet: area,
    gender_name: dumpText(contact.gender),
    contact_orgin_master_name: dumpText(contact.origin),
    dob_year: dumpText(contact.birthYear),
    dob_month: dumpText(contact.birthMonth),
    dob_day: dumpText(contact.birthDay),
    k_name: dumpText(contact.name),
    work_place: dumpText(contact.workPlace),
    occupation: dumpText(contact.occupation),
    address: dumpText(contact.address),
    city: dumpText(contact.city),
    language: dumpText(contact.language),
    remarks: dumpText(contact.remarks),
    email: emails.primary,
    extra_emails: emails.extra,
    extra_phones: phones.extra,
    category_name: dumpText(contact.category),
    "Customer Type": dumpText(contact.customerType),
    updated_on: dumpDate(contact.updatedAt),
    last_updated_by: updatedBy,
    uploaded_date: dumpDate(contact.createdAt),
    outlet: area,
    ba_name: assigned,
    "Called By": updatedBy,
    "Exsisting Web Customer": dumpYesNo(contact.exWebCustomer),
    "Offline Customer": dumpYesNo(contact.exOffCustomer),
    "Recent Merchent": dumpText(contact.recentMerchant),
    "NEW ALLOCATION": assigned,
    "Contact Saved By Customer": dumpYesNo(contact.contactSaved),
    "Allowed to Whatsapp Msg": dumpYesNo(contact.whatsappAllowed),
    "Last Purchased Date": dumpDate(contact.lastPurchaseAt),
    "Main Profile No": phones.primary,
    loyalty_tier: dumpText(contact.loyaltyAssignedTier),
    loyalty_assigned_at: dumpDateTime(contact.loyaltyAssignedAt),
    loyalty_outreach_status: dumpText(contact.loyaltyOutreachStatus),
  };
}

export function buildContactDumpCsv(rows: ContactDumpSource[]) {
  return buildCsv(CONTACT_DUMP_HEADERS, rows.map(buildContactDumpRow));
}
