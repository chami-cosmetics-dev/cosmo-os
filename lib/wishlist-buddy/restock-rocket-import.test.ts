import { describe, expect, it } from "vitest";

import {
  parseCsv,
  parseRestockRocketCsv,
  parseRestockRocketDate,
  restockRocketRemark,
} from "./restock-rocket-import";

const HEADER =
  "Customer contact,Customer name,Product name,Subscription status,Product SKU,Accepts marketing,Quantity,Requested at";

describe("parseCsv", () => {
  it("handles quotes, embedded commas/newlines, CRLF and BOM", () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\r\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"\nthere'],
    ]);
  });
});

describe("parseRestockRocketDate", () => {
  it("reads dd/mm/yyyy as Sri Lanka midnight", () => {
    expect(parseRestockRocketDate("06/10/2026")?.toISOString()).toBe("2026-10-05T18:30:00.000Z");
    expect(parseRestockRocketDate("2026-10-06")).toBeNull();
    expect(parseRestockRocketDate("31/13/2026")).toBeNull();
  });
});

describe("parseRestockRocketCsv", () => {
  it("splits email vs phone contacts and normalizes", () => {
    const csv = [
      HEADER,
      "Nimal@Example.com,Nimal Perera,Rose Serum,Subscribed,RS01_1,Yes,2,06/10/2026",
      '+94 77 123 4567,"Perera, Saman",Body Lotion,Subscribed,BL02_1,No,1,25/09/2026',
    ].join("\r\n");
    const { requests, skipped } = parseRestockRocketCsv(csv);
    expect(skipped).toEqual([]);
    expect(requests[0]).toMatchObject({
      line: 2,
      name: "Nimal Perera",
      email: "nimal@example.com",
      phone: null,
      sku: "RS01_1",
      quantity: 2,
      acceptsMarketing: true,
      externalRef: "restockrocket:nimal@example.com|RS01_1",
    });
    expect(requests[1]).toMatchObject({
      name: "Perera, Saman",
      email: null,
      phone: "0771234567",
      acceptsMarketing: false,
      externalRef: "restockrocket:0771234567|BL02_1",
    });
  });

  it("skips unsubscribed, bad contacts, missing SKU and repeated contact+SKU", () => {
    const csv = [
      HEADER,
      "a@b.co,A,P,Unsubscribed,S1,Yes,1,01/10/2026",
      "12345,B,P,Subscribed,S1,Yes,1,01/10/2026",
      "c@d.co,C,P,Subscribed,,Yes,1,01/10/2026",
      "e@f.co,E,P,Subscribed,S1,Yes,1,01/10/2026",
      "E@F.co,E,P,Subscribed,S1,Yes,1,02/10/2026",
    ].join("\n");
    const { requests, skipped } = parseRestockRocketCsv(csv);
    expect(requests.map((r) => r.line)).toEqual([5]);
    expect(skipped.map((s) => [s.line, s.reason])).toEqual([
      [2, 'status "Unsubscribed"'],
      [3, "invalid phone"],
      [4, "no SKU"],
      [6, "duplicate of an earlier line (same contact + SKU)"],
    ]);
  });

  it("rejects a file without the expected columns", () => {
    expect(() => parseRestockRocketCsv("Email,Product\nx,y")).toThrow("missing column");
  });
});

describe("restockRocketRemark", () => {
  it("summarizes the original request", () => {
    const [request] = parseRestockRocketCsv(
      [HEADER, "a@b.co,A,P,Subscribed,S1,Yes,2,06/10/2026"].join("\n"),
    ).requests;
    expect(restockRocketRemark(request)).toBe(
      "Imported from Restock Rocket, requested 06/10/2026, qty 2, accepts marketing: yes",
    );
  });
});
