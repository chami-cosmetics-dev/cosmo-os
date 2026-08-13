import { readFileSync, writeFileSync } from "node:fs";

const data = JSON.parse(readFileSync("./tmp/canvas-loyalty-data.json", "utf8"));
const rows = data.rows.map((r) => ({
  name: r.name,
  phone: r.phone,
  email: r.email,
  lifetime: r.lifetime,
  tier: r.tier,
  merchant: r.merchant,
  status: r.status,
}));

const src = `import {
  BarChart,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
} from "cursor/canvas";

const STATS = ${JSON.stringify(data.stats)} as const;
const BANDS = ${JSON.stringify(data.bands)} as const;
const MERCHANTS = ${JSON.stringify(data.merchantTop)} as const;
const ROWS = ${JSON.stringify(rows)} as const;

function fmt(n: number) {
  return n.toLocaleString("en-LK");
}

export default function EligibleUnregisteredLoyalty() {
  const gold = ROWS.filter((r) => r.tier === "gold").length;
  const platinum = ROWS.filter((r) => r.tier === "platinum").length;

  return (
    <Stack gap={20} style={{ padding: 24 }}>
      <Stack gap={6}>
        <H1>Eligible, not registered loyalty</H1>
        <Text tone="secondary" size="small">
          Cosmo OS prod · lifetime ≥ LKR 100,000 · no OS loyaltyAssignedTier · not in ERP
          Gold/Platinum
        </Text>
        <Text tone="secondary" size="small">
          Source: Adapt + Cosmo delivery/invoice-complete · ERP_1 + ERP_2 · generated
          2026-08-13
        </Text>
      </Stack>

      <Callout tone="warning" title="Shopify note">
        Shopify tags not live-checked. Assign flow sets ERP customer_group + Shopify tag
        together, so ERP gap is the registration gap. 12 junk/outlier rows excluded from
        table (test phones / foreign placeholders / &gt;5M lifetime).
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value={String(STATS.clean)} label="Eligible not in ERP" tone="accent" />
        <Stat value={String(gold)} label="Suggested Gold" />
        <Stat value={String(platinum)} label="Suggested Platinum" />
        <Stat
          value={String(STATS.alreadyErp)}
          label="OS gap but already ERP"
          tone="success"
        />
      </Grid>

      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader>Lifetime bands (clean)</CardHeader>
          <CardBody>
            <BarChart
              categories={BANDS.map((b) => b.band)}
              series={[{ name: "Customers", data: BANDS.map((b) => b.count) }]}
              height={220}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Top merchants</CardHeader>
          <CardBody>
            <BarChart
              categories={MERCHANTS.slice(0, 8).map((m) => m.merchant)}
              series={[
                {
                  name: "Customers",
                  data: MERCHANTS.slice(0, 8).map((m) => m.count),
                },
              ]}
              height={220}
            />
          </CardBody>
        </Card>
      </Grid>

      <Divider />

      <Stack gap={8}>
        <Row gap={8} align="center">
          <H2>Customer list</H2>
          <Pill tone="accent">{ROWS.length} rows</Pill>
        </Row>
        <Text tone="secondary" size="small">
          Full CSV: tmp/eligible-unregistered-loyalty.csv. Re-run: node
          scripts/with-env.mjs cosmo-prod node
          scripts/list-eligible-unregistered-loyalty.mjs
          --out=tmp/eligible-unregistered-loyalty.json
        </Text>
        <Table
          stickyHeader
          columns={[
            { id: "name", header: "Name", width: 180 },
            { id: "phone", header: "Phone", width: 120 },
            { id: "lifetime", header: "Lifetime (LKR)", align: "right", width: 120 },
            { id: "tier", header: "Tier", width: 90 },
            { id: "merchant", header: "Merchant", width: 140 },
            { id: "status", header: "Outreach", width: 100 },
            { id: "email", header: "Email" },
          ]}
          rows={ROWS.map((r) => ({
            name: r.name,
            phone: r.phone,
            lifetime: fmt(Math.round(r.lifetime)),
            tier: r.tier,
            merchant: r.merchant,
            status: r.status || "—",
            email: r.email || "—",
            tone: r.tier === "platinum" ? "warning" : undefined,
          }))}
        />
      </Stack>
    </Stack>
  );
}
`;

writeFileSync(
  "C:/Users/Bad-Boy/.cursor/projects/c-dev-cosmo-os/canvases/eligible-unregistered-loyalty.canvas.tsx",
  src
);
console.log("wrote canvas", rows.length, "rows");
