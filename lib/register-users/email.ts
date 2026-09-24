import { sendOsRegistrationWelcomeEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";
import {
  escapeEmailHtml,
  renderEmailTemplatePlaceholders,
} from "@/lib/email-templates/render";

export async function sendRegisterWelcomeIfConfigured(input: {
  companyId: string;
  name: string;
  email: string | null | undefined;
}): Promise<void> {
  const to = input.email?.trim();
  if (!to) return;

  const settings = await prisma.osRegistrationSettings.findUnique({
    where: { companyId: input.companyId },
    select: {
      emailHeader: true,
      emailBody: true,
      emailPhotoUrl: true,
    },
  });
  if (!settings) return;
  if (
    !settings.emailHeader.trim() &&
    !settings.emailBody.trim() &&
    !settings.emailPhotoUrl
  ) {
    return;
  }

  const vars = { name: input.name.trim() || "there" };
  const header = renderEmailTemplatePlaceholders(settings.emailHeader, vars);
  const body = renderEmailTemplatePlaceholders(settings.emailBody, vars);
  const subject = header.trim() || "Welcome";
  const photo = settings.emailPhotoUrl?.trim();
  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;font-family:Arial,sans-serif;color:#111;">
  ${header.trim() ? `<h1 style="font-size:22px;margin:0 0 16px;">${escapeEmailHtml(header)}</h1>` : ""}
  ${
    photo
      ? `<p style="margin:0 0 16px;"><img src="${escapeEmailHtml(photo)}" alt="" style="max-width:100%;height:auto;border-radius:8px;" /></p>`
      : ""
  }
  ${
    body.trim()
      ? `<div style="font-size:16px;line-height:1.5;white-space:pre-wrap;">${escapeEmailHtml(body)}</div>`
      : ""
  }
</body>
</html>`;

  const result = await sendOsRegistrationWelcomeEmail({
    toEmail: to,
    subject,
    html,
  });
  if (!result.success) {
    console.error("[register-users] welcome email failed:", result.message);
  }
}
