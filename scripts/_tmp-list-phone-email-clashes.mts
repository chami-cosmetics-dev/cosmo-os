import { readFileSync } from "node:fs";

import { normalizeContactEmail, normalizeContactPhone } from "../lib/contact-identifiers";
import { buildPhoneLookupVariants } from "../lib/phone-lookup";
import { prisma } from "../lib/prisma";
import { parsePurchasesWorkbook } from "../lib/vault-supplement-import/parse-sheet";

const files = [
  ["Supplement", "C:/Users/Bad-Boy/Downloads/Supplement sales history for VOS - 13.10.2026 (1).xlsx"],
  ["Origins", "C:/Users/Bad-Boy/Downloads/Origins trading Sales history for VOS -13.10.2026 (1).xlsx"],
  ["AE", "C:/Users/Bad-Boy/Downloads/AE Sale history for VOS-13.10.2026.xlsx"],
] as const;

type Contact = { id: string; name: string; phone: string | null; email: string | null };

const company = await prisma.company.findFirst({
  where: { name: "SupplementVault.lk" },
  select: { id: true },
});
if (!company) throw new Error("SupplementVault.lk company was not found");

const contacts = await prisma.contactMaster.findMany({
  where: { companyId: company.id },
  select: {
    id: true,
    name: true,
    phoneNumber: true,
    email: true,
    phones: { select: { phoneNumber: true } },
    emails: { select: { email: true } },
  },
});

const byPhone = new Map<string, Map<string, Contact>>();
const byEmail = new Map<string, Map<string, Contact>>();

function add(map: Map<string, Map<string, Contact>>, key: string, contact: Contact) {
  const bucket = map.get(key) ?? new Map<string, Contact>();
  bucket.set(contact.id, contact);
  map.set(key, bucket);
}

for (const row of contacts) {
  const contact: Contact = {
    id: row.id,
    name: row.name,
    phone: row.phoneNumber,
    email: row.email,
  };
  const phones = [row.phoneNumber, ...row.phones.map((item) => item.phoneNumber)];
  for (const phone of phones) {
    const canonical = normalizeContactPhone(phone);
    if (!canonical) continue;
    for (const variant of buildPhoneLookupVariants(canonical)) add(byPhone, variant, contact);
  }
  const emails = [row.email, ...row.emails.map((item) => item.email)];
  for (const email of emails) {
    const canonical = normalizeContactEmail(email);
    if (!canonical) continue;
    add(byEmail, canonical, contact);
  }
}

type Clash = {
  file: string;
  customerName: string;
  phone: string;
  email: string;
  invoices: string[];
  phoneContact: Contact;
  emailContact: Contact;
};

const clashes: Clash[] = [];
const seen = new Set<string>();

for (const [file, path] of files) {
  const parsed = await parsePurchasesWorkbook(readFileSync(path));
  if (!parsed.ok) throw new Error(parsed.error);
  for (const line of parsed.lines) {
    const phone = normalizeContactPhone(line.phone);
    const email = normalizeContactEmail(line.email);
    if (!phone || !email) continue;
    const key = `${file}\u0000${phone}\u0000${email}`;
    const phoneHits = new Map<string, Contact>();
    for (const variant of buildPhoneLookupVariants(phone)) {
      for (const contact of byPhone.get(variant)?.values() ?? []) phoneHits.set(contact.id, contact);
    }
    const emailHits = byEmail.get(email) ?? new Map<string, Contact>();
    if (phoneHits.size !== 1 || emailHits.size !== 1) continue;
    const phoneContact = [...phoneHits.values()][0]!;
    const emailContact = [...emailHits.values()][0]!;
    if (phoneContact.id === emailContact.id) continue;
    const existing = clashes.find((clash) => clash.file === file && clash.phone === phone && clash.email === email);
    if (existing) {
      if (!existing.invoices.includes(line.invoiceNo)) existing.invoices.push(line.invoiceNo);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    clashes.push({
      file,
      customerName: line.customerName,
      phone,
      email,
      invoices: [line.invoiceNo],
      phoneContact,
      emailContact,
    });
  }
}

console.log(JSON.stringify({ contacts: contacts.length, clashes: clashes.length, rows: clashes }, null, 2));
await prisma.$disconnect();
