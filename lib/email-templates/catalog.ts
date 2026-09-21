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
      "{{reportDate}} — Selling price gaps ({{itemCount}}: no price {{missingBothCount}}, ERP2 OGF {{erp2OgfMissingCount}})",
    bodyHtml: `<p>Daily report for <strong>{{companyName}}</strong>.</p>
<p>Generated: <strong>{{generatedAt}}</strong> (Colombo)</p>

<p><strong>1) No selling price — stock in both ERPs</strong></p>
<p>Neither Standard Selling nor OGF.</p>
<ul>
  <li>Count: {{missingBothCount}}</li>
</ul>
{{itemTableHtml}}

<p><strong>2) ERP2 — Standard present, OGF missing</strong></p>
<p>Stock in ERP2, has Standard Selling, missing OGF. VAT items excluded.</p>
<ul>
  <li>Count: {{erp2OgfMissingCount}}</li>
</ul>
{{erp2OgfMissingTableHtml}}

<p style="color:#666;font-size:12px;margin-top:24px;">
  Cosmo OS automated report. VAT = Product Priority "Vat". Locations from OSF stock columns.
</p>`,
    recipients: "asitha@cosmetics.lk",
    ccRecipients:
      "ruvindya.cosmetics@outlook.com, irush.cosmetics@outlook.com, ndilrukshi.cosmetics@outlook.com, harshanad.cosmetics@outlook.com, hpg.inoka@gmail.com",
    placeholders: [
      "companyName",
      "reportDate",
      "generatedAt",
      "itemCount",
      "missingBothCount",
      "erp2OgfMissingCount",
      "itemTableHtml",
      "erp2OgfMissingTableHtml",
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
