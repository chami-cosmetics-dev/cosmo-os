import { sendOsRegistrationWelcomeEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";
import {
  applyRegisterEmailName,
  escapeEmailHtml,
} from "@/lib/email-templates/render";
import { resolveWelcomePhotoForMail } from "@/lib/register-users/email-photo-cloudinary";
import { upsertRegisterEmailTemplate } from "@/lib/register-users/settings";

export type RegisterWelcomeEmailResult =
  | { status: "sent" }
  | { status: "skipped"; reason: "no_email" | "no_template" }
  | { status: "failed"; error: string };

export async function stampCaptureEmail(
  captureId: string,
  result: RegisterWelcomeEmailResult,
): Promise<void> {
  try {
    await prisma.osRegistrationCapture.update({
      where: { id: captureId },
      data: {
        emailStatus: result.status,
        emailError:
          result.status === "failed"
            ? result.error
            : result.status === "skipped"
              ? result.reason
              : null,
        emailSentAt: result.status === "sent" ? new Date() : null,
      },
    });
  } catch (err) {
    console.error("[register-users] stamp capture email failed:", err);
  }
}

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
    const photoSrc = photo?.remoteUrl ?? photo?.photoSrc ?? null;
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
}) {
  const first = await sendOsRegistrationWelcomeEmail(input);
  if (first.success || !isTransientMailError(first.message)) return first;
  await new Promise((resolve) => setTimeout(resolve, 400));
  return sendOsRegistrationWelcomeEmail(input);
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
