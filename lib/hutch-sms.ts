import { prisma } from "@/lib/prisma";

// Cache auth tokens per company for the duration of the serverless function execution.
// Avoids hammering the Hutch auth endpoint once per SMS during bulk dispatch.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getHutchToken(config: { companyId: string; authUrl: string; username: string; password: string }): Promise<string | null> {
  const cached = tokenCache.get(config.companyId);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const authResponse = await fetch(config.authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "*/*", "X-API-VERSION": "v1" },
    body: JSON.stringify({ username: config.username, password: config.password }),
  });
  const authData = (await authResponse.json()) as { accessToken?: string };
  if (!authData.accessToken) return null;

  // Cache for 4 minutes (tokens typically valid for 5+)
  tokenCache.set(config.companyId, { token: authData.accessToken, expiresAt: Date.now() + 4 * 60 * 1000 });
  return authData.accessToken;
}

function formatPhoneNumber(tpNo: string): string {
  const digits = tpNo.replace(/\D/g, "");

  if (digits.length === 9) {
    return "94" + digits;
  }
  if (digits.length === 10 && digits.startsWith("07")) {
    return "94" + digits.slice(1);
  }
  if (digits.length === 11 && digits.startsWith("94")) {
    return digits;
  }
  if (digits.startsWith("94")) {
    return digits;
  }

  return "94" + digits.replace(/^0+/, "");
}

export type SendSmsResult =
  | { success: true }
  | { success: false; message: string };

export async function sendSms(
  companyId: string,
  phoneNumber: string,
  message: string,
  sentById?: string
): Promise<SendSmsResult> {
  const config = await prisma.smsPortalConfig.findUnique({
    where: { companyId },
  });

  if (!config) {
    return {
      success: false,
      message: "SMS portal not configured for this company",
    };
  }

  const formattedNumber = formatPhoneNumber(phoneNumber);

  try {
    const accessToken = await getHutchToken(config);

    if (!accessToken) {
      console.error("Hutch SMS: No access token in auth response");
      return { success: false, message: "Failed to authenticate with SMS provider" };
    }

    const smsResponse = await fetch(config.smsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "*/*",
        "X-API-VERSION": "v1",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        campaignName: config.campaignName,
        mask: config.smsMask,
        numbers: formattedNumber,
        content: message,
        deliveryReportRequest: false,
      }),
    });

    const smsData = (await smsResponse.json()) as {
      status?: string;
      result?: string;
      success?: boolean;
      error?: string;
      message?: string;
    };

    const statusLower = (smsData.status ?? smsData.result ?? "").toLowerCase();
    const isSuccess =
      statusLower === "success" ||
      statusLower === "sent" ||
      smsData.status === "SUCCESS" ||
      smsData.result === "SUCCESS" ||
      smsData.success === true ||
      (smsResponse.ok && !smsData.error && !smsData.message?.toLowerCase().includes("error"));

    if (isSuccess) {
      await prisma.smsLog.create({
        data: {
          companyId,
          phoneNumber,
          message,
          sentById: sentById ?? null,
          status: "sent",
        },
      });
      return { success: true };
    }

    return {
      success: false,
      message:
        smsData.error ??
        smsData.message ??
        "SMS provider did not accept the message",
    };
  } catch (error) {
    console.error("Hutch SMS send failed:", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to send SMS",
    };
  }
}
