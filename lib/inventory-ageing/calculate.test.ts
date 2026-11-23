import { describe, expect, it } from "vitest";
import { calculateAgeing, type AgeingMovement, type AgeingReceipt } from "./calculate";

const date = "2026-11-19";
const movement = (name: string, qty: number, voucherType: string, voucherNo: string, detail: string | null, postingDate = "2026-11-01", warehouse = "Main", balance: number | null = null): AgeingMovement => ({
  erp: "ERP1", company: "COS", itemCode: "SKU1", warehouse, postingDate, postingTime: "10:00:00", creation: `${postingDate} 10:00:00`, name, qty, voucherType, voucherNo, voucherDetailNo: detail, balance,
});
const receipt = (name: string, itemName: string, intercompany: boolean, creation: string, qty: number, invoicedQty = qty): AgeingReceipt => ({
  erp: "ERP1", company: "COS", name, itemName, itemCode: "SKU1", supplier: intercompany ? "Internal" : "External", creation, intercompany, stockQty: qty, invoicedQty, invoiceAmount: invoicedQty * 10,
});
const run = (movements: AgeingMovement[], receipts: AgeingReceipt[]) => calculateAgeing({ reportDate: date, movements, receipts, metadata: new Map() });

describe("inventory ageing allocation", () => {
  it("excludes intercompany layers after FIFO consumption", () => {
    const report = run([
      movement("1", 100, "Purchase Receipt", "PR1", "I1", "2026-05-01"),
      movement("2", 80, "Purchase Receipt", "PR2", "I2", "2026-11-01"),
      movement("3", -70, "Delivery Note", "DN1", null, "2026-11-02", "Main", 110),
    ], [receipt("PR1", "I1", true, "2026-05-01 10:00:00", 100), receipt("PR2", "I2", false, "2026-11-01 10:00:00", 80)]);
    expect(report.reconciliation.actualStockQty).toBe(110);
    expect(report.reconciliation.excludedIntercompanyQty).toBe(30);
    expect(report.items[0]?.totalStockLeft).toBe(80);
    expect(report.items[0]?.buckets["0_30"].qty).toBe(80);
    expect(report.items[0]?.totalCost).toBe(800);
  });
  it("carries FIFO source PR age and PI cost through an SSR into intercompany stock", () => {
    const source = receipt("SOURCE", "SOURCE-ITEM", false, "2026-05-01 10:00:00", 5);
    const destination = { ...receipt("DEST", "DEST-ITEM", true, "2026-11-02 10:00:00", 3, 0), company: "DESTCO" };
    const report = calculateAgeing({ reportDate: date, metadata: new Map(), receipts: [source, destination], movements: [
      movement("1", 5, "Purchase Receipt", "SOURCE", "SOURCE-ITEM", "2026-05-01", "Main", 5),
      movement("2", -3, "Purchase Invoice", "RETURN", "RETURN-ITEM", "2026-11-02", "Main", 2),
      { ...movement("3", 3, "Purchase Receipt", "DEST", "DEST-ITEM", "2026-11-02", "Main", 3), company: "DESTCO" },
      { ...movement("4", -1, "Sales Invoice", "SALE", "SALE-ITEM", "2026-11-03", "Main", 2), company: "DESTCO" },
    ], intercompanySources: [{ receiptErp: "ERP1", receiptCompany: "DESTCO", receiptName: "DEST", ssrName: "SSR1", sourceCompany: "COS", returnItems: [{ voucher: "RETURN", voucherType: "Purchase Invoice", itemCode: "SKU1" }] }] });
    expect(report.reconciliation.actualStockQty).toBe(4);
    expect(report.reconciliation.excludedIntercompanyQty).toBe(0);
    expect(report.items[0]?.totalStockLeft).toBe(4);
    expect(report.items[0]?.buckets.above_150.qty).toBe(4);
    expect(report.items[0]?.totalCost).toBe(40);
  });
  it("keeps the correct source layer after destination stock is consumed before its return PI posts", () => {
    const older = receipt("OLD", "OLD-ITEM", false, "2026-05-01 10:00:00", 1);
    const newer = { ...receipt("NEW", "NEW-ITEM", false, "2026-11-01 10:00:00", 2), invoiceAmount: 40 };
    const destination = { ...receipt("DEST", "DEST-ITEM", true, "2026-11-02 10:00:00", 3, 0), company: "DESTCO" };
    const report = calculateAgeing({ reportDate: date, metadata: new Map(), receipts: [older, newer, destination], movements: [
      movement("1", 1, "Purchase Receipt", "OLD", "OLD-ITEM", "2026-05-01", "Main", 1),
      movement("2", 2, "Purchase Receipt", "NEW", "NEW-ITEM", "2026-11-01", "Main", 3),
      { ...movement("3", 3, "Purchase Receipt", "DEST", "DEST-ITEM", "2026-11-02", "Main", 3), company: "DESTCO" },
      { ...movement("4", -1, "Sales Invoice", "SALE", "SALE-ITEM", "2026-11-02", "Main", 2), company: "DESTCO", postingTime: "11:00:00" },
      { ...movement("5", -3, "Purchase Invoice", "RETURN", "RETURN-ITEM", "2026-11-02", "Main", 0), postingTime: "12:00:00" },
    ], intercompanySources: [{ receiptErp: "ERP1", receiptCompany: "DESTCO", receiptName: "DEST", ssrName: "SSR1", sourceCompany: "COS", returnItems: [{ voucher: "RETURN", voucherType: "Purchase Invoice", itemCode: "SKU1" }] }] });
    expect(report.items[0]?.totalStockLeft).toBe(2);
    expect(report.items[0]?.buckets["0_30"].qty).toBe(2);
    expect(report.items[0]?.totalCost).toBe(40);
  });
  it("uses a legacy Supplier Return Stock Entry rate when the SSR has no original PR or PI", () => {
    const destination = { ...receipt("DEST", "DEST-ITEM", true, "2026-11-02 10:00:00", 1, 0), company: "DESTCO" };
    const report = calculateAgeing({ reportDate: date, metadata: new Map(), receipts: [destination], movements: [
      movement("1", 0, "Stock Reconciliation", "OPEN", null, "2026-07-01", "Main", 1),
      movement("2", -1, "Stock Entry", "MAT-STE-1", "DETAIL", "2026-08-04", "Main", 0),
      { ...movement("3", 1, "Purchase Receipt", "DEST", "DEST-ITEM", "2026-08-04", "Main", 1), company: "DESTCO" },
    ], intercompanySources: [{ receiptErp: "ERP1", receiptCompany: "DESTCO", receiptName: "DEST", ssrName: "SSR1", sourceCompany: "COS", returnItems: [{ voucher: "MAT-STE-1", voucherType: "Stock Entry", itemCode: "SKU1" }], legacyItems: [{ voucher: "MAT-STE-1", itemCode: "SKU1", qty: 1, rate: 3300, postingDate: "2026-08-04" }] }] });
    expect(report.items[0]?.openingStock).toBe(0);
    expect(report.items[0]?.totalStockLeft).toBe(1);
    expect(report.items[0]?.totalCost).toBe(3300);
    expect(report.items[0]?.buckets["91_150"].qty).toBe(1);
    expect(report.items[0]?.layers[0]?.supplier).toBeNull();
    expect(report.reconciliation.excludedIntercompanyQty).toBe(0);
  });
  it("uses the item-level FIFO PR supplier and date before the legacy Stock Entry rate", () => {
    const source = { ...receipt("SOURCE", "SOURCE-ITEM", false, "2026-07-15 10:00:00", 1, 0), supplier: "Original Supplier" };
    const destination = { ...receipt("DEST", "DEST-ITEM", true, "2026-08-04 10:00:00", 1, 0), company: "DESTCO" };
    const report = calculateAgeing({ reportDate: date, metadata: new Map(), receipts: [source, destination], movements: [
      movement("1", 1, "Purchase Receipt", "SOURCE", "SOURCE-ITEM", "2026-07-15", "Main", 1),
      movement("2", -1, "Stock Entry", "MAT-STE-1", "DETAIL", "2026-08-04", "Main", 0),
      { ...movement("3", 1, "Purchase Receipt", "DEST", "DEST-ITEM", "2026-08-04", "Main", 1), company: "DESTCO" },
    ], intercompanySources: [{ receiptErp: "ERP1", receiptCompany: "DESTCO", receiptName: "DEST", ssrName: "SSR1", sourceCompany: "COS", returnItems: [{ voucher: "MAT-STE-1", voucherType: "Stock Entry", itemCode: "SKU1" }], legacyItems: [{ voucher: "MAT-STE-1", itemCode: "SKU1", qty: 1, rate: 3300, postingDate: "2026-08-04" }] }] });
    expect(report.items[0]?.layers[0]?.prName).toBe("SOURCE");
    expect(report.items[0]?.layers[0]?.supplier).toBe("Original Supplier");
    expect(report.items[0]?.layers[0]?.prCreation).toBe("2026-07-15 10:00:00");
    expect(report.items[0]?.totalCost).toBe(3300);
  });
  it("keeps missing PI quantity visible and marks the cost incomplete", () => {
    const report = run([movement("1", 20, "Purchase Receipt", "PR1", "I1", "2026-11-01", "Main", 20)], [receipt("PR1", "I1", false, "2026-11-01 10:00:00", 20, 0)]);
    expect(report.items[0]?.totalStockLeft).toBe(20);
    expect(report.items[0]?.unpricedQty).toBe(20);
    expect(report.items[0]?.costStatus).toBe("Incomplete");
  });
  it("preserves receipt age and cost through a transfer", () => {
    const report = run([
      movement("1", 30, "Purchase Receipt", "PR1", "I1", "2026-05-01"),
      movement("2", -15, "Stock Entry", "STE1", "D1", "2026-11-02", "Main", 15),
      movement("3", 15, "Stock Entry", "STE1", "D1", "2026-11-02", "Shop", 15),
    ], [receipt("PR1", "I1", false, "2026-05-01 10:00:00", 30)]);
    expect(report.items[0]?.totalStockLeft).toBe(30);
    expect(report.items[0]?.buckets.above_150.qty).toBe(30);
    expect(report.reconciliation.discrepancies).toHaveLength(0);
  });
  it("shows remaining opening reconciliation stock separately even when actual quantity is zero", () => {
    const report = run([{ ...movement("1", 0, "Stock Reconciliation", "SR1", null, "2026-07-01", "Main", 10), valuationRate: 25 }], []);
    expect(report.items[0]?.openingStock).toBe(10);
    expect(report.items[0]?.totalStockLeft).toBe(0);
    expect(report.items[0]?.buckets["91_150"].qty).toBe(0);
    expect(report.items[0]?.totalCost).toBe(0);
    expect(report.reconciliation.eligibleStockQty).toBe(0);
    expect(report.brandSummary).toHaveLength(0);
    expect(report.grandTotal).toHaveLength(0);
    expect(report.reconciliation.unallocatedStockQty).toBe(0);
    expect(report.reconciliation.discrepancies).toHaveLength(0);
  });
  it("reduces opening stock through FIFO deductions before reporting what remains", () => {
    const report = run([
      movement("1", 0, "Stock Reconciliation", "SR1", null, "2026-07-01", "Main", 10),
      movement("2", 5, "Purchase Receipt", "PR1", "I1", "2026-11-01", "Main", 15),
      movement("3", -4, "Sales Invoice", "SALE1", null, "2026-11-02", "Main", 11),
    ], [receipt("PR1", "I1", false, "2026-11-01 10:00:00", 5)]);
    expect(report.items[0]?.openingStock).toBe(6);
    expect(report.items[0]?.totalStockLeft).toBe(5);
    expect(report.items[0]?.totalCost).toBe(50);
  });
  it("combines the same item code across ERP sources", () => {
    const first = movement("1", 10, "Purchase Receipt", "PR1", "I1", "2026-11-01", "Main", 10);
    const second = { ...movement("2", 5, "Purchase Receipt", "PR2", "I2", "2026-11-02", "Main", 5), erp: "ERP2" };
    const secondReceipt = { ...receipt("PR2", "I2", false, "2026-11-02 10:00:00", 5), erp: "ERP2" };
    const report = run([first, second], [receipt("PR1", "I1", false, "2026-11-01 10:00:00", 10), secondReceipt]);
    expect(report.items).toHaveLength(1);
    expect(report.items[0]?.totalStockLeft).toBe(15);
    expect(report.brandSummary).toHaveLength(1);
    expect(report.reconciliation.actualStockQty).toBe(15);
  });
  it("marks negative stock and reports the remaining discrepancy", () => {
    const report = run([movement("1", -5, "Delivery Note", "DN1", null, "2026-11-01", "Main", -5)], []);
    expect(report.calculationStatus).toBe("incomplete");
    expect(report.reconciliation.discrepancies.some((d) => d.kind === "negative_stock")).toBe(true);
    expect(report.reconciliation.discrepancies.some((d) => d.kind === "reconciliation" && d.difference === -5)).toBe(true);
  });
  it("leaves partial PI stock unpriced rather than extending its cost rate", () => {
    const report = run([movement("1", 20, "Purchase Receipt", "PR1", "I1", "2026-11-01", "Main", 20)], [receipt("PR1", "I1", false, "2026-11-01 10:00:00", 20, 10)]);
    expect(report.items[0]?.totalStockLeft).toBe(20);
    expect(report.items[0]?.unpricedQty).toBe(20);
    expect(report.items[0]?.costStatus).toBe("Incomplete");
  });
  it("consumes older external stock before newer intercompany stock", () => {
    const report = run([
      movement("1", 100, "Purchase Receipt", "PR1", "I1", "2026-05-01"),
      movement("2", 80, "Purchase Receipt", "PR2", "I2", "2026-11-01"),
      movement("3", -70, "Delivery Note", "DN1", null, "2026-11-02", "Main", 110),
    ], [receipt("PR1", "I1", false, "2026-05-01 10:00:00", 100), receipt("PR2", "I2", true, "2026-11-01 10:00:00", 80)]);
    expect(report.items[0]?.totalStockLeft).toBe(30);
    expect(report.reconciliation.excludedIntercompanyQty).toBe(80);
  });
  it("deducts a purchase return through its stock ledger movement", () => {
    const report = run([
      movement("1", 100, "Purchase Receipt", "PR1", "I1", "2026-11-01"),
      movement("2", -20, "Purchase Receipt", "PR1", "I1", "2026-11-02", "Main", 80),
    ], [receipt("PR1", "I1", false, "2026-11-01 10:00:00", 100)]);
    expect(report.items[0]?.totalStockLeft).toBe(80);
    expect(report.items[0]?.totalCost).toBe(800);
  });
  it("does not assign an unknown sales return to an old PR", () => {
    const report = run([
      movement("1", 10, "Purchase Receipt", "PR1", "I1", "2026-05-01"),
      movement("2", -10, "Delivery Note", "DN1", "D1", "2026-11-01", "Main", 0),
      movement("3", 5, "Delivery Note", "DN2", "D2", "2026-11-02", "Main", 5),
    ], [receipt("PR1", "I1", false, "2026-05-01 10:00:00", 10)]);
    expect(report.items).toHaveLength(0);
    expect(report.reconciliation.unallocatedStockQty).toBe(5);
  });
  it("flags a Purchase Receipt created after the report date", () => {
    const report = run([movement("1", 10, "Purchase Receipt", "PR1", "I1", "2026-11-01", "Main", 10)], [receipt("PR1", "I1", false, "2026-11-20 10:00:00", 10)]);
    expect(report.items).toHaveLength(0);
    expect(report.reconciliation.discrepancies.some((d) => d.kind === "future_pr")).toBe(true);
  });
  it("sums brand quantities and costs from item rows", () => {
    const a = movement("1", 10, "Purchase Receipt", "PR1", "I1", "2026-11-01", "Main", 10);
    const b = { ...movement("2", 5, "Purchase Receipt", "PR2", "I2", "2026-11-02", "Main", 5), itemCode: "SKU2" };
    const report = calculateAgeing({ reportDate: date, movements: [a, b], receipts: [receipt("PR1", "I1", false, "2026-11-01 10:00:00", 10), { ...receipt("PR2", "I2", false, "2026-11-02 10:00:00", 5), itemCode: "SKU2" }], metadata: new Map([
      [JSON.stringify(["ERP1", "COS", "SKU1"]), { stockUom: "Nos", barcode: null, description: null, brand: "Brand A", sellingRate: null, currency: "LKR" }],
      [JSON.stringify(["ERP1", "COS", "SKU2"]), { stockUom: "Nos", barcode: null, description: null, brand: "Brand A", sellingRate: null, currency: "LKR" }],
    ]) });
    expect(report.brandSummary[0]?.totalStock).toBe(15);
    expect(report.brandSummary[0]?.totalCost).toBe(150);
    expect(report.grandTotal[0]?.totalStock).toBe(15);
  });
  it.each([[0, "0_30"], [30, "0_30"], [31, "31_60"], [60, "31_60"], [61, "61_90"], [90, "61_90"], [91, "91_150"], [150, "91_150"], [151, "above_150"]] as const)("assigns %i days to %s", async (days, bucket) => {
    const { bucketForAge } = await import("./calculate");
    const created = new Date(Date.parse(`${date}T00:00:00Z`) - days * 86400000).toISOString();
    expect(bucketForAge(created, date)).toBe(bucket);
  });
});
