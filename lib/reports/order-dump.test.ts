import { describe, expect, it } from "vitest";

import {
  createCsvRowCounter,
  dumpProgressPercent,
  parseContentDispositionFilename,
  parseDumpTotalHeader,
} from "@/lib/reports/dump-download";
import { joinDumpCouponCodes } from "@/lib/reports/order-dump";
import { getOrderDiscountCouponCode } from "@/lib/order-discount-coupon";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";

describe("joinDumpCouponCodes", () => {
  it("joins POS merchant + customer coupons without duplicates", () => {
    const merchant = getMerchantCouponCode({
      sourceName: "erpnext-pos",
      discountCodes: [
        { code: "SV20" },
        { code: "MER99-Dinuli", amount: 0 },
      ],
      rawPayload: {
        data: {
          coupon_code: "SV20",
          custom_merchant_coupon_code: "MER99-Dinuli",
        },
      },
    });
    const discount = getOrderDiscountCouponCode({
      sourceName: "erpnext-pos",
      discountCodes: [
        { code: "SV20" },
        { code: "MER99-Dinuli", amount: 0 },
      ],
      rawPayload: {
        data: {
          coupon_code: "SV20",
          custom_merchant_coupon_code: "MER99-Dinuli",
        },
      },
    });

    expect(merchant).toBe("MER99-Dinuli");
    expect(discount).toBe("SV20");
    expect(joinDumpCouponCodes(merchant, discount)).toBe("MER99-Dinuli,SV20");
  });

  it("keeps a POS customer coupon when no merchant code exists", () => {
    expect(
      joinDumpCouponCodes(
        getMerchantCouponCode({
          sourceName: "erpnext-pos",
          discountCodes: [{ code: "June15" }],
          rawPayload: { coupon_code: "June15" },
        }),
        getOrderDiscountCouponCode({
          sourceName: "erpnext-pos",
          discountCodes: [{ code: "June15" }],
          rawPayload: { coupon_code: "June15" },
        }),
      ),
    ).toBe("June15");
  });
});

describe("dump download progress", () => {
  it("counts CSV data rows ignoring quoted newlines", () => {
    const counter = createCsvRowCounter();
    counter.consume("INVOICE_NO,ADDRESS\r\n");
    counter.consume('6001,"Line 1\r\nLine 2"\r\n6002,Colombo\r\n');
    expect(counter.dataRows()).toBe(2);
  });

  it("caps in-progress percent below 100", () => {
    expect(dumpProgressPercent(9, 10)).toBe(90);
    expect(dumpProgressPercent(10, 10)).toBe(99);
    expect(parseDumpTotalHeader("250")).toBe(250);
    expect(parseContentDispositionFilename('attachment; filename="utility-order-invoice-last-90.csv"')).toBe(
      "utility-order-invoice-last-90.csv",
    );
  });
});
