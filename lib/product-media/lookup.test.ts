import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createProductMediaHandler } from "./lookup";

const token = "synthetic_token_for_product_media_tests";
const destinationCompanyId = "portal-company";
const binding = {
  purpose: "product-media:read", companyId: "cosmo-company", locationId: "location",
  storeHostname: "store.myshopify.com", destinationCompanyId,
  tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: "2029-01-01T00:00:00Z",
};
const requestId = "f6612781-e9a9-4878-894b-d81e1a788b9d";
function request(skus: string[], company = destinationCompanyId, credential = token) {
  return new Request("https://example.test/api/integrations/supplier-portal/v1/product-media/lookup", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${credential}`, "x-portal-company-id": company },
    body: JSON.stringify({ contractVersion: "cosmo-product-media.v1", requestId, skus }),
  });
}
const row = {
  id: "product", sku: "SKU", shopifyProductId: "123", shopifyVariantId: "456",
  imageUrl: "https://cdn.shopify.com/fixture.jpg", updatedAt: new Date("2026-11-21T00:00:00Z"),
};
function fixture(rows: typeof row[] = []) {
  const load = vi.fn().mockResolvedValue(rows);
  return { load, handler: createProductMediaHandler({ config: () => JSON.stringify(binding), now: () => Date.parse("2026-11-21"), load }) };
}

describe("product-media lookup", () => {
  it("isolates destination credentials and rejects invalid or duplicate input before loading", async () => {
    const { handler, load } = fixture();
    expect((await handler(request(["SKU"], "wrong-company"))).status).toBe(403);
    expect((await handler(request(["SKU"], destinationCompanyId, "x".repeat(40)))).status).toBe(401);
    expect((await handler(request(["SKU", "SKU"]))).status).toBe(422);
    expect(load).not.toHaveBeenCalled();
  });

  it("keeps the approved source binding and returns metadata only for exact matches", async () => {
    const { handler, load } = fixture([{ ...row, stock: 12, price: "123.00", token } as typeof row]);
    const response = await handler(request(["SKU", "sku"]));
    expect(response.status).toBe(200);
    const raw = await response.text();
    expect(raw).not.toContain(token);
    expect(raw).not.toMatch(/stock|price|tokenHash/i);
    expect(JSON.parse(raw).items.map((item: { status: string }) => item.status)).toEqual(["MATCHED", "NOT_FOUND"]);
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ companyId: "cosmo-company", locationId: "location" }), ["SKU", "sku"]);
  });

  it("ignores synthetic ERP variants and separates missing photos from ambiguous matches", async () => {
    const { handler } = fixture([
      { ...row, sku: "ERP", shopifyVariantId: "erp-ERP" },
      { ...row, sku: "MISSING", imageUrl: "https://unapproved.test/image.jpg" },
      row, { ...row, id: "second", shopifyVariantId: "789" },
    ]);
    const response = await (await handler(request(["ERP", "MISSING", "SKU"]))).json();
    expect(response.items.map((item: { status: string }) => item.status)).toEqual(["NOT_FOUND", "NO_PHOTO", "AMBIGUOUS"]);
  });
});
