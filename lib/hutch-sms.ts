import { prisma } from "@/lib/prisma";

// Cache auth tokens per company for the duration of the serverless function execution.
// Avoids hammering the Hutch auth endpoint once per SMS during bulk dispatch.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

const MAX_SEND_ATTEMPTS = 3;

async function getHutchToken(config: {
  companyId: string;
  authUrl: string;
  username: string;
  password: string;
}): Promise<string | null> {
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
  tokenCache.set(config.companyId, {
    token: authData.accessToken,
    expiresAt: Date.now() + 4 * 60 * 1000,
  });
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SendSmsResult =
  | { success: true }
  | { success: false; message: string };

async function sendSmsOnce(
  companyId: string,
  phoneNumber: string,
  message: string,
  sentById?: string,
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
      tokenCache.delete(companyId);
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

    // Auth expired / rejected — clear cache so the next attempt re-auths
    if (smsResponse.status === 401 || smsResponse.status === 403) {
      tokenCache.delete(companyId);
      return { success: false, message: `SMS provider auth rejected (${smsResponse.status})` };
    }

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
    tokenCache.delete(companyId);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to send SMS",
    };
  }
}

export async function sendSms(
  companyId: string,
  phoneNumber: string,
  message: string,
  sentById?: string,
): Promise<SendSmsResult> {
  let lastResult: SendSmsResult = {
    success: false,
    message: "Failed to send SMS",
  };

  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    lastResult = await sendSmsOnce(companyId, phoneNumber, message, sentById);
    if (lastResult.success) return lastResult;

    // Don't retry permanent config errors
    if (lastResult.message.includes("not configured")) {
      break;
    }

    if (attempt < MAX_SEND_ATTEMPTS) {
      console.warn(
        `Hutch SMS attempt ${attempt}/${MAX_SEND_ATTEMPTS} failed for ${phoneNumber}: ${lastResult.message}`,
      );
      await sleep(250 * attempt);
    }
  }

  // Persist failures so missing rider SMS can be audited (previously only successes were logged)
  try {
    await prisma.smsLog.create({
      data: {
        companyId,
        phoneNumber,
        message: `[FAILED] ${lastResult.message} | ${message}`,
        sentById: sentById ?? null,
        status: "failed",
      },
    });
  } catch (logErr) {
    console.error("Hutch SMS: failed to write SmsLog for failed send:", logErr);
  }

  return lastResult;
}
