const MAILEROO_BASE_URL = "https://smtp.maileroo.com/api/v2";

export async function sendInviteEmail(
  email: string,
  activationUrl: string
): Promise<{ success: boolean; message?: string }> {
  const apiKey = process.env.MAILEROO_API_KEY;
  const fromEmail = process.env.MAILEROO_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    console.error("MAILEROO_API_KEY or MAILEROO_FROM_EMAIL is not configured");
    return { success: false, message: "Email service not configured" };
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #1a1a1a;">You're invited</h1>
  <p>You've been invited to join our platform. Click the button below to activate your account and set up your profile.</p>
  <p style="margin: 32px 0;">
    <a href="${activationUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">Activate account</a>
  </p>
  <p style="color: #666; font-size: 14px;">This link expires in 2 hours. If you didn't request this invite, you can safely ignore this email.</p>
  <p style="color: #666; font-size: 12px; margin-top: 32px;">If the button doesn't work, copy and paste this link into your browser:</p>
  <p style="color: #666; font-size: 12px; word-break: break-all;">${activationUrl}</p>
</body>
</html>
  `.trim();

  const plain = `You've been invited to join our platform. Activate your account by visiting: ${activationUrl}\n\nThis link expires in 2 hours.`;

  try {
    const response = await fetch(`${MAILEROO_BASE_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        from: {
          address: fromEmail,
          display_name: "Cosmo OS",
        },
        to: [{ address: email }],
        subject: "Activate your account",
        html,
        plain,
      }),
    });

    const data = (await response.json()) as {
      success?: boolean;
      message?: string;
    };

    if (!response.ok) {
      console.error("Maileroo error:", data);
      return {
        success: false,
        message: data.message ?? "Failed to send email",
      };
    }

    return { success: data.success ?? true };
  } catch (error) {
    console.error("Failed to send invite email:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to send email",
    };
  }
}

export type ResignationStaffData = {
  staffName: string;
  resignationDate: string;
  reason: string;
  employeeNumber: string;
  department: string;
  designation: string;
  location: string;
};

export type ResignationEmailTemplate = {
  subject: string;
  bodyHtml: string;
};

function replacePlaceholders(
  text: string,
  data: ResignationStaffData
): string {
  return text
    .replace(/\{\{staffName\}\}/g, data.staffName)
    .replace(/\{\{resignationDate\}\}/g, data.resignationDate)
    .replace(/\{\{reason\}\}/g, data.reason)
    .replace(/\{\{employeeNumber\}\}/g, data.employeeNumber)
    .replace(/\{\{department\}\}/g, data.department)
    .replace(/\{\{designation\}\}/g, data.designation)
    .replace(/\{\{location\}\}/g, data.location);
}

export async function sendResignationNotice(
  toEmails: string[],
  template: ResignationEmailTemplate,
  staffData: ResignationStaffData
): Promise<{ success: boolean; message?: string }> {
  const apiKey = process.env.MAILEROO_API_KEY;
  const fromEmail = process.env.MAILEROO_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    console.error("MAILEROO_API_KEY or MAILEROO_FROM_EMAIL is not configured");
    return { success: false, message: "Email service not configured" };
  }

  const validEmails = toEmails
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && e.includes("@"));

  if (validEmails.length === 0) {
    return { success: false, message: "No valid recipient emails" };
  }

  const subject = replacePlaceholders(template.subject, staffData);
  const html = replacePlaceholders(template.bodyHtml, staffData);
  const plain = html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

  try {
    const response = await fetch(`${MAILEROO_BASE_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        from: {
          address: fromEmail,
          display_name: "Cosmo OS",
        },
        to: validEmails.map((address) => ({ address })),
        subject,
        html,
        plain,
      }),
    });

    const data = (await response.json()) as {
      success?: boolean;
      message?: string;
    };

    if (!response.ok) {
      console.error("Maileroo resignation notice error:", data);
      return {
        success: false,
        message: data.message ?? "Failed to send email",
      };
    }

    return { success: data.success ?? true };
  } catch (error) {
    console.error("Failed to send resignation notice:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to send email",
    };
  }
}
