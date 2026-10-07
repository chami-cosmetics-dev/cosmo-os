import {
  CITYPAK_DEFAULT_WEIGHT_G,
  getCitypakSender,
  readCitypakWaybillStatus,
  type CitypakTrackingCheckpoint,
} from "@/lib/citypak-api";
import { formatAppIsoDateTime } from "@/lib/format-datetime";

/** CityPak portal first-mile scan export. Headers match the Falcon fm_scan download. */
export const CITYPAK_FM_SCAN_HEADERS = [
  "Citypak Tracking",
  "Your Reference",
  "Sender's Address Name",
  "Sender's Address Line 1",
  "Sender's Address Line 2",
  "Sender's Address Line 3",
  "Sender's Address Line 4 - City",
  "Sender's Contact Name",
  "Sender's Contact Number 1",
  "Sender's Contact Number 2",
  "Receiver's Address Name",
  "Receiver's Address Line 1",
  "Receiver's Address Line 2",
  "Receiver's Address Line 3",
  "Receiver's Address Line 4 - City",
  "Receiver's Contact Number 1",
  "Receiver's Contact Number 2",
  "Receiver's Contact Nic",
  "Weight g",
  "Billing Type",
  "Item Type",
  "Number Of Pieces",
  "Description",
  "Is Cash On Delivery",
  "Collection Amount",
  "Is Delivered",
  "Current Status",
  "Active Status Type",
  "Created At",
  "First Mile Facility",
  "First Mile Scan Datetime",
  "Delivered Date",
] as const;

export type CitypakFmScanHeader = (typeof CITYPAK_FM_SCAN_HEADERS)[number];

export type CitypakFmScanWaybill = {
  waybillNo: string;
  invoiceNumber: string;
  createdAt: Date | string;
  rawPayload: unknown;
};

const BILLING_TYPE = "SENDER ACCOUNT";

/** Inclusive booked-date span. CityPak reports are pulled a month at a time. */
export const CITYPAK_FM_SCAN_MAX_RANGE_DAYS = 366;
export const CITYPAK_FM_SCAN_MAX_ROWS = 20000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function readAmount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return Number.isInteger(amount) ? String(amount) : String(amount);
}

/** CityPak portal timestamps: DD/MM/YYYY HH:mm:ss in Asia/Colombo. */
export function formatCitypakReportDateTime(value: string | Date | null | undefined): string {
  const iso = formatAppIsoDateTime(value, "");
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2}:\d{2})$/);
  if (!match) return "";
  return `${match[3]}/${match[2]}/${match[1]} ${match[4]}`;
}

function firstMileScan(checkpoints: CitypakTrackingCheckpoint[]) {
  return checkpoints.find((checkpoint) => /first\s*mile/i.test(checkpoint.label)) ?? null;
}

function lastCheckpoint(checkpoints: CitypakTrackingCheckpoint[]) {
  return checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;
}

export function citypakFmScanRow(waybill: CitypakFmScanWaybill): Record<CitypakFmScanHeader, string> {
  const payload = asRecord(waybill.rawPayload);
  const shipment = asRecord(payload.shipment);
  const sender = getCitypakSender();
  const snapshot = readCitypakWaybillStatus(payload);
  const checkpoints = snapshot.checkpoints;
  const latest = lastCheckpoint(checkpoints);
  const firstMile = firstMileScan(checkpoints);
  const terminal = snapshot.status === "delivered" || snapshot.status === "returned";
  const collection = readAmount(shipment.cashOnDeliveryAmount);
  const deliveredAt =
    snapshot.deliveredAt || (terminal ? latest?.at ?? null : null);

  return {
    "Citypak Tracking": waybill.waybillNo,
    "Your Reference": waybill.invoiceNumber || readString(payload, "reference"),
    "Sender's Address Name": sender.name,
    "Sender's Address Line 1": sender.address1,
    "Sender's Address Line 2": "",
    "Sender's Address Line 3": "",
    "Sender's Address Line 4 - City": sender.city,
    "Sender's Contact Name": sender.name,
    "Sender's Contact Number 1": sender.contact1,
    "Sender's Contact Number 2": sender.contact2,
    "Receiver's Address Name": readString(shipment, "receiverName"),
    "Receiver's Address Line 1": readString(shipment, "receiverAddress1"),
    "Receiver's Address Line 2": readString(shipment, "receiverAddress2"),
    "Receiver's Address Line 3": "",
    "Receiver's Address Line 4 - City": readString(shipment, "receiverCity"),
    "Receiver's Contact Number 1": readString(shipment, "receiverPhone"),
    "Receiver's Contact Number 2": "",
    "Receiver's Contact Nic": "",
    "Weight g": String(CITYPAK_DEFAULT_WEIGHT_G),
    "Billing Type": BILLING_TYPE,
    "Item Type": BILLING_TYPE,
    "Number Of Pieces": "1",
    Description: "",
    "Is Cash On Delivery": collection > 0 ? "YES" : "NO",
    "Collection Amount": formatAmount(collection),
    "Is Delivered": snapshot.status ? (terminal ? "YES" : "NO") : "",
    "Current Status": terminal ? "DELIVERED" : (latest?.label ?? "").toUpperCase(),
    "Active Status Type": (latest?.code ?? "").toUpperCase(),
    "Created At": formatCitypakReportDateTime(waybill.createdAt),
    "First Mile Facility": firstMile?.location ?? "",
    "First Mile Scan Datetime": firstMile ? formatCitypakReportDateTime(firstMile.at) : "",
    "Delivered Date": deliveredAt ? formatCitypakReportDateTime(deliveredAt) : "",
  };
}

function quoteCsvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildCitypakFmScanCsv(waybills: CitypakFmScanWaybill[]): string {
  const lines = [
    CITYPAK_FM_SCAN_HEADERS.map((header) => quoteCsvCell(header)).join(","),
    ...waybills.map((waybill) => {
      const row = citypakFmScanRow(waybill);
      return CITYPAK_FM_SCAN_HEADERS.map((header) => quoteCsvCell(row[header])).join(",");
    }),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}
