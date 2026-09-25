import { sendOsRegistrationWelcomeEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";
import {
  applyRegisterEmailName,
  escapeEmailHtml,
} from "@/lib/email-templates/render";
import {
  isRemoteEmailPhotoUrl,
  parseStoredEmailPhoto,
} from "@/lib/register-users/email-photo";

const PHOTO_CID = "register-photo";

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

  const personName = input.name.trim() || "there";
  const header = applyRegisterEmailName(settings.emailHeader, personName);
  const body = applyRegisterEmailName(settings.emailBody, personName);
  const subject = header.trim() || "Welcome";
  const stored = settings.emailPhotoUrl?.trim();
  const embedded = parseStoredEmailPhoto(stored);
  const remote = !embedded && isRemoteEmailPhotoUrl(stored) ? stored.trim() : null;
  const photoSrc = embedded
    ? `cid:${PHOTO_CID}`
    : remote
      ? remote
      : null;
  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;font-family:Arial,sans-serif;color:#111;">
  ${header.trim() ? `<h1 style="font-size:22px;margin:0 0 16px;">${escapeEmailHtml(header)}</h1>` : ""}
  ${
    photoSrc
      ? `<p style="margin:0 0 16px;"><img src="${escapeEmailHtml(photoSrc)}" alt="" style="max-width:100%;height:auto;border-radius:8px;" /></p>`
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
    attachments: embedded
      ? [
          {
            filename: `register-photo.${embedded.mime.split("/")[1] ?? "jpg"}`,
            contentType: embedded.mime,
            buffer: embedded.buffer,
            inline: true,
            contentId: PHOTO_CID,
          },
        ]
      : undefined,
  });
  if (!result.success) {
    console.error("[register-users] welcome email failed:", result.message);
  }
}
