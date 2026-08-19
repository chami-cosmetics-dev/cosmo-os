import { describe, expect, it } from "vitest";

import { mapAdaptHeaders, rowFromValues } from "@/lib/adapt-import/columns";
import { parseCsvRecords, CsvRecordParser } from "@/lib/adapt-import/csv";
import { classifyAdaptRow } from "@/lib/adapt-import/row-classify";

describe("parseCsvRecords", () => {
  it("keeps a newline inside a quoted email so ttl_amount still maps", () => {
    const csv = [
      "sales_invoice_master_id,sales_invoice_no,invoice_date,customer_tp,customer_email,attention_name,ttl_amount,active_flag",
      '121742,1001566,23/12/2024,0717446559,"mnktrading24@gmail.com',
      '",Ms Kushani,15435,1',
      '125951,1002084,8/2/2025,0717446559,"mnktrading24@gmail.com',
      '",Ms Kushani,11900,1',
    ].join("\n");

    const [headerRow, ...rows] = parseCsvRecords(csv);
    expect(rows).toHaveLength(2);

    const headers = mapAdaptHeaders(headerRow!);
    const a = classifyAdaptRow(rowFromValues(headers, rows[0]!));
    const b = classifyAdaptRow(rowFromValues(headers, rows[1]!));

    expect(a.status).toBe("ok");
    if (a.status === "ok") {
      expect(a.enrichOnly).toBe(false);
      expect(a.salesInvoiceNo).toBe("1001566");
      expect(a.ttlAmount).toBe("15435");
      expect(a.phone).toBe("0717446559");
    }

    expect(b.status).toBe("ok");
    if (b.status === "ok") {
      expect(b.enrichOnly).toBe(false);
      expect(b.salesInvoiceNo).toBe("1002084");
      expect(b.ttlAmount).toBe("11900");
    }
  });

  it("treats doubled quotes as a literal quote", () => {
    expect(parseCsvRecords('a,"b""c",d\n')[0]).toEqual(["a", 'b"c', "d"]);
  });

  it("skips blank lines between records", () => {
    expect(parseCsvRecords("a,b\n\nc,d\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("recovers when an unclosed quote is followed by a new invoice row", () => {
    const parser = new CsvRecordParser();
    const first = parser.push('"121742","1001566","mnktrading24@gmail.com\n');
    expect(first).toEqual([]);
    expect(parser.inQuotes).toBe(true);

    const recovered = parser.forceComplete();
    expect(recovered[0]?.[0]).toBe("121742");

    const next = parser.push('"125951","1002084","0717446559",11900\n');
    const rest = parser.end();
    const rows = [...next, ...rest];
    expect(rows[0]).toEqual(["125951", "1002084", "0717446559", "11900"]);
  });
});
