/**
 * "Drafted items that became active again" as a built-in Email Template (Settings → Email
 * Templates): subject / body / placeholders. To / CC come from the saved template (none by default,
 * so nothing is sent until someone adds them). The table fills {{tableHtml}}.
 */
export const ACTIVE_AGAIN_MAIL_TEMPLATE = {
  key: "discontinued_active_again_weekly",
  name: "Drafted items that became active again",
  subject: "Drafted items that became active again ({{itemCount}})",
  bodyHtml: `{{introHtml}}
{{tableHtml}}
{{noteHtml}}`,
  placeholders: ["companyName", "reportDate", "generatedAt", "itemCount", "introHtml", "tableHtml", "noteHtml"],
};
