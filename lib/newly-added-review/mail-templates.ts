/**
 * Newly Added Priority Review as an Email Template (Settings → Email Templates): key, default
 * Subject / Body and placeholders. Plain strings only — the generated parts come from
 * lib/newly-added-review/mail-html.ts and drop into the {{…Html}} placeholders.
 * To / CC come from the saved template (none by default, so nothing is sent until someone adds them).
 */

export const NEWLY_ADDED_PRIORITY_REVIEW_KEY = "newly_added_priority_review";

export const NEWLY_ADDED_PRIORITY_REVIEW_TEMPLATE = {
  key: NEWLY_ADDED_PRIORITY_REVIEW_KEY,
  name: "Newly Added Priority Review",
  subject: "Newly Added Priority Review - {{reportMonth}}",
  bodyHtml: `{{openingHtml}}
{{decisionTableHtml}}
{{sheetsHtml}}
{{notesHtml}}`,
  placeholders: [
    "companyName",
    "reportMonth",
    "generatedAt",
    "needsCheckCount",
    "allNewlyAddedCount",
    "openingHtml",
    "decisionTableHtml",
    "sheetsHtml",
    "notesHtml",
  ],
};
