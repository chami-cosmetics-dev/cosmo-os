import { formatCsvHeader } from "@/lib/reports/csv";

type ContactDumpRow = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  recentMerchant: string | null;
  lastPurchaseAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

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
  "remarks",
  "email",
  "category_name",
  "Customer Type",
  "updated_on",
  "last_updated_by",
  "uploaded_date",
  "outlet",
  "ba_name",
  "Called By",
  "Profile Picture",
  "Exsisting Web Customer",
  "Offline Customer",
  "Recent Merchent",
  "NEW ALLOCATION",
  "Contact Saved By Customer",
  "Allowed to Whatsapp Msg",
  "Visited Outlet",
  "Last Day Of Outlet Visit",
  "Last Purchased Date",
  "Main Profile No",
  "checkkkk",
] as const;

export const CONTACT_DUMP_PARTS = {
  "1": { label: "Part 1", start: 0, size: 5000 },
  "1_1": { label: "Part 1_1", start: 5000, size: 5000 },
  "2": { label: "Part 2", start: 10000, size: 5000 },
  all: { label: "All Contacts", start: 0, size: Number.MAX_SAFE_INTEGER },
} as const;

export type ContactDumpPartKey = keyof typeof CONTACT_DUMP_PARTS;

function formatDate(value: Date | null) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function escapeCsvCell(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildContactDumpCsv(rows: ContactDumpRow[]) {
  const lines = [
    CONTACT_DUMP_HEADERS.map(formatCsvHeader).join(","),
    ...rows.map((contact, index) => {
      const record: Record<(typeof CONTACT_DUMP_HEADERS)[number], string> = {
        id: String(index + 1),
        tp_number: contact.phoneNumber ?? "",
        service_provider_name: "",
        source_name: "",
        country_name: "",
        district_name: "",
        zone_name: "",
        town_name: "",
        nearest_outlet: "",
        gender_name: "",
        contact_orgin_master_name: "",
        dob_year: "",
        dob_month: "",
        dob_day: "",
        k_name: contact.name,
        work_place: "",
        occupation: "",
        address: "",
        remarks: "",
        email: contact.email ?? "",
        category_name: contact.lastPurchaseAt ? "Purchased" : "No Purchase Yet",
        "Customer Type": "",
        updated_on: formatDate(contact.updatedAt),
        last_updated_by: "",
        uploaded_date: formatDate(contact.createdAt),
        outlet: "",
        ba_name: "",
        "Called By": "",
        "Profile Picture": "",
        "Exsisting Web Customer": contact.email ? "Yes" : "",
        "Offline Customer": "",
        "Recent Merchent": contact.recentMerchant ?? "",
        "NEW ALLOCATION": "",
        "Contact Saved By Customer": "",
        "Allowed to Whatsapp Msg": contact.phoneNumber ? "Yes" : "",
        "Visited Outlet": "",
        "Last Day Of Outlet Visit": "",
        "Last Purchased Date": formatDate(contact.lastPurchaseAt),
        "Main Profile No": contact.phoneNumber ?? "",
        checkkkk: "1",
      };

      return CONTACT_DUMP_HEADERS.map((header) =>
        escapeCsvCell(record[header] ?? "")
      ).join(",");
    }),
  ];

  return `\uFEFF${lines.join("\r\n")}`;
}
