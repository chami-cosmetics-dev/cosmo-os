/**
 * Built-in email template keys + defaults.
 * Companies can also create custom keys for future mails.
 */

export const EMAIL_TEMPLATE_KEY_RE = /^[a-z][a-z0-9_]{1,63}$/;

export type EmailTemplateDefinition = {
  key: string;
  name: string;
  subject: string;
  bodyHtml: string;
  recipients: string;
  ccRecipients: string;
  /** Shown in settings UI — keep placeholder names stable. */
  placeholders: string[];
  builtin: boolean;
  /** When true, cron/job may send this template automatically. */
  automated?: boolean;
};

export const STOCK_PRICE_MISSING_DAILY_KEY = "stock_price_missing_daily";
export const RESIGNATION_NOTICE_KEY = "resignation_notice";

export const BUILTIN_EMAIL_TEMPLATES: EmailTemplateDefinition[] = [
  {
    key: RESIGNATION_NOTICE_KEY,
    name: "Resignation Notice",
    subject: "Staff Resignation: {{staffName}}",
    bodyHtml: `<p>This is to inform you that the following staff member has resigned and the offboarding process has been completed.</p>
<ul>
<li><strong>Name:</strong> {{staffName}}</li>
<li><strong>Resignation date:</strong> {{resignationDate}}</li>
<li><strong>Reason:</strong> {{reason}}</li>
<li><strong>Employee number:</strong> {{employeeNumber}}</li>
<li><strong>Department:</strong> {{department}}</li>
<li><strong>Designation:</strong> {{designation}}</li>
<li><strong>Location:</strong> {{location}}</li>
</ul>`,
    recipients: "",
    ccRecipients: "",
    placeholders: [
      "staffName",
      "resignationDate",
      "reason",
      "employeeNumber",
      "department",
      "designation",
      "location",
    ],
    builtin: true,
  },
  {
    key: STOCK_PRICE_MISSING_DAILY_KEY,
    name: "Stock — selling price missing",
    subject:
      "{{reportDate}} — Selling price gaps ({{itemCount}}: ERP1 {{erp1Count}}, ERP2 {{erp2Count}})",
    bodyHtml: `<p>Daily report for <strong>{{companyName}}</strong>.</p>
<p>Generated: <strong>{{generatedAt}}</strong> (Colombo)</p>
<p>
  Every item needs <strong>Standard Selling</strong>.
  ERP1 OGF only for <strong>Cerave</strong>.
  ERP2 OGF for all brands except Acnes, Hada Labo, Jovees, Keune, lipIce, Melano CC, Olay, Palmers, Savol, wella, ZGTS, Sebamed, Cerave.
  VAT - Selling is optional and not used.
</p>

<p><strong>1) {{erp1Label}} (ERP1)</strong></p>
<ul>
  <li>Total: {{erp1Count}}</li>
  <li>Standard missing only: {{erp1MissingStandardCount}}</li>
  <li>OGF missing only: {{erp1MissingOgfCount}}</li>
  <li>Both missing: {{erp1MissingBothCount}}</li>
</ul>
{{erp1TableHtml}}

<p><strong>2) {{erp2Label}} (ERP2)</strong></p>
<p>VAT and Discontinue Product Priority items excluded (live from ERP).</p>
<ul>
  <li>Total: {{erp2Count}}</li>
  <li>Standard missing only: {{erp2MissingStandardCount}}</li>
  <li>OGF missing only: {{erp2MissingOgfCount}}</li>
  <li>Both missing: {{erp2MissingBothCount}}</li>
</ul>
{{erp2TableHtml}}

<p style="color:#666;font-size:12px;margin-top:24px;">
  Cosmo OS automated report.
  Standard Selling required for all.
  ERP1: OGF only Cerave. ERP2: OGF skip list Acnes, Hada Labo, Jovees, Keune, lipIce, Melano CC, Olay, Palmers, Savol, wella, ZGTS, Sebamed, Cerave.
  ERP1/ERP2 exclude Discontinue; ERP2 also excludes Vat. Excel attached (one sheet per ERP).
</p>`,
    recipients: "asitha@cosmetics.lk",
    ccRecipients:
      "ruvindya.cosmetics@outlook.com, irush.cosmetics@outlook.com, ndilrukshi.cosmetics@outlook.com, harshanad.cosmetics@outlook.com, hpg.inoka@gmail.com",
    placeholders: [
      "companyName",
      "reportDate",
      "generatedAt",
      "itemCount",
      "erp1Label",
      "erp2Label",
      "erp1Count",
      "erp2Count",
      "erp1MissingStandardCount",
      "erp1MissingOgfCount",
      "erp1MissingBothCount",
      "erp2MissingStandardCount",
      "erp2MissingOgfCount",
      "erp2MissingBothCount",
      "erp1TableHtml",
      "erp2TableHtml",
    ],
    builtin: true,
    automated: true,
  },
];

export function builtinTemplateByKey(key: string): EmailTemplateDefinition | undefined {
  return BUILTIN_EMAIL_TEMPLATES.find((t) => t.key === key);
}

export function isValidEmailTemplateKey(key: string): boolean {
  return EMAIL_TEMPLATE_KEY_RE.test(key);
}
