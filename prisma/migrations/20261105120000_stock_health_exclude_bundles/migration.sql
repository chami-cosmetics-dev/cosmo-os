-- Bundle packs are left out of Stock Health: the BU0* rule (every Common SKU starting with
-- BU0, also bundles added later) plus today's bundle SKUs, for every company with an ERP
-- connection.
INSERT INTO "StockHealthExcludedSku" ("id", "companyId", "sku")
SELECT md5(c."id" || v.sku), c."id", v.sku
FROM "Company" c
CROSS JOIN (VALUES
    ('BU0*'), ('BU001'), ('BU002'), ('BU003'), ('BU004'), ('BU005'), ('BU006'), ('BU007'), ('BU008'),
    ('BU009'), ('BU010'), ('BU011'), ('BU012'), ('BU013'), ('BU014'), ('BU015'), ('BU016'),
    ('BU017'), ('BU018'), ('BU019'), ('BU020'), ('BU021'), ('BU022'), ('BU023'), ('BU024'),
    ('BU025'), ('BU026'), ('BU027'), ('BU028'), ('BU029'), ('BU030'), ('BU031'), ('BU032'),
    ('BU033'), ('BU034'), ('BU035')
) AS v(sku)
WHERE EXISTS (SELECT 1 FROM "ErpnextInstance" e WHERE e."companyId" = c."id")
ON CONFLICT ("companyId", "sku") DO NOTHING;
