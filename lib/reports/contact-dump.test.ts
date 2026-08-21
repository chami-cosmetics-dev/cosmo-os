import { describe, expect, it } from "vitest";

import { contactEmails, contactPhones, splitPrimaryAndExtra } from "@/lib/reports/contact-csv";
import {
  CONTACT_DUMP_HEADERS,
  buildContactDumpCsv,
  buildContactDumpRow,
  type ContactDumpSource,
} from "@/lib/reports/contact-dump";
import {
  buildLastPurchasedDumpCsv,
  buildLoyaltyDumpCsv,
  type ContactListDumpSource,
} from "@/lib/reports/contact-list-dump";

function parseCsv(csv: string) {
  const text = csv.replace(/^\uFEFF/, "");
  const [headerLine, ...dataLines] = text.split("\r\n").filter(Boolean);
  return {
    headers: headerLine.split(","),
    rows: dataLines,
  };
}

function baseContact(overrides: Partial<ContactDumpSource> = {}): ContactDumpSource {
  return {
    id: "contact_1",
    name: "Nimal Perera",
    email: "nimal@example.com",
    phoneNumber: "0771234567",
    recentMerchant: "Kandy",
    assignedMerchant: "Dinuli",
    source: "adapt",
    country: "Sri Lanka",
    zone: "Central",
    area: "Kandy Town",
    exWebCustomer: true,
    exOffCustomer: false,
    remarks: "VIP",
    gender: "Male",
    language: "Sinhala",
    workPlace: "Bank",
    occupation: "Clerk",
    address: "12 Main St, Kandy",
    city: "Kandy",
    birthYear: 1990,
    birthMonth: 3,
    birthDay: 15,
    serviceProvider: "Dialog",
    district: "Kandy",
    town: "Peradeniya",
    origin: "POS",
    customerType: "Retail",
    category: "Gold Call",
    loyaltyAssignedTier: "gold",
    loyaltyAssignedAt: new Date("2026-08-01T10:00:00.000Z"),
    loyaltyOutreachStatus: "assigned",
    contactSaved: true,
    whatsappAllowed: false,
    lastPurchaseAt: new Date("2026-08-10T10:00:00.000Z"),
    createdAt: new Date("2026-01-01T10:00:00.000Z"),
    updatedAt: new Date("2026-08-11T10:00:00.000Z"),
    emails: [{ email: "nimal@example.com" }, { email: "nimal.work@example.com" }],
    phones: [{ phoneNumber: "0771234567" }, { phoneNumber: "+94771234567" }, { phoneNumber: "0112223333" }],
    allocationUpdates: [{ merchantName: "Sajith" }],
    ...overrides,
  };
}

function listContact(overrides: Partial<ContactListDumpSource> = {}): ContactListDumpSource {
  const full = baseContact();
  return {
    id: full.id,
    name: full.name,
    email: full.email,
    phoneNumber: full.phoneNumber,
    recentMerchant: full.recentMerchant,
    assignedMerchant: full.assignedMerchant,
    loyaltyAssignedTier: full.loyaltyAssignedTier,
    loyaltyAssignedAt: full.loyaltyAssignedAt,
    loyaltyOutreachStatus: full.loyaltyOutreachStatus,
    lastPurchaseAt: full.lastPurchaseAt,
    createdAt: full.createdAt,
    updatedAt: full.updatedAt,
    emails: full.emails,
    phones: full.phones,
    ...overrides,
  };
}

describe("splitPrimaryAndExtra", () => {
  it("keeps primary and lists extra emails without case dupes", () => {
    expect(
      splitPrimaryAndExtra("Nimal@example.com", ["nimal@example.com", "other@example.com"], "email")
    ).toEqual({
      primary: "Nimal@example.com",
      extra: "other@example.com",
    });
  });

  it("dedupes phone digit variants", () => {
    expect(
      splitPrimaryAndExtra("0771234567", ["+94771234567", "0112223333"], "phone")
    ).toEqual({
      primary: "0771234567",
      extra: "0112223333",
    });
  });
});

describe("contact dump 1", () => {
  it("fills CRM fields instead of guessing purchase or phone flags", () => {
    const row = buildContactDumpRow(baseContact());
    expect(row.id).toBe("contact_1");
    expect(row.tp_number).toBe("0771234567");
    expect(row.extra_phones).toBe("0112223333");
    expect(row.email).toBe("nimal@example.com");
    expect(row.extra_emails).toBe("nimal.work@example.com");
    expect(row.service_provider_name).toBe("Dialog");
    expect(row.gender_name).toBe("Male");
    expect(row.contact_orgin_master_name).toBe("POS");
    expect(row.dob_year).toBe("1990");
    expect(row.dob_month).toBe("3");
    expect(row.category_name).toBe("Gold Call");
    expect(row["Customer Type"]).toBe("Retail");
    expect(row["Exsisting Web Customer"]).toBe("YES");
    expect(row["Offline Customer"]).toBe("NO");
    expect(row["Allowed to Whatsapp Msg"]).toBe("NO");
    expect(row["NEW ALLOCATION"]).toBe("Dinuli");
    expect(row.ba_name).toBe("Dinuli");
    expect(row["Called By"]).toBe("Sajith");
    expect(row.nearest_outlet).toBe("Kandy Town");
    expect(row.city).toBe("Kandy");
    expect(row.language).toBe("Sinhala");
    expect(row.loyalty_tier).toBe("gold");
  });

  it("leaves unknown flags empty instead of inferring from email or phone", () => {
    const row = buildContactDumpRow(
      baseContact({
        email: "has-email@example.com",
        phoneNumber: "0779999999",
        exWebCustomer: null,
        whatsappAllowed: null,
        category: null,
        lastPurchaseAt: new Date("2026-08-10T10:00:00.000Z"),
        emails: [],
        phones: [],
      })
    );
    expect(row["Exsisting Web Customer"]).toBe("");
    expect(row["Allowed to Whatsapp Msg"]).toBe("");
    expect(row.category_name).toBe("");
  });

  it("drops junk sample columns and writes a CSV with real contact id", () => {
    const csv = buildContactDumpCsv([baseContact()]);
    const parsed = parseCsv(csv);
    expect(parsed.headers).toContain("ID");
    expect(parsed.headers).toContain("EXTRA_EMAILS");
    expect(parsed.headers).toContain("LOYALTY_TIER");
    expect(parsed.headers).not.toContain("CHECKKKK");
    expect(parsed.headers).not.toContain("PROFILE PICTURE");
    expect(CONTACT_DUMP_HEADERS).not.toContain("checkkkk");
    expect(parsed.rows[0]).toContain("contact_1");
    expect(parsed.rows[0]).toContain("nimal.work@example.com");
  });
});

describe("contact list dumps", () => {
  it("includes extra identifiers on last-purchased dump", () => {
    const csv = buildLastPurchasedDumpCsv([listContact()]);
    expect(csv).toContain("EXTRA_EMAILS");
    expect(csv).toContain("nimal.work@example.com");
    expect(csv).toContain("0112223333");
  });

  it("includes assigned loyalty fields", () => {
    const csv = buildLoyaltyDumpCsv([listContact()]);
    expect(csv).toContain("LOYALTY_TIER");
    expect(csv).toContain("LOYALTY_OUTREACH_STATUS");
    expect(csv).toContain("gold");
    expect(csv).toContain("assigned");
    expect(csv).toContain("Dinuli");
  });
});

describe("contactEmails / contactPhones", () => {
  it("promotes first alias when primary is empty", () => {
    expect(
      contactEmails({
        email: null,
        phoneNumber: null,
        emails: [{ email: "second@example.com" }],
      })
    ).toEqual({ primary: "second@example.com", extra: "" });
    expect(
      contactPhones({
        email: null,
        phoneNumber: null,
        phones: [{ phoneNumber: "0112223333" }],
      })
    ).toEqual({ primary: "0112223333", extra: "" });
  });
});
