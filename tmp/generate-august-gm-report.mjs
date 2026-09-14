import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "August-2026-Work-List-GM.pdf");

const PAGE = { w: 595.28, h: 841.89 }; // A4
const MARGIN = { left: 48, right: 48, top: 52, bottom: 48 };
const COLORS = {
  ink: rgb(0.12, 0.14, 0.18),
  muted: rgb(0.35, 0.38, 0.42),
  accent: rgb(0.08, 0.35, 0.55),
  line: rgb(0.82, 0.85, 0.88),
  sectionBg: rgb(0.94, 0.96, 0.98),
};

/** @type {{ title: string, items: { title: string, desc: string }[] }[]} */
const SECTIONS = [
  {
    title: "Customer Insight & Merchant Operations",
    items: [
      {
        title: "Customer Insight platform",
        desc: "Shipped core panel for allocation, loyalty, call queue, and contact workflows used by merchant teams.",
      },
      {
        title: "Advanced filters & pagination",
        desc: "City, merchant, location, item, and brand filters with pagination so large contact lists stay usable.",
      },
      {
        title: "Loyalty push & ERP sync",
        desc: "Loyalty push flow, ERP sync, and contact allocation import to keep Cosmo and ERP aligned.",
      },
      {
        title: "Call tracking enhancements",
        desc: "Call outcomes, last-contacted tracking, and limited-view logic for day-to-day calling.",
      },
      {
        title: "Contacts reimport",
        desc: "Completed contacts reimport so merchant allocation lists stay current.",
      },
    ],
  },
  {
    title: "Merchant Dashboard",
    items: [
      {
        title: "Targets, MTD & top customers",
        desc: "Merchant targets, month-to-date performance, and top-customer views for coaching and reviews.",
      },
      {
        title: "Cosmetics.lk analytics",
        desc: "Drilldown, cohort pie, and location-share views for Cosmetics.lk performance.",
      },
      {
        title: "Sales movement tracking",
        desc: "Period-based sales movement so merchants can see trend, not only snapshot totals.",
      },
      {
        title: "Loyalty & birthday tools",
        desc: "Loyalty profile validation and birthday-wish support from the merchant dashboard.",
      },
      {
        title: "Shop & online targets",
        desc: "Separate shop and online target amounts for clearer goal setting.",
      },
      {
        title: "Role access & permissions",
        desc: "Merchant role redirection and dashboard permission controls so the right people see the right data.",
      },
    ],
  },
  {
    title: "Book Notes & Store Allocation",
    items: [
      {
        title: "Merchant Daily Book Notes",
        desc: "Book notes with receipts, card references, history, and Excel export for daily shop recording.",
      },
      {
        title: "Multi-SKU store allocation export",
        desc: "Multi-SKU export and location-step improvements for store allocation planning.",
      },
      {
        title: "Allocation permission fix",
        desc: "Restored location-allocation permissions that were dropping incorrectly.",
      },
    ],
  },
  {
    title: "OSF, Catalog & Stickers",
    items: [
      {
        title: "OSF Supplier Orders",
        desc: "Supplier order flow with ROP warnings, max-stock %, and priority/zip handling.",
      },
      {
        title: "OSF page & product editor",
        desc: "OSF page structure update and live stock loading in the product editor.",
      },
      {
        title: "Sticker batch redesign",
        desc: "Sticker batch/print redesign plus client-side enhancements for warehouse printing.",
      },
      {
        title: "NMR/NMRA on stickers",
        desc: "Approved NMR/NMRA mark shown on printed stickers for compliance visibility.",
      },
      {
        title: "Price & priority auto-sync",
        desc: "Item price and priority auto-syncing to reduce manual catalog maintenance.",
      },
    ],
  },
  {
    title: "Payments, Orders & Fulfillment",
    items: [
      {
        title: "Shopify–ERP double payment fix",
        desc: "Resolved double-payment cases between Shopify and ERP so finance postings stay correct.",
      },
      {
        title: "KOKO payment & references",
        desc: "KOKO payment handling, reference numbers in approvals, and order status updates.",
      },
      {
        title: "Split payment & Mintpay",
        desc: "Split-payment approval workflow and Mintpay method support.",
      },
      {
        title: "Cancel / replace order linking",
        desc: "Shopify cancel and replace orders now connect order numbers to the canceled order.",
      },
      {
        title: "Citypak compact dispatch PDF",
        desc: "Compact dispatch PDF limited to Citypak couriers for cleaner label packs.",
      },
      {
        title: "Pick list by brand groups",
        desc: "Pick list regrouped by brand instead of location for faster warehouse picking.",
      },
      {
        title: "Abandoned orders follow-up",
        desc: "Follow-up status and UI improvements on abandoned orders for recovery calls.",
      },
    ],
  },
  {
    title: "Ops & Platform",
    items: [
      {
        title: "Dashboard sales filters",
        desc: "Sales filter improvements (Spec 030) for clearer reporting summaries.",
      },
      {
        title: "Samples, fulfillment & timezone fixes",
        desc: "Sample-send cron, fulfillment updates, and Asia/Colombo date handling for rider metrics.",
      },
      {
        title: "Email cleanup & RBAC hardening",
        desc: "Bulk email cleanup tools and custom role permission pinning to stop accidental permission loss.",
      },
    ],
  },
  {
    title: "In Progress / Carry into September",
    items: [
      {
        title: "Store stock count (ready for review)",
        desc: "Rounds, barcode matching, digit entry, and CSV/XLSX exports for store stock counts.",
      },
      {
        title: "Customer purchase history update",
        desc: "Customer total purchase history refresh — ready for review.",
      },
      {
        title: "Merchant filter & report",
        desc: "Merchant filter and reporting work still in progress.",
      },
      {
        title: "Sales total reconciliation",
        desc: "Confirm Cosmo sales totals vs actual reports after contact reimport.",
      },
      {
        title: "Rider App Performance & Incentives",
        desc: "Rider performance and incentive feature still in progress.",
      },
      {
        title: "Merchant targets / MTD ranked list",
        desc: "Month figure, save refresh, carry-forward, and ranked MTD list — ready for review.",
      },
      {
        title: "Failed ERP Payment Entry auto-retry",
        desc: "Auto-retry for failed payment entries; production ship in progress.",
      },
      {
        title: "Unallocate Shevon contacts",
        desc: "Production unallocation of Shevon contacts — ready for review.",
      },
      {
        title: "Item Trends & Competitor Price Compare",
        desc: "Specs 047/048 started; continuing into September.",
      },
    ],
  },
];

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - MARGIN.top;
  let pageNo = 1;

  const contentWidth = PAGE.w - MARGIN.left - MARGIN.right;

  function drawFooter() {
    page.drawLine({
      start: { x: MARGIN.left, y: 34 },
      end: { x: PAGE.w - MARGIN.right, y: 34 },
      thickness: 0.5,
      color: COLORS.line,
    });
    page.drawText("Confidential — Cosmo OS / Internal GM Meeting", {
      x: MARGIN.left,
      y: 20,
      size: 8,
      font,
      color: COLORS.muted,
    });
    const label = `Page ${pageNo}`;
    const tw = font.widthOfTextAtSize(label, 8);
    page.drawText(label, {
      x: PAGE.w - MARGIN.right - tw,
      y: 20,
      size: 8,
      font,
      color: COLORS.muted,
    });
  }

  function newPage() {
    drawFooter();
    page = doc.addPage([PAGE.w, PAGE.h]);
    pageNo += 1;
    y = PAGE.h - MARGIN.top;
  }

  function ensureSpace(needed) {
    if (y - needed < MARGIN.bottom + 16) newPage();
  }

  function wrap(text, size, maxWidth, useBold = false) {
    const f = useBold ? fontBold : font;
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(test, size) <= maxWidth) {
        line = test;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // Cover / header
  page.drawRectangle({
    x: 0,
    y: PAGE.h - 118,
    width: PAGE.w,
    height: 118,
    color: COLORS.accent,
  });
  page.drawText("AUGUST 2026", {
    x: MARGIN.left,
    y: PAGE.h - 48,
    size: 11,
    font: fontBold,
    color: rgb(0.85, 0.92, 1),
  });
  page.drawText("Work Summary for GM Meeting", {
    x: MARGIN.left,
    y: PAGE.h - 74,
    size: 22,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText("Sasida Dilhan  ·  Cosmo OS  ·  Delivered & In Progress", {
    x: MARGIN.left,
    y: PAGE.h - 98,
    size: 10,
    font,
    color: rgb(0.85, 0.92, 1),
  });

  y = PAGE.h - 140;

  // Intro blurb
  const intro =
    "Focus for August: Customer Insight and Merchant Dashboard went live for merchant teams; Book Notes, OSF, stickers, and KOKO/payment flows were hardened; month closed with stock-count and sales-movement work moving to review.";
  for (const line of wrap(intro, 10, contentWidth)) {
    page.drawText(line, {
      x: MARGIN.left,
      y,
      size: 10,
      font,
      color: COLORS.ink,
    });
    y -= 14;
  }
  y -= 10;

  let pointNo = 1;

  for (const section of SECTIONS) {
    ensureSpace(36);
    // Section header bar
    page.drawRectangle({
      x: MARGIN.left,
      y: y - 6,
      width: contentWidth,
      height: 22,
      color: COLORS.sectionBg,
    });
    page.drawText(section.title, {
      x: MARGIN.left + 8,
      y: y,
      size: 11,
      font: fontBold,
      color: COLORS.accent,
    });
    y -= 28;

    for (const item of section.items) {
      const title = `${pointNo}. ${item.title}`;
      const titleLines = wrap(title, 10, contentWidth - 8, true);
      const descLines = wrap(item.desc, 9, contentWidth - 16);
      const blockH = titleLines.length * 13 + descLines.length * 12 + 10;
      ensureSpace(blockH);

      for (const line of titleLines) {
        page.drawText(line, {
          x: MARGIN.left + 4,
          y,
          size: 10,
          font: fontBold,
          color: COLORS.ink,
        });
        y -= 13;
      }
      for (const line of descLines) {
        page.drawText(line, {
          x: MARGIN.left + 16,
          y,
          size: 9,
          font,
          color: COLORS.muted,
        });
        y -= 12;
      }
      y -= 8;
      pointNo += 1;
    }
    y -= 4;
  }

  // Closing note
  ensureSpace(40);
  page.drawLine({
    start: { x: MARGIN.left, y },
    end: { x: PAGE.w - MARGIN.right, y },
    thickness: 0.6,
    color: COLORS.line,
  });
  y -= 16;
  page.drawText("Prepared for GM meeting from ClickUp completed work and August git delivery.", {
    x: MARGIN.left,
    y,
    size: 8,
    font,
    color: COLORS.muted,
  });

  drawFooter();

  const bytes = await doc.save();
  mkdirSync(__dirname, { recursive: true });
  writeFileSync(outPath, bytes);
  console.log(outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
