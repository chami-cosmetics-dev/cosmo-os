import { sendOsRegistrationWelcomeEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";
import {
  applyRegisterEmailName,
  escapeEmailHtml,
} from "@/lib/email-templates/render";
import {
  REGISTER_EMAIL_PHOTO_CID,
  resolveWelcomePhotoForMail,
} from "@/lib/register-users/email-photo-cloudinary";
import { upsertRegisterEmailTemplate } from "@/lib/register-users/settings";

export type RegisterWelcomeEmailResult =
  | { status: "sent" }
  | { status: "skipped"; reason: "no_email" | "no_template" }
  | { status: "failed"; error: string };

export async function sendRegisterWelcomeIfConfigured(input: {
  companyId: string;
  name: string;
  email: string | null | undefined;
}): Promise<RegisterWelcomeEmailResult> {
  const to = input.email?.trim();
  if (!to) return { status: "skipped", reason: "no_email" };

  try {
    const settings = await prisma.osRegistrationSettings.findUnique({
      where: { companyId: input.companyId },
      select: {
        emailHeader: true,
        emailBody: true,
        emailPhotoUrl: true,
      },
    });
    if (!settings) return { status: "skipped", reason: "no_template" };
    if (
      !settings.emailHeader.trim() &&
      !settings.emailBody.trim() &&
      !settings.emailPhotoUrl
    ) {
      return { status: "skipped", reason: "no_template" };
    }

    const personName = input.name.trim() || "there";
    const header = applyRegisterEmailName(settings.emailHeader, personName);
    const body = applyRegisterEmailName(settings.emailBody, personName);
    const subject = header.trim() || "Welcome";
    const photo = await resolveWelcomePhotoForMail({
      companyId: input.companyId,
      stored: settings.emailPhotoUrl,
    });
    if (
      photo?.remoteUrl &&
      photo.remoteUrl !== settings.emailPhotoUrl?.trim()
    ) {
      await upsertRegisterEmailTemplate(input.companyId, {
        header: settings.emailHeader,
        body: settings.emailBody,
        photoUrl: photo.remoteUrl,
      });
    }
    const photoSrc = photo?.photoSrc ?? null;
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

    const result = await sendWelcomeEmailWithRetry({
      toEmail: to,
      subject: subject.slice(0, 180),
      html,
      attachments: photo?.attachment ? [photo.attachment] : undefined,
      fallbackHtml:
        photo?.attachment && photo.remoteUrl
          ? html.replace(
              `cid:${REGISTER_EMAIL_PHOTO_CID}`,
              escapeEmailHtml(photo.remoteUrl),
            )
          : undefined,
    });
    if (!result.success) {
      console.error("[register-users] welcome email failed:", result.message);
      return {
        status: "failed",
        error: mailErrorMessage(result.message ?? "Welcome email failed"),
      };
    }
    return { status: "sent" };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Welcome email failed";
    console.error("[register-users] welcome email failed:", error);
    return { status: "failed", error: mailErrorMessage(error) };
  }
}

async function sendWelcomeEmailWithRetry(input: {
  toEmail: string;
  subject: string;
  html: string;
  attachments?: Parameters<
    typeof sendOsRegistrationWelcomeEmail
  >[0]["attachments"];
  fallbackHtml?: string;
}) {
  const first = await sendOsRegistrationWelcomeEmail(input);
  if (first.success) return first;
  if (input.attachments?.length && input.fallbackHtml) {
    const linked = await sendOsRegistrationWelcomeEmail({
      toEmail: input.toEmail,
      subject: input.subject,
      html: input.fallbackHtml,
    });
    if (linked.success) return linked;
  }
  if (!isTransientMailError(first.message)) return first;
  return sendOsRegistrationWelcomeEmail({
    toEmail: input.toEmail,
    subject: input.subject,
    html: input.fallbackHtml ?? input.html,
  });
}

function isTransientMailError(message: string | undefined) {
  return /fetch failed|network|econnreset|etimedout|socket/i.test(
    message ?? "",
  );
}

function mailErrorMessage(error: string) {
  if (isTransientMailError(error)) {
    return "Mail service unreachable. Try save again.";
  }
  return error;
}
