import { describe, expect, it } from "vitest";

import { getCitypakSender } from "@/lib/citypak-api";
import {
  CITYPAK_FM_SCAN_HEADERS,
  buildCitypakFmScanCsv,
  citypakFmScanRow,
  formatCitypakReportDateTime,
} from "@/lib/citypak-fm-scan";

const bookedAt = "2026-09-05T08:42:28.000Z"; // 05/09/2026 14:12:28 Colombo
const firstMileAt = "2026-09-05T13:33:46.000Z"; // 05/09/2026 19:03:46
const deliveredAt = "2026-09-07T06:05:58.000Z"; // 07/09/2026 11:35:58

function payload(extra: Record<string, unknown> = {}) {
  return {
    reference: "60018780",
    shipment: {
      receiverName: "Sr M.J.I Roshan",
      receiverAddress1: "No 50/5,railway station rd, Haputale",
      receiverAddress2: "",
      receiverCity: "Haputale",
      receiverPhone: "0773101442",
      cashOnDeliveryAmount: 0,
    },
    citypakStatus: "delivered",
    citypakStatusLabel: "Delivered",
    citypakDeliveredAt: deliveredAt,
    citypakStatusCheckpoints: [
      {
        at: firstMileAt,
        label: "FIRST MILE RECEIVE SCAN",
        code: "UD",
        location: "COLOMBO",
        description: "",
        status: "in_transit",
      },
      {
        at: deliveredAt,
        label: "DELIVERED",
        code: "DL",
        location: "HAPUTALE",
        description: "",
        status: "delivered",
      },
    ],
    ...extra,
  };
}

describe("formatCitypakReportDateTime", () => {
  it("formats Colombo wall time as DD/MM/YYYY HH:mm:ss", () => {
    expect(formatCitypakReportDateTime(bookedAt)).toBe("05/09/2026 14:12:28");
    expect(formatCitypakReportDateTime(null)).toBe("");
  });
});

describe("citypakFmScanRow", () => {
  it("fills sender constants, receiver booking fields, and first-mile scan", () => {
    const row = citypakFmScanRow({
      waybillNo: "D16639161",
      invoiceNumber: "60018780",
      createdAt: bookedAt,
      rawPayload: payload(),
    });

    const sender = getCitypakSender();
    expect(row["Citypak Tracking"]).toBe("D16639161");
    expect(row["Your Reference"]).toBe("60018780");
    expect(row["Sender's Address Name"]).toBe(sender.name);
    expect(row["Sender's Address Line 1"]).toBe(sender.address1);
    expect(row["Sender's Address Line 4 - City"]).toBe(sender.city);
    expect(row["Sender's Contact Number 1"]).toBe(sender.contact1);
    expect(row["Sender's Contact Number 2"]).toBe(sender.contact2);
    expect(row["Receiver's Address Name"]).toBe("Sr M.J.I Roshan");
    expect(row["Receiver's Address Line 4 - City"]).toBe("Haputale");
    expect(row["Receiver's Contact Number 1"]).toBe("0773101442");
    expect(row["Weight g"]).toBe("500");
    expect(row["Billing Type"]).toBe("SENDER ACCOUNT");
    expect(row["Item Type"]).toBe("SENDER ACCOUNT");
    expect(row["Number Of Pieces"]).toBe("1");
    expect(row["Is Cash On Delivery"]).toBe("NO");
    expect(row["Collection Amount"]).toBe("");
    expect(row["Is Delivered"]).toBe("YES");
    expect(row["Current Status"]).toBe("DELIVERED");
    expect(row["Active Status Type"]).toBe("DL");
    expect(row["Created At"]).toBe("05/09/2026 14:12:28");
    expect(row["First Mile Facility"]).toBe("COLOMBO");
    expect(row["First Mile Scan Datetime"]).toBe("05/09/2026 19:03:46");
    expect(row["Delivered Date"]).toBe("07/09/2026 11:35:58");
  });

  it("marks COD and keeps RTM as delivered with status type RTM", () => {
    const row = citypakFmScanRow({
      waybillNo: "D16639172",
      invoiceNumber: "60018816",
      createdAt: bookedAt,
      rawPayload: payload({
        shipment: {
          receiverName: "Dinushani Balapuwaduge",
          receiverAddress1: "67/A Dodamwela Passage",
          receiverCity: "Kandy",
          receiverPhone: "0774787564",
          cashOnDeliveryAmount: 15000,
        },
        citypakStatus: "returned",
        citypakDeliveredAt: null,
        citypakStatusCheckpoints: [
          {
            at: firstMileAt,
            label: "FIRST MILE RECEIVE SCAN",
            code: "UD",
            location: "COLOMBO",
            description: "",
            status: "in_transit",
          },
          {
            at: "2026-09-21T05:26:05.000Z",
            label: "RETURNED TO MERCHANT",
            code: "RTM",
            location: "COLOMBO",
            description: "",
            status: "returned",
          },
        ],
      }),
    });

    expect(row["Is Cash On Delivery"]).toBe("YES");
    expect(row["Collection Amount"]).toBe("15000");
    expect(row["Is Delivered"]).toBe("YES");
    expect(row["Current Status"]).toBe("DELIVERED");
    expect(row["Active Status Type"]).toBe("RTM");
    expect(row["Delivered Date"]).toBe("21/09/2026 10:56:05");
  });

  it("leaves scan columns blank when status was never checked", () => {
    const row = citypakFmScanRow({
      waybillNo: "D1",
      invoiceNumber: "6001",
      createdAt: bookedAt,
      rawPayload: { shipment: { receiverName: "Amal", cashOnDeliveryAmount: 0 } },
    });
    expect(row["Is Delivered"]).toBe("");
    expect(row["Current Status"]).toBe("");
    expect(row["First Mile Facility"]).toBe("");
    expect(row["First Mile Scan Datetime"]).toBe("");
    expect(row["Delivered Date"]).toBe("");
  });
});

describe("buildCitypakFmScanCsv", () => {
  it("quotes the CityPak header row", () => {
    const csv = buildCitypakFmScanCsv([]);
    const header = csv.replace(/^\uFEFF/, "").split("\r\n")[0];
    expect(header).toBe(CITYPAK_FM_SCAN_HEADERS.map((name) => `"${name}"`).join(","));
  });
});
