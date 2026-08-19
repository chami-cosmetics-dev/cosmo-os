import type { Prisma } from "@prisma/client";
import { buildCsv } from "@/lib/reports/csv";
import {
  contactEmails,
  contactPhones,
  dumpDate,
  dumpDateTime,
  dumpText,
} from "@/lib/reports/contact-csv";

export type ContactListDumpSource = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  recentMerchant: string | null;
  assignedMerchant?: string | null;
  loyaltyAssignedTier?: string | null;
  loyaltyAssignedAt?: Date | null;
  loyaltyOutreachStatus?: string | null;
  lastPurchaseAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  emails: { email: string }[];
  phones: { phoneNumber: string }[];
};

export const CONTACT_LIST_DUMP_SELECT = {
  id: true,
  name: true,
  email: true,
  phoneNumber: true,
  recentMerchant: true,
  assignedMerchant: true,
  loyaltyAssignedTier: true,
  loyaltyAssignedAt: true,
  loyaltyOutreachStatus: true,
  lastPurchaseAt: true,
  createdAt: true,
  updatedAt: true,
  emails: { select: { email: true }, orderBy: { createdAt: "asc" as const } },
  phones: { select: { phoneNumber: true }, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.ContactMasterSelect;

const LAST_PURCHASED_HEADERS = [
  "contact_id",
  "name",
  "email",
  "extra_emails",
  "phone_number",
  "extra_phones",
  "recent_merchant",
  "last_purchased_date",
  "updated_on",
] as const;

const LOG_HEADERS = [
  "contact_id",
  "name",
  "email",
  "extra_emails",
  "phone_number",
  "extra_phones",
  "created_at",
  "updated_at",
  "recent_merchant",
  "last_purchased_date",
] as const;

const LOYALTY_HEADERS = [
  "contact_id",
  "name",
  "email",
  "extra_emails",
  "phone_number",
  "extra_phones",
  "recent_merchant",
  "assigned_merchant",
  "last_purchased_date",
  "loyalty_tier",
  "loyalty_assigned_at",
  "loyalty_outreach_status",
  "updated_on",
] as const;

function identityCells(contact: ContactListDumpSource) {
  const emails = contactEmails(contact);
  const phones = contactPhones(contact);
  return {
    contact_id: contact.id,
    name: dumpText(contact.name),
    email: emails.primary,
    extra_emails: emails.extra,
    phone_number: phones.primary,
    extra_phones: phones.extra,
    recent_merchant: dumpText(contact.recentMerchant),
    last_purchased_date: dumpDate(contact.lastPurchaseAt),
  };
}

export function buildLastPurchasedDumpCsv(rows: ContactListDumpSource[]) {
  return buildCsv(
    LAST_PURCHASED_HEADERS,
    rows.map((contact) => ({
      ...identityCells(contact),
      updated_on: dumpDate(contact.updatedAt),
    }))
  );
}

export function buildContactLogDumpCsv(rows: ContactListDumpSource[]) {
  return buildCsv(
    LOG_HEADERS,
    rows.map((contact) => ({
      ...identityCells(contact),
      created_at: dumpDateTime(contact.createdAt),
      updated_at: dumpDateTime(contact.updatedAt),
    }))
  );
}

export function buildLoyaltyDumpCsv(rows: ContactListDumpSource[]) {
  return buildCsv(
    LOYALTY_HEADERS,
    rows.map((contact) => ({
      ...identityCells(contact),
      assigned_merchant: dumpText(contact.assignedMerchant),
      loyalty_tier: dumpText(contact.loyaltyAssignedTier),
      loyalty_assigned_at: dumpDateTime(contact.loyaltyAssignedAt),
      loyalty_outreach_status: dumpText(contact.loyaltyOutreachStatus),
      updated_on: dumpDate(contact.updatedAt),
    }))
  );
}
