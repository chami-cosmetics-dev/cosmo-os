/**
 * Generates docs/cosmo-os-beginner-guide.pdf
 * Run: node scripts/generate-beginner-guide-pdf.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdfMake = require("pdfmake");
const vfsFonts = require("pdfmake/build/vfs_fonts");

for (const [key, val] of Object.entries(vfsFonts)) {
  pdfMake.virtualfs.writeFileSync(key, Buffer.from(val, "base64"));
}
pdfMake.addFonts({
  Roboto: {
    normal: "Roboto-Regular.ttf",
    bold: "Roboto-Medium.ttf",
    italics: "Roboto-Italic.ttf",
    bolditalics: "Roboto-MediumItalic.ttf",
  },
});
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy(() => false);

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "docs", "cosmo-os-beginner-guide.pdf");

const muted = "#555555";
const accent = "#1a365d";
const codeBg = "#f4f4f5";

function h1(text) {
  return { text, style: "h1", margin: [0, 18, 0, 8] };
}
function h2(text) {
  return { text, style: "h2", margin: [0, 14, 0, 6] };
}
function h3(text) {
  return { text, style: "h3", margin: [0, 10, 0, 4] };
}
function p(text) {
  return { text, style: "body", margin: [0, 0, 0, 6] };
}
function bullet(items) {
  return {
    ul: items.map((t) => ({ text: t, style: "body", margin: [0, 2, 0, 2] })),
    margin: [0, 0, 0, 8],
  };
}
function code(text) {
  return {
    text,
    style: "code",
    background: codeBg,
    margin: [0, 4, 0, 8],
  };
}
function table(headers, rows) {
  return {
    table: {
      headerRows: 1,
      widths: headers.map(() => "*"),
      body: [
        headers.map((h) => ({ text: h, style: "tableHeader" })),
        ...rows.map((row) => row.map((c) => ({ text: c, style: "tableCell" }))),
      ],
    },
    layout: "lightHorizontalLines",
    margin: [0, 6, 0, 10],
  };
}
function flow(text) {
  return {
    text,
    style: "code",
    background: codeBg,
    preserveLeadingSpaces: true,
    margin: [0, 4, 0, 10],
  };
}

const content = [
  h1("Cosmo OS — Beginner Guide"),
  p("A complete introduction to the cosmo-os project: what it is, how it is built, and how data flows through the system. Written in simple English."),
  { text: "Generated from the cosmo-os repository.", style: "muted", margin: [0, 0, 0, 16] },

  h2("1. What is this project?"),
  p("Cosmo OS is a business operations platform for an e-commerce company (Cosmetics.lk and related brands). It helps staff:"),
  bullet([
    "Receive and manage Shopify orders",
    "Sync orders to ERPNext (accounting/ERP system)",
    "Handle fulfillment (pack, dispatch, delivery)",
    "Manage staff, roles, and permissions",
    "Track contacts, complaints, returns, exchanges",
    "Run reports and dashboards",
    "Support riders via a mobile app (Cosmo Rider)",
  ]),
  p("The same codebase also runs Vault OS (supplement business) — one app, different databases."),
  p("Simple mental model: Shopify (online shop) → Cosmo OS (control center) → ERPNext (finance) → Riders (delivery)."),

  h2("2. SDLC — How the team builds software"),
  p("SDLC = Software Development Life Cycle (the steps from idea to production). This project uses a modern, agile-style workflow:"),
  table(
    ["Phase", "What happens"],
    [
      ["Planning", "Features added as needed (orders, fulfillment, contacts, etc.)"],
      ["Development", "Developers write code locally with npm run dev"],
      ["Version control", "Git + GitHub — code in branches, merged via Pull Requests"],
      ["Database changes", "Edit prisma/schema.prisma → create migration → deploy to all 3 DBs"],
      ["Testing", "Vitest unit tests + TypeScript checks (especially mobile)"],
      ["CI", "GitHub Actions runs tests on every PR"],
      ["Deployment", "Vercel (Next.js) + Neon (PostgreSQL) + EAS (mobile builds)"],
    ]
  ),
  p("Daily developer flow:"),
  code("git pull → npm install → npm run db:deploy → npm run dev → code → test → PR → merge → deploy"),

  h2("3. Tech stack"),
  h3("Web app (main product)"),
  table(
    ["Layer", "Technology", "Simple meaning"],
    [
      ["Framework", "Next.js 16 (App Router)", "React framework — pages + API in one project"],
      ["UI", "React 19 + Tailwind CSS 4", "User interface + styling"],
      ["Components", "shadcn/ui + Radix UI", "Pre-built accessible UI pieces"],
      ["Language", "TypeScript", "JavaScript with types — fewer bugs"],
      ["Database", "PostgreSQL (Neon cloud)", "Stores all business data"],
      ["ORM", "Prisma", "Talks to the database using TypeScript"],
      ["Auth", "Auth0", "Login/logout — you don't build passwords yourself"],
      ["Validation", "Zod", "Checks all input is safe and correct"],
      ["Charts", "Recharts", "Dashboard graphs"],
      ["Files", "Cloudinary, Vercel Blob", "Image/file storage"],
    ]
  ),
  h3("Mobile app"),
  table(
    ["Layer", "Technology"],
    [
      ["Framework", "Expo + React Native"],
      ["Routing", "Expo Router"],
      ["Backend", "Same Next.js API (/api/mobile/v1/*)"],
    ]
  ),
  h3("External systems"),
  table(
    ["System", "Role"],
    [
      ["Shopify", "Online store — sends order webhooks"],
      ["ERPNext", "Invoices, customers, accounting"],
      ["Auth0", "User login for web + mobile"],
      ["SMS (Hutch)", "Order notifications"],
      ["Maileroo", "Email"],
    ]
  ),

  h2("4. Protocols & communication"),
  p("Protocol = the language two systems use to talk."),
  table(
    ["Protocol", "Where used"],
    [
      ["HTTPS", "All web and API traffic (encrypted)"],
      ["HTTP REST", "Frontend calls /api/admin/... with GET/POST/PATCH/DELETE"],
      ["JSON", "Data format for APIs and webhooks"],
      ["OAuth / OIDC", "Auth0 login flow (/auth/login, session cookies)"],
      ["Bearer token", "Mobile app sends Authorization: Bearer <token>"],
      ["Webhooks", "Shopify and ERPNext push events to /api/webhooks/..."],
      ["HMAC-SHA256", "Shopify signs webhooks — app verifies they are real"],
      ["PostgreSQL wire protocol", "Prisma ↔ Neon database"],
    ]
  ),
  p("Important rule: The browser is NOT trusted. Every API route checks auth and validates input on the server."),

  h2("5. Architecture (big picture)"),
  p("This is a monorepo with a layered, full-stack Next.js design."),
  h3("Architecture style"),
  bullet([
    "Full-stack monolith — one Next.js app (not microservices)",
    "Server-first — many pages fetch data on the server before showing UI",
    "API routes as backend — no separate Express server",
    "Shared lib/ — business logic reused by pages and APIs",
    "Multi-tenant by company — each Company has its own data (companyId on rows)",
    "RBAC — Role-Based Access Control (permissions like orders.read)",
  ]),
  flow(
    "Clients (Web, Mobile, Shopify, ERPNext)\n        ↓\nNext.js: app/ (pages) + app/api/ (REST) + lib/ (logic)\n        ↓\nPostgreSQL via Prisma\n        ↓\nExternal: ERPNext, SMS, Email"
  ),

  h2("6. Folder structure"),
  flow(
    `cosmo-os/
├── app/                    ← Next.js App Router (routes = folders)
│   ├── layout.tsx          ← Root HTML shell, theme, Auth0
│   ├── (dashboard)/        ← Protected admin area
│   │   ├── layout.tsx      ← Checks login, wraps sidebar
│   │   └── dashboard/      ← Each page = one URL
│   └── api/                ← Backend endpoints
│       ├── admin/          ← Staff dashboard APIs
│       ├── mobile/v1/      ← Rider app APIs
│       ├── webhooks/       ← Shopify, ERPNext
│       └── cron/           ← Scheduled jobs
├── components/             ← UI (ui → molecules → organisms → templates)
├── lib/                    ← Business logic (the brain)
├── prisma/                 ← Database schema + migrations
├── mobile/rider-app/       ← Separate Expo project
├── scripts/                ← One-off tools
└── .github/workflows/      ← CI pipeline`
  ),
  p("Next.js routing: folder name = URL path. Example: app/(dashboard)/dashboard/orders/page.tsx → /dashboard/orders"),
  p("(dashboard) is a route group — organizes files but does NOT appear in the URL."),

  h2("7. How logic flows"),
  h3("A. User opens the dashboard"),
  flow(
    "Browser → proxy.ts → Auth0 (check session)\n→ dashboard/layout.tsx → lib/rbac (user + permissions)\n→ page.tsx → HTML sent to browser"
  ),
  p("Key file: proxy.ts protects routes and lets webhooks through without login."),

  h3("B. User clicks Save on a form"),
  flow(
    "React Component → fetch POST /api/admin/...\n→ requirePermission() — auth check\n→ Zod validation — input check\n→ lib/*.ts — business work\n→ prisma → PostgreSQL\n→ JSON response → notify.success()"
  ),
  p("Every API follows: 1) Auth  2) Validate  3) lib/ logic  4) JSON response"),

  h3("C. Shopify sends a new order"),
  flow(
    "Shopify → POST /api/webhooks/shopify/orders\n→ Verify HMAC signature\n→ Validate with Zod\n→ processOrderWebhook\n→ Save Order, line items, sync ERPNext, send SMS, assign merchant\n→ On failure: FailedOrderWebhook + auto-retry"
  ),

  h3("D. Page-data pattern (performance)"),
  p("Instead of 5 API calls, one endpoint returns everything:"),
  code("/dashboard/products → GET /api/admin/product-items/page-data"),
  p("Logic lives in lib/page-data/product-items.ts, called by the API route."),

  h2("8. Database model (simple view)"),
  flow(
    `Company
  ├── Users (staff, Roles & Permissions)
  ├── CompanyLocations (Shopify stores / warehouses)
  ├── Orders (from Shopify)
  ├── ProductItems (catalog)
  ├── Contacts (CRM)
  ├── Customers
  └── ErpnextInstance (ERP connection settings)`
  ),
  p("Prisma defines models in prisma/schema.prisma. Migrations are SQL files that change the live database."),
  p("Three environments: .env.vault (Vault OS), .env.cosmo-dev (dev), .env.cosmo-prod (production). Switch with: npm run env:use cosmo-dev"),

  h2("9. Security & permissions (RBAC)"),
  p("RBAC = each user has roles; each role has permissions. Examples:"),
  bullet([
    "orders.read — view orders",
    "orders.manage — dispatch, fulfillment",
    "staff.manage — edit employee profiles",
    "settings.company — company settings",
  ]),
  p("Defined in lib/rbac.ts. APIs call requirePermission() before doing work."),
  p("Golden rule: Never trust the browser. Validate everything server-side with Zod (lib/validation.ts)."),

  h2("10. Best practices in this project"),
  table(
    ["Practice", "What it means here"],
    [
      ["TypeScript everywhere", "Catch mistakes before runtime"],
      ["Server-side validation (Zod)", "lib/validation.ts + domain schemas"],
      ["Single page-data APIs", "Fewer round trips, faster pages"],
      ["Server prefetch", "Dashboard loads data on server, passes to client"],
      ["server-only imports", "Secret logic never ships to browser"],
      ["Atomic design for UI", "ui → molecules → organisms → templates"],
      ["Audit logs", "Track who changed what"],
      ["Performance logging", "createPerfLogger() in hot paths"],
      ["Loading UX", "Spinners, disable buttons, toast notifications"],
      ["Git + CI", "Tests run automatically on PRs"],
      ["Migration discipline", "Never db:push on shared/prod DBs"],
    ]
  ),

  h2("11. UI component layers"),
  flow(
    `ui/          → Button, Input, Card        (smallest)
molecules/   → Login form, stat card      (small groups)
organisms/   → Orders panel, staff panel  (big sections)
templates/   → Dashboard shell           (full page frame)`
  ),
  p("Pages in app/ stay thin — they mostly import an organism and pass data."),

  h2("12. Mobile app (Cosmo Rider)"),
  p("Separate Expo project in mobile/rider-app/. Calls the same backend at /api/mobile/v1/*. Routes are thin; logic is in src/hooks/ and src/api/. One app supports multiple companies (Cosmetics + Vault) with separate tokens per tenant."),

  h2("13. How to learn this project (beginner path)"),
  h3("Week 1 — Setup & tour"),
  bullet([
    "Read README.md",
    "Run: npm install → npm run env:use cosmo-dev → npm run dev",
    "Open http://localhost:3000 and explore",
    "Skim prisma/schema.prisma — see Company, User, Order",
  ]),
  h3("Week 2 — Follow one feature (Orders)"),
  bullet([
    "Page: app/(dashboard)/dashboard/orders/...",
    "Panel: components/organisms/...",
    "API: app/api/admin/orders/...",
    "Logic: lib/order-webhook-process.ts, lib/erpnext-sync.ts",
    "DB: Order model in Prisma",
  ]),
  h3("Week 3 — Auth & permissions"),
  bullet(["proxy.ts", "lib/auth0.ts", "lib/rbac.ts", "app/(dashboard)/layout.tsx"]),
  h3("Week 4 — Integrations"),
  bullet([
    "app/api/webhooks/shopify/orders/route.ts",
    "lib/shopify-webhook.ts",
    "lib/erpnext-sync.ts",
  ]),
  h3("Week 5 — Patterns to copy"),
  bullet([
    "Any page-data route + lib/page-data/ file",
    ".cursor/rules/security-validation.mdc",
    ".cursor/rules/performance-optimization.mdc",
  ]),

  h2("14. Useful commands"),
  code(
    `npm run dev              # Start web app
npm test                 # Run tests
npm run lint             # Check code style
npm run db:generate      # After schema changes
npm run db:deploy:cosmo-dev   # Apply migrations
npm run env:use cosmo-dev     # Switch environment`
  ),

  h2("15. Mental model (remember this)"),
  flow(
    `URL (app/)  →  Page shows UI (components/)
                    ↓ fetch
              API (app/api/)  →  Auth (rbac)  →  Validate (Zod)
                    ↓
              Business logic (lib/)  →  Database (Prisma/PostgreSQL)
                    ↓
              External systems (Shopify, ERPNext, SMS, Email)`
  ),
  p("Cosmo OS is the middle layer that connects the online shop, warehouse team, finance, and delivery riders — with strict login, permissions, and validated data at every step."),
];

const docDef = {
  info: {
    title: "Cosmo OS — Beginner Guide",
    author: "cosmo-os",
    subject: "Project onboarding guide",
  },
  pageSize: "A4",
  pageMargins: [48, 56, 48, 56],
  defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.35 },
  styles: {
    h1: { fontSize: 22, bold: true, color: accent },
    h2: { fontSize: 15, bold: true, color: accent },
    h3: { fontSize: 12, bold: true, color: "#2d3748" },
    body: { fontSize: 10, color: "#1a1a1a" },
    muted: { fontSize: 9, color: muted, italics: true },
    code: { fontSize: 8.5, color: "#1e293b" },
    tableHeader: { bold: true, fontSize: 9, fillColor: "#e2e8f0", color: accent },
    tableCell: { fontSize: 9 },
  },
  footer(currentPage, pageCount) {
    return {
      columns: [
        { text: "Cosmo OS Beginner Guide", style: "muted", margin: [48, 0, 0, 0] },
        {
          text: `Page ${currentPage} of ${pageCount}`,
          alignment: "right",
          style: "muted",
          margin: [0, 0, 48, 0],
        },
      ],
      margin: [0, 8, 0, 0],
    };
  },
  content,
};

await mkdir(dirname(outPath), { recursive: true });
const buffer = await pdfMake.createPdf(docDef).getBuffer();
await writeFile(outPath, buffer);
console.log(`PDF written to: ${outPath}`);
